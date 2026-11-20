// Family link (family.html#<key>): the whole family opens the app from ONE link.
// First time: type your name → family_join() makes your account (with the family's trackers).
// Next time: tap your name → family_enter() gives a fresh login for that person, and the app opens.
// The key is only in the # part of the link, so it is never sent to any server log.
import { supabase, app, setRemember, clearOfflineData } from './supabase.js';
import { clearProfileCache, friendlyError } from './auth.js';
import { stadium } from './stadium.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
};
const KEY = 'ryl.family.key', LAST = 'ryl.family.last';

stadium($('#art-canvas'));
const box = $('#fam');
const fromLink = decodeURIComponent(location.hash.replace(/^#/, '')).trim();
const key = /^[A-Za-z0-9_-]{24,64}$/.test(fromLink) ? fromLink : store.get(KEY);
if (key && key !== fromLink) history.replaceState(null, '', `#${key}`);

function problem(text) {
  box.innerHTML = `<div><h1>Family link</h1></div><div class="notice bad">${esc(text)}</div>
    <p class="muted" style="font-size:14px">Ask your coach to send the family link again on WhatsApp.</p>
    <a class="btn btn-ghost btn-block" href="login.html">Log in with email instead</a>`;
}
const netMsg = (e) => /fetch|network|load failed/i.test(e?.message || '') ? "Can't reach the server. Check your internet and try again." : friendlyError(e);

async function load() {
  if (!key) return problem('This link is not complete. Open the full link your coach sent.');
  const [{ data, error }, sess] = await Promise.all([supabase.rpc('family_info', { p_token: key }), supabase.auth.getSession()]);
  if (error) return problem(netMsg(error));
  store.set(KEY, key);
  const me = sess.data.session?.user?.id || null, last = store.get(LAST);
  const people = [...(data.people || [])].sort((a, b) => (b.id === last) - (a.id === last));
  box.innerHTML = `
    <div><span class="eyebrow">Family</span><h1>${esc(data.name)}</h1>
      <p class="sub">${people.length ? 'Who is using the app now? Tap your name.' : 'Welcome! Type your name to start.'}</p></div>
    <div id="notice" hidden></div>
    ${people.length ? `<div class="fam-people" role="list">${people.map((p) => `
      <button class="fam-person" role="listitem" type="button" data-id="${esc(p.id)}">
        <span class="avatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(initials(p.name))}</span>
        <span class="nm"><b>${esc(p.name)}</b>${p.id === me ? '<small>Logged in on this phone</small>' : p.id === last ? '<small>Last used on this phone</small>' : ''}</span>
        <span class="go" aria-hidden="true">›</span></button>`).join('')}</div>` : ''}
    ${data.full ? '<p class="muted" style="font-size:14px">This family is full. Ask your coach to add more people.</p>' : `
    <form class="form fam-new" id="fam-new" novalidate ${people.length ? 'hidden' : ''}>
      <div class="field"><label for="fam-name">Your name</label>
        <input id="fam-name" autocomplete="given-name" maxlength="80" placeholder="e.g. Priya" required><span class="err" aria-live="polite"></span></div>
      <button class="btn btn-gold btn-block" type="submit" id="fam-go">Start</button>
    </form>
    ${people.length ? '<button class="btn btn-ghost btn-block" type="button" id="fam-add">+ I am new. Add my name</button>' : ''}`}`;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) return enter(b, b.dataset.id, me);
    if (e.target.closest('#fam-add')) { $('#fam-new').hidden = false; $('#fam-add').hidden = true; $('#fam-name').focus(); }
  });
  $('#fam-new')?.addEventListener('submit', join);
}

function notice(text) { const n = $('#notice'); n.hidden = false; n.className = 'notice bad'; n.textContent = text; n.scrollIntoView({ block: 'nearest' }); }

async function signInAs(email, password, id) {
  setRemember(true);
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  clearProfileCache(); clearOfflineData();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  store.set(LAST, id);
  location.replace(app('member/dashboard.html'));
}

let busy = false;
async function enter(btn, id, me) {
  if (busy) return; busy = true; btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true');
  try {
    if (id === me) { store.set(LAST, id); location.replace(app('member/dashboard.html')); return; }
    const { data, error } = await supabase.rpc('family_enter', { p_token: key, p_member: id });
    if (error) throw error;
    const r = (data || [])[0]; if (!r) throw new Error('Please try again.');
    await signInAs(r.email, r.password, id);
  } catch (e) { notice(netMsg(e)); busy = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); }
}

async function join(e) {
  e.preventDefault();
  const input = $('#fam-name'), name = input.value.trim(), f = input.closest('.field');
  const bad = name.length < 2 ? 'Type your name.' : '';
  f.classList.toggle('invalid', !!bad); f.querySelector('.err').textContent = bad;
  if (bad) return input.focus();
  if (busy) return; busy = true;
  const btn = $('#fam-go'); btn.disabled = true; btn.textContent = 'Opening…';
  try {
    const { data, error } = await supabase.rpc('family_join', { p_token: key, p_name: name });
    if (error) throw error;
    const r = (data || [])[0]; if (!r) throw new Error('Please try again.');
    await signInAs(r.email, r.password, r.member_id);
  } catch (err) { notice(netMsg(err)); busy = false; btn.disabled = false; btn.textContent = 'Start'; }
}

load().catch((e) => problem(netMsg(e)));
