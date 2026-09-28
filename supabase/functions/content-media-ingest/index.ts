// content-media-ingest
//
// Turns a URL into a stored preview. A row in public.content_media_jobs names
// a Content Map card and a URL; the database trigger POSTs {jobId} here, this
// function fetches the bytes, puts them in the public `content-media` bucket
// and appends the stored URL to the card's media[]. Agents that only have SQL
// get persistent previews this way, and a Canva or Metricool link that would
// have expired tomorrow becomes a file the dashboard owns.
//
// No JWT: the caller is Postgres. Authorization is the job row itself, which
// only the team (or the service connection) can create, and this function
// refuses anything that is not a pending job. Deployed with verify_jwt=false.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "content-media";
const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 25_000;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
  "image/avif": "avif", "image/svg+xml": "svg",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// A content-type header is often missing or wrong (Drive says octet-stream,
// some CDNs say text/plain), so the bytes get the final say.
function sniff(buf: Uint8Array, declared: string): string {
  const b = buf;
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  const head = new TextDecoder().decode(b.slice(0, 512)).trim().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return declared;
}

function checkUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("That is not a valid URL."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Only http(s) links can be fetched.");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")
      || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
      || h === "[::1]" || h.startsWith("[fc") || h.startsWith("[fd") || h.startsWith("[fe80")) {
    throw new Error("That address is not reachable from here.");
  }
  return u;
}

// Google Drive share links do not serve the file; the uc endpoint does.
function normalise(u: URL): string {
  if (u.hostname === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    const id = m ? m[1] : u.searchParams.get("id");
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  if (u.hostname === "www.dropbox.com" || u.hostname === "dropbox.com") {
    u.searchParams.set("dl", "1");
    return u.toString();
  }
  return u.toString();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Body must be JSON" }, 400); }
  const jobId: string = body?.jobId || body?.record?.id || "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: "jobId missing" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Claim the job. The update is conditional on `pending`, so two deliveries
  // of the same webhook cannot both process it.
  const { data: job, error: claimErr } = await sb.from("content_media_jobs")
    .update({ status: "working" })
    .eq("id", jobId).eq("status", "pending")
    .select("*").maybeSingle();
  if (claimErr) return json({ error: claimErr.message }, 500);
  if (!job) return json({ ok: true, skipped: "not a pending job" });

  const fail = async (msg: string) => {
    await sb.from("content_media_jobs")
      .update({ status: "failed", error: msg.slice(0, 500), done_at: new Date().toISOString() })
      .eq("id", jobId);
    return json({ ok: false, error: msg }, 200);
  };

  try {
    const { data: item, error: itemErr } = await sb.from("strategy")
      .select("id, client_id, data").eq("id", job.item_id).maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) throw new Error("That content card no longer exists.");

    const src = normalise(checkUrl(job.source_url));
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(src, {
        redirect: "follow", signal: ctl.signal,
        headers: { "User-Agent": "SU-Dashboard content ingest (+https://dashboard.socialupgrades.com)",
                   "Accept": "image/*,video/*;q=0.9,*/*;q=0.5" },
      });
    } finally { clearTimeout(timer); }
    if (!res.ok) throw new Error(`The link answered ${res.status}.`);
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) throw new Error("The file is over the 25 MB limit.");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error("The file is over the 25 MB limit.");
    if (buf.length < 64) throw new Error("The link did not return a file.");

    const declared = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const mime = sniff(buf, declared);
    const ext = EXT[mime];
    if (!ext) throw new Error(`Not an image or video we can store (${mime || "unknown type"}). Use a direct link to a JPG, PNG, GIF, WEBP, MP4 or MOV.`);
    const type = mime.startsWith("video/") ? "video" : "image";

    const path = `${item.client_id || "_internal"}/${item.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await sb.storage.from(BUCKET)
      .upload(path, buf, { contentType: mime, upsert: false, cacheControl: "31536000" });
    if (upErr) throw upErr;
    const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

    // Append to the card. Re-read right before writing so a comment added in
    // the meantime is not overwritten with the copy fetched a moment ago.
    const { data: fresh } = await sb.from("strategy").select("data").eq("id", item.id).single();
    const data = (fresh?.data && typeof fresh.data === "object") ? fresh.data : {};
    const media = Array.isArray(data.media) ? data.media : [];
    media.push({
      id: crypto.randomUUID(), url, path, type, mime, size: buf.length,
      alt: job.alt || "", source: job.source_url, ts: Date.now(), jobId,
    });
    const { error: wErr } = await sb.from("strategy").update({ data: { ...data, media } }).eq("id", item.id);
    if (wErr) throw wErr;

    // A quiet log row: the dashboard polls `log` for changes, so this is what
    // makes an open board pick the new preview up without a reload. Quiet so
    // it fills the card's history without ringing the bell.
    await sb.from("log").insert({
      id: crypto.randomUUID(), client_id: item.client_id, ts: Date.now(),
      data: {
        text: `Preview added to "${data.title || "a content card"}"`,
        by: job.requested_by || "", side: "team", quiet: true, contentId: item.id,
      },
    });

    await sb.from("content_media_jobs")
      .update({ status: "done", stored_url: url, done_at: new Date().toISOString() })
      .eq("id", jobId);
    return json({ ok: true, url, type, bytes: buf.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[content-media-ingest]", jobId, msg);
    return await fail(msg);
  }
});
