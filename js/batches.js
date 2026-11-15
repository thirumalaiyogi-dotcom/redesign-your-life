// Coach console: Batches (people + "Day N done ✓"), Programs (classes and the trackers each opens)
// and Trackers (create a new tracker sheet, add its habits).
// Accounts are created by the database (admin_batch_add_people); passwords are shown once, here, to send on WhatsApp.
import { supabase, app } from './supabase.js';
import { friendlyError } from './auth.js';
import { $, $$, icon, esc, toast, withBusy, confirmDialog, formatDate, formatNumber } from './ui.js';

const KIND = { online: 'Online program', membership: 'Membership', workshop: 'Physical workshop' };
const COLORS = ['#5b8cf0', '#22aa66', '#e7b54a', '#e0605a', '#f08a3c', '#9b6bd6', '#d0629b', '#2bb3b1'];
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const ago = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return formatDate(iso);
};
const empty = (ic, title, sub) => `<div class="panel empty-state"><span class="ic">${icon(ic)}</span><b>${title}</b><span>${sub}</span></div>`;
function errorPanel(target, err, retry) {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span><b>Couldn't load this</b>
    <span>${esc(friendlyError(err))}</span><button class="btn btn-ghost btn-sm" data-retry>${icon('rotate-ccw')}Try again</button></div>`;
  target.querySelector('[data-retry]').addEventListener('click', retry);
}

// "Name, email, phone" per line (comma, tab or several spaces). Email can be in any column.
export function parsePeople(text) {
  const out = [], bad = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const parts = line.split(/\t|,|;|\s{2,}|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
    const ei = parts.findIndex((x) => /\S+@\S+\.\S+/.test(x));
    if (ei < 0) { bad.push(line); continue; }
    const email = parts[ei].replace(/^mailto:/i, '').toLowerCase();
    const rest = parts.filter((_, i) => i !== ei);
    const pi = rest.findIndex((x) => /^\+?[\d\s-]{7,}$/.test(x));
    const phone = pi >= 0 ? rest[pi].replace(/-/g, ' ').replace(/\s+/g, ' ') : '';
    const name = rest.filter((_, i) => i !== pi).join(' ').slice(0, 80);
    if (out.some((p) => p.email === email)) continue;
    out.push({ name, email, phone });
  }
  return { people: out, bad };
}

// WhatsApp link with the login message. Indian 10-digit numbers get 91 in front.
export function waLink(phone, text) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return `https://wa.me/${d.length >= 11 ? d : ''}?text=${encodeURIComponent(text)}`;
}
export function loginMessage(name, email, pw) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const gmail = /@(gmail|googlemail)\.com$/i.test(email);
  return `Hi${first ? ' ' + first : ''},\n\nDeepak's 10X Life app login details\n\nLink: ${app('login.html')}\n`
    + (gmail ? `\n"Continue with Google" click panni ${email} select pannunga, udane ulla poidalam.\n\nIllana email password vechum login pannalam:\n` : '\n')
    + `Email: ${email}\nPassword: ${pw}\n\nPassword vechu first time login pannumbothu unga own password set panna sollum.\nPhone la open panni "Add to Home screen" pannina app maari use pannalam.`;
}
// one message for the whole WhatsApp group: everyone with a Gmail just taps "Continue with Google"
export function groupMessage() {
  return `Deepak's 10X Life app ready 🙏\n\nLink: ${app('login.html')}\n\n"Continue with Google" click panni, coach kitta kudutha Gmail select pannunga. Udane ulla poidalam.\n\nGmail illathavangalukku email, password thaniya anuppurom.\nPhone la open panni "Add to Home screen" pannina app maari use pannalam.`;
}

const B = { tab: 'batches', programs: [], steps: [], stepTrackers: [], batches: [], done: [], trackers: [], habits: [], open: null, prog: null, trk: null, added: [], signup: null };

