// Leaderboard for members (member/leaderboard.html) and coaches (admin/leaderboard.html).
// Ranks come from get_leaderboard(): approved = ticked "done" points + bonuses only; never negative.
import { supabase, app } from './supabase.js';
import { requireRole, signOut, friendlyError, ROLE_LABEL } from './auth.js';
import { $, $$, icon, esc, memberNav, adminNav, brandHTML, initials, formatNumber } from './ui.js';

const page = document.body.dataset.page;
const isAdminPage = page === 'admin-leaderboard';
const PERIODS = [['daily', 'Today'], ['weekly', 'This week'], ['monthly', 'This month'], ['all_time', 'All time']];
let me, period = 'weekly', timer = null, loading = false;
try { period = sessionStorage.getItem('ryl.lb') || 'weekly'; } catch { /* storage blocked */ }

function chrome() {
  if (isAdminPage) {
    $('#top').innerHTML = `<div class="topbar">${brandHTML(app('admin/dashboard.html'), 'Coach Console', 'Redesign Your Life')}
      <div class="actions"><span class="pill ${me.profile.role === 'super_admin' ? 'gold' : 'blue'}">${ROLE_LABEL[me.profile.role]}</span>
      <button class="iconbtn" id="logout" aria-label="Log out">${icon('log-out')}</button></div></div>${adminNav('leaderboard')}`;
    $('#logout').addEventListener('click', () => signOut());
  } else {
    $('#top').innerHTML = `<div class="topbar">${brandHTML(app('member/dashboard.html'))}
      <div class="actions"><a href="${app('member/profile.html')}" aria-label="My profile" style="text-decoration:none"><span class="avatar" aria-hidden="true">${esc(initials(me.profile.full_name, me.user.email))}</span></a></div></div>`;
    document.body.insertAdjacentHTML('beforeend', memberNav('leaderboard'));
  }
}

const avatar = (r, cls = 'avatar') => r.avatar_url
  ? `<span class="${cls}"><img src="${esc(r.avatar_url)}" alt=""></span>`
  : `<span class="${cls}" aria-hidden="true">${esc(initials(r.full_name))}</span>`;
const movement = (n, hasPrev) => !hasPrev ? '<span class="mv same">new</span>'
  : n > 0 ? `<span class="mv up">${icon('arrow-up')}${n}</span>` : n < 0 ? `<span class="mv down">${icon('arrow-down')}${-n}</span>` : '<span class="mv same">–</span>';

function shell() {
  $('#main').innerHTML = `
    <div class="lb-head"><div><span class="live">Updates as members tick</span><h1>Leaderboard</h1></div></div>
    <div class="seg" role="tablist" aria-label="Period" style="align-self:flex-start;flex-wrap:wrap">${PERIODS.map(([v, l]) =>
      `<button role="tab" data-p="${v}" aria-selected="${v === period}">${l}</button>`).join('')}</div>
    <div id="lb-body" class="stack" style="gap:16px"></div>
    <section><div class="section-h"><h2>Recognitions</h2><span class="eyebrow">This week</span></div><div class="recog" id="recog"></div></section>`;
  $('#main').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    period = b.dataset.p; try { sessionStorage.setItem('ryl.lb', period); } catch { /* ignore */ }
    $$('[data-p]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    load(true);
  });
}

