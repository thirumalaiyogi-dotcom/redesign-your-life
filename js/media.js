// Shared helpers for session media (member + coach pages).
// Pictures and audio sit in the private "session-media" bucket and are shown through short-lived signed links.
import { supabase } from './supabase.js';
import { esc, icon } from './ui.js';

export const BUCKET = 'session-media';

// YouTube id from the usual link shapes, or null
export function youtubeId(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\.|^m\./, '');
    if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
      return m ? m[2] : null;
    }
  } catch { /* not a URL */ }
  return null;
}
export const isHttps = (s) => /^https:\/\/[^\s/$.?#][^\s]*$/i.test(String(s || '').trim());

// { path: signedUrl } for the given storage paths (missing ones are left out)
export async function signedUrls(paths) {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6);
  if (error) return {};
  return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
}

// Session media → HTML. urls = map from signedUrls().
export function mediaHTML(media, urls) {
  const imgs = media.filter((m) => m.kind === 'image'), auds = media.filter((m) => m.kind === 'audio');
  const links = media.filter((m) => m.kind === 'video_link' || m.kind === 'link');
  const files = media.filter((m) => m.kind === 'file');
  let h = '';
  if (files.length) h += `<div class="sm-links">${files.map((m) => urls[m.ref]
    ? `<a class="sm-link" href="${esc(urls[m.ref])}" target="_blank" rel="noopener"><span class="si">${icon('book-open')}</span>
        <span class="tx"><b>${esc(m.caption || 'Class slides')}</b><small>PDF · opens in a new tab</small></span>${icon('arrow-right')}</a>`
    : `<span class="sm-link"><span class="si">${icon('book-open')}</span><span class="tx"><b>${esc(m.caption || 'Class slides')}</b><small>Not available</small></span></span>`).join('')}</div>`;
  if (imgs.length) h += `<div class="sm-imgs">${imgs.map((m) => urls[m.ref]
    ? `<a href="${esc(urls[m.ref])}" target="_blank" rel="noopener" class="sm-img"><img src="${esc(urls[m.ref])}" alt="${esc(m.caption || 'Session picture')}" loading="lazy">${m.caption ? `<span>${esc(m.caption)}</span>` : ''}</a>`
    : `<span class="sm-img missing">${icon('image')}</span>`).join('')}</div>`;
  if (auds.length) h += `<div class="sm-auds">${auds.map((m) => `<div class="sm-aud"><span class="si">${icon('mic')}</span>
      <div><b>${esc(m.caption || 'Audio instructions')}</b>${urls[m.ref] ? `<audio controls preload="none" src="${esc(urls[m.ref])}"></audio>` : '<small class="muted">Audio not available</small>'}</div></div>`).join('')}</div>`;
  if (links.length) h += `<div class="sm-links">${links.map((m) => {
    const yt = youtubeId(m.ref);
    let host = ''; try { host = new URL(m.ref).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    return `<a class="sm-link" href="${esc(m.ref)}" target="_blank" rel="noopener noreferrer">
      ${yt ? `<span class="th"><img src="https://i.ytimg.com/vi/${esc(yt)}/mqdefault.jpg" alt="" loading="lazy"><i>${icon('play')}</i></span>` : `<span class="si">${icon(m.kind === 'video_link' ? 'play' : 'newspaper')}</span>`}
      <span class="tx"><b>${esc(m.caption || (yt ? 'Watch video' : 'Open link'))}</b><small>${esc(host)}</small></span>${icon('arrow-right')}</a>`;
  }).join('')}</div>`;
  return h;
}

// Shrink a picture before upload (keeps data use low on mobile): longest side <= max, WebP.
export async function shrinkImage(file, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('This file is not a picture we can read.');
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((res) => c.toBlob(res, 'image/webp', quality));
  if (!blob) throw new Error('Could not prepare the picture.');
  return blob;
}

// Square avatar crop (centre), 256px WebP
export async function avatarBlob(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error('This file is not a picture we can read.');
  const s = Math.min(bmp.width, bmp.height), size = 256;
  const c = document.createElement('canvas'); c.width = c.height = size;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close?.();
  const blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.85));
  if (!blob) throw new Error('Could not prepare the picture.');
  return blob;
}

export const fileName = (ext) => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
