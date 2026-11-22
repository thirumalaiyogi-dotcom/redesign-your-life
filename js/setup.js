// "Finish setting up" card on Home: ① install the app ② turn on notifications.
// It stays (coming back every day after "Later") until both are done, and each step has a
// "How?" sheet with simple steps for this exact phone/browser — including the common
// problems: link opened inside WhatsApp/Instagram, and notifications blocked in Chrome.
import { supabase } from './supabase.js';
import { $, icon, esc, toast } from './ui.js';
import { pushState, enablePush } from './push.js';
import { canInstall, promptInstall } from './pwa.js';

const LATER = 'ryl.setup.later';
const ua = navigator.userAgent;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
const inApp = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|GSA\//.test(ua);   // in-app browsers cannot install or notify
const isSamsung = /SamsungBrowser/i.test(ua);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
const appUrl = () => new URL('../member/dashboard.html', import.meta.url).href;

// remember on the server that this member uses the installed app (once per phone)
export function noteInstalled() {
  if (!isStandalone() || store.get('ryl.installed.sent')) return;
  supabase.rpc('mark_app_installed').then(({ error }) => { if (!error) store.set('ryl.installed.sent', '1'); });
}

function sheet(title, html) {
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  scrim.innerHTML = `<div class="sheet setup-sheet" role="dialog" aria-modal="true" aria-labelledby="su-t"><span class="grab" aria-hidden="true"></span>
    <div class="sheet-h"><h2 id="su-t">${esc(title)}</h2><button class="iconbtn" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-b">${html}</div></div>`;
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(scrim);
  return { el: scrim, close };
}
const steps = (list) => `<ol class="su-steps">${list.map((s) => `<li><span>${s}</span></li>`).join('')}</ol>`;
const dots = '<b class="k">⋮</b>';

const openInChrome = () => `<div class="su-warn">${icon('alert-triangle')}<span>This page is open <b>inside ${/WhatsApp/.test(ua) ? 'WhatsApp' : /Instagram/.test(ua) ? 'Instagram' : /FBAN|FBAV/.test(ua) ? 'Facebook' : 'another app'}</b>. Apps can't be installed from here. Open it in ${isIOS ? 'Safari' : 'Chrome'} first.</span></div>
  ${steps([isIOS ? 'Tap the <b>Share</b> or <b>compass</b> button' : `Tap ${dots} at the top right`, `Tap <b>Open in ${isIOS ? 'Safari' : 'Chrome'}</b> (or "Open in browser")`, 'Log in there and come back to this card'])}
  <button class="btn btn-ghost btn-block" type="button" data-copy-link>${icon('copy')}Copy app link</button>`;

export function installHelp() {
  const body = inApp ? openInChrome()
    : isIOS ? steps(['Open this page in <b>Safari</b>', 'Tap the <b>Share</b> button <b class="k">□↑</b> at the bottom', 'Scroll and tap <b>Add to Home Screen</b> → <b>Add</b>', 'Open the <b>Deepak&#39;s 10X Life</b> icon from your home screen'])
    : isSamsung ? steps([`Tap the menu <b class="k">≡</b> at the bottom`, 'Tap <b>Add page to</b> → <b>Home screen</b>', 'Open the <b>Deepak&#39;s 10X Life</b> icon from your home screen'])
    : steps([`Tap ${dots} at the <b>top right</b> of Chrome`, 'Tap <b>Install app</b> or <b>Add to Home screen</b>', 'Tap <b>Install</b>', 'Open the <b>Deepak&#39;s 10X Life</b> icon from your home screen. Log in once there.']);
  const s = sheet('Install the app', `<p class="muted">No Play Store needed. Do this once, and the <b>Deepak&#39;s 10X Life</b> icon (Deepak sir's photo) comes on your home screen like any app.</p>${body}`);
  s.el.addEventListener('click', copyLink);
}