async function loadAll() {
  const [p, s, st, b, d, t, h, cnt, su] = await Promise.all([
    supabase.from('programs').select('id, name, kind, is_active, sort_order').order('sort_order').order('name'),
    supabase.from('program_steps').select('id, program_id, day_no, title').order('day_no'),
    supabase.from('step_trackers').select('step_id, category_id'),
    supabase.from('batches').select('id, program_id, name, starts_on, is_active, created_at').order('starts_on', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('batch_steps_done').select('batch_id, step_id, done_at'),
    supabase.from('tracker_categories').select('id, slug, name, tagline, color, audience, show_locked, is_active, sort_order').order('sort_order'),
    supabase.from('activities').select('id, category_id, number, default_name, description, points, is_active').order('number'),
    supabase.from('batch_members').select('batch_id'),
    supabase.from('app_settings').select('value').eq('key', 'open_signup').maybeSingle()
  ]);
  const err = p.error || s.error || st.error || b.error || d.error || t.error || h.error || cnt.error;
  if (err) throw err;
  Object.assign(B, { programs: p.data, steps: s.data, stepTrackers: st.data, batches: b.data, done: d.data, trackers: t.data, habits: h.data });
  B.counts = {}; for (const r of cnt.data) B.counts[r.batch_id] = (B.counts[r.batch_id] || 0) + 1;
  B.signup = su.data ? su.data.value === true : null;
}
const prog = (id) => B.programs.find((x) => x.id === id);
const stepsOf = (pid) => B.steps.filter((s) => s.program_id === pid).sort((a, b) => a.day_no - b.day_no);
const trackersOfStep = (sid) => B.stepTrackers.filter((x) => x.step_id === sid).map((x) => B.trackers.find((t) => t.id === x.category_id)).filter(Boolean);
const isDone = (bid, sid) => B.done.find((x) => x.batch_id === bid && x.step_id === sid);

// ---------------- page ----------------
export async function renderBatches(me) {
  const main = $('#main');
  B.isSuper = me.profile.role === 'super_admin';
  try { B.tab = sessionStorage.getItem('ryl.bt.tab') || 'batches'; } catch { /* ignore */ }
  main.innerHTML = `<div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:160px"></div>`;
  try { await loadAll(); } catch (err) { return errorPanel(main, err, () => renderBatches(me)); }
  draw();
  main.addEventListener('click', onClick);
  main.addEventListener('submit', onSubmit);
  main.addEventListener('change', onChange);
}

function draw() {
  const main = $('#main');
  if (B.open) return drawBatch();
  const tabs = [['batches', 'users', 'Batches'], ['programs', 'calendar', 'Programs'], ['trackers', 'list-checks', 'Trackers']];
  main.innerHTML = `<div class="admin-head"><div><span class="eyebrow">Programs · batches · trackers</span><h1>Batches</h1></div></div>
    <div class="seg bt-seg" role="tablist" aria-label="Section">${tabs.map(([k, ic, l]) => `<button role="tab" data-tab="${k}" aria-selected="${B.tab === k}">${icon(ic)}${l}</button>`).join('')}</div>
    <div id="bt-body" class="stack" style="gap:14px"></div>`;
  const body = $('#bt-body');
  if (B.tab === 'batches') body.innerHTML = batchesHTML();
  if (B.tab === 'programs') body.innerHTML = programsHTML();
  if (B.tab === 'trackers') body.innerHTML = trackersHTML();
}

// ---------- Batches list ----------
function batchesHTML() {
  const active = B.batches.filter((b) => b.is_active), old = B.batches.filter((b) => !b.is_active);
  const card = (b) => {
    const st = stepsOf(b.program_id), dn = st.filter((s) => isDone(b.id, s.id)).length;
    return `<button class="panel bt-card" data-open="${b.id}">
      <div class="bt-c-top"><b>${esc(b.name)}</b><span class="pill ${b.is_active ? 'ok' : 'none'}">${b.is_active ? 'Running' : 'Finished'}</span></div>
      <small>${esc(prog(b.program_id)?.name || '')} · starts ${esc(formatDate(b.starts_on))}</small>
      <div class="bt-c-row"><span>${icon('users')}${formatNumber(B.counts[b.id] || 0)} people</span><span>${icon('check-circle-2')}${dn}/${st.length} classes done</span>${icon('chevron-right')}</div>
      ${st.length ? `<div class="bt-prog"><i style="width:${Math.round(100 * dn / st.length)}%"></i></div>` : ''}</button>`;
  };
  return `<form class="panel panel-pad form bt-new" id="new-batch" novalidate>
      <b>New batch</b>
      <div class="bt-grid3">
        <div class="field"><label for="nb-prog">Program</label><select id="nb-prog">${B.programs.filter((p) => p.is_active).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="nb-name">Batch name</label><input id="nb-name" maxlength="80" placeholder="e.g. 7-Day · 16 Nov"><span class="err"></span></div>
        <div class="field"><label for="nb-start">Starts on</label><input id="nb-start" type="date" value="${istToday()}"></div>
      </div>
      <button class="btn btn-primary" type="submit">${icon('user-plus')}Create batch</button></form>
    ${active.length ? `<div class="bt-cards">${active.map(card).join('')}</div>` : empty('users', 'No batches yet', 'Create a batch, then paste the people list to make their logins.')}
    ${old.length ? `<details class="panel bt-old"><summary>Finished batches (${old.length})</summary><div class="bt-cards">${old.map(card).join('')}</div></details>` : ''}
    ${B.isSuper && B.signup !== null ? `<section class="panel panel-pad bt-signup"><div><b>Self sign-up</b><small>${B.signup ? 'Open: anyone with the link can make an account on the Join page.' : 'Closed: only people you add to a batch get an account.'}</small></div>
      <button class="btn btn-ghost btn-sm" data-signup="${B.signup ? 'close' : 'open'}">${B.signup ? 'Close sign-up' : 'Open sign-up'}</button></section>` : ''}`;
}

// ---------- One batch ----------
async function drawBatch() {
  const main = $('#main'), b = B.batches.find((x) => x.id === B.open);
  if (!b) { B.open = null; return draw(); }
  const st = stepsOf(b.program_id);
  main.innerHTML = `<button class="back-link" data-back>${icon('arrow-left')}All batches</button>
    <section class="panel panel-pad bt-head">
      <div><span class="eyebrow">${esc(prog(b.program_id)?.name || '')} · starts ${esc(formatDate(b.starts_on))}</span><h1>${esc(b.name)}</h1></div>
      <div class="bt-head-a"><a class="btn btn-ghost btn-sm" href="${app('admin/leaderboard.html')}?batch=${b.id}">${icon('trophy')}Leaderboard</a>
        <button class="btn btn-ghost btn-sm" data-finish="${b.is_active ? 'yes' : 'no'}">${b.is_active ? 'Mark finished' : 'Reopen'}</button></div></section>

    <section class="panel"><div class="panel-h"><h3>Classes</h3><span class="muted" style="font-size:13px">Tap after the class: its trackers open for this batch</span></div>
      ${st.length ? `<div class="bt-steps">${st.map((s) => {
        const d = isDone(b.id, s.id), tr = trackersOfStep(s.id);
        return `<div class="bt-step ${d ? 'done' : ''}"><span class="bt-no">${s.day_no}</span>
          <div class="bt-st-tx"><b>${esc(s.title)}</b><small>${tr.length ? 'Opens: ' + tr.map((t) => esc(t.name)).join(', ') : 'No tracker linked'}${d ? ' · done ' + esc(ago(d.done_at)) : ''}</small></div>
          ${d ? `<button class="btn btn-ghost btn-sm" data-undo="${s.id}">${icon('check')}Done</button>`
              : `<button class="btn btn-primary btn-sm" data-done="${s.id}">Day ${s.day_no} done ✓</button>`}</div>`;
      }).join('')}</div>` : `<p class="muted" style="padding:14px 16px">This program has no classes yet. Add them under Programs.</p>`}</section>

    <form class="panel panel-pad form" id="add-people" novalidate>
      <b>Add people</b>
      <div class="field"><label for="ap-list">Paste the list: one person per line — name, email, phone</label>
        <textarea id="ap-list" rows="5" placeholder="Meena S, meena@gmail.com, 98400 11111&#10;Ravi Kumar, ravi@gmail.com, 99620 22222"></textarea><span class="err"></span></div>
      <div class="bt-file"><label class="btn btn-ghost btn-sm">${icon('file-chart-column')}<span id="ap-file-l">Or upload Excel / CSV</span><input type="file" id="ap-file" accept=".xlsx,.xls,.csv,text/csv" class="visually-hidden"></label>
        <small class="muted">Name, email and phone columns are found automatically. Check the list, then tap Add.</small></div>
      <p class="muted" style="font-size:13px">New emails get a login with a temporary password. They set their own password the first time they log in. Emails that already have an account are just added to this batch.</p>
      <button class="btn btn-primary" type="submit">${icon('user-plus')}Add to batch</button></form>
    <div id="ap-result"></div>
    <section class="panel"><div class="panel-h"><h3>People</h3><span id="bp-count" class="muted"></span></div><div id="bp-list"><div class="skeleton" style="height:120px;margin:12px"></div></div></section>`;
  if (B.added.length) drawAdded();
  loadPeople(b);
}

function drawAdded() {
  const box = $('#ap-result'); if (!box) return;
  const made = B.added.filter((r) => r.temp_password), other = B.added.filter((r) => !r.temp_password);
  const label = { existing: 'Already had an account, added', bad_email: 'Email looks wrong, skipped', not_member: 'Coach account, skipped' };
  box.innerHTML = `<section class="panel bt-added"><div class="panel-h"><h3>Send logins (${made.length})</h3>
      <span class="bt-h-a"><button class="btn btn-ghost btn-sm" data-copy-group>${icon('copy')}Group message</button>
      ${made.length ? `<button class="btn btn-ghost btn-sm" data-copy-all>${icon('copy')}Copy all</button>` : ''}</span></div>
    <p class="muted bt-warn">${icon('info')}<span>Gmail users can just tap “Continue with Google”, so one group message is enough for them. Send personal messages (with password) to the others.</span></p>
    <p class="muted bt-warn">${icon('info')}<span>Passwords are shown only now. Send them before leaving this page. (Lost one? Use “New password” in the list below.)</span></p>
    ${made.map((r) => `<div class="bt-login"><div><b>${esc(r.full_name || r.email)}</b>${/@(gmail|googlemail)\.com$/i.test(r.email) ? '<span class="pill ok" style="margin-left:6px">Google</span>' : ''}<small>${esc(r.email)} · <code>${esc(r.temp_password)}</code></small></div>
      <a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="${esc(waLink(r.phone, loginMessage(r.full_name, r.email, r.temp_password)))}">${icon('message-square')}WhatsApp</a></div>`).join('')}
    ${other.length ? `<div class="bt-other">${other.map((r) => `<small><b>${esc(r.full_name || r.email)}</b> · ${esc(label[r.status] || r.status)}</small>`).join('')}</div>` : ''}
    <button class="btn btn-ghost btn-sm" data-clear-added style="margin:0 16px 14px">Done sending</button></section>`;
}

async function loadPeople(b) {
  const box = $('#bp-list'); if (!box) return;
  const { data, error } = await supabase.rpc('admin_batch_people', { p_batch: b.id });
  if (error) return errorPanel(box, error, () => loadPeople(b));
  B.people = data || []; B.sel = new Set();
  $('#bp-count').textContent = `${B.people.length} · ${B.people.filter((p) => p.must_change).length} not logged in yet`;
  drawPeople();
}
// people list with tick boxes: tick some (e.g. who paid for the membership) and add them to another batch
function drawPeople() {
  const box = $('#bp-list'); if (!box) return;
  const others = B.batches.filter((x) => x.is_active && x.id !== B.open);
  const n = B.sel.size;
  box.innerHTML = B.people.length ? `
    <div class="bt-selbar ${n ? 'on' : ''}">
      <label class="check"><input type="checkbox" id="sel-all" ${n && n === B.people.length ? 'checked' : ''}>${n ? `${n} selected` : 'Select people'}</label>
      ${n ? (others.length ? `<div class="bt-move"><select id="sel-target" aria-label="Batch to add them to">${others.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
        <button class="btn btn-primary btn-sm" data-add-sel>${icon('user-plus')}Add to batch</button></div>`
        : '<small class="muted">Create the other batch first (e.g. 60-Day Membership), then come back.</small>') : ''}
    </div>
    <div class="bt-people">${B.people.map((p) => `<div class="bt-person ${B.sel.has(p.member_id) ? 'sel' : ''}">
      <label class="bt-tick"><input type="checkbox" data-sel="${p.member_id}" ${B.sel.has(p.member_id) ? 'checked' : ''} aria-label="Select ${esc(p.full_name || p.email)}"></label>
      <div><b><a class="link" href="${app('admin/member.html')}?id=${p.member_id}">${esc(p.full_name || p.email)}</a></b>
        <small>${esc(p.email)}${p.phone ? ' · ' + esc(p.phone) : ''}</small>
        <small>${p.must_change ? `<span class="pill gold">First login pending</span>` : `<span class="pill ok">Active</span> last login ${esc(ago(p.last_sign_in_at))}`} · ${formatNumber(p.points)} pts in batch</small></div>
      <div class="bt-p-a"><button class="btn btn-ghost btn-sm" data-newpw="${p.member_id}" title="Make a new temporary password">${icon('key-round')}New password</button>
        <button class="iconbtn" data-remove="${p.member_id}" aria-label="Remove ${esc(p.full_name)} from this batch">${icon('x')}</button></div></div>`).join('')}</div>`
    : `<p class="muted" style="padding:14px 16px">No one yet. Paste the list above.</p>`;
}

// ---------- Programs ----------
function programsHTML() {
  const p = B.prog ? prog(B.prog) : null;
  const assigned = B.trackers.filter((t) => t.audience === 'assigned' && t.is_active);
  return `<div class="chips bt-chips">${B.programs.map((x) => `<button class="chip" aria-pressed="${x.id === B.prog}" data-prog="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    ${p ? `<section class="panel"><div class="panel-h"><h3>${esc(p.name)}</h3><span class="pill blue">${esc(KIND[p.kind] || p.kind)}</span></div>
      <p class="muted" style="padding:0 16px;font-size:13px">For each class, tick the trackers it opens. When you mark the class done for a batch, those trackers open for everyone in it.</p>
      <div class="bt-steps">${stepsOf(p.id).map((s) => `<div class="bt-step ed"><span class="bt-no">${s.day_no}</span>
        <div class="bt-st-tx"><input class="bt-title" data-step-title="${s.id}" value="${esc(s.title)}" maxlength="120" aria-label="Class ${s.day_no} title">
          <div class="chips">${assigned.map((t) => {
            const on = B.stepTrackers.some((x) => x.step_id === s.id && x.category_id === t.id);
            return `<button class="chip sm bt-tchip" data-st="${s.id}" data-cat="${t.id}" aria-pressed="${on}" style="--tc:${esc(t.color)}">${on ? icon('check') : ''}${esc(t.name)}</button>`;
          }).join('')}</div></div>
        <button class="iconbtn" data-del-step="${s.id}" aria-label="Delete class ${s.day_no}">${icon('x')}</button></div>`).join('') || '<p class="muted" style="padding:14px 16px">No classes yet.</p>'}</div>
      <div class="bt-add-step"><button class="btn btn-ghost btn-sm" data-add-step="${p.id}">${icon('calendar')}Add class ${stepsOf(p.id).length + 1}</button></div></section>`
      : `<p class="muted">Pick a program to set its classes.</p>`}
    <form class="panel panel-pad form" id="new-prog" novalidate><b>New program</b>
      <div class="bt-grid3"><div class="field"><label for="np-name">Name</label><input id="np-name" maxlength="80" placeholder="e.g. Couple Workshop – Chennai"><span class="err"></span></div>
      <div class="field"><label for="np-kind">Type</label><select id="np-kind">${Object.entries(KIND).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
      <div class="field"><label for="np-days">Number of classes</label><input id="np-days" type="number" min="0" max="90" value="7"></div></div>
      <button class="btn btn-primary" type="submit">Create program</button></form>`;
}

// ---------- Trackers ----------
function trackersHTML() {
  const t = B.trk ? B.trackers.find((x) => x.id === B.trk) : null;
  const hs = t ? B.habits.filter((h) => h.category_id === t.id) : [];
  return `<div class="bt-trk">${B.trackers.map((x) => `<button class="panel bt-trk-c ${x.id === B.trk ? 'on' : ''}" data-trk="${x.id}" style="--tc:${esc(x.color)}">
      <i></i><b>${esc(x.name)}</b><small>${B.habits.filter((h) => h.category_id === x.id && h.is_active).length} habits${x.show_locked ? ' · shown locked' : ''}</small></button>`).join('')}</div>
    ${t ? `<form class="panel panel-pad form" id="edit-trk" novalidate style="--tc:${esc(t.color)}"><b>${esc(t.name)}</b>
        <div class="bt-grid3"><div class="field"><label for="et-name">Name</label><input id="et-name" maxlength="60" value="${esc(t.name)}"><span class="err"></span></div>
        <div class="field"><label for="et-tag">Tagline</label><input id="et-tag" maxlength="160" value="${esc(t.tagline || '')}"></div>
        <div class="field"><label for="et-color">Colour</label><input id="et-color" type="color" value="${esc(t.color)}"></div></div>
        <label class="check"><input type="checkbox" id="et-locked" ${t.show_locked ? 'checked' : ''}>Show it to everyone as locked until it is opened</label>
        <button class="btn btn-ghost btn-sm" type="submit">Save tracker</button></form>
      <section class="panel"><div class="panel-h"><h3>Habits (${hs.length})</h3><a class="link" style="font-size:13px" href="${app('admin/activities.html')}">Add explanations →</a></div>
        <div class="bt-habits">${hs.map((h) => `<div class="bt-habit ${h.is_active ? '' : 'off'}"><span class="bt-no">${String(h.number).padStart(2, '0')}</span><div><b>${esc(h.default_name)}</b>${h.description ? `<small>${esc(h.description)}</small>` : ''}</div><span class="pts-chip">+${h.points}</span></div>`).join('') || '<p class="muted" style="padding:14px 16px">No habits yet. Add the first one below.</p>'}</div>
        <form class="form bt-habit-new" id="new-habit" novalidate>
          <div class="field"><label for="nh-name">New habit ${hs.length + 1}</label><input id="nh-name" maxlength="80" placeholder="Habit name (cannot be renamed later)"><span class="err"></span></div>
          <div class="field"><label for="nh-desc">One line about it <span class="opt">(optional)</span></label><input id="nh-desc" maxlength="400"></div>
          <div class="bt-row"><div class="field" style="max-width:120px"><label for="nh-pts">Points</label><input id="nh-pts" type="number" min="0" max="100" value="10"></div>
          <button class="btn btn-primary" type="submit">Add habit</button></div></form></section>` : ''}
    <form class="panel panel-pad form" id="new-trk" novalidate><b>New tracker sheet</b>
      <div class="bt-grid3"><div class="field"><label for="nt-name">Name</label><input id="nt-name" maxlength="60" placeholder="e.g. 7-Day Habits"><span class="err"></span></div>
      <div class="field"><label for="nt-tag">Tagline <span class="opt">(optional)</span></label><input id="nt-tag" maxlength="160"></div>
      <div class="field"><label>Colour</label><div class="bt-colors">${COLORS.map((c, i) => `<label><input type="radio" name="nt-color" value="${c}" ${i === 0 ? 'checked' : ''}><i style="background:${c}"></i></label>`).join('')}</div></div></div>
      <label class="check"><input type="checkbox" id="nt-locked">Show it to everyone as locked until it is opened</label>
      <p class="muted" style="font-size:13px">A new tracker is closed for everyone. It opens when you mark its class done for a batch, or from a member's Trackers button.</p>
      <button class="btn btn-primary" type="submit">Create tracker</button></form>`;
}

// ---------------- events ----------------
async function reload() { try { await loadAll(); } catch (err) { toast(friendlyError(err), 'bad'); } draw(); }

async function onClick(e) {
  const g = (sel) => e.target.closest(sel);
  let t;
  if ((t = g('[data-tab]'))) { B.tab = t.dataset.tab; try { sessionStorage.setItem('ryl.bt.tab', B.tab); } catch { /* ignore */ } return draw(); }
  if ((t = g('[data-open]'))) { B.open = t.dataset.open; B.added = []; window.scrollTo(0, 0); return draw(); }
  if (g('[data-back]')) { B.open = null; B.added = []; return draw(); }
  if ((t = g('[data-prog]'))) { B.prog = t.dataset.prog; return draw(); }
  if ((t = g('[data-trk]'))) { B.trk = t.dataset.trk; return draw(); }
  if (g('[data-clear-added]')) { B.added = []; $('#ap-result').innerHTML = ''; return; }
  if (g('[data-copy-group]')) {
    try { await navigator.clipboard.writeText(groupMessage()); toast('Group message copied. Paste it in the WhatsApp group.'); } catch { toast('Could not copy.', 'bad'); }
    return;
  }
  if (g('[data-copy-all]')) {
    const txt = B.added.filter((r) => r.temp_password).map((r) => `${r.full_name || ''}\nEmail: ${r.email}\nPassword: ${r.temp_password}`).join('\n\n');
    try { await navigator.clipboard.writeText(`Login: ${app('login.html')}\n\n${txt}`); toast('Copied'); } catch { toast('Could not copy. Long-press to select instead.', 'bad'); }
    return;
  }
  if ((t = g('[data-signup]'))) {
    const open = t.dataset.signup === 'open';
    if (!(await confirmDialog({ title: open ? 'Open self sign-up?' : 'Close self sign-up?', body: open ? 'Anyone with the link can create an account.' : 'Only people you add to a batch get an account.', confirmLabel: open ? 'Open' : 'Close' }))) return;
    const { error } = await supabase.rpc('admin_update_setting', { p_key: 'open_signup', p_value: open });
    if (error) return toast(friendlyError(error), 'bad');
    toast(open ? 'Sign-up is open' : 'Sign-up is closed'); return reload();
  }
  if ((t = g('[data-done]')) || (t = g('[data-undo]'))) {
    const step = B.steps.find((s) => s.id === (t.dataset.done || t.dataset.undo)), on = !!t.dataset.done;
    const b = B.batches.find((x) => x.id === B.open), tr = trackersOfStep(step.id);
    if (on && !(await confirmDialog({ title: `Day ${step.day_no} done?`, body: `${formatNumber(B.counts[b.id] || 0)} people in ${b.name} get a notification${tr.length ? ` and ${tr.map((x) => x.name).join(', ')} opens for them` : ''}.`, confirmLabel: 'Yes, done' }))) return;
    if (!on && !(await confirmDialog({ title: 'Undo this class?', body: 'Trackers it already opened stay open.', confirmLabel: 'Undo' }))) return;
    return withBusy(t, on ? 'Opening…' : 'Undoing…', async () => {
      const { data, error } = await supabase.rpc('admin_batch_step_done', { p_batch: b.id, p_step: step.id, p_done: on });
      if (error) return toast(friendlyError(error), 'bad');
      toast(on ? (data ? `Done. ${data} tracker opening${data > 1 ? 's' : ''} sent.` : 'Done. Batch notified.') : 'Undone');
      await reload();
    });
  }
  if ((t = g('[data-finish]'))) {
    const b = B.batches.find((x) => x.id === B.open);
    const { error } = await supabase.from('batches').update({ is_active: !b.is_active }).eq('id', b.id);
    if (error) return toast(friendlyError(error), 'bad');
    toast(b.is_active ? 'Marked finished' : 'Reopened'); return reload();
  }
  if ((t = g('[data-newpw]'))) {
    const p = B.people.find((x) => x.member_id === t.dataset.newpw);
    if (!(await confirmDialog({ title: `New password for ${p.full_name || p.email}?`, body: 'Their old password stops working. They set their own after logging in.', confirmLabel: 'Make new password' }))) return;
    const { data, error } = await supabase.rpc('admin_reset_temp_password', { p_member: p.member_id });
    if (error) return toast(friendlyError(error), 'bad');
    B.added = [{ full_name: p.full_name, email: p.email, phone: p.phone, temp_password: data, status: 'created' }, ...B.added.filter((x) => x.email !== p.email)];
    drawAdded(); $('#ap-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return loadPeople(B.batches.find((x) => x.id === B.open));
  }
  if ((t = g('[data-add-sel]'))) {
    const target = B.batches.find((x) => x.id === $('#sel-target').value);
    const picked = B.people.filter((p) => B.sel.has(p.member_id));
    if (!target || !picked.length) return;
    if (!(await confirmDialog({ title: `Add ${picked.length} to ${target.name}?`, body: 'They keep the same login, points and trackers, and also join this batch. They stay in this batch too.', confirmLabel: `Add ${picked.length}` }))) return;
    return withBusy(t, 'Adding…', async () => {
      const { data, error } = await supabase.rpc('admin_batch_add_people', { p_batch: target.id, p_people: picked.map((p) => ({ name: p.full_name, email: p.email, phone: p.phone })) });
      if (error) return toast(friendlyError(error), 'bad');
      const ok = (data || []).filter((r) => r.status === 'existing').length;
      B.counts[target.id] = (B.counts[target.id] || 0) + ok;
      toast(`${ok} added to ${target.name}`); B.sel = new Set(); drawPeople();
    });
  }
  if ((t = g('[data-remove]'))) {
    const p = B.people.find((x) => x.member_id === t.dataset.remove);
    if (!(await confirmDialog({ title: `Remove ${p.full_name || p.email} from this batch?`, body: 'Their account, points and open trackers stay.', confirmLabel: 'Remove', danger: true }))) return;
    const { error } = await supabase.rpc('admin_batch_remove_member', { p_batch: B.open, p_member: p.member_id });
    if (error) return toast(friendlyError(error), 'bad');
    B.counts[B.open] = Math.max(0, (B.counts[B.open] || 1) - 1);
    toast('Removed'); return loadPeople(B.batches.find((x) => x.id === B.open));
  }
  if ((t = g('[data-st]'))) {
    const on = t.getAttribute('aria-pressed') !== 'true';
    const { data, error } = await supabase.rpc('admin_set_step_tracker', { p_step: t.dataset.st, p_category: t.dataset.cat, p_on: on });
    if (error) return toast(friendlyError(error), 'bad');
    if (on) B.stepTrackers.push({ step_id: t.dataset.st, category_id: t.dataset.cat });
    else B.stepTrackers = B.stepTrackers.filter((x) => !(x.step_id === t.dataset.st && x.category_id === t.dataset.cat));
    if (data) toast(`Opened for ${data} people who already finished this class`);
    return draw();
  }
  if ((t = g('[data-add-step]'))) {
    const n = stepsOf(t.dataset.addStep).reduce((m, s) => Math.max(m, s.day_no), 0) + 1;
    const { error } = await supabase.from('program_steps').insert({ program_id: t.dataset.addStep, day_no: n, title: `Day ${n}` });
    if (error) return toast(friendlyError(error), 'bad');
    return reload();
  }
  if ((t = g('[data-del-step]'))) {
    const s = B.steps.find((x) => x.id === t.dataset.delStep);
    const used = B.done.some((d) => d.step_id === s.id);
    if (!(await confirmDialog({ title: `Delete class ${s.day_no}?`, body: used ? 'Some batches already finished it. Trackers it opened stay open.' : 'You can add it again later.', confirmLabel: 'Delete', danger: true }))) return;
    const { error } = await supabase.from('program_steps').delete().eq('id', s.id);
    if (error) return toast(friendlyError(error), 'bad');
    return reload();
  }
}

// ---------- Excel / CSV upload → the same text box (coach checks it before adding) ----------
let xlsxLoading = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxLoading ||= new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = app('js/vendor/xlsx.mini.min.js');
    sc.onload = () => res(window.XLSX); sc.onerror = () => { xlsxLoading = null; rej(new Error('Could not load the Excel reader. Check your internet and try again.')); };
    document.head.appendChild(sc);
  });
  return xlsxLoading;
}
const isEmail = (v) => /\S+@\S+\.\S+/.test(v);
const isPhone = (v) => /^\+?[\d\s-]{7,}$/.test(v) && v.replace(/\D/g, '').length >= 7 && v.replace(/\D/g, '').length <= 13;
// rows (arrays of cells) → "name, email, phone" lines. Picks the columns by their content, not their order.
export function rowsToLines(rows) {
  rows = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean));
  if (!rows.length) return [];
  const width = Math.max(...rows.map((r) => r.length));
  const head = rows[0].some(isEmail) ? null : rows[0];
  const body = head ? rows.slice(1) : rows;
  const score = (fn) => Array.from({ length: width }, (_, i) => body.filter((r) => fn(r[i] || '')).length);
  const best = (arr, skip = []) => arr.reduce((b, v, i) => (!skip.includes(i) && v > (arr[b] ?? -1) ? i : b), -1);
  const ei = best(score(isEmail));
  const ps = score(isPhone); const pi = best(ps, [ei]); const phoneCol = pi >= 0 && ps[pi] > 0 ? pi : -1;
  let ni = head ? head.findIndex((h, i) => i !== ei && i !== phoneCol && /name|பெயர்/i.test(h) && !/user ?name|e-?mail/i.test(h)) : -1;
  if (ni < 0) ni = best(score((v) => v && !isEmail(v) && !isPhone(v) && !/^\d+([./:-]\d+)*( .*)?$/.test(v)), [ei, phoneCol]);
  return body.filter((r) => isEmail(r[ei] || '')).map((r) => [ni >= 0 ? r[ni] : '', r[ei], phoneCol >= 0 ? r[phoneCol] : ''].map((x) => (x || '').replace(/,/g, ' ')).join(', '));
}
async function readSheet(file) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
}

