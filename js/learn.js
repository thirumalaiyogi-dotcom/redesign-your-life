// Member: Sessions (coach's notes, pictures, audio, videos), Questions to the coach,
// "Real life vs application" notes (member/learn.html) and the to-do list (member/todo.html).
import { supabase, app } from './supabase.js';
import { requireRole, friendlyError } from './auth.js';
import { $, $$, icon, esc, toast, withBusy, memberNav, memberTopbar, formatDate, confirmDialog } from './ui.js';
import { signedUrls, mediaHTML } from './media.js';
import { memberPicUrls } from './point.js';

const page = document.body.dataset.page;
let me;
const L = { tab: 'sessions', sessions: [], media: [], notes: [], doubts: [], pics: {} };

function chrome(current) {
  $('#top').innerHTML = memberTopbar(me.profile, me.user.email);
  document.body.insertAdjacentHTML('beforeend', memberNav(current));
}
function errorPanel(target, err, retry) {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span><b>Couldn't load this page</b>
    <span>${esc(friendlyError(err))}</span><button class="btn btn-ghost btn-sm" id="retry">${icon('rotate-ccw')}Try again</button></div>`;
  $('#retry', target).addEventListener('click', retry);
}
const ago = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return formatDate(iso);
};
const empty = (ic, title, sub) => `<div class="panel empty-state"><span class="ic">${icon(ic)}</span><b>${title}</b><span>${sub}</span></div>`;

// ======================= LEARN =======================
async function loadLearn() {
  const [s, m, n, d] = await Promise.all([
    supabase.from('sessions').select('id, title, session_date, body, created_at').order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(100),
    supabase.from('session_media').select('id, session_id, kind, ref, caption, sort_order').order('sort_order').order('created_at'),
    supabase.from('session_notes').select('id, session_id, activity_id, situation, application, image_ref, created_at, updated_at, activities(default_name), tracker_categories(name)').eq('member_id', me.user.id).order('created_at', { ascending: false }).limit(200),
    supabase.from('doubts').select('id, session_id, activity_id, question, answer, answered_at, created_at, activities(default_name), tracker_categories(name)').eq('member_id', me.user.id).order('created_at', { ascending: false }).limit(200)
  ]);
  const err = s.error || m.error || n.error || d.error;
  if (err) throw err;
  L.sessions = s.data || []; L.media = m.data || []; L.notes = n.data || []; L.doubts = d.data || [];
  L.pics = await memberPicUrls(L.notes.filter((x) => x.image_ref).map((x) => x.image_ref));
}
const sessionTitle = (id) => L.sessions.find((x) => x.id === id)?.title;

function noteHTML(n, withSession = true) {
  const st = withSession && n.session_id ? sessionTitle(n.session_id) : null;
  return `<article class="ln-item" data-note="${n.id}">
    <div class="ln-row"><span class="tag t-sit">Situation</span><p>${esc(n.situation)}</p></div>
    ${n.application ? `<div class="ln-row"><span class="tag t-app">Application</span><p>${esc(n.application)}</p></div>` : ''}
    ${n.image_ref && L.pics[n.image_ref] ? `<a class="ln-pic" href="${esc(L.pics[n.image_ref])}" target="_blank" rel="noopener"><img src="${esc(L.pics[n.image_ref])}" alt="Picture added with this note" loading="lazy"></a>` : ''}
    <div class="ln-foot"><small>${st ? `${icon('book-open')}${esc(st)} · ` : ''}${n.tracker_categories?.name || n.activities?.default_name ? `${icon('list-checks')}${esc([n.tracker_categories?.name, n.activities?.default_name].filter(Boolean).join(' · '))} · ` : ''}${esc(ago(n.created_at))}</small>
      <button class="lnk-del" data-del-note="${n.id}" aria-label="Delete this note">${icon('x')}</button></div></article>`;
}
function doubtHTML(q, withSession = true) {
  const st = withSession && q.session_id ? sessionTitle(q.session_id) : null;
  return `<article class="ln-item q-item ${q.answered_at ? 'is-answered' : ''}">
    <div class="q-q"><span class="qa-ic">${icon('message-square')}</span><p>${esc(q.question)}</p></div>
    ${q.answered_at ? `<div class="q-a"><span class="qa-ic">${icon('check')}</span><div><small>Coach answered · ${esc(ago(q.answered_at))}</small><p>${esc(q.answer)}</p></div></div>`
      : `<div class="q-wait">${icon('hourglass')}Waiting for your coach's answer</div>`}
    <div class="ln-foot"><small>${st ? `${icon('book-open')}${esc(st)} · ` : ''}${q.tracker_categories?.name || q.activities?.default_name ? `${icon('list-checks')}${esc([q.tracker_categories?.name, q.activities?.default_name].filter(Boolean).join(' · '))} · ` : ''}Asked ${esc(ago(q.created_at))}</small>
      ${q.answered_at ? '' : `<button class="lnk-del" data-del-q="${q.id}" aria-label="Delete this question">${icon('x')}</button>`}</div></article>`;
}
function noteForm(sessionId = '') {
  return `<form class="card card-pad form ln-form" data-form="note" data-session="${sessionId}" novalidate>
    <div class="set-h"><span class="si">${icon('sprout')}</span><h2>Real life vs application</h2></div>
    <p class="muted ln-help">A real situation from your day, and how you applied what you learned.</p>
    <div class="field"><label for="n-sit-${sessionId}">Real life situation</label><textarea id="n-sit-${sessionId}" name="situation" maxlength="1500" rows="3" placeholder="What happened?"></textarea><span class="err"></span></div>
    <div class="field"><label for="n-app-${sessionId}">How I applied it <span class="opt">(optional)</span></label><textarea id="n-app-${sessionId}" name="application" maxlength="1500" rows="3" placeholder="What did you do differently?"></textarea></div>
    <p class="lock-line">${icon('lock')}Only you and your coach can see this.</p>
    <button class="btn btn-primary" type="submit">Save note</button></form>`;
}
function askForm(sessionId = '') {
  return `<form class="card card-pad form ln-form" data-form="ask" data-session="${sessionId}" novalidate>
    <div class="set-h"><span class="si">${icon('message-square')}</span><h2>Ask your coach</h2></div>
    <div class="field"><label for="q-${sessionId}">Your question or doubt</label><textarea id="q-${sessionId}" name="question" maxlength="1000" rows="3" placeholder="Type your question"></textarea><span class="err"></span></div>
    <p class="lock-line">${icon('lock')}Only you and your coach can see this. You'll get a notification when he answers.</p>
    <button class="btn btn-primary" type="submit">${icon('arrow-right')}Send question</button></form>`;
}

function sessionCard(s) {
  const m = L.media.filter((x) => x.session_id === s.id);
  const n = (k) => m.filter((x) => k.includes(x.kind)).length;
  const chips = [[n(['image']), 'image', 'picture'], [n(['audio']), 'mic', 'audio'], [n(['video_link']), 'play', 'video'], [n(['link']), 'newspaper', 'link']]
    .filter(([c]) => c).map(([c, ic, l]) => `<span>${icon(ic)}${c} ${l}${c > 1 ? 's' : ''}</span>`).join('');
  return `<a class="card ses-card" href="${app('member/learn.html?s=' + s.id)}">
    <span class="ses-date"><b>${new Date(s.session_date + 'T00:00:00').getDate()}</b><small>${new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</small></span>
    <span class="ses-tx"><b>${esc(s.title)}</b>${s.body ? `<small>${esc(s.body.slice(0, 120))}</small>` : ''}${chips ? `<span class="ses-chips">${chips}</span>` : ''}</span>
    ${icon('chevron-right')}</a>`;
}

function drawLearn() {
  const main = $('#main');
  const open = L.doubts.filter((q) => !q.answered_at).length;
  main.innerHTML = `
    <div class="page-h"><span class="date">From your coach</span><h1>Sessions</h1><p>Notes, pictures, audio and videos from each session. Ask doubts and share how you applied it.</p></div>
    <div class="seg seg-3" role="tablist" aria-label="Section">
      <button role="tab" data-tab="sessions" aria-selected="${L.tab === 'sessions'}">${icon('book-open')}Sessions</button>
      <button role="tab" data-tab="questions" aria-selected="${L.tab === 'questions'}">${icon('message-square')}Questions${open ? `<span class="cnt">${open}</span>` : ''}</button>
      <button role="tab" data-tab="notes" aria-selected="${L.tab === 'notes'}">${icon('sprout')}Real life</button></div>
    <div id="l-body" class="stack" style="gap:12px"></div>`;
  const body = $('#l-body');
  if (L.tab === 'sessions') {
    body.innerHTML = L.sessions.length ? `<div class="stack" style="gap:10px">${L.sessions.map(sessionCard).join('')}</div>`
      : empty('book-open', 'No sessions yet', 'When your coach posts a session, it shows up here.');
  } else if (L.tab === 'questions') {
    body.innerHTML = askForm() + (L.doubts.length ? `<div class="sec-h"><h2>My questions</h2></div><div class="stack" style="gap:10px">${L.doubts.map((q) => doubtHTML(q)).join('')}</div>`
      : empty('message-square', 'No questions yet', 'Ask anything about the program. Your coach will reply here.'));
  } else {
    body.innerHTML = noteForm() + (L.notes.length ? `<div class="sec-h"><h2>My notes</h2></div><div class="stack" style="gap:10px">${L.notes.map((n) => noteHTML(n)).join('')}</div>`
      : empty('sprout', 'No notes yet', 'Write down a real situation and how you applied the lesson.'));
  }
}

async function drawSession(id) {
  const main = $('#main');
  const s = L.sessions.find((x) => x.id === id);
  if (!s) { main.innerHTML = empty('book-open', 'Session not found', `It may have been removed. <a href="${app('member/learn.html')}">See all sessions</a>`); return; }
  document.title = `${s.title} · Redesign Your Life`;
  const media = L.media.filter((x) => x.session_id === id);
  const notes = L.notes.filter((x) => x.session_id === id), qs = L.doubts.filter((x) => x.session_id === id);
  main.innerHTML = `
    <a class="back-link" href="${app('member/learn.html')}">${icon('chevron-left')}Sessions</a>
    <article class="card card-pad ses-detail">
      <span class="date">${esc(formatDate(s.session_date))}</span><h1>${esc(s.title)}</h1>
      ${s.body ? `<div class="ses-body">${esc(s.body)}</div>` : ''}
      <div id="ses-media">${media.some((m) => m.kind === 'image' || m.kind === 'audio' || m.kind === 'file') ? '<div class="skeleton" style="height:120px"></div>' : mediaHTML(media, {})}</div>
    </article>
    ${noteForm(id)}
    ${notes.length ? `<div class="stack" style="gap:10px">${notes.map((n) => noteHTML(n, false)).join('')}</div>` : ''}
    ${askForm(id)}
    ${qs.length ? `<div class="stack" style="gap:10px">${qs.map((q) => doubtHTML(q, false)).join('')}</div>` : ''}`;
  const paths = media.filter((m) => m.kind === 'image' || m.kind === 'audio' || m.kind === 'file').map((m) => m.ref);
  if (paths.length) { const urls = await signedUrls(paths); if ($('#ses-media')) $('#ses-media').innerHTML = mediaHTML(media, urls); }
}

function redraw() {
  const sid = new URLSearchParams(location.search).get('s');
  return sid ? drawSession(sid) : drawLearn();
}

function fieldErr(input, msg) {
  const f = input.closest('.field'); f.classList.toggle('invalid', !!msg); f.querySelector('.err').textContent = msg || ''; if (msg) input.focus(); return !msg;
}

async function renderLearn() {
  const main = $('#main');
  try { L.tab = sessionStorage.getItem('ryl.learn.tab') || 'sessions'; } catch { /* ignore */ }
  const want = new URLSearchParams(location.search).get('tab'); if (['sessions', 'questions', 'notes'].includes(want)) L.tab = want;
  main.innerHTML = `<div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:120px"></div>`;
  try { await loadLearn(); } catch (err) { return errorPanel(main, err, renderLearn); }
  await redraw();

  main.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { L.tab = t.dataset.tab; try { sessionStorage.setItem('ryl.learn.tab', L.tab); } catch { /* ignore */ } return drawLearn(); }
    const dn = e.target.closest('[data-del-note]'), dq = e.target.closest('[data-del-q]');
    if (dn || dq) {
      const ok = await confirmDialog({ title: dn ? 'Delete this note?' : 'Delete this question?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
      if (!ok) return;
      const { error } = await supabase.from(dn ? 'session_notes' : 'doubts').delete().eq('id', (dn || dq).dataset[dn ? 'delNote' : 'delQ']);
      if (error) return toast(friendlyError(error), 'bad');
      if (dn) L.notes = L.notes.filter((x) => x.id !== dn.dataset.delNote); else L.doubts = L.doubts.filter((x) => x.id !== dq.dataset.delQ);
      toast('Deleted'); redraw();
    }
  });
  main.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const sid = f.dataset.session || null;
    const btn = f.querySelector('[type=submit]');
    if (f.dataset.form === 'note') {
      const sit = f.elements.situation, appl = f.elements.application;
      if (!fieldErr(sit, sit.value.trim().length < 2 ? 'Write the situation first.' : '')) return;
      await withBusy(btn, 'Saving…', async () => {
        const { data, error } = await supabase.from('session_notes').insert({ member_id: me.user.id, session_id: sid, situation: sit.value.trim(), application: appl.value.trim() || null })
          .select('id, session_id, situation, application, created_at, updated_at').single();
        if (error) return toast(friendlyError(error), 'bad');
        L.notes.unshift(data); toast('Note saved'); redraw();
      });
    } else {
      const q = f.elements.question;
      if (!fieldErr(q, q.value.trim().length < 3 ? 'Type your question.' : '')) return;
      await withBusy(btn, 'Sending…', async () => {
        const { data, error } = await supabase.from('doubts').insert({ member_id: me.user.id, session_id: sid, question: q.value.trim() })
          .select('id, session_id, question, answer, answered_at, created_at').single();
        if (error) return toast(friendlyError(error), 'bad');
        L.doubts.unshift(data); toast('Question sent to your coach'); redraw();
      });
    }
  });
  main.addEventListener('input', (e) => { const f = e.target.closest('.field.invalid'); if (f) { f.classList.remove('invalid'); f.querySelector('.err').textContent = ''; } });
}

