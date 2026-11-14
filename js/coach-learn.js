// Coach console: Sessions (post notes, pictures, audio, video links), members' Questions
// (answer them) and "Real life vs application" notes. Plus the extra blocks on a member's page.
import { supabase, app } from './supabase.js';
import { friendlyError } from './auth.js';
import { $, icon, esc, toast, withBusy, confirmDialog, formatDate } from './ui.js';
import { BUCKET, signedUrls, mediaHTML, shrinkImage, fileName, isHttps, youtubeId } from './media.js';
import { memberPicUrls, noteItemHTML } from './point.js';

const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const ago = (iso) => {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return formatDate(iso);
};
function errorPanel(target, err, retry) {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span><b>Couldn't load this</b>
    <span>${esc(friendlyError(err))}</span><button class="btn btn-ghost btn-sm" data-retry>${icon('rotate-ccw')}Try again</button></div>`;
  target.querySelector('[data-retry]').addEventListener('click', retry);
}
const empty = (ic, title, sub) => `<div class="panel empty-state"><span class="ic">${icon(ic)}</span><b>${title}</b><span>${sub}</span></div>`;

const C = { tab: 'sessions', sessions: [], media: [], doubts: [], notes: [], qFilter: 'open', editing: null };

async function loadAll() {
  const [s, m, d, n] = await Promise.all([
    supabase.from('sessions').select('id, title, session_date, body, is_published, created_at, updated_at').order('session_date', { ascending: false }).order('created_at', { ascending: false }).limit(200),
    supabase.from('session_media').select('id, session_id, kind, ref, caption, sort_order, created_at').order('sort_order').order('created_at'),
    supabase.from('doubts').select('id, member_id, session_id, activity_id, question, answer, answered_at, created_at, profiles!doubts_member_id_fkey(full_name), activities(default_name)').order('created_at', { ascending: false }).limit(300),
    supabase.from('session_notes').select('id, member_id, session_id, activity_id, situation, application, image_ref, created_at, profiles(full_name), activities(default_name)').order('created_at', { ascending: false }).limit(300)
  ]);
  const err = s.error || m.error || d.error || n.error;
  if (err) throw err;
  C.sessions = s.data || []; C.media = m.data || []; C.doubts = d.data || []; C.notes = n.data || [];
  C.pics = await memberPicUrls(C.notes.filter((x) => x.image_ref).map((x) => x.image_ref));
}
const sTitle = (id) => C.sessions.find((x) => x.id === id)?.title;

// ---------------- list views ----------------
function sessionRow(s) {
  const m = C.media.filter((x) => x.session_id === s.id);
  const q = C.doubts.filter((x) => x.session_id === s.id).length, n = C.notes.filter((x) => x.session_id === s.id).length;
  const chips = [[m.filter((x) => x.kind === 'image').length, 'image', 'pic'], [m.filter((x) => x.kind === 'audio').length, 'mic', 'audio'],
    [m.filter((x) => x.kind === 'video_link' || x.kind === 'link').length, 'play', 'link'], [q, 'message-square', 'question'], [n, 'sprout', 'note']]
    .filter(([c]) => c).map(([c, ic, l]) => `<span>${icon(ic)}${c} ${l}${c > 1 ? 's' : ''}</span>`).join('');
  return `<button class="card ses-card ${s.is_published ? '' : 'draft'}" data-edit="${s.id}" type="button" style="text-align:left;width:100%">
    <span class="ses-date"><b>${new Date(s.session_date + 'T00:00:00').getDate()}</b><small>${new Date(s.session_date + 'T00:00:00').toLocaleDateString('en-IN', { month: 'short' })}</small></span>
    <span class="ses-tx"><b>${esc(s.title)}${s.is_published ? '' : ' <span class="pill none">Draft</span>'}</b>${s.body ? `<small>${esc(s.body.slice(0, 120))}</small>` : ''}${chips ? `<span class="ses-chips">${chips}</span>` : ''}</span>
    ${icon('pencil')}</button>`;
}
function doubtRow(q) {
  const st = q.session_id ? sTitle(q.session_id) : null;
  return `<article class="ln-item q-item ${q.answered_at ? 'is-answered' : ''}">
    <div class="inbox-who"><span class="avatar sm" aria-hidden="true">${esc((q.profiles?.full_name || '?').slice(0, 1).toUpperCase())}</span>
      <a href="${app('admin/member.html?id=' + q.member_id)}">${esc(q.profiles?.full_name || 'Member')}</a><span class="muted" style="font-weight:500">· ${esc(ago(q.created_at))}</span></div>
    <div class="q-q"><span class="qa-ic">${icon('message-square')}</span><p>${esc(q.question)}</p></div>
    ${q.answered_at ? `<div class="q-a"><span class="qa-ic">${icon('check')}</span><div><small>Answered · ${esc(ago(q.answered_at))}</small><p>${esc(q.answer)}</p></div></div>`
      : `<form class="answer-form" data-answer="${q.id}" novalidate><label class="visually-hidden" for="ans-${q.id}">Your answer</label>
          <textarea id="ans-${q.id}" maxlength="2000" placeholder="Type your answer"></textarea>
          <button class="btn btn-primary btn-sm" type="submit" style="align-self:flex-start">${icon('arrow-right')}Send answer</button></form>`}
    ${st || q.activities ? `<div class="ln-foot"><small>${st ? `${icon('book-open')}${esc(st)}` : ''}${st && q.activities ? ' · ' : ''}${q.activities ? `${icon('list-checks')}${esc(q.activities.default_name)}` : ''}</small></div>` : ''}</article>`;
}
function noteRow(n) {
  const st = n.session_id ? sTitle(n.session_id) : null;
  return `<article class="ln-item">
    <div class="inbox-who"><a href="${app('admin/member.html?id=' + n.member_id)}">${esc(n.profiles?.full_name || 'Member')}</a><span class="muted" style="font-weight:500">· ${esc(ago(n.created_at))}</span></div>
    <div class="ln-row"><span class="tag t-sit">Situation</span><p>${esc(n.situation)}</p></div>
    ${n.application ? `<div class="ln-row"><span class="tag t-app">Application</span><p>${esc(n.application)}</p></div>` : ''}
    ${n.image_ref && C.pics?.[n.image_ref] ? `<a class="ln-pic" href="${esc(C.pics[n.image_ref])}" target="_blank" rel="noopener"><img src="${esc(C.pics[n.image_ref])}" alt="Member's picture" loading="lazy"></a>` : ''}
    ${st || n.activities ? `<div class="ln-foot"><small>${st ? `${icon('book-open')}${esc(st)}` : ''}${st && n.activities ? ' · ' : ''}${n.activities ? `${icon('list-checks')}${esc(n.activities.default_name)}` : ''}</small></div>` : ''}</article>`;
}

function drawList() {
  const main = $('#main');
  const open = C.doubts.filter((q) => !q.answered_at).length;
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">Post session notes, pictures, audio and videos. Answer members' questions.</span><h1>Sessions</h1></div>
    ${C.tab === 'sessions' ? `<button class="btn btn-gold" id="new-ses">${icon('sparkles')}New session</button>` : ''}</div>
  <div class="seg seg-3" role="tablist" aria-label="Section">
    <button role="tab" data-tab="sessions" aria-selected="${C.tab === 'sessions'}">${icon('book-open')}Sessions</button>
    <button role="tab" data-tab="questions" aria-selected="${C.tab === 'questions'}">${icon('message-square')}Questions${open ? `<span class="cnt">${open}</span>` : ''}</button>
    <button role="tab" data-tab="notes" aria-selected="${C.tab === 'notes'}">${icon('sprout')}Real life</button></div>
  <div id="c-body" class="stack" style="gap:10px"></div>`;
  const body = $('#c-body');
  if (C.tab === 'sessions') {
    body.innerHTML = C.sessions.length ? C.sessions.map(sessionRow).join('')
      : empty('book-open', 'No sessions yet', 'Tap “New session” to post your first session for members.');
  } else if (C.tab === 'questions') {
    const list = C.doubts.filter((q) => C.qFilter === 'all' || (C.qFilter === 'open' ? !q.answered_at : q.answered_at));
    body.innerHTML = `<div class="chips" role="group" aria-label="Filter">${[['open', 'Waiting'], ['answered', 'Answered'], ['all', 'All']].map(([v, l]) =>
      `<button class="chip" data-qf="${v}" aria-pressed="${C.qFilter === v}">${l}<span class="c">${v === 'all' ? C.doubts.length : v === 'open' ? open : C.doubts.length - open}</span></button>`).join('')}</div>`
      + (list.length ? list.map(doubtRow).join('') : empty('message-square', C.qFilter === 'open' ? 'No questions waiting' : 'No questions here', 'Members ask from their Sessions page.'));
  } else {
    body.innerHTML = C.notes.length ? C.notes.map(noteRow).join('') : empty('sprout', 'No notes yet', 'Members write how they applied each session in real life.');
  }
}

