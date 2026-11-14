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
    supabase.from('session_notes').select('id, session_id, activity_id, situation, application, image_ref, created_at, updated_at, activities(default_name)').eq('member_id', me.user.id).order('created_at', { ascending: false }).limit(200),
    supabase.from('doubts').select('id, session_id, activity_id, question, answer, answered_at, created_at, activities(default_name)').eq('member_id', me.user.id).order('created_at', { ascending: false }).limit(200)
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
    <div class="ln-foot"><small>${st ? `${icon('book-open')}${esc(st)} · ` : ''}${n.activities?.default_name ? `${icon('list-checks')}${esc(n.activities.default_name)} · ` : ''}${esc(ago(n.created_at))}</small>
      <button class="lnk-del" data-del-note="${n.id}" aria-label="Delete this note">${icon('x')}</button></div></article>`;
}
function doubtHTML(q, withSession = true) {
  const st = withSession && q.session_id ? sessionTitle(q.session_id) : null;
  return `<article class="ln-item q-item ${q.answered_at ? 'is-answered' : ''}">
    <div class="q-q"><span class="qa-ic">${icon('message-square')}</span><p>${esc(q.question)}</p></div>
    ${q.answered_at ? `<div class="q-a"><span class="qa-ic">${icon('check')}</span><div><small>Coach answered · ${esc(ago(q.answered_at))}</small><p>${esc(q.answer)}</p></div></div>`
      : `<div class="q-wait">${icon('hourglass')}Waiting for your coach's answer</div>`}
    <div class="ln-foot"><small>${st ? `${icon('book-open')}${esc(st)} · ` : ''}${q.activities?.default_name ? `${icon('list-checks')}${esc(q.activities.default_name)} · ` : ''}Asked ${esc(ago(q.created_at))}</small>
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
      <div id="ses-media">${media.some((m) => m.kind === 'image' || m.kind === 'audio') ? '<div class="skeleton" style="height:120px"></div>' : mediaHTML(media, {})}</div>
    </article>
    ${noteForm(id)}
    ${notes.length ? `<div class="stack" style="gap:10px">${notes.map((n) => noteHTML(n, false)).join('')}</div>` : ''}
    ${askForm(id)}
    ${qs.length ? `<div class="stack" style="gap:10px">${qs.map((q) => doubtHTML(q, false)).join('')}</div>` : ''}`;
  const paths = media.filter((m) => m.kind === 'image' || m.kind === 'audio').map((m) => m.ref);
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

// ======================= TO-DO (priority matrix) =======================
let todos = [], showDone = false, addQ = 1;
const QUADS = [
  [1, 'Urgent & important', 'Do it today'],
  [2, 'Important, not urgent', 'Plan a time for it'],
  [3, 'Urgent, not important', 'Finish fast or hand over'],
  [4, 'Not urgent, not important', 'Later, or drop it']
];
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const dueLabel = (d) => {
  if (!d) return '';
  const t = istToday();
  const diff = Math.round((new Date(d + 'T00:00:00Z') - new Date(t + 'T00:00:00Z')) / 864e5);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};
const byDue = (a, b) => (a.due_date || '9999') < (b.due_date || '9999') ? -1 : (a.due_date || '9999') > (b.due_date || '9999') ? 1 : a.created_at < b.created_at ? -1 : 1;

function todoHTML(t) {
  const over = !t.done_at && t.due_date && t.due_date < istToday();
  return `<li class="td ${t.done_at ? 'is-done' : ''} ${over ? 'is-over' : ''}">
    <button class="td-chk" data-done="${t.id}" aria-pressed="${!!t.done_at}" aria-label="${t.done_at ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${icon('check')}</button>
    <span class="td-tx"><b>${esc(t.title)}</b>${t.due_date ? `<small>${icon('calendar')}${over ? 'Overdue · ' : ''}${esc(dueLabel(t.due_date))}</small>` : ''}</span>
    ${t.done_at ? '' : `<select class="td-move" data-move="${t.id}" aria-label="Move: ${esc(t.title)}">${QUADS.map(([q, l]) => `<option value="${q}" ${q === t.quadrant ? 'selected' : ''}>${q} · ${esc(l)}</option>`).join('')}</select>`}
    <button class="lnk-del" data-del="${t.id}" aria-label="Delete: ${esc(t.title)}">${icon('x')}</button></li>`;
}
function drawTodo() {
  const open = todos.filter((t) => !t.done_at);
  const done = todos.filter((t) => t.done_at).sort((a, b) => (a.done_at < b.done_at ? 1 : -1));
  $('#qd-grid').innerHTML = QUADS.map(([q, l, sub]) => {
    const list = open.filter((t) => (t.quadrant || 2) === q).sort(byDue);
    return `<section class="card card-pad qd q${q}" aria-label="${esc(l)}"><div class="qd-h"><i></i><b>${esc(l)}</b><small>${list.length}</small></div><p class="qd-sub">${esc(sub)}</p>
      <ul class="td-list" data-q="${q}">${list.length ? list.map(todoHTML).join('') : `<li class="td-empty">${icon('check-check')}<span>Nothing here</span></li>`}</ul></section>`;
  }).join('');
  $('#td-count').textContent = open.length ? `${open.length} to do` : 'All clear';
  $('#td-done-wrap').hidden = !done.length;
  $('#td-done-btn').innerHTML = `${icon(showDone ? 'chevron-left' : 'chevron-right')}${showDone ? 'Hide' : 'Show'} completed (${done.length})`;
  $('#td-done').hidden = !showDone;
  $('#td-done').innerHTML = done.map(todoHTML).join('');
  $$('#td-qpick button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.q) === addQ)));
}
async function renderTodo() {
  const main = $('#main');
  main.innerHTML = `
    <div class="page-h"><span class="date">Just for you</span><h1>To-do</h1><p>Sort tasks by urgent and important. Your coach does not see this list.</p></div>
    <form class="card card-pad td-add" id="td-form" novalidate>
      <label class="visually-hidden" for="td-title">New task</label>
      <input id="td-title" maxlength="200" placeholder="Add a task, e.g. Call the bank" autocomplete="off">
      <div class="td-q" id="td-qpick" role="group" aria-label="Priority">${QUADS.map(([q, l]) => `<button type="button" class="q${q}" data-q="${q}" aria-pressed="${q === addQ}"><i></i>${esc(l)}</button>`).join('')}</div>
      <div class="td-add-row"><label class="td-due"><span>${icon('calendar')}Due</span><input id="td-due" type="date" min="${istToday()}" aria-label="Due date (optional)"></label>
        <button class="btn btn-primary" type="submit">${icon('check')}Add</button></div>
    </form>
    <div class="sec-h"><h2>My tasks</h2><span class="sub" id="td-count"></span></div>
    <div class="qd-grid" id="qd-grid"><div class="skeleton" style="height:120px"></div></div>
    <section class="card card-pad" id="td-done-wrap" hidden><button class="lnk td-toggle" id="td-done-btn" type="button"></button><ul class="td-list" id="td-done" hidden></ul></section>`;
  const { data, error } = await supabase.from('todos').select('id, title, due_date, done_at, created_at, quadrant').eq('member_id', me.user.id).order('created_at').limit(500);
  if (error) return errorPanel($('#qd-grid'), error, renderTodo);
  todos = data || []; drawTodo();

  $('#td-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#td-title').value.trim(), due = $('#td-due').value || null;
    if (!title) { $('#td-title').focus(); return toast('Type a task first', 'info'); }
    await withBusy(e.target.querySelector('[type=submit]'), 'Adding…', async () => {
      const { data: row, error: err } = await supabase.from('todos').insert({ member_id: me.user.id, title, due_date: due, quadrant: addQ }).select('id, title, due_date, done_at, created_at, quadrant').single();
      if (err) return toast(friendlyError(err), 'bad');
      todos.push(row); $('#td-title').value = ''; $('#td-due').value = ''; drawTodo(); $('#td-title').focus();
    });
  });
  main.addEventListener('change', async (e) => {
    const m = e.target.closest('[data-move]'); if (!m) return;
    const t = todos.find((y) => y.id === m.dataset.move), q = Number(m.value);
    const { error: err } = await supabase.from('todos').update({ quadrant: q }).eq('id', t.id);
    if (err) { m.value = t.quadrant; return toast(friendlyError(err), 'bad'); }
    t.quadrant = q; drawTodo(); toast('Moved');
  });
  main.addEventListener('click', async (e) => {
    const qp = e.target.closest('#td-qpick [data-q]'); if (qp) { addQ = Number(qp.dataset.q); return drawTodo(); }
    const d = e.target.closest('[data-done]'), x = e.target.closest('[data-del]');
    if (e.target.closest('#td-done-btn')) { showDone = !showDone; return drawTodo(); }
    if (d) {
      const t = todos.find((y) => y.id === d.dataset.done); const val = t.done_at ? null : new Date().toISOString();
      d.disabled = true;
      const { error: err } = await supabase.from('todos').update({ done_at: val }).eq('id', t.id);
      d.disabled = false;
      if (err) return toast(friendlyError(err), 'bad');
      t.done_at = val; drawTodo(); if (val) toast('Done. Nice work!');
    }
    if (x) {
      const t = todos.find((y) => y.id === x.dataset.del);
      const { error: err } = await supabase.from('todos').delete().eq('id', t.id);
      if (err) return toast(friendlyError(err), 'bad');
      todos = todos.filter((y) => y.id !== t.id); drawTodo(); toast('Task deleted');
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