// ======================= TO-DO: Today · Week · Month (+ optional priority matrix) =======================
// Simple like the well-known planners: one-line add, Today first, a week strip, a month calendar, and a
// small "how did I do" card. ⭐ important and 🔥 urgent are two taps; the Eisenhower quadrant is worked out from them.
let todos = [], tdView = 'today', selDay = null, weekOf = null, monthOf = null, showDoneToday = false, addWhen = 'today', addDate = null, addImp = false, addUrg = false;
const QUADS = [
  [1, 'Urgent & important', 'Do it today'],
  [2, 'Important, not urgent', 'Plan a time for it'],
  [3, 'Urgent, not important', 'Finish fast or hand over'],
  [4, 'Not urgent, not important', 'Later, or drop it']
];
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const istDate = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : null);
const addD = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = (d) => { const x = new Date(d + 'T00:00:00Z'); return addD(d, -((x.getUTCDay() + 6) % 7)); };
const fmt = (d, o) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { timeZone: 'UTC', ...o });
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const isImp = (t) => t.quadrant === 1 || t.quadrant === 2;
const isUrg = (t) => t.quadrant === 1 || t.quadrant === 3;
const quadOf = (imp, urg) => (imp && urg ? 1 : imp ? 2 : urg ? 3 : 4);
const dueLabel = (d) => {
  if (!d) return '';
  const diff = Math.round((new Date(d + 'T00:00:00Z') - new Date(istToday() + 'T00:00:00Z')) / 864e5);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
  return fmt(d, { day: 'numeric', month: 'short' });
};
// important first, then urgent, then oldest
const rank = (a, b) => (a.quadrant || 4) - (b.quadrant || 4) || (a.created_at < b.created_at ? -1 : 1);
const TCOLS = 'id, title, due_date, done_at, created_at, quadrant';

