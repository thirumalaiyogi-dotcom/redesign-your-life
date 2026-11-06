// Coach console: overview + member & role management.
import { supabase, app, activityImageUrl } from './supabase.js';
import { requireRole, signOut, friendlyError, ROLE_LABEL } from './auth.js';
import { $, $$, icon, esc, toast, withBusy, confirmDialog, coachTopbar, initials,
         formatDate, formatToday, formatNumber } from './ui.js';

const page = document.body.dataset.page;
const TRACKER_COLOR = { wealth: 'var(--t-wealth)', conscious: 'var(--t-conscious)', karma: 'var(--t-karma)', champion: 'var(--t-champion)' };
let me = null;   // { profile, user }

function chrome(current) {
  $('#top').innerHTML = coachTopbar(me.profile.role, ROLE_LABEL[me.profile.role], current);
  { const cur = document.querySelector('.admin-nav a[aria-current]'), bar = document.querySelector('.admin-nav .an-inner'); if (cur && bar) bar.scrollLeft = cur.offsetLeft - (bar.clientWidth - cur.offsetWidth) / 2; }
  $('#logout').addEventListener('click', () => signOut());
}

function errorPanel(target, err, retry) {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span><b>Couldn't load this page</b>
    <span>${esc(friendlyError(err))}</span><button class="btn btn-ghost btn-sm" id="retry">${icon('rotate-ccw')}Try again</button></div>`;
  $('#retry', target).addEventListener('click', retry);
}

const timeAgo = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return formatDate(iso);
};

// ---------------- OVERVIEW ----------------
async function renderOverview() {
  const main = $('#main');
  main.innerHTML = `<div class="admin-head"><div><span class="eyebrow">${esc(formatToday())}</span><h1>Program overview</h1></div></div>
    <div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:260px"></div>`;
  const { data: o, error } = await supabase.rpc('admin_overview');
  if (error) return errorPanel(main, error, renderOverview);

  const kpis = [
    ['Total members', o.total_members, 'Active accounts', '', 'users'],
    ['Active today', o.active_today, o.total_members ? Math.round(100 * o.active_today / o.total_members) + '% of members' : '—', 'ok', 'activity'],
    ['Not active today', o.inactive_today, 'May need a reminder', o.inactive_today > 0 ? 'warn' : '', 'hourglass'],
    ['Ticks today', o.ticks_today, 'Habits marked done', '', 'check-check'],
    ['Avg completion', o.avg_completion_week + '%', 'This week', '', 'trending-up'],
    ['Points this week', o.points_week, 'All members', 'gold', 'coins']
  ];
  const activePct = o.total_members ? Math.round(100 * o.active_today / o.total_members) : 0;
  const recent = o.recent || [];
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">${esc(formatToday())}</span><h1>Program overview</h1></div>
    <a class="btn btn-gold btn-sm" href="${app('admin/members.html')}">${icon('users')}Manage members</a></div>
  <section class="card today-pulse" aria-label="Today at a glance">
    <div class="tp-ring" role="img" aria-label="${activePct}% of members active today" style="--p:${activePct}"><b>${activePct}%</b><small>active</small></div>
    <div class="tp-txt"><b>${formatNumber(o.active_today)} of ${formatNumber(o.total_members)} members ticked today</b>
      <span>${formatNumber(o.ticks_today)} habits done · ${o.avg_completion_week}% average completion this week</span>
      ${o.inactive_today > 0 ? `<a class="tp-link" href="${app('admin/members.html')}">${icon('hourglass')}${formatNumber(o.inactive_today)} not active yet today →</a>` : `<span class="tp-ok">${icon('check-circle-2')}Everyone has ticked today</span>`}</div>
  </section>
  <section class="akpis">${kpis.map(([l, v, s, c, ic]) => `<div class="card akpi ${c || ''}"><span class="ai">${icon(ic)}</span><small>${l}</small><b class="num">${typeof v === 'number' ? formatNumber(v) : esc(v)}</b><span>${esc(s)}</span></div>`).join('')}</section>
  <div class="admin-grid">
    <section class="card"><div class="panel-h"><h3>Latest check-ins</h3><a class="link" href="${app('admin/checkins.html')}" style="font-size:13px">See all →</a></div>
      ${recent.length ? `<div class="feed">${recent.map((r) => `<div class="row">${r.status === 'done' && !r.voided ? `<span class="pill ok">Done</span>` : r.voided ? `<span class="pill bad">Removed</span>` : `<span class="pill none">Not done</span>`}
        <span class="txt"><b>${esc(r.member)}</b> · ${esc(r.activity)}</span><time>${esc(timeAgo(r.at))}</time></div>`).join('')}</div>`
      : `<div class="empty-state"><span class="ic">${icon('check-check')}</span><b>No check-ins yet</b><span>When members tick habits, they appear here.</span></div>`}
    </section>
    <section class="card"><div class="panel-h"><h3>Category completion</h3><small class="muted">This week</small></div>
      <div class="catbars">${(o.category_week || []).map((c) => `<div class="catbar"><div class="lbl"><span class="nm"><i class="dot" style="background:${TRACKER_COLOR[c.slug] || 'var(--c-accent)'}"></i>${esc(c.name)}</span><span>${c.pct}%</span></div>
        <div class="track"><i style="width:${Math.min(100, c.pct)}%;background:${TRACKER_COLOR[c.slug] || 'var(--c-accent)'}"></i></div></div>`).join('')}</div>
    </section>
  </div>`;
}

// ---------------- MEMBERS & ROLES ----------------
let people = [], filter = 'all', query = '';

async function loadPeople() {
  const { data, error } = await supabase.rpc('admin_list_people');
  if (error) throw error;
  people = data || [];
}

function counts() {
  return {
    all: people.length,
    member: people.filter((p) => p.role === 'member').length,
    coach: people.filter((p) => p.role !== 'member').length,
    paused: people.filter((p) => !p.is_active).length
  };
}

function personHTML(p) {
  const isMe = p.id === me.user.id;
  const superAdmin = me.profile.role === 'super_admin';
  const canToggle = !isMe && (p.role === 'member' || superAdmin);
  const roleCtl = superAdmin && !isMe
    ? `<label class="visually-hidden" for="role-${p.id}">Role for ${esc(p.full_name || p.email)}</label>
       <select id="role-${p.id}" data-role="${p.id}">${['member', 'admin', 'super_admin'].map((r) => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>`
    : `<span class="pill ${p.role === 'member' ? 'gold' : 'blue'}">${ROLE_LABEL[p.role]}</span>`;
  return `<article class="person ${p.is_active ? '' : 'paused'}">
    <span class="avatar" aria-hidden="true">${esc(initials(p.full_name, p.email))}</span>
    <div class="who"><b>${esc(p.full_name || '(no name yet)')}${isMe ? ' <span class="muted" style="font-weight:600">(you)</span>' : ''}</b>
      <div class="meta"><span>${esc(p.email)}</span>${p.phone ? `<span>${esc(p.phone)}</span>` : ''}<span>Joined ${esc(formatDate(p.joined_on))}</span>
      <span>Last login ${esc(timeAgo(p.last_sign_in_at))}</span>${p.email_confirmed ? '' : '<span style="color:var(--c-warning-ink);font-weight:600">Email not confirmed</span>'}</div></div>
    <div class="acts">${p.is_active ? '' : '<span class="pill bad">Paused</span>'}${roleCtl}
      ${p.role === 'member' && p.is_active ? `<button class="btn btn-sm btn-ghost" data-bonus="${p.id}">${icon('sparkles')}Bonus</button>` : ''}
      ${canToggle ? `<button class="btn btn-sm ${p.is_active ? 'btn-ghost' : 'btn-ok'}" data-active="${p.id}">${icon(p.is_active ? 'pause' : 'play')}${p.is_active ? 'Pause' : 'Activate'}</button>` : ''}</div>
  </article>`;
}

function renderList() {
  const q = query.trim().toLowerCase();
  const list = people.filter((p) =>
    (filter === 'all' || (filter === 'member' && p.role === 'member') || (filter === 'coach' && p.role !== 'member') || (filter === 'paused' && !p.is_active)) &&
    (!q || `${p.full_name} ${p.email} ${p.phone || ''}`.toLowerCase().includes(q)));
  const c = counts();
  $$('[data-filter]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); b.querySelector('.c').textContent = c[b.dataset.filter]; });
  $('#list').innerHTML = list.length ? `<div class="people">${list.map(personHTML).join('')}</div>`
    : `<div class="panel empty-state"><span class="ic">${icon('users')}</span><b>${people.length ? 'No one matches' : 'No members yet'}</b>
       <span>${people.length ? 'Try another filter or clear the search.' : 'Share the join link above. New sign-ups appear here.'}</span></div>`;
}

async function renderMembers() {
  const main = $('#main');
  const joinUrl = app('register.html');
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">${me.profile.role === 'super_admin' ? 'You can change roles and pause anyone' : 'You can pause or activate members'}</span><h1>Members</h1></div></div>
  <section class="panel panel-pad stack" style="gap:10px">
    <b>Add members</b><p class="muted" style="font-size:14px">Send this link. Each person creates their own account and joins as a Member.${me.profile.role === 'super_admin' ? ' You can then make someone a Coach here.' : ''}</p>
    <div class="invite"><code id="join-url">${esc(joinUrl)}</code><button class="btn btn-ghost btn-sm" id="copy-join">${icon('copy')}Copy link</button></div>
  </section>
  <div class="tools">
    <div class="chips" role="group" aria-label="Filter">${[['all', 'All'], ['member', 'Members'], ['coach', 'Coaches'], ['paused', 'Paused']].map(([v, l]) =>
      `<button class="chip" data-filter="${v}" aria-pressed="false">${l}<span class="c"></span></button>`).join('')}</div>
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="Search name, email or phone" aria-label="Search members"></label>
  </div>
  <div id="list"><div class="skeleton" style="height:76px"></div><div class="skeleton" style="height:76px;margin-top:10px"></div></div>`;

  $('#copy-join').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(joinUrl); toast('Join link copied'); }
    catch { const r = document.createRange(); r.selectNodeContents($('#join-url')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Link selected. Long-press to copy.', 'info'); }
  });
  $('#q').addEventListener('input', (e) => { query = e.target.value; renderList(); });
  main.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; renderList(); return; }
    const bz = e.target.closest('[data-bonus]');
    if (bz) { bonusDialog(people.find((x) => x.id === bz.dataset.bonus)); return; }
    const t = e.target.closest('[data-active]');
    if (t) {
      const p = people.find((x) => x.id === t.dataset.active);
      const next = !p.is_active;
      const ok = await confirmDialog({
        title: next ? `Activate ${p.full_name || p.email}?` : `Pause ${p.full_name || p.email}?`,
        body: next ? 'They can log in and tick habits again.' : 'They are logged out the next time they open the app and cannot tick habits until you activate them. Their points and history are kept.',
        confirmLabel: next ? 'Activate' : 'Pause', danger: !next });
      if (!ok) return;
      await withBusy(t, next ? 'Activating…' : 'Pausing…', async () => {
        const { error } = await supabase.rpc('admin_set_active', { p_member: p.id, p_active: next });
        if (error) return toast(friendlyError(error), 'bad');
        p.is_active = next; renderList(); toast(next ? 'Account activated' : 'Account paused');
      });
    }
  });
  main.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-role]');
    if (!sel) return;
    const p = people.find((x) => x.id === sel.dataset.role);
    const role = sel.value;
    const ok = await confirmDialog({
      title: `Make ${p.full_name || p.email} ${ROLE_LABEL[role]}?`,
      body: role === 'member' ? 'They lose access to the coach console.' : role === 'admin' ? 'Coaches see every member\'s check-ins and can pause members and give bonus points.' : 'A Super Admin has full control, including changing roles and point settings.',
      confirmLabel: `Make ${ROLE_LABEL[role]}`, danger: role === 'super_admin' });
    if (!ok) { sel.value = p.role; return; }
    sel.disabled = true;
    const { error } = await supabase.rpc('admin_set_role', { p_member: p.id, p_role: role });
    sel.disabled = false;
    if (error) { sel.value = p.role; return toast(friendlyError(error), 'bad'); }
    p.role = role; renderList(); toast(`Role changed to ${ROLE_LABEL[role]}`);
  });

  try { await loadPeople(); renderList(); }
  catch (err) { errorPanel($('#list'), err, renderMembers); }
}


