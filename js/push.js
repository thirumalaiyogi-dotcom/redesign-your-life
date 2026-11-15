// Phone notifications (Web Push) — member side. The public VAPID key below is meant to be public;
// the matching private key lives only in the Supabase Edge Function secrets.
import { supabase } from './supabase.js';

export const VAPID_PUBLIC_KEY = 'BAU_N4h6VR07b0bRPoxI-pOrdyDPkDla7ZQ6mGOWp2Nrn_EGW700V8FRh-0eJbK2nmveODgPlRo3AM0PpX2eDFg';

const b64ToBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'on' | 'off' | 'blocked' | 'ios-install' | 'unsupported'
export async function pushState() {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  if (!('PushManager' in window) || !('Notification' in window)) return isIOS() && !standalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked. Allow them in your browser settings for this site.' : 'Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint, p_p256dh: toB64(sub.getKey('p256dh')), p_auth: toB64(sub.getKey('auth')) });
  if (error) throw error;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// Already allowed on this phone → make sure the server has this phone for the person signed in now
// (e.g. someone else used this phone before, or the first save failed). Silent; never asks.
export async function syncPush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return false;
    await enablePush();
    return true;
  } catch { return false; }
}

// A clear "Allow notifications" sheet (browsers need a tap before they show their own question).
// Shown when notifications are off on this phone; "Later" waits a day.
const LATER = 'ryl.push.sheet.later';
export async function pushSheet({ text, onToast } = {}) {
  let later = 0; try { later = Number(localStorage.getItem(LATER) || 0); } catch { /* ignore */ }
  if (later > Date.now() - 864e5) return;
  const st = await pushState().catch(() => 'unsupported');
  if (st !== 'off') return;
  const { icon } = await import('./ui.js');
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  scrim.innerHTML = `<div class="dialog push-sheet" role="dialog" aria-modal="true" aria-labelledby="ps-t">
    <span class="ps-ic">${icon('bell')}</span><h2 id="ps-t">Turn on notifications</h2>
    <p class="muted">${text || 'Get your coach\'s answers, class updates and your evening reminder on this phone, like a WhatsApp message.'}</p>
    <div class="actions"><button class="btn btn-ghost" data-ps="later">Later</button><button class="btn btn-gold" data-ps="on">Allow</button></div></div>`;
  document.body.appendChild(scrim);
  return new Promise((resolve) => {
    scrim.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ps]');
      if (!b && e.target !== scrim) return;
      if (!b || b.dataset.ps === 'later') { try { localStorage.setItem(LATER, String(Date.now())); } catch { /* ignore */ } scrim.remove(); return resolve(false); }
      b.disabled = true; b.textContent = 'Please wait…';
      try { await enablePush(); scrim.remove(); onToast?.('Notifications turned on', 'ok'); resolve(true); }
      catch (err) { scrim.remove(); onToast?.(err.message || 'Notifications were not allowed.', 'bad'); resolve(false); }
    });
  });
}
