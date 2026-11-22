// Coach console: overview + member & role management.
import { supabase, app, shareLink, activityImageUrl } from './supabase.js';
import { requireRole, signOut, friendlyError, ROLE_LABEL } from './auth.js';
import { renderSessions, memberExtras, openPointMedia } from './coach-learn.js';
import { renderBatches, loginMessage, waLink, loadXlsx } from './batches.js';
import { reportCard } from './report.js';
import { loadEnergy, energyRowHTML, animateNeedles } from './energy.js';
import { pushState, enablePush, syncPush, pushSheet } from './push.js';
import { $, $$, icon, esc, toast, withBusy, confirmDialog, coachTopbar, initials,
         formatDate, formatToday, formatNumber, ringHTML, animateIn } from './ui.js';

const page = document.body.dataset.page;
const TRACKER_COLOR = { wealth: 'var(--t-wealth)', conscious: 'var(--t-conscious)', karma: 'var(--t-karma)', champion: 'var(--t-champion)', couple: 'var(--t-couple)', mugilan: 'var(--t-mugilan)' };
let me = null;   // { profile, user }

function chrome(current) {
  $('#top').innerHTML = coachTopbar(me.profile.role, ROLE_LABEL[me.profile.role], current);
  { const cur = document.querySelector('.admin-nav a[aria-current]'), bar = document.querySelector('.admin-nav .an-inner'); if (cur && bar) bar.scrollLeft = cur.offsetLeft - (bar.clientWidth - cur.offsetWidth) / 2; }
  $('#logout').addEventListener('click', () => signOut());
  // red count on Sessions: members' questions waiting for an answer (like unread chats)
  supabase.from('doubts').select('id', { count: 'exact', head: true }).is('answered_at', null).then(({ count }) => {
    const a = document.querySelector(`.admin-nav a[href$="admin/sessions.html"]`);
    if (a && count) a.insertAdjacentHTML('beforeend', `<i class="nav-badge" aria-label="${count} unanswered">${count > 99 ? '99+' : count}</i>`);
  });
}

// coach's phone: buzz when a member asks a question
async function coachPushCard(box) {
  if (await syncPush()) return;
  if (await pushSheet({ text: 'Get a phone notification when a member asks a question, like a WhatsApp message. Tap it to open and reply.', onToast: toast })) return;
  const st = await pushState().catch(() => 'unsupported');
  if (!box || st === 'on' || st === 'unsupported') return;
  box.innerHTML = `<div class="card push-ask coach-push"><span class="si">${icon('bell')}</span>
    <span><b>Get a phone notification for every new question</b><small>${st === 'blocked' ? 'Notifications are blocked. Allow them for this site in your browser settings.' : st === 'ios-install' ? 'On iPhone: Share → Add to Home Screen first, then open the app from there.' : 'Like a WhatsApp message: tap it to open the question and reply.'}</small></span>
    ${st === 'off' ? `<button class="btn btn-gold btn-sm" id="coach-push-on">Turn on</button>` : ''}</div>`;
  $('#coach-push-on')?.addEventListener('click', async (e) => {
    await withBusy(e.currentTarget, 'Turning on…', async () => {
      try { await enablePush(); box.innerHTML = ''; toast('Notifications turned on'); } catch (err) { toast(friendlyError(err), 'bad'); }
    });
  });
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
  // members' questions waiting for an answer (silently skipped on an older database)
  supabase.from('doubts').select('id', { count: 'exact', head: true }).is('answered_at', null).then(({ count, error: e }) => {
    if (e || !count || !$('#q-waiting')) return;
    $('#q-waiting').innerHTML = `<a class="card q-banner" href="${app('admin/sessions.html?tab=questions')}"><span class="si">${icon('message-square')}</span>
      <span><b>${count} question${count > 1 ? 's' : ''} waiting for your answer</b><small>Tap to read and answer</small></span>${icon('chevron-right')}</a>`;
  });
  const recent = o.recent || [];
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">${esc(formatToday())}</span><h1>Program overview</h1></div>
    <span class="row" style="gap:8px;flex-wrap:wrap"><a class="btn btn-ghost btn-sm" href="${app('coach-guide.html')}">${icon('info')}Coach guide</a>
    <a class="btn btn-gold btn-sm" href="${app('admin/members.html')}">${icon('users')}Manage members</a></span></div>
  <section class="card today-pulse" aria-label="Today at a glance">
    <div class="tp-ring" role="img" aria-label="${activePct}% of members active today" style="--p:${activePct}"><b>${activePct}%</b><small>active</small></div>
    <div class="tp-txt"><b>${formatNumber(o.active_today)} of ${formatNumber(o.total_members)} members ticked today</b>
      <span>${formatNumber(o.ticks_today)} habits done · ${o.avg_completion_week}% average completion this week</span>
      ${o.inactive_today > 0 ? `<a class="tp-link" href="${app('admin/members.html')}">${icon('hourglass')}${formatNumber(o.inactive_today)} not active yet today →</a>` : `<span class="tp-ok">${icon('check-circle-2')}Everyone has ticked today</span>`}</div>
  </section>
  <div id="q-waiting"></div>
  <div id="coach-push"></div>
  <div id="daily-report"></div>
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
  coachPushCard($('#coach-push'));
  reportCard($('#daily-report')).catch(() => { $('#daily-report').innerHTML = ''; });
}

// ---------------- MEMBERS & ROLES ----------------
let people = [], filter = 'all', query = '';
// trackers only some members get (Conscious Couple, a family member's own tracker) and who has them
let extraCats = [], extraOf = new Map();

