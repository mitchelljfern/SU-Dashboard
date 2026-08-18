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
  const TABLES = ['todos', 'work', 'requests', 'updates', 'messages', 'files', 'invoices', 'log', 'strategy'];

  // How each collection is ordered when loaded, to match what the UI expects.
  // Messages read as a chat thread (oldest first); everything else is a feed.
  const ORDER = { messages: 'asc' };

  // `clients` has real columns rather than a jsonb body, so it maps by hand.
  const CLIENT_COLS = {
    name: 'name', domain: 'domain', service: 'service', plan: 'plan',
    price: 'price', hoursUsed: 'hours_used', hoursTotal: 'hours_total',
    pulse: 'pulse', pulseMonth: 'pulse_month', businesses: 'businesses',
    billingPortalUrl: 'billing_portal_url', billingCycle: 'billing_cycle',
    billingType: 'billing_type', hourlyRate: 'hourly_rate', color: 'color'
  };

  // Per-reader marker for message threads. Composite key, so the app-side id
  // is synthesised from both halves.
  const READ_COLS = { profileId: 'profile_id', clientId: 'client_id', lastReadTs: 'last_read_ts' };

  // Hours worked for a client, billed monthly for 'hourly' clients.
  const TIME_COLS = {
    clientId: 'client_id', profileId: 'profile_id', entryDate: 'entry_date',
    hours: 'hours', description: 'description', billable: 'billable'
  };

  // Staff directory, used for assigning work and for the payments ledger.
  // Pay rates deliberately live in their own table — see RATE_COLS.
  const TEAM_COLS = {
    name: 'name', email: 'email', isAdmin: 'is_admin',
    isAccountant: 'is_accountant', active: 'active'
  };

  // Everyone with a login, team and client alike, for the member lists.
  const PEOPLE_COLS = {
    name: 'name', email: 'email', role: 'role', clientId: 'client_id',
    isAdmin: 'is_admin', isAccountant: 'is_accountant', active: 'active'
  };

  // Rates are admin-only, so they are a separate table with their own policy;
  // a member's load returns just their own row.
  const RATE_COLS = { hourlyRate: 'hourly_rate', payType: 'pay_type' };

  // `amount` is a generated column — readable, never writable.
  // `minutes` is authoritative for hours submissions, so 2h59m stays exact.
  const PAY_COLS = {
    profileId: 'profile_id', kind: 'kind', periodStart: 'period_start',
    periodEnd: 'period_end', payDate: 'pay_date', minutes: 'minutes',
    rate: 'rate', flatAmount: 'flat_amount', adjustment: 'adjustment',
    breakdown: 'breakdown', status: 'status', paidAt: 'paid_at',
    approvedBy: 'approved_by', approvedAt: 'approved_at', note: 'note',
    changeRequested: 'change_requested', changeNote: 'change_note'
  };

  const NUMERIC_COLS = new Set([
    'price', 'hours_used', 'hours_total', 'hourly_rate',
    'rate', 'adjustment', 'amount', 'flat_amount', 'minutes',
    'hours'   // still used by time_entries, even though pay is in minutes
  ]);

  // Generic column mapper for the tables that are not jsonb-bodied.
  function mapFromRow(row, cols, extra) {
    const o = { id: row.id };
    for (const [appKey, col] of Object.entries(cols)) {
      let v = row[col];
      if (NUMERIC_COLS.has(col) && v !== null && v !== undefined) v = Number(v);
      if (v !== null && v !== undefined) o[appKey] = v;
    }
    for (const col of (extra || [])) {
      if (row[col] !== undefined && row[col] !== null) {
        o[col.replace(/_(\w)/g, (_, c) => c.toUpperCase())] =
          NUMERIC_COLS.has(col) ? Number(row[col]) : row[col];
      }
    }
    return o;
  }

  function mapToRow(item, cols) {
    const r = { id: item.id };
    for (const [appKey, col] of Object.entries(cols)) {
      if (item[appKey] !== undefined) r[col] = item[appKey];
    }
    return r;
  }

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
    const o = mapFromRow(r, CLIENT_COLS);
    if (!Array.isArray(o.pulse)) o.pulse = [];
    if (!Array.isArray(o.businesses)) o.businesses = [];
    return o;
  };
  const clientToRow = c => mapToRow(c, CLIENT_COLS);

  const teamFromRow = r => mapFromRow(r, TEAM_COLS);
  const teamToRow   = t => mapToRow(t, TEAM_COLS);

  const readFromRow = r => ({
    id: r.profile_id + ':' + r.client_id,
    profileId: r.profile_id, clientId: r.client_id,
    lastReadTs: Number(r.last_read_ts || 0)
  });
  const readToRow = r => ({
    profile_id: r.profileId, client_id: r.clientId,
    last_read_ts: Number(r.lastReadTs) || 0
  });

  const timeFromRow = r => mapFromRow(r, TIME_COLS);
  const timeToRow   = t => mapToRow(t, TIME_COLS);

  // amount is generated in Postgres; carry it for display, drop it on write.
  const payFromRow = r => {
    const o = mapFromRow(r, PAY_COLS);
    o.amount = Number(r.amount || 0);
    if (!Array.isArray(o.breakdown)) o.breakdown = [];
    return o;
  };
  const payToRow = p => mapToRow(p, PAY_COLS);

  // team_rates is keyed by profile_id rather than id, so it maps by hand —
  // the generic mapper would set id from a column this table does not have.
  const rateFromRow = r => ({
    id: r.profile_id, profileId: r.profile_id,
    hourlyRate: Number(r.hourly_rate || 0),
    payType: r.pay_type || 'hourly'
  });
  const rateToRow = r => ({
    profile_id: r.profileId || r.id,
    hourly_rate: r.hourlyRate,
    pay_type: r.payType || 'hourly'
  });

  // ---------- auth ----------

  async function loadProfile() {
    const { data: { user } } = await client().auth.getUser();
    if (!user) { profile = null; return null; }
    // Select every column: is_admin and is_accountant decide who can approve
    // pay, edit rates and see client invoices. Naming columns here once meant
    // those flags silently arrived undefined, which reads as "not an admin".
    const { data, error } = await client()
      .from('profiles').select('*').eq('id', user.id).single();
    if (error) throw error;
    profile = { ...data, email: data.email || user.email };
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
      db.from('reports').select('*'),
      // Staff directory. A client user only ever gets their own row back, so
      // this is naturally empty for them.
      db.from('profiles').select('*').eq('role', 'team').order('name', { ascending: true }),
      // Payroll. RLS decides scope: finance sees everyone, a member sees only
      // their own rows, clients see none.
      db.from('team_payments').select('*').order('pay_date', { ascending: false }),
      // Hours worked. Staff see every client's; a client sees only its own.
      db.from('time_entries').select('*').order('entry_date', { ascending: false }),
      // Pay rates. Admin gets everyone, a member gets only their own row.
      db.from('team_rates').select('*'),
      // Everyone who can sign in, so both sides can list portal members.
      db.from('profiles').select('*'),
      // This reader's own message markers.
      db.from('message_reads').select('*')
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
    data.team = results[2].data.map(teamFromRow);
    data.payments = results[3].data.map(payFromRow);
    data.time = results[4].data.map(timeFromRow);
    data.rates = results[5].data.map(rateFromRow);
    data.people = results[6].data.map(r => mapFromRow(r, PEOPLE_COLS));
    data.reads = results[7].data.map(readFromRow);
    TABLES.forEach((t, i) => { data[t] = results[i + 8].data.map(fromRow); });

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

    // staff directory (admin-only writes; RLS rejects anyone else)
    {
      const { upserts } = diffList(prev.team, next.team);
      if (upserts.length) ops.push(db.from('profiles').upsert(upserts.map(teamToRow)));
      // profiles are never deleted from the UI — deactivate instead
    }

    // payroll
    {
      const { upserts, deletes } = diffList(prev.payments, next.payments);
      if (upserts.length) ops.push(db.from('team_payments').upsert(upserts.map(payToRow)));
      if (deletes.length) ops.push(db.from('team_payments').delete().in('id', deletes));
    }

    // logged hours
    {
      const { upserts, deletes } = diffList(prev.time, next.time);
      if (upserts.length) ops.push(db.from('time_entries').upsert(upserts.map(timeToRow)));
      if (deletes.length) ops.push(db.from('time_entries').delete().in('id', deletes));
    }

    // message read markers
    {
      const { upserts } = diffList(prev.reads, next.reads);
      if (upserts.length) {
        ops.push(db.from('message_reads')
          .upsert(upserts.map(readToRow), { onConflict: 'profile_id,client_id' }));
      }
    }

    // pay rates (admin-only writes; RLS rejects anyone else)
    {
      const { upserts } = diffList(prev.rates, next.rates);
      if (upserts.length) {
        ops.push(db.from('team_rates').upsert(upserts.map(rateToRow), { onConflict: 'profile_id' }));
      }
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

  // ---------- attachments ----------
  // Files live in a private bucket, one folder per tenant, and the item only
  // ever stores the object path. URLs are signed on demand and expire, so a
  // link copied out of the portal is not a way around row-level security.

  const BUCKET = 'attachments';
  const MAX_BYTES = 50 * 1024 * 1024;
  const SIGN_SECONDS = 3600;

  // The display name is kept on the item; the object key is opaque. Spaces,
  // slashes and non-ascii all travel badly through storage paths, and a
  // predictable key would let one upload silently overwrite another.
  function objectKey(name) {
    const raw = String(name || '');
    const dot = raw.lastIndexOf('.');
    const ext = dot > 0
      ? raw.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8)
      : '';
    const id = (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    return ext ? id + '.' + ext : id;
  }

  // Returns the record the UI stores on the item's `files` array.
  async function uploadAttachment(file, where) {
    const w = where || {};
    if (!file) throw new Error('No file was selected.');
    if (file.size > MAX_BYTES) {
      throw new Error('"' + file.name + '" is larger than the 50 MB limit.');
    }
    const path = [w.clientId || '_internal', w.kind || 'item', w.itemId || 'misc']
      .join('/') + '/' + objectKey(file.name);
    const { error } = await client().storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false
    });
    if (error) throw error;
    return {
      id: path,
      name: file.name,
      path,
      size: file.size,
      mime: file.type || '',
      ts: Date.now(),
      by: (profile && (profile.name || profile.email)) || ''
    };
  }

  async function signedUrl(path) {
    if (!path) throw new Error('That attachment has no stored file.');
    const { data, error } = await client().storage.from(BUCKET)
      .createSignedUrl(path, SIGN_SECONDS);
    if (error) throw error;
    return data.signedUrl;
  }

  // The same signed URL, asking storage for Content-Disposition: attachment —
  // which is what actually makes the browser save the file rather than
  // navigate to it. Kept as a plain string op so a download can be started
  // from inside the click that asked for it, using a URL signed earlier.
  function downloadUrl(url, filename) {
    return url + (url.indexOf('?') >= 0 ? '&' : '?')
      + 'download=' + encodeURIComponent(filename || '');
  }

  // ---------- admin actions ----------
  // Creating a login needs privileges the browser must not hold, so these are
  // thin calls onto SECURITY DEFINER functions that re-check is_admin() in the
  // database. A non-admin gets a permission error from Postgres, not from here.

  async function createClientLogin(clientId, email, password, name) {
    const { error } = await client().rpc('admin_create_client_login', {
      p_client_id: clientId,
      p_email: String(email || '').trim().toLowerCase(),
      p_password: password,
      p_name: name || ''
    });
    if (error) throw error;
  }

  async function createTeamMember(email, password, name, rate, isAccountant) {
    const { error } = await client().rpc('admin_create_team_member', {
      p_email: String(email || '').trim().toLowerCase(),
      p_password: password,
      p_name: name || '',
      p_rate: Number(rate) || 20,
      p_is_accountant: !!isAccountant
    });
    if (error) throw error;
  }

  async function invitePortalMember(email, password, name) {
    const { error } = await client().rpc('client_invite_member', {
      p_email: String(email || '').trim().toLowerCase(),
      p_password: password, p_name: name || ''
    });
    if (error) throw error;
  }

  async function deleteUser(userId) {
    const { error } = await client().rpc('admin_delete_user', { p_user: userId });
    if (error) throw error;
  }

  window.SUData = {
    signIn, signOut, currentSession, loadProfile, load, sync,
    uploadAttachment, signedUrl, downloadUrl, MAX_ATTACHMENT_BYTES: MAX_BYTES,
    createClientLogin, createTeamMember, invitePortalMember, deleteUser,
    get profile() { return profile; },
    onAuthChange(cb) { client().auth.onAuthStateChange((e, s) => cb(e, s)); }
  };
})();
