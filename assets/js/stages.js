// Decides whether Three.js is loaded at all. Weak devices, mobile, save-data and
// reduced motion get the static poster (hero) and the CSS builder (scene B).
import { reduceMotion } from './env.js';

function webgl2() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function canRun3D() {
  const force = new URLSearchParams(location.search).get('3d');
  if (force === '0') return false;
  if (force === '1') return webgl2();
  if (window.innerWidth < 1024) return false;
  if (reduceMotion.matches) return false;
  if (navigator.connection && navigator.connection.saveData) return false;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return false;
  if (navigator.deviceMemory && navigator.deviceMemory <= 4) return false;
  return webgl2();
}

// Seeded scatter so the CSS builder looks the same on every visit.
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initBuilderFallback(stage) {
  if (!stage) return;
  const rand = rng(11);
  stage.querySelectorAll('.bb').forEach((b, i) => {
    b.style.setProperty('--n', String(i));
    b.style.setProperty('--sx', `${Math.round((rand() - 0.5) * 140)}px`);
    b.style.setProperty('--sy', `${Math.round((rand() - 0.5) * 110)}px`);
    b.style.setProperty('--sr', `${Math.round((rand() - 0.5) * 40)}deg`);
  });
  if (reduceMotion.matches) {
    stage.classList.add('is-assembled');
    return;
  }
  const io = new IntersectionObserver(([en]) => {
    if (en.isIntersecting) {
      stage.classList.add('is-assembled');
      io.disconnect();
    }
  }, { threshold: 0.35 });
  io.observe(stage);
}

export function initStages() {
  const hero = document.getElementById('hero-stage');
  const builder = document.getElementById('builder-stage');
  initBuilderFallback(builder);
  if (!hero || !canRun3D()) return;

  const start = () => {
    import('./stars.js').then((m) => m.initStars(document.querySelector('.hero__bg'))).catch(() => {});
    import('./three-kit.js')
      .then((kit) => kit.start({ hero, builder }))
      .catch((err) => console.warn('[3d] disabled:', err));
  };
  const idle = (cb) => ('requestIdleCallback' in window ? requestIdleCallback(cb, { timeout: 2000 }) : setTimeout(cb, 300));
  if (document.readyState === 'complete') idle(start);
  else window.addEventListener('load', () => idle(start), { once: true });
}
