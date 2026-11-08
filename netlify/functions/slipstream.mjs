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
  // Every show (the past list keeps the full history); RSVPs and emails only exist for shows run on the new site.
  const since = new Date(Date.now() - 365 * 864e5).toISOString();
  const [shows, series, links, settings, accounts] = await Promise.all([
    sl('shows?select=*&order=starts_at.desc.nullsfirst'),
    sl('series?select=id,title,kind,home_position&order=home_position.asc.nullslast,title.asc'),
    sl('show_series?select=show_slug,series_id,position'),
    sl('settings?select=key,value'),
    fetch(SL_URL + '/rest/v1/profiles?select=id&limit=1', { headers: slHeaders({ Prefer: 'count=exact' }) })
  ]);
  const current = shows.filter(s => s.status !== 'archived').map(s => s.slug);
  const [access, rsvps, emails, templates, overrides] = await Promise.all([
    current.length ? sl('show_access?select=show_slug,film_embed,conversation_embed,access_code&show_slug=in.' + inList(current)) : [],
    sl('rsvps?select=id,show_slug,email,first_name,last_name,user_id,seats,status,created_at&order=created_at.desc&limit=20000'),
    sl('email_log?select=rsvp_id,show_slug,email,type,status,subject,opened_at,clicked_at,delivered_at,bounced_at,complained_at,last_event,created_at&created_at=gte.' + since + '&order=created_at.desc&limit=20000'),
    sl('email_templates?select=type,subject,heading,message,button,updated_at,updated_by'),
    sl('email_overrides?select=*')
  ]);
  const userIds = [...new Set(rsvps.map(r => r.user_id).filter(Boolean))];
  const profiles = userIds.length ? await sl('profiles?select=id,newsletter,created_at&id=in.' + inList(userIds)) : [];
  const range = accounts.headers.get('content-range') || '';
  const accountCount = Number(range.split('/')[1]) || 0;
  const setting = k => (settings.find(s => s.key === k) || {}).value;
  return {
    shows, series, links, access, rsvps, emails, profiles, accountCount, templates, overrides, emailDefaults: EMAIL_DEFAULTS,
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

// Delete a show for good: only when nobody has RSVP'd (otherwise unpublish it).
// Its series link and access code go with it (cascade), and so do its uploaded images.
async function deleteShow(body) {
  const slug = String(body.slug || '');
  const [show] = await sl('shows?select=slug&slug=eq.' + encodeURIComponent(slug));
  if (!show) throw new Bad('That show no longer exists.', 404);
  const rs = await sl('rsvps?select=id&limit=1&show_slug=eq.' + encodeURIComponent(slug));
  if (rs.length) throw new Bad('People have RSVP’d to this show, so it can’t be deleted. Unpublish it instead.');
  await sl('shows?slug=eq.' + encodeURIComponent(slug), { method: 'DELETE' });
  const st = { apikey: SL_KEY, Authorization: 'Bearer ' + SL_KEY, 'Content-Type': 'application/json' };
  const list = await fetch(SL_URL + '/storage/v1/object/list/' + BUCKET, { method: 'POST', headers: st, body: JSON.stringify({ prefix: slug + '/', limit: 100 }) });
  const files = list.ok ? (await list.json()).map(f => slug + '/' + f.name) : [];
  if (files.length) await fetch(SL_URL + '/storage/v1/object/' + BUCKET, { method: 'DELETE', headers: st, body: JSON.stringify({ prefixes: files }) });
  return { deleted: slug };
}

// ---------- Emails: templates, per-show changes, preview and test ----------
const EMAIL_TYPES = ['rsvp', 'waitlist', 'promoted', 'live', 'reminder', 'thanks'];
const EMAIL_DEFAULTS = {
  rsvp: { subject: "You're in: {title} on Slipstream", heading: "You're in, {first_name}.", message: 'Your {seats} for {title} is saved. {schedule}', button: 'Add to calendar' },
  promoted: { subject: "A seat opened up: you're in for {title}", heading: "Good news, {first_name}. You're in.", message: 'A seat opened up for {title}. {schedule}', button: 'Add to calendar' },
  waitlist: { subject: "You're on the waiting list: {title}", heading: "You're on the waiting list, {first_name}.", message: "{title} is full right now. You're on the waiting list for {seats}.", button: null },
  live: { subject: "It's showtime: {title} is streaming now", heading: '{title} is live.', message: 'Watch any time before {ends} PT. The button below takes you to the screening room. Sign in with your Slipstream account to watch.', button: 'Watch now' },
  reminder: { subject: 'Tomorrow: {title}', heading: 'See you tomorrow, {first_name}.', message: '{title} screens {date} at {time}.', button: 'Show details' },
  thanks: { subject: 'Thank you for watching {title}', heading: 'Thanks for joining us.', message: 'We hope you enjoyed {title}.', button: null }
};
const words = b => {
  const w = {};
  for (const k of ['subject', 'heading', 'message', 'button']) if (b[k] !== undefined) w[k] = b[k] === '' ? null : String(b[k]).slice(0, k === 'message' ? 4000 : 300);
  return w;
};
const checkType = t => { if (!EMAIL_TYPES.includes(t)) throw new Bad('Unknown email type.'); return t; };

async function saveTemplate(body, who) {
  const type = checkType(body.type);
  const w = body.reset ? EMAIL_DEFAULTS[type] : words(body);
  if (!body.reset && (!w.subject || !w.heading || !w.message)) throw new Bad('Subject, heading and message can’t be empty.');
  await sl('email_templates?on_conflict=type', { method: 'POST', body: JSON.stringify({ type, ...w, updated_at: new Date().toISOString(), updated_by: who.name }),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  return { type };
}

// One email for one show: new words, a new send time, cancelled, or back to standard (clear).
async function saveOverride(body, who) {
  const type = checkType(body.type);
  const slug = String(body.slug || '');
  const [show] = await sl('shows?select=slug&slug=eq.' + encodeURIComponent(slug));
  if (!show) throw new Bad('That show no longer exists.', 404);
  const key = 'show_slug=eq.' + encodeURIComponent(slug) + '&type=eq.' + type;
  if (body.clear) { await sl('email_overrides?' + key, { method: 'DELETE' }); return { cleared: true }; }
  const row = { show_slug: slug, type, ...words(body), updated_at: new Date().toISOString(), updated_by: who.name };
  if (body.send_at !== undefined) row.send_at = body.send_at ? new Date(body.send_at).toISOString() : null;
  if (body.cancelled !== undefined) row.cancelled = !!body.cancelled;
  await sl('email_overrides?on_conflict=show_slug,type', { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  if (body.sendNow) await callSender({ sweep: true }).catch(() => {});
  return { saved: true };
}

async function callSender(payload) {
  const [tok] = await sl('settings?select=value&key=eq.hub_token');
  const res = await fetch(SL_URL + '/functions/v1/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-token': tok ? tok.value : '' }, body: JSON.stringify(payload) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Bad(out.error || 'The email service didn’t answer.', 502);
  return out;
}
async function previewEmail(body) {
  const out = await callSender({ preview: { type: checkType(body.type), show_slug: body.slug || null, fields: words(body.fields || {}) } });
  return { subject: out.subject, html: out.html };
}
async function sendTest(body, who) {
  await callSender({ test: { type: checkType(body.type), show_slug: body.slug || null, fields: words(body.fields || {}), to: who.email, first_name: String(who.name || '').split(' ')[0] } });
  return { to: who.email };
}

const ACTIONS = { saveTemplate, saveOverride, previewEmail, sendTest, load, saveShow, createSeries, setWindow, setStatus, upload, deleteShow };

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
