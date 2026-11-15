// One habit point, opened from a tracker card: the coach's explanation (audio, pictures, videos),
// "Real life vs application" notes with the member's own picture, and questions about this point.
import { supabase } from './supabase.js';
import { friendlyError } from './auth.js';
import { icon, esc, toast, withBusy, formatDate, confirmDialog } from './ui.js';
import { signedUrls, mediaHTML, shrinkImage, fileName } from './media.js';

const ago = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago';
  if (s < 86400) return Math.floor(s / 3600) + ' h ago'; return formatDate(iso);
};

// member-media pictures → signed links (own folder; coaches can read all)
export async function memberPicUrls(paths) {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from('member-media').createSignedUrls(paths, 60 * 60 * 6);
  if (error) return {};
  return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
}

export function noteItemHTML(n, pics = {}, { canDelete = true, who = '' } = {}) {
  return `<article class="ln-item">
    ${who}
    <div class="ln-row"><span class="tag t-sit">Situation</span><p>${esc(n.situation)}</p></div>
    ${n.application ? `<div class="ln-row"><span class="tag t-app">Application</span><p>${esc(n.application)}</p></div>` : ''}
    ${n.image_ref ? (pics[n.image_ref] ? `<a class="ln-pic" href="${esc(pics[n.image_ref])}" target="_blank" rel="noopener"><img src="${esc(pics[n.image_ref])}" alt="Picture added with this note" loading="lazy"></a>` : `<span class="ln-pic missing">${icon('image')}</span>`) : ''}
    <div class="ln-foot"><small>${n.activities?.default_name ? `${icon('list-checks')}${esc(n.activities.default_name)} · ` : ''}${esc(ago(n.created_at))}</small>
      ${canDelete ? `<button class="lnk-del" data-del-note="${n.id}" aria-label="Delete this note">${icon('x')}</button>` : ''}</div></article>`;
}