// ---------------- shared form dialog ----------------
function formDialog({ title, body, fields, submitLabel, onSubmit, danger = false }) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<form class="dialog form" role="dialog" aria-modal="true" aria-labelledby="fd-t" novalidate style="gap:14px">
    <h2 id="fd-t">${esc(title)}</h2>${body ? `<p class="muted" style="font-size:14px">${body}</p>` : ''}
    ${fields}
    <div class="actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button>
    <button type="submit" class="btn ${danger ? 'btn-bad' : 'btn-gold'}">${esc(submitLabel)}</button></div></form>`;
  document.body.appendChild(scrim);
  const form = scrim.querySelector('form');
  const close = () => scrim.remove();
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  form.querySelector('input, textarea, select')?.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    await withBusy(btn, 'Saving…', async () => { if (await onSubmit(form)) close(); });
  });
  return scrim;
}
const fieldErr = (form, sel, msg) => {
  const input = form.querySelector(sel); const f = input.closest('.field');
  f.classList.toggle('invalid', !!msg); f.querySelector('.err').textContent = msg || ''; if (msg) input.focus(); return !msg;
};

// ---------------- SPECIAL BONUS ----------------
function bonusDialog(p) {
  formDialog({
    title: `Bonus for ${p.full_name || p.email}`,
    body: 'Points are added to their score right away and they get a notification with your reason.',
    submitLabel: 'Give bonus',
    fields: `<div class="field"><label for="b-pts">Points (1–500)</label><input id="b-pts" type="number" inputmode="numeric" min="1" max="500" value="25"><span class="err"></span></div>
      <div class="field"><label for="b-why">Reason (the member sees this)</label><textarea id="b-why" maxlength="240" rows="3" placeholder="e.g. Shared a powerful reflection in today's session"></textarea><span class="err"></span></div>`,
    onSubmit: async (form) => {
      const pts = Number(form.querySelector('#b-pts').value), why = form.querySelector('#b-why').value.trim();
      const ok = [fieldErr(form, '#b-pts', Number.isInteger(pts) && pts >= 1 && pts <= 500 ? '' : 'Enter a whole number from 1 to 500.'),
                  fieldErr(form, '#b-why', why.length >= 3 ? '' : 'Add a short reason.')].every(Boolean);
      if (!ok) return false;
      const { error } = await supabase.rpc('admin_award_bonus', { p_member: p.id, p_points: pts, p_reason: why });
      if (error) { toast(friendlyError(error), 'bad'); return false; }
      toast(`+${pts} bonus points given to ${p.full_name || 'member'}`);
      return true;
    }
  });
}

// ---------------- CHECK-INS ----------------
let ci = { date: null, tracker: '', status: '', q: '', rows: [] };
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

async function renderCheckins() {
  const main = $('#main');
  ci.date = ci.date || istToday();
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">Members tick, points are instant. Remove fake ticks here.</span><h1>Check-ins</h1></div></div>
  <div class="tools">
    <label class="field" style="flex:none;gap:4px"><span class="visually-hidden">Date</span><input id="ci-date" type="date" value="${ci.date}" max="${istToday()}" style="min-height:42px;padding:8px 12px"></label>
    <label class="search">${icon('search')}<input id="ci-q" type="search" placeholder="Search member or activity" aria-label="Search check-ins" value="${esc(ci.q)}"></label>
  </div>
  <div class="tools"><div class="chips" role="group" aria-label="Tracker">${[['', 'All trackers'], ['wealth', 'Wealth'], ['conscious', 'Conscious'], ['karma', 'Karma'], ['champion', 'Champion']].map(([v, l]) =>
      `<button class="chip" data-tr="${v}" aria-pressed="${ci.tracker === v}">${l}</button>`).join('')}</div></div>
  <div class="tools"><div class="chips" role="group" aria-label="Status">${[['', 'All'], ['done', 'Done'], ['not_done', 'Not done'], ['removed', 'Removed']].map(([v, l]) =>
      `<button class="chip" data-st="${v}" aria-pressed="${ci.status === v}">${l}</button>`).join('')}</div><span class="muted" id="ci-count" style="font-size:13px"></span></div>
  <div id="ci-list"></div>`;
  let t;
  $('#ci-q').addEventListener('input', (e) => { ci.q = e.target.value; clearTimeout(t); t = setTimeout(loadCheckins, 300); });
  $('#ci-date').addEventListener('change', (e) => { ci.date = e.target.value || istToday(); loadCheckins(); });
  main.addEventListener('click', (e) => {
    const tr = e.target.closest('[data-tr]'); if (tr) { ci.tracker = tr.dataset.tr; $$('[data-tr]').forEach((b) => b.setAttribute('aria-pressed', String(b === tr))); return loadCheckins(); }
    const st = e.target.closest('[data-st]'); if (st) { ci.status = st.dataset.st; $$('[data-st]').forEach((b) => b.setAttribute('aria-pressed', String(b === st))); return loadCheckins(); }
    const rm = e.target.closest('[data-void]'); if (rm) return voidDialog(ci.rows.find((r) => r.id === rm.dataset.void));
  });
  await loadCheckins();
}

