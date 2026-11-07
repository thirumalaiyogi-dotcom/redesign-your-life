// Entry for index.html: show the landing page only when it is switched on in site-content.js.
// When it is off, visitors go straight to the login screen (signed-in users are sent on to their dashboard from there).
import { LANDING_PAGE } from './site-content.js';

if (LANDING_PAGE) {
  import('./landing.js').finally(() => document.body.classList.remove('gate'));
} else {
  location.replace('login.html' + location.search);
}