// ---------------- editor ----------------
function mediaRow(m, urls) {
  const th = m.kind === 'image' && urls[m.ref] ? `<img src="${esc(urls[m.ref])}" alt="">`
    : m.kind === 'video_link' && youtubeId(m.ref) ? `<img src="https://i.ytimg.com/vi/${esc(youtubeId(m.ref))}/default.jpg" alt="">`
    : icon({ image: 'image', audio: 'mic', video_link: 'play', link: 'newspaper' }[m.kind]);
  const label = { image: 'Picture', audio: 'Audio', video_link: 'Video', link: 'Link' }[m.kind];
  return `<div class="se-m"><span class="th">${th}</span><span class="tx"><b>${esc(m.caption || label)}</b><small>${esc(m.kind === 'image' || m.kind === 'audio' ? label : m.ref)}</small></span>
    <button class="lnk-del" type="button" data-del-media="${m.id}" aria-label="Remove ${esc(label)}">${icon('x')}</button></div>`;
}

async function drawEditor(id) {
  const main = $('#main');
  const s = id ? C.sessions.find((x) => x.id === id) : null;
  C.editing = s ? s.id : null;
  const media = s ? C.media.filter((m) => m.session_id === s.id) : [];
  main.innerHTML = `
  <button class="back-link" type="button" data-back style="background:none;border:0;padding:0;cursor:pointer">${icon('chevron-left')}All sessions</button>
  <form class="card card-pad form" id="ses-form" novalidate style="gap:14px">
    <div class="set-h"><span class="si">${icon('book-open')}</span><h2>${s ? 'Edit session' : 'New session'}</h2></div>
    <div class="field"><label for="s-title">Title</label><input id="s-title" maxlength="120" required value="${esc(s?.title || '')}" placeholder="e.g. Session 3 · Money mindset"><span class="err"></span></div>
    <div class="field"><label for="s-date">Session date</label><input id="s-date" type="date" value="${esc(s?.session_date || istToday())}"><span class="err"></span></div>
    <div class="field"><label for="s-body">Notes &amp; instructions <span class="opt">(optional)</span></label><textarea id="s-body" maxlength="4000" rows="8" placeholder="Key points, references, what to practise this week">${esc(s?.body || '')}</textarea><span class="hint" id="s-count"></span></div>
    <label class="j-share"><span class="ic">${icon('eye')}</span><span><b>Show to members</b><small>Off = draft. Members get a notification when it is shown.</small></span>
      <input type="checkbox" id="s-pub" ${!s || s.is_published ? 'checked' : ''}><span class="sw" aria-hidden="true"></span></label>
    <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" type="submit" id="s-save">${s ? 'Save changes' : 'Create session'}</button>
      ${s ? `<button class="btn btn-ghost" type="button" id="s-del" style="color:var(--c-danger)">${icon('x')}Delete session</button>` : ''}</div>
  </form>
  <section class="card card-pad stack" style="gap:12px" aria-labelledby="sm-h">
    <div class="set-h"><span class="si">${icon('image')}</span><h2 id="sm-h">Pictures, audio &amp; videos</h2></div>
    ${s ? `<div class="se-media" id="se-media">${media.length ? '<div class="skeleton" style="height:60px"></div>' : '<p class="muted" style="font-size:13.5px">Nothing added yet.</p>'}</div>
    <div class="se-add">
      <label class="btn btn-ghost btn-sm">${icon('image')}Add pictures<input type="file" id="add-img" accept="image/*" multiple></label>
      <label class="btn btn-ghost btn-sm">${icon('mic')}Add audio<input type="file" id="add-aud" accept="audio/*"></label></div>
    <form class="se-link" id="link-form" novalidate>
      <div class="field"><label for="l-url">Video or reference link</label><input id="l-url" type="url" inputmode="url" maxlength="500" placeholder="https://youtu.be/…"><span class="err"></span></div>
      <div class="field"><label for="l-cap">Title <span class="opt">(optional)</span></label><input id="l-cap" maxlength="160" placeholder="e.g. Morning routine video"></div>
      <button class="btn btn-ghost" type="submit">${icon('arrow-right')}Add link</button></form>
    <p class="muted" style="font-size:12.5px">Pictures are made smaller before upload. Audio up to 15 MB (about 15 minutes). For long videos, upload to YouTube as “Unlisted” and add the link.</p>`
      : `<p class="muted" style="font-size:13.5px">Create the session first, then add pictures, audio and video links here.</p>`}
  </section>
  ${s ? `<section class="card card-pad stack" style="gap:10px"><div class="set-h"><span class="si">${icon('eye')}</span><h2>Preview</h2></div><div id="ses-prev"></div></section>` : ''}`;
  const cnt = () => { $('#s-count').textContent = `${$('#s-body').value.length}/4000`; };
  $('#s-body').addEventListener('input', cnt); cnt();
  if (s) refreshMedia();
}