async function loadCheckins() {
  const list = $('#ci-list');
  list.innerHTML = `<div class="skeleton" style="height:72px"></div><div class="skeleton" style="height:72px;margin-top:10px"></div>`;
  const { data, error } = await supabase.rpc('admin_checkins', { p_date: ci.date, p_tracker: ci.tracker || null, p_status: ci.status || null, p_search: ci.q || null, p_limit: 300 });
  if (error) return errorPanel(list, error, loadCheckins);
  ci.rows = data || [];
  $('#ci-count').textContent = `${ci.rows.length}${ci.rows.length === 300 ? '+' : ''} entries`;
  if (!ci.rows.length) {
    list.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('check-check')}</span><b>No check-ins match</b><span>${ci.q || ci.tracker || ci.status ? 'Try another filter or clear the search.' : 'When members tick habits on this day, they appear here.'}</span></div>`;
    return;
  }
  list.innerHTML = `<div class="people">${ci.rows.map(checkinHTML).join('')}</div>`;
}

function checkinHTML(r) {
  const removed = !!r.voided_at;
  const pill = removed ? '<span class="pill bad">Removed</span>' : r.status === 'done' ? '<span class="pill ok">Done</span>' : '<span class="pill none">Not done</span>';
  return `<article class="person ${removed ? 'paused' : ''}" style="--tc:${TRACKER_COLOR[r.tracker_slug] || 'var(--gold)'}">
    <span class="avatar" aria-hidden="true">${esc(initials(r.member_name))}</span>
    <div class="who"><b>${esc(r.member_name || 'Member')}</b>
      <div class="meta"><span style="color:var(--tc);font-weight:700">${esc(r.tracker_name)} #${String(r.activity_number).padStart(2, '0')}</span><span>${esc(r.activity_name)}</span><span>${esc(timeAgo(r.updated_at))}</span></div>
      ${r.note ? `<p style="font-size:13.5px;color:var(--ink-2);background:var(--bg-2);border-radius:10px;padding:8px 10px;margin-top:4px">“${esc(r.note)}”</p>` : ''}
      ${removed ? `<p style="font-size:12.5px;color:var(--bad-soft)">Removed by ${esc(r.voided_by_name || 'coach')}: ${esc(r.void_reason)}</p>` : ''}</div>
    <div class="acts">${pill}${r.status === 'done' && !removed ? `<span class="pts-chip">+${r.points_awarded}</span>
      <button class="btn btn-sm btn-bad" data-void="${r.id}">${icon('x')}Remove</button>` : ''}</div></article>`;
}

function voidDialog(r) {
  formDialog({
    title: 'Remove this tick?',
    body: `<b>${esc(r.member_name)}</b> · ${esc(r.activity_name)}<br>Their ${r.points_awarded} points and any bonus that depended on it are taken back. They see your reason and cannot re-tick this activity today.`,
    submitLabel: 'Remove tick', danger: true,
    fields: `<div class="field"><label for="v-why">Reason (the member sees this)</label><textarea id="v-why" maxlength="240" rows="3" placeholder="e.g. You were in class at this time, please tick only what you did"></textarea><span class="err"></span></div>`,
    onSubmit: async (form) => {
      const why = form.querySelector('#v-why').value.trim();
      if (!fieldErr(form, '#v-why', why.length >= 5 ? '' : 'Write a reason of at least 5 characters.')) return false;
      const { error } = await supabase.rpc('admin_void_checkin', { p_checkin_id: r.id, p_reason: why });
      if (error) { toast(friendlyError(error), 'bad'); return false; }
      toast('Tick removed · member notified');
      loadCheckins();
      return true;
    }
  });
}

// ---------------- ACTIVITIES ----------------
let acts = [], cats = [], actTracker = 'wealth';

async function renderActivities() {
  const main = $('#main');
  main.innerHTML = `<div class="admin-head"><div><span class="eyebrow">Names stay exactly as the program defines them</span><h1>Activities</h1></div></div>
    <div class="skeleton" style="height:300px"></div>`;
  const [c, a] = await Promise.all([
    supabase.from('tracker_categories').select('id, slug, name, sort_order').order('sort_order'),
    supabase.from('activities').select('id, category_id, number, default_name, description, image_path, icon, points, is_active').order('number')
  ]);
  if (c.error || a.error) return errorPanel(main, c.error || a.error, renderActivities);
  cats = c.data; acts = a.data;
  main.innerHTML = `<div class="admin-head"><div><span class="eyebrow">Names stay exactly as the program defines them</span><h1>Activities</h1></div></div>
    <div class="chips" role="group" aria-label="Tracker">${cats.map((t) => `<button class="chip" data-at="${t.slug}" aria-pressed="${t.slug === actTracker}">${esc(t.name)}<span class="c">${acts.filter((x) => x.category_id === t.id).length}</span></button>`).join('')}</div>
    <div id="act-list"></div>`;
  main.addEventListener('click', (e) => {
    const t = e.target.closest('[data-at]'); if (t) { actTracker = t.dataset.at; $$('[data-at]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); return drawActs(); }
    const ed = e.target.closest('[data-edit]'); if (ed) return editActivity(acts.find((x) => x.id === ed.dataset.edit));
  });
  drawActs();
}

function drawActs() {
  const cat = cats.find((c) => c.slug === actTracker);
  const list = acts.filter((a) => a.category_id === cat.id);
  $('#act-list').innerHTML = `<div class="people">${list.map((a) => {
    const img = activityImageUrl(a.image_path);
    return `<article class="person ${a.is_active ? '' : 'paused'}" style="--tc:${TRACKER_COLOR[cat.slug]}">
      <span style="width:72px;aspect-ratio:4/3;border-radius:10px;overflow:hidden;background:var(--bg-2);display:grid;place-items:center;flex:none">${img ? `<img src="${esc(img)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : icon(a.icon || 'image')}</span>
      <div class="who"><b>#${String(a.number).padStart(2, '0')} · ${esc(a.default_name)}</b>
        <div class="meta"><span>${esc(a.description || 'No description')}</span></div>
        <div class="meta"><span class="pill gold" style="text-transform:none;letter-spacing:0">${a.points} pts</span>${a.is_active ? '' : '<span class="pill bad">Hidden</span>'}</div></div>
      <div class="acts"><button class="btn btn-sm btn-ghost" data-edit="${a.id}">${icon('pencil')}Edit</button></div></article>`; }).join('')}</div>`;
}

// Resize/crop to 640×480 and encode as WebP (JPEG where WebP encoding is unsupported).
async function prepareImage(file) {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is over 15 MB. Choose a smaller one.');
  const bmp = await createImageBitmap(file);
  const W = 640, H = 480, scale = Math.max(W / bmp.width, H / bmp.height);
  const sw = W / scale, sh = H / scale;
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  canvas.getContext('2d').drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.78));
  if (blob && blob.type === 'image/webp') return { blob, ext: 'webp', type: 'image/webp' };
  const jpg = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
  return { blob: jpg, ext: 'jpg', type: 'image/jpeg' };
}

function editActivity(a) {
  const cat = cats.find((c) => c.id === a.category_id);
  let picked = null;
  const scrim = formDialog({
    title: `#${String(a.number).padStart(2, '0')} ${a.default_name}`,
    body: 'The activity name is fixed. You can change the picture, description, points and whether members see it.',
    submitLabel: 'Save changes',
    fields: `<div style="display:flex;gap:12px;align-items:center">
        <img id="e-prev" src="${esc(activityImageUrl(a.image_path) || '')}" alt="" style="width:120px;aspect-ratio:4/3;object-fit:cover;border-radius:10px;background:var(--bg-2)">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">${icon('image')}Change picture<input id="e-img" type="file" accept="image/jpeg,image/png,image/webp" class="visually-hidden"></label></div>
      <div class="field"><label for="e-desc">Short description</label><textarea id="e-desc" maxlength="400" rows="3">${esc(a.description || '')}</textarea><span class="err"></span></div>
      <div class="field"><label for="e-pts">Points when done (0–100)</label><input id="e-pts" type="number" inputmode="numeric" min="0" max="100" value="${a.points}"><span class="err"></span></div>
      <label class="check"><input type="checkbox" id="e-active" ${a.is_active ? 'checked' : ''}>Show this activity to members</label>`,
    onSubmit: async (form) => {
      const desc = form.querySelector('#e-desc').value.trim();
      const pts = Number(form.querySelector('#e-pts').value);
      const active = form.querySelector('#e-active').checked;
      if (!fieldErr(form, '#e-pts', Number.isInteger(pts) && pts >= 0 && pts <= 100 ? '' : 'Enter a whole number from 0 to 100.')) return false;
      const patch = { description: desc || null, points: pts, is_active: active };
      if (picked) {
        const path = `${cat.slug}-${String(a.number).padStart(2, '0')}-${Date.now()}.${picked.ext}`;
        const up = await supabase.storage.from('activity-images').upload(path, picked.blob, { contentType: picked.type, cacheControl: '31536000', upsert: false });
        if (up.error) { toast(friendlyError(up.error), 'bad'); return false; }
        patch.image_path = supabase.storage.from('activity-images').getPublicUrl(path).data.publicUrl;
      }
      const { data, error } = await supabase.from('activities').update(patch).eq('id', a.id)
        .select('id, category_id, number, default_name, description, image_path, icon, points, is_active').single();
      if (error) { toast(friendlyError(error), 'bad'); return false; }
      Object.assign(a, data); drawActs(); toast('Activity saved');
      return true;
    }
  });
  scrim.querySelector('#e-img').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { picked = await prepareImage(f); scrim.querySelector('#e-prev').src = URL.createObjectURL(picked.blob); toast(`Picture ready (${Math.round(picked.blob.size / 1024)} KB). Tap Save to upload.`, 'info'); }
    catch (err) { picked = null; toast(err.message, 'bad'); }
  });
}

