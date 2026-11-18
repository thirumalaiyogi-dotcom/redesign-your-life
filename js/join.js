// Public join form (join.html): name, city, phone, email → submit_join_request() → a coach approves.
// Its own small file on purpose: a brand-new page must never run an older saved copy of the login script.
import { supabase } from './supabase.js';

const $ = (s) => document.querySelector(s);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function err(input, msg) {
  const f = input.closest('.field');
  f.classList.toggle('invalid', !!msg);
  f.querySelector('.err').textContent = msg || '';
  return !msg;
}
function notice(text) { const n = $('#notice'); n.hidden = false; n.className = 'notice bad'; n.textContent = text; }

const form = $('#join-form');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#full_name'), city = $('#city'), phone = $('#phone'), email = $('#email');
  const digits = phone.value.replace(/[^0-9]/g, '');
  const ok = [
    err(name, name.value.trim().length < 2 ? 'Enter your name.' : ''),
    err(city, city.value.trim() ? '' : 'Enter your city.'),
    err(phone, digits.length < 10 || digits.length > 13 ? 'Enter your 10-digit mobile number.' : ''),
    err(email, EMAIL_RE.test(email.value.trim()) ? '' : 'Enter a valid email.')
  ];
  if (!ok.every(Boolean)) { $('.field.invalid input')?.focus(); return; }
  const btn = $('#join-btn'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const { error } = await supabase.rpc('submit_join_request', { p_name: name.value, p_city: city.value, p_phone: phone.value, p_email: email.value });
    if (error) {
      notice(/fetch|network|load failed/i.test(error.message || '') ? "Can't reach the server. Check your internet and try again." : (error.message || 'Something went wrong. Please try again.'));
      return;
    }
    form.hidden = true;
    $('#done-email').textContent = email.value.trim().toLowerCase();
    $('#done').hidden = false; $('#done h1')?.focus();
  } catch {
    notice("Can't reach the server. Check your internet and try again.");
  } finally { btn.disabled = false; btn.textContent = label; }
});