async function refreshMedia() {
  const id = C.editing; if (!id || !$('#se-media')) return;
  const media = C.media.filter((m) => m.session_id === id);
  const urls = await signedUrls(media.filter((m) => m.kind === 'image' || m.kind === 'audio').map((m) => m.ref));
  if (C.editing !== id || !$('#se-media')) return;
  $('#se-media').innerHTML = media.length ? media.map((m) => mediaRow(m, urls)).join('') : '<p class="muted" style="font-size:13.5px">Nothing added yet.</p>';
  const s = C.sessions.find((x) => x.id === id);
  if ($('#ses-prev')) $('#ses-prev').innerHTML = `<div class="ses-detail"><span class="date">${esc(formatDate(s.session_date))}</span><h1>${esc(s.title)}</h1>${s.body ? `<div class="ses-body">${esc(s.body)}</div>` : ''}${mediaHTML(media, urls)}</div>`;
}

async function addMediaRow(row) {
  const { data, error } = await supabase.from('session_media').insert(row).select('id, session_id, kind, ref, caption, sort_order, created_at').single();
  if (error) throw error;
  C.media.push(data);
}

async function uploadFiles(files, kind) {
  const id = C.editing; if (!id) return;
  const label = kind === 'image' ? 'picture' : 'audio';
  let done = 0;
  for (const file of files) {
    try {
      let blob = file, ext, type;
      if (kind === 'image') { blob = await shrinkImage(file); ext = 'webp'; type = 'image/webp'; }
      else {
        if (file.size > 15 * 1024 * 1024) throw new Error('Audio is larger than 15 MB. Record a shorter clip or lower quality.');
        type = file.type || 'audio/mpeg';
        ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp3';
      }
      const path = `${id}/${fileName(ext)}`;
      toast(`Uploading ${label}${files.length > 1 ? ` ${done + 1}/${files.length}` : ''}…`, 'info');
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
      if (up.error) throw up.error;
      await addMediaRow({ session_id: id, kind, ref: path, caption: kind === 'audio' ? file.name.replace(/\.[^.]+$/, '').slice(0, 160) : null,
        sort_order: C.media.filter((m) => m.session_id === id).length });
      done++;
    } catch (err) { toast(friendlyError(err), 'bad'); }
  }
  if (done) toast(`${done} ${label}${done > 1 ? 's' : ''} added`);
  refreshMedia();
}

