// Member Home Dashboard (Redesign 2.0) and Profile page.
// Every number on the dashboard comes from the database:
//   get_my_dashboard()  — points, rank, streak, today's totals, weekly %, trackers, badges
//   get_my_streaks()    — current + longest streak (read-only, own rows)
//   activities / tracker_categories / daily_checkins / notifications — own rows via RLS
// Ticking goes only through mark_activity() (today only, server-side points), exactly like the tracker page.
import { supabase, app, activityImageUrl } from './supabase.js';
import { requireRole, signOut, updatePassword, friendlyError, ROLE_LABEL } from './auth.js';
import { $, $$, icon, esc, toast, withBusy, setFieldError, wirePasswordToggles, memberNav, brandHTML,
         initials, firstName, formatDate, formatToday, formatNumber, PHONE_RE, validatePassword } from './ui.js';
import { toggleTheme, currentTheme, getThemePref, setThemePref } from './theme.js';

const page = document.body.dataset.page;
const TRACKER_COLOR = { wealth: 'var(--t-wealth)', conscious: 'var(--t-conscious)', karma: 'var(--t-karma)', champion: 'var(--t-champion)' };
const TRACKER_ICON = { wealth: 'gem', conscious: 'brain', karma: 'hand-heart', champion: 'target' };
const STREAK_BADGES = [['streak_7', 7], ['consistency_30', 30], ['transformation_60', 60], ['champion_90', 90]];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COLLAPSED = 6;
const PREF_KEY = 'ryl.dash.tracker';

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (iso) => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

function avatarHTML(profile, email, cls = 'avatar') {
  return profile.avatar_url
    ? `<span class="${cls}"><img src="${esc(profile.avatar_url)}" alt=""></span>`
    : `<span class="${cls}" aria-hidden="true">${esc(initials(profile.full_name, email))}</span>`;
}

function errorPanel(target, err, retry, title = "Couldn't load your data") {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span>
    <b>${esc(title)}</b><span>${esc(friendlyError(err))}</span>
    <button class="btn btn-ghost btn-sm" data-retry>${icon('rotate-ccw')}Try again</button></div>`;
  $('[data-retry]', target).addEventListener('click', retry);
}

// Circular progress (SVG). pct 0–100. The ring animates from 0 on first paint.
function ringHTML(pct, { size = 120, stroke = 12, mid = '', gradient = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<div class="pring" style="--size:${size}px" role="img" aria-label="${Math.round(pct)}% complete">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${gradient}
      <circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-off="${off.toFixed(2)}"/></svg>
    <div class="mid">${mid}</div></div>`;
}
function animateRings(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.pring .fg[data-off]', root).forEach((el) => { el.style.strokeDashoffset = el.dataset.off; });
    $$('[data-w]', root).forEach((el) => { el.style.width = el.dataset.w; });
    $$('[data-h]', root).forEach((el) => { el.style.height = el.dataset.h; });
  }));
}
function setRing(el, pct) {
  const fg = el?.querySelector('.fg'); if (!fg) return;
  const c = Number(fg.getAttribute('stroke-dasharray'));
  fg.style.strokeDashoffset = (c * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(2);
  el.setAttribute('aria-label', `${Math.round(pct)}% complete`);
}

// =====================================================================
// DASHBOARD
// =====================================================================
const S = {
  profile: null, user: null, d: null, streaks: null, today: null,
  cats: [], acts: [], rows: new Map(), week: new Map(), unread: 0,
  tracker: null, expanded: false, busy: new Set(), lastTap: new Map()
};

function greeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Welcome back';
}
function message(pct, done) {
  if (!done) return "A fresh start. Tick your first habit and the day begins.";
  if (pct >= 100) return 'Every habit done today. Champion work!';
  if (pct >= 75) return 'Almost there. Finish strong today.';
  if (pct >= 50) return "More than halfway. Keep going, you're on a roll.";
  if (pct >= 25) return "Keep going! You're building a better version of yourself.";
  return 'Good start. Small habits add up to a big transformation.';
}

function header() {
  const dark = currentTheme() === 'dark';
  $('#top').innerHTML = `<div class="dash-top">${brandHTML(app('member/dashboard.html'))}
    <div class="actions">
      <button class="iconbtn theme-btn" id="theme-btn" type="button" aria-label="${dark ? 'Switch to light mode' : 'Switch to dark mode'}" title="${dark ? 'Light mode' : 'Dark mode'}">${icon(dark ? 'sun' : 'moon')}</button>
      <button class="iconbtn" id="bell-btn" type="button" aria-label="Notifications" aria-haspopup="dialog">${icon('bell')}<span class="count" id="bell-count" hidden></span></button>
      <a class="avatar-link" href="${app('member/profile.html')}" aria-label="My profile">${avatarHTML(S.profile, S.user.email)}</a>
    </div></div>`;
  $('#theme-btn').addEventListener('click', () => toggleTheme());
  $('#bell-btn').addEventListener('click', openNotifications);
}
document.addEventListener('themechange', () => {
  const b = $('#theme-btn'); if (!b) return;
  const dark = currentTheme() === 'dark';
  b.innerHTML = icon(dark ? 'sun' : 'moon');
  b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  b.title = dark ? 'Light mode' : 'Dark mode';
});

