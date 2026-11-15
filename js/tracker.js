// Tracker list (member/trackers.html) and tracker detail (member/tracker-detail.html?t=slug).
// Marking goes only through the mark_activity() database function: today only, instant points,
// one row per activity per day, never negative.
import { supabase, app, activityImageUrl } from './supabase.js';
import { requireRole, friendlyError } from './auth.js';
import { $, $$, icon, esc, toast, memberNav, formatNumber, ringHTML, animateIn, memberTopbar } from './ui.js';
import { openTrackerSheet } from './point.js';
import { tickFx } from './fx.js';
import { signedUrls, mediaHTML } from './media.js';
import { isOfflineError, keepTick, forgetTick, pendingFor, autoSend } from './offline.js';

const page = document.body.dataset.page;
let offlineTold = false;
let pointKinds = new Map();
const COLOR = { wealth: 'var(--t-wealth)', conscious: 'var(--t-conscious)', karma: 'var(--t-karma)', champion: 'var(--t-champion)', couple: 'var(--t-couple)', mugilan: 'var(--t-mugilan)' };
const COVER = { wealth: 'wealth-01.webp', conscious: 'conscious-02.webp', karma: 'karma-01.webp', champion: 'champion-01.webp', couple: 'couple-cover.webp', mugilan: 'mugilan-cover.webp', nithilla: 'nithilla-cover.webp' };
const ICON = { wealth: 'gem', conscious: 'brain', karma: 'hand-heart', champion: 'target', couple: 'heart-handshake', mugilan: 'rocket' };
// trackers added later (e.g. Conscious Couple) use their own colour/icon from the database and a plain cover
const catOf = (slug) => cats.find((c) => c.slug === slug) || {};
const tColor = (slug) => COLOR[slug] || catOf(slug).color || 'var(--c-primary)';
const tIcon = (slug) => ICON[slug] || catOf(slug).icon || 'list-checks';
const coverImg = (slug, cls = '') => COVER[slug] ? `<img ${cls ? `class="${cls}" ` : ''}src="${app('assets/images/' + COVER[slug])}" alt="" loading="lazy">` : `<span class="cover-fb ${cls}" aria-hidden="true"></span>`;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ---- date helpers (ISO yyyy-mm-dd, IST day comes from the server) ----
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso) => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));
const dayNum = (iso) => Number(iso.slice(8, 10));
const fmtShort = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtLong = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthName = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

let me, today, cats = [], cat = null, acts = [];
const rows = new Map();          // `${activity_id}|${date}` -> checkin row
let view = 'week', weekStart = null;
const busy = new Set();
const lastTap = new Map();   // ignore accidental double taps on the same button

function chrome(current) {
  $('#top').innerHTML = memberTopbar(me.profile, me.user.email);
  document.body.insertAdjacentHTML('beforeend', memberNav(current));
}

