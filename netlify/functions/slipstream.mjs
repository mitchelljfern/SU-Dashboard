// Slipstream admin for the Client Hub's Shows tab.
//
// The browser never sees Slipstream's secret key. It calls this function with
// the person's own Client Hub session, and this function:
//   1. checks that session with the Hub's Supabase (team member, or a login on
//      Slipstream's portal, client id 'vs'), then
//   2. reads or writes Slipstream's own Supabase with the secret key.
//
// Netlify environment variables (dashboard project):
//   SLIPSTREAM_SUPABASE_URL   https://sfcifdwmkfekakjjpter.supabase.co
//   SLIPSTREAM_SERVICE_KEY    Slipstream's secret (service) key. Never in the browser.
//
// POST /.netlify/functions/slipstream  { action, ... }  with  Authorization: Bearer <Hub access token>

const HUB_URL = 'https://tiefkbutqnrttpdcsmiy.supabase.co';
const HUB_KEY = 'sb_publishable_xwAeqhN3tDkUe3CANbH38Q_-9EKwhdF'; // public by design, same as su-config.js
const SL_URL = (process.env.SLIPSTREAM_SUPABASE_URL || '').replace(/\/$/, '');
const SL_KEY = process.env.SLIPSTREAM_SERVICE_KEY || '';
const SLIPSTREAM_CLIENT = 'vs';
const BUCKET = 'show-images';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
class Bad extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

// ---------- who is asking ----------
async function caller(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Bad('Sign in to the Client Hub first.', 401);
  const h = { apikey: HUB_KEY, Authorization: 'Bearer ' + token };
  const u = await fetch(HUB_URL + '/auth/v1/user', { headers: h });
  if (!u.ok) throw new Bad('Your Client Hub session has expired. Sign in again.', 401);
  const user = await u.json();
  const p = await fetch(HUB_URL + '/rest/v1/profiles?select=role,client_id,name&id=eq.' + encodeURIComponent(user.id), { headers: h });
  const [profile] = p.ok ? await p.json() : [];
  const ok = profile && (profile.role === 'team' || profile.client_id === SLIPSTREAM_CLIENT);
  if (!ok) throw new Bad('Only the Social Upgrades team and Slipstream can manage shows.', 403);
  return { id: user.id, email: user.email, name: profile.name || user.email, team: profile.role === 'team' };
}

// ---------- Slipstream's database ----------
const slHeaders = extra => Object.assign({ apikey: SL_KEY, Authorization: 'Bearer ' + SL_KEY, 'Content-Type': 'application/json' }, extra || {});
async function sl(path, opts = {}) {
  const res = await fetch(SL_URL + '/rest/v1/' + path, { ...opts, headers: slHeaders(opts.headers) });
  const text = await res.text();
  if (!res.ok) {
    let msg = text; try { msg = JSON.parse(text).message || text; } catch (e) {}
    throw new Bad('Slipstream database: ' + msg, 502);
  }
  return text ? JSON.parse(text) : null;
}
const inList = arr => '(' + arr.map(s => '"' + String(s).replace(/"/g, '') + '"').join(',') + ')';

// Columns the Hub may write. Anything else in the request is ignored.
const SHOW_COLS = ['title', 'kind', 'status', 'starts_at', 'ends_at', 'venue_name', 'venue_address', 'about', 'conversation_line',
  'trailer_youtube_id', 'hero_image', 'poster', 'poster_ratio', 'partner_name', 'capacity', 'max_seats', 'waitlist_enabled',
  'marked_full', 'giveaway', 'price', 'youtube_live_id'];
const KINDS = ['streaming', 'in-person', 'giveaway', 'live', 'paid'];
const STATUSES = ['draft', 'published', 'archived'];
const slugify = t => String(t || '').toLowerCase().replace(/&/g, 'and').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k] === '' ? null : o[k]]));

