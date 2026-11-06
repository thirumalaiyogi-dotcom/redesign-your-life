// Ambient "stadium at night" background: light rays, horizon glow, rising embers.
export function stadium(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, parts = [], raf = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function size() {
    const r = canvas.getBoundingClientRect();
    w = canvas.width = Math.max(1, r.width * dpr);
    h = canvas.height = Math.max(1, r.height * dpr);
    parts = Array.from({ length: 50 }, () => ({ x: Math.random() * w, y: Math.random() * h, v: .2 + Math.random() * .6, r: (Math.random() * 1.6 + .4) * dpr, a: Math.random() * 6 }));
  }
  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1433'); g.addColorStop(.6, '#0b1633'); g.addColorStop(1, '#1c1a2a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * .5, h * 1.05, 0, w * .5, h * 1.05, h * .9);
    glow.addColorStop(0, 'rgba(240,170,70,.55)'); glow.addColorStop(.4, 'rgba(217,140,60,.18)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);
    for (const px of [.12, .88]) for (let i = 0; i < 5; i++) {
      const spread = (i - 2) * w * .09;
      ctx.beginPath(); ctx.moveTo(w * px, -h * .05);
      ctx.lineTo(w * .5 + spread - w * .05, h); ctx.lineTo(w * .5 + spread + w * .05, h); ctx.closePath();
      ctx.fillStyle = 'rgba(246,224,160,.025)'; ctx.fill();
    }
    ctx.fillStyle = 'rgba(5,9,22,.9)'; ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 40) ctx.lineTo(x, h * .86 - Math.sin(x / w * Math.PI) * h * .06);
    ctx.lineTo(w, h); ctx.fill();
    for (const p of parts) {
      p.y -= p.v * dpr; p.a += .02; if (p.y < 0) { p.y = h; p.x = Math.random() * w; }
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7);
      ctx.fillStyle = `rgba(246,214,140,${.25 + Math.sin(p.a) * .25})`; ctx.fill();
    }
    if (!reduce && !document.hidden) raf = requestAnimationFrame(draw);
  }
  size(); draw();
  addEventListener('resize', () => { cancelAnimationFrame(raf); size(); draw(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !reduce) { cancelAnimationFrame(raf); draw(); } });
}
