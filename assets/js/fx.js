import { reduceMotion, finePointer, isMobile, clamp } from './env.js';

const root = document.documentElement;
const desktopFx = () => finePointer.matches && !reduceMotion.matches;

/* ---------- preloader ----------
   Sparks converge, the X draws itself, the comet sets off and draws its orbit behind it. On exit the
   mark fades where it stands while the comet keeps flying: it leaves the orbit with its own speed
   and direction, curves into the header logo, and the site appears as it arrives. */
let resolvePreloader;
export const preloaderDone = new Promise((r) => { resolvePreloader = r; });

const GHOST_LAG = 35; // ms between the dots that form the orbiting comet's tail (main.css, .pl-x)
const TRAIL = 18; // dots in the flying comet
const TRAIL_STEP = 9; // ms between them: at speed the tail stretches, like a real comet's
const DOT = 12; // px, the comet head's own size (.pl-y i, .comet-trail__dot)

function initPreloader() {
  const pl = document.getElementById('preloader');
  if (!pl || root.classList.contains('pl-skip')) { resolvePreloader(); return; }
  const header = document.querySelector('.header[data-intro]');
  // Long enough to see the X draw and the comet close its orbit (lap ends at 3.3 s, main.css);
  // never longer than MAX. The page (and LCP) is painted underneath, so this only shapes the reveal.
  const MIN = reduceMotion.matches ? 600 : 3600;
  const MAX = 5000;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    pl.classList.add('is-leaving');
    const flight = launchFromOrbit(pl, header);
    if (!flight) {
      pl.classList.add('is-revealing');
      setTimeout(resolvePreloader, 300);
      setTimeout(() => pl.remove(), 1200);
      return;
    }
    // The veil starts to lift while the comet is on its way, so the site is there when it lands.
    setTimeout(() => pl.classList.add('is-revealing'), flight.duration * 0.66);
    flight.landed.then(() => {
      resolvePreloader();
      landedOnLogo(header);
      setTimeout(() => pl.remove(), 1000);
    });
  };
  setTimeout(finish, Math.max(0, MAX - performance.now()));
  const onLoad = () => setTimeout(finish, Math.max(0, MIN - performance.now()));
  if (document.readyState === 'complete') onLoad();
  else window.addEventListener('load', onLoad, { once: true });
}