function errorPanel(target, err) {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span><b>Couldn't load the leaderboard</b>
    <span>${esc(friendlyError(err))}</span><button class="btn btn-ghost btn-sm" id="retry">${icon('rotate-ccw')}Try again</button></div>`;
  $('#retry', target).addEventListener('click', () => load(true));
}

function render(rows) {
  const body = $('#lb-body');
  const scored = rows.filter((r) => r.points > 0);
  if (!rows.length) {
    body.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('users')}</span><b>No members yet</b><span>Members appear here once they join.</span></div>`;
    return;
  }
  if (!scored.length) {
    body.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('trophy')}</span><b>No points yet ${period === 'daily' ? 'today' : period === 'weekly' ? 'this week' : period === 'monthly' ? 'this month' : ''}</b>
      <span>${isAdminPage ? 'Ranks appear as soon as members tick habits.' : 'Tick your first habit and take the top spot.'}</span>
      ${isAdminPage ? '' : `<a class="btn btn-gold btn-sm" href="${app('member/trackers.html')}">${icon('list-checks')}Open trackers</a>`}</div>`;
    return;
  }
  const podium = [1, 0, 2].map((i) => {
    const r = scored[i]; const cls = ['first', 'second', 'third'][i];
    if (!r) return `<div class="pod ${cls} empty"><span class="avatar" aria-hidden="true">?</span><b>–</b><span class="pts">0</span><div class="block">${i + 1}</div></div>`;
    return `<div class="pod ${cls} ${r.is_me ? 'is-me' : ''}">${i === 0 ? `<span class="crownic">${icon('crown')}</span>` : ''}${avatar(r)}
      <b>${esc((r.full_name || 'Member').split(' ')[0])}${r.is_me ? ' (you)' : ''}</b><span class="pts num">${formatNumber(r.points)}</span><div class="block">${i + 1}</div></div>`;
  }).join('');
  const rest = rows.slice(3);
  const mine = rows.find((r) => r.is_me);
  body.innerHTML = `
    <section class="podium" aria-label="Top three">${podium}</section>
    ${mine && mine.rank > 3 ? `<section class="panel my-rank"><span class="num">#${mine.rank}</span><div><b>Your rank</b><p class="muted" style="font-size:13px">${formatNumber(mine.points)} pts · ${Math.round(mine.consistency)}% consistent · ${mine.streak}-day streak</p></div></section>` : ''}
    <section class="panel lb-list">${rest.map((r) => `<div class="lb-row ${r.is_me ? 'me' : ''}">
        <span class="rk num">${r.rank}</span>
        <div class="who">${avatar(r, 'avatar sm')}<div><b>${esc(r.full_name || 'Member')}${r.is_me ? ' (you)' : ''}</b>
          <small>${formatNumber(r.activities_done)} done · ${Math.round(r.consistency)}% consistent · ${r.streak}-day streak</small></div></div>
        <div class="score"><b class="num">${formatNumber(r.points)}</b>${movement(r.movement, r.prev_rank != null)}</div></div>`).join('')}
      <p class="tiebreak">Same points? Higher consistency ranks first, then the longer streak, then whoever reached the score first. Only ticked habits and coach bonuses count, never minus points.</p>
    </section>`;
}

function renderRecog(r) {
  const items = [
    ['sun', 'Champion of the Day', r.champion_of_day], ['repeat', 'Most Consistent', r.most_consistent],
    ['trending-up', 'Best Improvement', r.best_improvement], ['flame', 'Maximum Streak', r.max_streak], ['trophy', 'Monthly Champion', r.monthly_champion]];
  $('#recog').innerHTML = items.map(([ic, label, v]) => `<div class="panel rec ${v ? '' : 'none'}"><span class="ic">${icon(ic)}</span><small>${label}</small>
    <b>${v ? esc(v.name) : 'Not yet'}</b><span>${v ? esc(v.detail) : '&nbsp;'}</span></div>`).join('');
}

async function load(showSkeleton = false) {
  if (loading) return; loading = true;
  if (showSkeleton) $('#lb-body').innerHTML = `<div class="skeleton" style="height:230px"></div><div class="skeleton" style="height:260px"></div>`;
  const [lb, rc] = await Promise.all([supabase.rpc('get_leaderboard', { p_period: period }), supabase.rpc('get_recognitions')]);
  loading = false;
  if (lb.error) return errorPanel($('#lb-body'), lb.error);
  render(lb.data || []);
  if (!rc.error) renderRecog(rc.data || {});
}

// Refresh every 60 s while the page is visible, and right away when the member comes back.
function startAutoRefresh() {
  clearInterval(timer);
  timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
}

(async () => {
  try {
    me = await requireRole(isAdminPage ? ['admin', 'super_admin'] : ['member']);
    chrome(); shell(); await load(true); startAutoRefresh();
  } catch (err) {
    document.body.classList.remove('guarding');
    $('#main').innerHTML = ''; errorPanel($('#main'), err);
  }
})();
