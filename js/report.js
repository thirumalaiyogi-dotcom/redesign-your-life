// Coach "Daily report": a ready-to-paste WhatsApp message built from real data (admin_daily_report):
// who never logged in, who has not ticked today, who has not opened the app for 3+ days, time in the app,
// and today's top members. Two versions: one for Deepak sir (full detail) and one for the batch group (friendly).
import { supabase, app } from './supabase.js';
import { friendlyError } from './auth.js';
import { $, icon, esc, toast } from './ui.js';

const R = { rows: [], day: null, today: null, who: 'coach', batch: '' };

const mins = (sec) => { const m = Math.floor((sec || 0) / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`; };
const first = (n) => String(n || '').trim();
const ago = (iso) => {
  if (!iso) return 'never';
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const longDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const nowTime = () => new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

function rowsInView() {
  return R.batch ? R.rows.filter((r) => (r.batch || '').split(', ').includes(R.batch)) : R.rows;
}

function coachText() {
  const rows = rowsInView(), isToday = R.day === R.today;
  const ticked = rows.filter((r) => r.done > 0), notYet = rows.filter((r) => r.done === 0 && !r.never_logged_in);
  const never = rows.filter((r) => r.never_logged_in);
  const away = rows.filter((r) => !r.never_logged_in && (!r.app_last_at || Date.now() - new Date(r.app_last_at) > 3 * 864e5));
  const time = rows.reduce((a, r) => a + r.app_seconds, 0), used = rows.filter((r) => r.app_seconds >= 30).length;
  const top = [...ticked].sort((a, b) => b.points - a.points || b.done - a.done).slice(0, 5);
  const L = [];
  L.push(`*Deepak's 10X Life – Daily report*${R.batch ? ` (${R.batch})` : ''}`);
  L.push(`📅 ${longDate(R.day)}${isToday ? ` · till ${nowTime()}` : ''}`);
  L.push('');
  L.push(`👥 Members: ${rows.length}`);
  L.push(`✅ Ticked: ${ticked.length}   😴 Not yet: ${notYet.length}   🔑 Never logged in: ${never.length}`);
  L.push(`⏱ Time in app: ${mins(time)}${used ? ` (${used} people, about ${mins(time / used)} each)` : ''}`);
  if (top.length) {
    L.push(''); L.push('🏆 *Top*');
    top.forEach((r, i) => L.push(`${i + 1}. ${first(r.full_name)} – ${r.done}/${r.total} · +${r.points} pts · 🔥${r.streak} · ⏱ ${mins(r.app_seconds)}`));
  }
  if (notYet.length) {
    L.push(''); L.push(`😴 *No ticks ${isToday ? 'yet today' : 'that day'} (${notYet.length})*`);
    notYet.forEach((r) => L.push(`• ${first(r.full_name)}${r.phone ? ` – ${r.phone}` : ''} · last opened ${ago(r.app_last_at)}`));
  }
  if (never.length) {
    L.push(''); L.push(`🔑 *Never logged in (${never.length})*`);
    never.forEach((r) => L.push(`• ${first(r.full_name)}${r.phone ? ` – ${r.phone}` : ''}${r.batch && !R.batch ? ` (${r.batch})` : ''}`));
  }
  if (away.length) {
    L.push(''); L.push(`📵 *Not opened the app for 3+ days (${away.length})*`);
    away.forEach((r) => L.push(`• ${first(r.full_name)} – last opened ${ago(r.app_last_at)}`));
  }
  L.push(''); L.push('📋 *Everyone*');
  [...rows].sort((a, b) => b.done - a.done || a.full_name.localeCompare(b.full_name)).forEach((r) =>
    L.push(`${r.done ? '✅' : r.never_logged_in ? '🔑' : '⬜'} ${first(r.full_name)} – ${r.done}/${r.total} · +${r.points} · ⏱ ${mins(r.app_seconds)}`));
  return L.join('\n');
}

function groupText() {
  const rows = rowsInView(), isToday = R.day === R.today;
  const ticked = [...rows.filter((r) => r.done > 0)].sort((a, b) => b.points - a.points || b.done - a.done);
  const waiting = rows.filter((r) => r.done === 0 && !r.never_logged_in);
  const never = rows.filter((r) => r.never_logged_in);
  const L = [];
  L.push(`*Deepak's 10X Life – ${isToday ? "Today's" : longDate(R.day)} board* 🔥${R.batch ? `\n${R.batch}` : ''}`);
  L.push('');
  if (ticked.length) {
    L.push(`👏 *Great going (${ticked.length})*`);
    ticked.forEach((r, i) => L.push(`${i < 3 ? ['🥇', '🥈', '🥉'][i] : '✅'} ${first(r.full_name)} – ${r.done}/${r.total} habits${r.streak > 1 ? ` · 🔥${r.streak} days` : ''}`));
  }
  if (waiting.length) {
    L.push(''); L.push(`⏳ *Waiting for your ticks${isToday ? ' today' : ''} (${waiting.length})*`);
    L.push(waiting.map((r) => first(r.full_name)).join(', '));
    L.push(isToday ? 'Open the app and tick today\'s habits before you sleep 🙏' : 'Let\'s not miss today 🙏');
  }
  if (never.length) {
    L.push(''); L.push(`🔑 *Not logged in yet (${never.length})*`);
    L.push(never.map((r) => first(r.full_name)).join(', '));
    L.push(`Login here: ${app('login.html')}`);
    L.push('Need help? Reply here, we will call you.');
  }
  L.push(''); L.push('Small habits, done daily, make a 10X life ✨');
  return L.join('\n');
}

function draw() {
  const box = $('#rep-body'); if (!box) return;
  if (!R.rows.length) { box.innerHTML = '<p class="muted">No active members yet.</p>'; return; }
  const text = R.who === 'coach' ? coachText() : groupText();
  box.innerHTML = `<pre class="rep-text" id="rep-text">${esc(text)}</pre>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn btn-gold btn-sm" type="button" data-rep="copy">${icon('copy')}Copy</button>
      <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">${icon('message-square')}Send on WhatsApp</a>
    </div>`;
}

async function load() {
  const box = $('#rep-body'); if (!box) return;
  box.innerHTML = '<div class="skeleton" style="height:160px"></div>';
  const { data, error } = await supabase.rpc('admin_daily_report', { p_date: R.day });
  if (error) {
    // the database part is not added yet (older database): hide the card instead of showing an error
    if (error.code === 'PGRST202' || /could not find the function|404/i.test(error.message || '')) { box.closest('#daily-report')?.replaceChildren(); return; }
    box.innerHTML = `<p class="muted">${esc(friendlyError(error))}</p>`; return;
  }
  R.rows = (data || []).map((r) => ({ ...r, app_seconds: r.app_seconds || 0, done: r.done || 0, total: r.total || 0, points: r.points || 0, streak: r.streak || 0 }));
  const batches = [...new Set(R.rows.flatMap((r) => (r.batch || '').split(', ').filter(Boolean)))].sort();
  const sel = $('#rep-batch');
  if (sel) sel.innerHTML = `<option value="">All batches</option>${batches.map((b) => `<option ${b === R.batch ? 'selected' : ''}>${esc(b)}</option>`).join('')}`;
  draw();
}

// Card on the coach overview
export async function reportCard(root) {
  if (!root) return;
  let today = null;
  try { ({ data: today } = await supabase.rpc('app_today')); } catch { /* use the phone's date */ }
  R.today = today || new Date(Date.now() + 5.5 * 36e5).toISOString().slice(0, 10); R.day = R.today;
  root.innerHTML = `<section class="card rep-card" aria-labelledby="rep-h">
    <div class="panel-h"><h3 id="rep-h">${icon('file-chart-column')}Daily report</h3><small class="muted">Copy and paste in WhatsApp</small></div>
    <div class="rep-ctl">
      <div class="seg" role="tablist" aria-label="Report for">
        <button type="button" role="tab" data-who="coach" aria-selected="true">For Deepak sir</button>
        <button type="button" role="tab" data-who="group" aria-selected="false">For the group</button></div>
      <select id="rep-day" aria-label="Day"><option value="0">Today</option><option value="-1">Yesterday</option></select>
      <select id="rep-batch" aria-label="Batch"><option value="">All batches</option></select>
    </div>
    <div id="rep-body"></div></section>`;
  root.addEventListener('click', async (e) => {
    const w = e.target.closest('[data-who]');
    if (w) { R.who = w.dataset.who; root.querySelectorAll('[data-who]').forEach((b) => b.setAttribute('aria-selected', String(b === w))); draw(); return; }
    if (e.target.closest('[data-rep="copy"]')) {
      const t = $('#rep-text')?.textContent || '';
      try { await navigator.clipboard.writeText(t); toast('Report copied. Paste it in WhatsApp.'); }
      catch { const r = document.createRange(); r.selectNodeContents($('#rep-text')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Select all and copy', 'info'); }
    }
  });
  $('#rep-day').addEventListener('change', (e) => { R.day = addDays(R.today, Number(e.target.value)); load(); });
  $('#rep-batch').addEventListener('change', (e) => { R.batch = e.target.value; draw(); });
  load();
}