// ---------------- page ----------------
export async function renderSessions() {
  const main = $('#main');
  try { C.tab = sessionStorage.getItem('ryl.cs.tab') || 'sessions'; } catch { /* ignore */ }
  const want = new URLSearchParams(location.search).get('tab'); if (['sessions', 'questions', 'notes'].includes(want)) C.tab = want;
  main.innerHTML = `<div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:120px"></div>`;
  try { await loadAll(); } catch (err) { return errorPanel(main, err, renderSessions); }
  drawList();

  main.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { C.tab = t.dataset.tab; try { sessionStorage.setItem('ryl.cs.tab', C.tab); } catch { /* ignore */ } return drawList(); }
    const qf = e.target.closest('[data-qf]'); if (qf) { C.qFilter = qf.dataset.qf; return drawList(); }
    if (e.target.closest('#new-ses')) return drawEditor(null);
    const ed = e.target.closest('[data-edit]'); if (ed) return drawEditor(ed.dataset.edit);
    if (e.target.closest('[data-back]')) { C.editing = null; return drawList(); }
    const dm = e.target.closest('[data-del-media]');
    if (dm) {
      const m = C.media.find((x) => x.id === dm.dataset.delMedia);
      if (!(await confirmDialog({ title: 'Remove this item?', body: 'Members will no longer see it.', confirmLabel: 'Remove', danger: true }))) return;
      const { error } = await supabase.from('session_media').delete().eq('id', m.id);
      if (error) return toast(friendlyError(error), 'bad');
      if (m.kind === 'image' || m.kind === 'audio') supabase.storage.from(BUCKET).remove([m.ref]);
      C.media = C.media.filter((x) => x.id !== m.id); toast('Removed'); return refreshMedia();
    }
    if (e.target.closest('#s-del')) {
      const s = C.sessions.find((x) => x.id === C.editing);
      if (!(await confirmDialog({ title: `Delete “${s.title}”?`, body: 'Its pictures, audio and links are deleted too. Members\' questions and notes stay, without the session name.', confirmLabel: 'Delete session', danger: true }))) return;
      const files = C.media.filter((m) => m.session_id === s.id && (m.kind === 'image' || m.kind === 'audio')).map((m) => m.ref);
      const { error } = await supabase.from('sessions').delete().eq('id', s.id);
      if (error) return toast(friendlyError(error), 'bad');
      if (files.length) supabase.storage.from(BUCKET).remove(files);
      C.sessions = C.sessions.filter((x) => x.id !== s.id); C.media = C.media.filter((m) => m.session_id !== s.id);
      C.editing = null; toast('Session deleted'); return drawList();
    }
  });
  main.addEventListener('change', (e) => {
    if (e.target.id === 'add-img' && e.target.files.length) { const f = [...e.target.files]; e.target.value = ''; uploadFiles(f.slice(0, 12), 'image'); }
    if (e.target.id === 'add-aud' && e.target.files.length) { const f = [...e.target.files]; e.target.value = ''; uploadFiles(f.slice(0, 1), 'audio'); }
  });
  main.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'ses-form') {
      const title = $('#s-title').value.trim(), date = $('#s-date').value, body = $('#s-body').value.trim(), pub = $('#s-pub').checked;
      const tf = $('#s-title').closest('.field');
      tf.classList.toggle('invalid', title.length < 2); tf.querySelector('.err').textContent = title.length < 2 ? 'Give the session a title.' : '';
      if (title.length < 2) return $('#s-title').focus();
      const row = { title, session_date: date || istToday(), body: body || null, is_published: pub };
      await withBusy($('#s-save'), 'Saving…', async () => {
        const q = C.editing ? supabase.from('sessions').update(row).eq('id', C.editing) : supabase.from('sessions').insert(row);
        const { data, error } = await q.select('id, title, session_date, body, is_published, created_at, updated_at').single();
        if (error) return toast(friendlyError(error), 'bad');
        const i = C.sessions.findIndex((x) => x.id === data.id);
        if (i >= 0) C.sessions[i] = data; else C.sessions.unshift(data);
        const isNew = !C.editing;
        toast(isNew ? (pub ? 'Session created. Members were notified.' : 'Draft saved') : 'Session saved');
        if (isNew) drawEditor(data.id); else refreshMedia();
      });
    }
    if (f.id === 'link-form') {
      let url = $('#l-url').value.trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      url = url.replace(/^http:\/\//i, 'https://');
      const lf = $('#l-url').closest('.field'), bad = !isHttps(url);
      lf.classList.toggle('invalid', bad); lf.querySelector('.err').textContent = bad ? 'Paste a full link, for example https://youtu.be/…' : '';
      if (bad) return $('#l-url').focus();
      const btn = f.querySelector('[type=submit]');
      await withBusy(btn, 'Adding…', async () => {
        try {
          await addMediaRow({ session_id: C.editing, kind: youtubeId(url) || /vimeo\.com|drive\.google\.com\/file/.test(url) ? 'video_link' : 'link', ref: url,
            caption: $('#l-cap').value.trim() || null, sort_order: C.media.filter((m) => m.session_id === C.editing).length });
          f.reset(); toast('Link added'); refreshMedia();
        } catch (err) { toast(friendlyError(err), 'bad'); }
      });
    }
    if (f.dataset.answer) {
      const ta = f.querySelector('textarea'), ans = ta.value.trim();
      if (ans.length < 2) { ta.focus(); return toast('Type an answer first', 'info'); }
      await withBusy(f.querySelector('[type=submit]'), 'Sending…', async () => {
        const { error } = await supabase.rpc('admin_answer_doubt', { p_doubt: f.dataset.answer, p_answer: ans });
        if (error) return toast(friendlyError(error), 'bad');
        Object.assign(C.doubts.find((x) => x.id === f.dataset.answer), { answer: ans, answered_at: new Date().toISOString() });
        toast('Answer sent. The member gets a notification.'); drawList();
      });
    }
  });
}

