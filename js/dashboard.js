// Member dashboard and profile pages.
import { supabase, app } from './supabase.js';
import { requireRole, signOut, updatePassword, friendlyError, ROLE_LABEL } from './auth.js';
import { $, icon, esc, toast, withBusy, setFieldError, wirePasswordToggles, memberNav, brandHTML,
         initials, firstName, formatDate, formatToday, formatNumber, PHONE_RE, validatePassword } from './ui.js';

const page = document.body.dataset.page;
const TRACKER_ART = { wealth: 'wealth-01.webp', conscious: 'conscious-02.webp', karma: 'karma-01.webp', champion: 'champion-01.webp' };
const TRACKER_COLOR = { wealth: 'var(--t-wealth)', conscious: 'var(--t-conscious)', karma: 'var(--t-karma)', champion: 'var(--t-champion)' };

function avatarHTML(profile, email, cls = 'avatar') {
  return profile.avatar_url
    ? `<span class="${cls}"><img src="${esc(profile.avatar_url)}" alt=""></span>`
    : `<span class="${cls}" aria-hidden="true">${esc(initials(profile.full_name, email))}</span>`;
}

function chrome(profile, user, current) {
  $('#top').innerHTML = `<div class="topbar">${brandHTML(app('member/dashboard.html'))}
    <div class="actions"><a href="${app('member/profile.html')}" aria-label="My profile" style="text-decoration:none">${avatarHTML(profile, user.email)}</a></div></div>`;
  document.body.insertAdjacentHTML('beforeend', memberNav(current));
}

function errorPanel(target, err, retry) {
  target.innerHTML = `<div class="panel empty-state"><span class="ic">${icon('alert-triangle')}</span>
    <b>Couldn't load your data</b><span>${esc(friendlyError(err))}</span>
    <button class="btn btn-ghost btn-sm" id="retry">${icon('rotate-ccw')}Try again</button></div>`;
  $('#retry', target).addEventListener('click', retry);
}

function medal(b) {
  const id = 'm-' + b.code;
  return `<div class="badge ${b.earned_at ? '' : 'locked'}" title="${esc(b.name)}${b.earned_at ? ' · earned ' + formatDate(b.earned_at) : ' · not earned yet'}">
    <svg viewBox="0 0 72 80" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${esc(b.color_from)}"/><stop offset="1" stop-color="${esc(b.color_to)}"/></linearGradient></defs>
    <path d="M22 0h10l6 22H28z" fill="#2d4aa8"/><path d="M50 0H40l-6 22h10z" fill="#c43b35"/>
    <circle cx="36" cy="48" r="26" fill="url(#${id})"/><circle cx="36" cy="48" r="20" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="2"/>
    <text x="36" y="56" text-anchor="middle" font-family="Big Shoulders Display,Arial Narrow,sans-serif" font-weight="900" font-size="22" fill="rgba(20,12,0,.8)">${esc(b.glyph)}</text></svg>${esc(b.name)}</div>`;
}

