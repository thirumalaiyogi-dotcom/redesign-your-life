// Login, register, forgot-password and reset-password screens.
import { supabase, app, setRemember, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { signIn, signUp, sendPasswordReset, updatePassword, getSession, fetchProfile, homeFor, safeNext, friendlyError } from './auth.js';
import { $, icon, esc, toast, withBusy, setFieldError, wirePasswordToggles, EMAIL_RE, PHONE_RE, validatePassword } from './ui.js';
import { currentTheme } from './theme.js';
import { COACH, TESTIMONIALS } from './site-content.js';
import { stadium } from './stadium.js';

const page = document.body.dataset.page;
const params = new URLSearchParams(location.search);

stadium($('#art-canvas'));
$$icons();
decorate();

// 2.0: theme toggle on every auth screen (ui.js handles the click) and the art panel's highlights.
function decorate() {
  const form = $('.auth-form');
  if (form && !$('#theme-btn')) {
    const dark = currentTheme() === 'dark';
    form.insertAdjacentHTML('afterbegin', `<button class="iconbtn theme-btn auth-theme" id="theme-btn" type="button" aria-label="${dark ? 'Switch to light mode' : 'Switch to dark mode'}">${icon(dark ? 'sun' : 'moon')}</button>`);
  }
  const art = $('.auth-art');
  if (art && !$('.art-coach', art)) {
    art.insertAdjacentHTML('beforeend', `<img class="art-coach" src="${esc(COACH.photo)}" alt="">`);
    const [n, img, q] = TESTIMONIALS[Math.floor(Math.random() * TESTIMONIALS.length)];
    $('.quote', art)?.insertAdjacentHTML('beforeend', `<figure class="art-voice"><blockquote>“${esc(q)}”</blockquote><figcaption><img src="${esc(img)}" alt=""><b>${esc(n)}</b></figcaption></figure>`);
  }
  const quote = $('.auth-art .quote');
  if (quote && !$('.art-points', quote)) {
    quote.insertAdjacentHTML('beforeend', `<ul class="art-points">${[['check-circle-2', 'One tap, instant points'], ['flame', 'Streaks, badges and a live leaderboard'], ['lock', 'A private evening journal']]
      .map(([ic, t]) => `<li>${icon(ic)}<span>${t}</span></li>`).join('')}</ul>`);
  }
}
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
  if (profile?.is_active && profile.must_change && page !== 'reset') { location.replace(app('reset.html?first=1')); return true; }
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
  // coming back from Google with an error (e.g. a Gmail the coach did not add)
  const hash = new URLSearchParams(location.hash.slice(1));
  const gErr = params.get('error_description') || hash.get('error_description');
  if (gErr) {
    showNotice('bad', /database error saving new user|sign-up is closed|signups not allowed/i.test(gErr)
      ? 'This Gmail is not on your coach\'s list. Choose the Gmail you gave your coach, or log in with email and password below.'
      : friendlyError({ message: gErr }));
    history.replaceState(null, '', location.pathname);
  }
  wireGoogle();
  if (params.get('next') && !m) showNotice('info', 'Please log in to continue.');
  if (params.get('demo') === '1') openDemo(); else redirectIfSignedIn();

  // login with a one-time code sent to the email (works for Gmail, Yahoo, Zoho, office mail…).
  // shouldCreateUser:false → only emails the coach added get a code.
  // mode: 'pw' (email + password) | 'ask' (email → Send code) | 'code' (type the code)
  let mode = 'pw';
  const setMode = (m) => {
    mode = m;
    $('#password').closest('.field').hidden = m !== 'pw'; $('.row-between').hidden = m !== 'pw';
    $('#otp-field').hidden = m !== 'code';
    $('#login-btn').textContent = m === 'pw' ? 'Log in' : m === 'ask' ? 'Send code to my email' : 'Verify code';
    $('#otp-btn-l').textContent = m === 'pw' ? 'Get a login code by email' : 'Use password instead';
    const em = $('#email'); setFieldError(em, '');
    if (m === 'ask') { $('#otp-hint').textContent = ''; showNotice('info', 'Type your email and tap "Send code". We will email you a 6-digit code.'); (em.value ? $('#login-btn') : em).focus(); }
    if (m === 'pw') $('#notice').hidden = true;
  };
  const sendCode = async () => {
    const email = $('#email');
    if (!checkEmail(email)) { email.focus(); return false; }
    const { error } = await supabase.auth.signInWithOtp({ email: email.value.trim().toLowerCase(), options: { shouldCreateUser: false } });
    if (error) {
      const m = (error.message || '').toLowerCase();
      showNotice('bad', m.includes('signups not allowed') || m.includes('not found') || m.includes('database error')
        ? "This email is not on your coach's list. Use the email you gave your coach."
        : m.includes('rate limit') || m.includes('security purposes') ? 'A code was sent just now. Wait a minute, then try again.' : friendlyError(error));
      return false;
    }
    $('#otp-hint').innerHTML = `We sent a code to ${esc(email.value.trim())}. Check your inbox and spam folder. <button type="button" class="link" id="otp-resend">Send again</button>`;
    showNotice('ok', 'Code sent. Type it below.');
    return true;
  };
  $('#otp-btn').addEventListener('click', () => setMode(mode === 'pw' ? 'ask' : 'pw'));
  // paste from the email (Gmail's "Copy code") and check right away when 6 digits are in
  const tryAuto = () => { const v = $('#otp').value.replace(/\D/g, ''); if (v.length === 6 && mode === 'code') $('#login-form').requestSubmit(); };
  $('#otp').addEventListener('input', tryAuto);
  $('#otp-paste').addEventListener('click', async () => {
    try {
      const t = (await navigator.clipboard.readText()).match(/\d{6}/);
      if (!t) return showNotice('info', 'Copy the 6-digit code from the email first, then tap Paste.');
      $('#otp').value = t[0]; tryAuto();
    } catch { $('#otp').focus(); showNotice('info', 'Long-press the code box and choose Paste.'); }
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#otp-resend')) return;
    e.target.disabled = true; if (await sendCode()) $('#otp').focus(); e.target.disabled = false;
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (mode === 'ask') {
      let sent = false;
      await withBusy($('#login-btn'), 'Sending code…', async () => { sent = await sendCode(); });
      if (sent) { setMode('code'); $('#otp').focus(); }
      return;
    }
    if (mode === 'code') {
      const email = $('#email'), code = $('#otp'), v = code.value.replace(/\D/g, '');
      if (!checkEmail(email) || !setFieldError(code, v.length < 6 ? 'Type the code from your email.' : '')) return;
      return withBusy($('#login-btn'), 'Checking…', async () => {
        setRemember($('#remember').checked);
        const { data, error } = await supabase.auth.verifyOtp({ email: email.value.trim().toLowerCase(), token: v, type: 'email' });
        if (error) return showNotice('bad', /expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check it, or tap "Use password instead" and ask for a new code.' : friendlyError(error));
        let profile = await fetchProfile(data.user.id).catch(() => null);
        if (!profile?.is_active) { await supabase.auth.signOut(); return showNotice('bad', 'Your account is paused. Please contact your coach.'); }
        // they proved the email: no need to change the coach's temporary password first
        if (profile.must_change) { await supabase.rpc('skip_temp_password'); }
        location.replace(safeNext(params.get('next')) || homeFor(profile.role));
      });
    }
    const email = $('#email'), pw = $('#password');
    const ok = [checkEmail(email), setFieldError(pw, pw.value ? '' : 'Enter your password.')].every(Boolean);
    if (!ok) { $('.field.invalid input')?.focus(); return; }
    await withBusy($('#login-btn'), 'Logging in…', async () => {
      try {
        const { profile } = await signIn(email.value, pw.value, $('#remember').checked);
        if (profile.must_change) return location.replace(app('reset.html?first=1'));
        location.replace(safeNext(params.get('next')) || homeFor(profile.role));
      } catch (err) {
        showNotice('bad', friendlyError(err));
        pw.select();
      }
    });
  });
}

// Google login: shown once the coach turns on the Google provider in Supabase (Auth settings say so).
// Only emails the coach uploaded can come in; anyone else is stopped by the database (sign-up is closed).
async function wireGoogle() {
  const btn = $('#google-btn'); if (!btn) return;
  let on = false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } });
    on = !!(await r.json())?.external?.google;
  } catch { /* offline: leave it off */ }
  if (!on) { $('#google-l').textContent = 'Google login coming soon'; $('#google-hint').textContent = 'For now, log in with the email and password your coach sent.'; return; }
  btn.disabled = false;
  btn.addEventListener('click', async () => {
    setRemember($('#remember')?.checked ?? true);
    btn.disabled = true; $('#google-l').textContent = 'Opening Google…';
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google',
      options: { redirectTo: app('login.html'), queryParams: { prompt: 'select_account' } } });
    if (error) { btn.disabled = false; $('#google-l').textContent = 'Continue with Google'; showNotice('bad', friendlyError(error)); }
  });
}