const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// Reads where the orbiting comet is right now (its head and the ghosts of its tail) and hands it
// over to a flying copy at exactly those points, with the speed and direction it had on the orbit.
function launchFromOrbit(pl, header) {
  const sat = header && header.querySelector('.logo__sat');
  const comet = pl.querySelector('.preloader__comet');
  const dots = comet ? [...comet.querySelectorAll('i')] : [];
  if (reduceMotion.matches || !sat || dots.length < 2 || !('animate' in Element.prototype)) return null;
  const samples = dots.map((d) => {
    const cs = getComputedStyle(d);
    const m = /matrix\(([-\d.e]+)/.exec(cs.transform);
    const depth = parseFloat(getComputedStyle(d.parentElement).opacity); // dimmer behind the X
    return {
      ...center(d.getBoundingClientRect()),
      size: DOT * (m ? parseFloat(m[1]) : 1),
      opacity: (parseFloat(cs.opacity) || 1) * (Number.isNaN(depth) ? 1 : depth),
    };
  });
  const head = samples[0];
  const t = sat.getBoundingClientRect();
  if (!t.width || !head.x) return null;
  const v = { x: (head.x - samples[1].x) * 1000 / GHOST_LAG, y: (head.y - samples[1].y) * 1000 / GHOST_LAG };
  // trail dots between the measured ghosts are interpolated
  const at = (ms) => {
    const f = Math.min(samples.length - 1, ms / GHOST_LAG);
    const i = Math.min(samples.length - 2, Math.floor(f));
    const k = f - i;
    const a = samples[i];
    const b = samples[i + 1];
    const mix = (p) => a[p] + (b[p] - a[p]) * k;
    return { x: mix('x'), y: mix('y'), size: mix('size'), opacity: mix('opacity') };
  };
  const trail = Array.from({ length: TRAIL }, (_, i) => ({ lag: i * TRAIL_STEP, ...at(i * TRAIL_STEP) }));
  header.classList.add('awaits-comet');
  comet.style.visibility = 'hidden';
  return flyTrail(trail, v, center(t), t.width);
}

// The flight: a cubic curve that starts along v and ends heading left into the target. Its timing
// is a Hermite curve, so the comet leaves at the speed it already had, accelerates and settles
// softly — no stop at the hand-over, no jump at the end. Every dot repeats the head's path a few ms
// later, which draws the tail. All motion is WAAPI transform/opacity, on the compositor.
function flyTrail(trail, v, T, targetSize) {
  const S = trail[0];
  const dist = Math.hypot(T.x - S.x, T.y - S.y) || 1;
  const speed = Math.hypot(v.x, v.y);
  const dir = speed > 1 ? { x: v.x / speed, y: v.y / speed } : { x: 0, y: -1 };
  const duration = Math.round(clamp(dist * 1.7, 1150, 1750));
  const L = dist * 0.42;
  const P1 = { x: S.x + dir.x * L, y: S.y + dir.y * L };
  const P2 = { x: T.x + dist * 0.36, y: T.y + dist * 0.06 };
  const m0 = clamp((speed * duration / 1000) / (3 * L), 0.04, 2.4);
  const m1 = 0.5;
  const time = (s) => (-2 * s ** 3 + 3 * s ** 2) + (s ** 3 - 2 * s ** 2 + s) * m0 + (s ** 3 - s ** 2) * m1;
  const N = 44;
  const path = [];
  for (let i = 0; i <= N; i++) {
    const k = clamp(time(i / N));
    const u = 1 - k;
    path.push({
      p: i / N,
      x: u * u * u * S.x + 3 * u * u * k * P1.x + 3 * u * k * k * P2.x + k * k * k * T.x,
      y: u * u * u * S.y + 3 * u * u * k * P1.y + 3 * u * k * k * P2.y + k * k * k * T.y,
    });
  }
  const end = targetSize / DOT;
  const layer = document.createElement('div');
  layer.className = 'comet-trail';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);

  let land;
  const landed = new Promise((r) => { land = r; });
  trail.forEach((g, i) => {
    const dot = document.createElement('i');
    dot.className = 'comet-trail__dot';
    layer.append(dot);
    const total = duration + g.lag;
    const s0 = g.size / DOT;
    const s1 = end * (g.size / S.size);
    const frames = [{ offset: 0, transform: `translate(${g.x.toFixed(1)}px, ${g.y.toFixed(1)}px) scale(${s0.toFixed(3)})`, opacity: g.opacity }];
    path.forEach((pt) => {
      const sc = s0 + (s1 - s0) * pt.p;
      frames.push({
        offset: (g.lag + pt.p * duration) / total,
        transform: `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) scale(${sc.toFixed(3)})`,
        opacity: pt.p >= 1 ? 0 : g.opacity,
      });
    });
    const anim = dot.animate(frames, { duration: total, easing: 'linear', fill: 'forwards' });
    if (i === 0) anim.finished.then(() => land(), () => land());
  });
  setTimeout(() => land(), duration + 500); // a throttled tab must not keep the veil forever
  landed.then(() => setTimeout(() => layer.remove(), TRAIL * TRAIL_STEP + 300));
  return { duration, landed };
}

// The comet becomes the logo's satellite: a flash, then it settles.
function landedOnLogo(header) {
  if (!header) return;
  const logo = header.querySelector('.logo');
  header.classList.remove('awaits-comet');
  if (!logo) return;
  logo.classList.add('is-landed');
  setTimeout(() => logo.classList.remove('is-landed'), 1300);
}

