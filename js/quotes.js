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

let timer = 0;   // one band on the page at a time

export function quotesHTML() {
  // start from a different line each day
  const day = Math.floor(Date.now() / 864e5);
  const list = QUOTES.map((_, i) => QUOTES[(i + day) % QUOTES.length]);
  return `<section class="qband" aria-roledescription="carousel" aria-label="Words for today">
    <div class="qb-track" tabindex="0">${list.map((q, i) => `<figure class="qb-slide" aria-roledescription="slide" aria-label="${i + 1} of ${list.length}">
      <span class="qb-mark" aria-hidden="true">“</span><blockquote>${esc(q.t)}</blockquote><figcaption>${esc(q.s)}</figcaption></figure>`).join('')}</div>
    <div class="qb-dots" aria-hidden="true">${list.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div></section>`;
}

// Each line stays long enough to read (longer lines stay longer), then moves on by itself.
// The gold dot fills up while the line is shown, so people see the next one is coming.
const readMs = (text) => Math.min(11000, Math.max(4500, 2500 + String(text).length * 70));

export function startQuotes(root) {
  clearTimeout(timer);
  const track = root?.querySelector('.qb-track'); if (!track) return;
  const dots = [...root.querySelectorAll('.qb-dots i')];
  const slides = [...track.children], n = slides.length;
  const idx = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = -1;
  const schedule = (k, delay) => {
    clearTimeout(timer);
    if (!track.isConnected) return;
    const ms = delay ?? readMs(slides[k].querySelector('blockquote').textContent);
    dots.forEach((d, i) => { d.classList.toggle('on', i === k); d.style.setProperty('--qt', i === k ? `${ms}ms` : '0ms'); d.classList.remove('run'); });
    void dots[k]?.offsetWidth; dots[k]?.classList.add('run');
    timer = setTimeout(() => {
      if (!track.isConnected) return;
      if (document.hidden) return schedule(k, 2000);
      const next = (k + 1) % n;
      track.scrollTo({ left: next * track.clientWidth, behavior: next && !reduce ? 'smooth' : 'auto' });
    }, ms);
  };
  let settle = 0;
  track.addEventListener('scroll', () => {
    clearTimeout(settle);
    settle = setTimeout(() => { const k = idx(); if (k !== shown) { shown = k; schedule(k); } }, 120);
  }, { passive: true });
  // a finger on the line: stop and let them read; carry on 6 s after they let go
  track.addEventListener('pointerdown', () => { clearTimeout(timer); dots.forEach((d) => d.classList.remove('run')); }, { passive: true });
  ['pointerup', 'pointercancel'].forEach((ev) => track.addEventListener(ev, () => schedule(idx(), 6000), { passive: true }));
  shown = 0; schedule(0);
}

function esc(v) { return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