function skeleton() {
  $('#main').innerHTML = `
    <div class="hello"><span class="date">${esc(formatToday())}</span><h1>${esc(greeting())}, ${esc(firstName(S.profile.full_name, S.user.email))}</h1></div>
    <div class="dash" aria-busy="true"><div class="dash-col">
      <div class="skeleton" style="height:236px;border-radius:var(--r-xl)"></div>
      <div class="tk-grid">${'<div class="skeleton" style="height:132px"></div>'.repeat(4)}</div>
      <div class="skeleton" style="height:320px"></div></div>
      <div class="dash-col dash-side"><div class="skeleton" style="height:260px"></div><div class="skeleton" style="height:200px"></div></div></div>`;
}

// ---------- derived numbers (own rows only; points always come from the server) ----------
function todayState(a) {
  const r = S.rows.get(a.id);
  if (!r) return 'none';
  if (r.voided_at) return 'locked';
  return r.status === 'done' ? 'done' : 'miss';
}
function trackerStats(cat) {
  const list = S.acts.filter((a) => a.category_id === cat.id);
  let done = 0, miss = 0;
  for (const a of list) { const st = todayState(a); if (st === 'done') done++; else if (st === 'miss') miss++; }
  return { total: list.length, done, miss, left: list.length - done - miss };
}

// ---------- sections ----------
function heroHTML() {
  const d = S.d, total = d.total_activities || 0, done = d.done_today || 0;
  const pct = total ? Math.round(100 * done / total) : 0;
  const grad = `<defs><linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F1D597"/><stop offset="1" stop-color="#83C5A2"/></linearGradient></defs>`;
  const mv = d.rank_movement || 0;
  const rank = d.rank ? `#${d.rank}${mv > 0 ? ` <span style="font-size:.6em;color:#8FE0B5">▲${mv}</span>` : mv < 0 ? ` <span style="font-size:.6em;color:#F5A3A3">▼${-mv}</span>` : ''}` : '–';
  return `<section class="hero-card" id="hero" aria-label="Today's progress">
    <div class="hero-main">
      ${ringHTML(pct, { size: 128, stroke: 12, gradient: grad, mid: `<div><b id="hero-pct">${pct}%</b><small>Today</small></div>` })}
      <div class="hero-txt"><span class="eyebrow">Today's progress</span>
        <h2 id="hero-count">${done} of ${total} activities completed</h2>
        <p id="hero-msg">${esc(message(pct, done))}</p></div>
    </div>
    <div class="hero-stats">
      <div class="hs pts"><small>${icon('coins')}Today</small><b id="hero-pts">+${formatNumber(d.today_points)}</b></div>
      <div class="hs streak"><small>${icon('flame')}Streak</small><b id="hero-streak">${d.streak} ${d.streak === 1 ? 'day' : 'days'}</b></div>
      <div class="hs"><small>${icon('trophy')}Rank</small><b id="hero-rank">${rank}</b></div>
    </div>
    <div class="hero-cta">${pct >= 100
      ? `<a class="btn" href="${app('member/progress.html')}">${icon('trending-up')}See my progress</a>`
      : `<a class="btn" href="#today" id="hero-go">${icon('check-circle-2')}${done ? "Continue today's habits" : 'Start today\'s habits'}</a>`}</div>
  </section>`;
}

function trackersHTML() {
  return `<section aria-labelledby="tk-h"><div class="sec-h"><h2 id="tk-h">Habit trackers</h2>
      <a href="${app('member/trackers.html')}">All trackers${icon('chevron-right')}</a></div>
    <div class="tk-grid" id="tk-grid">${S.cats.map(trackerCard).join('')}</div></section>`;
}
function trackerCard(c) {
  const t = trackerStats(c);
  const pct = t.total ? Math.round(100 * t.done / t.total) : 0;
  const state = t.total && t.done === t.total ? ['s-done', 'Complete'] : t.done || t.miss ? ['s-prog', 'In progress'] : ['s-none', 'Not started'];
  return `<a class="tk" data-slug="${esc(c.slug)}" href="${app('member/tracker-detail.html?t=' + encodeURIComponent(c.slug))}" style="--tc:${TRACKER_COLOR[c.slug] || 'var(--c-primary)'}">
    <div class="top"><span class="ic">${icon(TRACKER_ICON[c.slug] || 'list-checks')}</span>${ringHTML(pct, { size: 40, stroke: 5, mid: `${pct}%` })}</div>
    <h3>${esc(c.name)}</h3>
    <div class="pbar"><i data-w="${pct}%"></i></div>
    <div class="meta"><span><b>${t.done}</b>/${t.total} done</span><span class="state ${state[0]}">${state[1]}</span></div></a>`;
}