// ---------------- member page extras (coach view of one member) ----------------
const GOALS = [['goal_year', 'This year'], ['goal_month', 'This month'], ['goal_week', 'This week'], ['net_worth', 'Net worth'], ['turnover', 'Turnover'],
  ['profit', 'Profit'], ['problems', 'Problems & challenges'], ['expectations', 'Expectations']];
export async function memberExtras(target, memberId) {
  target.innerHTML = '<div class="skeleton" style="height:120px"></div>';
  const [p, g, n, d, s] = await Promise.all([
    supabase.from('profiles').select('city, profession, dream, hobbies, website').eq('id', memberId).maybeSingle(),
    supabase.from('member_goals').select('*').eq('member_id', memberId).maybeSingle(),
    supabase.from('session_notes').select('id, session_id, activity_id, situation, application, image_ref, created_at, activities(default_name)').eq('member_id', memberId).order('created_at', { ascending: false }).limit(20),
    supabase.from('doubts').select('id, session_id, activity_id, question, answer, answered_at, created_at, activities(default_name)').eq('member_id', memberId).order('created_at', { ascending: false }).limit(20),
    supabase.from('sessions').select('id, title')
  ]);
  if (p.error && g.error) { target.innerHTML = ''; return; }        // older database: nothing extra to show
  C.sessions = s.data || [];
  C.pics = await memberPicUrls((n.data || []).filter((x) => x.image_ref).map((x) => x.image_ref));
  const about = p.data ? [['City', p.data.city], ['Profession', p.data.profession], ['Dream', p.data.dream], ['Hobbies', p.data.hobbies]].filter(([, v]) => v) : [];
  const web = p.data?.website;
  const goals = g.data ? GOALS.filter(([k]) => g.data[k]) : [];
  target.innerHTML = `
  <div class="mp-extra">
    <section class="card card-pad stack" style="gap:10px"><div class="set-h"><span class="si">${icon('user-round')}</span><h2>About</h2></div>
      ${about.length || web ? `<dl class="about-list">${about.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}
        ${web && isHttps(web.replace(/^http:/i, 'https:')) ? `<div><dt>Website</dt><dd><a href="${esc(web)}" target="_blank" rel="noopener noreferrer">${esc(web.replace(/^https?:\/\//, ''))}</a></dd></div>` : ''}</dl>`
        : '<p class="muted" style="font-size:13.5px">The member has not filled these in yet.</p>'}</section>
    <section class="card card-pad stack" style="gap:10px"><div class="set-h"><span class="si">${icon('target')}</span><h2>Goals</h2></div>
      <p class="lock-line">${icon('lock')}Private to this member and coaches.</p>
      ${goals.length ? `<dl class="about-list">${goals.map(([k, l]) => `<div><dt>${l}</dt><dd>${esc(g.data[k])}</dd></div>`).join('')}</dl>
        <small class="muted" style="font-size:12px">Updated ${esc(ago(g.data.updated_at))}</small>` : '<p class="muted" style="font-size:13.5px">No goals written yet.</p>'}</section>
  </div>
  ${(d.data || []).length ? `<section class="stack" style="gap:10px"><div class="sec-h"><h2>Questions</h2><a href="${app('admin/sessions.html?tab=questions')}">Answer in Sessions${icon('chevron-right')}</a></div>
    ${d.data.map((q) => doubtRow({ ...q, member_id: memberId, profiles: null })).join('').replace(/<div class="inbox-who">[\s\S]*?<\/div>/g, '')}</section>` : ''}
  ${(n.data || []).length ? `<section class="stack" style="gap:10px"><div class="sec-h"><h2>Real life vs application</h2></div>
    ${n.data.map((x) => noteRow({ ...x, member_id: memberId, profiles: null })).join('').replace(/<div class="inbox-who">[\s\S]*?<\/div>/g, '')}</section>` : ''}`;
  // answers from this page too (listener added once)
  if (target.dataset.wired) return;
  target.dataset.wired = '1';
  target.addEventListener('submit', async (e) => {
    const f = e.target.closest('[data-answer]'); if (!f) return;
    e.preventDefault();
    const ta = f.querySelector('textarea'), ans = ta.value.trim();
    if (ans.length < 2) { ta.focus(); return toast('Type an answer first', 'info'); }
    await withBusy(f.querySelector('[type=submit]'), 'Sending…', async () => {
      const { error } = await supabase.rpc('admin_answer_doubt', { p_doubt: f.dataset.answer, p_answer: ans });
      if (error) return toast(friendlyError(error), 'bad');
      toast('Answer sent'); memberExtras(target, memberId);
    });
  });
}

