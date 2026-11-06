// Shared UI helpers: escaping, toast, busy buttons, confirm dialog, navigation chrome.
import { icon } from './icons.js';
import { app } from './supabase.js';
import { toggleTheme, currentTheme } from './theme.js';
export { icon };

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(name, email = '') {
  const src = (name || '').trim() || email.split('@')[0] || '?';
  const parts = src.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || ''))).toUpperCase() || '?';
}

export function firstName(name, email = '') {
  return ((name || '').trim().split(/\s+/)[0]) || email.split('@')[0] || 'there';
}

const fmtDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const fmtDay = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' });
export const formatDate = (d) => (d ? fmtDate.format(new Date(d)) : '—');
export const formatToday = () => fmtDay.format(new Date());
export const formatNumber = (n) => Number(n || 0).toLocaleString('en-IN');

let toastTimer;
export function toast(message, kind = 'ok') {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  const ic = kind === 'bad' ? 'x-circle' : kind === 'info' ? 'info' : 'check-circle-2';
  el.className = `toast ${kind}`;
  el.innerHTML = icon(ic) + `<span>${esc(message)}</span>`;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// Disable a button and show a spinner while an async task runs.
export async function withBusy(button, label, task) {
  const original = button.innerHTML;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  button.innerHTML = icon('loader-circle', 'icon spin') + `<span>${esc(label)}</span>`;
  try { return await task(); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); button.innerHTML = original; }
}

