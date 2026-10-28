// «Orbit» — the page as one journey: a thin trajectory on the right edge (desktop) with a dot per
// section and a comet that follows the scroll. The comet rides a CSS scroll-driven animation
// (compositor) where supported; dots light up for the section in the middle of the screen.
import { reduceMotion, clamp } from './env.js';

const SECTIONS = [
  ['top', 'Начало'], ['services', 'Услуги'], ['process', 'Процесс'], ['cases', 'Кейсы'],
  ['advantages', 'Подход'], ['request', 'Заявка'], ['contacts', 'Контакты'],
];

export function initOrbitNav() {
  const nav = document.getElementById('orbitnav');
  if (!nav) return;
  const list = nav.querySelector('.orbitnav__dots');
  const targets = SECTIONS.map(([id, label]) => [document.getElementById(id), id, label]).filter(([el]) => el);
  const dots = targets.map(([, id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'orbitnav__dot';
    b.dataset.scroll = id;
    b.dataset.label = label;
    b.setAttribute('aria-label', label);
    list.append(b);
    return b;
  });

  // Dots sit where their sections start along the page, so the comet passes each one on arrival.
  // The first and the last dot are the ends of the scroll itself: the comet (0 → 100% of the
  // track) starts on the first circle and stops exactly on the last one, never beyond.
  const place = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    targets.forEach(([el], i) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const p = i === 0 ? 0 : i === targets.length - 1 ? 1 : clamp(top / max);
      dots[i].style.setProperty('--p', String(p));
    });
  };
  let t = 0;
  const later = () => { clearTimeout(t); t = setTimeout(place, 200); };
  window.addEventListener('resize', later, { passive: true });
  window.addEventListener('load', place, { once: true });
  new ResizeObserver(later).observe(document.body);
  place();

  // The active section is the one crossing the middle of the screen.
  const active = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => active.set(en.target, en.isIntersecting));
    let current = null;
    targets.forEach(([el], i) => { if (active.get(el)) current = i; });
    dots.forEach((d, i) => d.classList.toggle('is-active', i === current));
  }, { rootMargin: '-49% 0px -49% 0px' });
  targets.forEach(([el]) => io.observe(el));

  // The trajectory adapts to what is behind it: light ink on dark sections, dark ink on light ones.
  const dark = new Set();
  const darkIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => (en.isIntersecting ? dark.add(en.target) : dark.delete(en.target)));
    nav.classList.toggle('on-dark', dark.size > 0);
  }, { rootMargin: '-49% 0px -49% 0px' });
  document.querySelectorAll('main [data-theme="dark"], main [data-header="dark"], footer[data-theme="dark"]').forEach((el) => darkIO.observe(el));

  if (reduceMotion.matches) nav.classList.add('is-still');

  // The trajectory doubles as the page's scrollbar (the browser's own is hidden where it shows):
  // a click anywhere on it jumps there, dragging scrolls along. Dots keep their own clicks.
  const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
  const toTop = (e) => {
    const r = nav.getBoundingClientRect();
    return clamp((e.clientY - r.top) / r.height) * maxScroll();
  };
  let dragging = false;
  nav.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.orbitnav__dot')) return;
    e.preventDefault();
    dragging = true;
    try { nav.setPointerCapture(e.pointerId); } catch { /* synthetic event */ }
    nav.classList.add('is-dragging');
    window.scrollTo({ top: toTop(e), behavior: reduceMotion.matches ? 'instant' : 'smooth' });
  });
  nav.addEventListener('pointermove', (e) => {
    if (dragging && e.buttons) window.scrollTo({ top: toTop(e), behavior: 'instant' });
  });
  const stop = () => {
    dragging = false;
    nav.classList.remove('is-dragging');
  };
  nav.addEventListener('pointerup', stop);
  nav.addEventListener('pointercancel', stop);
}
