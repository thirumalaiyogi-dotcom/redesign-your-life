// Member journal (member/journal.html) and progress (member/progress.html).
import { supabase, app } from './supabase.js';
import { requireRole, friendlyError } from './auth.js';
import { $, $$, icon, esc, toast, withBusy, memberNav, formatNumber, formatDate, memberTopbar, animateIn } from './ui.js';

const page = document.body.dataset.page;
const QUESTIONS = [
  ['learned', 'What did I learn today?', 'One idea, lesson or insight from today'],
  ['improved', 'What did I improve today?', 'Even 1% counts'],
  ['challenges', 'What challenges did I face?', 'What was hard, and how you handled it'],
  ['grateful', 'What am I grateful for?', 'People, moments, small things'],
  ['tomorrow', 'What will I improve tomorrow?', 'One clear intention for tomorrow']
];
const COLOR = { wealth: 'var(--t-wealth)', conscious: 'var(--t-conscious)', karma: 'var(--t-karma)', champion: 'var(--t-champion)' };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nice = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
let me, today;

function chrome(current) {
  $('#top').innerHTML = memberTopbar(me.profile, me.user.email);
  document.body.insertAdjacentHTML('beforeend', memberNav(current));
}
function errorPanel(target, err, retry) {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span><b>Couldn't load this page</b>
    <span>${esc(friendlyError(err))}</span><button class="btn btn-ghost btn-sm" id="retry">${icon('rotate-ccw')}Try again</button></div>`;
  $('#retry', target).addEventListener('click', retry);
}

// ======================= JOURNAL =======================
let entries = [], editing = null;

async function renderJournal() {
  const main = $('#main');
  main.innerHTML = `<div class="skeleton" style="height:420px"></div>`;
  const { data, error } = await supabase.from('journals').select('id, entry_date, learned, improved, challenges, grateful, tomorrow, share_with_coach, updated_at')
    .eq('member_id', me.user.id).order('entry_date', { ascending: false }).limit(60);
  if (error) return errorPanel(main, error, renderJournal);
  entries = data || [];
  editing = editing || today;
  draw();
}

const ICONS = { learned: 'lightbulb', improved: 'trending-up', challenges: 'mountain', grateful: 'heart', tomorrow: 'sunrise' };
const preview = (x) => { const k = QUESTIONS.find(([q]) => x[q]); return k ? x[k[0]] : ''; };
const answered = (x) => QUESTIONS.filter(([k]) => x[k]).length;

function draw() {
  const main = $('#main');
  const e = entries.find((x) => x.entry_date === editing) || { entry_date: editing, share_with_coach: true };
  const canEdit = editing >= addDays(today, -1);
  const yest = addDays(today, -1);
  const past = entries.filter((x) => x.entry_date < yest);
  main.innerHTML = `
  <div class="page-h"><span class="date">Evening reflection · 5 questions</span><h1>Journal</h1>
    <p>A few honest lines each evening. Private unless you choose to share.</p></div>
  <div class="seg seg-2" role="tablist" aria-label="Day">
    <button role="tab" data-day="${today}" aria-selected="${editing === today}">Today</button>
    <button role="tab" data-day="${yest}" aria-selected="${editing === yest}">Yesterday</button></div>
  ${canEdit ? `<form class="card j-form form" id="j-form" novalidate>
    <div class="j-top"><div><b>${esc(nice(editing))}</b><span class="j-saved">${e.id ? icon('check-circle-2') + 'Saved ' + esc(timeAgo(e.updated_at)) : 'Not saved yet'}</span></div>
      <div class="j-prog"><span id="j-count">0 of 5</span><div class="pbar"><i id="j-bar"></i></div></div></div>
    ${QUESTIONS.map(([k, q, hint], i) => `<div class="field j-q"><label for="j-${k}"><span class="qn" aria-hidden="true">${icon(ICONS[k])}</span><span><small>Question ${i + 1}</small>${q}</span></label>
      <textarea id="j-${k}" data-k="${k}" rows="3" maxlength="1000" placeholder="${esc(hint)}">${esc(e[k] || '')}</textarea>
      <span class="hint" data-count="${k}"></span></div>`).join('')}
    <label class="j-share" for="j-share"><span class="ic">${icon('users')}</span><span><b>Share with my coach</b><small>Your coach can read this entry. Turn off to keep it just for you.</small></span>
      <input type="checkbox" id="j-share" role="switch" ${e.share_with_coach !== false ? 'checked' : ''}><span class="sw" aria-hidden="true"></span></label>
    <p class="hint-line">${icon('lock')}<span>Your journal is private. Only you can read it, plus your coach when sharing is on.</span></p>
    <button class="btn btn-primary btn-block" id="j-save" type="submit">${icon('check')}Save journal</button>
  </form>` : ''}
  <section><div class="sec-h"><h2>Past entries</h2><span class="sub">${entries.length} saved</span></div>
    ${past.length ? `<div class="stack" style="gap:10px">${past.map((x) => `
      <details class="card j-entry"><summary><span class="j-d"><b>${esc(nice(x.entry_date))}</b><small>${esc(preview(x).slice(0, 90))}</small></span>
        <span class="j-meta"><span class="pill ${x.share_with_coach ? 'ok' : 'none'}">${x.share_with_coach ? 'Shared' : 'Private'}</span><small>${answered(x)}/5</small></span></summary>
      <div class="j-body">${QUESTIONS.filter(([k]) => x[k]).map(([k, q]) => `<p><b>${q}</b><br>${esc(x[k])}</p>`).join('') || '<p class="muted">Empty entry</p>'}</div></details>`).join('')}</div>`
      : `<div class="card empty-state"><span class="ic">${icon('notebook-pen')}</span><b>No past entries yet</b><span>Write a few lines every evening. They show up here.</span></div>`}
  </section>`;
  $$('[data-day]').forEach((b) => b.addEventListener('click', () => { editing = b.dataset.day; draw(); }));
  const form = $('#j-form');
  if (!form) return;
  const progress = () => {
    const n = $$('textarea', form).filter((t) => t.value.trim()).length;
    $('#j-count').textContent = `${n} of 5 answered`;
    $('#j-bar').style.width = `${n * 20}%`;
  };
  const count = (ta) => { $(`[data-count="${ta.dataset.k}"]`).textContent = ta.value.length > 800 ? `${ta.value.length}/1000` : ''; };
  $$('textarea', form).forEach((ta) => { count(ta); ta.addEventListener('input', () => { count(ta); progress(); }); });
  requestAnimationFrame(progress);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const vals = Object.fromEntries(QUESTIONS.map(([k]) => [k, $(`#j-${k}`).value.trim() || null]));
    if (!Object.values(vals).some(Boolean)) return toast('Write at least one answer before saving.', 'bad');
    vals.share_with_coach = $('#j-share').checked;
    await withBusy($('#j-save'), 'Saving…', async () => {
      // update when the day exists (column grants allow only content fields), insert otherwise
      const existing = entries.find((x) => x.entry_date === editing);
      const q = existing
        ? supabase.from('journals').update(vals).eq('id', existing.id)
        : supabase.from('journals').insert({ ...vals, member_id: me.user.id, entry_date: editing });
      const { data, error } = await q.select('id, entry_date, learned, improved, challenges, grateful, tomorrow, share_with_coach, updated_at').single();
      if (error) return toast(/row-level security/i.test(error.message) ? 'You can only write today\'s or yesterday\'s journal.' : friendlyError(error), 'bad');
      entries = [data, ...entries.filter((x) => x.entry_date !== data.entry_date)].sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1));
      toast('Journal saved');
      draw();
    });
  });
}

