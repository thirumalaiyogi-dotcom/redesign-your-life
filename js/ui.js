// Shared UI helpers: escaping, toast, busy buttons, confirm dialog, navigation chrome.
import { icon } from './icons.js';
import { app } from './supabase.js';
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
export function memberNav(current) {
  const items = [
    [app('member/dashboard.html'), 'layout-dashboard', 'Home', 'dashboard'],
    [app('member/trackers.html'), 'list-checks', 'Trackers', 'trackers'],
    ['#', 'trophy', 'Ranks', 'leaderboard', 'Leaderboard opens in Phase 8'],
    ['#', 'notebook-pen', 'Journal', 'journal', 'Journal opens in Phase 9'],
    [app('member/profile.html'), 'user-round', 'Profile', 'profile']
  ];
  return `<nav class="bottomnav" aria-label="Member menu"><div class="inner">${items.map(([href, ic, label, key, soon]) =>
    `<a href="${href}" ${key === current ? 'aria-current="page"' : ''} ${soon ? `${SOON}="${esc(soon)}"` : ''}>${icon(ic)}${label}</a>`).join('')}</div></nav>`;
}

export function adminNav(current) {
  const items = [
    [app('admin/dashboard.html'), 'layout-dashboard', 'Overview', 'dashboard'],
    ['#', 'check-check', 'Check-ins', 'checkins', 'Check-in feed opens in Phase 6'],
    [app('admin/members.html'), 'users', 'Members', 'members'],
    ['#', 'list-checks', 'Activities', 'activities', 'Activity editor opens in Phase 6'],
    ['#', 'trophy', 'Leaderboard', 'leaderboard', 'Leaderboard opens in Phase 8'],
    ['#', 'file-chart-column', 'Reports', 'reports', 'Reports open in Phase 9'],
    ['#', 'settings', 'Settings', 'settings', 'Settings open in Phase 7']
  ];
  return `<nav class="admin-nav" aria-label="Coach menu">${items.map(([href, ic, label, key, soon]) =>
    `<a href="${href}" ${key === current ? 'aria-current="page"' : ''} ${soon ? `${SOON}="${esc(soon)}"` : ''}>${icon(ic)}${label}</a>`).join('')}</nav>`;
}

// Links to screens built in later phases explain themselves instead of 404-ing.
document.addEventListener('click', (e) => {
  const a = e.target.closest(`[${SOON}]`);
  if (a) { e.preventDefault(); toast(a.getAttribute(SOON), 'info'); }
});
