// One-off generator for assets/img/hero-poster@{1x,2x}.webp.
// Headless use: msedge --headless --dump-dom ".../tools/poster.html?dump=1" prints the data URL into #out.
import { Stage } from '/assets/js/three-kit.js';
import { createHero } from '/assets/js/hero3d.js';

const params = new URLSearchParams(location.search);
const t = Number(params.get('t') || 6);
const W = 1120;
const H = 840;
const QUALITY = 0.82;

const stage = new Stage({ preserveDrawingBuffer: true });
stage.renderer.setPixelRatio(1);
stage.renderer.setSize(W, H, false);
document.getElementById('stage').append(stage.canvas);

const hero = createHero(stage, { fixedTime: t });
hero.build();
hero.resize(W, H);
hero.update(0);
stage.renderer.render(hero.scene, hero.camera);

function scaled(factor) {
  if (factor === 1) return stage.canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(W * factor);
  c.height = Math.round(H * factor);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(stage.canvas, 0, 0, c.width, c.height);
  return c;
}

function download(canvas, name) {
  canvas.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    document.getElementById('info').textContent = `${name}: ${(blob.size / 1024).toFixed(1)} КБ`;
  }, 'image/webp', QUALITY);
}

document.getElementById('dl2x').addEventListener('click', () => download(scaled(1), 'hero-poster@2x.webp'));
document.getElementById('dl1x').addEventListener('click', () => download(scaled(0.5), 'hero-poster@1x.webp'));

if (params.has('dump')) {
  const out = document.getElementById('out');
  out.hidden = false;
  out.textContent = `${scaled(1).toDataURL('image/webp', QUALITY)}\n${scaled(0.5).toDataURL('image/webp', QUALITY)}`;
  document.title = 'done';
}
