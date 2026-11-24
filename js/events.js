// Home: "Coming up" list (from EVENTS in js/site-content.js) and the event poster that opens
// full screen when the app is opened (once per app open, only until the event's last day).
import { COACH, EVENTS, waLink } from './site-content.js';
import { app } from './supabase.js';
import { icon, esc } from './ui.js';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const live = (e) => e.soon || (e.end && today() <= e.end);
const list = () => (EVENTS || []).filter(live);
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k) => { try { sessionStorage.setItem(k, '1'); } catch { /* ignore */ } } };

export function eventsHTML() {
  const L = list(); if (!L.length) return '';
  return `<section class="ev-sec" aria-labelledby="ev-h"><div class="sec-h"><h2 id="ev-h">Coming up</h2></div>
    <div class="ev-list">${L.map((e) => `<button type="button" class="card ev-card" data-ev="${esc(e.id)}">
      ${e.poster ? `<img src="${esc(app(e.poster))}" alt="" width="56" height="56" loading="lazy">` : `<img class="ev-face" src="${esc(app(COACH.face))}" alt="" width="56" height="56">`}
      <span class="ws-txt"><small class="${e.soon ? 'ev-soon' : ''}">${e.soon ? 'Coming soon' : esc(e.when)}</small><b>${esc(e.title)}</b><span>${esc(e.sub)}</span></span>
      <span class="ws-go" aria-hidden="true">${icon('chevron-right')}</span></button>`).join('')}</div></section>`;
}

// Full-screen poster with the booking button
export function openEvent(e) {
  if (!e) return;
  const scrim = document.createElement('div');
  scrim.className = 'ev-pop';
  scrim.innerHTML = `<div class="ev-box" role="dialog" aria-modal="true" aria-label="${esc(e.title)}">
    <button class="ev-x" type="button" data-close aria-label="Close">${icon('x')}</button>
    ${e.poster ? `<img src="${esc(app(e.poster))}" alt="${esc(e.title)}">` : `<div class="ev-noposter"><img src="${esc(app(COACH.face))}" alt=""><b>${esc(e.title)}</b><span>${esc(e.sub)}</span></div>`}
    <div class="ev-act">${e.soon ? `<p><b>Coming soon.</b> Dates will be shared in your group.</p>` : ''}
      ${e.whatsappText && !e.soon ? `<a class="btn btn-wa btn-block" href="${esc(waLink(e.whatsappText))}" target="_blank" rel="noopener">${icon('message-square')}${esc(e.cta || 'Book on WhatsApp')}</a>` : ''}
      <button class="btn btn-ghost btn-block" type="button" data-close>Close</button></div></div>`;
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  scrim.addEventListener('click', (ev) => { if (ev.target === scrim || ev.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(scrim);
  scrim.querySelector('.ev-x').focus();
}

export function wireEvents(root) {
  root?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ev]'); if (!b) return;
    openEvent(EVENTS.find((e) => e.id === b.dataset.ev));
  });
}

// Once each time the app is opened (not again when coming back to Home in the same visit)
export function popupOnOpen() {
  const e = list().find((x) => x.popup && !x.soon); if (!e) return;
  const k = 'ryl.ev.' + e.id; if (ss.get(k)) return;
  ss.set(k);
  const img = new Image(); img.onload = () => openEvent(e); img.src = app(e.poster);
}
