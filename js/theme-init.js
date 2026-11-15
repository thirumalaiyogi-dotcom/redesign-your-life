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
  // First app page of a visit shows the 10X logo for a moment; later pages open straight away.
  // (login.html has no loading screen, so the logo waits for the first page that does.)
  try {
    var seen = false;
    try { seen = !!sessionStorage.getItem('ryl.boot'); } catch (e) { seen = true; }
    if (!seen) {
      var root = document.documentElement;
      root.classList.add('boot-first', 'boot-hold');
      document.addEventListener('DOMContentLoaded', function () {
        if (!document.querySelector('.boot')) { root.classList.remove('boot-first', 'boot-hold'); return; }
        try { sessionStorage.setItem('ryl.boot', '1'); } catch (e) { /* ignore */ }
        setTimeout(function () { root.classList.remove('boot-hold'); }, 900);
      });
    }
  } catch (e) { /* never block the page */ }
})();