// ---------------- SETTINGS (scoring) ----------------
const SCORE_KEYS = [
  ['daily_completion_bonus', 'Daily completion bonus', 'Extra points when a member finishes every activity in one day.'],
  ['streak7_bonus', '7-day streak bonus', 'Extra points on every 7th day in a row with at least one tick.'],
  ['perfect_week_bonus', 'Perfect week bonus', 'Extra points on Sunday when every activity was done every day, Monday to Sunday.'],
  ['streak_min_daily', 'Ticks needed for a streak day', 'How many habits a member must tick for the day to count toward a streak.']
];

async function renderSettings() {
  const main = $('#main');
  const isSuper = me.profile.role === 'super_admin';
  main.innerHTML = `<div class="admin-head"><div><span class="eyebrow">${isSuper ? 'Changes apply to new ticks from now on' : 'Only the super admin can change these'}</span><h1>Settings</h1></div></div>
    <div class="skeleton" style="height:300px"></div>`;
  const [st, au] = await Promise.all([
    supabase.from('app_settings').select('key, value, updated_at'),
    supabase.from('audit_logs').select('action, entity_id, details, created_at').eq('action', 'settings.update').order('created_at', { ascending: false }).limit(8)
  ]);
  if (st.error) return errorPanel(main, st.error, renderSettings);
  const val = Object.fromEntries(st.data.map((r) => [r.key, r.value]));
  const label = Object.fromEntries(SCORE_KEYS.map(([k, l]) => [k, l]));
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">${isSuper ? 'Changes apply to new ticks from now on' : 'Only the super admin can change these'}</span><h1>Settings</h1></div></div>
  <div class="set-grid">
    <form class="panel" id="score-form" novalidate>
      <div class="panel-h"><h3>Points</h3>${isSuper ? '<button class="btn btn-gold btn-sm" id="save-scores" type="submit" disabled>Save</button>' : '<span class="pill blue">View only</span>'}</div>
      <div class="set-row"><div><b>Each activity done</b><small>Set per activity on the Activities page. Default is 10.</small></div><input value="10" readonly aria-label="Points per activity"></div>
      ${SCORE_KEYS.map(([k, l, help]) => `<div class="set-row"><div><label for="s-${k}"><b>${l}</b></label><small>${help}</small></div>
        <input id="s-${k}" data-key="${k}" type="number" inputmode="numeric" min="${k === 'streak_min_daily' ? 1 : 0}" max="${k === 'streak_min_daily' ? 58 : 500}" value="${esc(val[k] ?? '')}" ${isSuper ? '' : 'readonly'}></div>`).join('')}
      <p class="muted" id="score-err" style="padding:0 16px 14px;font-size:13px;color:var(--bad-soft)"></p>
    </form>
    <div class="stack" style="gap:14px">
      <section class="panel"><div class="panel-h"><h3>How scoring works</h3></div>
        <ul class="rules">
          <li>✓ Done adds the activity's points instantly. ✗ Not done, or not marked, gives 0. Points never go negative.</li>
          <li>Members can mark only today. Past days are locked.</li>
          <li>Each bonus is given at most once per member per day, and is taken back if the tick that earned it is removed.</li>
          <li>Leaderboard ties: consistency, then streak, then who reached the score first.</li>
        </ul></section>
      <section class="panel panel-pad stack" style="gap:10px">
        <b>Monthly Champion</b>
        <p class="muted" style="font-size:14px">At the start of each month, award the Monthly Champion badge to last month's #1. Safe to press more than once.</p>
        <button class="btn btn-ghost" id="close-month" type="button">${icon('trophy')}Award last month's champion</button>
      </section>
      <section class="panel"><div class="panel-h"><h3>Recent changes</h3></div>
        ${au.data?.length ? `<div class="feed">${au.data.map((a) => `<div class="row"><span class="txt"><b>${esc(label[a.entity_id] || a.entity_id)}</b> · ${esc(JSON.stringify(a.details.from))} → ${esc(JSON.stringify(a.details.to))}</span><time>${esc(timeAgo(a.created_at))}</time></div>`).join('')}</div>`
          : `<p class="muted" style="padding:14px 16px;font-size:13px">No changes yet.</p>`}
      </section>
    </div>
  </div>`;

  $('#close-month').addEventListener('click', async (e) => {
    const d = new Date(); const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    await withBusy(e.currentTarget, 'Checking…', async () => {
      const { data, error } = await supabase.rpc('admin_close_month', { p_month: prev });
      toast(error ? friendlyError(error) : data, error ? 'bad' : 'ok');
    });
  });
  if (!isSuper) return;
  const form = $('#score-form'), save = $('#save-scores');
  form.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-key]'); if (!inp) return;
    inp.classList.toggle('changed', String(inp.value) !== String(val[inp.dataset.key]));
    save.disabled = !$$('[data-key].changed', form).length;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const changed = $$('[data-key].changed', form);
    for (const inp of changed) {
      const n = Number(inp.value), min = Number(inp.min), max = Number(inp.max);
      if (!Number.isInteger(n) || n < min || n > max) { $('#score-err').textContent = `${label[inp.dataset.key]}: enter a whole number from ${min} to ${max}.`; inp.focus(); return; }
    }
    $('#score-err').textContent = '';
    await withBusy(save, 'Saving…', async () => {
      for (const inp of changed) {
        const { error } = await supabase.rpc('admin_update_setting', { p_key: inp.dataset.key, p_value: Number(inp.value) });
        if (error) { toast(friendlyError(error), 'bad'); return; }
      }
      toast(`${changed.length} setting${changed.length > 1 ? 's' : ''} saved`);
      renderSettings();
    });
  });
}

// ---------------- REPORTS ----------------
const isoIST = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const addD = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function presetRange(p) {
  const t = isoIST(), dow = (new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7;
  if (p === 'week') return [addD(t, -dow), t];
  if (p === 'lastweek') return [addD(t, -dow - 7), addD(t, -dow - 1)];
  if (p === 'month') return [t.slice(0, 8) + '01', t];
  if (p === 'lastmonth') { const first = t.slice(0, 8) + '01'; const end = addD(first, -1); return [end.slice(0, 8) + '01', end]; }
  return [addD(t, -29), t];
}
let rep = { preset: 'month', start: null, end: null, rows: [] };

async function renderReports() {
  const main = $('#main');
  [rep.start, rep.end] = rep.start ? [rep.start, rep.end] : presetRange(rep.preset);
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">Member performance and shared journals</span><h1>Reports</h1></div>
    <button class="btn btn-gold btn-sm" id="csv" disabled>${icon('file-chart-column')}Download CSV</button></div>
  <div class="chips" role="group" aria-label="Period">${[['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['30', 'Last 30 days']].map(([v, l]) =>
    `<button class="chip" data-pre="${v}" aria-pressed="${rep.preset === v}">${l}</button>`).join('')}</div>
  <div class="tools"><div class="row-between" style="gap:8px;justify-content:flex-start">
    <label class="visually-hidden" for="r-start">From</label><input id="r-start" type="date" value="${rep.start}" max="${isoIST()}" class="date-in">
    <span class="muted">to</span>
    <label class="visually-hidden" for="r-end">To</label><input id="r-end" type="date" value="${rep.end}" max="${isoIST()}" class="date-in"></div>
    <span class="muted" id="r-sum" style="font-size:13px"></span></div>
  <section class="panel" id="r-table"></section>
  <section class="panel"><div class="panel-h"><h3>Shared journals</h3>
    <input id="j-date" type="date" value="${isoIST()}" max="${isoIST()}" class="date-in" aria-label="Journal date"></div>
    <div id="j-list"></div></section>`;
  main.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pre]'); if (!b) return;
    rep.preset = b.dataset.pre; [rep.start, rep.end] = presetRange(rep.preset);
    $$('[data-pre]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#r-start').value = rep.start; $('#r-end').value = rep.end; loadReport();
  });
  const onDate = () => {
    const s = $('#r-start').value, e = $('#r-end').value; if (!s || !e) return;
    if (e < s) return toast('The end date is before the start date.', 'bad');
    rep.start = s; rep.end = e; rep.preset = ''; $$('[data-pre]').forEach((x) => x.setAttribute('aria-pressed', 'false')); loadReport();
  };
  $('#r-start').addEventListener('change', onDate); $('#r-end').addEventListener('change', onDate);
  $('#csv').addEventListener('click', downloadCSV);
  $('#j-date').addEventListener('change', (e) => loadJournals(e.target.value));
  await Promise.all([loadReport(), loadJournals(isoIST())]);
}

