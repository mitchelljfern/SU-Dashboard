// Native shell glue — built into public/su-native.app.js by `npm run build:native`
// and loaded by public/su-native.js ONLY inside the iOS app. In an ordinary
// browser the loader never fetches this file, so the web dashboard is untouched.
//
// Everything here is additive: safe-area padding for the notch and home
// indicator, status-bar colour, refresh-on-resume, and native handling for the
// few things a web view cannot do on its own (saving a download, opening an
// external link). index.html does not know or care whether it runs in the app.
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Keyboard } from '@capacitor/keyboard';

const log = (...a) => console.log('[native]', ...a);

// Every native call is best-effort. A rejected promise or a missing plugin
// must never take the dashboard down with it.
const attempt = (fn, label) => {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(e => log(label || 'call', 'failed', e));
    return r;
  } catch (e) { log(label || 'call', 'threw', e); }
};

function main() {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('su-native');

  // ---- Safe areas -----------------------------------------------------------
  // viewport-fit=cover lets the page extend under the status bar and home
  // indicator; env(safe-area-inset-*) says by how much. The rules below only
  // add to the paddings the app already sets, so the layout is the mobile web
  // layout plus the insets.
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/viewport-fit/.test(vp.content)) vp.content += ', viewport-fit=cover';

  const css = document.createElement('style');
  css.id = 'su-native-css';
  css.textContent = [
    'html.su-native{-webkit-text-size-adjust:100%}',
    'html.su-native,html.su-native body{overscroll-behavior:none}',
    'html.su-native #su-login{padding-top:calc(24px + env(safe-area-inset-top));padding-bottom:calc(24px + env(safe-area-inset-bottom))}',
    '@media (max-width:860px){',
    '  html.su-native .su-main{padding-top:calc(24px + env(safe-area-inset-top)) !important;padding-bottom:calc(110px + env(safe-area-inset-bottom)) !important}',
    '  html.su-native .su-bottom{padding-bottom:calc(10px + env(safe-area-inset-bottom)) !important}',
    '  html.su-native [style*="position:fixed;bottom:0;left:0;right:0;background:var(--chrome);z-index:71"]{padding-bottom:calc(28px + env(safe-area-inset-bottom)) !important}',
    '}',
    '@media (min-width:861px){',
    '  html.su-native .su-side{padding-top:calc(24px + env(safe-area-inset-top)) !important}',
    '  html.su-native .su-main{padding-top:calc(36px + env(safe-area-inset-top)) !important}',
    '}',
    'html.su-native .su-bottom,html.su-native .su-side nav{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}'
  ].join('\n');
  document.head.appendChild(css);

  // ---- Status bar -------------------------------------------------------------
  // Light text over the navy login gate; once the gate is gone, dark text over
  // the light page on a phone and light text over the navy sidebar on a tablet.
  // (Capacitor's Style.Dark means a dark background, i.e. light text.)
  const gateUp = () => !!document.getElementById('su-login');
  const wide = () => window.innerWidth > 860;
  const applyStatusBar = () => {
    const style = (gateUp() || wide()) ? Style.Dark : Style.Light;
    attempt(() => StatusBar.setStyle({ style }), 'StatusBar.setStyle');
  };
  attempt(() => StatusBar.setOverlaysWebView({ overlay: true }), 'StatusBar.overlay');
  applyStatusBar();
  window.addEventListener('resize', applyStatusBar);
  // The gate removes itself from the DOM on sign-in and comes back on sign-out.
  new MutationObserver(applyStatusBar).observe(document.body, { childList: true });

  // ---- Keyboard ---------------------------------------------------------------
  attempt(() => Keyboard.setAccessoryBarVisible({ isVisible: true }), 'Keyboard.accessory');

  // ---- Resume -----------------------------------------------------------------
  // The dashboard re-pulls everything on window focus and polls every 15 s
  // while visible. A web view gets no focus event when the app returns from
  // the background, so turn the native event into one.
  attempt(() => App.addListener('appStateChange', s => {
    if (s && s.isActive) window.dispatchEvent(new Event('focus'));
  }), 'App.appStateChange');

  // ---- Links and downloads ----------------------------------------------------
  // The dashboard saves files by building an <a download> and clicking it,
  // which a WKWebView ignores. Fetch the bytes, drop them in the app's cache,
  // and hand them to the share sheet (Save to Files, AirDrop, Mail, ...).
  // External links open in the in-app Safari view instead of replacing the
  // dashboard.
  const toBase64 = blob => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.readAsDataURL(blob);
  });
  const saveAndShare = async (href, name) => {
    const res = await fetch(href);
    if (!res.ok) throw new Error('download ' + res.status);
    const data = await toBase64(await res.blob());
    const path = String(name || 'file').replace(/[\\/:*?"<>|]+/g, '-');
    const written = await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    await Share.share({ title: path, url: written.uri });
  };
  const isExternal = href => {
    try { const u = new URL(href, location.href); return /^https?:$/.test(u.protocol) && u.host !== location.host; }
    catch (e) { return false; }
  };
  document.addEventListener('click', e => {
    const t = e.target;
    const a = t && t.closest ? t.closest('a[href]') : null;
    if (!a) return;
    if (a.hasAttribute('download')) {
      e.preventDefault(); e.stopImmediatePropagation();
      saveAndShare(a.href, a.getAttribute('download')).catch(err => log('download failed', err));
      return;
    }
    if (a.target === '_blank' || isExternal(a.href)) {
      e.preventDefault(); e.stopImmediatePropagation();
      attempt(() => Browser.open({ url: a.href }), 'Browser.open');
    }
  }, true);

  // ---- Feel -------------------------------------------------------------------
  // A light tick on the bottom tab bar, like a native tab bar.
  document.addEventListener('click', e => {
    const t = e.target;
    if (t && t.closest && t.closest('.su-bottom button')) attempt(() => Haptics.impact({ style: ImpactStyle.Light }), 'Haptics');
  }, true);

  // The splash hides itself on a timer; if the page is up sooner, hide it now.
  attempt(() => SplashScreen.hide(), 'SplashScreen.hide');
  log('ready');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
else main();