// ---------------- coach: explanation for one habit point (Activities page) ----------------
export async function openPointMedia(a, onChange = () => {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="dialog pt-sheet" role="dialog" aria-modal="true" aria-labelledby="pm-t">
    <div class="pt-head"><span class="pt-no">${String(a.number).padStart(2, '0')}</span><div><h2 id="pm-t">${esc(a.default_name)}</h2><p>Explain this point: audio, pictures and video links. Members open it from the tracker card.</p></div>
      <button class="iconbtn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="pt-body stack" style="gap:12px"><div class="se-media" id="pm-list"><div class="skeleton" style="height:56px"></div></div>
      <div class="se-add"><label class="btn btn-ghost btn-sm">${icon('mic')}Add audio<input type="file" id="pm-aud" accept="audio/*"></label>
        <label class="btn btn-ghost btn-sm">${icon('image')}Add pictures<input type="file" id="pm-img" accept="image/*" multiple></label></div>
      <form class="se-link" id="pm-link" novalidate>
        <div class="field"><label for="pm-url">Video or reference link</label><input id="pm-url" type="url" inputmode="url" maxlength="500" placeholder="https://youtu.be/…"><span class="err"></span></div>
        <div class="field"><label for="pm-cap">Title <span class="opt">(optional)</span></label><input id="pm-cap" maxlength="160"></div>
        <button class="btn btn-ghost" type="submit">${icon('arrow-right')}Add link</button></form>
      <p class="muted" style="font-size:12.5px">Tip: on the phone, “Add audio” can record a voice note directly. Audio up to 15 MB.</p></div></div>`;
  document.body.appendChild(scrim);
  const close = () => scrim.remove();
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  let media = [];
  const refresh = async () => {
    const urls = await signedUrls(media.filter((m) => m.kind === 'image' || m.kind === 'audio').map((m) => m.ref));
    scrim.querySelector('#pm-list').innerHTML = media.length ? media.map((m) => mediaRow(m, urls)).join('') : '<p class="muted" style="font-size:13.5px">Nothing added yet.</p>';
    onChange(media.length);
  };
  const { data, error } = await supabase.from('activity_media').select('id, activity_id, kind, ref, caption, sort_order, created_at').eq('activity_id', a.id).order('sort_order').order('created_at');
  if (error) { scrim.querySelector('#pm-list').innerHTML = `<p class="muted">${esc(friendlyError(error))}</p>`; return; }
  media = data || []; refresh();
  const add = async (row) => {
    const { data: r, error: e } = await supabase.from('activity_media').insert({ activity_id: a.id, sort_order: media.length, ...row }).select('id, activity_id, kind, ref, caption, sort_order, created_at').single();
    if (e) throw e; media.push(r);
  };
  scrim.addEventListener('change', async (e) => {
    const kind = e.target.id === 'pm-aud' ? 'audio' : e.target.id === 'pm-img' ? 'image' : null;
    if (!kind || !e.target.files.length) return;
    const files = [...e.target.files].slice(0, kind === 'audio' ? 1 : 8); e.target.value = '';
    for (const file of files) {
      try {
        let blob = file, ext, type;
        if (kind === 'image') { blob = await shrinkImage(file); ext = 'webp'; type = 'image/webp'; }
        else {
          if (file.size > 15 * 1024 * 1024) throw new Error('Audio is larger than 15 MB.');
          type = file.type || 'audio/mpeg'; ext = (file.name.split('.').pop() || 'm4a').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'm4a';
        }
        const path = `${a.id}/${fileName(ext)}`;
        toast(`Uploading ${kind === 'image' ? 'picture' : 'audio'}…`, 'info');
        const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, upsert: false });
        if (up.error) throw up.error;
        await add({ kind, ref: path, caption: kind === 'audio' ? file.name.replace(/\.[^.]+$/, '').slice(0, 160) : null });
        toast(kind === 'image' ? 'Picture added' : 'Audio added');
      } catch (err) { toast(friendlyError(err), 'bad'); }
    }
    refresh();
  });
  scrim.addEventListener('click', async (e) => {
    const dm = e.target.closest('[data-del-media]'); if (!dm) return;
    const m = media.find((x) => x.id === dm.dataset.delMedia);
    if (!(await confirmDialog({ title: 'Remove this item?', body: 'Members will no longer see it.', confirmLabel: 'Remove', danger: true }))) return;
    const { error: e2 } = await supabase.from('activity_media').delete().eq('id', m.id);
    if (e2) return toast(friendlyError(e2), 'bad');
    if (m.kind === 'image' || m.kind === 'audio') supabase.storage.from(BUCKET).remove([m.ref]);
    media = media.filter((x) => x.id !== m.id); toast('Removed'); refresh();
  });
  scrim.querySelector('#pm-link').addEventListener('submit', async (e) => {
    e.preventDefault();
    let url = scrim.querySelector('#pm-url').value.trim(); if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/^http:\/\//i, 'https://');
    const lf = scrim.querySelector('#pm-url').closest('.field'), bad = !isHttps(url);
    lf.classList.toggle('invalid', bad); lf.querySelector('.err').textContent = bad ? 'Paste a full link, for example https://youtu.be/…' : '';
    if (bad) return;
    await withBusy(e.target.querySelector('[type=submit]'), 'Adding…', async () => {
      try {
        await add({ kind: youtubeId(url) || /vimeo\.com|drive\.google\.com\/file/.test(url) ? 'video_link' : 'link', ref: url, caption: scrim.querySelector('#pm-cap').value.trim() || null });
        e.target.reset(); toast('Link added'); refresh();
      } catch (err) { toast(friendlyError(err), 'bad'); }
    });
  });
}
