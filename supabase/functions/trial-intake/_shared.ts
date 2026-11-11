import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export const TEAM = ["mitchell@socialupgrades.com", "marko@socialupgrades.com"];
export const FROM = "Social Upgrades <hello@dashboard.socialupgrades.com>";
export const REPLY_TO = "mitchell@socialupgrades.com";
export const TZ = "America/Los_Angeles";
export const DASH = "https://dashboard.socialupgrades.com";

// Trial checkouts are found by the payment link's metadata (offer=free-trial-7d),
// which Stripe copies onto every Checkout Session. This list is only a fallback
// for sessions that somehow arrive without it.
export const TRIAL_LINKS: Record<string, { source: string; plan: string }> = {
  plink_1UZeKrIvOiJFTZ6cZf1yu8BU: { source: "site", plan: "websites-starter" },
  plink_1UZemmIvOiJFTZ6cODGH09Hl: { source: "trade-companies", plan: "websites-starter" },
  plink_1UZeKsIvOiJFTZ6cIpOInfbd: { source: "restaurants", plan: "websites-starter" },
  plink_1UZec6IvOiJFTZ6cXDOYvr1N: { source: "restaurants", plan: "chat-starter" },
  plink_1UZfIjIvOiJFTZ6cnAz4NOBo: { source: "gyms", plan: "websites-starter" },
  plink_1UZfIkIvOiJFTZ6cgdghcqE4: { source: "gyms", plan: "chat-starter" },
  plink_1Ua86QIvOiJFTZ6cFEVBsM18: { source: "site", plan: "chat-starter" },
  plink_1Ua2D1IvOiJFTZ6c8R1bdZ7k: { source: "musicians", plan: "artist-solo" },
  plink_1Ua2D2IvOiJFTZ6c9Bm65EwT: { source: "musicians", plan: "artist-pro" },
  plink_1Ua2D2IvOiJFTZ6ctuiDcmyA: { source: "musicians", plan: "artist-team" },
  plink_1Ua2D3IvOiJFTZ6cyAjXsCa2: { source: "creators", plan: "artist-solo" },
  plink_1Ua2D4IvOiJFTZ6c9RjDkplM: { source: "creators", plan: "artist-pro" },
  plink_1Ua2D5IvOiJFTZ6cYsSlw0Wy: { source: "creators", plan: "artist-team" },
};

export const PLAN_LABEL: Record<string, string> = {
  "websites-starter": "Website Starter ($299/mo)",
  "chat-starter": "AI Chat Starter ($99/mo)",
  "artist-solo": "Solo ($99/mo)",
  "artist-pro": "Pro ($299/mo)",
  "artist-team": "Team ($499/mo)",
};
export const PLAN_VALUE: Record<string, number> = {
  "websites-starter": 299, "chat-starter": 99, "artist-solo": 99, "artist-pro": 299, "artist-team": 499,
};

export const NICHES: Record<string, string> = {
  "trade-companies": "Trades / home services",
  trades: "Trades / home services",
  gyms: "Gym / fitness studio",
  restaurants: "Restaurant",
  musicians: "Musician / band",
  creators: "Creator / influencer",
  site: "General (website pages)",
  general: "Small business",
};

export type Variant = "business" | "chat" | "musician" | "creator";
export function variantOf(plan: string, source: string): Variant {
  if (source === "musicians") return "musician";
  if (source === "creators") return "creator";
  if (String(plan).startsWith("chat")) return "chat";
  return "business";
}
// Musician and creator pages promise 1 business day (weekends off the grid);
// every other trial promises 24 hours.
export function promiseOf(v: Variant): "24h" | "1bd" {
  return v === "musician" || v === "creator" ? "1bd" : "24h";
}
export function promiseText(v: Variant) {
  return promiseOf(v) === "1bd" ? "1 business day" : "24 hours";
}
export function deliverableOf(v: Variant) {
  return v === "chat" ? "AI chat preview" : v === "business" ? "homepage draft" : "site draft";
}

// The clock starts when the form is sent, never at checkout.
export function dueFrom(sentAt: Date, v: Variant): Date {
  const h = 3600 * 1000;
  if (promiseOf(v) === "24h") return new Date(sentAt.getTime() + 24 * h);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(sentAt);
  const add = wd === "Fri" ? 72 : wd === "Sat" ? 48 : 24; // Sun and Mon-Thu: next day
  return new Date(sentAt.getTime() + add * h);
}
export function fmtPT(iso: string | Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso)) + " PT";
}

