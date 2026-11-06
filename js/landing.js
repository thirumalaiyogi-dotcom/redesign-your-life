// Landing page: icons, background, and a dashboard shortcut for signed-in visitors.
import { icon } from './icons.js';
import { stadium } from './stadium.js';
import { getSession, fetchProfile, homeFor } from './auth.js';
import { toggleTheme, currentTheme } from './theme.js';
document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
stadium(document.getElementById('art-canvas'));
// Theme toggle in the hero (the page itself follows Light/Dark below the hero).
const tb = document.getElementById('theme-btn');
const paintToggle = () => { const dark = currentTheme() === 'dark'; tb.innerHTML = icon(dark ? 'sun' : 'moon'); tb.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); };
if (tb) { paintToggle(); tb.addEventListener('click', () => { toggleTheme(); paintToggle(); }); }
// Logged-in visitors get a direct way back to their dashboard.
getSession().then(async (s) => {
  if (!s) return;
  const p = await fetchProfile(s.user.id).catch(() => null);
  if (!p?.is_active) return;
  const home = homeFor(p.role);
  for (const id of ['top-cta', 'main-cta']) {
    const a = document.getElementById(id);
    a.href = home; a.innerHTML = (id === 'main-cta' ? icon('layout-dashboard') : '') + 'Open my dashboard';
  }
  document.getElementById('second-cta').hidden = true;
}).catch(() => {});