export function notifyHelp(state) {
  let body;
  if (inApp) body = openInChrome();
  else if (state === 'ios-install') body = `<p class="muted">On iPhone, notifications work only in the installed app.</p>${steps(['Install the app first (Share <b class="k">□↑</b> → Add to Home Screen)', 'Open the <b>Deepak&#39;s 10X Life</b> icon from your home screen', 'Tap <b>Allow</b> on this card'])}`;
  else if (state === 'blocked') {
    body = `<div class="su-warn">${icon('alert-triangle')}<span>Notifications were <b>blocked</b> on this phone earlier, so the app can't ask again. Turn them on like this:</span></div>
      ${isStandalone()
        ? steps(['Go to your home screen and <b>press and hold the Deepak&#39;s 10X Life icon</b>', 'Tap <b>App info</b> (ⓘ)', 'Tap <b>Notifications</b> → turn <b>on</b>', 'Come back here and tap <b>Check again</b>'])
        : steps([`Tap the small icon <b class="k">⚙</b> or <b class="k">🔒</b> on the left of the web address`, 'Tap <b>Permissions</b> → <b>Notifications</b> → <b>Allow</b>', 'Come back here and tap <b>Check again</b>'])}
      <p class="muted" style="font-size:13px">Can't find it? ${dots} → <b>Settings</b> → <b>Site settings</b> → <b>Notifications</b> → find <b>${esc(location.hostname)}</b> → <b>Allow</b>.</p>
      <button class="btn btn-gold btn-block" type="button" data-recheck>${icon('rotate-ccw')}Check again</button>`;
  } else body = `<p class="muted">This browser can't show notifications. Open the app in <b>Chrome</b> (Android) or install it on iPhone.</p><button class="btn btn-ghost btn-block" type="button" data-copy-link>${icon('copy')}Copy app link</button>`;
  const s = sheet('Turn on notifications', body);
  s.el.addEventListener('click', async (e) => {
    copyLink(e);
    const b = e.target.closest('[data-recheck]'); if (!b) return;
    const st = await pushState().catch(() => 'unsupported');
    if (Notification.permission === 'granted' || st === 'off') {
      try { await enablePush(); toast('Notifications turned on'); s.close(); document.dispatchEvent(new Event('ryl:setup')); }
      catch (err) { toast(err.message || 'Not allowed yet', 'bad'); }
    } else toast('Still blocked. Follow the steps above, then tap Check again.', 'bad');
  });
}

async function copyLink(e) {
  if (!e.target.closest('[data-copy-link]')) return;
  try { await navigator.clipboard.writeText(appUrl()); toast('Link copied. Paste it in Chrome.'); }
  catch { toast(appUrl(), 'info'); }
}

// Render the card into box. Returns true when something is still to do.
export async function renderSetup(box) {
  if (!box) return false;
  noteInstalled();
  const installed = isStandalone();
  const push = await pushState().catch(() => 'unsupported');
  const pushOn = push === 'on';
  if (installed && pushOn) { box.innerHTML = ''; return false; }
  const later = Number(store.get(LATER) || 0);
  if (later > Date.now() - 864e5) { box.innerHTML = ''; return true; }      // "Later" waits one day, then asks again
  const done = (installed ? 1 : 0) + (pushOn ? 1 : 0);
  const installBtn = installed ? `<span class="su-ok">${icon('check')}Done</span>`
    : canInstall() && !inApp ? `<button class="btn btn-gold btn-sm" data-su="install">Install</button>`
    : `<button class="btn btn-gold btn-sm" data-su="install-help">How?</button>`;
  const pushBtn = pushOn ? `<span class="su-ok">${icon('check')}On</span>`
    : push === 'off' && !inApp ? `<button class="btn btn-gold btn-sm" data-su="push">Allow</button>`
    : `<button class="btn btn-gold btn-sm" data-su="push-help" data-st="${esc(push)}">${push === 'blocked' ? 'Fix' : 'How?'}</button>`;
  box.innerHTML = `<section class="card setup-card" aria-labelledby="su-h">
    <div class="su-top"><b id="su-h">Finish setting up</b><small>${done} of 2 done</small></div>
    <div class="su-bar"><i style="width:${done * 50}%"></i></div>
    <div class="su-row ${installed ? 'ok' : ''}"><span class="su-n">1</span><div><b>Install the app</b><small>Deepak's 10X Life icon on your home screen. Opens in one tap.</small></div>${installBtn}</div>
    <div class="su-row ${pushOn ? 'ok' : ''}"><span class="su-n">2</span><div><b>Turn on notifications</b><small>${push === 'blocked' ? 'Blocked on this phone. Tap Fix to see how to allow.' : 'Evening reminder, coach answers and class updates.'}</small></div>${pushBtn}</div>
    <div class="su-foot"><button class="btn btn-ghost btn-sm" data-su="later">Later</button></div></section>`;
  return true;
}

// wire the buttons once
let current = null, listening = false;
export function wireSetup(box) {
  current = box;
  const redraw = () => renderSetup(current);
  if (!listening) {
    listening = true;
    ['ryl:installable', 'ryl:installed', 'ryl:setup'].forEach((ev) => document.addEventListener(ev, redraw));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') redraw(); });
  }
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-su]'); if (!b) return;
    const k = b.dataset.su;
    if (k === 'later') { store.set(LATER, String(Date.now())); box.innerHTML = ''; return; }
    if (k === 'install-help') return installHelp();
    if (k === 'push-help') return notifyHelp(b.dataset.st);
    if (k === 'install') { const r = await promptInstall(); if (r !== 'accepted' && r !== 'dismissed') installHelp(); return redraw(); }
    if (k === 'push') {
      b.disabled = true;
      try { await enablePush(); toast('Notifications turned on'); }
      catch (err) { if (Notification.permission === 'denied') notifyHelp('blocked'); else toast(err.message || 'Not allowed', 'bad'); }
      return redraw();
    }
  });
  return redraw();
}