function errorPanel(target, err, retry) {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span><b>Couldn't load your tracker</b>
    <span>${esc(friendlyError(err))}</span><button class="btn btn-ghost btn-sm" id="retry">${icon('rotate-ccw')}Try again</button></div>`;
  $('#retry', target).addEventListener('click', retry);
}

async function loadToday() {
  const { data, error } = await supabase.rpc('app_today');
  if (error) throw error;
  today = data;
}

async function loadCats() {
  const { data, error } = await supabase.from('tracker_categories').select('id, slug, name, tagline, color, icon, sort_order, show_locked').eq('is_active', true).order('sort_order');
  if (error) throw error;
  cats = data || [];
}

// ================= TRACKER LIST =================
async function renderList() {
  const main = $('#main');
  main.innerHTML = `<div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:120px"></div>
    <div class="tlist">${'<div class="skeleton" style="height:150px"></div>'.repeat(4)}</div>`;
  const [{ data: d, error }] = await Promise.all([supabase.rpc('get_my_dashboard'), loadCats().catch(() => {})]);
  if (error) return errorPanel(main, error, renderList);
  const done = d.done_today || 0, total = d.total_activities || 0;
  const miss = (d.trackers || []).reduce((n, t) => n + (t.not_done_today || 0), 0);
  const pct = total ? Math.round(100 * done / total) : 0;
  main.innerHTML = `
    <div class="page-h"><span class="date">${esc(fmtLong(d.today))}</span><h1>Track</h1><p>Choose a tracker and mark today's habits.</p></div>
    ${total ? '' : '<!--'}<section class="card card-pad today-sum" aria-label="Today across all trackers">
      ${ringHTML(pct, { size: 76, stroke: 8, mid: `${pct}%` })}
      <div class="txt"><b><span id="sum-done">${done}</span> of ${total} done today</b>
        <div class="counts"><span class="c-ok"><i></i>${done} done</span><span class="c-no"><i></i>${miss} not done</span><span class="c-left"><i></i>${Math.max(0, total - done - miss)} to mark</span></div></div>
      <span class="pts">+${formatNumber(d.today_points)}<small>pts today</small></span>
    </section>${total ? '' : '-->'}
    ${(d.trackers || []).length ? '' : `<div class="panel empty-state"><span class="ic">${icon('list-checks')}</span><b>Your trackers open soon</b><span>Your coach opens each tracker after the class that teaches it. You will get a notification.</span></div>`}
    <div class="tlist">${(d.trackers || []).map((t) => {
      const p = t.total ? Math.round(100 * t.done_today / t.total) : 0;
      const nd = t.not_done_today || 0, left = Math.max(0, t.total - t.done_today - nd);
      const state = t.total && t.done_today === t.total ? ['s-done', 'Complete'] : t.done_today || nd ? ['s-prog', 'In progress'] : ['s-none', 'Not started'];
      return `<a class="tcard" href="${app('member/tracker-detail.html?t=' + encodeURIComponent(t.slug))}" style="--tc:${tColor(t.slug)}">
        <div class="art">${coverImg(t.slug)}<span class="ic">${icon(tIcon(t.slug))}</span></div>
        <div class="body">
          <div class="row"><div><h3>${esc(t.name)}</h3><span class="state ${state[0]}">${state[1]}</span></div>${ringHTML(p, { size: 48, stroke: 5, mid: `${p}%` })}</div>
          <div class="pbar"><i data-w="${p}%"></i></div>
          <div class="counts"><span class="c-ok"><i></i><b>${t.done_today}</b> done</span><span class="c-no"><i></i><b>${nd}</b> not done</span><span class="c-left"><i></i><b>${left}</b> to mark</span></div>
        </div><span class="go" aria-hidden="true">${icon('chevron-right')}</span></a>`; }).join('')}</div>
    ${(() => { const open = new Set((d.trackers || []).map((t) => t.slug)); const locked = cats.filter((c) => c.show_locked && !open.has(c.slug));
      return locked.length ? `<div class="sec-h" style="margin-top:6px"><h2>Opens after the class</h2></div><div class="tlist">${locked.map((c) => `<a class="tcard is-locked" href="${app('member/tracker-detail.html?t=' + encodeURIComponent(c.slug))}" style="--tc:${tColor(c.slug)}">
        <div class="art">${coverImg(c.slug)}<span class="ic">${icon('lock')}</span></div>
        <div class="body"><div class="row"><div><h3>${esc(c.name)}</h3><span class="state s-none">${icon('lock')}Locked</span></div></div>
          <p class="lock-txt">Your coach opens this tracker after the class that teaches it.</p></div>
        <span class="go" aria-hidden="true">${icon('chevron-right')}</span></a>`).join('')}</div>` : ''; })()}
    <p class="hint-line">${icon('info')}<span>Tap a tracker, then ✓ for done or ✗ for not done. Only today can be marked. Unmarked habits count as not done at midnight, with no minus points.</span></p>`;
  animateIn(main);
}

// ================= TRACKER DETAIL =================
function statusOn(actId, date) {
  if (date > today) return 'future';
  if (date < me.profile.joined_on) return 'pre';
  const r = rows.get(`${actId}|${date}`);
  if (r) return r.voided_at ? 'void' : r.status === 'done' ? 'ok' : 'miss';
  return date < today ? 'miss' : 'none';
}

function dayCell(actId, date, i) {
  const s = statusOn(actId, date);
  const glyph = s === 'ok' ? icon('check', '') : s === 'miss' ? icon('x', '') : s === 'void' ? '!' : '';
  const label = { ok: 'done', miss: 'not done', void: 'removed by coach', none: 'not marked yet', future: 'upcoming', pre: 'before you joined' }[s];
  return `<span class="day d-${s} ${date === today ? 'today' : ''}" title="${DOW[i]} ${fmtShort(date)}: ${label}"><i>${glyph}</i>${DOW[i]}</span>`;
}

function cardHTML(a) {
  const r = rows.get(`${a.id}|${today}`);
  const st = r && !r.voided_at ? r.status : null;
  const voided = r?.voided_at;
  const thisWeek = weekStart === mondayOf(today);
  const img = activityImageUrl(a.image_path);
  return `<article class="act ${st === 'done' ? 'is-done' : st === 'not_done' ? 'is-miss' : ''} ${voided ? 'is-locked' : ''}" data-id="${a.id}">
    <div class="art">${icon(a.icon || 'circle-dot')}${img ? `<img src="${esc(img)}" alt="" loading="lazy" data-fallback>` : ''}
      <span class="no">${String(a.number).padStart(2, '0')}</span>${st === 'done' ? `<span class="stamp">${icon('check', 'icon')}</span>` : ''}
      ${thisWeek && !voided ? `<span class="ptag">${st === 'done' ? '+' + a.points : st === 'not_done' ? '0' : '+' + a.points} pts</span>` : ''}</div>
    <div class="body"><h3>${esc(a.default_name)}</h3>${a.description ? `<p class="desc">${esc(a.description)}</p>` : ''}</div>
    <div class="days">${Array.from({ length: 7 }, (_, i) => dayCell(a.id, addDays(weekStart, i), i)).join('')}</div>
    ${voided ? `<p class="void">${icon('alert-triangle', 'icon')} Your coach removed today's entry: ${esc(r.void_reason || '')}</p>`
      : thisWeek ? `<div class="mark" role="group" aria-label="${esc(a.default_name)} today">
        <button class="mk mk-ok" data-mark="done" aria-pressed="${st === 'done'}">${icon('check', '')}<span>Done</span></button>
        <button class="mk mk-no" data-mark="not_done" aria-pressed="${st === 'not_done'}">${icon('x', '')}<span>Not done</span></button></div>` : ''}
    ${thisWeek && !voided && st ? `<div class="foot">${r?.note ? `<span class="note">“${esc(r.note)}”</span>` : `<span>${r?.pending ? 'Saved on phone · sends when online' : st === 'done' ? 'Done today' : 'Not done today'}</span>`}
      <button data-note>${icon('pencil')}${r?.note ? 'Edit note' : 'Add note'}</button></div>` : ''}
  </article>`;
}

function todayBar() {
  const done = acts.filter((a) => rows.get(`${a.id}|${today}`)?.status === 'done' && !rows.get(`${a.id}|${today}`)?.voided_at).length;
  const pts = acts.reduce((s, a) => { const r = rows.get(`${a.id}|${today}`); return s + (r?.status === 'done' && !r.voided_at ? a.points : 0); }, 0);
  const pct = acts.length ? Math.round(100 * done / acts.length) : 0;
  return `${ringHTML(pct, { size: 44, stroke: 5, mid: `${pct}%` })}<div class="txt"><span><b>${done}</b>/${acts.length} done today</span>
      <div class="progress"><i style="width:${pct}%"></i></div></div>
    <span class="pts">+${pts} pts</span>`;
}

async function loadWeek() {
  const ids = acts.map((a) => a.id);
  const { data, error } = await supabase.from('daily_checkins')
    .select('id, activity_id, checkin_date, status, note, voided_at, void_reason')
    .eq('member_id', me.user.id).in('activity_id', ids)
    .gte('checkin_date', weekStart).lte('checkin_date', addDays(weekStart, 6));
  if (error) throw error;
  for (const k of [...rows.keys()]) { const d = k.split('|')[1]; if (d >= weekStart && d <= addDays(weekStart, 6)) rows.delete(k); }
  for (const r of data || []) rows.set(`${r.activity_id}|${r.checkin_date}`, r);
  overlayKept();
}
// ticks kept on the phone (no internet) show as marked until they are sent
function overlayKept() {
  for (const [id, st] of Object.entries(pendingFor(me.user.id, today))) {
    const k = `${id}|${today}`;
    if (st) rows.set(k, { ...(rows.get(k) || {}), activity_id: id, checkin_date: today, status: st, voided_at: null, pending: true }); else rows.delete(k);
  }
}

// ---- layout (cards / compact list) and Quick tick (one habit at a time) ----
let layout = (() => { try { return localStorage.getItem('ryl.layout') || 'grid'; } catch { return 'grid'; } })();
const isMarked = (a) => { const r = rows.get(`${a.id}|${today}`); return !!r && (!!r.status || !!r.voided_at); };
function quickStartHTML() {
  const left = acts.filter((a) => !isMarked(a)).length;
  return `<button class="qt-start" id="qt-start" type="button" ${left ? '' : 'data-alldone'}><span class="qs-ic">${icon(left ? 'play' : 'check-check')}</span>
    <span class="qs-tx"><b>${left ? 'Quick tick' : 'All marked for today'}</b><small>${left ? `${left} habit${left > 1 ? 's' : ''} left · one at a time, about 30 seconds` : 'Great work. Come back tomorrow.'}</small></span>${left ? icon('chevron-right') : ''}</button>`;
}
function refreshQuickStart() { const b = $('#qt-start'); if (b) b.outerHTML = quickStartHTML(); }

function quickTick() {
  const queue = acts.filter((a) => !isMarked(a));
  if (!queue.length) return toast('Every habit is marked for today.', 'info');
  let i = 0, nDone = 0, nMiss = 0, gained = 0;
  const scrim = document.createElement('div');
  scrim.className = 'qt'; scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-modal', 'true'); scrim.setAttribute('aria-label', 'Quick tick');
  document.body.appendChild(scrim); document.body.style.overflow = 'hidden';
  const close = () => { scrim.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); refreshQuickStart(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') answer('done'); if (e.key === 'ArrowLeft') answer('not_done'); };
  document.addEventListener('keydown', onKey);
  const doneCount = () => acts.filter((a) => rows.get(`${a.id}|${today}`)?.status === 'done').length;
  const draw = () => {
    if (i >= queue.length) return summary();
    const a = queue[i], img = activityImageUrl(a.image_path), marked = acts.filter(isMarked).length;
    scrim.innerHTML = `<div class="qt-top"><button class="iconbtn" data-qt-close aria-label="Close">${icon('x')}</button>
        <div class="qt-prog"><i style="width:${Math.round(100 * marked / acts.length)}%"></i></div><b class="qt-count">${marked}/${acts.length}</b></div>
      <div class="qt-card" id="qt-card" style="--tc:${tColor(cat.slug)}">
        <div class="qt-art">${icon(a.icon || 'circle-dot')}${img ? `<img src="${esc(img)}" alt="" data-fallback>` : ''}<span class="no">${String(a.number).padStart(2, '0')}</span><span class="ptag">+${a.points} pts</span>
          <span class="qt-stamp ok">${icon('check')}</span><span class="qt-stamp no">${icon('x')}</span></div>
        <div class="qt-body"><h2>${esc(a.default_name)}</h2>${a.description ? `<p>${esc(a.description)}</p>` : ''}<small>Did you do this today?</small></div>
      </div>
      <div class="qt-btns"><button class="qt-b no" data-qt="not_done" aria-label="Not done">${icon('x')}<span>Not done</span></button>
        <button class="qt-b ok" data-qt="done" aria-label="Done">${icon('check')}<span>Done</span></button></div>
      <div class="qt-foot"><span>Swipe → done · ← not done</span><button class="link" data-qt-skip>Skip</button></div>`;
    wireSwipe($('#qt-card', scrim));
  };
  const answer = (v) => {
    if (i >= queue.length) return;
    const a = queue[i], card = $('#qt-card', scrim), btn = scrim.querySelector(`[data-qt="${v}"]`);
    if (card) { card.classList.add(v === 'done' ? 'out-r' : 'out-l'); }
    if (v === 'done') { nDone++; gained += a.points; } else nMiss++;
    mark({ dataset: { id: a.id } }, v, btn, i === queue.length - 1 && acts.every((x) => x.id === a.id || isMarked(x)) && v === 'done');
    i++; setTimeout(draw, 260);
  };
  const summary = () => {
    const all = acts.every(isMarked), d = doneCount();
    scrim.innerHTML = `<div class="qt-top"><button class="iconbtn" data-qt-close aria-label="Close">${icon('x')}</button><div class="qt-prog"><i style="width:100%"></i></div><b class="qt-count">${acts.filter(isMarked).length}/${acts.length}</b></div>
      <div class="qt-sum"><span class="qt-sum-ic">${icon(nDone ? 'trophy' : 'sprout')}</span>
        <h2>${nDone ? (all && d === acts.length ? 'Perfect day! 🎉' : 'Well done!') : 'All marked'}</h2>
        <p>${nDone} done${nMiss ? ` · ${nMiss} not done` : ''} just now${gained ? ` · <b>+${gained} pts</b>` : ''}</p>
        <p class="muted">${d} of ${acts.length} ${esc(cat.name)} habits done today.</p>
        <button class="btn btn-gold btn-block" data-qt-close>Back to ${esc(cat.name)}</button></div>`;
  };
  function wireSwipe(card) {
    if (!card) return;
    let x0 = null, dx = 0;
    card.addEventListener('pointerdown', (e) => { x0 = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.classList.add('drag'); });
    card.addEventListener('pointermove', (e) => {
      if (x0 == null) return; dx = e.clientX - x0;
      card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      card.classList.toggle('lean-r', dx > 40); card.classList.toggle('lean-l', dx < -40);
    });
    const end = () => {
      if (x0 == null) return; x0 = null; card.classList.remove('drag');
      if (dx > 90) answer('done'); else if (dx < -90) answer('not_done');
      else { card.style.transform = ''; card.classList.remove('lean-r', 'lean-l'); }
    };
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
  }
  scrim.addEventListener('click', (e) => {
    if (e.target.closest('[data-qt-close]')) return close();
    if (e.target.closest('[data-qt-skip]')) { i++; return draw(); }
    const b = e.target.closest('[data-qt]'); if (b) answer(b.dataset.qt);
  });
  draw();
}

function renderWeek() {
  const minWeek = mondayOf(me.profile.joined_on > today ? today : me.profile.joined_on);
  const thisWeek = mondayOf(today);
  $('#t-body').innerHTML = `
    <div class="t-tools"><div class="weeknav">
      <button id="prev-w" aria-label="Previous week" ${weekStart <= minWeek ? 'disabled' : ''}>${icon('chevron-left')}</button>
      <span>${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 6))}</span>
      <button id="next-w" aria-label="Next week" ${weekStart >= thisWeek ? 'disabled' : ''}>${icon('chevron-right')}</button></div>
      ${weekStart !== thisWeek ? `<button class="btn btn-ghost btn-sm" id="this-w">Back to this week</button>` : ''}</div>
    ${weekStart === thisWeek ? quickStartHTML() : ''}
    <div class="legend-row"><div class="legend"><span><i style="background:var(--c-success)"></i>Done</span><span><i style="background:color-mix(in srgb, var(--c-danger) 35%, transparent)"></i>Not done (0 pts)</span><span><i style="border:1.5px solid var(--gold-hi)"></i>Today</span></div>
      <div class="t-view" role="group" aria-label="Layout"><button data-lay="grid" aria-pressed="${layout === 'grid'}" aria-label="Cards">${icon('grid-2x2')}</button><button data-lay="list" aria-pressed="${layout === 'list'}" aria-label="List">${icon('list-checks')}</button></div></div>
    <div class="acts ${layout === 'list' ? 'is-list' : ''}" id="acts">${acts.map(cardHTML).join('')}</div>
    ${weekStart !== thisWeek ? `<p class="muted" style="font-size:13px">Past weeks are view-only. Only today can be marked.</p>` : ''}`;
  $('#prev-w')?.addEventListener('click', () => shiftWeek(-7));
  $('#next-w')?.addEventListener('click', () => shiftWeek(7));
  $('#this-w')?.addEventListener('click', () => { weekStart = thisWeek; showWeek(); });
}

async function showWeek() {
  $('#t-body').innerHTML = `<div class="acts">${acts.map(() => '<div class="skeleton" style="aspect-ratio:3/4"></div>').join('')}</div>`;
  try { await loadWeek(); renderWeek(); } catch (e) { errorPanel($('#t-body'), e, showWeek); }
}
function shiftWeek(n) { weekStart = addDays(weekStart, n); showWeek(); }

async function showMonth() {
  const body = $('#t-body');
  body.innerHTML = `<div class="skeleton" style="height:320px"></div>`;
  const first = today.slice(0, 8) + '01';
  const { data, error } = await supabase.from('daily_checkins').select('checkin_date, status, voided_at')
    .eq('member_id', me.user.id).in('activity_id', acts.map((a) => a.id)).gte('checkin_date', first).lte('checkin_date', today);
  if (error) return errorPanel(body, error, showMonth);
  const perDay = {};
  for (const r of data || []) if (r.status === 'done' && !r.voided_at) perDay[r.checkin_date] = (perDay[r.checkin_date] || 0) + 1;
  const offset = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
  let cells = '<span class="dow">M</span><span class="dow">T</span><span class="dow">W</span><span class="dow">T</span><span class="dow">F</span><span class="dow">S</span><span class="dow">S</span>';
  for (let i = 0; i < offset; i++) cells += '<div class="mcell empty"></div>';
  let sum = 0, counted = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = today.slice(0, 8) + String(d).padStart(2, '0');
    const fut = iso > today, pre = iso < me.profile.joined_on;
    const pct = acts.length ? Math.round(100 * (perDay[iso] || 0) / acts.length) : 0;
    if (!fut && !pre) { sum += pct; counted++; }
    const lvl = fut || pre ? '' : pct >= 85 ? 'l4' : pct >= 60 ? 'l3' : pct >= 30 ? 'l2' : 'l1';
    cells += `<div class="mcell ${lvl} ${iso === today ? 'today' : ''} ${fut ? 'fut' : ''}" title="${fmtShort(iso)}${fut || pre ? '' : ': ' + pct + '% done'}"><span>${d}</span>${fut || pre ? '' : `<span class="pct">${pct}%</span>`}</div>`;
  }
  body.innerHTML = `<section class="panel month"><div class="section-h"><h2 style="font-size:20px">${esc(monthName(today))}</h2>
    <span class="eyebrow">Avg ${counted ? Math.round(sum / counted) : 0}% done</span></div><div class="month-grid">${cells}</div></section>
    <div class="legend"><span><i style="background:color-mix(in srgb, var(--c-success) 50%, transparent)"></i>85%+</span><span><i style="background:color-mix(in srgb, var(--c-success) 25%, transparent)"></i>60–84%</span><span><i style="background:color-mix(in srgb, var(--c-warning) 30%, transparent)"></i>30–59%</span><span><i style="background:color-mix(in srgb, var(--c-danger) 25%, transparent)"></i>under 30%</span></div>`;
}

async function showHistory() {
  const body = $('#t-body');
  body.innerHTML = `<div class="skeleton" style="height:320px"></div>`;
  const { data, error } = await supabase.from('daily_checkins').select('activity_id, checkin_date, status, note, voided_at, void_reason, updated_at')
    .eq('member_id', me.user.id).in('activity_id', acts.map((a) => a.id))
    .order('checkin_date', { ascending: false }).order('updated_at', { ascending: false }).limit(60);
  if (error) return errorPanel(body, error, showHistory);
  const byId = Object.fromEntries(acts.map((a) => [a.id, a]));
  if (!data?.length) {
    body.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('history')}</span><b>No entries yet</b><span>Your ✓ and ✗ marks for this tracker will appear here.</span></div>`;
    return;
  }
  body.innerHTML = `<section class="panel history">${data.map((r) => {
    const a = byId[r.activity_id];
    const pill = r.voided_at ? '<span class="pill void">Removed</span>' : r.status === 'done' ? '<span class="pill ok">Done</span>' : '<span class="pill miss">Not done</span>';
    const detail = r.voided_at ? `Coach: ${r.void_reason || ''}` : r.status === 'done' ? `+${a?.points ?? 10} pts` : '0 pts';
    return `<div class="hrow"><div><b>${esc(a?.default_name || 'Activity')}</b><small>${esc(fmtLong(r.checkin_date))} · ${esc(detail)}${r.note ? ` · “${esc(r.note)}”` : ''}</small></div>${pill}</div>`;
  }).join('')}</section><p class="muted" style="font-size:13px">Showing your latest ${data.length} entries. Days you did not mark are not listed.</p>`;
}