async function loadReport() {
  const box = $('#r-table');
  box.innerHTML = `<div class="skeleton" style="height:220px;margin:12px"></div>`;
  $('#csv').disabled = true;
  const { data, error } = await supabase.rpc('admin_member_report', { p_start: rep.start, p_end: rep.end });
  if (error) return errorPanel(box, error, loadReport);
  rep.rows = data || [];
  const active = rep.rows.filter((r) => r.activities_done > 0).length;
  const avg = rep.rows.length ? Math.round(rep.rows.reduce((a, r) => a + Number(r.consistency), 0) / rep.rows.length) : 0;
  $('#r-sum').textContent = `${rep.rows.length} members · ${active} active · avg consistency ${avg}%`;
  if (!rep.rows.length) { box.innerHTML = `<div class="empty-state"><span class="ic">${icon('users')}</span><b>No members yet</b></div>`; return; }
  $('#csv').disabled = false;
  box.innerHTML = `<div class="table-wrap"><table class="rtable"><thead><tr><th>#</th><th>Member</th><th class="n">Points</th><th class="n">Done</th><th class="n">Active days</th><th class="n">Consistency</th><th class="n">Streak</th></tr></thead>
    <tbody>${rep.rows.map((r, i) => `<tr class="${r.is_active ? '' : 'off'}"><td>${i + 1}</td><td><b>${esc(r.full_name || '(no name)')}</b><small>${esc(r.email)}${r.is_active ? '' : ' · paused'}</small></td>
      <td class="n num">${formatNumber(r.points)}</td><td class="n">${formatNumber(r.activities_done)}</td><td class="n">${r.active_days}</td><td class="n">${Math.round(r.consistency)}%</td><td class="n">${r.streak}</td></tr>`).join('')}</tbody></table></div>`;
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;            // stop spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCSV() {
  const head = ['Rank', 'Name', 'Email', 'Phone', 'Joined', 'Status', 'Points', 'Activities done', 'Active days', 'Consistency %', 'Current streak'];
  const lines = [head, ...rep.rows.map((r, i) => [i + 1, r.full_name, r.email, r.phone, r.joined_on, r.is_active ? 'Active' : 'Paused', r.points, r.activities_done, r.active_days, Math.round(r.consistency), r.streak])]
    .map((row) => row.map(csvCell).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `redesign-your-life_${rep.start}_to_${rep.end}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('CSV downloaded');
}

const JQ = [['learned', 'Learned'], ['improved', 'Improved'], ['challenges', 'Challenges'], ['grateful', 'Grateful for'], ['tomorrow', 'Tomorrow']];
async function loadJournals(date) {
  const box = $('#j-list');
  box.innerHTML = `<div class="skeleton" style="height:90px;margin:12px"></div>`;
  const { data, error } = await supabase.from('journals').select('id, entry_date, learned, improved, challenges, grateful, tomorrow, updated_at, profiles(full_name)')
    .eq('entry_date', date).eq('share_with_coach', true).order('updated_at', { ascending: false });
  if (error) return errorPanel(box, error, () => loadJournals(date));
  box.innerHTML = data?.length ? `<div class="stack" style="gap:0">${data.map((j) => `<details class="j-entry"><summary><b>${esc(j.profiles?.full_name || 'Member')}</b><span class="muted" style="font-size:12.5px">${esc(timeAgo(j.updated_at))}</span></summary>
      <div class="j-body">${JQ.filter(([k]) => j[k]).map(([k, l]) => `<p><b>${l}</b><br>${esc(j[k])}</p>`).join('')}</div></details>`).join('')}</div>`
    : `<div class="empty-state"><span class="ic">${icon('notebook-pen')}</span><b>No shared journals for this day</b><span>Members choose whether to share each entry.</span></div>`;
}

// ---------------- boot ----------------
(async () => {
  try {
    me = await requireRole(['admin', 'super_admin']);
    chrome({ 'admin-members': 'members', 'admin-checkins': 'checkins', 'admin-activities': 'activities', 'admin-settings': 'settings', 'admin-reports': 'reports' }[page] || 'dashboard');
    if (page === 'admin-dashboard') await renderOverview();
    if (page === 'admin-members') await renderMembers();
    if (page === 'admin-checkins') await renderCheckins();
    if (page === 'admin-activities') await renderActivities();
    if (page === 'admin-settings') await renderSettings();
    if (page === 'admin-reports') await renderReports();
  } catch (err) {
    document.body.classList.remove('guarding');
    errorPanel($('#main'), err, () => location.reload());
  }
})();
