// Supabase client — Deepak's Redesign Your Life
// Load /js/vendor/supabase.js (classic script) BEFORE any module that imports this file.
// The anon key is meant to be public: every table is protected by Row Level Security
// (see supabase/policies.sql). NEVER put the service_role key anywhere in this app.

export const SUPABASE_URL = 'https://gcbizlnpryihrrmjwbdv.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjYml6bG5wcnlpaHJybWp3YmR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5MjM0NjYsImV4cCI6MjEwOTQ5OTQ2Nn0.MVwEg7dP0ivSxtVyy58uV1brPfbdIGlaYhhpUTRwIHM';

// App root (the folder that holds index.html). Works on Vercel (/) and GitHub Pages (/redesign-your-life/).
export const APP_ROOT = new URL('../', import.meta.url);
export const app = (path = '') => new URL(String(path).replace(/^\//, ''), APP_ROOT).href;

const REMEMBER_KEY = 'ryl.remember';

function safe(fn, fallback = null) { try { return fn(); } catch { return fallback; } }

export function setRemember(on) { safe(() => localStorage.setItem(REMEMBER_KEY, on ? '1' : '0')); }
export function getRemember() { return safe(() => localStorage.getItem(REMEMBER_KEY), '1') !== '0'; }

// "Keep me logged in" off → session lives only until the browser tab is closed.
const sessionStore = {
  getItem: (k) => safe(() => localStorage.getItem(k)) ?? safe(() => sessionStorage.getItem(k)),
  setItem: (k, v) => {
    const keep = getRemember();
    safe(() => (keep ? localStorage : sessionStorage).setItem(k, v));
    safe(() => (keep ? sessionStorage : localStorage).removeItem(k));
  },
  removeItem: (k) => { safe(() => localStorage.removeItem(k)); safe(() => sessionStorage.removeItem(k)); }
};

if (!window.supabase?.createClient) {
  throw new Error('Supabase library not loaded. Add <script src="/js/vendor/supabase.js"></script> before app modules.');
}

// ---- Offline: the habits a member last saw are kept on the phone ----
// Only a few read-only member requests are kept (tracker list, habits, this week's ticks, profile, today's date,
// home summary), per user, for 3 days, and cleared on log-out. When the phone has no internet the app shows
// these instead of an error. Writes (ticks) never come from here: they are kept separately and sent later.
const OFFLINE_KEY = 'ryl.offline';
const OFFLINE_TABLES = /\/rest\/v1\/(tracker_categories|activities|daily_checkins|profiles|tracker_assignments)$/;
const OFFLINE_RPC = /\/rest\/v1\/rpc\/(app_today|get_my_dashboard|get_my_streaks)$/;
const OFFLINE_MAX_AGE = 3 * 864e5;
const userOf = (auth) => { try { return JSON.parse(atob(String(auth).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub || ''; } catch { return ''; } };
const readOffline = () => safe(() => JSON.parse(localStorage.getItem(OFFLINE_KEY) || '{}'), {}) || {};
// The saved login (used only when the phone is offline and the login could not be refreshed)
export function storedSession() {
  const v = safe(() => JSON.parse(sessionStore.getItem('ryl.auth') || 'null'));
  const sess = v?.currentSession || v;
  return sess?.user?.id ? sess : null;
}
export function clearOfflineData() { safe(() => localStorage.removeItem(OFFLINE_KEY)); }

async function offlineFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
  const path = safe(() => new URL(url).pathname, '');
  const keep = (method === 'GET' && OFFLINE_TABLES.test(path)) || (method === 'POST' && OFFLINE_RPC.test(path));
  if (!keep) return fetch(input, init);
  const h = new Headers(init.headers || (typeof input === 'object' ? input.headers : undefined));
  const uid = userOf((h.get('Authorization') || '').replace(/^Bearer /, ''));
  const key = `${uid}|${method} ${url}|${typeof init.body === 'string' ? init.body : ''}|${h.get('Accept') || ''}`;
  try {
    const res = await fetch(input, init);
    if (res.ok && uid) {
      const text = await res.clone().text();
      if (text.length < 200000) safe(() => {
        const all = readOffline();
        all[key] = { t: text, ct: res.headers.get('content-type'), cr: res.headers.get('content-range'), at: Date.now() };
        const keys = Object.keys(all).sort((x, y) => all[y].at - all[x].at);
        for (const k of keys.slice(80)) delete all[k];       // keep the 80 most recent answers
        localStorage.setItem(OFFLINE_KEY, JSON.stringify(all));
      });
    }
    return res;
  } catch (err) {
    const all = readOffline();
    const alt = uid ? key : key.replace(/^[^|]*/, storedSession()?.user?.id || '');
    const hit = all[key] || all[alt];
    if (!hit || Date.now() - hit.at > OFFLINE_MAX_AGE) throw err;
    safe(() => dispatchEvent(new CustomEvent('ryl:offline-data')));
    const headers = { 'content-type': hit.ct || 'application/json' };
    if (hit.cr) headers['content-range'] = hit.cr;
    return new Response(hit.t, { status: 200, headers });
  }
}

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: sessionStore, storageKey: 'ryl.auth' },
  global: { fetch: offlineFetch }
});

// Activity images: bundled files live in /assets/images/, coach uploads live in Storage (full URL).
export function activityImageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return app(`assets/images/${encodeURIComponent(path)}`);
}