export async function openPoint(a, memberId, { color = 'var(--c-primary)' } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="dialog pt-sheet" role="dialog" aria-modal="true" aria-labelledby="pt-t" style="--tc:${color}">
    <div class="pt-head"><span class="pt-no">${String(a.number).padStart(2, '0')}</span><div><h2 id="pt-t">${esc(a.default_name)}</h2>${a.description ? `<p>${esc(a.description)}</p>` : ''}</div>
      <button class="iconbtn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="seg seg-3" role="tablist" aria-label="Section">
      <button role="tab" data-pt="learn" aria-selected="true">${icon('mic')}Learn</button>
      <button role="tab" data-pt="apply" aria-selected="false">${icon('sprout')}Real life</button>
      <button role="tab" data-pt="ask" aria-selected="false">${icon('message-square')}Ask</button></div>
    <div class="pt-body" id="pt-body"><div class="skeleton" style="height:120px"></div></div></div>`;
  document.body.appendChild(scrim);
  const body = scrim.querySelector('#pt-body');
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });

  const P = { tab: 'learn', media: [], notes: [], qs: [], urls: {}, pics: {} };
  const [m, n, q] = await Promise.all([
    supabase.from('activity_media').select('id, kind, ref, caption, sort_order').eq('activity_id', a.id).order('sort_order').order('created_at'),
    supabase.from('session_notes').select('id, situation, application, image_ref, created_at').eq('member_id', memberId).eq('activity_id', a.id).order('created_at', { ascending: false }),
    supabase.from('doubts').select('id, question, answer, answered_at, created_at').eq('member_id', memberId).eq('activity_id', a.id).order('created_at', { ascending: false })
  ]);
  if (m.error || n.error || q.error) { body.innerHTML = `<p class="muted">${esc(friendlyError(m.error || n.error || q.error))}</p>`; return; }
  P.media = m.data || []; P.notes = n.data || []; P.qs = q.data || [];
  [P.urls, P.pics] = await Promise.all([signedUrls(P.media.filter((x) => x.kind === 'image' || x.kind === 'audio' || x.kind === 'file').map((x) => x.ref)), memberPicUrls(P.notes.filter((x) => x.image_ref).map((x) => x.image_ref))]);
  if (!P.media.length && (P.notes.length || P.qs.length)) P.tab = P.notes.length ? 'apply' : 'ask';
  let picked = null;

  const draw = () => {
    scrim.querySelectorAll('[data-pt]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pt === P.tab)));
    if (P.tab === 'learn') {
      body.innerHTML = P.media.length ? mediaHTML(P.media, P.urls)
        : `<div class="empty-state" style="padding:20px 8px"><span class="ic">${icon('mic')}</span><b>No explanation yet</b><span>Your coach will add an audio, video or pictures for this point.</span></div>`;
    } else if (P.tab === 'apply') {
      body.innerHTML = `<form class="form ln-form" data-pf="note" novalidate>
        <p class="muted ln-help">A real situation where you used “${esc(a.default_name)}”.</p>
        <div class="field"><label for="pn-sit">Real life situation</label><textarea id="pn-sit" maxlength="1500" rows="3" placeholder="What happened?"></textarea><span class="err"></span></div>
        <div class="field"><label for="pn-app">How I applied this point <span class="opt">(optional)</span></label><textarea id="pn-app" maxlength="1500" rows="2"></textarea></div>
        <div class="pn-pic"><label class="btn btn-ghost btn-sm">${icon('image')}<span id="pn-pic-l">${picked ? 'Picture added ✓' : 'Add a picture'}</span><input type="file" id="pn-file" accept="image/*" class="visually-hidden"></label>
          ${picked ? `<img src="${esc(picked.url)}" alt="" class="pn-thumb"><button type="button" class="lnk-del" data-unpick aria-label="Remove picture">${icon('x')}</button>` : ''}</div>
        <p class="lock-line">${icon('lock')}Only you and your coach can see this.</p>
        <button class="btn btn-primary" type="submit">Save note</button></form>
        ${P.notes.length ? `<div class="stack" style="gap:10px;margin-top:14px">${P.notes.map((x) => noteItemHTML(x, P.pics)).join('')}</div>` : ''}`;
    } else {
      body.innerHTML = `<form class="form ln-form" data-pf="ask" novalidate>
        <div class="field"><label for="pq">Your question about this point</label><textarea id="pq" maxlength="1000" rows="3" placeholder="Type your doubt"></textarea><span class="err"></span></div>
        <p class="lock-line">${icon('lock')}Only you and your coach can see this.</p>
        <button class="btn btn-primary" type="submit">${icon('arrow-right')}Send question</button></form>
        ${P.qs.length ? `<div class="stack" style="gap:10px;margin-top:14px">${P.qs.map((x) => `<article class="ln-item q-item">
          <div class="q-q"><span class="qa-ic">${icon('message-square')}</span><p>${esc(x.question)}</p></div>
          ${x.answered_at ? `<div class="q-a"><span class="qa-ic">${icon('check')}</span><div><small>Coach answered · ${esc(ago(x.answered_at))}</small><p>${esc(x.answer)}</p></div></div>` : `<div class="q-wait">${icon('hourglass')}Waiting for your coach's answer</div>`}
          <div class="ln-foot"><small>Asked ${esc(ago(x.created_at))}</small>${x.answered_at ? '' : `<button class="lnk-del" data-del-q="${x.id}" aria-label="Delete this question">${icon('x')}</button>`}</div></article>`).join('')}</div>` : ''}`;
    }
  };
  draw();

  scrim.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-pt]'); if (t) { P.tab = t.dataset.pt; return draw(); }
    if (e.target.closest('[data-unpick]')) { picked = null; return draw(); }
    const dn = e.target.closest('[data-del-note]'), dq = e.target.closest('[data-del-q]');
    if (dn || dq) {
      if (!(await confirmDialog({ title: dn ? 'Delete this note?' : 'Delete this question?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
      const id = dn ? dn.dataset.delNote : dq.dataset.delQ;
      const { error } = await supabase.from(dn ? 'session_notes' : 'doubts').delete().eq('id', id);
      if (error) return toast(friendlyError(error), 'bad');
      if (dn) { const x = P.notes.find((y) => y.id === id); if (x?.image_ref) supabase.storage.from('member-media').remove([x.image_ref]); P.notes = P.notes.filter((y) => y.id !== id); }
      else P.qs = P.qs.filter((y) => y.id !== id);
      toast('Deleted'); draw();
    }
  });
  scrim.addEventListener('change', async (e) => {
    if (e.target.id !== 'pn-file') return;
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const sit = scrim.querySelector('#pn-sit').value, app = scrim.querySelector('#pn-app').value;
      const blob = await shrinkImage(f, 1280, 0.8);
      picked = { blob, url: URL.createObjectURL(blob) };
      draw(); scrim.querySelector('#pn-sit').value = sit; scrim.querySelector('#pn-app').value = app;
    } catch (err) { toast(friendlyError(err), 'bad'); }
  });
  scrim.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('[type=submit]');
    const err = (input, msg) => { const fl = input.closest('.field'); fl.classList.toggle('invalid', !!msg); fl.querySelector('.err').textContent = msg || ''; if (msg) input.focus(); return !msg; };
    if (f.dataset.pf === 'note') {
      const sit = f.querySelector('#pn-sit'), app = f.querySelector('#pn-app');
      if (!err(sit, sit.value.trim().length < 2 ? 'Write the situation first.' : '')) return;
      await withBusy(btn, 'Saving…', async () => {
        let image_ref = null;
        if (picked) {
          image_ref = `${memberId}/${fileName('webp')}`;
          const up = await supabase.storage.from('member-media').upload(image_ref, picked.blob, { contentType: 'image/webp', upsert: false });
          if (up.error) { toast(friendlyError(up.error), 'bad'); return; }
        }
        const { data, error } = await supabase.from('session_notes').insert({ member_id: memberId, activity_id: a.id, situation: sit.value.trim(), application: app.value.trim() || null, image_ref })
          .select('id, situation, application, image_ref, created_at').single();
        if (error) { if (image_ref) supabase.storage.from('member-media').remove([image_ref]); return toast(friendlyError(error), 'bad'); }
        if (picked) P.pics[image_ref] = picked.url;
        picked = null; P.notes.unshift(data); toast('Note saved'); draw();
      });
    } else {
      const q = f.querySelector('#pq');
      if (!err(q, q.value.trim().length < 3 ? 'Type your question.' : '')) return;
      await withBusy(btn, 'Sending…', async () => {
        const { data, error } = await supabase.from('doubts').insert({ member_id: memberId, activity_id: a.id, question: q.value.trim() })
          .select('id, question, answer, answered_at, created_at').single();
        if (error) return toast(friendlyError(error), 'bad');
        P.qs.unshift(data); toast('Question sent to your coach'); draw();
      });
    }
  });
}

// One sheet for a whole tracker (asked by the coach: "keep it common, not per point"):
// Learn = everything the coach added for this tracker (class materials + each point's audio/pictures, grouped),
// Real life = my notes for this tracker (optionally about one habit), Ask = my questions (same).
export async function openTrackerSheet(cat, acts, memberId, { color = 'var(--c-primary)' } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="dialog pt-sheet" role="dialog" aria-modal="true" aria-labelledby="ts-t" style="--tc:${color}">
    <div class="pt-head"><span class="pt-no">${icon('book-open')}</span><div><h2 id="ts-t">${esc(cat.name)}</h2><p>Notes, audio and questions for all ${acts.length} habits</p></div>
      <button class="iconbtn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="seg seg-3" role="tablist" aria-label="Section">
      <button role="tab" data-pt="learn" aria-selected="true">${icon('mic')}Learn</button>
      <button role="tab" data-pt="apply" aria-selected="false">${icon('sprout')}Real life</button>
      <button role="tab" data-pt="ask" aria-selected="false">${icon('message-square')}Ask</button></div>
    <div class="pt-body" id="ts-body"><div class="skeleton" style="height:120px"></div></div></div>`;
  document.body.appendChild(scrim);
  const body = scrim.querySelector('#ts-body');
  const close = () => { scrim.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  scrim.addEventListener('click', (e) => { if (e.target === scrim || e.target.closest('[data-close]')) close(); });

  const ids = acts.map((x) => x.id), byId = new Map(acts.map((x) => [x.id, x]));
  const inTracker = (r) => r.category_id === cat.id || (r.activity_id && byId.has(r.activity_id));
  const P = { tab: 'learn', media: [], notes: [], qs: [], urls: {}, pics: {} };
  const orIds = ids.length ? `,activity_id.in.(${ids.join(',')})` : '';
  const [m, n, q] = await Promise.all([
    supabase.from('activity_media').select('id, activity_id, category_id, kind, ref, caption, sort_order').or(`category_id.eq.${cat.id}${orIds}`).order('sort_order').order('created_at'),
    supabase.from('session_notes').select('id, activity_id, category_id, situation, application, image_ref, created_at').eq('member_id', memberId).or(`category_id.eq.${cat.id}${orIds}`).order('created_at', { ascending: false }),
    supabase.from('doubts').select('id, activity_id, category_id, question, answer, answered_at, created_at').eq('member_id', memberId).or(`category_id.eq.${cat.id}${orIds}`).order('created_at', { ascending: false })
  ]);
  if (m.error || n.error || q.error) { body.innerHTML = `<p class="muted">${esc(friendlyError(m.error || n.error || q.error))}</p>`; return; }
  P.media = m.data || []; P.notes = (n.data || []).filter(inTracker); P.qs = (q.data || []).filter(inTracker);
  [P.urls, P.pics] = await Promise.all([signedUrls(P.media.filter((x) => x.kind === 'image' || x.kind === 'audio' || x.kind === 'file').map((x) => x.ref)), memberPicUrls(P.notes.filter((x) => x.image_ref).map((x) => x.image_ref))]);
  let picked = null;
  const habitLabel = (r) => (r.activity_id && byId.get(r.activity_id) ? `${String(byId.get(r.activity_id).number).padStart(2, '0')} · ${byId.get(r.activity_id).default_name}` : '');
  const habitSelect = (id) => `<div class="field"><label for="${id}">About which habit? <span class="opt">(optional)</span></label>
    <select id="${id}"><option value="">Whole tracker</option>${acts.map((a) => `<option value="${a.id}">${String(a.number).padStart(2, '0')} · ${esc(a.default_name)}</option>`).join('')}</select></div>`;
  const tag = (r) => (habitLabel(r) ? `<small class="ts-habit">${icon('list-checks')}${esc(habitLabel(r))}</small>` : '');

  const draw = () => {
    scrim.querySelectorAll('[data-pt]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pt === P.tab)));
    if (P.tab === 'learn') {
      const general = P.media.filter((x) => x.category_id === cat.id);
      const groups = acts.map((a) => [a, P.media.filter((x) => x.activity_id === a.id)]).filter(([, l]) => l.length);
      body.innerHTML = (general.length || groups.length)
        ? `${general.length ? mediaHTML(general, P.urls) : ''}${groups.map(([a, l]) => `<section class="ts-group"><h3><span>${String(a.number).padStart(2, '0')}</span>${esc(a.default_name)}</h3>${mediaHTML(l, P.urls)}</section>`).join('')}`
        : `<div class="empty-state" style="padding:20px 8px"><span class="ic">${icon('mic')}</span><b>No notes yet</b><span>Your coach will add the audio, pictures and slides for this tracker here.</span></div>`;
    } else if (P.tab === 'apply') {
      body.innerHTML = `<form class="form ln-form" data-pf="note" novalidate>
        <p class="muted ln-help">A real situation where you used one of these habits.</p>
        <div class="field"><label for="tn-sit">Real life situation</label><textarea id="tn-sit" maxlength="1500" rows="3" placeholder="What happened?"></textarea><span class="err"></span></div>
        <div class="field"><label for="tn-app">How I applied it <span class="opt">(optional)</span></label><textarea id="tn-app" maxlength="1500" rows="2"></textarea></div>
        ${habitSelect('tn-habit')}
        <div class="pn-pic"><label class="btn btn-ghost btn-sm">${icon('image')}<span>${picked ? 'Picture added ✓' : 'Add a picture'}</span><input type="file" id="tn-file" accept="image/*" class="visually-hidden"></label>
          ${picked ? `<img src="${esc(picked.url)}" alt="" class="pn-thumb"><button type="button" class="lnk-del" data-unpick aria-label="Remove picture">${icon('x')}</button>` : ''}</div>
        <p class="lock-line">${icon('lock')}Only you and your coach can see this.</p>
        <button class="btn btn-primary" type="submit">Save note</button></form>
        ${P.notes.length ? `<div class="stack" style="gap:10px;margin-top:14px">${P.notes.map((x) => noteItemHTML(x, P.pics, { who: tag(x) })).join('')}</div>` : ''}`;
    } else {
      body.innerHTML = `<form class="form ln-form" data-pf="ask" novalidate>
        <div class="field"><label for="tq">Your question</label><textarea id="tq" maxlength="1000" rows="3" placeholder="Type your doubt"></textarea><span class="err"></span></div>
        ${habitSelect('tq-habit')}
        <p class="lock-line">${icon('lock')}Only you and your coach can see this.</p>
        <button class="btn btn-primary" type="submit">${icon('arrow-right')}Send question</button></form>
        ${P.qs.length ? `<div class="stack" style="gap:10px;margin-top:14px">${P.qs.map((x) => `<article class="ln-item q-item">${tag(x)}
          <div class="q-q"><span class="qa-ic">${icon('message-square')}</span><p>${esc(x.question)}</p></div>
          ${x.answered_at ? `<div class="q-a"><span class="qa-ic">${icon('check')}</span><div><small>Coach answered · ${esc(ago(x.answered_at))}</small><p>${esc(x.answer)}</p></div></div>` : `<div class="q-wait">${icon('hourglass')}Waiting for your coach's answer</div>`}
          <div class="ln-foot"><small>Asked ${esc(ago(x.created_at))}</small>${x.answered_at ? '' : `<button class="lnk-del" data-del-q="${x.id}" aria-label="Delete this question">${icon('x')}</button>`}</div></article>`).join('')}</div>` : ''}`;
    }
  };
  draw();

  scrim.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-pt]'); if (t) { P.tab = t.dataset.pt; return draw(); }
    if (e.target.closest('[data-unpick]')) { const keep = keepForm(); picked = null; draw(); return keep(); }
    const dn = e.target.closest('[data-del-note]'), dq = e.target.closest('[data-del-q]');
    if (dn || dq) {
      if (!(await confirmDialog({ title: dn ? 'Delete this note?' : 'Delete this question?', body: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
      const id = dn ? dn.dataset.delNote : dq.dataset.delQ;
      const { error } = await supabase.from(dn ? 'session_notes' : 'doubts').delete().eq('id', id);
      if (error) return toast(friendlyError(error), 'bad');
      if (dn) { const x = P.notes.find((y) => y.id === id); if (x?.image_ref) supabase.storage.from('member-media').remove([x.image_ref]); P.notes = P.notes.filter((y) => y.id !== id); }
      else P.qs = P.qs.filter((y) => y.id !== id);
      toast('Deleted'); draw();
    }
  });
  // keep what was typed when the form is redrawn (picture added / removed)
  const keepForm = () => {
    const v = ['#tn-sit', '#tn-app', '#tn-habit'].map((s) => scrim.querySelector(s)?.value);
    return () => ['#tn-sit', '#tn-app', '#tn-habit'].forEach((s, i) => { const el = scrim.querySelector(s); if (el && v[i] != null) el.value = v[i]; });
  };
  scrim.addEventListener('change', async (e) => {
    if (e.target.id !== 'tn-file') return;
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const keep = keepForm();
      const blob = await shrinkImage(f, 1280, 0.8);
      picked = { blob, url: URL.createObjectURL(blob) };
      draw(); keep();
    } catch (err) { toast(friendlyError(err), 'bad'); }
  });
  scrim.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('[type=submit]');
    const err = (input, msg) => { const fl = input.closest('.field'); fl.classList.toggle('invalid', !!msg); fl.querySelector('.err').textContent = msg || ''; if (msg) input.focus(); return !msg; };
    if (f.dataset.pf === 'note') {
      const sit = f.querySelector('#tn-sit'), app = f.querySelector('#tn-app'), hb = f.querySelector('#tn-habit').value || null;
      if (!err(sit, sit.value.trim().length < 2 ? 'Write the situation first.' : '')) return;
      await withBusy(btn, 'Saving…', async () => {
        let image_ref = null;
        if (picked) {
          image_ref = `${memberId}/${fileName('webp')}`;
          const up = await supabase.storage.from('member-media').upload(image_ref, picked.blob, { contentType: 'image/webp', upsert: false });
          if (up.error) { toast(friendlyError(up.error), 'bad'); return; }
        }
        const { data, error } = await supabase.from('session_notes').insert({ member_id: memberId, category_id: cat.id, activity_id: hb, situation: sit.value.trim(), application: app.value.trim() || null, image_ref })
          .select('id, activity_id, category_id, situation, application, image_ref, created_at').single();
        if (error) { if (image_ref) supabase.storage.from('member-media').remove([image_ref]); return toast(friendlyError(error), 'bad'); }
        if (picked) P.pics[image_ref] = picked.url;
        picked = null; P.notes.unshift(data); toast('Note saved'); draw();
      });
    } else {
      const q = f.querySelector('#tq'), hb = f.querySelector('#tq-habit').value || null;
      if (!err(q, q.value.trim().length < 3 ? 'Type your question.' : '')) return;
      await withBusy(btn, 'Sending…', async () => {
        const { data, error } = await supabase.from('doubts').insert({ member_id: memberId, category_id: cat.id, activity_id: hb, question: q.value.trim() })
          .select('id, activity_id, category_id, question, answer, answered_at, created_at').single();
        if (error) return toast(friendlyError(error), 'bad');
        P.qs.unshift(data); toast('Question sent to your coach'); draw();
      });
    }
  });
}
