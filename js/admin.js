// Coach console: overview + member & role management.
import { supabase, app } from './supabase.js';
import { requireRole, signOut, friendlyError, ROLE_LABEL } from './auth.js';
import { $, $$, icon, esc, toast, withBusy, confirmDialog, adminNav, brandHTML, initials,
         formatDate, formatToday, formatNumber } from './ui.js';

const page = document.body.dataset.page;
const TRACKER_COLOR = { wealth: 'var(--t-wealth)', conscious: 'var(--t-conscious)', karma: 'var(--t-karma)', champion: 'var(--t-champion)' };
let me = null;   // { profile, user }

function chrome(current) {
  $('#top').innerHTML = `<div class="topbar">${brandHTML(app('admin/dashboard.html'), 'Coach Console', 'Redesign Your Life')}
    <div class="actions"><span class="pill ${me.profile.role === 'super_admin' ? 'gold' : 'blue'}">${ROLE_LABEL[me.profile.role]}</span>
    <button class="iconbtn" id="logout" aria-label="Log out" title="Log out">${icon('log-out')}</button></div></div>${adminNav(current)}`;
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
    ['Total members', o.total_members, 'Active accounts'],
    ['Active today', o.active_today, o.total_members ? Math.round(100 * o.active_today / o.total_members) + '% of members' : '—'],
    ['Not active today', o.inactive_today, 'May need a reminder', o.inactive_today > 0 ? 'warn' : ''],
    ['Ticks today', o.ticks_today, 'Habits marked done'],
    ['Avg completion', o.avg_completion_week + '%', 'This week'],
    ['Points this week', o.points_week, 'All members']
  ];
  const recent = o.recent || [];
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">${esc(formatToday())}</span><h1>Program overview</h1></div>
    <a class="btn btn-gold btn-sm" href="${app('admin/members.html')}">${icon('users')}Manage members</a></div>
  <section class="akpis">${kpis.map(([l, v, s, c]) => `<div class="panel akpi ${c || ''}"><small>${l}</small><b class="num">${typeof v === 'number' ? formatNumber(v) : esc(v)}</b><span>${esc(s)}</span></div>`).join('')}</section>
  <div class="admin-grid">
    <section class="panel"><div class="panel-h"><h3>Latest check-ins</h3><small class="muted">Live</small></div>
      ${recent.length ? `<div class="feed">${recent.map((r) => `<div class="row">${r.status === 'done' && !r.voided ? `<span class="pill ok">Done</span>` : r.voided ? `<span class="pill bad">Removed</span>` : `<span class="pill none">Not done</span>`}
        <span class="txt"><b>${esc(r.member)}</b> · ${esc(r.activity)}</span><time>${esc(timeAgo(r.at))}</time></div>`).join('')}</div>`
      : `<div class="empty-state"><span class="ic">${icon('check-check')}</span><b>No check-ins yet</b><span>When members tick habits, they appear here.</span></div>`}
    </section>
    <section class="panel"><div class="panel-h"><h3>Category completion</h3><small class="muted">This week</small></div>
      <div class="catbars">${(o.category_week || []).map((c) => `<div class="catbar"><div class="lbl">${esc(c.name)}<span>${c.pct}%</span></div>
        <div class="track"><i style="width:${Math.min(100, c.pct)}%;background:${TRACKER_COLOR[c.slug] || 'var(--gold)'}"></i></div></div>`).join('')}</div>
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
      <span>Last login ${esc(timeAgo(p.last_sign_in_at))}</span>${p.email_confirmed ? '' : '<span style="color:var(--warn)">Email not confirmed</span>'}</div></div>
    <div class="acts">${p.is_active ? '' : '<span class="pill bad">Paused</span>'}${roleCtl}
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

// ---------------- boot ----------------
(async () => {
  try {
    me = await requireRole(['admin', 'super_admin']);
    chrome(page === 'admin-members' ? 'members' : 'dashboard');
    if (page === 'admin-dashboard') await renderOverview();
    if (page === 'admin-members') await renderMembers();
  } catch (err) {
    document.body.classList.remove('guarding');
    errorPanel($('#main'), err, () => location.reload());
  }
})();
