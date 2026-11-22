// Energy meter (fuel gauge) per tracker. Numbers come from the server (tracker_energy): the last 7 days
// count most, yesterday the most; today only lifts the needle; missed days pull it down.
// Zones: red Empty · orange Running low · yellow Half tank · light green Good · green Full tank.
import { supabase, app } from './supabase.js';

const ZONES = [
  { c: '#e8262b', f: '😞', name: 'Empty' },
  { c: '#f2711c', f: '🙁', name: 'Running low' },
  { c: '#f2b01e', f: '😐', name: 'Half tank' },
  { c: '#6fb83a', f: '🙂', name: 'Good' },
  { c: '#22a84a', f: '😄', name: 'Full tank' }
];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const zoneOf = (p) => ZONES[Math.max(0, Math.min(4, Math.floor((Number(p) || 0) / 20)))];

// Half-circle gauge. The needle is short (stays inside the coloured ring, never covers a face)
// and turns from E (left) to full (right); data-p holds the value it animates to.
export function gaugeSVG(p, { w = 300, mini = false } = {}) {
  const cx = w / 2, cy = w * 0.52, R = w * 0.44, r = w * 0.25, P = (a, rr) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  let s = `<svg class="eg-svg" viewBox="0 0 ${w} ${w * 0.6}" role="img" aria-label="Energy ${p == null ? 'not started' : p + '%'}">`;
  for (let i = 0; i < 5; i++) {
    const a0 = Math.PI + i * Math.PI / 5 + 0.015, a1 = Math.PI + (i + 1) * Math.PI / 5 - 0.015;
    const [x1, y1] = P(a0, R), [x2, y2] = P(a1, R), [x3, y3] = P(a1, r), [x4, y4] = P(a0, r);
    s += `<path d="M${x1},${y1}A${R},${R} 0 0 1 ${x2},${y2}L${x3},${y3}A${r},${r} 0 0 0 ${x4},${y4}Z" fill="${ZONES[i].c}"/>`;
    const [tx, ty] = P((a0 + a1) / 2, (R + r) / 2);
    s += `<text x="${tx}" y="${ty + w * 0.03}" font-size="${w * 0.085}" text-anchor="middle">${ZONES[i].f}</text>`;
  }
  // needle drawn pointing left (0%), turned by CSS to the value
  const L = r - w * 0.03, b = w * 0.03;
  s += `<g class="eg-needle" style="transform-origin:${cx}px ${cy}px" data-p="${p ?? 0}">
    <polygon points="${cx},${cy - b} ${cx - L},${cy} ${cx},${cy + b}" fill="#111" stroke="#111" stroke-width="${w * 0.008}" stroke-linejoin="round"/>
    <circle cx="${cx - L}" cy="${cy}" r="${w * 0.012}" fill="#111"/></g>
    <circle cx="${cx}" cy="${cy}" r="${w * 0.045}" fill="#fff" stroke="#111" stroke-width="${w * 0.025}"/>`;
  if (!mini) s += `<text x="${w * 0.07}" y="${w * 0.59}" fill="#c0262b" font-weight="800" font-size="${w * 0.07}">E</text><text x="${w * 0.88}" y="${w * 0.59}" font-size="${w * 0.065}">⛽</text>`;
  return s + '</svg>';
}

// Turn every needle inside root to its value (smoothly; jumps when the phone asks for less motion).
export function animateNeedles(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root?.querySelectorAll('.eg-needle').forEach((n) => { n.style.transform = `rotate(${Math.max(0, Math.min(100, Number(n.dataset.p) || 0)) * 1.8}deg)`; });
  }));
}

function line(e) {
  if (e.energy == null) return 'Tick your first habit to start the meter ⛽';
  const t = e.today_pct || 0;
  if (e.run >= 3) return `${e.run} days in a row. You are flying! 🔥`;
  if (e.missed >= 2 && !t) return `${e.missed} days missed. Tick a few habits today to fill up again 💪`;
  if (e.missed >= 2) return `Great start today! Keep going daily to fill the tank 💪`;
  if (e.energy >= 80) return 'Full tank. Keep it this way 🙌';
  if (!t) return 'Tick today\'s habits to push the needle up ⬆️';
  return 'Nice! Every day you tick, the needle climbs ⬆️';
}
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
function dayRow(days) {
  return `<div class="eg-days">${(days || []).map((d) => `<span title="${esc(d.d)}${d.p == null ? '' : `: ${d.p}%`}"><i style="background:${d.p == null ? 'var(--c-sunken, #e3e6df)' : zoneOf(d.p).c}"></i>${DAYS[new Date(d.d + 'T00:00:00Z').getUTCDay()]}</span>`).join('')}</div>`;
}

export function energyCardHTML(e) {
  const z = zoneOf(e.energy);
  return `<section class="card eg-card" aria-label="Energy meter">
    <div class="eg-h"><b>Energy meter</b><small>Last 7 days count most</small></div>
    ${gaugeSVG(e.energy)}
    <div class="eg-val" style="color:${e.energy == null ? 'var(--c-muted)' : z.c}">${e.energy == null ? 'Not started' : `${e.energy}% · ${z.name}${e.energy >= 80 ? ' ⛽' : ''}`}</div>
    <p class="eg-msg">${esc(line(e))}</p>${dayRow(e.days)}</section>`;
}

export function energyMiniHTML(e, href) {
  const z = zoneOf(e.energy);
  return `<a class="eg-mini" href="${esc(href)}" title="${esc(e.name)}: ${e.energy == null ? 'not started' : e.energy + '% ' + z.name}">
    ${gaugeSVG(e.energy, { w: 120, mini: true })}<b>${esc(String(e.name).split(' - ')[0])}</b>
    <span style="color:${e.energy == null ? 'var(--c-muted)' : z.c}">${e.energy == null ? '–' : e.energy + '%'}</span></a>`;
}

export async function loadEnergy(member = null) {
  const { data, error } = await supabase.rpc('tracker_energy', member ? { p_member: member } : {});
  if (error) throw error;
  return data || [];
}

// A row of small meters (Home for the member, member page for the coach)
export function energyRowHTML(list, hrefFor, title = 'My energy') {
  if (!list.length) return '';
  return `<section aria-label="${esc(title)}"><div class="sec-h"><h2>${esc(title)}</h2><small class="muted">Needle drops when days are missed</small></div>
    <div class="eg-row">${list.map((e) => energyMiniHTML(e, hrefFor(e))).join('')}</div></section>`;
}
export const trackerHref = (e) => app('member/tracker-detail.html?t=' + encodeURIComponent(e.slug));