// ---------- actions ----------
async function load() {
  const since = new Date(Date.now() - 120 * 864e5).toISOString();
  const [shows, series, links, settings, accounts] = await Promise.all([
    sl('shows?select=*&or=(status.in.(draft,published),starts_at.gte."' + since + '")&order=starts_at.desc.nullsfirst'),
    sl('series?select=id,title,kind,home_position&order=home_position.asc.nullslast,title.asc'),
    sl('show_series?select=show_slug,series_id,position'),
    sl('settings?select=key,value'),
    fetch(SL_URL + '/rest/v1/profiles?select=id&limit=1', { headers: slHeaders({ Prefer: 'count=exact' }) })
  ]);
  const slugs = shows.map(s => s.slug);
  const [access, rsvps, emails] = slugs.length ? await Promise.all([
    sl('show_access?select=show_slug,film_embed,conversation_embed,access_code&show_slug=in.' + inList(slugs)),
    sl('rsvps?select=id,show_slug,email,first_name,last_name,user_id,seats,status,created_at&show_slug=in.' + inList(slugs) + '&order=created_at.desc'),
    sl('email_log?select=rsvp_id,show_slug,email,type,status,opened_at,clicked_at,created_at&show_slug=in.' + inList(slugs) + '&order=created_at.desc')
  ]) : [[], [], []];
  const userIds = [...new Set(rsvps.map(r => r.user_id).filter(Boolean))];
  const profiles = userIds.length ? await sl('profiles?select=id,newsletter,created_at&id=in.' + inList(userIds)) : [];
  const range = accounts.headers.get('content-range') || '';
  const accountCount = Number(range.split('/')[1]) || 0;
  const setting = k => (settings.find(s => s.key === k) || {}).value;
  return {
    shows, series, links, access, rsvps, emails, profiles, accountCount,
    emailMode: setting('email_recipients') === 'everyone' ? 'everyone' : 'test',
    accessMode: setting('access_mode') || 'email',
    imageBase: SL_URL + '/storage/v1/object/public/' + BUCKET + '/'
  };
}