function activitiesHTML() {
  return `<section id="today" aria-labelledby="act-h" tabindex="-1" style="scroll-margin-top:16px"><div class="sec-h"><h2 id="act-h">Today's activities</h2>
      <a href="${app('member/trackers.html')}">Full list${icon('chevron-right')}</a></div>
    <div class="chip-row" role="toolbar" aria-label="Choose a tracker" id="chips"></div>
    <div id="act-list"></div>
    <p class="muted" style="font-size:12.5px;margin-top:10px">Tap ✓ when done (+points at once) or ✗ if not done (0 points, never minus). Tap again to undo. Only today can be marked.</p></section>`;
}
function chipsHTML() {
  return S.cats.map((c) => {
    const t = trackerStats(c);
    return `<button class="fchip" type="button" data-cat="${esc(c.slug)}" aria-pressed="${S.tracker === c.slug}" style="--tc:${TRACKER_COLOR[c.slug] || 'var(--c-primary)'}">
      <i></i>${esc(c.name)}<span class="c">${t.done}/${t.total}</span></button>`;
  }).join('');
}
function rowHTML(a) {
  const st = todayState(a), r = S.rows.get(a.id);
  const img = activityImageUrl(a.image_path);
  const cat = S.cats.find((c) => c.id === a.category_id);
  const meta = st === 'done' ? `<span><span class="pts">Done · +${a.points} pts</span></span>`
    : st === 'miss' ? `<span>Not done · 0 pts</span>`
    : st === 'locked' ? `<span class="lockchip">${icon('lock')}Removed by coach${r.void_reason ? ': ' + esc(r.void_reason) : ''}</span>`
    : `<span>${a.description ? esc(a.description) : `<span class="pts">+${a.points} pts</span>`}</span>`;
  const pending = S.busy.has(a.id) ? 'disabled' : '';
  return `<article class="arow ${st === 'done' ? 'is-done' : st === 'miss' ? 'is-miss' : st === 'locked' ? 'is-locked' : ''}" data-id="${a.id}" style="--tc:${TRACKER_COLOR[cat?.slug] || 'var(--c-primary)'}">
    <div class="thumb">${icon(a.icon || 'circle-dot')}${img ? `<img src="${esc(img)}" alt="" loading="lazy" data-fallback>` : ''}</div>
    <div class="txt"><b>${esc(a.default_name)}</b>${meta}</div>
    ${st === 'locked' ? `<span class="cbtn" aria-hidden="true" style="border-style:dashed">${icon('lock')}</span>` : `<div class="acts2" role="group" aria-label="${esc(a.default_name)} today">
      <button class="cbtn no" type="button" data-mark="not_done" aria-pressed="${st === 'miss'}" aria-label="Not done: ${esc(a.default_name)}" ${pending}>${icon('x')}</button>
      <button class="cbtn ok" type="button" data-mark="done" aria-pressed="${st === 'done'}" aria-label="Done: ${esc(a.default_name)}" ${pending}>${icon('check')}</button></div>`}
  </article>`;
}
function renderActivities() {
  $('#chips').innerHTML = chipsHTML();
  const cat = S.cats.find((c) => c.slug === S.tracker);
  const list = cat ? S.acts.filter((a) => a.category_id === cat.id) : [];
  const box = $('#act-list');
  if (!list.length) {
    box.innerHTML = `<div class="card empty-state"><span class="ic">${icon('list-checks')}</span><b>No activities here yet</b><span>Your coach will add them soon.</span></div>`;
    return;
  }
  const t = trackerStats(cat);
  const shown = S.expanded ? list : list.slice(0, COLLAPSED);
  box.innerHTML = `${t.left === 0 && t.done === t.total ? `<div class="today-done" style="margin-bottom:8px">${icon('check-circle-2')}<span><b>${esc(cat.name)}</b> complete for today. Brilliant!</span></div>` : ''}
    <div class="alist">${shown.map(rowHTML).join('')}</div>
    ${list.length > COLLAPSED ? `<button class="btn btn-ghost btn-sm more-btn" type="button" data-more>${S.expanded ? `Show less` : `Show all ${list.length} activities`}</button>` : ''}`;
}