// ---------------- REGISTER ----------------
if (page === 'register') {
  redirectIfSignedIn();
  const form = $('#register-form');
  // accounts are normally made by the coach; the form shows only when the super admin opens sign-up
  supabase.rpc('signup_open').then(({ data, error }) => {
    if (error || data !== false) return;
    form.hidden = true;
    $('#closed').hidden = false;
  });
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
if (page === 'reset' && params.get('first')) {
  // first login with the coach's temporary password: pick their own, then straight in
  const form = $('#reset-form');
  $('h1').textContent = 'Choose your password';
  $('#checking').textContent = 'Checking your login…';
  getSession().then(async (s) => {
    if (!s) return location.replace(app('login.html'));
    const prof = await fetchProfile(s.user.id).catch(() => null);
    if (prof && !prof.must_change) return location.replace(homeFor(prof.role));
    $('#checking').hidden = true; form.hidden = false;
    showNotice('info', `Welcome${prof?.full_name ? ', ' + prof.full_name.split(' ')[0] : ''}! Set your own password. You will use it from next time.`);
    $('#password').focus();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#password'), pw2 = $('#password2');
    const ok = [setFieldError(pw, validatePassword(pw.value)), setFieldError(pw2, pw2.value !== pw.value ? 'Passwords do not match.' : '')].every(Boolean);
    if (!ok) return;
    await withBusy($('#reset-btn'), 'Saving…', async () => {
      try {
        await updatePassword(pw.value);
        const s = await getSession();
        let prof = null;
        for (let i = 0; i < 4; i++) { prof = await fetchProfile(s.user.id).catch(() => null); if (prof && !prof.must_change) break; await new Promise((r) => setTimeout(r, 600)); }
        if (prof?.must_change) return showNotice('bad', 'Saved, but the app could not confirm it. Please log in again with your new password.');
        location.replace(homeFor(prof?.role || 'member'));
      } catch (err) { showNotice('bad', friendlyError(err)); }
    });
  });
} else if (page === 'reset') {
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

// One link for group demos (demo.html → login.html?demo=1): logs straight into the shared demo member.
// This login is meant to be public; the database stops anyone changing its email or password.
async function openDemo() {
  const s = await getSession().catch(() => null);
  if (s) { redirectIfSignedIn(); return; }          // already logged in: just open the app
  showNotice('info', 'Opening the demo…');
  try {
    const { profile } = await signIn('demo@deepak10xlifecoach.com', '10Xlife2026', true);
    location.replace(homeFor(profile));
  } catch (err) {
    showNotice('bad', /paused|invalid login/i.test(err?.message || '') ? 'The demo has ended. Please log in with your own account.' : friendlyError(err));
  }
}
