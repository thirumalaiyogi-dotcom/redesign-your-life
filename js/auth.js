// Authentication & role-based access for every page.
// Roles come only from public.profiles (set by the database), never from the browser.
import { supabase, setRemember } from './supabase.js';

export const ROLE_LABEL = { super_admin: 'Super Admin', admin: 'Coach', member: 'Member' };
export const isCoach = (role) => role === 'admin' || role === 'super_admin';
export const homeFor = (role) => (isCoach(role) ? '/admin/dashboard.html' : '/member/dashboard.html');

// Turn Supabase/network errors into plain instructions.
export function friendlyError(error) {
  const msg = (error?.message || String(error || '')).toLowerCase();
  const code = error?.code || '';
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed'))
    return "Can't reach the server. Check your internet connection and try again.";
  if (msg.includes('invalid login credentials')) return 'Email or password is wrong. Check both and try again.';
  if (msg.includes('email not confirmed')) return 'Please confirm your email first. Open the link we sent to your inbox.';
  if (msg.includes('user already registered') || msg.includes('already been registered'))
    return 'An account with this email already exists. Log in instead.';
  if (msg.includes('rate limit') || msg.includes('too many') || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit')
    return 'Too many attempts. Wait a minute, then try again.';
  if (msg.includes('should be different')) return 'Choose a password different from your current one.';
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('at least'))) return 'That password is too weak. Use 8+ characters with letters and numbers.';
  if (msg.includes('jwt') || msg.includes('session') || code === '42501' && msg.includes('log in'))
    return 'Your session has ended. Please log in again.';
  return error?.message || 'Something went wrong. Please try again.';
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, avatar_url, role, is_active, joined_on')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Safe "next" redirect: only same-site paths.
export function safeNext(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw, location.origin);
    if (url.origin !== location.origin) return null;
    if (/^\/(login|register|forgot|reset)\.html/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

let leaving = false;   // set while we log out on purpose, so the listener doesn't redirect twice

function goLogin(message) {
  if (leaving) return;
  const params = new URLSearchParams({ next: location.pathname + location.search });
  if (message) params.set('msg', message);
  location.replace(`/login.html?${params}`);
}

/**
 * Protect a page. Resolves with { session, user, profile } or redirects away.
 * @param {('member'|'admin'|'super_admin')[]} allowed
 */
export async function requireRole(allowed) {
  let session;
  try { session = await getSession(); } catch { session = null; }
  if (!session) { goLogin(); return new Promise(() => {}); }

  let profile;
  try { profile = await fetchProfile(session.user.id); }
  catch (e) {
    document.body.classList.remove('guarding');
    throw e;   // page shows a connection error instead of redirect-looping
  }
  if (!profile) { await supabase.auth.signOut(); goLogin('noprofile'); return new Promise(() => {}); }
  if (!profile.is_active) { await supabase.auth.signOut(); goLogin('paused'); return new Promise(() => {}); }
  if (!allowed.includes(profile.role)) { location.replace(homeFor(profile.role)); return new Promise(() => {}); }

  // Another tab logged out → leave protected pages.
  supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') goLogin(); });
  document.body.classList.remove('guarding');
  return { session, user: session.user, profile };
}

export async function signIn(email, password, remember) {
  setRemember(remember);
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw error;
  const profile = await fetchProfile(data.user.id);
  if (!profile) { await supabase.auth.signOut(); throw new Error('Your profile is missing. Ask your coach for help.'); }
  if (!profile.is_active) { await supabase.auth.signOut(); throw new Error('Your account is paused. Please contact your coach.'); }
  return { user: data.user, profile };
}

export async function signUp({ fullName, email, phone, password }) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: { full_name: fullName.trim(), phone: phone ? phone.trim() : null },
      emailRedirectTo: `${location.origin}/login.html?msg=confirmed`
    }
  });
  if (error) throw error;
  // Supabase returns a user with no identities when the email is already taken (to avoid leaking accounts).
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('User already registered');
  }
  return { needsConfirmation: !data.session, session: data.session };
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${location.origin}/reset.html`
  });
  if (error) throw error;
}

export async function updatePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  leaving = true;
  await supabase.auth.signOut();
  location.replace('/login.html?msg=signedout');
}