function streakHTML() {
  const d = S.d, s = S.streaks;
  const cur = s ? s.current : d.streak;
  const longest = s ? Math.max(s.longest, cur) : null;
  const badges = d.badges || [];
  const earned = new Set(badges.filter((b) => b.earned_at).map((b) => b.code));
  const next = STREAK_BADGES.find(([code, n]) => !earned.has(code) && badges.some((b) => b.code === code));
  const nb = next && badges.find((b) => b.code === next[0]);
  const ordered = [...badges.filter((b) => b.earned_at), ...badges.filter((b) => !b.earned_at)];
  return `<section class="card card-pad" id="streak-card" aria-labelledby="st-h">
    <div class="card-h"><h3 id="st-h">Streak & achievements</h3></div>
    <div class="streak-top"><span class="flame ${cur ? '' : 'cold'}">${icon('flame')}</span>
      <div><b class="big">${cur}<small>${cur === 1 ? 'day' : 'days'}</small></b>
      <p>${cur ? 'Current streak. Tick at least one habit today to keep it alive.' : 'Tick a habit today to start a new streak.'}</p></div></div>
    <div class="mini-stats">
      <div class="stat"><small>Longest</small><b>${longest === null ? '–' : `${longest} ${longest === 1 ? 'day' : 'days'}`}</b></div>
      <div class="stat pts"><small>Points</small><b>${formatNumber(d.total_points)}</b></div>
      <div class="stat"><small>Badges</small><b>${earned.size}/${badges.length}</b></div>
    </div>
    ${nb ? `<div class="milestone"><div class="row"><b>Next: ${esc(nb.name)}</b><span>${Math.min(cur, next[1])} / ${next[1]} days</span></div>
      <div class="pbar"><i data-w="${Math.round(100 * Math.min(cur, next[1]) / next[1])}%"></i></div></div>`
      : STREAK_BADGES.every(([c]) => earned.has(c)) ? `<div class="milestone"><div class="row"><b>All streak badges earned</b><span>90+ days</span></div></div>` : ''}
    <div class="ach-h"><b>Achievements</b><a href="${app('member/progress.html')}">My progress →</a></div>
    <div class="badge-row">${ordered.map((b) => `<div class="bdg ${b.earned_at ? '' : 'locked'}" title="${esc(b.name)}${b.earned_at ? ' · earned ' + formatDate(b.earned_at) : ' · not earned yet'}" style="--from:${esc(b.color_from)};--to:${esc(b.color_to)}">
      <span class="medal" aria-hidden="true">${b.earned_at ? esc(b.glyph) : icon('lock', 'icon')}</span><span>${esc(b.name)}</span></div>`).join('')}</div>
  </section>`;
}

function weekHTML() {
  const total = S.acts.length;
  const mon = mondayOf(S.today), prevMon = addDays(mon, -7);
  const joined = S.profile.joined_on;
  const pctOn = (day) => total ? Math.min(100, Math.round(100 * (S.week.get(day) || 0) / total)) : 0;
  const avg = (from, to) => {
    let sum = 0, n = 0;
    for (let i = 0; i < 7; i++) { const day = addDays(from, i); if (day > to) break; if (day < joined) continue; sum += pctOn(day); n++; }
    return n ? { v: sum / n, n } : null;
  };
  const thisAvg = avg(mon, S.today), lastAvg = avg(prevMon, addDays(mon, -1));
  let trend = '';
  if (thisAvg && lastAvg) {
    const diff = Math.round(thisAvg.v - lastAvg.v);
    trend = diff > 0 ? `<span class="trend up">${icon('arrow-up')}${diff}% vs last week</span>`
      : diff < 0 ? `<span class="trend down">${icon('arrow-down')}${-diff}% vs last week</span>`
      : `<span class="trend flat">Same as last week</span>`;
  }
  const bars = DOW.map((name, i) => {
    const day = addDays(mon, i);
    const cls = day > S.today ? 'future' : day < joined ? 'pre' : '';
    const p = cls ? 0 : pctOn(day);
    const label = cls === 'future' ? 'upcoming' : cls === 'pre' ? 'before you joined' : `${p}% done (${S.week.get(day) || 0} of ${total})`;
    return `<div class="wbar ${cls} ${day === S.today ? 'today' : ''} ${p >= 100 ? 'full' : ''}" title="${name}: ${label}">
      <span class="v">${cls ? '' : p + '%'}</span><div class="col"><i data-h="${p}%"></i></div><small>${name}</small></div>`;
  }).join('');
  return `<section class="card card-pad" id="week-card" aria-labelledby="wk-h">
    <div class="card-h"><h3 id="wk-h">This week</h3>${trend}</div>
    <div class="week-h"><div><b class="big">${S.d.weekly_pct}%</b><small>weekly completion · ${formatNumber(S.d.missed_week)} missed so far</small></div></div>
    <div class="wbars" role="img" aria-label="Daily completion, Monday to Sunday">${bars}</div>
    ${thisAvg && !lastAvg ? `<p class="week-note">A trend appears after your first full week.</p>` : ''}
  </section>`;
}

