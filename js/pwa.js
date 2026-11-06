// Refuse to run inside another site's frame (clickjacking guard; Vercel also sends X-Frame-Options).
if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch { document.documentElement.hidden = true; } }

// PWA: register the service worker and offer "Install app".
// Load with <script type="module" src=".../js/pwa.js"></script> on every page.
const SW_URL = new URL('../sw.js', import.meta.url);
let deferred = null;

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => {
    navigator.serviceWorker.register(SW_URL, { scope: new URL('../', import.meta.url).pathname }).catch(() => { /* app still works without it */ });
  });
}

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
const dismissed = () => { try { return Number(localStorage.getItem('ryl.install.dismissed') || 0) > Date.now() - 7 * 864e5; } catch { return false; } };

addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; render(); });
addEventListener('appinstalled', () => { deferred = null; document.querySelectorAll('[data-install]').forEach((el) => el.remove()); });

function render() {
  if (standalone() || dismissed()) return;
  const slots = document.querySelectorAll('[data-install-slot]');
  if (!slots.length || (!deferred && !isIOS())) return;
  slots.forEach((slot) => {
    if (slot.querySelector('[data-install]')) return;
    const box = document.createElement('div');
    box.className = 'install';
    box.setAttribute('data-install', '');
    box.innerHTML = deferred
      ? `<span class="crest" aria-hidden="true"></span><div><b>Install the app</b><small>Open it from your home screen like any app.</small></div>
         <button class="btn btn-gold btn-sm" data-do-install type="button">Install</button><button class="x" data-close aria-label="Not now">×</button>`
      : `<span class="crest" aria-hidden="true"></span><div><b>Add to Home Screen</b><small>Tap the Share button, then "Add to Home Screen".</small></div><button class="x" data-close aria-label="Not now">×</button>`;
    slot.appendChild(box);
  });
}

document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-do-install]') && deferred) {
    deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' }));
    deferred = null;
    if (outcome === 'accepted') document.querySelectorAll('[data-install]').forEach((el) => el.remove());
  }
  if (e.target.closest('[data-install] [data-close]')) {
    try { localStorage.setItem('ryl.install.dismissed', String(Date.now())); } catch { /* ignore */ }
    document.querySelectorAll('[data-install]').forEach((el) => el.remove());
  }
});

// Pages render their content after login, so look for slots again a moment later.
addEventListener('load', () => { render(); setTimeout(render, 1500); setTimeout(render, 4000); });
export { render as renderInstall };
