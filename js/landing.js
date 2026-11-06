// Landing page: icons, background, and a dashboard shortcut for signed-in visitors.
import { icon } from './icons.js';
import { stadium } from './stadium.js';
import { getSession, fetchProfile, homeFor } from './auth.js';
import { toggleTheme, currentTheme } from './theme.js';
import { COACH, CONTACT, TESTIMONIALS, WORKSHOP, waLink, workshopState, workshopDate } from './site-content.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

// ---- coach content (from js/site-content.js) ----
$('hero-coach').innerHTML = `<div class="hc-frame"><img src="${esc(COACH.photo)}" alt="${esc(COACH.name)}" width="342" height="548"></div>
  <figcaption><b>${esc(COACH.name)}</b><span>${esc(COACH.title)}</span></figcaption>`;
document.querySelector('.hero-eyebrow')?.insertAdjacentHTML('afterend', `<div class="hero-chip"><img src="${esc(COACH.face)}" alt="" width="40" height="40"><span><b>with ${esc(COACH.name)}</b><small>${esc(COACH.title)}</small></span></div>`);
document.querySelectorAll('[data-c="stories"]').forEach((el) => { el.textContent = COACH.successStories; });

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
stadium(document.getElementById('art-canvas'));
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
  for (const id of ['top-cta', 'main-cta']) {
    const a = document.getElementById(id);
    a.href = home; a.innerHTML = (id === 'main-cta' ? icon('layout-dashboard') : '') + 'Open my dashboard';
  }
  document.getElementById('second-cta').hidden = true;
}).catch(() => {});