function rowHTML(t, { showDate = true } = {}) {
  const today = istToday(), over = !t.done_at && t.due_date && t.due_date < today;
  const meta = [showDate && t.due_date ? `<span class="${over ? 'late' : ''}">${icon('calendar')}${esc(dueLabel(t.due_date))}</span>` : '',
    isUrg(t) && !t.done_at ? `<span class="urg">${icon('flame')}Urgent</span>` : ''].filter(Boolean).join('');
  return `<li class="tdi ${t.done_at ? 'is-done' : ''} ${over ? 'is-over' : ''} ${isImp(t) ? 'is-imp' : ''}" data-id="${t.id}">
    <button class="tdi-chk" data-done="${t.id}" aria-pressed="${!!t.done_at}" aria-label="${t.done_at ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${icon('check')}</button>
    <span class="tdi-tx"><b>${esc(t.title)}</b>${meta ? `<small>${meta}</small>` : ''}</span>
    ${t.done_at ? '' : `<button class="tdi-star" data-star="${t.id}" aria-pressed="${isImp(t)}" aria-label="Important: ${esc(t.title)}">${icon('star')}</button>`}
    <button class="tdi-more" data-more="${t.id}" aria-label="More for ${esc(t.title)}">${icon('ellipsis')}</button></li>`;
}
const listHTML = (arr, opt) => `<ul class="tdl">${arr.map((t) => rowHTML(t, opt)).join('')}</ul>`;
const emptyHTML = (txt) => `<div class="td-none">${icon('check-check')}<span>${txt}</span></div>`;

