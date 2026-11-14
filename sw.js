// Service worker — Deepak's Redesign Your Life
// Caches only the public app shell (HTML/CSS/JS/images from this site).
// Never caches Supabase requests, so private member data never lands in the cache.
const VERSION = 'ryl-v19';
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const IMAGES = `${VERSION}-images`;

const PRECACHE = [
  './', 'index.html', 'login.html', 'register.html', 'forgot.html', 'offline.html', 'manifest.json',
  'css/tokens.css', 'css/style.css', 'css/landing.css', 'css/components.css', 'css/responsive.css', 'css/dashboard.css', 'css/tracker.css', 'css/journal.css', 'css/progress.css', 'css/leaderboard.css', 'css/admin.css', 'css/learn.css',
  'js/theme-init.js', 'js/theme.js', 'js/site-content.js', 'js/vendor/supabase.js', 'js/supabase.js', 'js/landing.js', 'js/index.js', 'js/auth.js', 'js/ui.js', 'js/icons.js', 'js/stadium.js', 'js/pwa.js',
  'js/auth-pages.js', 'js/dashboard.js', 'js/tracker.js', 'js/leaderboard.js', 'js/journal.js', 'js/admin.js', 'js/learn.js', 'js/media.js', 'js/coach-learn.js', 'js/push.js', 'js/point.js',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
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

  // Pages: network first (always fresh), cached copy when offline, offline page as last resort.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(PAGES)).put(stripQuery(req), res.clone());
        return res;
      } catch {
        return (await caches.match(stripQuery(req), { ignoreSearch: true })) || (await caches.match('offline.html', { ignoreSearch: true })) || Response.error();
      }
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

  // CSS / JS / icons: network first so updates show at once; cached copy when offline.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL);
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || Response.error();
    }
  })());
});

function stripQuery(req) { const u = new URL(req.url); u.search = ''; return new Request(u.href); }

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// ---- phone notifications (Web Push). Payload: { title, body, url, tag } from the send-push function ----
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: event.data?.text() || 'Redesign Your Life' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Redesign Your Life', {
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