function setView(v) {
  view = v;
  $$('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  if (v === 'week') showWeek(); else if (v === 'month') showMonth(); else showHistory();
}

async function mark(card, value, fxBtn = null, fxAll = false) {
  const id = card.dataset.id;
  if (busy.has(id)) return;
  const tapKey = `${id}|${value}`, now = Date.now();
  if (now - (lastTap.get(tapKey) || 0) < 700) return;
  lastTap.set(tapKey, now);
  const key = `${id}|${today}`;
  const before = rows.get(key);
  const current = before && !before.voided_at ? before.status : null;
  const next = current === value ? null : value;
  const a = acts.find((x) => x.id === id);

  // optimistic update
  if (next) rows.set(key, { ...(before || {}), activity_id: id, checkin_date: today, status: next, voided_at: null });
  else rows.delete(key);
  busy.add(id);
  refreshCard(id, true);
  if (next) {   // instant reward: chime, buzz, pop, "+10"
    const c = $(`.act[data-id="${id}"]`), leftNow = acts.filter((x) => !rows.get(`${x.id}|${today}`)).length;
    if (next === 'done') { c?.classList.add('just-done'); setTimeout(() => c?.classList.remove('just-done'), 500); }
    tickFx(fxBtn || c?.querySelector(`[data-mark="${next}"]`), { kind: next === 'done' ? (leftNow === 0 || fxAll ? 'all' : 'done') : 'miss', points: next === 'done' ? a.points : 0 });
  }

  const { data, error } = await supabase.rpc('mark_activity', { p_activity_id: id, p_status: next, p_note: null });
  busy.delete(id);
  if (error && isOfflineError(error)) {
    // no internet: keep the tick on the phone, it is sent as soon as the phone is online
    keepTick(me.user.id, today, id, next);
    if (next) rows.set(key, { ...rows.get(key), pending: true });
    refreshCard(id);
    if (!offlineTold) { offlineTold = true; toast('No internet. Your ticks are saved on this phone and will be sent when you are back online.', 'info'); }
    return;
  }
  if (error) {
    lastTap.delete(tapKey);   // let the member retry straight away
    if (before) rows.set(key, before); else rows.delete(key);
    refreshCard(id);
    if (/removed today/i.test(error.message)) { await loadWeek().catch(() => {}); renderWeek(); }
    if (error.message && /log in/i.test(error.message)) return toast('Your session has ended. Please log in again.', 'bad');
    return toast(friendlyError(error), 'bad');
  }
  forgetTick(me.user.id, id);
  if (data?.date && data.date !== today) { toast('A new day has started. Reloading…', 'info'); return setTimeout(() => location.reload(), 900); }
  refreshCard(id);
  const left = acts.filter((x) => !rows.get(`${x.id}|${today}`)).length;
  // no pop-up per tick (it covered the next card's buttons): the card turns green and the top bar adds the points.
  // Screen readers still hear it; the only pop-up is when the whole tracker is finished.
  announce(next === 'done' ? `${a.default_name} done, plus ${a.points} points` : next === 'not_done' ? `${a.default_name}: not done` : `${a.default_name} cleared`);
  if (next === 'done' && left === 0) toast('Tracker complete for today! 🎉');
}

function refreshCard(id, pending = false) {
  const old = $(`.act[data-id="${id}"]`);
  if (!old) return;
  const a = acts.find((x) => x.id === id);
  old.outerHTML = cardHTML(a);
  if (pending) $$(`.act[data-id="${id}"] .mk`).forEach((b) => { b.disabled = true; });
  refreshQuickStart();
  const bar = $('#today-bar'), oldFg = bar.querySelector('.fg');
  const prev = oldFg ? oldFg.style.strokeDashoffset : '';
  bar.innerHTML = todayBar();
  const fg = bar.querySelector('.fg'); if (fg && prev) fg.style.strokeDashoffset = prev;
  animateIn(bar);
}

function noteDialog(card) {
  const id = card.dataset.id;
  const r = rows.get(`${id}|${today}`);
  const a = acts.find((x) => x.id === id);
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<form class="dialog note-dialog" role="dialog" aria-modal="true" aria-labelledby="nd-t">
    <h2 id="nd-t">${esc(a.default_name)}</h2><p class="muted" style="font-size:14px">A short note about what you did today. Your coach can read it.</p>
    <label class="visually-hidden" for="nd-text">Note</label>
    <textarea id="nd-text" maxlength="300" placeholder="e.g. Woke at 5:10 and stretched for 10 minutes">${esc(r?.note || '')}</textarea>
    <div class="row-between"><span class="muted" id="nd-count" style="font-size:12px"></span></div>
    <div class="actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-gold" type="submit">Save note</button></div></form>`;
  document.body.appendChild(scrim);
  const ta = $('#nd-text', scrim), count = $('#nd-count', scrim);
  const upd = () => { count.textContent = `${ta.value.length}/300`; };
  upd(); ta.addEventListener('input', upd); ta.focus();
  const close = () => scrim.remove();
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  scrim.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter || scrim.querySelector('[type=submit]');
    btn.disabled = true;
    const { error } = await supabase.rpc('mark_activity', { p_activity_id: id, p_status: r.status, p_note: ta.value.trim() || null });
    btn.disabled = false;
    if (error) return toast(friendlyError(error), 'bad');
    rows.set(`${id}|${today}`, { ...r, note: ta.value.trim() || r.note || null });
    close(); refreshCard(id); toast('Note saved');
  });
}

async function renderDetail() {
  const main = $('#main');
  const slug = new URLSearchParams(location.search).get('t') || 'wealth';
  cat = cats.find((c) => c.slug === slug);
  if (!cat) {
    main.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('list-checks')}</span><b>This tracker is not open for you yet</b>
      <span>Pick one of your trackers.</span><a class="btn btn-gold btn-sm" href="${app('member/trackers.html')}">See all trackers</a></div>`;
    return;
  }
  document.title = `${cat.name} · Redesign Your Life`;
  const { data, error } = await supabase.from('activities').select('id, number, default_name, description, image_path, icon, points')
    .eq('category_id', cat.id).eq('is_active', true).order('number');
  if (error) return errorPanel(main, error, renderDetail);
  acts = data || [];
  if (!acts.length && cat.show_locked) return renderLocked(main);
  // which points have the coach's audio / video / pictures (badge on the card)
  pointKinds = new Map();
  if (acts.length) {
    const { data: pm } = await supabase.from('activity_media').select('activity_id, kind').in('activity_id', acts.map((x) => x.id));
    for (const r of pm || []) { if (!pointKinds.has(r.activity_id)) pointKinds.set(r.activity_id, new Set()); pointKinds.get(r.activity_id).add(r.kind); }
  }
  weekStart = mondayOf(today);
  main.style.setProperty('--tc', tColor(cat.slug));
  main.innerHTML = `
    <header class="t-head">
      ${coverImg(cat.slug, 'cover')}
      <div class="inner">
        <div class="crumbs"><a href="${app('member/dashboard.html')}">Home</a>${icon('chevron-right')}<a href="${app('member/trackers.html')}">Track</a></div>
        <div class="title"><span class="ic">${icon(tIcon(cat.slug))}</span><div><h1>${esc(cat.name)}</h1>
          <small><span class="n">${acts.length}</span> daily activities</small></div></div>
        ${cat.tagline ? `<p class="tagline">${esc(cat.tagline)}</p>` : ''}
      </div>
    </header>
    <nav class="t-switch" aria-label="Trackers">${cats.map((c) => `<a href="${app('member/tracker-detail.html?t=' + encodeURIComponent(c.slug))}" ${c.slug === cat.slug ? 'aria-current="page"' : ''} style="--tc:${tColor(c.slug)}"><i></i>${esc(c.name)}</a>`).join('')}</nav>
    <button class="card t-notes" id="t-notes" type="button"><span class="tn-ic">${icon('book-open')}</span>
      <span class="tn-tx"><b>Notes · Audio · Ask</b><small id="tn-sub">Coach's notes for all ${acts.length} habits, your real-life notes and questions</small></span>
      <i class="dot" id="tn-dot" hidden aria-label="Coach added notes"></i>${icon('chevron-right')}</button>
    <div class="today-bar" id="today-bar"></div>
    <div class="seg" role="tablist" aria-label="View"><button role="tab" data-view="week" aria-selected="true">Week</button><button role="tab" data-view="month" aria-selected="false">Month</button><button role="tab" data-view="history" aria-selected="false">History</button></div>
    <div id="t-body" class="stack" style="gap:14px"></div>`;
  $('#today-bar').innerHTML = todayBar(); animateIn($('#today-bar'));
  if (!acts.length) {
    $('#t-body').innerHTML = `<div class="panel empty-state"><span class="ic">${icon('list-checks')}</span><b>No activities in this tracker yet</b><span>Your coach will add them soon.</span></div>`;
    return;
  }
  await showWeek();
  $('#today-bar').innerHTML = todayBar(); animateIn($('#today-bar'));
  loadClassMaterials();
  main.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]'); if (v) return setView(v.dataset.view);
    const m = e.target.closest('[data-mark]'); if (m) return mark(m.closest('.act'), m.dataset.mark);
    const n = e.target.closest('[data-note]'); if (n) return noteDialog(n.closest('.act'));
    if (e.target.closest('#t-notes')) return openTrackerSheet(cat, acts, me.user.id, { color: tColor(cat.slug) });
    if (e.target.closest('#qt-start')) return quickTick();
    const ly = e.target.closest('[data-lay]');
    if (ly) { layout = ly.dataset.lay; try { localStorage.setItem('ryl.layout', layout); } catch { /* ignore */ }
      $('#acts')?.classList.toggle('is-list', layout === 'list'); $$('[data-lay]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lay === layout))); return; }
  });
  // New day while the app was in the background → refresh.
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    const prev = today;
    try { await loadToday(); } catch { return; }
    if (today !== prev) { weekStart = mondayOf(today); if (view === 'week') showWeek(); else setView(view); }
  });
}