// A sent request takes off from the submit button and flies to the logo — «delivered».
document.addEventListener('xl:lead-sent', (e) => {
  const btn = e.detail && e.detail.from;
  const header = document.querySelector('.header');
  const sat = header && header.querySelector('.logo__sat');
  if (!btn || !sat || reduceMotion.matches || !('animate' in Element.prototype)) return;
  const r = btn.getBoundingClientRect();
  const t = sat.getBoundingClientRect();
  if (!t.width) return;
  const S = { x: r.left + r.width * 0.82, y: r.top + r.height / 2 };
  const trail = Array.from({ length: TRAIL }, (_, i) => ({
    lag: i * TRAIL_STEP, x: S.x, y: S.y, size: DOT * (1 - (i / TRAIL) * 0.7), opacity: 1 - i / TRAIL,
  }));
  header.classList.add('awaits-comet');
  flyTrail(trail, { x: 160, y: -420 }, center(t), t.width).landed.then(() => landedOnLogo(header));
});

/* ---------- split text ---------- */
const CHAR_STEP = 18; // ms between letters — the caret runs at the same pace
const MAX_STAGGER = 90;

export function splitText(el, text = el.textContent) {
  const clean = text.replace(/\s+/g, ' ').trim();
  el.dataset.splitText = clean;
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = clean;
  const frag = document.createDocumentFragment();
  frag.append(sr);
  let i = 0;
  clean.split(' ').forEach((word, wi, arr) => {
    const w = document.createElement('span');
    w.className = 'split-w';
    w.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const c = document.createElement('span');
      c.className = 'split-c';
      c.textContent = ch;
      c.style.setProperty('--i', String(Math.min(i++, MAX_STAGGER)));
      w.append(c);
    }
    frag.append(w);
    if (wi < arr.length - 1) frag.append(' ');
  });
  el.replaceChildren(frag);
  el.classList.add('is-split');
}

// Word-level variant for paragraphs: words fade in one after another like typed text.
export function splitWords(el, text = el.textContent) {
  const clean = text.replace(/\s+/g, ' ').trim();
  el.dataset.splitText = clean;
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = clean;
  const frag = document.createDocumentFragment();
  frag.append(sr);
  clean.split(' ').forEach((word, i, arr) => {
    const w = document.createElement('span');
    w.className = 'tw';
    w.setAttribute('aria-hidden', 'true');
    w.textContent = word;
    w.style.setProperty('--i', String(Math.min(i, 60)));
    frag.append(w);
    if (i < arr.length - 1) frag.append(' ');
  });
  el.replaceChildren(frag);
  el.classList.add('is-split');
}

export function setSplitText(el, text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (el.dataset.splitText === clean) return;
  if (!el.classList.contains('is-split')) { el.textContent = clean; return; }
  if (el.hasAttribute('data-type')) splitWords(el, clean);
  else splitText(el, clean);
}

// Reveals a split heading letter by letter with a caret running ahead of the text.
function typeIn(el) {
  if (!el || el.classList.contains('is-in')) return;
  el.classList.add('is-in');
  const chars = [...el.querySelectorAll('.split-c')];
  if (reduceMotion.matches || !chars.length) return;
  const caret = document.createElement('span');
  caret.className = 'type-caret';
  caret.setAttribute('aria-hidden', 'true');
  el.append(caret);
  const start = performance.now();
  const place = (ch) => {
    caret.style.height = `${ch.offsetHeight}px`;
    caret.style.transform = `translate(${ch.offsetLeft + ch.offsetWidth + 2}px, ${ch.offsetTop}px)`;
  };
  const tick = (now) => {
    // rAF timestamps can precede `start` (frame time), so clamp at the first letter.
    const step = Math.max(0, Math.floor((now - start) / CHAR_STEP));
    const i = Math.min(chars.length - 1, step >= MAX_STAGGER ? chars.length - 1 : step);
    place(chars[i]);
    if (i < chars.length - 1) {
      requestAnimationFrame(tick);
      return;
    }
    caret.classList.add('is-blink');
    setTimeout(() => {
      caret.classList.add('is-out');
      setTimeout(() => caret.remove(), 450);
    }, 1500);
  };
  place(chars[0]);
  requestAnimationFrame(tick);
}

