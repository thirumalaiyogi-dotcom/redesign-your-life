// Leaderboard for members (member/leaderboard.html) and coaches (admin/leaderboard.html).
// Ranks come from get_leaderboard(): approved = ticked "done" points + bonuses only; never negative.
import { supabase, app } from './supabase.js';
import { requireRole, signOut, friendlyError, ROLE_LABEL } from './auth.js';
import { $, $$, icon, esc, memberNav, coachTopbar, initials, formatNumber, memberTopbar } from './ui.js';

const page = document.body.dataset.page;
const isAdminPage = page === 'admin-leaderboard';
const PERIODS = [['daily', 'Today'], ['weekly', 'This week'], ['monthly', 'This month'], ['all_time', 'All time']];
let me, period = 'weekly', timer = null, loading = false;
try { period = sessionStorage.getItem('ryl.lb') || 'weekly'; } catch { /* storage blocked */ }

function chrome() {
  if (isAdminPage) {
    $('#top').innerHTML = coachTopbar(me.profile.role, ROLE_LABEL[me.profile.role], 'leaderboard');
  { const cur = document.querySelector('.admin-nav a[aria-current]'), bar = document.querySelector('.admin-nav .an-inner'); if (cur && bar) bar.scrollLeft = cur.offsetLeft - (bar.clientWidth - cur.offsetWidth) / 2; }
    $('#logout').addEventListener('click', () => signOut());
  } else {
    $('#top').innerHTML = memberTopbar(me.profile, me.user.email);
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
    <div class="lb-head page-h"><span class="live">Live · updates as members tick</span><h1>Leaderboard</h1>
      <p>${isAdminPage ? 'How every member is doing.' : 'Points from ticked habits and coach bonuses. Never minus points.'}</p></div>
    <div class="seg seg-full" role="tablist" aria-label="Period">${PERIODS.map(([v, l]) =>
      `<button role="tab" data-p="${v}" aria-selected="${v === period}">${l}</button>`).join('')}</div>
    <div id="lb-body" class="stack" style="gap:16px"></div>
    <section><div class="sec-h"><h2>Recognitions</h2><span class="sub">This week</span></div><div class="recog" id="recog"></div></section>`;
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
      ${isAdminPage ? '' : `<a class="btn btn-primary btn-sm" href="${app('member/trackers.html')}">${icon('list-checks')}Open trackers</a>`}</div>`;
    return;
  }
  const podium = [1, 0, 2].map((i) => {
    const r = scored[i]; const cls = ['first', 'second', 'third'][i];
    if (!r) return `<div class="pod ${cls} empty"><span class="avatar" aria-hidden="true">?</span><b>–</b><span class="pts">0</span><div class="block">${i + 1}</div></div>`;
    return `<div class="pod ${cls} ${r.is_me ? 'is-me' : ''}">${i === 0 ? `<span class="crownic">${icon('crown')}</span>` : ''}${avatar(r)}
      <b>${esc((r.full_name || 'Member').split(' ')[0])}${r.is_me ? ' (you)' : ''}</b><span class="pts num">${formatNumber(r.points)}<small> pts</small></span><div class="block">${i + 1}</div></div>`;
  }).join('');
  const rest = rows.slice(3);
  const mine = rows.find((r) => r.is_me);
  // distance to the next place up, from the server's own ranking (display only)
  const above = mine && rows.filter((r) => r.rank < mine.rank).sort((a, b) => b.rank - a.rank)[0];
  const gap = above ? Number(above.points) - Number(mine.points) : null;
  const gapHTML = !mine ? '' : mine.rank === 1 ? `<span class="gap top">${icon('crown')}You're on top. Keep it up!</span>`
    : above && gap > 0 ? `<span class="gap">${icon('trending-up')}${formatNumber(gap)} pts behind #${above.rank}</span>`
    : above ? `<span class="gap">${icon('trending-up')}Level on points with #${above.rank}. Consistency decides</span>` : '';
  body.innerHTML = `
    ${mine ? `<section class="card my-rank" aria-label="Your rank"><div class="rk"><small>Your rank</small><span class="num">#${mine.rank}</span>${movement(mine.movement, mine.prev_rank != null)}</div>
      <div class="info"><b>${formatNumber(mine.points)} pts</b><span>${formatNumber(mine.activities_done)} done · ${Math.round(mine.consistency)}% consistent · ${mine.streak}-day streak</span>${gapHTML}</div></section>` : ''}
    <section class="podium" aria-label="Top three">${podium}</section>
    ${rest.length ? `<section class="card lb-list">${rest.map((r) => `<div class="lb-row ${r.is_me ? 'me' : ''}">
        <span class="rk num">${r.rank}</span>
        <div class="who">${avatar(r, 'avatar sm')}<div><b>${esc(r.full_name || 'Member')}${r.is_me ? ' (you)' : ''}</b>
          <small>${formatNumber(r.activities_done)} done · ${Math.round(r.consistency)}% consistent · ${r.streak}-day streak</small></div></div>
        <div class="score"><b class="num">${formatNumber(r.points)}</b>${movement(r.movement, r.prev_rank != null)}</div></div>`).join('')}
    </section>` : ''}
    <p class="tiebreak hint-line">${icon('info')}<span>Same points? Higher consistency ranks first, then the longer streak, then whoever reached the score first. Only ticked habits and coach bonuses count, never minus points.</span></p>`;
}

function renderRecog(r) {
  const items = [
    ['sun', 'Champion of the Day', r.champion_of_day], ['repeat', 'Most Consistent', r.most_consistent],
    ['trending-up', 'Best Improvement', r.best_improvement], ['flame', 'Maximum Streak', r.max_streak], ['trophy', 'Monthly Champion', r.monthly_champion]];
  $('#recog').innerHTML = items.map(([ic, label, v]) => `<div class="card rec ${v ? '' : 'none'}"><span class="ic">${icon(ic)}</span><small>${label}</small>
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
