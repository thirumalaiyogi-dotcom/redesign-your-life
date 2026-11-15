// Ticks made while the phone has no internet are kept on the phone and sent when it is back online.
// They still go only through mark_activity() (server decides the day and the points). A tick kept from
// an earlier day is not sent: the server only accepts today's ticks, so it is dropped with a message.
import { supabase } from './supabase.js';

const key = (uid) => `ryl.pending.${uid}`;
const read = (uid) => { try { return JSON.parse(localStorage.getItem(key(uid)) || 'null'); } catch { return null; } };
const write = (uid, v) => { try { if (v) localStorage.setItem(key(uid), JSON.stringify(v)); else localStorage.removeItem(key(uid)); } catch { /* storage off */ } };

// Network trouble (not a refusal from the server)
export function isOfflineError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = String(error?.message || error || '').toLowerCase();
  return /failed to fetch|networkerror|network request failed|load failed|internet|err_internet|timeout/.test(m) && !error?.code;
}

// Keep the latest choice per habit for this day (null = cleared).
export function keepTick(uid, day, activityId, status) {
  let p = read(uid);
  if (!p || p.day !== day) p = { day, items: {} };
  p.items[activityId] = status;
  write(uid, p);
}

// A tick that reached the server replaces any older kept choice for the same habit.
export function forgetTick(uid, activityId) {
  const p = read(uid);
  if (!p || !(activityId in p.items)) return;
  delete p.items[activityId];
  write(uid, Object.keys(p.items).length ? p : null);
}

export function pendingFor(uid, day) {
  const p = read(uid);
  return p && p.day === day ? p.items : {};
}

let flushing = null;
// Send kept ticks. Resolves { sent, dropped, stale } (all 0 when nothing was waiting).
export function sendKeptTicks(uid) {
  if (flushing) return flushing;
  flushing = (async () => {
    const p = read(uid);
    const res = { sent: 0, dropped: 0, stale: 0 };
    if (!p || !Object.keys(p.items || {}).length) return res;
    const { data: today, error } = await supabase.rpc('app_today');
    if (error) return res;                                   // still offline: try again later
    if (today !== p.day) { res.stale = Object.keys(p.items).length; write(uid, null); return res; }
    for (const [id, status] of Object.entries(p.items)) {
      const { error: e } = await supabase.rpc('mark_activity', { p_activity_id: id, p_status: status, p_note: null });
      if (e && isOfflineError(e)) return res;                 // connection dropped again: keep the rest
      delete p.items[id];
      if (e) res.dropped++; else res.sent++;
      write(uid, Object.keys(p.items).length ? p : null);
    }
    return res;
  })().finally(() => { flushing = null; });
  return flushing;
}

// Send automatically when the phone comes back online or the app is opened again.
export function autoSend(uid, after) {
  const go = async () => {
    const r = await sendKeptTicks(uid);
    if (r.sent || r.dropped || r.stale) after?.(r);
  };
  addEventListener('online', go);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') go(); });
  return go();
}