function quickHTML() {
  const qa = [
    ['member/journal.html', 'notebook-pen', 'Journal'],
    ['member/trackers.html', 'list-checks', 'Activities'],
    ['member/leaderboard.html', 'trophy', 'Ranks'],
    ['member/progress.html', 'trending-up', 'Progress'],
    ['member/profile.html', 'user-round', 'Profile']
  ];
  return `<section aria-labelledby="qa-h"><div class="sec-h"><h2 id="qa-h">Quick actions</h2></div>
    <nav class="qa-grid" aria-label="Quick actions">${qa.map(([href, ic, label]) =>
      `<a class="qa" href="${app(href)}"><span class="ic">${icon(ic)}</span><span>${label}</span></a>`).join('')}</nav></section>`;
}

// ---------- data ----------
async function loadSummary() {
  const [dash, streaks] = await Promise.all([supabase.rpc('get_my_dashboard'), supabase.rpc('get_my_streaks')]);
  if (dash.error) throw dash.error;
  S.d = dash.data; S.today = dash.data.today;
  S.streaks = streaks.error ? null : streaks.data;   // older database without get_my_streaks: longest shows "–"
}
async function loadActivities() {
  const mon = mondayOf(S.today), from = addDays(mon, -7);
  const [cats, acts, rows, week] = await Promise.all([
    supabase.from('tracker_categories').select('id, slug, name, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('activities').select('id, category_id, number, default_name, description, image_path, icon, points').eq('is_active', true).order('number'),
    supabase.from('daily_checkins').select('activity_id, status, voided_at, void_reason').eq('member_id', S.user.id).eq('checkin_date', S.today),
    supabase.from('daily_checkins').select('activity_id, checkin_date').eq('member_id', S.user.id).eq('status', 'done').is('voided_at', null)
      .gte('checkin_date', from).lte('checkin_date', S.today).range(0, 1999)
  ]);
  for (const r of [cats, acts, rows, week]) if (r.error) throw r.error;
  S.cats = cats.data || [];
  const catIds = new Set(S.cats.map((c) => c.id));
  S.acts = (acts.data || []).filter((a) => catIds.has(a.category_id));
  const active = new Set(S.acts.map((a) => a.id));
  S.rows = new Map((rows.data || []).filter((r) => active.has(r.activity_id)).map((r) => [r.activity_id, r]));
  S.week = new Map();
  for (const r of week.data || []) if (active.has(r.activity_id)) S.week.set(r.checkin_date, (S.week.get(r.checkin_date) || 0) + 1);
  // default tracker: the remembered one, else the first with something left to mark
  const saved = store.get(PREF_KEY);
  S.tracker = S.cats.some((c) => c.slug === saved) ? saved : (S.cats.find((c) => trackerStats(c).left > 0) || S.cats[0])?.slug || null;
}
async function loadUnread() {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('member_id', S.user.id).is('read_at', null);
  if (!error) setUnread(count || 0);
}
function setUnread(n) {
  S.unread = n;
  const el = $('#bell-count'); if (!el) return;
  el.hidden = !n; el.textContent = n > 9 ? '9+' : String(n);
  $('#bell-btn')?.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
}

async function renderDashboard() {
  skeleton();
  try { await loadSummary(); } catch (err) { return errorPanel($('#main'), err, renderDashboard); }
  const main = $('#main');
  main.removeAttribute('aria-busy');
  main.innerHTML = `
    <div class="hello"><span class="date">${esc(formatToday())}</span>
      <h1>${esc(greeting())}, ${esc(firstName(S.profile.full_name, S.user.email))}</h1>
      <p>Let's make today count.</p></div>
    <div data-install-slot></div>
    <div class="dash">
      <div class="dash-col" id="col-main">${heroHTML()}<div id="tk-wrap"></div><div id="act-wrap"></div></div>
      <div class="dash-col dash-side" id="col-side"><div id="streak-wrap">${streakHTML()}</div><div id="week-wrap"></div>${quickHTML()}</div>
    </div>`;
  animateRings(main);
  await renderLive();
  loadUnread();
  document.dispatchEvent(new Event('ryl:slots'));
}

async function renderLive() {
  const tk = $('#tk-wrap'), act = $('#act-wrap'), wk = $('#week-wrap');
  tk.innerHTML = `<div class="tk-grid">${'<div class="skeleton" style="height:132px"></div>'.repeat(4)}</div>`;
  act.innerHTML = `<div class="skeleton" style="height:300px"></div>`;
  wk.innerHTML = `<div class="skeleton" style="height:200px"></div>`;
  try { await loadActivities(); } catch (err) {
    tk.innerHTML = ''; wk.innerHTML = '';
    return errorPanel(act, err, renderLive, "Couldn't load today's activities");
  }
  tk.innerHTML = trackersHTML();
  act.innerHTML = activitiesHTML();
  wk.innerHTML = weekHTML();
  renderActivities();
  animateRings($('#main'));
}

// Refresh the summary after ticks (rank, weekly %, badges may change on the server). Debounced.
let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      await loadSummary();
      const hero = $('#hero'); if (hero) { hero.outerHTML = heroHTML(); animateRings($('#hero').parentElement); }
      const st = $('#streak-wrap'); if (st) { st.innerHTML = streakHTML(); animateRings(st); }
      const wk = $('#week-wrap'); if (wk) { wk.innerHTML = weekHTML(); animateRings(wk); }
      loadUnread();
    } catch { /* keep what is on screen */ }
  }, 1200);
}

