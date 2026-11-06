// Landing page: icons, background, and a dashboard shortcut for signed-in visitors.
import { icon } from './icons.js';
import { stadium } from './stadium.js';
import { getSession, fetchProfile, homeFor } from './auth.js';
document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
stadium(document.getElementById('art-canvas'));
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