// In-page confirmation (no browser dialogs). Resolves true/false.
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
      <h2 id="dlg-t">${esc(title)}</h2><p class="muted">${esc(body)}</p>
      <div class="actions"><button class="btn btn-ghost" data-v="0">Cancel</button>
      <button class="btn ${danger ? 'btn-bad' : 'btn-gold'}" data-v="1">${esc(confirmLabel)}</button></div></div>`;
    const done = (v) => { scrim.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') done(false); };
    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) return done(false);
      const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1');
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(scrim);
    scrim.querySelector('[data-v="1"]').focus();
  });
}

// Field-level validation messages.
export function setFieldError(input, message) {
  const field = input.closest('.field');
  const err = field?.querySelector('.err');
  field?.classList.toggle('invalid', !!message);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (err) err.textContent = message || '';
  return !message;
}

export function wirePasswordToggles(root = document) {
  $$('.pw button', root).forEach((btn) => {
    btn.innerHTML = icon('eye');
    btn.setAttribute('aria-label', 'Show password');
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eye-off' : 'eye');
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^\+?[0-9 ]{7,16}$/;

export function validatePassword(pw) {
  if (!pw) return 'Enter a password.';
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use at least one letter and one number.';
  return '';
}

export function brandHTML(href, title = 'Redesign Your Life', sub = "Deepak's Program") {
  return `<a class="brand" href="${href}"><span class="crest">${icon('crown')}</span><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></a>`;
}

const SOON = 'data-soon';
// Bottom navigation (member). Labels stay short so five items fit at 320px; "Leaderboard"
// shows as "Ranks" on very narrow phones. Every item is a working page.
export function memberNav(current) {
  const items = [
    [app('member/dashboard.html'), 'house', 'Home', 'Home', 'dashboard'],
    [app('member/trackers.html'), 'list-checks', 'Track', 'Track', 'trackers'],
    [app('member/leaderboard.html'), 'trophy', 'Leaderboard', 'Ranks', 'leaderboard'],
    [app('member/journal.html'), 'notebook-pen', 'Journal', 'Journal', 'journal'],
    [app('member/profile.html'), 'user-round', 'Profile', 'Profile', 'profile']
  ];
  return `<nav class="bottomnav" aria-label="Member menu"><div class="inner">${items.map(([href, ic, label, short, key]) =>
    `<a href="${href}" ${key === current ? 'aria-current="page"' : ''} aria-label="${esc(label)}">${icon(ic)}${label === short
      ? `<span>${esc(label)}</span>` : `<span class="l-long">${esc(label)}</span><span class="l-short">${esc(short)}</span>`}</a>`).join('')}</div></nav>`;
}

export function adminNav(current) {
  const items = [
    [app('admin/dashboard.html'), 'layout-dashboard', 'Overview', 'dashboard'],
    [app('admin/checkins.html'), 'check-check', 'Check-ins', 'checkins'],
    [app('admin/members.html'), 'users', 'Members', 'members'],
    [app('admin/activities.html'), 'list-checks', 'Activities', 'activities'],
    [app('admin/leaderboard.html'), 'trophy', 'Leaderboard', 'leaderboard'],
    [app('admin/reports.html'), 'file-chart-column', 'Reports', 'reports'],
    [app('admin/settings.html'), 'settings', 'Settings', 'settings']
  ];
  return `<nav class="admin-nav" aria-label="Coach menu"><div class="an-inner">${items.map(([href, ic, label, key]) =>
    `<a href="${href}" ${key === current ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('')}</div></nav>`;
}

// Coach console header: logo, role, theme toggle, log out, then the coach menu.
export function coachTopbar(role, roleLabel, current) {
  const dark = currentTheme() === 'dark';
  return `<div class="dash-top coach-top">${brandHTML(app('admin/dashboard.html'), 'Coach Console', 'Redesign Your Life')}
    <div class="actions"><span class="pill ${role === 'super_admin' ? 'gold' : 'blue'}">${esc(roleLabel)}</span>
      <button class="iconbtn theme-btn" id="theme-btn" type="button" aria-label="${dark ? 'Switch to light mode' : 'Switch to dark mode'}" title="${dark ? 'Light mode' : 'Dark mode'}">${icon(dark ? 'sun' : 'moon')}</button>
      <button class="iconbtn" id="logout" type="button" aria-label="Log out" title="Log out">${icon('log-out')}</button></div></div>${adminNav(current)}`;
}

// Links to screens built in later phases explain themselves instead of 404-ing.
document.addEventListener('click', (e) => {
  const a = e.target.closest(`[${SOON}]`);
  if (a) { e.preventDefault(); toast(a.getAttribute(SOON), 'info'); }
});

// ---------------- 2.0 shared pieces ----------------

// Circular progress (SVG), pct 0–100. Starts empty; animateIn() moves it to its value.
export function ringHTML(pct, { size = 120, stroke = 12, mid = '', gradient = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<div class="pring" style="--size:${size}px" role="img" aria-label="${Math.round(pct)}% complete">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${gradient}
      <circle class="bg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="fg" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${c.toFixed(2)}" data-off="${off.toFixed(2)}"/></svg>
    <div class="mid">${mid}</div></div>`;
}
// Animate rings ([data-off]), bars ([data-w]) and columns ([data-h]) inside root to their values.
export function animateIn(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.pring .fg[data-off]', root).forEach((el) => { el.style.strokeDashoffset = el.dataset.off; });
    $$('[data-w]', root).forEach((el) => { el.style.width = el.dataset.w; });
    $$('[data-h]', root).forEach((el) => { el.style.height = el.dataset.h; });
  }));
}
export function setRing(el, pct) {
  const fg = el?.querySelector('.fg'); if (!fg) return;
  const c = Number(fg.getAttribute('stroke-dasharray'));
  fg.style.strokeDashoffset = (c * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(2);
  el.setAttribute('aria-label', `${Math.round(pct)}% complete`);
  const mid = el.querySelector('.mid[data-pct]'); if (mid) mid.textContent = `${Math.round(pct)}%`;
}

export function avatarHTML(profile, email = '', cls = 'avatar') {
  return profile?.avatar_url
    ? `<span class="${cls}"><img src="${esc(profile.avatar_url)}" alt=""></span>`
    : `<span class="${cls}" aria-hidden="true">${esc(initials(profile?.full_name, email))}</span>`;
}

// Member page header: logo, theme toggle, avatar → profile. extraHTML goes before the toggle.
export function memberTopbar(profile, email, extraHTML = '') {
  const dark = currentTheme() === 'dark';
  return `<div class="dash-top">${brandHTML(app('member/dashboard.html'))}
    <div class="actions">${extraHTML}
      <button class="iconbtn theme-btn" id="theme-btn" type="button" aria-label="${dark ? 'Switch to light mode' : 'Switch to dark mode'}" title="${dark ? 'Light mode' : 'Dark mode'}">${icon(dark ? 'sun' : 'moon')}</button>
      <a class="avatar-link" href="${app('member/profile.html')}" aria-label="My profile">${avatarHTML(profile, email)}</a>
    </div></div>`;
}
document.addEventListener('click', (e) => { if (e.target.closest('#theme-btn')) toggleTheme(); });
document.addEventListener('themechange', () => {
  const b = $('#theme-btn'); if (!b) return;
  const dark = currentTheme() === 'dark';
  b.innerHTML = icon(dark ? 'sun' : 'moon');
  b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  b.title = dark ? 'Light mode' : 'Dark mode';
});