// ---------------- DASHBOARD ----------------
async function renderDashboard(profile, user) {
  const main = $('#main');
  main.innerHTML = `<div class="greet">${avatarHTML(profile, user.email)}<div><p>Vanakkam, ${esc(formatToday())}</p><h1>Hi, ${esc(firstName(profile.full_name, user.email))}</h1></div></div>
    <div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:220px"></div>`;
  const { data: d, error } = await supabase.rpc('get_my_dashboard');
  if (error) return errorPanel(main, error, () => renderDashboard(profile, user));

  const C = 2 * Math.PI * 54;
  const total = d.total_activities || 0;
  const done = d.done_today || 0;
  const mv = d.rank_movement || 0;
  const mvHTML = mv > 0 ? ` · <span style="color:var(--ok)">▲${mv}</span>` : mv < 0 ? ` · <span style="color:var(--bad-soft)">▼${-mv}</span>` : '';
  main.innerHTML = `
  <div class="greet">${avatarHTML(profile, user.email)}<div><p>Vanakkam, ${esc(formatToday())}</p><h1>Hi, ${esc(firstName(profile.full_name, user.email))}</h1></div></div>
  <section class="hero-stat" aria-label="Today's summary">
    <div class="ring"><svg viewBox="0 0 128 128" aria-hidden="true"><defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#f7e5a6"/><stop offset="1" stop-color="#9a7227"/></linearGradient></defs>
      <circle cx="64" cy="64" r="54" fill="none" stroke="#26325a" stroke-width="12"/>
      <circle cx="64" cy="64" r="54" fill="none" stroke="url(#rg)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${total ? C * done / total : 0} ${C}"/></svg>
      <div class="center"><div><b>${done}<span style="font-size:.5em;color:var(--muted)">/${total}</span></b><small>Done today</small></div></div></div>
    <div class="hs-meta">
      <div><b class="gold-text num">${formatNumber(d.total_points)}</b><small>Total pts</small></div>
      <div><b class="num">${d.rank ? '#' + d.rank : '–'}</b><small>Rank${mvHTML}</small></div>
      <div class="streak"><b class="num">${d.streak}</b><small>Day streak</small></div>
      <div class="hs-today"><span>${total - done} habits left today · +${formatNumber(d.today_points)} pts earned</span><a class="link" href="${app('member/trackers.html')}">Tick now →</a></div>
    </div>
  </section>
  <section class="kpis" aria-label="Progress">
    <div class="kpi"><small>Weekly completion</small><b class="num">${d.weekly_pct}%</b><div class="bar"><i style="width:${Math.min(100, d.weekly_pct)}%"></i></div></div>
    <div class="kpi"><small>Monthly completion</small><b class="num">${d.monthly_pct}%</b><div class="bar"><i style="width:${Math.min(100, d.monthly_pct)}%"></i></div></div>
    <div class="kpi"><small>Done this month</small><b class="num" style="color:var(--ok)">${formatNumber(d.done_month)}</b></div>
    <div class="kpi"><small>Missed this week</small><b class="num" style="color:var(--bad-soft)">${formatNumber(d.missed_week)}</b></div>
  </section>
  <section><div class="section-h"><h2>Your trackers</h2><span class="eyebrow">Today</span></div>
    <div class="tcards">${(d.trackers || []).map((t) => {
      const pct = t.total ? Math.round(100 * t.done_today / t.total) : 0;
      return `<a class="tcard" href="${app('member/tracker-detail.html?t=' + encodeURIComponent(t.slug))}" style="--tc:${TRACKER_COLOR[t.slug] || 'var(--gold)'}">
        <div class="art"><img src="${app('assets/images/' + (TRACKER_ART[t.slug] || 'wealth-01.webp'))}" alt="" loading="lazy"><span class="n">${t.total}</span></div>
        <h3>${esc(t.name)}</h3>
        <div class="stats"><div><b class="num">${t.total}</b>Total</div><div><b class="num" style="color:var(--ok)">${t.done_today}</b>Done</div><div><b class="num">${t.total - t.done_today}</b>Left</div></div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="foot">${pct}% complete<span>Open →</span></div></a>`; }).join('')}</div>
  </section>
  <section><div class="section-h"><h2>Achievements</h2><a class="link" href="${app('member/progress.html')}" style="font-size:13px">${(d.badges || []).filter((b) => b.earned_at).length} of ${(d.badges || []).length} · My progress →</a></div>
    <div class="badges">${(d.badges || []).map(medal).join('')}</div>
  </section>`;
}