let setupKnown = false, timeKnown = false;
// minutes like "12 min" / "1 h 05"
const mins = (sec) => { const m = Math.floor((sec || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
// a member who has not used the app for 3 days or more (or never)
const idleDue = (p) => timeKnown && p.role === 'member' && p.is_active && (!p.time?.last_at || Date.now() - new Date(p.time.last_at) > 3 * 864e5);
// app installed + notifications on? (only for members; coach calls the ones still to do)
const setupDue = (p) => setupKnown && p.role === 'member' && p.is_active && (!p.app_installed || !p.phones);
const setupText = (p) => `Hi ${String(p.full_name || '').split(' ')[0]}, Deepak's 10X Life app la ${!p.app_installed ? 'app install' : ''}${!p.app_installed && !p.phones ? ' um ' : ''}${!p.phones ? 'notifications on' : ''} pannala nu kaatudhu. Indha guide la padam oda step by step irukku:\n${shareLink('guide.html#install')}\n\nApp open panna Home la "Finish setting up" card varum, adhula Install, Allow tap pannunga. Doubt na call pannunga 🙏`;
async function loadPeople() {
  const [ppl, cats, asg, mem, setup, tm] = await Promise.all([
    supabase.rpc('admin_list_people'),
    supabase.from('tracker_categories').select('id, slug, name, sort_order').eq('audience', 'assigned').eq('is_active', true).order('sort_order'),   // all trackers are opened per member
    supabase.from('tracker_assignments').select('category_id, member_id'),
    supabase.from('profiles').select('id, member_since, renews_on').or('member_since.not.is.null,renews_on.not.is.null'),
    supabase.rpc('admin_setup_status'),
    supabase.rpc('admin_app_time')
  ]);
  if (ppl.error) throw ppl.error;
  people = ppl.data || [];
  const dates = new Map((mem.error ? [] : mem.data || []).map((m) => [m.id, m]));
  for (const p of people) Object.assign(p, { member_since: dates.get(p.id)?.member_since || null, renews_on: dates.get(p.id)?.renews_on || null });
  const su = new Map((setup.error ? [] : setup.data || []).map((x) => [x.member_id, x]));
  setupKnown = !setup.error;
  for (const p of people) Object.assign(p, { app_installed: !!su.get(p.id)?.app_installed_at, phones: su.get(p.id)?.phones || 0 });
  const tmOf = new Map((tm.error ? [] : tm.data || []).map((x) => [x.member_id, x]));
  timeKnown = !tm.error;
  for (const p of people) p.time = tmOf.get(p.id) || null;
  extraCats = cats.error ? [] : cats.data || [];
  extraOf = new Map();
  for (const a of asg.error ? [] : asg.data || []) {
    if (!extraOf.has(a.member_id)) extraOf.set(a.member_id, new Set());
    extraOf.get(a.member_id).add(a.category_id);
  }
}

// which trackers each member has, with one-tap open / close for everyone
function drawAccess() {
  const box = $('#trk-access'); if (!box) return;
  const members = people.filter((p) => p.role === 'member' && p.is_active);
  if (!extraCats.length) { box.hidden = true; return; }
  box.innerHTML = `<b id="ta-h">Tracker access</b><p class="muted" style="font-size:14px">Members see only the trackers you open. Open one for everyone after the session that teaches it, or per person with “Trackers”.</p>
    <div class="ta-list">${extraCats.map((c) => {
      const n = members.filter((p) => extraOf.get(p.id)?.has(c.id)).length;
      return `<div class="ta-row" style="--tc:${TRACKER_COLOR[c.slug] || 'var(--c-primary)'}"><i></i><span><b>${esc(c.name)}</b><small>${n} of ${members.length} members</small></span>
        ${n < members.length ? `<button class="btn btn-sm btn-soft" data-open-all="${c.id}" data-on="1">Open for all</button>` : ''}
        ${n ? `<button class="btn btn-sm btn-ghost" data-open-all="${c.id}" data-on="0">Close for all</button>` : ''}</div>`;
    }).join('')}</div>`;
}

function trackersDialog(p) {
  const has = extraOf.get(p.id) || new Set();
  formDialog({
    title: `Trackers for ${p.full_name || p.email}`,
    body: 'Tick the trackers this member should see. Open each one after the session that teaches it. Every habit is +10 points.',
    fields: `<div class="stack" style="gap:8px">${extraCats.map((c) => `<label class="trk-opt" style="--tc:${TRACKER_COLOR[c.slug] || 'var(--c-primary)'}">
      <input type="checkbox" name="cat" value="${c.id}" ${has.has(c.id) ? 'checked' : ''}><i></i><span>${esc(c.name)}</span></label>`).join('')}</div>`,
    submitLabel: 'Save',
    onSubmit: async (form) => {
      const want = new Set([...form.querySelectorAll('input[name=cat]:checked')].map((x) => x.value));
      const changes = extraCats.filter((c) => want.has(c.id) !== has.has(c.id));
      for (const c of changes) {
        const on = want.has(c.id);
        const { error } = await supabase.rpc('admin_set_tracker_member', { p_category: c.id, p_member: p.id, p_on: on });
        if (error) { toast(friendlyError(error), 'bad'); return false; }
        if (on) has.add(c.id); else has.delete(c.id);
      }
      extraOf.set(p.id, has); renderList(); drawAccess();
      toast(changes.length ? 'Trackers updated' : 'No changes');
      return true;
    }
  });
}

function counts() {
  return {
    all: people.length,
    member: people.filter((p) => p.role === 'member').length,
    coach: people.filter((p) => p.role !== 'member').length,
    paused: people.filter((p) => !p.is_active).length,
    setup: people.filter(setupDue).length,
    idle: people.filter(idleDue).length,
    renew: people.filter(renewDue).length
  };
}

// membership renewal: days left (negative = overdue)
const todayISO = () => new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10);
const daysTo = (d) => Math.round((new Date(d + 'T00:00:00Z') - new Date(todayISO() + 'T00:00:00Z')) / 864e5);
function renewHTML(p) {
  if (!p.renews_on && !p.member_since) return '';
  const left = p.renews_on ? daysTo(p.renews_on) : null;
  const tone = left === null ? '' : left < 0 ? 'color:var(--c-danger,#c0392b);font-weight:700' : left <= 7 ? 'color:var(--c-warning-ink,#8a5a00);font-weight:700' : '';
  const when = left === null ? '' : left < 0 ? ` (overdue ${-left} day${left === -1 ? '' : 's'})` : left === 0 ? ' (today)' : left <= 30 ? ` (in ${left} day${left === 1 ? '' : 's'})` : '';
  return `${p.member_since ? `<span>Member since ${esc(formatDate(p.member_since))}</span>` : ''}${p.renews_on ? `<span style="${tone}">Renews ${esc(formatDate(p.renews_on))}${when}</span>` : ''}`;
}
const renewDue = (p) => p.role === 'member' && p.renews_on && daysTo(p.renews_on) <= 30;

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
      <div class="meta"><span>${/@family\.invalid$/.test(p.email || '') ? 'Family link' : esc(p.email)}</span>${p.phone ? `<span>${esc(p.phone)}</span>` : ''}<span>Joined ${esc(formatDate(p.joined_on))}</span>
      ${renewHTML(p)}<span>Last login ${esc(timeAgo(p.last_sign_in_at))}</span>${p.email_confirmed ? '' : '<span style="color:var(--c-warning-ink);font-weight:600">Email not confirmed</span>'}</div></div>
    <div class="acts">${p.is_active ? '' : '<span class="pill bad">Paused</span>'}${roleCtl}
      ${p.role === 'member' && extraCats.length ? (() => { const n = extraOf.get(p.id)?.size || 0; return `<span class="pill ${n ? 'trk' : 'bad'}" title="${esc(extraCats.filter((c) => extraOf.get(p.id)?.has(c.id)).map((c) => c.name).join(', '))}">${n ? `${n} tracker${n > 1 ? 's' : ''}` : 'No trackers yet'}</span>`; })() : ''}
      ${setupKnown && p.role === 'member' ? `<span class="pill ${p.app_installed ? 'trk' : 'bad'}" title="${p.app_installed ? 'Opens the installed app' : 'Has not opened the installed app yet'}">${p.app_installed ? 'App ✓' : 'No app'}</span><span class="pill ${p.phones ? 'trk' : 'bad'}" title="Phones getting notifications: ${p.phones}">${p.phones ? 'Alerts ✓' : 'No alerts'}</span>` : ''}
      ${timeKnown && p.role === 'member' ? `<span class="pill ${p.time?.today ? 'trk' : 'none'}" title="Time in the app (only while open and in use). Average a day over the last 7 days: ${mins(p.time?.avg7)}; used on ${p.time?.days7 || 0} of the last 7 days">⏱ ${mins(p.time?.today)} today · ${mins(p.time?.week)} this week</span>${idleDue(p) ? `<span class="pill bad">${p.time?.last_at ? `Last used ${esc(timeAgo(p.time.last_at))}` : 'Never used the app'}</span>` : ''}` : ''}
      ${setupDue(p) && p.phone ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${waLink(p.phone, setupText(p))}">${icon('message-square')}Setup help</a>` : ''}
      ${p.role === 'member' ? `<a class="btn btn-sm btn-soft" href="${app('admin/member.html?id=' + p.id)}">${icon('trending-up')}Progress</a>` : ''}
      ${p.role === 'member' && extraCats.length ? `<button class="btn btn-sm btn-ghost" data-trk="${p.id}">${icon('list-checks')}Trackers</button>` : ''}
      ${p.role === 'member' ? `<button class="btn btn-sm btn-ghost" data-mship="${p.id}">${icon('calendar')}Membership</button>` : ''}
      ${p.role === 'member' && p.is_active ? `<button class="btn btn-sm btn-ghost" data-bonus="${p.id}">${icon('sparkles')}Bonus</button>
        <button class="btn btn-sm btn-ghost" data-notice="${p.id}">${icon('bell')}Notify</button>` : ''}
      ${canToggle ? `<button class="btn btn-sm ${p.is_active ? 'btn-ghost' : 'btn-ok'}" data-active="${p.id}">${icon(p.is_active ? 'pause' : 'play')}${p.is_active ? 'Pause' : 'Activate'}</button>` : ''}</div>
  </article>`;
}

function renderList() {
  const q = query.trim().toLowerCase();
  const list = people.filter((p) =>
    (filter === 'all' || (filter === 'member' && p.role === 'member') || (filter === 'coach' && p.role !== 'member') || (filter === 'paused' && !p.is_active) || (filter === 'renew' && renewDue(p)) || (filter === 'setup' && setupDue(p)) || (filter === 'idle' && idleDue(p))) &&
    (!q || `${p.full_name} ${p.email} ${p.phone || ''}`.toLowerCase().includes(q)));
  const c = counts();
  $$('[data-filter]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.filter === filter)); b.querySelector('.c').textContent = c[b.dataset.filter]; });
  $('#list').innerHTML = list.length ? `<div class="people">${list.map(personHTML).join('')}</div>`
    : `<div class="panel empty-state"><span class="ic">${icon('users')}</span><b>${people.length ? 'No one matches' : 'No members yet'}</b>
       <span>${people.length ? 'Try another filter or clear the search.' : 'Share the join link above. New sign-ups appear here.'}</span></div>`;
}

async function renderMembers() {
  const main = $('#main');
  const joinUrl = shareLink('join.html');
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">${me.profile.role === 'super_admin' ? 'You can change roles and pause anyone' : 'You can pause or activate members'}</span><h1>Members</h1></div></div>
  <section class="panel panel-pad stack" style="gap:10px">
    <b>Join form</b><p class="muted" style="font-size:14px">Send this link on WhatsApp. People fill their name, city, phone and email. They show up here; tap Approve to open the app for them.</p>
    <div class="invite"><code id="join-url">${esc(joinUrl)}</code><button class="btn btn-ghost btn-sm" id="copy-join">${icon('copy')}Copy link</button>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`*DEEPAK'S 10X LIFE*\nApp login details 👇\nPlease fill your Name, City, Contact number and Email ID here:\n${joinUrl}`)}">${icon('phone')}Share on WhatsApp</a>
      <button class="btn btn-ghost btn-sm" id="jr-xlsx">${icon('file-chart-column')}Download Excel</button></div>
    <div id="jr-list" class="stack" style="gap:8px"></div>
  </section>
  <section class="panel panel-pad stack" style="gap:10px" id="fam-panel" aria-labelledby="fam-h">
    <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><b id="fam-h">Family links</b>
      <button class="btn btn-gold btn-sm" id="fam-new">${icon('user-plus')}New family</button></div>
    <p class="muted" style="font-size:14px">One link for a whole family. Each person opens it and types their name once; next time they just tap their name. Everyone in the family sees each other's habits and points, never other families.</p>
    <div id="fam-list" class="stack" style="gap:8px"></div>
  </section>
  <section class="panel panel-pad notice-bar"><span class="si">${icon('bell')}</span><span><b>Send a notification</b><small>Reaches the app and the phone of everyone who turned notifications on</small></span>
    <button class="btn btn-gold btn-sm" data-notice="all">${icon('bell')}To all members</button></section>
  <section class="panel panel-pad stack" style="gap:10px" id="trk-access" aria-labelledby="ta-h"></section>
  <div class="tools">
    <div class="chips" role="group" aria-label="Filter">${[['all', 'All'], ['member', 'Members'], ['coach', 'Coaches'], ['renew', 'Renewals due'], ['setup', 'App not set up'], ['idle', 'Not opened 3+ days'], ['paused', 'Paused']].map(([v, l]) =>
      `<button class="chip" data-filter="${v}" aria-pressed="false">${l}<span class="c"></span></button>`).join('')}</div>
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="Search name, email or phone" aria-label="Search members"></label>
  </div>
  <div id="list"><div class="skeleton" style="height:76px"></div><div class="skeleton" style="height:76px;margin-top:10px"></div></div>`;

  $('#copy-join').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(joinUrl); toast('Join link copied'); }
    catch { const r = document.createRange(); r.selectNodeContents($('#join-url')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Link selected. Long-press to copy.', 'info'); }
  });
  $('#q').addEventListener('input', (e) => { query = e.target.value; renderList(); });
  loadJoinRequests();
  loadFamilies();
  $('#fam-new').addEventListener('click', () => familyDialog(null));
  $('#jr-xlsx').addEventListener('click', (e) => withBusy(e.currentTarget, 'Preparing…', downloadJoinExcel));
  main.addEventListener('click', async (e) => {
    const fe = e.target.closest('[data-fam-edit]');
    if (fe) { familyDialog(families.find((f) => f.id === fe.dataset.famEdit)); return; }
    const fc = e.target.closest('[data-fam-copy]');
    if (fc) {
      const f = families.find((x) => x.id === fc.dataset.famCopy);
      try { await navigator.clipboard.writeText(familyLink(f)); toast('Family link copied'); } catch { toast(familyLink(f), 'info'); }
      return;
    }
    const fr = e.target.closest('[data-fam-rm]');
    if (fr) {
      const [fid, mid] = fr.dataset.famRm.split('|'); const f = families.find((x) => x.id === fid);
      const m = f.family_members.find((x) => x.member_id === mid);
      if (!(await confirmDialog({ title: `Take ${m.profiles?.full_name || 'this person'} out of ${f.name}?`, body: 'Their account, ticks and points stay. The family link will no longer open it, and they stop seeing the family.', confirmLabel: 'Take out', danger: true }))) return;
      const { error } = await supabase.rpc('admin_family_remove', { p_member: mid });
      if (error) return toast(friendlyError(error), 'bad');
      toast('Taken out of the family'); loadFamilies(); return;
    }
    const ja = e.target.closest('[data-jr-ok]');
    if (ja) { approveJoinDialog(joinReqs.find((r) => r.id === ja.dataset.jrOk)); return; }
    const jd = e.target.closest('[data-jr-no]');
    if (jd) {
      const r = joinReqs.find((x) => x.id === jd.dataset.jrNo);
      if (!(await confirmDialog({ title: `Remove ${r.full_name}'s request?`, body: 'No account is made. They can fill the form again.', confirmLabel: 'Remove', danger: true }))) return;
      const { error } = await supabase.rpc('admin_dismiss_join', { p_request: r.id });
      if (error) return toast(friendlyError(error), 'bad');
      toast('Request removed'); loadJoinRequests(); return;
    }
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; renderList(); return; }
    const bz = e.target.closest('[data-bonus]');
    if (bz) { bonusDialog(people.find((x) => x.id === bz.dataset.bonus)); return; }
    const nt = e.target.closest('[data-notice]');
    if (nt) { noticeDialog(nt.dataset.notice === 'all' ? null : people.find((x) => x.id === nt.dataset.notice)); return; }
    const oa = e.target.closest('[data-open-all]');
    if (oa) {
      const c = extraCats.find((x) => x.id === oa.dataset.openAll), on = oa.dataset.on === '1';
      const ok = await confirmDialog({ title: `${on ? 'Open' : 'Close'} ${c.name} for ${on ? 'every' : 'every'} member?`,
        body: on ? 'All active members will see this tracker and get a notification. You can still close it for one person.' : 'No member will see this tracker until you open it again. Their past ticks and points stay.',
        confirmLabel: on ? 'Open for all' : 'Close for all', danger: !on });
      if (!ok) return;
      await withBusy(oa, on ? 'Opening…' : 'Closing…', async () => {
        const { data: n, error } = await supabase.rpc('admin_set_tracker_all', { p_category: c.id, p_on: on });
        if (error) return toast(friendlyError(error), 'bad');
        await loadPeople(); renderList(); drawAccess(); toast(on ? `Opened for ${n} member${n === 1 ? '' : 's'}` : 'Closed for everyone');
      });
      return;
    }
    const ms = e.target.closest('[data-mship]');
    if (ms) { membershipDialog(people.find((x) => x.id === ms.dataset.mship)); return; }
    const tk = e.target.closest('[data-trk]');
    if (tk) { trackersDialog(people.find((x) => x.id === tk.dataset.trk)); return; }
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

  try { await loadPeople(); renderList(); drawAccess(); }
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

// ---------------- JOIN REQUESTS (from join.html) ----------------
let joinReqs = [];
async function loadJoinRequests() {
  const box = $('#jr-list'); if (!box) return;
  const { data, error } = await supabase.from('join_requests').select('id, full_name, city, phone, email, created_at').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) { box.innerHTML = `<p class="muted">${esc(friendlyError(error))}</p>`; return; }
  joinReqs = data || [];
  box.innerHTML = joinReqs.length ? `<b style="margin-top:6px">Waiting for approval (${joinReqs.length})</b>` + joinReqs.map((r) => `
    <div class="jr" style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--c-border);border-radius:14px">
      <div style="min-width:0"><b>${esc(r.full_name)}</b><div class="muted" style="font-size:13px;word-break:break-all">${esc([r.city, r.phone, r.email].filter(Boolean).join(' · '))}</div>
        ${people.some((p) => (p.email || '').toLowerCase() === r.email) ? '<small style="color:var(--c-warning-ink,#8a5a00)">Already has an account. Approve adds them to the batch.</small>' : ''}</div>
      <div class="row" style="gap:6px"><button class="btn btn-gold btn-sm" data-jr-ok="${r.id}">${icon('check')}Approve</button>
        <button class="btn btn-ghost btn-sm" data-jr-no="${r.id}" aria-label="Remove request">${icon('x')}</button></div>
    </div>`).join('') : '<p class="muted" style="font-size:13px">No requests waiting.</p>';
}