function announce(msg) {
  let el = document.getElementById('sr-live');
  if (!el) { el = document.createElement('div'); el.id = 'sr-live'; el.className = 'visually-hidden'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30);
}

// Broken activity image → show the icon underneath (no inline handlers, so the CSP can stay strict).
document.addEventListener('error', (e) => { if (e.target.matches?.('img[data-fallback]')) e.target.remove(); }, true);

// how much the coach has added for this tracker (whole-tracker materials + each habit's audio/pictures) → line on the Notes button
async function loadClassMaterials() {
  const n = (await supabase.from('activity_media').select('id', { count: 'exact', head: true }).eq('category_id', cat.id)).count || 0;
  const per = [...pointKinds.values()].reduce((s, k) => s + k.size, 0);
  if (!$('#t-notes') || !(n + per)) return;
  const audio = [...pointKinds.values()].some((k) => k.has('audio'));
  $('#tn-sub').textContent = `${audio ? 'Audio, ' : ''}notes and pictures from your coach · your notes and questions`;
  $('#tn-dot').hidden = false;
}

// a program tracker the coach has not opened for this member yet: name + "opens after the class" only
async function renderLocked(main) {
  main.style.setProperty('--tc', tColor(cat.slug));
  main.innerHTML = `
    <header class="t-head">${coverImg(cat.slug, 'cover')}
      <div class="inner"><div class="crumbs"><a href="${app('member/dashboard.html')}">Home</a>${icon('chevron-right')}<a href="${app('member/trackers.html')}">Track</a></div>
        <div class="title"><span class="ic">${icon('lock')}</span><div><h1>${esc(cat.name)}</h1><small>Locked</small></div></div>
        ${cat.tagline ? `<p class="tagline">${esc(cat.tagline)}</p>` : ''}</div></header>
    <div class="panel lock-banner">${icon('lock')}<div><b>Opens after the class</b><span>Your coach opens this tracker after the class that teaches it. You will get a notification, then you can start ticking.</span></div></div>`;
}

// ---------------- boot ----------------
(async () => {
  try {
    me = await requireRole(['member']);
    chrome('trackers');
    await loadToday();
    // send ticks kept while offline (now, when the phone comes back online, and when the app is reopened)
    await autoSend(me.user.id, (r) => {
      if (r.sent) toast(`${r.sent} saved tick${r.sent > 1 ? 's' : ''} sent ✓`);
      if (r.stale) toast(`${r.stale} tick${r.stale > 1 ? 's' : ''} saved offline yesterday could not be sent (only today's habits can be ticked).`, 'info');
      offlineTold = false;
      if (page === 'member-tracker' && acts.length) loadWeek().then(renderWeek).catch(() => {});
    }).catch(() => {});
    if (page === 'member-trackers') await renderList();
    if (page === 'member-tracker') { await loadCats(); await renderDetail(); }
  } catch (err) {
    document.body.classList.remove('guarding');
    errorPanel($('#main'), err, () => location.reload());
  }
})();
