// Home: a band of short motivating lines that slides by itself (and can be swiped).
// Sample lines for now; the coach can later send his own list.
const QUOTES = [
  { t: 'Small habits, done daily, make a 10X life.', s: 'Get 1% better today' },
  { t: 'Repetition is the mother of skill.', s: 'Do it again tomorrow' },
  { t: 'உள்ளுவது எல்லாம் உயர்வுள்ளல்', s: 'Think only of rising high · Thirukkural 596' },
  { t: 'Your thoughts are magnets. Choose what you attract.', s: 'Law of Attraction' },
  { t: 'Success is 95% mindset and 5% strategy.', s: 'Work on the inside first' },
  { t: 'தெய்வத்தான் ஆகா தெனினும் முயற்சிதன் மெய்வருத்தக் கூலி தரும்', s: 'Effort always pays · Thirukkural 619' },
  { t: "Don't break the chain. One tick keeps your streak alive.", s: 'Your streak is your promise to yourself' },
  { t: 'Respect money, and money will respect you.', s: 'Psychology of Money' },
  { t: 'Be the Captain Cool of your own life.', s: 'Calm mind, clear choices' },
  { t: 'Idea + Action = Success.', s: 'Act on one idea today' }
];

let timer = 0;

export function quotesHTML() {
  // start from a different line each day
  const day = Math.floor(Date.now() / 864e5);
  const list = QUOTES.map((_, i) => QUOTES[(i + day) % QUOTES.length]);
  return `<section class="qband" aria-roledescription="carousel" aria-label="Words for today">
    <div class="qb-track" tabindex="0">${list.map((q, i) => `<figure class="qb-slide" aria-roledescription="slide" aria-label="${i + 1} of ${list.length}">
      <span class="qb-mark" aria-hidden="true">“</span><blockquote>${esc(q.t)}</blockquote><figcaption>${esc(q.s)}</figcaption></figure>`).join('')}</div>
    <div class="qb-dots" aria-hidden="true">${list.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div></section>`;
}

export function startQuotes(root) {
  clearInterval(timer);
  const track = root?.querySelector('.qb-track'); if (!track) return;
  const dots = [...root.querySelectorAll('.qb-dots i')];
  const n = track.children.length;
  const idx = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  let paused = false, rest = 0;
  track.addEventListener('scroll', () => { const k = idx(); dots.forEach((d, i) => d.classList.toggle('on', i === k)); }, { passive: true });
  const hold = () => { paused = true; clearTimeout(rest); rest = setTimeout(() => { paused = false; }, 8000); };
  ['pointerdown', 'touchstart', 'focusin'].forEach((ev) => track.addEventListener(ev, hold, { passive: true }));
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  timer = setInterval(() => {
    if (paused || document.hidden || !track.isConnected) { if (!track.isConnected) clearInterval(timer); return; }
    const next = (idx() + 1) % n;
    track.scrollTo({ left: next * track.clientWidth, behavior: next ? 'smooth' : 'auto' });
  }, 5000);
}

function esc(v) { return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
