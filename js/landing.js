// Landing page: icons, background, and a dashboard shortcut for signed-in visitors.
import { icon } from './icons.js';
import { getSession, fetchProfile, homeFor } from './auth.js';
import { toggleTheme, currentTheme } from './theme.js';
import { COACH, CONTACT, TESTIMONIALS, WORKSHOP, waLink, workshopState, workshopDate } from './site-content.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

// ---- coach content (from js/site-content.js) ----
// Portrait inside a gold progress ring (the app's own ring), with floating glass chips.
$('hero-coach').innerHTML = `
  <svg class="hc-ring" viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="hcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1D597"/><stop offset="1" stop-color="#83C5A2"/></linearGradient></defs>
    <circle cx="100" cy="100" r="94" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="3"/>
    <circle class="hc-arc" cx="100" cy="100" r="94" fill="none" stroke="url(#hcg)" stroke-width="3.5" stroke-linecap="round" pathLength="100" stroke-dasharray="72 100" transform="rotate(-90 100 100)"/></svg>
  <div class="hc-photo"><img src="${esc(COACH.photo)}" alt="${esc(COACH.name)}" width="342" height="548"></div>
  <div class="hc-chip hc-stories"><b>${esc(COACH.successStories)}</b><span>success stories</span></div>
  <div class="hc-chip hc-tick" aria-hidden="true"><span class="ok">${icon('check')}</span><span><b>Habit done</b><small>+10 pts · instantly</small></span></div>
  <figcaption class="hc-name"><b>${esc(COACH.name)}</b><span>${esc(COACH.title)}</span></figcaption>`;

const ws = workshopState();
if (ws) {
  $('workshop-slot').innerHTML = `<section class="workshop" aria-label="Upcoming workshop">
    <div class="ws-top"><span class="ws-badge">${ws === 'live' ? 'Happening now' : 'Next workshop'}</span><span class="ws-days">${WORKSHOP.days}-day online workshop</span></div>
    <h2>${esc(WORKSHOP.title)}</h2>
    <p class="ws-ta" lang="ta">${esc(WORKSHOP.title_ta)}</p>
    <ul class="ws-facts"><li>${icon('calendar')}<span>${esc(workshopDate())} onwards</span></li><li>${icon('clock')}<span>${esc(WORKSHOP.time)}</span></li><li>${icon('smartphone')}<span>${esc(WORKSHOP.where)}</span></li></ul>
    <div class="ws-cta"><a class="btn btn-wa" href="${waLink(WORKSHOP.whatsappText)}" target="_blank" rel="noopener">${icon('message-square')}WhatsApp “${esc(WORKSHOP.whatsappText)}” to book</a>
      ${WORKSHOP.registerUrl ? `<a class="btn btn-ghost" href="${esc(WORKSHOP.registerUrl)}" target="_blank" rel="noopener">${icon('arrow-right')}Register & pay</a>` : ''}</div>
  </section>`;
}

$('coach-sec').innerHTML = `
  <div class="coach-card">
    <div class="cc-photo"><img src="${esc(COACH.photo)}" alt="" loading="lazy" width="342" height="548"></div>
    <div class="cc-body">
      <span class="eyebrow">Meet your coach</span>
      <h2 id="coach-h">${esc(COACH.name)}</h2>
      <p class="cc-title">${esc(COACH.title)} · ${esc(COACH.org)}</p>
      <p class="cc-ta" lang="ta">${esc(COACH.tagline_ta)}</p>
      <p class="cc-intro">${esc(COACH.intro)}</p>
      <div class="pillars">${COACH.pillars.map(([ic, t, d]) => `<div class="pillar"><span class="ic">${icon(ic)}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></div>`).join('')}</div>
      <div class="cc-proof"><b>${esc(COACH.successStories)}</b><span>success stories</span></div>
    </div>
  </div>
  <div class="awards" aria-label="Awards and recognition">${COACH.awards.map(([src, cap]) => `<figure><img src="${esc(src)}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`).join('')}</div>`;

$('voices').innerHTML = `<div class="sec-intro"><span class="eyebrow">In their words</span><h2 id="voices-h">What members say</h2><p>${esc(COACH.successStories)} success stories and counting.</p></div>
  <div class="voices">${TESTIMONIALS.map(([n, img, q]) => `<figure class="voice"><blockquote>“${esc(q)}”</blockquote>
    <figcaption><img src="${esc(img)}" alt="" loading="lazy" width="44" height="44"><b>${esc(n)}</b></figcaption></figure>`).join('')}</div>`;

$('community').innerHTML = `<figure class="comm"><img src="${esc(COACH.community)}" alt="Program members at a Millionaire Mindset event" loading="lazy">
  <figcaption><b>A community that grows together</b><span>Live events, workshops and a daily habit group.</span></figcaption></figure>`;

$('foot').insertAdjacentHTML('beforeend', `<div><b>${esc(COACH.org)}</b><span>${esc(COACH.name)}</span></div>
  <div class="foot-contact"><a href="${waLink()}" target="_blank" rel="noopener">${icon('message-square')}WhatsApp ${esc(CONTACT.phone)}</a>
    <a href="tel:+91${esc(CONTACT.phone)}">${icon('phone')}+91 ${esc(CONTACT.phone)}</a>
    <a href="mailto:${esc(CONTACT.email)}">${icon('mail')}${esc(CONTACT.email)}</a></div>`);
document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
// Theme toggle in the hero (the page itself follows Light/Dark below the hero).
const tb = document.getElementById('theme-btn');
const paintToggle = () => { const dark = currentTheme() === 'dark'; tb.innerHTML = icon(dark ? 'sun' : 'moon'); tb.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); };
if (tb) { paintToggle(); tb.addEventListener('click', () => { toggleTheme(); paintToggle(); }); }
// Logged-in visitors get a direct way back to their dashboard.
getSession().then(async (s) => {
  if (!s) return;
  const p = await fetchProfile(s.user.id).catch(() => null);
  if (!p?.is_active) return;
  const home = homeFor(p.role);
  const top = document.getElementById('top-cta');
  top.href = home; top.innerHTML = `${icon('layout-dashboard')}<span>Dashboard</span>`; top.setAttribute('aria-label', 'Open my dashboard');
  const main = document.getElementById('main-cta');
  main.href = home; main.innerHTML = `${icon('layout-dashboard')}Open my dashboard`;
  document.getElementById('second-cta').hidden = true;
}).catch(() => {});