// everyone who filled the join form (waiting, approved and removed) as an Excel file
async function downloadJoinExcel() {
  const { data, error } = await supabase.from('join_requests').select('full_name, city, phone, email, status, created_at, decided_at').order('created_at', { ascending: true });
  if (error) return toast(friendlyError(error), 'bad');
  if (!data?.length) return toast('No one has filled the form yet.', 'info');
  let XLSX; try { XLSX = await loadXlsx(); } catch (err) { return toast(err.message, 'bad'); }
  const when = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const label = { pending: 'Waiting', approved: 'Approved', dismissed: 'Removed' };
  const rows = data.map((r, i) => ({ 'No': i + 1, 'Name': r.full_name, 'City': r.city || '', 'Contact Number': r.phone || '', 'Email ID': r.email,
    'Status': label[r.status] || r.status, 'Filled on': when(r.created_at), 'Approved / removed on': when(r.decided_at) }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 22 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Join form');
  XLSX.writeFile(wb, `10X-Life-join-form-${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast(`Excel downloaded (${rows.length} people)`);
}

async function approveJoinDialog(r) {
  const [bt, ct] = await Promise.all([
    supabase.from('batches').select('id, name').eq('is_active', true).order('created_at', { ascending: false }),
    supabase.from('tracker_categories').select('id, name, slug').eq('is_active', true).order('sort_order')
  ]);
  const batches = bt.data || [], trackers = ct.data || [];
  if (!batches.length) return toast('Create a batch first (Batches page), then approve.', 'info');
  const CORE = ['wealth', 'conscious', 'karma', 'champion'];
  formDialog({
    title: `Approve ${r.full_name}`,
    body: esc([r.city, r.phone, r.email].filter(Boolean).join(' · ')),
    fields: `<div class="field"><label for="jr-b">Batch</label><select id="jr-b">${batches.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select><span class="err"></span></div>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:6px">Open these trackers</legend>
      ${trackers.map((t) => `<label class="check"><input type="checkbox" name="jr-t" value="${t.id}" ${CORE.includes(t.slug) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')}</fieldset>`,
    submitLabel: 'Approve',
    onSubmit: async (form) => {
      const ids = [...form.querySelectorAll('[name=jr-t]:checked')].map((i) => i.value);
      const { data, error } = await supabase.rpc('admin_approve_join', { p_request: r.id, p_batch: form.querySelector('#jr-b').value, p_trackers: ids });
      if (error) { toast(friendlyError(error), 'bad'); return false; }
      const a = (data || [])[0] || {};
      loadJoinRequests(); loadPeople().then(renderList).catch(() => {});
      sentDialog(a);
      return true;
    }
  });
}
function sentDialog(a) {
  const msg = a.temp_password ? loginMessage(a.full_name, a.email, a.temp_password)
    : `Hi ${String(a.full_name || '').split(/\s+/)[0]},\n\nDeepak's 10X Life app-la ungalukku pudhu trackers open pannirukom.\n\nLink: ${shareLink('login.html')}\nUnga pazhaya login (Google / email) vechu ulla ponga.`;
  const link = a.phone ? waLink(a.phone, msg) : '';
  formDialog({
    title: `${a.full_name} can log in now`,
    body: a.status === 'existing' ? 'They already had an account; they are now in the batch with the trackers you picked.' : 'Send the login on WhatsApp. With a Gmail they can also just tap Continue with Google.',
    fields: `${link ? `<a class="btn btn-gold btn-block" target="_blank" rel="noopener" href="${esc(link)}">${icon('phone')}Send login on WhatsApp</a>` : '<p class="muted">No phone number. Copy the message below and send it.</p>'}
      <textarea readonly rows="6" style="width:100%">${esc(msg)}</textarea>`,
    submitLabel: 'Done',
    onSubmit: async () => true
  });
}

// ---------------- FAMILY LINKS (family.html) ----------------
let families = [];
const familyLink = (f) => shareLink(`family.html#${f.token}`);
const familyText = (f) => `*${f.name}* · Deepak's 10X Life 🙏\n\nIndha link-a open panni unga peyar type pannunga (first time mattum). Adutha thadava unga peyar mela tap panna podhum, app open aagidum.\n${familyLink(f)}\n\nPhone la "Add to Home screen" pannina app maari use pannalam.`;
async function loadFamilies() {
  const box = $('#fam-list'); if (!box) return;
  const { data, error } = await supabase.from('families')
    .select('id, name, token, trackers, max_people, is_active, created_at, family_members(member_id, via_link, added_at, profiles(full_name, is_active))')
    .order('created_at', { ascending: false });
  if (error) { box.innerHTML = `<p class="muted">${esc(friendlyError(error))}</p>`; return; }
  families = data || [];
  box.innerHTML = families.length ? families.map((f) => {
    const ms = [...(f.family_members || [])].sort((a, b) => String(a.added_at).localeCompare(String(b.added_at)));
    return `<div style="padding:10px 12px;border:1px solid var(--c-border);border-radius:14px" class="stack ${f.is_active ? '' : 'paused'}">
      <div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc(f.name)}</b>
        <span class="muted" style="font-size:13px"> · ${ms.length}/${f.max_people} people · ${(f.trackers || []).length} trackers</span>${f.is_active ? '' : ' <span class="pill bad">Paused</span>'}</div>
        <div class="row" style="gap:6px;flex-wrap:wrap">${f.is_active ? `<a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(familyText(f))}">${icon('phone')}WhatsApp</a>
          <button class="btn btn-ghost btn-sm" data-fam-copy="${f.id}">${icon('copy')}Copy link</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-fam-edit="${f.id}">Edit</button></div></div>
      ${ms.length ? `<div class="row" style="gap:6px;flex-wrap:wrap">${ms.map((m) => `<span class="pill ${m.profiles?.is_active === false ? 'bad' : 'trk'}">${esc(m.profiles?.full_name || '?')}
        <button type="button" data-fam-rm="${f.id}|${m.member_id}" aria-label="Take ${esc(m.profiles?.full_name || '')} out" style="border:0;background:none;padding:0 0 0 4px;cursor:pointer;color:inherit">×</button></span>`).join('')}</div>`
        : '<small class="muted">No one has opened the link yet.</small>'}</div>`;
  }).join('') : '<p class="muted" style="font-size:13px">No families yet.</p>';
}

async function familyDialog(f) {
  const { data: trackers } = await supabase.from('tracker_categories').select('id, name, slug').eq('is_active', true).order('sort_order');
  const on = new Set(f ? f.trackers || [] : (trackers || []).map((t) => t.id));   // a new family gets every tracker
  formDialog({
    title: f ? `Edit ${f.name}` : 'New family',
    body: f ? 'Changes to trackers apply to people who join from now on. Tick the box below to open them for everyone already in.' : 'You get a link to send on WhatsApp.',
    fields: `<div class="field"><label for="fm-n">Family name</label><input id="fm-n" maxlength="60" value="${esc(f?.name || '')}" placeholder="e.g. Raman family"><span class="err"></span></div>
      <div class="field"><label for="fm-m">Most people in this family</label><input id="fm-m" type="number" min="1" max="30" value="${f?.max_people || 12}"><span class="err"></span></div>
      <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:600;margin-bottom:6px">Trackers for everyone</legend>
      ${(trackers || []).map((t) => `<label class="check"><input type="checkbox" name="fm-t" value="${t.id}" ${on.has(t.id) ? 'checked' : ''}>${esc(t.name)}</label>`).join('')}</fieldset>
      ${f ? `<label class="check"><input type="checkbox" id="fm-apply">Also open these trackers for people already in the family</label>
      <label class="check"><input type="checkbox" id="fm-active" ${f.is_active ? 'checked' : ''}>Link is working (untick to pause it)</label>
      <label class="check"><input type="checkbox" id="fm-newlink">Make a new link (the old link stops working)</label>` : ''}`,
    submitLabel: f ? 'Save' : 'Make family',
    onSubmit: async (form) => {
      const name = form.querySelector('#fm-n').value.trim();
      if (name.length < 2) return fieldErr(form, '#fm-n', 'Type a family name.');
      const max = Number(form.querySelector('#fm-m').value) || 12;
      const ids = [...form.querySelectorAll('[name=fm-t]:checked')].map((i) => i.value);
      const { error } = f
        ? await supabase.rpc('admin_update_family', { p_family: f.id, p_name: name, p_trackers: ids, p_max: max,
            p_active: form.querySelector('#fm-active').checked, p_new_link: form.querySelector('#fm-newlink').checked, p_apply: form.querySelector('#fm-apply').checked })
        : await supabase.rpc('admin_create_family', { p_name: name, p_trackers: ids, p_max: max });
      if (error) { toast(friendlyError(error), 'bad'); return false; }
      await loadFamilies();
      toast(f ? 'Family saved' : 'Family made. Send the link on WhatsApp.');
      return true;
    }
  });
}

// ---------------- MEMBERSHIP DATES ----------------
function membershipDialog(p) {
  formDialog({
    title: `Membership · ${p.full_name || p.email}`,
    body: 'You get a notification 7 days before, 1 day before and on the renewal day.',
    fields: `<div class="field"><label for="ms-s">Joined on</label><input id="ms-s" type="date" value="${esc(p.member_since || '')}"><span class="err"></span></div>
      <div class="field"><label for="ms-r">Renews on</label><input id="ms-r" type="date" value="${esc(p.renews_on || '')}"><span class="err"></span></div>`,
    submitLabel: 'Save',
    onSubmit: async (form) => {
      const since = form.querySelector('#ms-s').value || null, renews = form.querySelector('#ms-r').value || null;
      if (since && renews && renews < since) return fieldErr(form, '#ms-r', 'Renewal must be after the joining date.');
      const { error } = await supabase.rpc('admin_set_membership', { p_member: p.id, p_since: since, p_renews: renews });
      if (error) { toast(friendlyError(error), 'bad'); return false; }
      Object.assign(p, { member_since: since, renews_on: renews }); renderList(); toast('Membership dates saved');
      return true;
    }
  });
}

// ---------------- NOTIFICATION FROM THE COACH ----------------
function noticeDialog(p) {
  const n = people.filter((x) => x.role === 'member' && x.is_active).length;
  formDialog({
    title: p ? `Notify ${p.full_name || p.email}` : `Notify all members (${n})`,
    body: 'They see it in the app (bell) and, if they turned on phone notifications, on their phone.',
    fields: `<div class="field"><label for="nt-t">Title</label><input id="nt-t" maxlength="120" placeholder="e.g. Class today at 7 pm"><span class="err"></span></div>
      <div class="field"><label for="nt-b">Message <span class="opt">(optional)</span></label><textarea id="nt-b" maxlength="500" rows="3" placeholder="Zoom link, reminder, a word of encouragement…"></textarea></div>`,
    submitLabel: 'Send',
    onSubmit: async (form) => {
      const t = form.querySelector('#nt-t').value.trim();
      if (!fieldErr(form, '#nt-t', t.length < 3 ? 'Write a short title.' : '')) return false;
      const { data, error } = await supabase.rpc('admin_send_notice', { p_title: t, p_body: form.querySelector('#nt-b').value.trim() || null, p_members: p ? [p.id] : null });
      if (error) { toast(friendlyError(error), 'bad'); return false; }
      toast(`Sent to ${data} member${data === 1 ? '' : 's'}`);
      return true;
    }
  });
}

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
let ci = { date: null, tracker: '', status: '', q: '', rows: [], seq: 0, view: (() => { try { return sessionStorage.getItem('ryl.ci.view') || 'members'; } catch { return 'members'; } })(), people: [], total: 58 };
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

const trackerChips = (list) => [['', 'All trackers'], ...list].map(([v, l]) =>
  `<button class="chip" data-tr="${esc(v)}" aria-pressed="${ci.tracker === v}">${esc(l)}</button>`).join('');

async function renderCheckins() {
  const main = $('#main');
  // tracker filter chips follow the database (extra trackers such as Conscious Couple appear too)
  supabase.from('tracker_categories').select('slug, name').eq('is_active', true).order('sort_order').then(({ data }) => {
    if (data?.length && $('#ci-trk')) $('#ci-trk').innerHTML = trackerChips(data.map((c) => [c.slug, c.name.replace(/ (Habits|Activities|Mindsets)$/, '')]));
  });
  ci.date = ci.date || istToday();
  main.innerHTML = `
  <div class="admin-head"><div><span class="eyebrow">Members tick, points are instant. Remove fake ticks here.</span><h1>Check-ins</h1></div></div>
  <div class="seg seg-2v" role="tablist" aria-label="View">
    <button role="tab" data-view="members" aria-selected="${ci.view === 'members'}">${icon('users')}By member</button>
    <button role="tab" data-view="entries" aria-selected="${ci.view === 'entries'}">${icon('list-checks')}All entries</button></div>
  <div class="tools">
    <label class="field" style="flex:none;gap:4px"><span class="visually-hidden">Date</span><input id="ci-date" type="date" value="${ci.date}" max="${istToday()}" style="min-height:42px;padding:8px 12px"></label>
    <label class="search">${icon('search')}<input id="ci-q" type="search" placeholder="Search member or activity" aria-label="Search check-ins" value="${esc(ci.q)}"></label>
  </div>
  <div class="tools ci-entries"><div class="chips" role="group" aria-label="Tracker" id="ci-trk">${trackerChips([['wealth', 'Wealth'], ['conscious', 'Conscious'], ['karma', 'Karma'], ['champion', 'Champion']])}</div></div>
  <div class="tools ci-entries"><div class="chips" role="group" aria-label="Status">${[['', 'All'], ['done', 'Done'], ['not_done', 'Not done'], ['removed', 'Removed']].map(([v, l]) =>
      `<button class="chip" data-st="${v}" aria-pressed="${ci.status === v}">${l}</button>`).join('')}</div><span class="muted" id="ci-count" style="font-size:13px"></span></div>
  <div id="ci-list"></div>`;
  let t;
  $('#ci-q').addEventListener('input', (e) => { ci.q = e.target.value; clearTimeout(t); t = setTimeout(ci.view === 'members' ? drawMembersDay : loadCheckins, ci.view === 'members' ? 0 : 300); });
  $('#ci-date').addEventListener('change', (e) => { ci.date = e.target.value || istToday(); loadCheckins(); });
  main.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { ci.view = v.dataset.view; try { sessionStorage.setItem('ryl.ci.view', ci.view); } catch { /* ignore */ }
      $$('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b === v))); return loadCheckins(); }
    const tr = e.target.closest('[data-tr]'); if (tr) { ci.tracker = tr.dataset.tr; $$('[data-tr]').forEach((b) => b.setAttribute('aria-pressed', String(b === tr))); return loadCheckins(); }
    const st = e.target.closest('[data-st]'); if (st) { ci.status = st.dataset.st; $$('[data-st]').forEach((b) => b.setAttribute('aria-pressed', String(b === st))); return loadCheckins(); }
    const rm = e.target.closest('[data-void]'); if (rm) return voidDialog(ci.rows.find((r) => r.id === rm.dataset.void));
  });
  await loadCheckins();
}

async function loadCheckins() {
  const seq = ++ci.seq;   // a newer load (view or filter change) wins over an older one still in flight
  $$('.ci-entries').forEach((el) => { el.hidden = ci.view === 'members'; });
  $('#ci-q').placeholder = ci.view === 'members' ? 'Search member' : 'Search member or activity';
  if (ci.view === 'members') return loadMembersDay(seq);
  $('#ci-summary')?.remove();
  const list = $('#ci-list');
  list.innerHTML = `<div class="skeleton" style="height:72px"></div><div class="skeleton" style="height:72px;margin-top:10px"></div>`;
  const { data, error } = await supabase.rpc('admin_checkins', { p_date: ci.date, p_tracker: ci.tracker || null, p_status: ci.status || null, p_search: ci.q || null, p_limit: 300 });
  if (seq !== ci.seq) return;
  if (error) return errorPanel(list, error, loadCheckins);
  ci.rows = data || [];
  $('#ci-count').textContent = `${ci.rows.length}${ci.rows.length === 300 ? '+' : ''} entries`;
  if (!ci.rows.length) {
    list.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('check-check')}</span><b>No check-ins match</b><span>${ci.q || ci.tracker || ci.status ? 'Try another filter or clear the search.' : 'When members tick habits on this day, they appear here.'}</span></div>`;
    return;
  }
  list.innerHTML = `<div class="people">${ci.rows.map(checkinHTML).join('')}</div>`;
}

// ---- By member: one card per member for the chosen day (admin_day_summary) ----
async function loadMembersDay(seq = ++ci.seq) {
  const list = $('#ci-list');
  list.innerHTML = `<div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px;margin-top:10px"></div>`;
  const [sum, cnt] = await Promise.all([
    supabase.rpc('admin_day_summary', { p_date: ci.date }),
    supabase.from('activities').select('id, tracker_categories!inner(is_active)', { count: 'exact', head: true }).eq('is_active', true).eq('tracker_categories.is_active', true)
  ]);
  if (seq !== ci.seq) return;
  if (sum.error) return errorPanel(list, sum.error, () => loadMembersDay());
  ci.people = sum.data || []; ci.total = cnt.count || 58;
  drawMembersDay();
}
function drawMembersDay() {
  const list = $('#ci-list'), q = ci.q.trim().toLowerCase();
  const rows = ci.people.filter((p) => !q || (p.full_name || '').toLowerCase().includes(q));
  const started = ci.people.filter((p) => p.done + p.not_done > 0).length;
  $('#ci-count').textContent = '';
  $('#ci-summary')?.remove();
  list.insertAdjacentHTML('beforebegin', `<p class="muted" id="ci-summary" style="font-size:13px">${started} of ${ci.people.length} members marked habits on ${esc(niceDate(ci.date))}</p>`);
  if (!rows.length) {
    list.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('users')}</span><b>${q ? 'No member matches' : 'No members yet'}</b><span>${q ? 'Try another name.' : 'Share the join link from Members.'}</span></div>`;
    return;
  }
  list.innerHTML = `<div class="mday">${rows.map((p) => {
    const total = p.total ?? ci.total;               // each member's own trackers (extra trackers add to it)
    const left = Math.max(0, total - p.done - p.not_done);
    const pct = total ? Math.round(100 * p.done / total) : 0;
    const state = !p.done && !p.not_done ? ['s-none', 'Not started'] : left === 0 ? ['s-done', 'All marked'] : ['s-prog', 'In progress'];
    return `<a class="mcard ${p.is_active ? '' : 'paused'}" href="${app(`admin/member.html?id=${p.member_id}&d=${ci.date}`)}">
      ${ringHTML(pct, { size: 52, stroke: 5, mid: `${pct}%` })}
      <div class="mc-body"><div class="mc-top"><b>${esc(p.full_name || 'Member')}</b><span class="state ${state[0]}">${state[1]}</span></div>
        <div class="counts"><span class="c-ok"><i></i><b>${p.done}</b> done</span><span class="c-no"><i></i><b>${p.not_done}</b> not done</span><span class="c-left"><i></i><b>${left}</b> not marked</span>${p.removed ? `<span class="c-rm"><i></i><b>${p.removed}</b> removed</span>` : ''}</div>
        <small>${p.last_at ? `Last tick ${esc(timeAgo(p.last_at))} · +${p.points} pts` : p.is_active ? 'No ticks yet' : 'Paused'}</small></div>
      <span class="go" aria-hidden="true">${icon('chevron-right')}</span></a>`; }).join('')}</div>`;
  animateIn(list);
}
const niceDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

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

function voidDialog(r, after = loadCheckins) {
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
      after();
      return true;
    }
  });
}

// ---------------- MEMBER PROGRESS (coach) ----------------
const mp = { id: null, date: null, person: null, acts: [], cats: [], range: [], filter: 'all' };
const addDaysIso = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function renderMember() {
  const main = $('#main');
  const qs = new URLSearchParams(location.search);
  mp.id = qs.get('id'); mp.date = /^\d{4}-\d{2}-\d{2}$/.test(qs.get('d') || '') ? qs.get('d') : istToday();
  if (mp.date > istToday()) mp.date = istToday();
  main.innerHTML = `<div class="skeleton" style="height:140px"></div><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:320px"></div>`;
  if (!/^[0-9a-f-]{36}$/.test(mp.id || '')) return errorPanel(main, new Error('Member not found.'), () => { location.href = app('admin/members.html'); }, 'Member not found');
  const [people, cats, acts, asg] = await Promise.all([
    supabase.rpc('admin_list_people'),
    supabase.from('tracker_categories').select('id, slug, name, sort_order, audience').eq('is_active', true).order('sort_order'),
    supabase.from('activities').select('id, category_id, number, default_name, points').eq('is_active', true).order('number'),
    supabase.from('tracker_assignments').select('category_id').eq('member_id', mp.id)
  ]);
  const err = people.error || cats.error || acts.error || asg.error;
  if (err) return errorPanel(main, err, renderMember);
  mp.person = (people.data || []).find((p) => p.id === mp.id);
  if (!mp.person) return errorPanel(main, new Error('This member was not found.'), () => { location.href = app('admin/members.html'); }, 'Member not found');
  // this member's trackers: the 4 open ones + any extra tracker the coach gave them
  const mine = new Set((asg.data || []).map((a) => a.category_id));
  mp.cats = (cats.data || []).filter((c) => (c.audience || 'all') === 'all' || mine.has(c.id));
  const catIds = new Set(mp.cats.map((c) => c.id));
  mp.acts = (acts.data || []).filter((a) => catIds.has(a.category_id));
  const today = istToday(), p = mp.person;
  const { data: rep, error: repErr } = await supabase.rpc('admin_member_report', { p_start: p.joined_on > today ? today : p.joined_on, p_end: today });
  const st = repErr ? null : (rep || []).find((r) => r.member_id === p.id);
  main.innerHTML = `
    <a class="back-link" href="${app('admin/checkins.html')}">${icon('chevron-left')}Check-ins</a>
    <section class="card mp-head">
      <div class="mp-id"><span class="avatar lg" aria-hidden="true">${esc(initials(p.full_name, p.email))}</span>
        <div><div class="mp-name"><h1>${esc(p.full_name || 'Member')}</h1>${p.is_active ? '' : '<span class="pill none">Paused</span>'}</div>
          <p>${esc(p.email || '')}${p.phone ? ' · ' + esc(p.phone) : ''}</p><small>Joined ${esc(formatDate(p.joined_on))}</small></div></div>
      ${st ? `<div class="mp-stats"><div class="stat pts"><small>Total points</small><b>${formatNumber(st.points)}</b></div>
        <div class="stat"><small>Streak</small><b>${st.streak} ${st.streak === 1 ? 'day' : 'days'}</b></div>
        <div class="stat"><small>Consistency</small><b>${Math.round(st.consistency)}%</b></div>
        <div class="stat"><small>Habits done</small><b>${formatNumber(st.activities_done)}</b></div></div>` : ''}
    </section>
    <div class="mp-nav"><button class="iconbtn" id="mp-prev" aria-label="Previous day">${icon('chevron-left')}</button>
      <input type="date" id="mp-date" class="date-in" value="${mp.date}" max="${today}" min="${p.joined_on}" aria-label="Day">
      <button class="iconbtn" id="mp-next" aria-label="Next day">${icon('chevron-right')}</button>
      <button class="btn btn-sm btn-ghost" id="mp-today">Today</button></div>
    <section class="card card-pad" aria-label="Last 14 days"><div class="card-h"><h3>Last 14 days</h3><span class="sub-r muted" style="font-size:12.5px">Tap a day to open it</span></div><div class="mp-strip" id="mp-strip"></div></section>
    <div id="mp-energy"></div>
    <section class="card card-pad" id="mp-time" aria-label="Time in the app" hidden></section>
    <div id="mp-day"></div>
    <div id="mp-extra" class="stack" style="gap:14px"></div>`;
  memberExtras($('#mp-extra'), mp.id).catch(() => { $('#mp-extra').innerHTML = ''; });
  memberTime(mp.id, today).catch(() => {});
  loadEnergy(mp.id).then((list) => { const w = $('#mp-energy'); if (w) { w.innerHTML = energyRowHTML(list, () => '#', 'Energy meters'); w.querySelectorAll('.eg-mini').forEach((a) => a.removeAttribute('href')); animateNeedles(w); } }).catch(() => {});
  $('#mp-date').addEventListener('change', (e) => goDay(e.target.value));
  $('#mp-prev').addEventListener('click', () => goDay(addDaysIso(mp.date, -1)));
  $('#mp-next').addEventListener('click', () => goDay(addDaysIso(mp.date, 1)));
  $('#mp-today').addEventListener('click', () => goDay(today));
  main.addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]'); if (d) return goDay(d.dataset.day);
    const f = e.target.closest('[data-mf]'); if (f) { mp.filter = f.dataset.mf; return drawDay(); }
    const rm = e.target.closest('[data-void]');
    if (rm) { const r = mp.range.find((x) => x.id === rm.dataset.void); const a = mp.acts.find((x) => x.id === r?.activity_id);
      if (r && a) voidDialog({ ...r, member_name: p.full_name, activity_name: a.default_name }, loadMemberDays); }
  });
  await loadMemberDays();
}

// Time in the app, last 14 days (counted only while the app is open and in use)
async function memberTime(id, today) {
  const box = $('#mp-time'); if (!box) return;
  const from = addDaysIso(today, -13);
  const { data, error } = await supabase.from('app_usage').select('day, seconds, opens').eq('member_id', id).gte('day', from).order('day');
  if (error) return;
  const by = new Map((data || []).map((r) => [r.day, r]));
  const days = Array.from({ length: 14 }, (_, i) => addDaysIso(from, i));
  const max = Math.max(60, ...days.map((d) => by.get(d)?.seconds || 0));
  const total = days.reduce((a, d) => a + (by.get(d)?.seconds || 0), 0);
  const used = days.filter((d) => (by.get(d)?.seconds || 0) >= 30).length;
  box.hidden = false;
  box.innerHTML = `<div class="card-h"><h3>Time in the app</h3><span class="sub-r muted" style="font-size:12.5px">Last 14 days · used on ${used} days · ${mins(Math.round(total / 14))} a day on average</span></div>
    <div class="mp-time">${days.map((d) => { const r = by.get(d), sec = r?.seconds || 0;
      return `<div class="mt-d ${d === today ? 'today' : ''}" title="${esc(formatDate(d))}: ${mins(sec)}${r?.opens ? `, opened ${r.opens} time${r.opens > 1 ? 's' : ''}` : ''}">
        <span class="v">${sec >= 60 ? Math.floor(sec / 60) : ''}</span><div class="col"><i style="height:${Math.round(100 * sec / max)}%"></i></div><small>${Number(d.slice(8))}</small></div>`; }).join('')}</div>
    <p class="muted" style="font-size:12px;margin-top:6px">Numbers are minutes. Counted only while the app is on the screen and being used.</p>`;
}

function goDay(d) {
  const p = mp.person, today = istToday();
  if (!d || d > today || d < p.joined_on) return;
  mp.date = d; $('#mp-date').value = d;
  history.replaceState(null, '', `?id=${mp.id}&d=${d}`);
  const inStrip = d >= addDaysIso(today, -13);
  inStrip ? (drawStrip(), drawDay()) : loadMemberDays();
}

async function loadMemberDays() {
  const today = istToday();
  const start = mp.date < addDaysIso(today, -13) ? mp.date : addDaysIso(today, -13);
  const { data, error } = await supabase.rpc('admin_member_checkins', { p_member: mp.id, p_start: start < addDaysIso(today, -62) ? addDaysIso(today, -62) : start, p_end: today });
  if (error) return errorPanel($('#mp-day'), error, loadMemberDays);
  mp.range = data || [];
  drawStrip(); drawDay();
}

function drawStrip() {
  const today = istToday(), ids = new Set(mp.acts.map((a) => a.id)), total = mp.acts.length || 1;
  const days = Array.from({ length: 14 }, (_, i) => addDaysIso(today, i - 13));
  $('#mp-strip').innerHTML = days.map((d) => {
    const pre = d < mp.person.joined_on;
    const done = mp.range.filter((r) => r.checkin_date === d && r.status === 'done' && !r.voided_at && ids.has(r.activity_id)).length;
    const pct = Math.round(100 * done / total);
    return `<button type="button" class="sday ${d === mp.date ? 'on' : ''} ${pre ? 'pre' : ''}" ${pre ? 'disabled' : `data-day="${d}"`} title="${esc(niceDate(d))}: ${pre ? 'before joining' : `${done} of ${total} done`}">
      <span class="v">${pre ? '' : pct + '%'}</span><span class="col"><i style="height:${pct}%"></i></span><small>${esc(new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }).slice(0, 2))}</small><small class="dn">${Number(d.slice(8))}</small></button>`;
  }).join('');
}

function drawDay() {
  const box = $('#mp-day');
  const rows = new Map(mp.range.filter((r) => r.checkin_date === mp.date).map((r) => [r.activity_id, r]));
  const stOf = (a) => { const r = rows.get(a.id); return !r ? 'none' : r.voided_at ? 'removed' : r.status === 'done' ? 'done' : 'not_done'; };
  const all = mp.acts.map((a) => [a, stOf(a)]);
  const n = (s) => all.filter(([, x]) => x === s).length;
  const done = n('done'), nd = n('not_done'), none = n('none'), rm = n('removed');
  const pts = [...rows.values()].filter((r) => !r.voided_at).reduce((t, r) => t + (r.points_awarded || 0), 0);
  const pct = mp.acts.length ? Math.round(100 * done / mp.acts.length) : 0;
  const LABEL = { done: ['ok', 'check', 'Done'], not_done: ['no', 'x', 'Not done'], none: ['none', 'minus', 'Not marked'], removed: ['rm', 'ban', 'Removed'] };
  const show = (s) => mp.filter === 'all' || mp.filter === s;
  box.innerHTML = `
    <section class="card mp-day">
      ${ringHTML(pct, { size: 84, stroke: 9, mid: `${pct}%` })}
      <div class="txt"><b>${esc(niceDate(mp.date))}${mp.date === istToday() ? ' · today' : ''}</b>
        <span>${done} of ${mp.acts.length} habits done · +${pts} pts</span></div>
    </section>
    <div class="chips mp-filter" role="group" aria-label="Show">${[['all', 'All', mp.acts.length], ['done', 'Done', done], ['not_done', 'Not done', nd], ['none', 'Not marked', none], ...(rm ? [['removed', 'Removed', rm]] : [])].map(([v, l, c]) =>
      `<button class="chip" data-mf="${v}" aria-pressed="${mp.filter === v}">${l}<span class="c">${c}</span></button>`).join('')}</div>
    ${mp.cats.map((c) => {
      const list = all.filter(([a]) => a.category_id === c.id);
      const shown = list.filter(([, s]) => show(s));
      const cd = list.filter(([, s]) => s === 'done').length;
      if (!shown.length) return '';
      return `<section class="card mp-tr" style="--tc:${TRACKER_COLOR[c.slug] || 'var(--c-primary)'}">
        <div class="mp-tr-h"><span class="dot"></span><h3>${esc(c.name)}</h3><span class="cnt">${cd}/${list.length} done</span><div class="pbar"><i style="width:${list.length ? Math.round(100 * cd / list.length) : 0}%"></i></div></div>
        <div class="mp-rows">${shown.map(([a, s]) => { const r = rows.get(a.id), L = LABEL[s];
          return `<div class="mp-row st-${s}"><span class="num">${String(a.number).padStart(2, '0')}</span>
            <div class="nm"><b>${esc(a.default_name)}</b>${r?.note ? `<p class="note">“${esc(r.note)}”</p>` : ''}${s === 'removed' ? `<p class="why">Removed by ${esc(r.voided_by_name || 'coach')}: ${esc(r.void_reason || '')}</p>` : ''}
              ${r && s !== 'none' ? `<small>${esc(timeAgo(r.updated_at))}${s === 'done' ? ` · +${r.points_awarded} pts` : ''}</small>` : ''}</div>
            <div class="rt"><span class="sc sc-${L[0]}">${icon(L[1])}${L[2]}</span>${s === 'done' ? `<button class="btn btn-sm btn-bad" data-void="${r.id}" aria-label="Remove tick: ${esc(a.default_name)}">${icon('x')}<span>Remove</span></button>` : ''}</div></div>`; }).join('')}</div></section>`; }).join('') || `<div class="panel empty-state"><span class="ic">${icon('list-checks')}</span><b>Nothing here</b><span>Choose another filter.</span></div>`}`;
  animateIn(box);
}

// ---------------- ACTIVITIES ----------------
let acts = [], cats = [], actTracker = 'wealth', mediaCount = new Map(), catMedia = new Map();

async function renderActivities() {
  const main = $('#main');
  main.innerHTML = `<div class="admin-head"><div><span class="eyebrow">Names stay exactly as the program defines them</span><h1>Activities</h1></div></div>
    <div class="skeleton" style="height:300px"></div>`;
  const [c, a] = await Promise.all([
    supabase.from('tracker_categories').select('id, slug, name, color, sort_order').order('sort_order'),
    supabase.from('activities').select('id, category_id, number, default_name, description, image_path, icon, points, is_active').order('number')
  ]);
  if (c.error || a.error) return errorPanel(main, c.error || a.error, renderActivities);
  cats = c.data; acts = a.data;
  const am = await supabase.from('activity_media').select('activity_id, category_id');
  mediaCount = new Map(); catMedia = new Map();
  for (const r of am.data || []) {
    if (r.activity_id) mediaCount.set(r.activity_id, (mediaCount.get(r.activity_id) || 0) + 1);
    else if (r.category_id) catMedia.set(r.category_id, (catMedia.get(r.category_id) || 0) + 1);
  }
  main.innerHTML = `<div class="admin-head"><div><span class="eyebrow">Names stay exactly as the program defines them</span><h1>Activities</h1></div></div>
    <div class="chips" role="group" aria-label="Tracker">${cats.map((t) => `<button class="chip" data-at="${t.slug}" aria-pressed="${t.slug === actTracker}">${esc(t.name)}<span class="c">${acts.filter((x) => x.category_id === t.id).length}</span></button>`).join('')}</div>
    <div id="act-list"></div>`;
  main.addEventListener('click', (e) => {
    const t = e.target.closest('[data-at]'); if (t) { actTracker = t.dataset.at; $$('[data-at]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); return drawActs(); }
    const ed = e.target.closest('[data-edit]'); if (ed) return editActivity(acts.find((x) => x.id === ed.dataset.edit));
    const cmb = e.target.closest('[data-cat-media]');
    if (cmb) { const c = cats.find((x) => x.id === cmb.dataset.catMedia); return openPointMedia({ categoryId: c.id, name: c.name }, (n) => { catMedia.set(c.id, n); drawActs(); }); }
    const ex = e.target.closest('[data-explain]');
    if (ex) return openPointMedia(acts.find((x) => x.id === ex.dataset.explain), (n) => { mediaCount.set(ex.dataset.explain, n); drawActs(); });
  });
  drawActs();
}

function drawActs() {
  const cat = cats.find((c) => c.slug === actTracker) || cats[0];
  const list = acts.filter((a) => a.category_id === cat.id);
  const cm = catMedia.get(cat.id) || 0;
  $('#act-list').innerHTML = `<div class="card card-pad cm-bar"><span><b>${esc(cat.name)} · class materials</b><small>${cm ? `${cm} item${cm > 1 ? 's' : ''}` : 'Slides (PDF), audio and links for the whole tracker'}</small></span>
      <button class="btn btn-sm ${cm ? 'btn-soft' : 'btn-gold'}" data-cat-media="${cat.id}">${icon('book-open')}${cm ? 'Edit' : 'Add'} materials</button></div>
    <div class="people">${list.map((a) => {
    const img = activityImageUrl(a.image_path);
    return `<article class="person ${a.is_active ? '' : 'paused'}" style="--tc:${TRACKER_COLOR[cat.slug] || cat.color || 'var(--c-primary)'}">
      <span style="width:72px;aspect-ratio:4/3;border-radius:10px;overflow:hidden;background:var(--bg-2);display:grid;place-items:center;flex:none">${img ? `<img src="${esc(img)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : icon(a.icon || 'image')}</span>
      <div class="who"><b>#${String(a.number).padStart(2, '0')} · ${esc(a.default_name)}</b>
        <div class="meta"><span>${esc(a.description || 'No description')}</span></div>
        <div class="meta"><span class="pill gold" style="text-transform:none;letter-spacing:0">${a.points} pts</span>${a.is_active ? '' : '<span class="pill bad">Hidden</span>'}</div></div>
      <div class="acts"><button class="btn btn-sm btn-ghost" data-edit="${a.id}">${icon('pencil')}Edit</button>
        <button class="btn btn-sm ${mediaCount.get(a.id) ? 'btn-soft' : 'btn-ghost'}" data-explain="${a.id}">${icon('mic')}Explain${mediaCount.get(a.id) ? ` · ${mediaCount.get(a.id)}` : ''}</button></div></article>`; }).join('')}</div>`;
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
    chrome({ 'admin-batches': 'batches', 'admin-sessions': 'sessions', 'admin-member': 'checkins', 'admin-members': 'members', 'admin-checkins': 'checkins', 'admin-activities': 'activities', 'admin-settings': 'settings', 'admin-reports': 'reports' }[page] || 'dashboard');
    if (page === 'admin-dashboard') await renderOverview();
    if (page === 'admin-members') await renderMembers();
    if (page === 'admin-checkins') await renderCheckins();
    if (page === 'admin-activities') await renderActivities();
    if (page === 'admin-settings') await renderSettings();
    if (page === 'admin-reports') await renderReports();
    if (page === 'admin-member') await renderMember();
    if (page === 'admin-sessions') await renderSessions();
    if (page === 'admin-batches') await renderBatches(me);
  } catch (err) {
    document.body.classList.remove('guarding');
    errorPanel($('#main'), err, () => location.reload());
  }
})();