function updateLiveBits() {
  const d = S.d, total = d.total_activities || 0, done = d.done_today || 0;
  const pct = total ? Math.round(100 * done / total) : 0;
  setRing($('#hero .pring'), pct);
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('#hero-pct', `${pct}%`); set('#hero-count', `${done} of ${total} activities completed`);
  set('#hero-msg', message(pct, done)); set('#hero-pts', `+${formatNumber(d.today_points)}`);
  set('#hero-streak', `${d.streak} ${d.streak === 1 ? 'day' : 'days'}`);
  for (const c of S.cats) {
    const card = $(`.tk[data-slug="${CSS.escape(c.slug)}"]`); if (!card) continue;
    const t = trackerStats(c), p = t.total ? Math.round(100 * t.done / t.total) : 0;
    const tmp = document.createElement('div'); tmp.innerHTML = trackerCard(c);
    const fresh = tmp.firstElementChild;
    fresh.querySelector('.pbar i').style.width = card.querySelector('.pbar i').style.width || '0%';
    const oldFg = card.querySelector('.fg');
    if (oldFg) fresh.querySelector('.fg').style.strokeDashoffset = oldFg.style.strokeDashoffset;
    card.replaceWith(fresh);
    requestAnimationFrame(() => requestAnimationFrame(() => { fresh.querySelector('.pbar i').style.width = p + '%'; setRing(fresh.querySelector('.pring'), p); }));
  }
  // weekly bar for today
  S.week.set(S.today, S.acts.filter((a) => todayState(a) === 'done').length);
}

function refreshRow(id) {
  const old = $(`.arow[data-id="${id}"]`);
  const a = S.acts.find((x) => x.id === id);
  if (old && a) old.outerHTML = rowHTML(a);
  $('#chips').innerHTML = chipsHTML();
}

async function mark(id, value) {
  if (S.busy.has(id)) return;
  const tapKey = `${id}|${value}`, now = Date.now();
  if (now - (S.lastTap.get(tapKey) || 0) < 700) return;      // ignore accidental double taps
  S.lastTap.set(tapKey, now);
  const a = S.acts.find((x) => x.id === id); if (!a) return;
  const before = S.rows.get(id);
  if (before?.voided_at) return;
  const current = before ? before.status : null;
  const next = current === value ? null : value;

  if (next) S.rows.set(id, { activity_id: id, status: next, voided_at: null }); else S.rows.delete(id);
  S.busy.add(id); refreshRow(id);

  const { data, error } = await supabase.rpc('mark_activity', { p_activity_id: id, p_status: next, p_note: null });
  S.busy.delete(id);
  if (error) {
    S.lastTap.delete(tapKey);
    if (before) S.rows.set(id, before); else S.rows.delete(id);
    refreshRow(id);
    if (/removed today/i.test(error.message || '')) { await renderLive(); }
    return toast(friendlyError(error), 'bad');
  }
  if (data?.date && data.date !== S.today) { toast('A new day has started. Reloading…', 'info'); return setTimeout(() => location.reload(), 900); }
  // server numbers win: points, totals and streak come from mark_activity()
  Object.assign(S.d, { done_today: data.done_today, today_points: data.points_today, total_points: data.total_points, streak: data.streak });
  refreshRow(id);
  updateLiveBits();
  const cat = S.cats.find((c) => c.id === a.category_id);
  const t = cat && trackerStats(cat);
  if (next === 'done') toast(`${a.default_name} done · +${a.points} pts${t && t.done === t.total ? ` · ${cat.name} complete!` : ''}`);
  else if (next === 'not_done') toast(`${a.default_name}: not done · no minus points`, 'info');
  else toast(`${a.default_name} cleared`, 'info');
  if (t && t.done === t.total) renderActivities();
  scheduleRefresh();
}

