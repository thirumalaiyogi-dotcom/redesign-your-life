// Little rewards when a habit is ticked: a soft two-note chime, a short buzz on Android,
// a pop on the card and "+10" floating up from the button. The sound can be turned off in Profile.
// The sound is made in the browser (no audio files to download).
const KEY = 'ryl.sound';
export const soundOn = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setSound = (on) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* ignore */ } };
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let ctx = null;
function chime(kind) {
  if (!soundOn()) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const notes = kind === 'done' ? [[880, 0], [1318.5, 0.09]] : kind === 'all' ? [[784, 0], [988, 0.09], [1318.5, 0.18], [1568, 0.27]] : [[392, 0]];
    const t0 = ctx.currentTime;
    for (const [f, at] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + at);
      g.gain.exponentialRampToValueAtTime(kind === 'miss' ? 0.08 : 0.16, t0 + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + (kind === 'all' ? 0.5 : 0.32));
      o.connect(g).connect(ctx.destination);
      o.start(t0 + at); o.stop(t0 + at + 0.55);
    }
  } catch { /* no sound on this phone: fine */ }
}
const buzz = (ms) => { try { if (soundOn()) navigator.vibrate?.(ms); } catch { /* ignore */ } };

// kind: 'done' | 'miss' | 'all' (every habit of the tracker done)
export function tickFx(btn, { kind = 'done', points = 0 } = {}) {
  chime(kind);
  buzz(kind === 'all' ? [20, 60, 30] : kind === 'done' ? 18 : 8);
  if (!btn || calm() || kind === 'miss') return;
  const r = btn.getBoundingClientRect();
  if (points) {
    const f = document.createElement('div');
    f.className = 'fx-plus'; f.textContent = `+${points}`;
    f.style.left = `${r.left + r.width / 2}px`; f.style.top = `${r.top}px`;
    document.body.appendChild(f); setTimeout(() => f.remove(), 900);
  }
  const n = kind === 'all' ? 16 : 8;
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i');
    d.className = 'fx-dot';
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4, dist = (kind === 'all' ? 46 : 28) + Math.random() * 14;
    d.style.left = `${r.left + r.width / 2}px`; d.style.top = `${r.top + r.height / 2}px`;
    d.style.setProperty('--dx', `${Math.cos(ang) * dist}px`); d.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
    d.style.setProperty('--c', ['#2f9a68', '#e6c98c', '#f4c542', '#5b8cf0'][i % 4]);
    document.body.appendChild(d); setTimeout(() => d.remove(), 650);
  }
}
