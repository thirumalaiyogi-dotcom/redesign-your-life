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
