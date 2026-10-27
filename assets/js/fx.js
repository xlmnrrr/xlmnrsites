import { reduceMotion, finePointer, isMobile, clamp } from './env.js';

const root = document.documentElement;
const desktopFx = () => finePointer.matches && !reduceMotion.matches;

/* ---------- preloader ---------- */
let resolvePreloader;
export const preloaderDone = new Promise((r) => { resolvePreloader = r; });

function initPreloader() {
  const pl = document.getElementById('preloader');
  if (!pl || root.classList.contains('pl-skip')) { resolvePreloader(); return; }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    pl.classList.add('is-done');
    setTimeout(resolvePreloader, 180);
    setTimeout(() => pl.remove(), 600);
  };
  // Hard ceiling of 1.2 s from navigation start; CSS hides it on its own as well.
  setTimeout(finish, Math.max(0, 1200 - performance.now()));
  const onLoad = () => setTimeout(finish, Math.max(0, Math.min(450, 1200 - performance.now())));
  if (document.readyState === 'complete') onLoad();
  else window.addEventListener('load', onLoad, { once: true });
}

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
const cursor = { el: null, dot: null, follow: null, label: null, rx: -100, ry: -100, state: '' };

function frame() {
  rafId = 0;
  if (pointer.moved) {
    pointer.moved = false;
    updateMagnet();
    updateTilt();
    updateCursorState();
  }
  if (cursor.el && moveCursor()) schedule();
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
    if (magnet) magnet.classList.add('is-magnet');
  }
  if (!magnet) return;
  const r = magnet.getBoundingClientRect();
  const ox = parseFloat(magnet.style.getPropertyValue('--mx')) || 0;
  const oy = parseFloat(magnet.style.getPropertyValue('--my')) || 0;
  const cx = r.left - ox + r.width / 2;
  const cy = r.top - oy + r.height / 2;
  const dx = clamp((pointer.x - cx) / (r.width / 2), -1, 1) * 7;
  const dy = clamp((pointer.y - cy) / (r.height / 2), -1, 1) * 7;
  magnet.style.setProperty('--mx', `${dx.toFixed(2)}px`);
  magnet.style.setProperty('--my', `${dy.toFixed(2)}px`);
}

function updateTilt() {
  const el = pointer.target && pointer.target.closest('[data-tilt]');
  if (el !== tilt) {
    if (tilt) {
      tilt.classList.remove('is-tilting');
      tilt.style.setProperty('--rx', '0deg');
      tilt.style.setProperty('--ry', '0deg');
    }
    tilt = el;
    if (tilt) tilt.classList.add('is-tilting');
  }
  if (!tilt) return;
  const r = tilt.getBoundingClientRect();
  const px = clamp((pointer.x - r.left) / r.width);
  const py = clamp((pointer.y - r.top) / r.height);
  tilt.style.setProperty('--ry', `${((px - 0.5) * 16).toFixed(2)}deg`);
  tilt.style.setProperty('--rx', `${((0.5 - py) * 16).toFixed(2)}deg`);
  tilt.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
  tilt.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
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
    root.classList.add('cursor-on');
    schedule();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', releaseAll);
  window.addEventListener('blur', releaseAll);
  window.addEventListener('pointerdown', () => cursor.el.classList.add('is-down'), { passive: true });
  window.addEventListener('pointerup', () => cursor.el.classList.remove('is-down'), { passive: true });
  // Content inside scrolled containers moves under a still pointer.
  window.addEventListener('scroll', () => { if (pointer.target) { pointer.moved = true; schedule(); } }, { passive: true });
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
function initHeroVisibility() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  new IntersectionObserver(([en]) => hero.classList.toggle('is-visible', en.isIntersecting)).observe(hero);
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