function initSplit() {
  document.querySelectorAll('[data-split]').forEach((el) => splitText(el));
  document.querySelectorAll('[data-type]').forEach((el) => splitWords(el));
  // The hero is choreographed by initIntro(); everything else types in on scroll.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      if (en.target.hasAttribute('data-split')) typeIn(en.target);
      else en.target.classList.add('is-in');
      io.unobserve(en.target);
    });
  }, { threshold: 0.35 });
  document.querySelectorAll('[data-split], [data-type]').forEach((el) => {
    if (!el.closest('.hero')) io.observe(el);
  });
}

/* ---------- intro: header slides down and assembles, then the hero types itself ---------- */
function initIntro() {
  const header = document.querySelector('.header[data-intro]');
  if (header) {
    const word = header.querySelector('.logo__word');
    if (word) {
      const letters = [...word.textContent.trim()].map((ch, i) => {
        const s = document.createElement('span');
        s.className = 'lw';
        s.textContent = ch;
        s.style.setProperty('--i', String(i));
        return s;
      });
      word.replaceChildren(...letters);
    }
    header.querySelectorAll('.nav__link, .header__phone, .header__cta, .burger').forEach((el, i) => {
      el.style.setProperty('--hd', `${380 + i * 70}ms`);
    });
  }
  const items = [...document.querySelectorAll('[data-intro-item]')];
  items.forEach((el) => el.style.setProperty('--d', `${Number(el.dataset.introItem) || 0}ms`));
  const h1 = document.querySelector('.hero [data-split]');
  const lead = document.querySelector('.hero [data-type]');

  preloaderDone.then(() => {
    header?.classList.add('is-in');
    items.forEach((el) => el.classList.add('is-in'));
    setTimeout(() => typeIn(h1), reduceMotion.matches ? 0 : 320);
    setTimeout(() => lead?.classList.add('is-in'), reduceMotion.matches ? 0 : 800);
  });
}

/* ---------- reveal on scroll: blocks assemble, then become «built» ---------- */
const BUILD_MS = 1700; // longest reveal chain (outline + fill + content stagger)

const revealIO = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    const el = en.target;
    el.classList.add('is-revealed');
    revealIO.unobserve(el);
    // Drop the stagger delays afterwards so hover effects (tilt, shadows) react instantly.
    const d = parseFloat(el.style.getPropertyValue('--d')) || 0;
    setTimeout(() => el.classList.add('is-built'), d + BUILD_MS);
  });
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

export function observeReveal(scope = document) {
  scope.querySelectorAll('[data-reveal]:not(.is-revealed)').forEach((el) => {
    const siblings = [...el.parentElement.children];
    el.style.setProperty('--d', `${(siblings.indexOf(el) % 4) * 110}ms`);
    [...el.children].forEach((child, i) => child.style.setProperty('--ci', String(i)));
    if (reduceMotion.matches) {
      el.classList.add('is-revealed', 'is-built');
      return;
    }
    revealIO.observe(el);
  });
}

/* ---------- pointer effects (one rAF loop) ---------- */
const pointer = { x: -100, y: -100, target: null, moved: false };
let rafId = 0;

function schedule() {
  if (!rafId) rafId = requestAnimationFrame(frame);
}

let magnet = null;
let tilt = null;
// Rects are read once when the pointer enters an element (and again after scroll/resize),
// not on every pointer frame: no layout reads interleaved with the custom-property writes.
let magnetBox = null;
let tiltBox = null;
const cursor = { el: null, dot: null, follow: null, label: null, rx: -100, ry: -100, state: '' };

function frame(now) {
  rafId = 0;
  if (pointer.moved) {
    pointer.moved = false;
    updateMagnet();
    updateTilt();
    updateCursorState();
  }
  const tilting = stepTilts(now);
  if ((cursor.el && moveCursor()) || tilting) schedule();
}