function ringHTMLsmall(done, total) {
  const pct = total ? Math.round(100 * done / total) : 0, r = 22, c = 2 * Math.PI * r;
  return `<span class="td-ring" role="img" aria-label="${done} of ${total} done"><svg viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="${r}" class="bg"/><circle cx="27" cy="27" r="${r}" class="fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}"/></svg><b>${pct}%</b></span>`;
}

// ---- stats (only from this member's own tasks) ----
function statsFor(start, end) {
  const today = istToday();
  const planned = todos.filter((t) => t.due_date && t.due_date >= start && t.due_date <= end && t.due_date <= today);
  const doneIn = todos.filter((t) => { const d = istDate(t.done_at); return d && d >= start && d <= end; });
  const byWd = [0, 0, 0, 0, 0, 0, 0]; doneIn.forEach((t) => { const d = new Date(istDate(t.done_at) + 'T00:00:00Z'); byWd[(d.getUTCDay() + 6) % 7]++; });
  const best = byWd.some(Boolean) ? WD[byWd.indexOf(Math.max(...byWd))] : null;
  return { planned: planned.length, plannedDone: planned.filter((t) => t.done_at).length, done: doneIn.length, best, byWd };
}
function streak() {
  const days = new Set(todos.map((t) => istDate(t.done_at)).filter(Boolean));
  let d = istToday(); if (!days.has(d)) d = addD(d, -1);
  let n = 0; while (days.has(d)) { n++; d = addD(d, -1); }
  return n;
}
function statsCard(title, s, extra = '') {
  const pct = s.planned ? Math.round(100 * s.plannedDone / s.planned) : null, st = streak();
  return `<section class="card td-stats"><div class="tds-h"><b>${title}</b>${st ? `<span class="tds-streak">${icon('flame')}${st}-day streak</span>` : ''}</div>
    <div class="tds-grid">
      <div><span class="num">${s.done}</span><small>tasks done</small></div>
      <div><span class="num">${pct == null ? '–' : pct + '%'}</span><small>${s.planned ? `${s.plannedDone} of ${s.planned} planned` : 'of planned'}</small></div>
      <div><span class="num">${s.best || '–'}</span><small>best day</small></div>
    </div>${extra}</section>`;
}

