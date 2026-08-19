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

  // Which of the three panels is showing. The gate markup ships in the page so
  // it paints on the first frame, so switching is a matter of display alone.
  function panel(which) {
    const map = { login: 'su-login-form', reset: 'su-reset-form', set: 'su-set-form' };
    Object.keys(map).forEach(k => {
      const el = $(map[k]);
      if (!el) return;
      el.style.display = k === which ? 'flex' : 'none';
      el.style.visibility = 'visible';
    });
    const sub = document.querySelector('#su-login p.sub');
    if (sub) {
      sub.textContent = which === 'set'
        ? 'Choose a password and you are in.'
        : which === 'reset'
          ? 'We will email you a link to set a new password.'
          : 'Sign in to your dashboard.';
    }
  }

  // Show/hide on a password field. Kept generic so both forms get it.
  function wireEyes() {
    document.querySelectorAll('.su-eye').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $(btn.getAttribute('data-for'));
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        input.focus();
      });
    });
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

  // A reset link and an invitation are the same thing: a recovery token that
  // grants a session. We do not let that session straight into the dashboard —
  // it is only good for choosing a password first.
  async function setPassword(pw) {
    const btn = $('su-set-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; btn.style.opacity = '.6'; }
    show('');
    try {
      await window.SUData.setPassword(pw);
      const profile = await window.SUData.loadProfile();
      if (!profile) throw new Error('No profile is linked to this account.');
      await finish(profile);
    } catch (err) {
      show((err && err.message) || String(err), 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Set password and continue'; btn.style.opacity = '1'; }
    }
  }

  async function requestReset(email) {
    const btn = $('su-reset-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; btn.style.opacity = '.6'; }
    try {
      await window.SUData.sendPasswordLink(email);
    } catch (err) {
      // Deliberately not surfaced: whether an address has an account is not
      // something a sign-in screen should confirm to whoever is typing.
      console.error('[su-boot] reset request failed', err);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Email me a link'; btn.style.opacity = '1'; }
    show('If that address has an account, a link is on its way.');
  }

  function wire() {
    wireEyes();
    const form = $('su-login-form');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        attempt($('su-login-email').value, $('su-login-password').value);
      });
    }
    const forgot = $('su-forgot');
    if (forgot) forgot.addEventListener('click', () => {
      $('su-reset-email').value = $('su-login-email').value || '';
      show(''); panel('reset'); $('su-reset-email').focus();
    });
    const back = $('su-reset-back');
    if (back) back.addEventListener('click', () => { show(''); panel('login'); });
    const resetForm = $('su-reset-form');
    if (resetForm) resetForm.addEventListener('submit', e => {
      e.preventDefault();
      requestReset($('su-reset-email').value);
    });
    const setForm = $('su-set-form');
    if (setForm) setForm.addEventListener('submit', e => {
      e.preventDefault();
      const pw = $('su-set-password').value || '';
      if (pw.length < 12) return show('Use at least 12 characters.', 'error');
      setPassword(pw);
    });
  }

  async function start() {
    wire();
    // Read the fragment before anything touches it: supabase-js consumes the
    // recovery hash as soon as its client is constructed, and by then there is
    // no way to tell an invitation apart from an ordinary sign-in.
    const frag = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const linkType = frag.get('type');
    const linkError = frag.get('error_description') || frag.get('error');
    const arrivedOnALink = linkType === 'recovery' || linkType === 'invite';

    if (linkError) {
      panel('login');
      show(decodeURIComponent(String(linkError).replace(/\+/g, ' '))
        + ' Ask for a new link below.', 'error');
      const f = $('su-login-form');
      if (f) f.style.visibility = 'visible';
      return;
    }

    try {
      const session = await window.SUData.currentSession();
      if (session && arrivedOnALink) {
        // The token got us a session; it does not get us past this screen.
        panel('set');
        show('');
        const pw = $('su-set-password');
        if (pw) pw.focus();
        return;
      }
      if (session) {
        const profile = await window.SUData.loadProfile();
        if (profile) { await finish(profile); return; }
      }
    } catch (err) {
      console.error('[su-boot] session restore failed', err);
    }
    // No usable session — reveal the form.
    panel('login');
    show('');
    const email = $('su-login-email');
    if (email) email.focus();
  }

  window.SUBoot = { ready };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