async function onChange(e) {
  if (e.target.id === 'sel-all') { B.sel = e.target.checked ? new Set(B.people.map((p) => p.member_id)) : new Set(); return drawPeople(); }
  if (e.target.dataset?.sel) { e.target.checked ? B.sel.add(e.target.dataset.sel) : B.sel.delete(e.target.dataset.sel); return drawPeople(); }
  if (e.target.id === 'ap-file') {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const l = $('#ap-file-l'); l.textContent = 'Reading…';
    try {
      const lines = rowsToLines(await readSheet(f));
      if (!lines.length) { toast('No email addresses found in this file.', 'bad'); return; }
      const ta = $('#ap-list'); ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + lines.join('\n');
      ta.rows = Math.min(14, Math.max(5, lines.length + 1)); ta.focus();
      toast(`${lines.length} people read from ${f.name}. Check the list, then tap Add.`);
    } catch (err) { toast(friendlyError(err), 'bad'); }
    finally { l.textContent = 'Or upload Excel / CSV'; }
    return;
  }
  const inp = e.target.closest('[data-step-title]'); if (!inp) return;
  const v = inp.value.trim();
  if (!v) { inp.value = B.steps.find((s) => s.id === inp.dataset.stepTitle)?.title || ''; return; }
  const { error } = await supabase.from('program_steps').update({ title: v }).eq('id', inp.dataset.stepTitle);
  if (error) return toast(friendlyError(error), 'bad');
  const s = B.steps.find((x) => x.id === inp.dataset.stepTitle); if (s) s.title = v;
  toast('Saved');
}

