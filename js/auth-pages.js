// Login, register, forgot-password and reset-password screens.
import { supabase, app } from './supabase.js';
import { signIn, signUp, sendPasswordReset, updatePassword, getSession, fetchProfile, homeFor, safeNext, friendlyError } from './auth.js';
import { $, icon, esc, toast, withBusy, setFieldError, wirePasswordToggles, EMAIL_RE, PHONE_RE, validatePassword } from './ui.js';
import { stadium } from './stadium.js';

const page = document.body.dataset.page;
const params = new URLSearchParams(location.search);

stadium($('#art-canvas'));
$$icons();
wirePasswordToggles();

function $$icons() {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
}

function showNotice(kind, text) {
  const box = $('#notice');
  if (!box) return;
  const ic = kind === 'ok' ? 'check-circle-2' : kind === 'bad' ? 'alert-triangle' : 'info';
  box.className = `notice ${kind}`;
  box.innerHTML = icon(ic) + `<span>${esc(text)}</span>`;
  box.hidden = false;
  box.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
}

function checkEmail(input) {
  const v = input.value.trim();
  return setFieldError(input, !v ? 'Enter your email address.' : !EMAIL_RE.test(v) ? 'That email looks incomplete. Check for a missing @ or domain.' : '');
}

// Already logged in? Skip the form.
async function redirectIfSignedIn() {
  const session = await getSession().catch(() => null);
  if (!session) return false;
  const profile = await fetchProfile(session.user.id).catch(() => null);
  if (profile?.is_active) { location.replace(safeNext(params.get('next')) || homeFor(profile.role)); return true; }
  return false;
}

// ---------------- LOGIN ----------------
if (page === 'login') {
  const messages = {
    confirmed: ['ok', 'Email confirmed. Log in to start.'],
    signedout: ['ok', 'You have logged out.'],
    reset: ['ok', 'Password updated. Log in with your new password.'],
    paused: ['bad', 'Your account is paused. Please contact your coach.'],
    noprofile: ['bad', 'Your profile could not be found. Please contact your coach.']
  };
  const m = messages[params.get('msg')];
  if (m) showNotice(...m);
  if (params.get('next') && !m) showNotice('info', 'Please log in to continue.');
  redirectIfSignedIn();

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email'), pw = $('#password');
    const ok = [checkEmail(email), setFieldError(pw, pw.value ? '' : 'Enter your password.')].every(Boolean);
    if (!ok) { $('.field.invalid input')?.focus(); return; }
    await withBusy($('#login-btn'), 'Logging in…', async () => {
      try {
        const { profile } = await signIn(email.value, pw.value, $('#remember').checked);
        location.replace(safeNext(params.get('next')) || homeFor(profile.role));
      } catch (err) {
        showNotice('bad', friendlyError(err));
        pw.select();
      }
    });
  });
}

// ---------------- REGISTER ----------------
if (page === 'register') {
  redirectIfSignedIn();
  const form = $('#register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#full_name'), email = $('#email'), phone = $('#phone'), pw = $('#password'), pw2 = $('#password2'), terms = $('#terms');
    const phoneVal = phone.value.trim();
    const results = [
      setFieldError(name, name.value.trim().length < 2 ? 'Enter your full name.' : name.value.trim().length > 80 ? 'Keep the name under 80 characters.' : ''),
      checkEmail(email),
      setFieldError(phone, phoneVal && !PHONE_RE.test(phoneVal) ? 'Use digits only, for example +91 98765 43210.' : ''),
      setFieldError(pw, validatePassword(pw.value)),
      setFieldError(pw2, !pw2.value ? 'Type the password again.' : pw2.value !== pw.value ? 'Passwords do not match.' : ''),
      setFieldError(terms, terms.checked ? '' : 'Please agree to continue.')
    ];
    if (!results.every(Boolean)) { $('.field.invalid input')?.focus(); return; }
    await withBusy($('#register-btn'), 'Creating account…', async () => {
      try {
        const res = await signUp({ fullName: name.value, email: email.value, phone: phoneVal, password: pw.value });
        if (res.needsConfirmation) {
          form.hidden = true;
          $('#done-email').textContent = email.value.trim().toLowerCase();
          $('#done').hidden = false;
          $('#done h1')?.focus();
        } else {
          location.replace(app('member/dashboard.html'));
        }
      } catch (err) {
        showNotice('bad', friendlyError(err));
      }
    });
  });
}

// ---------------- FORGOT ----------------
if (page === 'forgot') {
  $('#forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email');
    if (!checkEmail(email)) { email.focus(); return; }
    await withBusy($('#forgot-btn'), 'Sending…', async () => {
      try {
        await sendPasswordReset(email.value);
        showNotice('ok', `If ${email.value.trim()} has an account, a reset link is on its way. Check your inbox and spam folder.`);
        e.target.reset();
      } catch (err) { showNotice('bad', friendlyError(err)); }
    });
  });
}

// ---------------- RESET ----------------
if (page === 'reset') {
  const form = $('#reset-form');
  let ready = false;
  const showForm = () => { if (ready) return; ready = true; form.hidden = false; $('#checking').hidden = true; $('#password').focus(); };
  supabase.auth.onAuthStateChange((event, session) => { if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) showForm(); });
  getSession().then((s) => { if (s) showForm(); });
  setTimeout(() => {
    if (ready) return;
    $('#checking').hidden = true;
    showNotice('bad', 'This reset link has expired or was already used. Request a new one.');
    $('#again').hidden = false;
  }, 4000);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#password'), pw2 = $('#password2');
    const ok = [setFieldError(pw, validatePassword(pw.value)), setFieldError(pw2, pw2.value !== pw.value ? 'Passwords do not match.' : '')].every(Boolean);
    if (!ok) return;
    await withBusy($('#reset-btn'), 'Saving…', async () => {
      try {
        await updatePassword(pw.value);
        await supabase.auth.signOut();
        location.replace(app('login.html?msg=reset'));
      } catch (err) { showNotice('bad', friendlyError(err)); }
    });
  });
}

// live clearing of field errors
document.addEventListener('input', (e) => {
  if (e.target.closest('.field.invalid')) setFieldError(e.target, '');
});
window.addEventListener('unhandledrejection', (e) => { toast(friendlyError(e.reason), 'bad'); });