async function saveShow(body) {
  const input = body.show || {};
  const editing = body.slug ? String(body.slug) : null;
  if (!String(input.title || '').trim()) throw new Bad('Give the show a title.');
  if (input.kind && !KINDS.includes(input.kind)) throw new Bad('Unknown show type.');
  if (input.status && !STATUSES.includes(input.status)) throw new Bad('Unknown status.');
  const row = pick(input, SHOW_COLS);
  if (Array.isArray(row.about)) row.about = row.about.map(String).filter(Boolean);
  ['capacity', 'max_seats'].forEach(k => { if (row[k] != null) row[k] = Math.max(0, parseInt(row[k], 10) || 0) || null; });
  if (row.price != null) row.price = Number(row.price) || null;

  let slug = editing;
  if (!slug) {
    slug = slugify(input.slug || input.title);
    if (!slug) throw new Bad('That title doesn’t make a page address. Add some letters.');
    const taken = await sl('shows?select=slug&slug=eq.' + encodeURIComponent(slug));
    if (taken.length) throw new Bad('viewslipstream.com/' + slug + '/ is already used by another show. Change the title a little.');
    row.status = row.status || 'draft';
    row.max_seats = row.max_seats || 1;
    await sl('shows', { method: 'POST', body: JSON.stringify({ slug, ...row }), headers: { Prefer: 'return=minimal' } });
  } else {
    row.updated_at = new Date().toISOString();
    const out = await sl('shows?slug=eq.' + encodeURIComponent(slug), { method: 'PATCH', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } });
    if (!out.length) throw new Bad('That show no longer exists.', 404);
  }

  if (body.access && typeof body.access === 'object') {
    const a = pick(body.access, ['film_embed', 'conversation_embed', 'access_code']);
    if (Object.keys(a).length) {
      await sl('show_access?on_conflict=show_slug', { method: 'POST', body: JSON.stringify({ show_slug: slug, ...a, updated_at: new Date().toISOString() }),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    }
  }
  if (body.seriesId) await setSeries(slug, String(body.seriesId));
  return { slug };
}

// One home row per show: move it out of any other row and into this one.
// Series rows put the newest show first; month tabs run in date order.
async function setSeries(slug, seriesId) {
  const [series] = await sl('series?select=id,kind&id=eq.' + encodeURIComponent(seriesId));
  if (!series) throw new Bad('That series no longer exists.');
  const current = await sl('show_series?select=series_id,position&show_slug=eq.' + encodeURIComponent(slug) + '&position=lt.1000');
  if (current.some(l => l.series_id === seriesId)) return;
  if (current.length) await sl('show_series?show_slug=eq.' + encodeURIComponent(slug) + '&position=lt.1000', { method: 'DELETE' });
  const peers = await sl('show_series?select=position&series_id=eq.' + encodeURIComponent(seriesId) + '&position=lt.1000');
  const ps = peers.map(p => p.position);
  const position = !ps.length ? 0 : series.kind === 'month' ? Math.max(...ps) + 1 : Math.min(...ps) - 1;
  await sl('show_series', { method: 'POST', body: JSON.stringify({ show_slug: slug, series_id: seriesId, position }), headers: { Prefer: 'return=minimal' } });
}

async function createSeries(body) {
  const title = String(body.title || '').trim().replace(/\s+/g, ' ');
  const kind = body.kind === 'month' ? 'month' : 'series';
  if (!title) throw new Bad('Give the series a name.');
  const dupe = await sl('series?select=id,title&title=ilike.' + encodeURIComponent(title));
  if (dupe.length) return { id: dupe[0].id, title: dupe[0].title, existed: true };
  const top = await sl('series?select=home_position&home_position=not.is.null&order=home_position.asc&limit=1');
  const home_position = top.length ? top[0].home_position - 1 : 0;
  const [row] = await sl('series', { method: 'POST', body: JSON.stringify({ title, kind, home_position }), headers: { Prefer: 'return=representation' } });
  return { id: row.id, title: row.title };
}

async function setWindow(body) {
  const slug = String(body.slug || '');
  const [show] = await sl('shows?select=slug,starts_at,ends_at&slug=eq.' + encodeURIComponent(slug));
  if (!show) throw new Bad('That show no longer exists.', 404);
  let ends;
  if (body.op === 'extend') {
    const base = show.ends_at ? new Date(show.ends_at) : new Date(new Date(show.starts_at).getTime() + 3 * 36e5);
    ends = new Date(Math.max(base.getTime(), Date.now()) + 24 * 36e5);
  } else if (body.op === 'close') {
    ends = new Date();
  } else throw new Bad('Unknown window change.');
  await sl('shows?slug=eq.' + encodeURIComponent(slug), { method: 'PATCH', body: JSON.stringify({ ends_at: ends.toISOString(), updated_at: new Date().toISOString() }) });
  return { ends_at: ends.toISOString() };
}

async function setStatus(body) {
  const slug = String(body.slug || '');
  if (!STATUSES.includes(body.status)) throw new Bad('Unknown status.');
  await sl('shows?slug=eq.' + encodeURIComponent(slug), { method: 'PATCH', body: JSON.stringify({ status: body.status, updated_at: new Date().toISOString() }) });
  return { status: body.status };
}

async function upload(body) {
  const type = String(body.contentType || '');
  if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Bad('Upload a JPG, PNG or WebP image.');
  const bytes = Buffer.from(String(body.data || ''), 'base64');
  if (!bytes.length) throw new Bad('That image was empty.');
  if (bytes.length > 4.5 * 1024 * 1024) throw new Bad('That image is too large. Keep it under 4 MB.');
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const base = slugify(body.slug || body.name || 'image') || 'image';
  const path = base + '/' + (body.role === 'poster' ? 'poster' : 'hero') + '-' + Date.now().toString(36) + '.' + ext;
  const res = await fetch(SL_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method: 'POST', body: bytes,
    headers: { apikey: SL_KEY, Authorization: 'Bearer ' + SL_KEY, 'Content-Type': type, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'true' }
  });
  if (!res.ok) throw new Bad('Image upload failed: ' + (await res.text()).slice(0, 200), 502);
  return { url: SL_URL + '/storage/v1/object/public/' + BUCKET + '/' + path };
}

const ACTIONS = { load, saveShow, createSeries, setWindow, setStatus, upload };

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    if (!SL_URL || !SL_KEY) throw new Bad('The dashboard is missing SLIPSTREAM_SUPABASE_URL or SLIPSTREAM_SERVICE_KEY in Netlify.', 500);
    const who = await caller(req);
    const body = await req.json().catch(() => ({}));
    const fn = ACTIONS[body.action];
    if (!fn) throw new Bad('Unknown action.');
    const result = await fn(body, who);
    return json({ ok: true, ...result });
  } catch (e) {
    if (!(e instanceof Bad)) console.error('[slipstream]', e);
    return json({ ok: false, error: e instanceof Bad ? e.message : 'Something went wrong. Try again in a moment.' }, e.status || 500);
  }
};
