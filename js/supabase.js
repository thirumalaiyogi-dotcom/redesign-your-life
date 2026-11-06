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

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: sessionStore, storageKey: 'ryl.auth' }
});

// Activity images: bundled files live in /assets/images/, coach uploads live in Storage (full URL).
export function activityImageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return app(`assets/images/${encodeURIComponent(path)}`);
}