function fieldErr(input, msg) {
  const f = input.closest('.field'); f.classList.toggle('invalid', !!msg);
  const er = f.querySelector('.err'); if (er) er.textContent = msg || '';
  if (msg) input.focus(); return !msg;
}

async function onSubmit(e) {
  e.preventDefault();
  const f = e.target, btn = f.querySelector('[type=submit]');
  if (f.id === 'new-batch') {
    const name = $('#nb-name');
    if (!fieldErr(name, name.value.trim().length < 2 ? 'Give the batch a name.' : '')) return;
    if (!$('#nb-prog').value) return toast('Create a program first.', 'bad');
    return withBusy(btn, 'Creating…', async () => {
      const { data, error } = await supabase.from('batches').insert({ program_id: $('#nb-prog').value, name: name.value.trim(), starts_on: $('#nb-start').value || istToday() }).select('id').single();
      if (error) return toast(friendlyError(error), 'bad');
      await loadAll().catch(() => {}); B.open = data.id; B.added = []; toast('Batch created. Now add the people.'); draw();
    });
  }
  if (f.id === 'add-people') {
    const ta = $('#ap-list'), { people, bad } = parsePeople(ta.value);
    if (!fieldErr(ta, !people.length ? 'Each line needs an email, e.g. Meena, meena@gmail.com, 98400 11111' : people.length > 300 ? 'Add at most 300 at a time.' : '')) return;
    if (bad.length && !(await confirmDialog({ title: `${bad.length} line${bad.length > 1 ? 's have' : ' has'} no email`, body: `${bad.slice(0, 3).join(' · ')}${bad.length > 3 ? ' …' : ''}\n\nAdd the other ${people.length} now?`, confirmLabel: `Add ${people.length}` }))) return;
    return withBusy(btn, `Adding ${people.length}…`, async () => {
      const { data, error } = await supabase.rpc('admin_batch_add_people', { p_batch: B.open, p_people: people });
      if (error) return toast(friendlyError(error), 'bad');
      B.added = [...(data || []), ...B.added]; ta.value = '';
      const made = (data || []).filter((r) => r.status === 'created').length, ex = (data || []).filter((r) => r.status === 'existing').length;
      toast(`${made} new login${made === 1 ? '' : 's'}${ex ? `, ${ex} existing added` : ''}`);
      await loadAll().catch(() => {});
      drawAdded(); loadPeople(B.batches.find((x) => x.id === B.open));
      $('#ap-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  if (f.id === 'new-prog') {
    const name = $('#np-name'), days = Math.max(0, Math.min(90, parseInt($('#np-days').value, 10) || 0));
    if (!fieldErr(name, name.value.trim().length < 2 ? 'Give the program a name.' : '')) return;
    return withBusy(btn, 'Creating…', async () => {
      const { data, error } = await supabase.from('programs').insert({ name: name.value.trim(), kind: $('#np-kind').value, sort_order: B.programs.length + 1 }).select('id').single();
      if (error) return toast(friendlyError(error), 'bad');
      if (days) {
        const { error: e2 } = await supabase.from('program_steps').insert(Array.from({ length: days }, (_, i) => ({ program_id: data.id, day_no: i + 1, title: `Day ${i + 1}` })));
        if (e2) toast(friendlyError(e2), 'bad');
      }
      B.prog = data.id; toast('Program created'); await reload();
    });
  }
  if (f.id === 'new-trk') {
    const name = $('#nt-name');
    if (!fieldErr(name, name.value.trim().length < 2 ? 'Give the tracker a name.' : '')) return;
    return withBusy(btn, 'Creating…', async () => {
      const { data, error } = await supabase.rpc('admin_create_tracker', { p_name: name.value.trim(), p_tagline: $('#nt-tag').value.trim() || null,
        p_color: f.querySelector('[name=nt-color]:checked')?.value || COLORS[0], p_show_locked: $('#nt-locked').checked });
      if (error) return toast(friendlyError(error), 'bad');
      B.trk = data; toast('Tracker created. Add its habits.'); await reload();
      $('#nh-name')?.focus();
    });
  }
  if (f.id === 'edit-trk') {
    const name = $('#et-name');
    if (!fieldErr(name, name.value.trim().length < 2 ? 'Give the tracker a name.' : '')) return;
    return withBusy(btn, 'Saving…', async () => {
      const { error } = await supabase.rpc('admin_update_tracker', { p_category: B.trk, p_name: name.value.trim(), p_tagline: $('#et-tag').value.trim() || null, p_color: $('#et-color').value, p_show_locked: $('#et-locked').checked });
      if (error) return toast(friendlyError(error), 'bad');
      toast('Saved'); await reload();
    });
  }
  if (f.id === 'new-habit') {
    const name = $('#nh-name');
    if (!fieldErr(name, name.value.trim().length < 2 ? 'Write the habit name.' : '')) return;
    return withBusy(btn, 'Adding…', async () => {
      const { error } = await supabase.rpc('admin_add_habit', { p_category: B.trk, p_name: name.value.trim(), p_description: $('#nh-desc').value.trim() || null, p_points: parseInt($('#nh-pts').value, 10) || 0 });
      if (error) return toast(friendlyError(error), 'bad');
      toast('Habit added'); await reload(); $('#nh-name')?.focus();
    });
  }
}

export const _test = { parsePeople, waLink, loginMessage, rowsToLines };
