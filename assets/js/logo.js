// Logo hover: the satellite turns into a comet and flies one lap along the tilted orbit (SMIL
// animateMotion with rotate="auto", so the tail always trails behind), then settles back.
const SVG_NS = 'http://www.w3.org/2000/svg';
// Orbit in the logo's rotated frame, starting and ending at the satellite's resting point.
const ORBIT = 'M29.1 18.21A14 6.2 0 1 1 2.9 13.79A14 6.2 0 1 1 29.1 18.21';
const DUR = '1.5s';

function anim(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries({ begin: 'indefinite', dur: DUR, fill: 'freeze', ...attrs })) el.setAttribute(k, v);
  return el;
}

// Easter egg: five quick clicks on the header logo start a meteor shower over the page.
function meteorShower() {
  const sky = document.createElement('div');
  sky.className = 'meteors';
  sky.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 18; i++) {
    const m = document.createElement('i');
    m.style.setProperty('--x', `${(Math.random() * 120 - 10).toFixed(1)}vw`);
    m.style.setProperty('--y', `${(Math.random() * 45 - 10).toFixed(1)}vh`);
    m.style.setProperty('--d', `${(Math.random() * 1.6).toFixed(2)}s`);
    m.style.setProperty('--s', (0.6 + Math.random() * 0.8).toFixed(2));
    sky.append(m);
  }
  document.body.append(sky);
  setTimeout(() => sky.remove(), 3600);
}

function initEasterEgg() {
  const logo = document.querySelector('.header .logo');
  if (!logo) return;
  let clicks = [];
  logo.addEventListener('click', () => {
    const now = performance.now();
    clicks = clicks.filter((t) => now - t < 2500);
    clicks.push(now);
    if (clicks.length >= 5) {
      clicks = [];
      meteorShower();
    }
  });
}

export function initLogos() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  initEasterEgg();
  document.querySelectorAll('.logo').forEach((logo) => {
    const comet = logo.querySelector('.logo__comet');
    const sat = logo.querySelector('.logo__sat');
    if (!comet || !sat || !('SVGAnimationElement' in window)) return;
    const motion = anim('animateMotion', {
      path: ORBIT, rotate: 'auto', calcMode: 'spline', keyTimes: '0;1', keyPoints: '0;1', keySplines: '.5 0 .25 1',
    });
    const show = anim('animate', { attributeName: 'opacity', values: '0;1;1;0', keyTimes: '0;.06;.9;1' });
    comet.append(motion, show);
    let busyUntil = 0;
    const fly = () => {
      const now = performance.now();
      if (now < busyUntil) return;
      busyUntil = now + 1500;
      // The resting satellite hides via a class: CSS intro animations would override a SMIL opacity.
      logo.classList.add('is-flying');
      setTimeout(() => logo.classList.remove('is-flying'), 1380);
      motion.beginElement();
      show.beginElement();
    };
    logo.addEventListener('pointerenter', fly);
    logo.addEventListener('focus', fly);
  });
}
