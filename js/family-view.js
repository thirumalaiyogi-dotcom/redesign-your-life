// My family (member/family.html): everyone in my family — today's habits, points and streak.
// All numbers come from the database (family_overview / family_member_day); only people in the
// same family are returned. Journals and tick notes are never shown here.
import { shareLink, supabase, app } from './supabase.js';
import { requireRole, friendlyError } from './auth.js';
import { $, icon, esc, toast, memberNav, memberTopbar, avatarHTML, formatNumber, animateIn } from './ui.js';

const S = { me: null, fam: null, rows: [], today: null };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayLabel = (iso) => iso === S.today ? 'Today' : iso === addDays(S.today, -1) ? 'Yesterday'
  : new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function errorPanel(err, retry) {
  $('#main').innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span>
    <b>Couldn't load your family</b><span>${esc(friendlyError(err))}</span>
    <button class="btn btn-ghost btn-sm" data-retry>${icon('rotate-ccw')}Try again</button></div>`;
  $('[data-retry]').addEventListener('click', retry);
}

const familyLink = () => S.fam?.token ? shareLink(`family.html#${S.fam.token}`) : '';
const inviteText = () => `*${S.fam.name}* · Deepak's 10X Life 🙏\n\nIndha link open panni unga peyar type pannunga (first time mattum). Adutha thadava unga peyar mela tap panna podhum:\n${familyLink()}`;

async function render() {
  const main = $('#main');
  main.innerHTML = `<div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:240px;margin-top:12px"></div>`;
  const [f, o, t] = await Promise.all([supabase.rpc('my_family'), supabase.rpc('family_overview'), supabase.rpc('app_today')]);
  if (f.error) return errorPanel(f.error, render);
  S.fam = f.data;
  if (!S.fam) {
    main.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('users')}</span><b>You are not in a family</b>
      <span>Your coach can make a family and send one link for everyone at home.</span>
      <a class="btn btn-ghost btn-sm" href="${app('member/dashboard.html')}">${icon('arrow-left')}Home</a></div>`;
    return;
  }
  if (o.error) return errorPanel(o.error, render);
  S.rows = o.data || []; S.today = t.data;
  const sum = (k) => S.rows.reduce((a, r) => a + Number(r[k] || 0), 0);
  const doneAll = sum('done_today'), totalAll = sum('total_today');
  const link = familyLink();
  main.innerHTML = `
    <div class="fam-head"><div><span class="eyebrow">My family · ${S.rows.length} ${S.rows.length === 1 ? 'person' : 'people'}</span><h1>${esc(S.fam.name)}</h1></div>
      <div class="fam-acts">${link ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(inviteText())}">${icon('user-plus')}Invite</a>
        <a class="btn btn-ghost btn-sm" href="${esc(link)}">${icon('repeat')}Switch person</a>` : ''}</div></div>
    <div class="fam-sum">
      <div class="stat"><small>Family today</small><b>${totalAll ? Math.round(100 * doneAll / totalAll) : 0}%</b></div>
      <div class="stat"><small>This week</small><b>${formatNumber(sum('points_week'))}</b></div>
      <div class="stat"><small>Ticks today</small><b>${formatNumber(doneAll)}</b></div>
    </div>
    <section aria-labelledby="fl-h"><div class="sec-h"><h2 id="fl-h">Everyone</h2><small class="muted">Tap a name to see their habits</small></div>
      <div class="fam-list">${S.rows.map((r, i) => {
        const pct = r.total_today ? Math.round(100 * r.done_today / r.total_today) : 0;
        return `<button type="button" class="fam-card ${r.is_me ? 'me' : ''}" data-m="${esc(r.member_id)}">
          <span class="rk">${i + 1}</span>
          <span><span class="who">${avatarHTML({ full_name: r.full_name, avatar_url: r.avatar_url })}<span style="min-width:0"><b>${esc(r.full_name)}${r.is_me ? ' (you)' : ''}</b>
            <small>Today ${r.done_today}/${r.total_today} · 🔥 ${r.streak} day${r.streak === 1 ? '' : 's'}</small></span></span>
            <span class="bar"><i data-w="${pct}%"></i></span></span>
          <span class="pts">${formatNumber(r.points_total)}<small>${formatNumber(r.points_week)} this week</small></span></button>`;
      }).join('')}</div></section>`;
  animateIn(main);
}

function openSheet(title, bodyHTML) {
  const scrim = document.createElement('div');
  scrim.className = 'sheet-scrim';
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-t"><span class="grab" aria-hidden="true"></span>
    <div class="sheet-h"><h2 id="sheet-t">${esc(title)}</h2><button class="iconbtn" type="button" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="sheet-b">${bodyHTML}</div></div>`;
  const opener = document.activeElement;
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(scrim);
  $('[data-close]', scrim).focus();
  return scrim;
}

async function personSheet(r) {
  const sheet = openSheet(r.is_me ? 'Your habits' : `${r.full_name}'s habits`, '<div class="skeleton" style="height:220px"></div>');
  const body = $('.sheet-b', sheet);
  let day = S.today;
  const draw = async () => {
    body.innerHTML = '<div class="skeleton" style="height:220px"></div>';
    const { data, error } = await supabase.rpc('family_member_day', { p_member: r.member_id, p_day: day });
    if (error) { body.innerHTML = `<p class="muted">${esc(friendlyError(error))}</p>`; return; }
    const groups = [];
    for (const h of data || []) {
      let g = groups[groups.length - 1];
      if (!g || g.slug !== h.slug) groups.push(g = { slug: h.slug, name: h.category, color: h.color, items: [] });
      g.items.push(h);
    }
    const minDay = addDays(S.today, -30);
    body.innerHTML = `<div class="fam-day">
        <button class="btn btn-ghost btn-sm" data-d="-1" ${day <= minDay ? 'disabled' : ''} aria-label="Day before">${icon('chevron-left')}</button>
        <b>${esc(dayLabel(day))}</b>
        <button class="btn btn-ghost btn-sm" data-d="1" ${day >= S.today ? 'disabled' : ''} aria-label="Next day">${icon('chevron-right')}</button></div>
      ${groups.length ? groups.map((g) => `<div class="fam-trk"><h3><i style="background:${esc(g.color)}"></i>${esc(g.name)}
          <span>${g.items.filter((x) => x.status === 'done').length}/${g.items.length}</span></h3>
        ${g.items.map((x) => `<div class="fam-habit"><span class="st ${esc(x.status || '')}" aria-label="${x.status === 'done' ? 'Done' : x.status === 'not_done' ? 'Not done' : 'Not marked'}">${x.status === 'done' ? '✓' : x.status === 'not_done' ? '✕' : ''}</span>
          <span>${x.number}. ${esc(x.activity)}</span></div>`).join('')}</div>`).join('')
      : '<p class="muted">No trackers open yet.</p>'}`;
  };
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]'); if (!b || b.disabled) return;
    day = addDays(day, Number(b.dataset.d)); draw();
  });
  draw();
}

(async () => {
  S.me = await requireRole(['member']);
  $('#top').innerHTML = memberTopbar(S.me.profile, S.me.user.email);
  document.body.insertAdjacentHTML('beforeend', memberNav('dashboard'));
  $('#main').addEventListener('click', (e) => {
    const c = e.target.closest('[data-m]');
    if (c) personSheet(S.rows.find((r) => r.member_id === c.dataset.m));
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.fam) render().catch(() => {}); });
  try { await render(); } catch (err) { errorPanel(err, render); toast(friendlyError(err), 'bad'); }
})();
