// Service worker — Deepak's 10X Life
// Caches only the public app shell (HTML/CSS/JS/images from this site).
// Never caches Supabase requests, so private member data never lands in the cache.
const VERSION = 'ryl-v68';
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const IMAGES = `${VERSION}-images`;

const PRECACHE = [
  './', 'index.html', 'login.html', 'register.html', 'forgot.html', 'offline.html', 'manifest.json',
  'css/tokens.css', 'css/style.css', 'css/landing.css', 'css/components.css', 'css/responsive.css', 'css/dashboard.css', 'css/tracker.css', 'css/journal.css', 'css/progress.css', 'css/leaderboard.css', 'css/admin.css', 'css/learn.css', 'css/todo.css',
  'js/theme-init.js', 'js/theme.js', 'js/site-content.js', 'js/vendor/supabase.js', 'js/supabase.js', 'js/landing.js', 'js/index.js', 'js/auth.js', 'js/ui.js', 'js/icons.js', 'js/stadium.js', 'js/pwa.js',
  'js/auth-pages.js', 'js/dashboard.js', 'js/tracker.js', 'js/leaderboard.js', 'js/journal.js', 'js/admin.js', 'js/learn.js', 'js/media.js', 'js/coach-learn.js', 'js/push.js', 'js/point.js', 'js/batches.js', 'js/fx.js', 'js/offline.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/favicon-32.png', 'assets/icons/logo-96.png'
];

// member pages are saved too, so the app opens with no internet (it then shows the habits saved on the phone)
const MEMBER_PAGES = ['dashboard', 'trackers', 'tracker-detail', 'leaderboard', 'journal', 'profile', 'progress', 'todo', 'learn'].map((p) => `member/${p}.html`);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    await (await caches.open(SHELL)).addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })));
    const pages = await caches.open(PAGES);
    await Promise.all(MEMBER_PAGES.map(async (p) => {
      try { const res = await fetch(new Request(p, { cache: 'reload' })); if (res.ok) await pages.put(new Request(new URL(p, self.registration.scope).href), res); } catch { /* next visit caches it */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!key.startsWith(VERSION)) await caches.delete(key);
    await self.clients.claim();
  })());
});

const sameOrigin = (url) => url.origin === self.location.origin;
const inScope = (url) => url.href.startsWith(self.registration.scope);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // never touch writes
  const url = new URL(req.url);
  if (!sameOrigin(url) || !inScope(url)) return;          // Supabase, fonts, CDNs: straight to network
  if (url.pathname.endsWith('/sw.js')) return;

  // Pages: open instantly from this version's cache and refresh it in the background.
  // Every deploy bumps VERSION, so the first visit after an update always comes from the network.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const key = stripQuery(req);
      const cache = await caches.open(PAGES);
      const hit = await cache.match(key, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => { if (res.ok) cache.put(key, res.clone()); return res; });
      if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
      try { return await fresh; }
      catch { return (await caches.match('offline.html', { ignoreSearch: true })) || Response.error(); }
    })());
    return;
  }

  // Activity images: cache first (they rarely change; new uploads get new file names).
  if (url.pathname.includes('/assets/images/')) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(IMAGES)).put(req, res.clone());
      return res;
    })());
    return;
  }

  // CSS / JS / icons: from this version's cache at once, refreshed in the background.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
    if (hit) { event.waitUntil(fresh.catch(() => {})); return hit; }
    try { return await fresh; } catch { return Response.error(); }
  })());
});

function stripQuery(req) { const u = new URL(req.url); u.search = ''; return new Request(u.href); }

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// ---- phone notifications (Web Push). Payload: { title, body, url, tag } from the send-push function ----
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: event.data?.text() || "Deepak's 10X Life" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Deepak's 10X Life", {
    body: d.body || '', tag: d.tag || undefined, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/favicon-32.png',
    data: { url: d.url || 'member/dashboard.html' }
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || 'member/dashboard.html', self.registration.scope);
  if (!target.href.startsWith(self.registration.scope)) return;      // only open our own pages
  event.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) { await c.focus(); return c.navigate ? c.navigate(target.href) : null; }
    }
    return self.clients.openWindow(target.href);
  })());
});