function updateMagnet() {
  const el = pointer.target && pointer.target.closest('[data-magnetic]');
  if (el !== magnet) {
    if (magnet) {
      magnet.classList.remove('is-magnet');
      magnet.style.setProperty('--mx', '0px');
      magnet.style.setProperty('--my', '0px');
    }
    magnet = el;
    magnetBox = null;
    if (magnet) magnet.classList.add('is-magnet');
  }
  if (!magnet) return;
  if (!magnetBox) {
    const r = magnet.getBoundingClientRect();
    const ox = parseFloat(magnet.style.getPropertyValue('--mx')) || 0;
    const oy = parseFloat(magnet.style.getPropertyValue('--my')) || 0;
    magnetBox = { cx: r.left - ox + r.width / 2, cy: r.top - oy + r.height / 2, hw: r.width / 2, hh: r.height / 2 };
  }
  const dx = clamp((pointer.x - magnetBox.cx) / magnetBox.hw, -1, 1) * 8;
  const dy = clamp((pointer.y - magnetBox.cy) / magnetBox.hh, -1, 1) * 8;
  magnet.style.setProperty('--mx', `${dx.toFixed(2)}px`);
  magnet.style.setProperty('--my', `${dy.toFixed(2)}px`);
}

// Tilt targets come from the pointer; the angles glide towards them every frame (critically damped),
// so a card never snaps — not when the cursor leaves, not when it jumps across.
const tilts = new Map(); // element → { rx, ry, tx, ty }