const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  return formatDate(iso);
};

// ======================= PROGRESS =======================
const ICON = { wealth: 'gem', conscious: 'brain', karma: 'hand-heart', champion: 'target' };
const KIND = { activity: ['Habit done', 'check-circle-2'], daily_bonus: ['All habits done', 'sparkles'], streak7_bonus: ['7-day streak', 'flame'],
  perfect_week_bonus: ['Perfect week', 'trophy'], special_bonus: ['Coach bonus', 'gift'] };

async function renderProgress() {
  const main = $('#main');
  main.innerHTML = `<div class="skeleton" style="height:64px"></div><div class="stat-grid">${'<div class="skeleton" style="height:96px"></div>'.repeat(4)}</div><div class="skeleton" style="height:260px"></div>`;
  const from30 = addDays(today, -29), monthStart = today.slice(0, 8) + '01';
  const [dash, streaks, scores, checks, cats] = await Promise.all([
    supabase.rpc('get_my_dashboard'),
    supabase.rpc('get_my_streaks'),
    supabase.from('score_history').select('kind, points, score_date, reason, created_at').eq('member_id', me.user.id).order('created_at', { ascending: false }).limit(400),
    supabase.from('daily_checkins').select('checkin_date, status, voided_at, activities(category_id)').eq('member_id', me.user.id).gte('checkin_date', monthStart < from30 ? monthStart : from30).lte('checkin_date', today),
    supabase.from('tracker_categories').select('id, slug, name').order('sort_order')
  ]);
  const err = dash.error || scores.error || checks.error || cats.error;
  if (err) return errorPanel(main, err, renderProgress);
  const d = dash.data;
  const longest = streaks.error ? null : Math.max(streaks.data.longest, d.streak);

  // points per day, last 30 days (server ledger)
  const perDay = {};
  for (const s of scores.data) if (s.score_date >= from30) perDay[s.score_date] = (perDay[s.score_date] || 0) + s.points;
  const days = Array.from({ length: 30 }, (_, i) => addDays(from30, i));
  const vals = days.map((x) => perDay[x] || 0);
  const max = Math.max(10, ...vals);
  const sum30 = vals.reduce((a, b) => a + b, 0);
  const activeDays = vals.filter(Boolean).length;
  const best = days[vals.indexOf(Math.max(...vals))];

  // category completion this month
  const total = Object.fromEntries((d.trackers || []).map((t) => [t.slug, t.total]));
  const elapsed = Math.max(1, Math.round((new Date(today) - new Date(monthStart < me.profile.joined_on ? me.profile.joined_on : monthStart)) / 864e5) + 1);
  const catDone = {};
  for (const c of checks.data) if (c.checkin_date >= monthStart && c.status === 'done' && !c.voided_at) {
    const slug = cats.data.find((k) => k.id === c.activities?.category_id)?.slug; if (slug) catDone[slug] = (catDone[slug] || 0) + 1;
  }

  // Chart drawn at the container's real pixel width, so labels stay 12px on every screen.
  const chartSVG = (W) => {
    const H = 180, L = 34, bw = (W - L) / 30;
    const y = (v) => H - 26 - (v / max) * (H - 44);
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Points per day for the last 30 days, ${sum30} points in total" class="pchart">
    ${[0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}" class="gl"/><text x="${L - 6}" y="${y(max * f) + 4}" class="ax" text-anchor="end">${Math.round(max * f)}</text>`).join('')}
    ${vals.map((v, i) => `<rect x="${(L + i * bw + bw * .18).toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(2, bw * .64).toFixed(1)}" height="${Math.max(0, H - 26 - y(v)).toFixed(1)}" rx="${Math.min(4, bw * .25).toFixed(1)}" class="${days[i] === today ? 'b-today' : v ? 'b-on' : 'b-off'}"><title>${nice(days[i])}: ${v} pts</title></rect>`).join('')}
    ${[0, 10, 20, 29].map((i) => `<text x="${i === 0 ? L : i === 29 ? W : L + i * bw + bw / 2}" y="${H - 6}" class="ax" text-anchor="${i === 0 ? 'start' : i === 29 ? 'end' : 'middle'}">${Number(days[i].slice(8))}/${Number(days[i].slice(5, 7))}</text>`).join('')}
  </svg>`;
  };
  const chart = `<div class="pchart-box" id="pchart">${chartSVG(320)}</div>`;

  const hist = scores.data.filter((s) => s.kind !== 'activity').slice(0, 15);
  const byDay = {};
  for (const s of scores.data.filter((x) => x.kind === 'activity')) byDay[s.score_date] = (byDay[s.score_date] || 0) + 1;
  const rows = [...hist.map((s) => ({ date: s.score_date, at: s.created_at, kind: s.kind, label: KIND[s.kind]?.[0] || s.kind, detail: s.reason, pts: s.points })),
    ...Object.entries(byDay).slice(0, 15).map(([date, n]) => ({ date, at: date + 'T23:59:00', kind: 'activity', label: `${n} habit${n > 1 ? 's' : ''} done`, detail: '', pts: scores.data.filter((s) => s.kind === 'activity' && s.score_date === date).reduce((a, b) => a + b.points, 0) }))]
    .sort((a, b) => (a.date === b.date ? (a.at < b.at ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, 25);
  const earned = (d.badges || []).filter((b) => b.earned_at).length;

  main.innerHTML = `
  <div class="page-h"><span class="date">Your journey · member since ${esc(formatDate(me.profile.joined_on))}</span><h1>My progress</h1>
    <p>Every number here comes from your ticks and points.</p></div>
  <section class="stat-grid" aria-label="Summary">
    <div class="card stat-card s-pts"><span class="si">${icon('coins')}</span><small>Total points</small><b>${formatNumber(d.total_points)}</b><span class="sub">${d.rank ? 'Rank #' + d.rank : 'Not ranked yet'}</span></div>
    <div class="card stat-card s-streak"><span class="si">${icon('flame')}</span><small>Current streak</small><b>${d.streak} ${d.streak === 1 ? 'day' : 'days'}</b><span class="sub">Longest ${longest === null ? '–' : longest + (longest === 1 ? ' day' : ' days')}</span></div>
    <div class="card stat-card"><span class="si">${icon('calendar')}</span><small>This week</small><b>${d.weekly_pct}%</b><div class="pbar"><i data-w="${Math.min(100, d.weekly_pct)}%"></i></div></div>
    <div class="card stat-card"><span class="si">${icon('trending-up')}</span><small>This month</small><b>${d.monthly_pct}%</b><div class="pbar"><i data-w="${Math.min(100, d.monthly_pct)}%"></i></div></div>
  </section>
  <section class="card card-pad"><div class="card-h"><h3>Points, last 30 days</h3><span class="sub-r">${formatNumber(sum30)} pts</span></div>
    <div class="chips-info"><span>${icon('activity')}Active ${activeDays}/30 days</span><span>${icon('target')}Average ${formatNumber(Math.round(sum30 / 30))} pts/day</span>${sum30 ? `<span>${icon('trophy')}Best ${esc(nice(best))} · ${Math.max(...vals)} pts</span>` : ''}</div>
    ${chart}
    <div class="legend"><span><i class="lg-on"></i>Points earned</span><span><i class="lg-today"></i>Today</span></div></section>
  <section class="card card-pad"><div class="card-h"><h3>Trackers this month</h3><span class="sub-r">% of possible ticks</span></div>
    <div class="catbars">${cats.data.map((c) => { const pct = total[c.slug] ? Math.min(100, Math.round(100 * (catDone[c.slug] || 0) / (total[c.slug] * elapsed))) : 0;
      return `<div class="catbar" style="--tc:${COLOR[c.slug] || 'var(--c-accent)'}"><span class="ci">${icon(ICON[c.slug] || 'list-checks')}</span><div class="cb">
        <div class="lbl">${esc(c.name)}<span><b>${pct}%</b> · ${catDone[c.slug] || 0} done</span></div><div class="track"><i data-w="${pct}%" style="background:var(--tc)"></i></div></div></div>`; }).join('')}</div></section>
  <section><div class="sec-h"><h2>Badges</h2><span class="sub">${earned} of ${(d.badges || []).length} earned</span></div>
    <div class="badge-grid">${(d.badges || []).map((b) => `<div class="badge ${b.earned_at ? '' : 'locked'}"><span class="medal" style="--from:${esc(b.color_from)};--to:${esc(b.color_to)}">${b.earned_at ? esc(b.glyph) : icon('lock')}</span>
      <b>${esc(b.name)}</b><small>${b.earned_at ? 'Earned ' + esc(formatDate(b.earned_at)) : 'Not yet'}</small></div>`).join('')}</div></section>
  <section class="card"><div class="card-h card-pad" style="margin:0;padding-bottom:8px"><h3>Points history</h3><span class="sub-r">Bonuses and daily totals</span></div>
    <div class="feed">${rows.map((r) => `<div class="row k-${esc(r.kind)}"><span class="fi">${icon(KIND[r.kind]?.[1] || 'sparkles')}</span>
      <span class="txt"><b>${esc(r.label)}</b>${r.detail && r.kind !== 'activity' ? ' · ' + esc(r.detail) : ''}<br><small class="muted">${esc(nice(r.date))}</small></span><b class="pp">+${formatNumber(r.pts)}</b></div>`).join('')
      || `<div class="empty-state"><span class="ic">${icon('sparkles')}</span><b>No points yet</b><span>Tick your first habit to start.</span></div>`}</div></section>`;
  const drawChart = () => { const box = $('#pchart'); if (box) box.innerHTML = chartSVG(Math.max(240, Math.floor(box.clientWidth))); };
  drawChart();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawChart, 150); });
  animateIn(main);
}

(async () => {
  try {
    me = await requireRole(['member']);
    chrome(page === 'member-journal' ? 'journal' : 'progress');
    const { data, error } = await supabase.rpc('app_today'); if (error) throw error; today = data;
    if (page === 'member-journal') await renderJournal();
    if (page === 'member-progress') await renderProgress();
  } catch (err) {
    document.body.classList.remove('guarding');
    errorPanel($('#main'), err, () => location.reload());
  }
})();