// ---------- notifications (bottom sheet) ----------
const N_ICON = { info: 'info', bonus: 'gift', achievement: 'sparkles', void: 'alert-triangle', reminder: 'clock' };
const fmtWhen = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function openSheet(title, bodyHTML) {
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t"><span class="grab" aria-hidden="true"></span>
    <div class="sheet-h"><h2 id="sheet-t">${esc(title)}</h2><button class="iconbtn" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-b">${bodyHTML}</div></div>`;
  const opener = document.activeElement;
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(scrim);
  $('[data-close]', scrim).focus();
  return scrim;
}

async function openNotifications() {
  const scrim = openSheet('Notifications', `<div class="skeleton" style="height:64px;margin:8px"></div><div class="skeleton" style="height:64px;margin:8px"></div>`);
  const body = $('.sheet-b', scrim);
  const { data, error } = await supabase.from('notifications').select('id, kind, title, body, read_at, created_at')
    .eq('member_id', S.user.id).order('created_at', { ascending: false }).limit(30);
  if (error) return errorPanel(body, error, () => { scrim.remove(); openNotifications(); }, "Couldn't load notifications");
  if (!data?.length) {
    body.innerHTML = `<div class="empty-state"><span class="ic">${icon('bell')}</span><b>No notifications yet</b><span>Bonuses, badges and messages from your coach will appear here.</span></div>`;
    return;
  }
  body.innerHTML = `<div class="nlist">${data.map((n) => `<div class="nitem k-${esc(n.kind)} ${n.read_at ? '' : 'unread'}">
    <span class="ic">${icon(N_ICON[n.kind] || 'info')}</span><div><b>${esc(n.title)}</b>${n.body ? `<p>${esc(n.body)}</p>` : ''}<time datetime="${esc(n.created_at)}">${esc(fmtWhen.format(new Date(n.created_at)))}</time></div></div>`).join('')}</div>`;
  if (data.some((n) => !n.read_at)) {
    const { error: e2 } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('member_id', S.user.id).is('read_at', null);
    if (!e2) setUnread(0);
  }
}

function wireDashboard() {
  const main = $('#main');
  main.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mark]');
    if (m) return mark(m.closest('.arow').dataset.id, m.dataset.mark);
    const c = e.target.closest('[data-cat]');
    if (c) { S.tracker = c.dataset.cat; S.expanded = false; store.set(PREF_KEY, S.tracker); return renderActivities(); }
    if (e.target.closest('[data-more]')) { S.expanded = !S.expanded; return renderActivities(); }
    const go = e.target.closest('#hero-go');
    if (go) { e.preventDefault(); const t = $('#today'); t?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); t?.focus({ preventScroll: true }); }
  });
  // Back from the background on a new day → reload today's view.
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !S.today) return;
    const { data } = await supabase.rpc('app_today');
    if (data && data !== S.today) renderDashboard(); else loadUnread();
  });
}

// =====================================================================
// PROFILE
// =====================================================================
function chrome(current) {
  $('#top').innerHTML = `<div class="topbar">${brandHTML(app('member/dashboard.html'))}
    <div class="actions"><a href="${app('member/profile.html')}" aria-label="My profile" style="text-decoration:none">${avatarHTML(S.profile, S.user.email)}</a></div></div>`;
  document.body.insertAdjacentHTML('beforeend', memberNav(current));
}

function themePickHTML() {
  const pref = getThemePref();
  return `<section class="panel panel-pad stack" style="gap:12px" aria-labelledby="th-h">
    <h2 id="th-h" style="font-size:18px">Appearance</h2>
    <div class="theme-pick" role="group" aria-label="Theme">
      ${[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'smartphone', 'Phone setting']].map(([v, ic, l]) =>
        `<button type="button" data-theme-pref="${v}" aria-pressed="${pref === v}">${icon(ic)}${l}</button>`).join('')}
    </div><p class="muted" style="font-size:12.5px">Saved on this device. “Phone setting” follows your phone's light or dark mode.</p></section>`;
}

