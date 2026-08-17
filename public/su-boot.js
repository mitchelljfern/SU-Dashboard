// Login gate. The overlay markup ships in index.html so it paints on the first
// frame — the dashboard is never briefly visible to a signed-out visitor.
// Resolves window.SUBoot.ready once we have both a profile and its data; the
// component awaits that in componentDidMount.
(() => {
  'use strict';

  let resolveReady;
  const ready = new Promise(r => { resolveReady = r; });

  const $ = id => document.getElementById(id);

  function show(msg, kind) {
    const el = $('su-login-msg');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = kind === 'error' ? '#D8564E' : 'rgba(255,255,255,.6)';
    el.style.visibility = msg ? 'visible' : 'hidden';
  }

  function busy(on) {
    const btn = $('su-login-btn');
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? 'Signing in…' : 'Sign in';
    btn.style.opacity = on ? '.6' : '1';
  }

  function hideOverlay() {
    const o = $('su-login');
    if (o) o.remove();
  }

  // Signed-out users land back on a clean login screen.
  window.SUSignOut = async () => {
    try { await window.SUData.signOut(); } catch (e) { /* sign out locally anyway */ }
    location.reload();
  };

  async function finish(profile) {
    show('Loading your dashboard…');
    const data = await window.SUData.load();
    hideOverlay();
    resolveReady({ profile, data });
  }

  async function attempt(email, password) {
    busy(true);
    show('');
    try {
      const profile = await window.SUData.signIn(email, password);
      if (!profile) throw new Error('No profile is linked to this account.');
      await finish(profile);
    } catch (err) {
      const raw = (err && err.message) || String(err);
      // Supabase returns a deliberately vague message; keep it that way rather
      // than revealing whether the address exists.
      show(/invalid login/i.test(raw) ? 'That email and password do not match.' : raw, 'error');
      busy(false);
    }
  }

  function wire() {
    const form = $('su-login-form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      attempt($('su-login-email').value, $('su-login-password').value);
    });
  }

  async function start() {
    wire();
    try {
      const session = await window.SUData.currentSession();
      if (session) {
        const profile = await window.SUData.loadProfile();
        if (profile) { await finish(profile); return; }
      }
    } catch (err) {
      console.error('[su-boot] session restore failed', err);
    }
    // No usable session — reveal the form.
    const form = $('su-login-form');
    if (form) form.style.visibility = 'visible';
    show('');
    const email = $('su-login-email');
    if (email) email.focus();
  }

  window.SUBoot = { ready };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
