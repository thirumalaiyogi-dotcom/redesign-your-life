// Theme bootstrap — loaded synchronously in <head> so the first paint uses the right theme
// (no flash). External file because the Content-Security-Policy forbids inline scripts.
// Saved choice: localStorage "ryl.theme" = "light" | "dark" | "system". Default: light.
(function () {
  var KEY = 'ryl.theme';
  var COLORS = { light: '#F7F8F5', dark: '#101713' };
  function saved() { try { return localStorage.getItem(KEY) || 'light'; } catch (e) { return 'light'; } }
  function resolve(pref) {
    if (pref === 'dark' || pref === 'light') return pref;
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function apply(pref) {
    var t = resolve(pref);
    var root = document.documentElement;
    root.setAttribute('data-theme', t);
    root.setAttribute('data-theme-choice', pref);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', COLORS[t]);
    return t;
  }
  apply(saved());
  // Follow the phone's setting live when the member chose "system".
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (saved() === 'system') apply('system');
    });
  } catch (e) { /* old browsers: applied once on load */ }
  window.__rylTheme = { KEY: KEY, saved: saved, resolve: resolve, apply: apply };
  // Keep the 10X loading logo on screen long enough to see its animation:
  // longer the first time the app opens in a session, shorter between pages.
  try {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      var first = true;
      try { first = !sessionStorage.getItem('ryl.boot'); sessionStorage.setItem('ryl.boot', '1'); } catch (e) { /* private mode */ }
      var root = document.documentElement;
      root.classList.add('boot-hold');
      setTimeout(function () { root.classList.remove('boot-hold'); }, first ? 1500 : 800);
    }
  } catch (e) { /* never block the page */ }
})();