// ---- views ----
function drawToday() {
  const today = istToday();
  const open = todos.filter((t) => !t.done_at);
  const over = open.filter((t) => t.due_date && t.due_date < today).sort(rank);
  const due = open.filter((t) => t.due_date === today).sort(rank);
  const nodate = open.filter((t) => !t.due_date).sort(rank);
  const doneToday = todos.filter((t) => istDate(t.done_at) === today).sort((a, b) => (a.done_at < b.done_at ? 1 : -1));
  const total = due.length + over.length + doneToday.length;
  return `<section class="card td-hero"><div><small>${esc(fmt(today, { weekday: 'long', day: 'numeric', month: 'long' }))}</small>
      <b>${total ? (doneToday.length >= total ? 'All done for today 🎉' : `${doneToday.length} of ${total} done today`) : 'A fresh day'}</b>
      <span>${total ? (due.length + over.length ? `${due.length + over.length} left` : 'Great work') : 'Add what you want to finish today.'}</span></div>${ringHTMLsmall(doneToday.length, total)}</section>
    ${over.length ? `<section class="td-sec late"><div class="td-sec-h"><h3>${icon('alert-triangle')}Overdue <small>${over.length}</small></h3><button class="lnk" data-all-today>Move all to today</button></div>${listHTML(over)}</section>` : ''}
    <section class="td-sec"><div class="td-sec-h"><h3>Today <small>${due.length}</small></h3></div>${due.length ? listHTML(due, { showDate: false }) : emptyHTML(over.length ? 'Nothing else due today' : 'Nothing due today')}</section>
    ${nodate.length ? `<section class="td-sec"><div class="td-sec-h"><h3>Anytime <small>${nodate.length}</small></h3></div>${listHTML(nodate)}</section>` : ''}
    ${doneToday.length ? `<section class="td-sec"><button class="td-sec-h td-fold" data-fold aria-expanded="${showDoneToday}"><h3>${icon('check-circle-2')}Done today <small>${doneToday.length}</small></h3>${icon('chevron-down')}</button>${showDoneToday ? listHTML(doneToday) : ''}</section>` : ''}`;
}
function drawWeek() {
  const today = istToday(); weekOf ||= mondayOf(today); selDay ||= today;
  const days = Array.from({ length: 7 }, (_, i) => addD(weekOf, i));
  if (!days.includes(selDay)) selDay = days.includes(today) ? today : weekOf;
  const onDay = (d) => todos.filter((t) => t.due_date === d || (!t.due_date && istDate(t.done_at) === d));
  const list = onDay(selDay).sort((a, b) => (!!a.done_at - !!b.done_at) || rank(a, b));
  const s = statsFor(weekOf, days[6]); const mx = Math.max(1, ...s.byWd);
  return `<div class="td-nav"><button class="iconbtn" data-wk="-1" aria-label="Previous week">${icon('chevron-left')}</button><b>${esc(fmt(weekOf, { day: 'numeric', month: 'short' }))} – ${esc(fmt(days[6], { day: 'numeric', month: 'short' }))}</b><button class="iconbtn" data-wk="1" aria-label="Next week">${icon('chevron-right')}</button></div>
    <div class="td-strip" role="tablist" aria-label="Days">${days.map((d, i) => { const l = onDay(d), dn = l.filter((t) => t.done_at).length;
      return `<button role="tab" data-day="${d}" aria-selected="${d === selDay}" class="${d === today ? 'is-today' : ''} ${l.length && dn === l.length ? 'all-done' : ''}"><small>${WD[i]}</small><b>${fmt(d, { day: 'numeric' })}</b>
        <i class="dots">${l.length ? `${'<em></em>'.repeat(Math.min(l.length, 4))}` : ''}</i></button>`; }).join('')}</div>
    <section class="td-sec"><div class="td-sec-h"><h3>${esc(selDay === today ? 'Today' : fmt(selDay, { weekday: 'long', day: 'numeric', month: 'short' }))} <small>${list.filter((t) => !t.done_at).length} open</small></h3><button class="lnk" data-add-on="${selDay}">${icon('check')}Add here</button></div>
      ${list.length ? listHTML(list, { showDate: false }) : emptyHTML('Nothing planned')}</section>
    ${statsCard('This week', s, `<div class="tds-bars" aria-label="Tasks done each day">${s.byWd.map((v, i) => `<span><i style="height:${Math.round(100 * v / mx)}%"></i><small>${WD[i][0]}</small></span>`).join('')}</div>`)}`;
}
function drawMonth() {
  const today = istToday(); monthOf ||= today.slice(0, 7) + '-01'; selDay ||= today;
  const first = monthOf, y = +first.slice(0, 4), m = +first.slice(5, 7);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const lead = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7, n = +last.slice(8);
  const onDay = (d) => todos.filter((t) => t.due_date === d || (!t.due_date && istDate(t.done_at) === d));
  if (selDay < first || selDay > last) selDay = today >= first && today <= last ? today : first;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => addD(first, i))];
  const list = onDay(selDay).sort((a, b) => (!!a.done_at - !!b.done_at) || rank(a, b));
  const s = statsFor(first, last);
  const weeks = []; for (let w = mondayOf(first); w <= last; w = addD(w, 7)) weeks.push([w, todos.filter((t) => { const d = istDate(t.done_at); return d && d >= w && d <= addD(w, 6) && d >= first && d <= last; }).length]);
  const mx = Math.max(1, ...weeks.map((w) => w[1]));
  return `<div class="td-nav"><button class="iconbtn" data-mo="-1" aria-label="Previous month">${icon('chevron-left')}</button><b>${esc(fmt(first, { month: 'long', year: 'numeric' }))}</b><button class="iconbtn" data-mo="1" aria-label="Next month">${icon('chevron-right')}</button></div>
    <div class="card td-cal"><div class="tdc-h">${WD.map((w) => `<small>${w[0]}</small>`).join('')}</div>
      <div class="tdc-g">${cells.map((d) => { if (!d) return '<span></span>'; const l = onDay(d), dn = l.filter((t) => t.done_at).length;
        return `<button data-day="${d}" aria-selected="${d === selDay}" class="${d === today ? 'is-today' : ''} ${l.length ? (dn === l.length ? 'all-done' : d < today ? 'some-late' : 'has') : ''}" aria-label="${esc(fmt(d, { day: 'numeric', month: 'long' }))}: ${l.length} tasks">${+d.slice(8)}${l.length ? `<i>${l.length}</i>` : ''}</button>`; }).join('')}</div></div>
    <section class="td-sec"><div class="td-sec-h"><h3>${esc(selDay === today ? 'Today' : fmt(selDay, { weekday: 'long', day: 'numeric', month: 'short' }))} <small>${list.filter((t) => !t.done_at).length} open</small></h3><button class="lnk" data-add-on="${selDay}">${icon('check')}Add here</button></div>
      ${list.length ? listHTML(list, { showDate: false }) : emptyHTML('Nothing planned')}</section>
    ${statsCard('This month', s, `<div class="tds-weeks">${weeks.map(([w, v], i) => `<div><small>Week ${i + 1}</small><span><i style="width:${Math.round(100 * v / mx)}%"></i></span><b>${v}</b></div>`).join('')}</div>`)}`;
}
function drawMatrix() {
  const open = todos.filter((t) => !t.done_at);
  return `<p class="muted td-mx-help">⭐ = important, 🔥 = urgent. Change them from a task's ⋯ menu.</p><div class="qd-grid">${QUADS.map(([q, l, sub]) => {
    const list = open.filter((t) => (t.quadrant || 4) === q).sort(rank);
    return `<section class="card card-pad qd q${q}" aria-label="${esc(l)}"><div class="qd-h"><i></i><b>${esc(l)}</b><small>${list.length}</small></div><p class="qd-sub">${esc(sub)}</p>
      ${list.length ? listHTML(list) : emptyHTML('Nothing here')}</section>`;
  }).join('')}</div>`;
}