function updateTilt() {
  const el = pointer.target && pointer.target.closest('[data-tilt]');
  if (el !== tilt) {
    if (tilt) {
      tilt.classList.remove('is-tilting');
      const st = tilts.get(tilt);
      if (st) { st.tx = 0; st.ty = 0; }
    }
    tilt = el;
    tiltBox = null;
    if (tilt) {
      tilt.classList.add('is-tilting');
      if (!tilts.has(tilt)) tilts.set(tilt, { rx: 0, ry: 0, tx: 0, ty: 0 });
    }
  }
  if (!tilt) return;
  if (!tiltBox) {
    const r = tilt.getBoundingClientRect();
    tiltBox = { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  const px = clamp((pointer.x - tiltBox.left) / tiltBox.width);
  const py = clamp((pointer.y - tiltBox.top) / tiltBox.height);
  const st = tilts.get(tilt);
  st.ty = (px - 0.5) * 14;
  st.tx = (0.5 - py) * 14;
  tilt.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
  tilt.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
}

let tiltLast = 0;
function stepTilts(now) {
  const dt = Math.min(0.05, tiltLast ? (now - tiltLast) / 1000 : 0.016);
  tiltLast = now;
  const k = 1 - Math.exp(-dt * 7);
  let moving = false;
  for (const [el, st] of tilts) {
    st.rx += (st.tx - st.rx) * k;
    st.ry += (st.ty - st.ry) * k;
    const done = Math.abs(st.tx - st.rx) < 0.01 && Math.abs(st.ty - st.ry) < 0.01;
    if (done) { st.rx = st.tx; st.ry = st.ty; } else moving = true;
    el.style.setProperty('--rx', `${st.rx.toFixed(3)}deg`);
    el.style.setProperty('--ry', `${st.ry.toFixed(3)}deg`);
    if (done && st.tx === 0 && st.ty === 0 && el !== tilt) tilts.delete(el);
  }
  if (!moving) tiltLast = 0;
  return moving;
}

function updateCursorState() {
  if (!cursor.el) return;
  const t = pointer.target;
  let state = '';
  let label = '';
  if (t && t.closest('input, textarea, select, [contenteditable]')) state = 'is-text';
  else if (t && t.closest('[data-cursor-label]')) {
    state = 'is-label';
    label = t.closest('[data-cursor-label]').dataset.cursorLabel;
  } else if (t && t.closest('a, button, summary, label, [role="tab"]')) state = 'is-hover';
  else if (t && t.closest('h1, h2')) state = 'is-heading';
  cursor.el.classList.toggle('on-dark', Boolean(t && t.closest('[data-theme="dark"], [data-header="dark"]')));
  if (state !== cursor.state) {
    if (cursor.state) cursor.el.classList.remove(cursor.state);
    if (state) cursor.el.classList.add(state);
    cursor.state = state;
  }
  if (label && cursor.label.textContent !== label) cursor.label.textContent = label;
}

function moveCursor() {
  cursor.dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
  const dx = pointer.x - cursor.rx;
  const dy = pointer.y - cursor.ry;
  cursor.rx += dx * 0.18;
  cursor.ry += dy * 0.18;
  cursor.follow.style.transform = `translate3d(${cursor.rx.toFixed(1)}px, ${cursor.ry.toFixed(1)}px, 0)`;
  return Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1;
}

function releaseAll() {
  pointer.target = null;
  pointer.moved = true;
  root.classList.remove('cursor-on');
  schedule();
}

function initPointerFx() {
  if (!desktopFx()) return;

  cursor.el = document.createElement('div');
  cursor.el.className = 'cursor';
  cursor.el.setAttribute('aria-hidden', 'true');
  cursor.dot = document.createElement('div');
  cursor.dot.className = 'cursor__dot';
  cursor.follow = document.createElement('div');
  cursor.follow.className = 'cursor__follow';
  const ring = document.createElement('div');
  ring.className = 'cursor__ring';
  cursor.label = document.createElement('span');
  cursor.label.className = 'cursor__label';
  ring.append(cursor.label);
  cursor.follow.append(ring);
  cursor.el.append(cursor.follow, cursor.dot);
  document.body.append(cursor.el);
  root.classList.add('has-cursor');

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.target = e.target instanceof Element ? e.target : null;
    pointer.moved = true;
    if (!root.classList.contains('cursor-on')) root.classList.add('cursor-on'); // add() always rewrites the attribute
    schedule();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', releaseAll);
  window.addEventListener('blur', releaseAll);
  window.addEventListener('pointerdown', () => cursor.el.classList.add('is-down'), { passive: true });
  window.addEventListener('pointerup', () => cursor.el.classList.remove('is-down'), { passive: true });
  // Content inside scrolled containers moves under a still pointer.
  const invalidate = () => { magnetBox = null; tiltBox = null; };
  window.addEventListener('scroll', () => { invalidate(); if (pointer.target) { pointer.moved = true; schedule(); } }, { passive: true });
  window.addEventListener('resize', invalidate, { passive: true });
}

/* ---------- sticky CTA (mobile) ---------- */
function initSticky() {
  const bar = document.getElementById('sticky-cta');
  const heroActions = document.querySelector('.hero__actions');
  const form = document.getElementById('request');
  if (!bar || !heroActions || !form) return;
  const s = { heroGone: false, formIn: false, keyboard: false };

  const update = () => {
    const show = isMobile.matches && s.heroGone && !s.formIn && !s.keyboard &&
      !root.classList.contains('is-locked') && !root.classList.contains('cookie-pending');
    if (bar.classList.contains('is-shown') === show) return;
    bar.classList.toggle('is-shown', show);
    bar.inert = !show;
    root.classList.toggle('has-sticky', show);
  };

  new IntersectionObserver(([en]) => {
    s.heroGone = !en.isIntersecting && en.boundingClientRect.top < 0;
    update();
  }).observe(heroActions);
  new IntersectionObserver(([en]) => {
    s.formIn = en.isIntersecting;
    update();
  }, { threshold: 0.08 }).observe(form);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      s.keyboard = window.visualViewport.height < window.innerHeight * 0.75;
      update();
    });
  }
  document.addEventListener('xl:ui', update);
  isMobile.addEventListener('change', update);
}

/* ---------- hero visibility (pauses background drift) ---------- */
// Dark «space» sections run their aurora only while on screen.
function initHeroVisibility() {
  // The fixed ambient glow sits behind the light sections only: animate it only while one is on screen.
  const light = new Set();
  const lightIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => (en.isIntersecting ? light.add(en.target) : light.delete(en.target)));
    root.classList.toggle('light-view', light.size > 0);
  });
  document.querySelectorAll('main > .section:not([data-theme])').forEach((el) => lightIO.observe(el));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => en.target.classList.toggle('is-visible', en.isIntersecting));
  });
  document.querySelectorAll('.hero, [data-theme="dark"], .descent, .dusk').forEach((el) => io.observe(el));
}

export function initFx() {
  initPreloader();
  initSplit();
  initIntro();
  observeReveal();
  initPointerFx();
  initSticky();
  initHeroVisibility();
}
