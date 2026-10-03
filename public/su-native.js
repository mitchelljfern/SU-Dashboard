// Loader for the native iOS shell. The app is a Capacitor web view pointed at
// this site; WKWebView exposes window.webkit.messageHandlers.bridge and
// Capacitor injects window.Capacitor before any page script runs. Neither
// exists in a normal browser, so on the web this file does nothing at all.
// Inside the app it pulls in su-native.app.js (the Capacitor runtime plus the
// glue in app/native/entry.js), keeping the website's own payload unchanged.
(() => {
  'use strict';
  const w = window;
  const native = (w.Capacitor && typeof w.Capacitor.isNativePlatform === 'function' && w.Capacitor.isNativePlatform())
    || !!(w.webkit && w.webkit.messageHandlers && w.webkit.messageHandlers.bridge);
  if (!native) return;
  const s = document.createElement('script');
  s.src = 'su-native.app.js';
  s.defer = true;
  document.head.appendChild(s);
})();