function whenDate() {
  const t = istToday();
  return addWhen === 'today' ? t : addWhen === 'tomorrow' ? addD(t, 1) : addWhen === 'week' ? addD(mondayOf(t), 6) : addWhen === 'date' ? addDate : null;
}
function drawAddChips() {
  const box = $('#td-chips'); if (!box) return;
  const chip = (k, l) => `<button type="button" class="tdc" data-when="${k}" aria-pressed="${addWhen === k}">${l}</button>`;
  box.innerHTML = `${chip('today', 'Today')}${chip('tomorrow', 'Tomorrow')}${chip('week', 'This week')}
    <label class="tdc ${addWhen === 'date' ? 'on' : ''}">${icon('calendar')}<span>${addWhen === 'date' && addDate ? esc(dueLabel(addDate)) : 'Date'}</span><input type="date" id="td-date" min="${istToday()}" aria-label="Pick a date"></label>
    ${chip('none', 'No date')}<span class="tdc-sep"></span>
    <button type="button" class="tdc flag imp" data-flag="imp" aria-pressed="${addImp}" aria-label="Important">${icon('star')}</button>
    <button type="button" class="tdc flag urg" data-flag="urg" aria-pressed="${addUrg}" aria-label="Urgent">${icon('flame')}</button>`;
}
function drawTodo() {
  $$('[data-tdv]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tdv === tdView)));
  const body = $('#td-body');
  body.innerHTML = tdView === 'today' ? drawToday() : tdView === 'week' ? drawWeek() : tdView === 'month' ? drawMonth() : drawMatrix();
}

// ⋯ menu for one task: when, flags, delete
async function moreMenu(t) {
  const today = istToday();
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  scrim.innerHTML = `<div class="dialog td-menu" role="dialog" aria-modal="true" aria-labelledby="tdm-t"><h2 id="tdm-t">${esc(t.title)}</h2>
    <div class="tdm-row">${[['Today', today], ['Tomorrow', addD(today, 1)], ['Next week', addD(mondayOf(today), 7)], ['No date', '']].map(([l, d]) => `<button class="tdc" data-set-due="${d}" aria-pressed="${(t.due_date || '') === d}">${l}</button>`).join('')}
      <label class="tdc">${icon('calendar')}<span>Pick date</span><input type="date" id="tdm-date" value="${t.due_date || ''}"></label></div>
    <div class="tdm-row"><button class="tdc flag imp" data-set-flag="imp" aria-pressed="${isImp(t)}">${icon('star')}Important</button><button class="tdc flag urg" data-set-flag="urg" aria-pressed="${isUrg(t)}">${icon('flame')}Urgent</button></div>
    <div class="actions"><button class="btn btn-ghost" data-tdm-del style="color:var(--c-danger-ink)">${icon('x')}Delete</button><button class="btn btn-gold" data-tdm-close>Done</button></div></div>`;
  document.body.appendChild(scrim);
  const close = () => { scrim.remove(); drawTodo(); };
  const save = async (patch) => {
    const { error } = await supabase.from('todos').update(patch).eq('id', t.id);
    if (error) return toast(friendlyError(error), 'bad');
    Object.assign(t, patch); close();
  };
  scrim.addEventListener('click', async (e) => {
    if (e.target === scrim || e.target.closest('[data-tdm-close]')) return close();
    const sd = e.target.closest('[data-set-due]'); if (sd) return save({ due_date: sd.dataset.setDue || null });
    const sf = e.target.closest('[data-set-flag]');
    if (sf) { const imp = sf.dataset.setFlag === 'imp' ? !isImp(t) : isImp(t), urg = sf.dataset.setFlag === 'urg' ? !isUrg(t) : isUrg(t); return save({ quadrant: quadOf(imp, urg) }); }
    if (e.target.closest('[data-tdm-del]')) {
      const { error } = await supabase.from('todos').delete().eq('id', t.id);
      if (error) return toast(friendlyError(error), 'bad');
      todos = todos.filter((y) => y.id !== t.id); toast('Task deleted'); close();
    }
  });
  scrim.querySelector('#tdm-date').addEventListener('change', (e) => { if (e.target.value) save({ due_date: e.target.value }); });
}

async function renderTodo() {
  const main = $('#main');
  try { tdView = sessionStorage.getItem('ryl.td.view') || 'today'; } catch { /* ignore */ }
  main.innerHTML = `
    <div class="page-h td-head"><div><span class="date">Just for you · private</span><h1>To-do</h1></div>
      <button class="iconbtn td-mx" data-tdv="matrix" aria-selected="${tdView === 'matrix'}" aria-label="Priority view" title="Priority view">${icon('grid-2x2')}</button></div>
    <div class="seg seg-3 td-seg" role="tablist" aria-label="View">${[['today', 'Today'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => `<button role="tab" data-tdv="${k}" aria-selected="${tdView === k}">${l}</button>`).join('')}</div>
    <form class="card td-add" id="td-form" novalidate>
      <div class="td-add-r"><label class="visually-hidden" for="td-title">New task</label>
        <input id="td-title" maxlength="200" placeholder="Add a task…" autocomplete="off" enterkeyhint="done">
        <button class="td-go" type="submit" aria-label="Add task">${icon('arrow-up')}</button></div>
      <div class="td-chips" id="td-chips" hidden></div></form>
    <div id="td-body" class="stack" style="gap:14px"><div class="skeleton" style="height:120px"></div></div>`;
  const { data, error } = await supabase.from('todos').select(TCOLS).eq('member_id', me.user.id).order('created_at').limit(1000);
  if (error) return errorPanel($('#td-body'), error, renderTodo);
  todos = data || []; drawTodo(); drawAddChips();

  const title = $('#td-title');
  const openChips = () => { $('#td-chips').hidden = false; };
  title.addEventListener('focus', openChips);
  title.addEventListener('input', openChips);
  $('#td-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = title.value.trim();
    if (!v) { title.focus(); return toast('Type a task first', 'info'); }
    const due = whenDate();
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    const { data: row, error: err } = await supabase.from('todos').insert({ member_id: me.user.id, title: v, due_date: due, quadrant: quadOf(addImp, addUrg) }).select(TCOLS).single();
    btn.disabled = false;
    if (err) return toast(friendlyError(err), 'bad');
    todos.push(row); title.value = ''; addImp = false; addUrg = false; drawAddChips(); drawTodo(); title.focus();
    toast(due ? `Added for ${dueLabel(due).toLowerCase() === 'today' ? 'today' : dueLabel(due)}` : 'Added');
  });
  main.addEventListener('change', (e) => {
    if (e.target.id === 'td-date' && e.target.value) { addWhen = 'date'; addDate = e.target.value; drawAddChips(); }
  });
  main.addEventListener('click', async (e) => {
    const g = (s) => e.target.closest(s);
    let t;
    if ((t = g('[data-tdv]'))) { tdView = t.dataset.tdv === tdView && tdView === 'matrix' ? 'today' : t.dataset.tdv; try { sessionStorage.setItem('ryl.td.view', tdView); } catch { /* ignore */ } $('.td-mx').setAttribute('aria-selected', String(tdView === 'matrix')); return drawTodo(); }
    if ((t = g('[data-when]'))) { addWhen = t.dataset.when; return drawAddChips(); }
    if ((t = g('[data-flag]'))) { if (t.dataset.flag === 'imp') addImp = !addImp; else addUrg = !addUrg; return drawAddChips(); }
    if ((t = g('[data-day]'))) { selDay = t.dataset.day; return drawTodo(); }
    if ((t = g('[data-wk]'))) { weekOf = addD(weekOf, 7 * Number(t.dataset.wk)); selDay = null; return drawTodo(); }
    if ((t = g('[data-mo]'))) { const d = new Date(monthOf + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + Number(t.dataset.mo)); monthOf = d.toISOString().slice(0, 10); selDay = null; return drawTodo(); }
    if ((t = g('[data-add-on]'))) { addWhen = 'date'; addDate = t.dataset.addOn; drawAddChips(); title.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (g('[data-fold]')) { showDoneToday = !showDoneToday; return drawTodo(); }
    if (g('[data-all-today]')) {
      const today = istToday(), ids = todos.filter((x) => !x.done_at && x.due_date && x.due_date < today).map((x) => x.id);
      const { error: err } = await supabase.from('todos').update({ due_date: today }).in('id', ids);
      if (err) return toast(friendlyError(err), 'bad');
      todos.forEach((x) => { if (ids.includes(x.id)) x.due_date = today; }); toast(`${ids.length} moved to today`); return drawTodo();
    }
    if ((t = g('[data-star]'))) {
      const x = todos.find((y) => y.id === t.dataset.star), q = quadOf(!isImp(x), isUrg(x));
      const { error: err } = await supabase.from('todos').update({ quadrant: q }).eq('id', x.id);
      if (err) return toast(friendlyError(err), 'bad');
      x.quadrant = q; return drawTodo();
    }
    if ((t = g('[data-more]'))) return moreMenu(todos.find((y) => y.id === t.dataset.more));
    if ((t = g('[data-done]'))) {
      const x = todos.find((y) => y.id === t.dataset.done), val = x.done_at ? null : new Date().toISOString();
      const li = t.closest('.tdi'); if (val && li) li.classList.add('pop');
      t.disabled = true;
      const { error: err } = await supabase.from('todos').update({ done_at: val }).eq('id', x.id);
      t.disabled = false;
      if (err) { li?.classList.remove('pop'); return toast(friendlyError(err), 'bad'); }
      x.done_at = val;
      setTimeout(drawTodo, val ? 380 : 0);
    }
  });
}

// ---------------- boot ----------------
(async () => {
  try {
    me = await requireRole(['member']);
    chrome(page === 'member-todo' ? 'dashboard' : 'learn');
    if (page === 'member-learn') await renderLearn();
    if (page === 'member-todo') await renderTodo();
  } catch (err) {
    document.body.classList.remove('guarding');
    errorPanel($('#main'), err, () => location.reload());
  }
})();
