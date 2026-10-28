// Starfield behind the hero: twinkling dust with pointer parallax and a rare shooting star.
// Desktop only (same gate as 3D), capped at 30 fps, paused off-screen and in hidden tabs.
const COUNT = 140;
const FRAME_MS = 1000 / 30;
const TINTS = ['236, 239, 243', '125, 217, 226', '178, 166, 255'];

export function initStars(host) {
  if (!host) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'hero__stars';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  // Pre-rendered glow sprite for the brighter stars.
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 32;
  const sctx = sprite.getContext('2d');
  const g = sctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(190,240,245,.55)');
  g.addColorStop(1, 'rgba(190,240,245,0)');
  sctx.fillStyle = g;
  sctx.fillRect(0, 0, 32, 32);

  const stars = Array.from({ length: COUNT }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: 0.2 + Math.random() * 0.8,
    r: 0.4 + Math.random() * 1.1,
    tw: 0.6 + Math.random() * 1.8,
    ph: Math.random() * Math.PI * 2,
    tint: TINTS[Math.random() < 0.7 ? 0 : Math.random() < 0.6 ? 1 : 2],
    glow: Math.random() < 0.12,
  }));

  let w = 0;
  let h = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = host.clientWidth;
    h = host.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  new ResizeObserver(resize).observe(host);

  const pointer = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX / window.innerWidth - 0.5;
    pointer.y = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  // Two satellites: slow steady lights on long straight paths, with a brief solar glint.
  const sats = [
    { x0: -0.05, y0: 0.18, x1: 1.05, y1: 0.42, period: 52, phase: 0.1, glint: 0.62 },
    { x0: 1.05, y0: 0.08, x1: -0.05, y1: 0.3, period: 71, phase: 0.55, glint: 0.38 },
  ];
  let meteor = null;
  let nextMeteor = performance.now() + 4000;
  let visible = true;
  let raf = 0;
  let last = 0;

  const draw = (now) => {
    raf = 0;
    if (!visible || document.hidden || document.documentElement.classList.contains('is-locked')) return;
    raf = requestAnimationFrame(draw);
    if (now - last < FRAME_MS) return;
    last = now;
    const t = now / 1000;
    look.x += (pointer.x - look.x) * 0.06;
    look.y += (pointer.y - look.y) * 0.06;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const px = ((s.x + t * 0.002 * s.z) % 1) * w - look.x * 26 * s.z;
      const py = s.y * h - look.y * 18 * s.z;
      const a = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph))) * s.z;
      if (s.glow) {
        const size = 10 * s.z + 4;
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, px - size / 2, py - size / 2, size, size);
        ctx.globalAlpha = 1;
      } else {
        // one cached colour string per star and a numeric alpha: no new strings every frame
        ctx.globalAlpha = a;
        ctx.fillStyle = s.fill || (s.fill = `rgb(${s.tint})`);
        ctx.fillRect(px, py, s.r, s.r);
        ctx.globalAlpha = 1;
      }
    }
    for (const s of sats) {
      const k = ((t / s.period) + s.phase) % 1;
      const px = (s.x0 + (s.x1 - s.x0) * k) * w - look.x * 30;
      const py = (s.y0 + (s.y1 - s.y0) * k) * h - look.y * 20;
      const glint = Math.max(0, 1 - Math.abs(k - s.glint) / 0.012);
      ctx.globalAlpha = 0.75 + glint * 0.25;
      const size = 5 + glint * 18;
      ctx.drawImage(sprite, px - size / 2, py - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
    if (!meteor && now > nextMeteor) {
      meteor = { x: w * (0.2 + Math.random() * 0.7), y: h * Math.random() * 0.35, born: now };
    }
    if (meteor) {
      const k = (now - meteor.born) / 900;
      if (k >= 1) {
        meteor = null;
        nextMeteor = now + 6000 + Math.random() * 6000;
      } else {
        const len = 140;
        const hx = meteor.x - k * 260;
        const hy = meteor.y + k * 120;
        const grad = ctx.createLinearGradient(hx, hy, hx + len, hy - len * 0.46);
        grad.addColorStop(0, `rgba(236, 249, 250, ${0.9 * (1 - k)})`);
        grad.addColorStop(1, 'rgba(125, 217, 226, 0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + len, hy - len * 0.46);
        ctx.stroke();
      }
    }
  };
  const start = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(draw); };

  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting;
    start();
  }).observe(host);
  document.addEventListener('visibilitychange', start);
  document.addEventListener('xl:ui', start);
  start();
  requestAnimationFrame(() => canvas.classList.add('is-on'));
}
