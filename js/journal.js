// Member journal (member/journal.html) and progress (member/progress.html).
import { supabase, app } from './supabase.js';
import { requireRole, friendlyError } from './auth.js';
import { $, $$, icon, esc, toast, withBusy, memberNav, brandHTML, initials, formatNumber, formatDate } from './ui.js';

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
  $('#top').innerHTML = `<div class="topbar">${brandHTML(app('member/dashboard.html'))}
    <div class="actions"><a href="${app('member/profile.html')}" aria-label="My profile" style="text-decoration:none">
    <span class="avatar" aria-hidden="true">${esc(initials(me.profile.full_name, me.user.email))}</span></a></div></div>`;
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

function draw() {
  const main = $('#main');
  const e = entries.find((x) => x.entry_date === editing) || { entry_date: editing, share_with_coach: true };
  const canEdit = editing >= addDays(today, -1);
  const yest = addDays(today, -1);
  main.innerHTML = `
  <div><span class="eyebrow">Evening reflection · 5 questions</span><h1 style="font-size:var(--fs-page);margin-top:6px">Journal</h1></div>
  <div class="seg" role="tablist" aria-label="Day" style="align-self:flex-start">
    <button role="tab" data-day="${today}" aria-selected="${editing === today}">Today</button>
    <button role="tab" data-day="${yest}" aria-selected="${editing === yest}">Yesterday</button></div>
  ${canEdit ? `<form class="panel panel-pad form" id="j-form" novalidate>
    <div class="row-between"><b>${esc(nice(editing))}</b><span class="muted" style="font-size:12.5px">${e.id ? 'Saved ' + esc(timeAgo(e.updated_at)) : 'Not saved yet'}</span></div>
    ${QUESTIONS.map(([k, q, hint]) => `<div class="field"><label for="j-${k}">${q}</label>
      <textarea id="j-${k}" data-k="${k}" rows="3" maxlength="1000" placeholder="${esc(hint)}">${esc(e[k] || '')}</textarea>
      <span class="hint" data-count="${k}"></span></div>`).join('')}
    <label class="check"><input type="checkbox" id="j-share" ${e.share_with_coach !== false ? 'checked' : ''}>Share this entry with my coach</label>
    <p class="muted" style="font-size:12.5px">Your journal is private. Only you can read it, plus your coach when sharing is on.</p>
    <button class="btn btn-gold" id="j-save" type="submit">${icon('check')}Save journal</button>
  </form>` : ''}
  <section><div class="section-h"><h2>Past entries</h2><span class="eyebrow">${entries.length} saved</span></div>
    ${entries.filter((x) => x.entry_date < yest).length ? `<div class="stack" style="gap:10px">${entries.filter((x) => x.entry_date < yest).map((x) => `
      <details class="panel j-entry"><summary><b>${esc(nice(x.entry_date))}</b><span class="muted" style="font-size:12.5px">${x.share_with_coach ? 'Shared with coach' : 'Private'}</span></summary>
      <div class="j-body">${QUESTIONS.filter(([k]) => x[k]).map(([k, q]) => `<p><b>${q}</b><br>${esc(x[k])}</p>`).join('') || '<p class="muted">Empty entry</p>'}</div></details>`).join('')}</div>`
      : `<div class="panel empty-state"><span class="ic">${icon('notebook-pen')}</span><b>No past entries yet</b><span>Write a few lines every evening. They show up here.</span></div>`}
  </section>`;
  $$('[data-day]').forEach((b) => b.addEventListener('click', () => { editing = b.dataset.day; draw(); }));
  const form = $('#j-form');
  if (!form) return;
  const count = (ta) => { $(`[data-count="${ta.dataset.k}"]`).textContent = ta.value.length > 800 ? `${ta.value.length}/1000` : ''; };
  $$('textarea', form).forEach((ta) => { count(ta); ta.addEventListener('input', () => count(ta)); });
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
async function renderProgress() {
  const main = $('#main');
  main.innerHTML = `<div class="skeleton" style="height:200px"></div><div class="skeleton" style="height:240px"></div>`;
  const from30 = addDays(today, -29), monthStart = today.slice(0, 8) + '01';
  const [dash, scores, checks, cats] = await Promise.all([
    supabase.rpc('get_my_dashboard'),
    supabase.from('score_history').select('kind, points, score_date, reason, created_at').eq('member_id', me.user.id).order('created_at', { ascending: false }).limit(400),
    supabase.from('daily_checkins').select('checkin_date, status, voided_at, activities(category_id)').eq('member_id', me.user.id).gte('checkin_date', monthStart < from30 ? monthStart : from30).lte('checkin_date', today),
    supabase.from('tracker_categories').select('id, slug, name').order('sort_order')
  ]);
  const err = dash.error || scores.error || checks.error || cats.error;
  if (err) return errorPanel(main, err, renderProgress);
  const d = dash.data;

  // points per day, last 30 days
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

  const W = 600, H = 190, bw = W / 30;
  const y = (v) => H - 30 - (v / max) * (H - 56);
  const chart = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Points per day for the last 30 days, ${sum30} points in total" style="width:100%;height:auto;display:block">
    ${[0, 0.5, 1].map((f) => `<line x1="0" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}" style="stroke:var(--c-border)"/><text x="${W - 2}" y="${y(max * f) - 4}" style="fill:var(--c-muted)" font-size="19" text-anchor="end">${Math.round(max * f)}</text>`).join('')}
    ${vals.map((v, i) => `<rect x="${i * bw + bw * .18}" y="${y(v)}" width="${bw * .64}" height="${Math.max(0, H - 30 - y(v))}" rx="3" style="fill:${days[i] === today ? 'var(--c-primary)' : v ? 'var(--c-accent)' : 'var(--c-track)'}"><title>${nice(days[i])}: ${v} pts</title></rect>`).join('')}
    ${[0, 10, 20, 29].map((i) => `<text x="${i === 0 ? 0 : i === 29 ? W : i * bw + bw / 2}" y="${H - 6}" style="fill:var(--c-muted)" font-size="19" text-anchor="${i === 0 ? 'start' : i === 29 ? 'end' : 'middle'}">${Number(days[i].slice(8))}/${Number(days[i].slice(5, 7))}</text>`).join('')}
  </svg>`;

  const kindLabel = { activity: 'Habit done', daily_bonus: 'All habits done', streak7_bonus: '7-day streak', perfect_week_bonus: 'Perfect week', special_bonus: 'Coach bonus' };
  const hist = scores.data.filter((s) => s.kind !== 'activity').slice(0, 15);
  const byDay = {};
  for (const s of scores.data.filter((x) => x.kind === 'activity')) byDay[s.score_date] = (byDay[s.score_date] || 0) + 1;

  main.innerHTML = `
  <div><span class="eyebrow">Your journey</span><h1 style="font-size:var(--fs-page);margin-top:6px">My progress</h1></div>
  <section class="kpis">
    <div class="kpi"><small>Total points</small><b class="num gold-text">${formatNumber(d.total_points)}</b></div>
    <div class="kpi"><small>Current streak</small><b class="num" style="color:var(--c-streak)">${d.streak} days</b></div>
    <div class="kpi"><small>Weekly completion</small><b class="num">${d.weekly_pct}%</b><div class="bar"><i style="width:${Math.min(100, d.weekly_pct)}%"></i></div></div>
    <div class="kpi"><small>Monthly completion</small><b class="num">${d.monthly_pct}%</b><div class="bar"><i style="width:${Math.min(100, d.monthly_pct)}%"></i></div></div>
  </section>
  <section class="panel"><div class="panel-h"><h3>Points, last 30 days</h3><small class="muted">${formatNumber(sum30)} pts · active ${activeDays}/30 days</small></div>
    <div style="padding:14px 16px">${chart}${sum30 ? `<p class="muted" style="font-size:12.5px;margin-top:6px">Best day: ${esc(nice(best))}, ${Math.max(...vals)} pts.</p>` : ''}</div></section>
  <section class="panel"><div class="panel-h"><h3>Trackers this month</h3><small class="muted">% of possible ticks</small></div>
    <div class="catbars">${cats.data.map((c) => { const pct = total[c.slug] ? Math.min(100, Math.round(100 * (catDone[c.slug] || 0) / (total[c.slug] * elapsed))) : 0;
      return `<div class="catbar"><div class="lbl">${esc(c.name)}<span>${pct}% · ${catDone[c.slug] || 0} done</span></div><div class="track"><i style="width:${pct}%;background:${COLOR[c.slug] || 'var(--c-accent)'}"></i></div></div>`; }).join('')}</div></section>
  <section><div class="section-h"><h2>Badges</h2><span class="eyebrow">${(d.badges || []).filter((b) => b.earned_at).length} of ${(d.badges || []).length}</span></div>
    <div class="badge-grid">${(d.badges || []).map((b) => `<div class="badge ${b.earned_at ? '' : 'locked'}"><span class="medal" style="background:linear-gradient(135deg,${esc(b.color_from)},${esc(b.color_to)})">${esc(b.glyph)}</span>
      <b>${esc(b.name)}</b><small>${b.earned_at ? 'Earned ' + esc(formatDate(b.earned_at)) : 'Not yet'}</small></div>`).join('')}</div></section>
  <section class="panel"><div class="panel-h"><h3>Points history</h3><small class="muted">Bonuses and daily habit totals</small></div>
    <div class="feed">${[...hist.map((s) => ({ date: s.score_date, at: s.created_at, label: kindLabel[s.kind], detail: s.reason, pts: s.points })),
      ...Object.entries(byDay).slice(0, 15).map(([date, n]) => ({ date, at: date + 'T23:59:00', label: `${n} habit${n > 1 ? 's' : ''} done`, detail: '', pts: scores.data.filter((s) => s.kind === 'activity' && s.score_date === date).reduce((a, b) => a + b.points, 0) }))]
      .sort((a, b) => (a.date === b.date ? (a.at < b.at ? 1 : -1) : a.date < b.date ? 1 : -1)).slice(0, 25)
      .map((r) => `<div class="row"><span class="txt"><b>${esc(r.label)}</b>${r.detail && r.label !== 'Habit done' ? ' · ' + esc(r.detail) : ''}<br><small class="muted">${esc(nice(r.date))}</small></span><b class="num" style="color:var(--gold-hi);font-size:18px">+${r.pts}</b></div>`).join('')
      || `<div class="empty-state"><span class="ic">${icon('sparkles')}</span><b>No points yet</b><span>Tick your first habit to start.</span></div>`}</div></section>`;
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
