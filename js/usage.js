// Time in the app. Counts only while the app is on screen AND was touched/scrolled in the last 2 minutes
// (an app left open on the table does not count). Seconds are kept on the phone and sent about once a
// minute; the server never adds more than the real time that passed, so the number stays honest.
import { supabase, DEMO_EMAIL } from './supabase.js';

const IDLE_MS = 120000, STEP = 5, SEND_EVERY = 60;
let started = false;

export async function startUsage() {
  if (started) return; started = true;
  const { data } = await supabase.auth.getSession().catch(() => ({ data: {} }));
  const user = data?.session?.user; if (!user || String(user.email).toLowerCase() === DEMO_EMAIL) return;
  const key = `ryl.usage.${user.id}`;
  const get = () => { try { return Number(localStorage.getItem(key) || 0); } catch { return 0; } };
  const set = (v) => { try { localStorage.setItem(key, String(Math.max(0, Math.round(v)))); } catch { /* ignore */ } };
  let newVisit = false;
  try { if (!sessionStorage.getItem('ryl.usage.visit')) { sessionStorage.setItem('ryl.usage.visit', '1'); newVisit = true; } } catch { /* ignore */ }
  let lastInput = Date.now(), sinceSend = 0, sending = false;
  // only the person's own actions count (not the quote band or other things that move by themselves)
  ['pointerdown', 'keydown', 'touchstart', 'touchmove', 'wheel'].forEach((ev) => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  const send = async () => {
    const pending = get(); if (sending || (!pending && !newVisit)) return;
    sending = true;
    const n = Math.min(pending, 300);
    let error = null;
    try { ({ error } = await supabase.rpc('log_app_time', { p_seconds: n, p_open: newVisit })); } catch (e) { error = e; }
    if (!error) { set(get() - n); newVisit = false; sinceSend = 0; }
    sending = false;
  };
  setInterval(() => {
    if (document.visibilityState !== 'visible' || Date.now() - lastInput > IDLE_MS) return;
    set(get() + STEP); sinceSend += STEP;
    if (sinceSend >= SEND_EVERY) send();
  }, STEP * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); else lastInput = Date.now(); });
  send();   // the first report of this visit (and anything left from last time)
}

// "1 h 05 min", "12 min", "under a minute"
export function fmtTime(sec) {
  const m = Math.floor((Number(sec) || 0) / 60);
  if (m < 1) return sec > 0 ? 'under a minute' : '0 min';
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
