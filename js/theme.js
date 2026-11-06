// Theme API for pages (toggle button on the dashboard, choice on Profile).
// The first paint is handled by js/theme-init.js; this module only changes the saved choice.
const T = window.__rylTheme;
const KEY = 'ryl.theme';

export const THEMES = ['light', 'dark', 'system'];

export function getThemePref() {
  try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; }
}

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function setThemePref(pref) {
  if (!THEMES.includes(pref)) pref = 'light';
  try { localStorage.setItem(KEY, pref); } catch { /* private mode: applies for this page only */ }
  const root = document.documentElement;
  root.classList.add('theme-switching');
  const t = T ? T.apply(pref) : (root.setAttribute('data-theme', pref === 'dark' ? 'dark' : 'light'), pref);
  setTimeout(() => root.classList.remove('theme-switching'), 350);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { pref, theme: t } }));
  return t;
}

// Light ⇄ dark (an explicit choice; "system" is chosen on the Profile page).
export function toggleTheme() {
  return setThemePref(currentTheme() === 'dark' ? 'light' : 'dark');
}