function renderProfile() {
  const profile = S.profile, user = S.user;
  const main = $('#main');
  main.innerHTML = `
  <section class="panel profile-head">${avatarHTML(profile, user.email, 'avatar lg')}
    <div style="min-width:0"><span class="pill ${profile.role === 'member' ? 'gold' : 'blue'}">${ROLE_LABEL[profile.role]}</span>
    <h1 style="margin-top:8px">${esc(profile.full_name || user.email)}</h1><p class="muted" style="overflow-wrap:anywhere">${esc(user.email)}</p></div></section>
  <div data-install-slot></div>
  <div class="profile-grid">
    <form class="panel panel-pad form" id="profile-form" novalidate>
      <h2 style="font-size:18px">My details</h2>
      <div class="field"><label for="full_name">Full name</label><input id="full_name" autocomplete="name" maxlength="80" value="${esc(profile.full_name)}"><span class="err"></span></div>
      <div class="field"><label for="phone">Mobile number <span class="opt">(optional)</span></label><input id="phone" type="tel" inputmode="tel" maxlength="16" autocomplete="tel" placeholder="+91 98765 43210" value="${esc(profile.phone || '')}"><span class="err"></span></div>
      <div class="field"><label for="email_ro">Email</label><input id="email_ro" value="${esc(user.email)}" readonly><span class="hint">Ask your coach if you need to change your login email.</span></div>
      <button class="btn btn-primary" id="save-btn" type="submit">Save details</button>
    </form>
    <div class="stack" style="gap:14px">
      ${themePickHTML()}
      <form class="panel panel-pad form" id="pw-form" novalidate>
        <h2 style="font-size:18px">Change password</h2>
        <div class="field"><label for="password">New password</label><div class="pw"><input id="password" type="password" autocomplete="new-password" placeholder="8+ characters, letters and numbers"><button type="button"></button></div><span class="err"></span></div>
        <div class="field"><label for="password2">Confirm new password</label><div class="pw"><input id="password2" type="password" autocomplete="new-password"><button type="button"></button></div><span class="err"></span></div>
        <button class="btn btn-ghost" id="pw-btn" type="submit">Update password</button>
      </form>
      <section class="panel panel-pad stack" style="gap:12px">
        <a class="btn btn-ghost" href="${app('member/progress.html')}">${icon('trending-up')}My progress & badges</a>
        <dl class="facts"><dt>Member since</dt><dd>${esc(formatDate(profile.joined_on))}</dd><dt>Role</dt><dd>${ROLE_LABEL[profile.role]}</dd></dl>
        <button class="btn btn-bad" id="logout-btn" type="button">${icon('log-out')}Log out</button>
      </section>
    </div>
  </div>`;
  wirePasswordToggles(main);

  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-pref]'); if (!b) return;
    setThemePref(b.dataset.themePref);
    $$('[data-theme-pref]', main).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#full_name'), phone = $('#phone');
    const n = name.value.trim(), p = phone.value.trim();
    const ok = [setFieldError(name, n.length < 2 ? 'Enter your full name.' : ''),
                setFieldError(phone, p && !PHONE_RE.test(p) ? 'Use digits only, for example +91 98765 43210.' : '')].every(Boolean);
    if (!ok) return;
    await withBusy($('#save-btn'), 'Saving…', async () => {
      const { data, error } = await supabase.from('profiles').update({ full_name: n, phone: p || null }).eq('id', user.id).select('full_name, phone').single();
      if (error) return toast(friendlyError(error), 'bad');
      Object.assign(profile, data);
      $('.profile-head h1').textContent = data.full_name;
      toast('Details saved');
    });
  });

  $('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#password'), pw2 = $('#password2');
    const ok = [setFieldError(pw, validatePassword(pw.value)), setFieldError(pw2, pw2.value !== pw.value ? 'Passwords do not match.' : '')].every(Boolean);
    if (!ok) return;
    await withBusy($('#pw-btn'), 'Updating…', async () => {
      try { await updatePassword(pw.value); e.target.reset(); toast('Password updated'); }
      catch (err) { toast(friendlyError(err), 'bad'); }
    });
  });

  $('#logout-btn').addEventListener('click', (e) => withBusy(e.currentTarget, 'Logging out…', signOut));
}

// Broken activity image → show the icon underneath (no inline handlers, so the CSP can stay strict).
document.addEventListener('error', (e) => { if (e.target.matches?.('img[data-fallback]')) e.target.remove(); }, true);

// ---------------- boot ----------------
(async () => {
  try {
    const { profile, user } = await requireRole(['member']);
    S.profile = profile; S.user = user;
    if (page === 'member-dashboard') {
      header();
      document.body.insertAdjacentHTML('beforeend', memberNav('dashboard'));
      wireDashboard();
      await renderDashboard();
    }
    if (page === 'member-profile') { chrome('profile'); renderProfile(); }
  } catch (err) {
    document.body.classList.remove('guarding');
    errorPanel($('#main'), err, () => location.reload());
  }
})();

document.addEventListener('input', (e) => { if (e.target.closest('.field.invalid')) setFieldError(e.target, ''); });