export function formUrl(sid: string, plan: string, source: string) {
  const q = new URLSearchParams({ plan, source, session_id: sid });
  return `${DASH}/start/?${q.toString()}`;
}

// Every field any variant of the form can send, with the label the team sees.
export const FIELD_LABELS: Record<string, string> = {
  business: "Name",
  contactName: "Contact name",
  role: "Role",
  phone: "Best phone",
  currentSite: "Current website",
  industry: "What the business does",
  services: "Main services / offerings",
  area: "Service area / location",
  hours: "Hours",
  goal: "Main goal",
  faqs: "Top customer questions",
  bookingLink: "Booking link",
  leadsTo: "Where chat leads go",
  genre: "Genre / sound",
  niche: "Content niche",
  city: "Home city",
  bio: "Short bio",
  musicLinks: "Music links",
  platforms: "Main channels",
  stats: "Audience size",
  bestContent: "Content to feature",
  socials: "Socials",
  shows: "Upcoming shows",
  merch: "Merch store",
  fanClub: "Email list tool",
  partners: "Brand partners",
  booking: "Booking / inquiry email",
  mediaKit: "Media kit / rates",
  roster: "Other artists on the roster",
  style: "Style",
  examples: "Sites they like",
  assets: "Logo / photos link",
  notes: "Anything else",
};

const cache: Record<string, string> = {};
export async function secret(name: string): Promise<string> {
  if (cache[name]) return cache[name];
  const { data, error } = await sb.rpc("trial_secret", { p_name: name });
  if (error || !data) throw new Error("secret missing: " + name);
  cache[name] = data as string;
  return cache[name];
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

export async function sendEmail(msg: { to: string | string[]; subject: string; html: string; reply_to?: string }) {
  const key = await secret("trial_resend_key");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, reply_to: msg.reply_to ?? REPLY_TO, ...msg }),
  });
  if (!r.ok) console.error("resend error", r.status, await r.text());
  return r.ok;
}

export function leadId(sessionId: string) {
  return "trial-" + sessionId.slice(-16);
}

export async function getLead(id: string) {
  const { data } = await sb.from("leads").select("id,data").eq("id", id).maybeSingle();
  return data as { id: string; data: Record<string, unknown> } | null;
}

export async function upsertLead(id: string, patch: Record<string, unknown>) {
  const existing = await getLead(id);
  const data = { ...(existing?.data ?? {}), ...patch };
  if (existing) await sb.from("leads").update({ data }).eq("id", id);
  else await sb.from("leads").insert({ id, client_id: null, ts: Date.now(), data });
  return data;
}

export async function logRow(text: string, extra: Record<string, unknown> = {}) {
  await sb.from("log").insert({
    id: crypto.randomUUID(),
    client_id: null,
    ts: Date.now(),
    data: { text, side: "team", quiet: false, ...extra },
  });
}

export function table(rows: [string, unknown][]) {
  return `<table cellpadding="6" style="border-collapse:collapse;font:14px/1.4 Arial,sans-serif">${
    rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k, v]) =>
        `<tr><td style="color:#5f6675;vertical-align:top;white-space:nowrap"><b>${esc(k)}</b></td><td>${
          esc(v).replace(/\n/g, "<br>")
        }</td></tr>`
      ).join("")
  }</table>`;
}

export function button(href: string, label: string) {
  return `<a href="${esc(href)}" style="display:inline-block;background:#1FB264;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:bold;font-size:16px">${esc(label)}</a>`;
}
export function shell(inner: string) {
  return `<div style="font:15px/1.6 Arial,sans-serif;color:#0F1633;max-width:540px">${inner}<p style="color:#5f6675;font-size:13px;margin-top:26px">Social Upgrades · Costa Mesa, CA · Month to month, pause or cancel anytime.</p></div>`;
}
export function clockBox(v: Variant) {
  return `<div style="background:#FFF7E6;border:1px solid #F2D49B;border-radius:10px;padding:12px 14px;margin:16px 0;font-size:14px"><b>Heads up:</b> the ${promiseOf(v) === "1bd" ? "1 business day" : "24-hour"} clock for your ${deliverableOf(v)} starts when you send the form, not when you signed up. Send it now and we start now.</div>`;
}