// ---------------- PROFILE ----------------
function renderProfile(profile, user) {
  const main = $('#main');
  main.innerHTML = `
  <section class="panel profile-head">${avatarHTML(profile, user.email, 'avatar lg')}
    <div style="min-width:0"><span class="pill ${profile.role === 'member' ? 'gold' : 'blue'}">${ROLE_LABEL[profile.role]}</span>
    <h1 style="margin-top:8px">${esc(profile.full_name || user.email)}</h1><p class="muted" style="overflow-wrap:anywhere">${esc(user.email)}</p></div></section>
  <div class="profile-grid">
    <form class="panel panel-pad form" id="profile-form" novalidate>
      <h2 style="font-size:22px">My details</h2>
      <div class="field"><label for="full_name">Full name</label><input id="full_name" autocomplete="name" maxlength="80" value="${esc(profile.full_name)}"><span class="err"></span></div>
      <div class="field"><label for="phone">Mobile number <span class="opt">(optional)</span></label><input id="phone" type="tel" inputmode="tel" maxlength="16" autocomplete="tel" placeholder="+91 98765 43210" value="${esc(profile.phone || '')}"><span class="err"></span></div>
      <div class="field"><label for="email_ro">Email</label><input id="email_ro" value="${esc(user.email)}" readonly><span class="hint">Ask your coach if you need to change your login email.</span></div>
      <button class="btn btn-gold" id="save-btn" type="submit">Save details</button>
    </form>
    <div class="stack" style="gap:14px">
      <form class="panel panel-pad form" id="pw-form" novalidate>
        <h2 style="font-size:22px">Change password</h2>
        <div class="field"><label for="password">New password</label><div class="pw"><input id="password" type="password" autocomplete="new-password" placeholder="8+ characters, letters and numbers"><button type="button"></button></div><span class="err"></span></div>
        <div class="field"><label for="password2">Confirm new password</label><div class="pw"><input id="password2" type="password" autocomplete="new-password"><button type="button"></button></div><span class="err"></span></div>
        <button class="btn btn-ghost" id="pw-btn" type="submit">Update password</button>
      </form>
      <section class="panel panel-pad stack" style="gap:12px">
        <a class="btn btn-ghost" href="${app('member/progress.html')}">${icon('trending-up')}My progress & badges</a>
        <dl class="facts"><dt>Member since</dt><dd>${esc(formatDate(profile.joined_on))}</dd><dt>Role</dt><dd>${ROLE_LABEL[profile.role]}</dd></dl>
        <button class="btn btn-bad" id="logout-btn" type="button">${icon('log-out')}Log out</button>
      </section>
    </div>
  </div>`;
  wirePasswordToggles(main);

  $('#profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#full_name'), phone = $('#phone');
    const n = name.value.trim(), p = phone.value.trim();
    const ok = [setFieldError(name, n.length < 2 ? 'Enter your full name.' : ''),
                setFieldError(phone, p && !PHONE_RE.test(p) ? 'Use digits only, for example +91 98765 43210.' : '')].every(Boolean);
    if (!ok) return;
    await withBusy($('#save-btn'), 'Saving…', async () => {
      const { data, error } = await supabase.from('profiles').update({ full_name: n, phone: p || null }).eq('id', user.id).select('full_name, phone').single();
      if (error) return toast(friendlyError(error), 'bad');
      Object.assign(profile, data);
      $('.profile-head h1').textContent = data.full_name;
      toast('Details saved');
    });
  });

  $('#pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#password'), pw2 = $('#password2');
    const ok = [setFieldError(pw, validatePassword(pw.value)), setFieldError(pw2, pw2.value !== pw.value ? 'Passwords do not match.' : '')].every(Boolean);
    if (!ok) return;
    await withBusy($('#pw-btn'), 'Updating…', async () => {
      try { await updatePassword(pw.value); e.target.reset(); toast('Password updated'); }
      catch (err) { toast(friendlyError(err), 'bad'); }
    });
  });

  $('#logout-btn').addEventListener('click', (e) => withBusy(e.currentTarget, 'Logging out…', signOut));
}

// ---------------- boot ----------------
(async () => {
  try {
    const { profile, user } = await requireRole(['member']);
    chrome(profile, user, page === 'member-profile' ? 'profile' : 'dashboard');
    if (page === 'member-dashboard') await renderDashboard(profile, user);
    if (page === 'member-profile') renderProfile(profile, user);
  } catch (err) {
    document.body.classList.remove('guarding');
    errorPanel($('#main'), err, () => location.reload());
  }
})();

document.addEventListener('input', (e) => { if (e.target.closest('.field.invalid')) setFieldError(e.target, ''); });
