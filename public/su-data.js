// Data layer: auth + load + write-back against Supabase.
//
// The UI was written against one nested object held in memory and mutated
// wholesale (see `set(fn)` in index.html). Rather than rewrite every call site,
// this layer keeps that contract: `load()` hands back that exact shape, and
// `sync(prev, next)` diffs two versions of it and issues the minimal set of
// row writes. The UI stays untouched; only persistence changes.
(() => {
  'use strict';

  // Collections stored as id / client_id / ts / data(jsonb).
  const TABLES = ['todos', 'work', 'requests', 'updates', 'messages', 'files', 'invoices', 'log'];

  // How each collection is ordered when loaded, to match what the UI expects.
  // Messages read as a chat thread (oldest first); everything else is a feed.
  const ORDER = { messages: 'asc' };

  // `clients` has real columns rather than a jsonb body, so it maps by hand.
  const CLIENT_COLS = {
    name: 'name', domain: 'domain', service: 'service', plan: 'plan',
    price: 'price', hoursUsed: 'hours_used', hoursTotal: 'hours_total',
    pulse: 'pulse', pulseMonth: 'pulse_month'
  };

  let sb = null;
  let profile = null;

  function client() {
    if (!sb) {
      const cfg = window.SU_CONFIG || {};
      sb = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    }
    return sb;
  }

  // ---------- row <-> app-object mapping ----------

  // A row becomes the flat object the UI already knows: id/clientId/ts plus
  // whatever was in `data`. clientId is '' (not null) for internal rows,
  // because that is what the existing UI compares against.
  const fromRow = r => Object.assign({ id: r.id, clientId: r.client_id || '', ts: Number(r.ts) }, r.data || {});

  const toRow = item => {
    const { id, clientId, ts, ...rest } = item;
    return {
      id,
      client_id: clientId ? clientId : null,
      ts: Number(ts) || Date.now(),
      data: rest
    };
  };

  const clientFromRow = r => {
    const o = { id: r.id };
    for (const [appKey, col] of Object.entries(CLIENT_COLS)) {
      let v = r[col];
      if (col === 'price' || col === 'hours_used' || col === 'hours_total') v = Number(v);
      if (v !== null && v !== undefined) o[appKey] = v;
    }
    if (!Array.isArray(o.pulse)) o.pulse = [];
    return o;
  };

  const clientToRow = c => {
    const r = { id: c.id };
    for (const [appKey, col] of Object.entries(CLIENT_COLS)) {
      if (c[appKey] !== undefined) r[col] = c[appKey];
    }
    return r;
  };

  // ---------- auth ----------

  async function loadProfile() {
    const { data: { user } } = await client().auth.getUser();
    if (!user) { profile = null; return null; }
    const { data, error } = await client()
      .from('profiles').select('id, role, client_id, name').eq('id', user.id).single();
    if (error) throw error;
    profile = { ...data, email: user.email };
    return profile;
  }

  async function signIn(email, password) {
    const { error } = await client().auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password: password || ''
    });
    if (error) throw error;
    return loadProfile();
  }

  async function signOut() {
    await client().auth.signOut();
    profile = null;
  }

  async function currentSession() {
    const { data: { session } } = await client().auth.getSession();
    return session;
  }

  // ---------- load ----------

  async function load() {
    const db = client();
    const jobs = [
      db.from('clients').select('*').order('created_at', { ascending: true }),
      db.from('reports').select('*')
    ];
    for (const t of TABLES) {
      jobs.push(db.from(t).select('*').order('ts', { ascending: ORDER[t] === 'asc' }));
    }

    const results = await Promise.all(jobs);
    for (const r of results) if (r.error) throw r.error;

    const data = {};
    data.clients = results[0].data.map(clientFromRow);
    data.reports = {};
    for (const r of results[1].data) data.reports[r.client_id] = r.data;
    TABLES.forEach((t, i) => { data[t] = results[i + 2].data.map(fromRow); });

    // Every client needs a report block so the portal's Reports tab can render.
    for (const c of data.clients) {
      if (!data.reports[c.id]) data.reports[c.id] = { stats: [], note: '' };
    }
    return data;
  }

  // ---------- diff + write ----------

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // Compare two versions of one collection and return what changed. Rows are
  // matched by id, so reordering alone costs nothing.
  function diffList(prev, next) {
    const prevById = new Map((prev || []).map(x => [x.id, x]));
    const nextIds = new Set((next || []).map(x => x.id));
    const upserts = (next || []).filter(n => {
      const p = prevById.get(n.id);
      return !p || !same(p, n);
    });
    const deletes = (prev || []).filter(p => !nextIds.has(p.id)).map(p => p.id);
    return { upserts, deletes };
  }

  // Writes are queued so two quick edits cannot interleave into a lost update.
  let queue = Promise.resolve();

  function sync(prev, next) {
    queue = queue.then(() => run(prev, next)).catch(err => {
      console.error('[su-data] sync failed', err);
      throw err;
    });
    return queue;
  }

  async function run(prev, next) {
    const db = client();
    const ops = [];

    // clients
    {
      const { upserts, deletes } = diffList(prev.clients, next.clients);
      if (upserts.length) ops.push(db.from('clients').upsert(upserts.map(clientToRow)));
      if (deletes.length) ops.push(db.from('clients').delete().in('id', deletes));
    }

    // jsonb-bodied collections
    for (const t of TABLES) {
      const { upserts, deletes } = diffList(prev[t], next[t]);
      if (upserts.length) ops.push(db.from(t).upsert(upserts.map(toRow)));
      if (deletes.length) ops.push(db.from(t).delete().in('id', deletes));
    }

    // reports: an object keyed by client id, not a list
    {
      const prevR = prev.reports || {}, nextR = next.reports || {};
      const changed = Object.keys(nextR).filter(k => !same(prevR[k], nextR[k]));
      if (changed.length) {
        ops.push(db.from('reports').upsert(changed.map(k => ({ client_id: k, data: nextR[k] }))));
      }
    }

    if (!ops.length) return { ok: true, writes: 0 };

    const settled = await Promise.all(ops);
    const failed = settled.filter(r => r && r.error);
    if (failed.length) throw failed[0].error;
    return { ok: true, writes: ops.length };
  }

  window.SUData = {
    signIn, signOut, currentSession, loadProfile, load, sync,
    get profile() { return profile; },
    onAuthChange(cb) { client().auth.onAuthStateChange((e, s) => cb(e, s)); }
  };
})();
