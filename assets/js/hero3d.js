// Hero scene «Стек браузерных окон»: four windows with procedural screens, floating UI chips,
// a cursor that clicks the CTA and a «Заявка отправлена» toast. No external assets.
import {
  Scene, PerspectiveCamera, Group, Mesh, PlaneGeometry, CylinderGeometry,
  MeshStandardMaterial, MeshBasicMaterial, Sprite, SpriteMaterial, Vector3, BoxGeometry,
} from '../vendor/three.custom.min.js';
import {
  C, FONT, MONO, roundedSlab, prism, atlasPlane, makeCanvas, canvasTexture,
  fillRR, strokeRR, dot, addLights, cosmicEnvironment, disposeAll, ease, clamp01,
} from './three-kit.js';

const TAU = Math.PI * 2;
const SCREEN = { w: 3.2, h: 2.0, tw: 1024, th: 640 };
const PX = SCREEN.w / SCREEN.tw;
const px2 = (x, y) => [(x / SCREEN.tw - 0.5) * SCREEN.w, (0.5 - y / SCREEN.th) * SCREEN.h];
const CTA_PX = { x: 48, y: 346, w: 214, h: 54 };
const STRIP_PX = { x: 44, y: 208, w: 512, h: 64 };
const PHRASES = ['в интернете', 'на любом экране', 'с понятной заявкой'];
const COMET = { period: 9, tail: 26, lag: 0.028 };

// Comet orbit around the window stack (rig space): tilted ellipse that passes in front of and behind the windows.
function cometAt(t, out) {
  const a = (t / COMET.period) * Math.PI * 2 + 2.94; // phase: in front of the stack on the poster frame (t = 6)
  // radii keep head and tail inside the canvas on every side, including near the camera
  return out.set(Math.cos(a) * 2.45, 0.25 + Math.sin(a) * 0.6 + Math.cos(a * 2) * 0.1, Math.sin(a) * 1.55 - 0.5);
}

function drawGlow(ctx) {
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(220,250,252,.95)');
  g.addColorStop(0.4, 'rgba(125,217,226,.45)');
  g.addColorStop(1, 'rgba(125,217,226,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
}

/* ---------- textures ---------- */
function chrome(ctx, w, s) {
  ctx.fillStyle = '#F1EEE9';
  ctx.fillRect(0, 0, w, 56 * s);
  ctx.fillStyle = C.line;
  ctx.fillRect(0, 56 * s, w, 2 * s);
  dot(ctx, '#E8776F', 30 * s, 28 * s, 6.5 * s);
  dot(ctx, '#E9C46A', 52 * s, 28 * s, 6.5 * s);
  dot(ctx, '#7FB77E', 74 * s, 28 * s, 6.5 * s);
  fillRR(ctx, C.surface, 318 * s, 14 * s, Math.min(560 * s, w - 340 * s), 28 * s, 14 * s);
  fillRR(ctx, C.bar, 356 * s, 24 * s, 150 * s, 8 * s, 4 * s);
}

function drawLanding(ctx) {
  const W = SCREEN.tw;
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, SCREEN.th);
  chrome(ctx, W, 1);
  fillRR(ctx, C.surface, 104, 12, 190, 46, 12);
  ctx.fillRect(104, 40, 190, 18);
  ctx.fillStyle = C.text;
  ctx.font = `500 15px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Главная', 126, 35);
  // lock icon in the address bar
  ctx.strokeStyle = C.muted;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(340, 25, 4, Math.PI, 0);
  ctx.stroke();
  fillRR(ctx, C.muted, 334, 25, 12, 9, 2);

  // page nav
  fillRR(ctx, C.accent, 48, 84, 28, 28, 8);
  fillRR(ctx, C.text, 86, 92, 84, 12, 6);
  [600, 668, 736].forEach((x) => fillRR(ctx, C.bar2, x, 94, 52, 8, 4));
  strokeRR(ctx, C.accent, 2, 822, 80, 154, 36, 18);
  ctx.fillStyle = C.accent;
  ctx.font = `600 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Связаться', 899, 98);
  ctx.textAlign = 'left';

  // headline line 1 (line 2 is the typing strip)
  ctx.fillStyle = C.text;
  ctx.font = `600 50px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Ваш бизнес —', 46, 200);
  fillRR(ctx, C.bar, 48, 290, 400, 12, 6);
  fillRR(ctx, C.bar, 48, 312, 320, 12, 6);

  // CTA + secondary
  fillRR(ctx, C.accent, CTA_PX.x, CTA_PX.y, CTA_PX.w, CTA_PX.h, 27);
  ctx.fillStyle = C.surface;
  ctx.font = `600 18px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Оставить заявку', CTA_PX.x + CTA_PX.w / 2, CTA_PX.y + CTA_PX.h / 2);
  strokeRR(ctx, C.bar2, 2, 274, 346, 150, 54, 27);
  ctx.fillStyle = C.text;
  ctx.fillText('Позвонить', 349, 373);
  ctx.textAlign = 'left';

  // illustration block
  const g = ctx.createLinearGradient(580, 130, 980, 420);
  g.addColorStop(0, C.accentSoft);
  g.addColorStop(1, C.surface2);
  fillRR(ctx, g, 578, 130, 398, 280, 22);
  dot(ctx, 'rgba(60,143,156,.35)', 890, 205, 52);
  dot(ctx, 'rgba(30,90,102,.9)', 890, 205, 22);
  fillRR(ctx, 'rgba(255,255,255,.94)', 610, 300, 240, 84, 16);
  fillRR(ctx, C.accent, 628, 318, 48, 48, 12);
  fillRR(ctx, C.text, 690, 324, 130, 10, 5);
  fillRR(ctx, C.bar2, 690, 346, 96, 8, 4);

  // cards
  [48, 360, 672].forEach((x, i) => {
    fillRR(ctx, C.bg, x, 446, 304, 156, 18);
    strokeRR(ctx, C.line, 1.5, x, 446, 304, 156, 18);
    fillRR(ctx, i === 1 ? C.accent : C.accentSoft, x + 22, 468, 44, 44, 12);
    fillRR(ctx, C.text, x + 22, 530, 170, 12, 6);
    fillRR(ctx, C.bar, x + 22, 556, 240, 9, 4.5);
    fillRR(ctx, C.bar, x + 22, 574, 190, 9, 4.5);
  });
}

// Back windows share one 512×1024 atlas: three 512×320 screens.
const BACK_RECTS = [[0, 0, 512, 320], [0, 352, 512, 320], [0, 704, 512, 320]];

function drawShop(ctx, oy) {
  ctx.save();
  ctx.translate(0, oy);
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, 512, 320);
  chrome(ctx, 512, 0.5);
  fillRR(ctx, C.text, 24, 44, 60, 10, 5);
  [330, 380, 430].forEach((x) => fillRR(ctx, C.bar2, x, 46, 36, 6, 3));
  const tones = ['#E4EEEF', '#F3F0EA', '#EDE6DA', '#E6EBE3', '#EEE9F0', '#E4EEEF'];
  for (let i = 0; i < 6; i++) {
    const x = 24 + (i % 3) * 160;
    const y = 72 + Math.floor(i / 3) * 122;
    fillRR(ctx, C.bg, x, y, 144, 110, 12);
    fillRR(ctx, tones[i], x + 8, y + 8, 128, 56, 8);
    fillRR(ctx, C.text, x + 10, y + 74, 80, 7, 3.5);
    fillRR(ctx, C.bar, x + 10, y + 88, 54, 6, 3);
    fillRR(ctx, C.accent, x + 96, y + 82, 38, 18, 9);
  }
  ctx.restore();
}

function drawBlog(ctx, oy) {
  ctx.save();
  ctx.translate(0, oy);
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, 512, 320);
  chrome(ctx, 512, 0.5);
  const g = ctx.createLinearGradient(0, 40, 512, 140);
  g.addColorStop(0, '#DCE8EA');
  g.addColorStop(1, '#F1ECE3');
  fillRR(ctx, g, 24, 44, 316, 104, 12);
  fillRR(ctx, C.text, 24, 162, 260, 14, 7);
  fillRR(ctx, C.text, 24, 184, 190, 14, 7);
  for (let i = 0; i < 5; i++) fillRR(ctx, C.bar, 24, 214 + i * 18, 316 - (i % 2) * 60, 7, 3.5);
  for (let i = 0; i < 4; i++) {
    fillRR(ctx, C.bg, 356, 44 + i * 66, 132, 56, 10);
    fillRR(ctx, i === 0 ? C.accent : C.bar2, 366, 56 + i * 66, 30, 30, 8);
    fillRR(ctx, C.bar, 404, 60 + i * 66, 72, 6, 3);
    fillRR(ctx, C.bar, 404, 74 + i * 66, 48, 6, 3);
  }
  ctx.restore();
}

function drawCorp(ctx, oy) {
  ctx.save();
  ctx.translate(0, oy);
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, 512, 320);
  chrome(ctx, 512, 0.5);
  fillRR(ctx, C.accent, 24, 42, 16, 16, 4);
  [300, 350, 400, 450].forEach((x) => fillRR(ctx, C.bar2, x, 47, 36, 6, 3));
  fillRR(ctx, C.text, 24, 84, 300, 18, 9);
  fillRR(ctx, C.text, 24, 110, 220, 18, 9);
  fillRR(ctx, C.bar, 24, 142, 260, 8, 4);
  fillRR(ctx, C.accent, 24, 164, 110, 28, 14);
  for (let i = 0; i < 3; i++) {
    const x = 24 + i * 160;
    fillRR(ctx, C.bg, x, 212, 144, 84, 12);
    dot(ctx, C.accentSoft, x + 26, 238, 14);
    fillRR(ctx, C.text, x + 12, 262, 90, 7, 3.5);
    fillRR(ctx, C.bar, x + 12, 276, 110, 6, 3);
  }
  ctx.restore();
}

// Chips atlas 512×512.
const R = {
  cta: [0, 0, 256, 64],
  toast: [256, 0, 256, 64],
  aa: [0, 64, 128, 128],
  toggle: [128, 64, 128, 128],
  field: [256, 64, 256, 128],
  code: [0, 192, 512, 128],
  shadow: [0, 320, 512, 192],
};

function check(ctx, x, y, r, bg) {
  dot(ctx, bg, x, y, r);
  ctx.strokeStyle = C.surface;
  ctx.lineWidth = r * 0.22;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.42, y + r * 0.02);
  ctx.lineTo(x - r * 0.1, y + r * 0.34);
  ctx.lineTo(x + r * 0.45, y - r * 0.3);
  ctx.stroke();
}

function drawChips(ctx) {
  ctx.clearRect(0, 0, 512, 512);
  ctx.textBaseline = 'middle';

  // CTA highlight (overlay for the «click» flash)
  fillRR(ctx, C.accentLight, 2, 2, 252, 60, 30);
  ctx.fillStyle = C.surface;
  ctx.font = `600 21px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Оставить заявку', 128, 33);
  ctx.textAlign = 'left';

  // toast
  fillRR(ctx, C.surface, 258, 2, 252, 60, 18);
  strokeRR(ctx, C.line, 2, 258, 2, 252, 60, 18);
  check(ctx, 290, 32, 15, C.accent);
  ctx.fillStyle = C.text;
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText('Заявка отправлена', 316, 33);

  // Aa
  fillRR(ctx, C.surface, 2, 66, 124, 124, 26);
  ctx.fillStyle = C.text;
  ctx.font = `600 54px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Aa', 64, 124);
  ctx.textAlign = 'left';
  fillRR(ctx, C.accent, 40, 158, 48, 6, 3);

  // toggle
  fillRR(ctx, C.surface, 130, 66, 124, 124, 26);
  fillRR(ctx, C.accent, 152, 106, 80, 44, 22);
  dot(ctx, C.surface, 210, 128, 17);

  // form field with check
  fillRR(ctx, C.surface, 258, 66, 252, 124, 22);
  fillRR(ctx, C.bar2, 280, 88, 64, 9, 4.5);
  strokeRR(ctx, '#7D8287', 2, 278, 108, 212, 56, 14);
  ctx.fillStyle = C.text;
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText('Имя', 296, 137);
  check(ctx, 462, 136, 13, C.accent);

  // code chip
  fillRR(ctx, C.text, 2, 194, 508, 124, 22);
  const lines = [
    [['<section', '#7CC4CF'], [' class=', '#E9C46A'], ['"hero"', '#A8D5A2'], ['>', '#7CC4CF']],
    [['  <h1>', '#7CC4CF'], ['Ваш бизнес', '#F3F0EA'], ['</h1>', '#7CC4CF']],
    [['  <button>', '#7CC4CF'], ['Заявка', '#F3F0EA'], ['</button>', '#7CC4CF']],
  ];
  ctx.font = `500 19px ${MONO}`;
  lines.forEach((tokens, i) => {
    let x = 26;
    tokens.forEach(([t, col]) => {
      ctx.fillStyle = col;
      ctx.fillText(t, x, 228 + i * 30);
      x += ctx.measureText(t).width;
    });
  });

  // soft contact shadow
  ctx.save();
  ctx.translate(256, 416);
  ctx.scale(1, 0.36);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, 252);
  sg.addColorStop(0, 'rgba(76,195,207,.34)');
  sg.addColorStop(0.5, 'rgba(110,86,220,.12)');
  sg.addColorStop(1, 'rgba(110,86,220,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(-256, -266, 512, 532);
  ctx.restore();
}

function typedAt(t) {
  // Word-by-word typing (~2 Hz), hold, clear, next phrase.
  const STEP = 0.45;
  const HOLD = 2.6;
  const GAP = 0.45;
  const spans = PHRASES.map((p) => p.split(' ').length * STEP + HOLD + GAP);
  const total = spans.reduce((a, b) => a + b, 0);
  let local = ((t % total) + total) % total;
  for (let i = 0; i < PHRASES.length; i++) {
    if (local < spans[i]) {
      const words = PHRASES[i].split(' ');
      if (local > words.length * STEP + HOLD) return { text: '', typing: false };
      const n = Math.min(words.length, Math.floor(local / STEP) + 1);
      return { text: words.slice(0, n).join(' '), typing: n < words.length };
    }
    local -= spans[i];
  }
  return { text: '', typing: false };
}

export function createHero(stage, { fixedTime = null } = {}) {
  const inst = {
    continuous: true,
    built: false,
    scene: null,
    camera: null,
  };
  let s = null;
  const target = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  let t0 = null;
  let introDone = fixedTime !== null;
  let lastT = 0;

  inst.build = () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(32, 4 / 3, 0.1, 50);
    camera.position.set(0, 0.55, 8.6);
    camera.lookAt(0.1, -0.05, -0.3);
    const lights = addLights(scene);
    scene.environment = cosmicEnvironment(stage);

    const textures = [];
    const tex = (canvas) => { const t = canvasTexture(canvas, stage); textures.push(t); return t; };

    const landingCanvas = makeCanvas(SCREEN.tw, SCREEN.th);
    drawLanding(landingCanvas.getContext('2d'));
    const landingTex = tex(landingCanvas);

    const backCanvas = makeCanvas(512, 1024);
    const bctx = backCanvas.getContext('2d');
    drawShop(bctx, BACK_RECTS[0][1]);
    drawBlog(bctx, BACK_RECTS[1][1]);
    drawCorp(bctx, BACK_RECTS[2][1]);
    const backTex = tex(backCanvas);

    const chipsCanvas = makeCanvas(512, 512);
    drawChips(chipsCanvas.getContext('2d'));
    const chipsTex = tex(chipsCanvas);

    const stripCanvas = makeCanvas(STRIP_PX.w, STRIP_PX.h);
    const sctx = stripCanvas.getContext('2d');
    const stripTex = tex(stripCanvas);

    const bodyMat = new MeshStandardMaterial({ color: '#E9EEF2', metalness: 0.5, roughness: 0.28, envMapIntensity: 1.1 });
    const whiteMat = new MeshStandardMaterial({ color: '#F6F8FA', metalness: 0.3, roughness: 0.34, envMapIntensity: 0.9 });
    const darkMat = new MeshStandardMaterial({ color: '#141822', metalness: 0.55, roughness: 0.25, envMapIntensity: 1.2 });
    const accentMat = new MeshStandardMaterial({ color: '#2A8E9B', metalness: 0.45, roughness: 0.3, emissive: '#0E3A42', envMapIntensity: 1 });
    const sandMat = new MeshStandardMaterial({ color: '#CDBFA6', metalness: 0.3, roughness: 0.4 });
    const glassMat = new MeshStandardMaterial({ color: '#DDF6FA', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.6 });
    const glowMat = new MeshBasicMaterial({ color: '#4CC3CF', transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
    // Screens are self-lit displays: unlit + no tone mapping keeps the procedural UI crisp and true to the palette.
    const screenMat = (map, tint = 0xffffff) => new MeshBasicMaterial({ map, color: tint, toneMapped: false });
    const chipMat = new MeshBasicMaterial({ map: chipsTex, toneMapped: false, alphaTest: 0.5 });

    const rig = new Group();
    rig.rotation.set(0.05, -0.26, 0);
    scene.add(rig);

    // windows (back → front)
    const WINS = [
      { w: 2.2, h: 1.375, pos: [1.2, 0.98, -1.5], rect: BACK_RECTS[2], amp: 0.05, ph: 2.1, k: 0.05, delay: 0 },
      { w: 2.3, h: 1.4375, pos: [-1.05, 0.82, -1.05], rect: BACK_RECTS[1], amp: 0.045, ph: 1.2, k: 0.08, delay: 0.12 },
      { w: 2.6, h: 1.625, pos: [0.8, 0.42, -0.55], rect: BACK_RECTS[0], amp: 0.04, ph: 0.4, k: 0.11, delay: 0.24 },
      { w: SCREEN.w, h: SCREEN.h, pos: [-0.2, -0.18, 0], front: true, amp: 0.03, ph: 0, k: 0.15, delay: 0.36 },
    ];
    const backMat = screenMat(backTex, 0xf2f0ec);
    const windows = WINS.map((cfg) => {
      const g = new Group();
      const body = new Mesh(roundedSlab(cfg.w + 0.06, cfg.h + 0.06, 0.07, 0.07), bodyMat);
      g.add(body);
      const screenGeo = cfg.front
        ? new PlaneGeometry(cfg.w, cfg.h)
        : atlasPlane(cfg.w, cfg.h, cfg.rect, 512, 1024);
      const screen = new Mesh(screenGeo, cfg.front ? screenMat(landingTex) : backMat);
      screen.position.z = 0.0365;
      g.add(screen);
      const plate = new Mesh(roundedSlab(cfg.w + 0.16, cfg.h + 0.16, 0.012, 0.12, 6), cfg.front ? glowMat : glassMat);
      plate.position.z = -0.05;
      g.add(plate);
      g.position.set(...cfg.pos);
      rig.add(g);
      return { g, cfg, plate };
    });
    const front = windows[3].g;

    // typing strip + caret on the front screen
    const [sx, sy] = px2(STRIP_PX.x + STRIP_PX.w / 2, STRIP_PX.y + STRIP_PX.h / 2);
    const strip = new Mesh(new PlaneGeometry(STRIP_PX.w * PX, STRIP_PX.h * PX), screenMat(stripTex));
    strip.position.set(sx, sy, 0.038);
    front.add(strip);
    const caret = new Mesh(new PlaneGeometry(0.014, 0.15), new MeshBasicMaterial({ color: C.accent, toneMapped: false }));
    caret.position.set(0, sy - 0.01, 0.0395);
    front.add(caret);

    // CTA flash overlay
    const [cx, cy] = px2(CTA_PX.x + CTA_PX.w / 2, CTA_PX.y + CTA_PX.h / 2);
    const ctaGlow = new Mesh(atlasPlane(CTA_PX.w * PX, CTA_PX.h * PX, R.cta, 512, 512),
      new MeshBasicMaterial({ map: chipsTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    ctaGlow.position.set(cx, cy, 0.04);
    front.add(ctaGlow);

    // floating chips
    const chip = (w, h, rect, pos, mat = whiteMat, r = 0.07) => {
      const g = new Group();
      g.add(new Mesh(roundedSlab(w, h, 0.05, r, 6), mat));
      const face = new Mesh(atlasPlane(w, h, rect, 512, 512), chipMat);
      face.position.z = 0.0255;
      g.add(face);
      g.position.set(...pos);
      rig.add(g);
      return g;
    };
    const chips = [
      { g: chip(0.36, 0.36, R.aa, [-2.2, 0.6, 0.5]), ph: 0.3, base: [-2.2, 0.6, 0.5], delay: 0.6 },
      { g: chip(0.36, 0.36, R.toggle, [2.3, -0.2, 0.55]), ph: 1.7, base: [2.3, -0.2, 0.55], delay: 0.7 },
      { g: chip(0.76, 0.38, R.field, [2.05, -0.95, 0.3], whiteMat, 0.08), ph: 2.6, base: [2.05, -0.95, 0.3], delay: 0.8 },
      { g: chip(1.12, 0.28, R.code, [-1.7, -1.34, 0.62], darkMat, 0.08), ph: 0.9, base: [-1.7, -1.34, 0.62], delay: 0.9 },
    ];
    // colour swatches
    const sw = new Group();
    sw.add(new Mesh(roundedSlab(0.56, 0.22, 0.05, 0.11, 6), whiteMat));
    const cyl = new CylinderGeometry(0.055, 0.055, 0.03, 32);
    [accentMat, sandMat, darkMat].forEach((m, i) => {
      const c = new Mesh(cyl, m);
      c.rotation.x = Math.PI / 2;
      c.position.set(-0.16 + i * 0.16, 0, 0.04);
      sw.add(c);
    });
    sw.position.set(2.15, 0.62, 0.25);
    rig.add(sw);
    chips.push({ g: sw, ph: 2.2, base: [2.15, 0.62, 0.25], delay: 0.75 });

    // toast
    const toast = chip(0.84, 0.21, R.toast, [0, 0, 0], whiteMat, 0.1);
    const toastBase = [front.position.x + cx + 0.78, front.position.y + cy - 0.3, 0.42];
    toast.position.set(...toastBase);
    toast.scale.setScalar(0.001);

    // cursor
    const S = 0.27;
    const head = [[0, 0], [0, -1], [0.72, -0.72]].map(([x, y]) => [x * S, y * S]);
    const tail = [[0.244, -0.737], [0.474, -1.207], [0.626, -1.133], [0.396, -0.663]].map(([x, y]) => [x * S, y * S]);
    const cursor = new Group();
    cursor.add(new Mesh(prism(head, 0.035), darkMat), new Mesh(prism(tail, 0.035), darkMat));
    rig.add(cursor);
    const cursorTarget = [front.position.x + cx + 0.08, front.position.y + cy - 0.02, 0.14];
    const cursorStart = [1.25, -1.35, 0.85];

    // contact shadow
    const shadow = new Mesh(atlasPlane(5.8, 2.2, R.shadow, 512, 512),
      new MeshBasicMaterial({ map: chipsTex, transparent: true, depthWrite: false, toneMapped: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.15, -1.66, -0.6);
    rig.add(shadow);

    // comet: glowing head + sprite tail sampled back along the orbit; the teal point light rides on it
    const glowCanvas = makeCanvas(64, 64);
    drawGlow(glowCanvas.getContext('2d'));
    const glowTex = tex(glowCanvas);
    const cometHead = new Sprite(new SpriteMaterial({ map: glowTex, color: 0xf0feff, transparent: true, depthWrite: false, toneMapped: false }));
    rig.add(cometHead);
    const cometTail = [];
    for (let i = 1; i <= COMET.tail; i++) {
      const k = 1 - i / (COMET.tail + 1);
      const sp = new Sprite(new SpriteMaterial({ map: glowTex, color: 0x7dd9e2, transparent: true, opacity: 0.55 * k * k, depthWrite: false, toneMapped: false }));
      sp.userData.k = k;
      rig.add(sp);
      cometTail.push(sp);
    }

    // satellite drifting far behind the stack: gold-foil bus, segmented solar wings, dish antenna
    const satellite = new Group();
    const foilMat = new MeshStandardMaterial({ color: '#C9A24A', metalness: 0.9, roughness: 0.32, envMapIntensity: 1.3 });
    const wingMat = new MeshStandardMaterial({ color: '#1C2D63', metalness: 0.6, roughness: 0.2, emissive: '#0A1230', envMapIntensity: 1.5 });
    const strutMat = new MeshStandardMaterial({ color: '#B9C2CC', metalness: 0.8, roughness: 0.3 });
    const bus = new Mesh(new CylinderGeometry(0.11, 0.11, 0.3, 16), foilMat);
    bus.rotation.z = Math.PI / 2;
    satellite.add(bus);
    const wingGeo = new BoxGeometry(0.2, 0.28, 0.012);
    const strutGeo = new CylinderGeometry(0.012, 0.012, 0.2, 6);
    for (const side of [-1, 1]) {
      const strut = new Mesh(strutGeo, strutMat);
      strut.rotation.z = Math.PI / 2;
      strut.position.x = side * 0.24;
      satellite.add(strut);
      for (let i = 0; i < 3; i++) {
        const wing = new Mesh(wingGeo, wingMat);
        wing.position.x = side * (0.44 + i * 0.215);
        satellite.add(wing);
      }
    }
    const dish = new Mesh(new CylinderGeometry(0.1, 0.012, 0.05, 20, 1, true), strutMat);
    dish.position.set(0.02, 0.17, 0);
    satellite.add(dish);
    const mast = new Mesh(new CylinderGeometry(0.006, 0.006, 0.16, 5), strutMat);
    mast.position.set(-0.08, 0.17, 0);
    mast.rotation.z = 0.5;
    satellite.add(mast);
    satellite.scale.setScalar(0.85);
    scene.add(satellite);

    s = {
      scene, camera, lights, rig, windows, chips, toast, toastBase, cursor, cursorTarget, cursorStart,
      ctaGlow, strip, stripTex, sctx, caret, textures, lastText: null, cometHead, cometTail, satellite, tmp: new Vector3(),
    };
    inst.scene = scene;
    inst.camera = camera;
    inst.built = true;
    if (t0 !== null) introDone = true;
  };

  function drawStrip(text) {
    const ctx = s.sctx;
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, STRIP_PX.w, STRIP_PX.h);
    ctx.fillStyle = C.accent;
    ctx.font = `600 50px ${FONT}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, 2, 50);
    s.stripTex.needsUpdate = true;
    const width = text ? ctx.measureText(text).width : 0;
    const left = s.strip.position.x - (STRIP_PX.w * PX) / 2;
    s.caret.position.x = left + (2 + width + 6) * PX;
  }

  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const bezier = (a, c, b, k) => lerp3(lerp3(a, c, k), lerp3(c, b, k), k);

  inst.update = (now) => {
    if (!s) return;
    if (t0 === null) t0 = now;
    const T = fixedTime !== null ? fixedTime : now - t0;
    const dt = Math.min(0.1, Math.max(0, T - lastT));
    lastT = T;
    const intro = (delay) => (introDone ? 1 : ease.outCubic(clamp01((T - delay) / 1.2)));
    if (!introDone && T > 2.4) introDone = true;

    // pointer parallax (desktop only, eased)
    const k = 1 - Math.exp(-dt * 4);
    look.x += (target.x - look.x) * k;
    look.y += (target.y - look.y) * k;

    s.rig.rotation.y = -0.26 + Math.sin((T * TAU) / 14) * 0.21 + look.x * 0.12;
    s.rig.rotation.x = 0.05 + Math.sin((T * TAU) / 18) * 0.07 + look.y * 0.08;

    s.windows.forEach(({ g, cfg, plate }, i) => {
      const e = intro(cfg.delay);
      g.position.x = cfg.pos[0] + look.x * cfg.k;
      g.position.y = cfg.pos[1] + Math.sin(T * 0.9 + cfg.ph) * cfg.amp - (1 - e) * 0.4 - look.y * cfg.k * 0.5;
      g.position.z = cfg.pos[2] - (1 - e) * 2.4;
      g.scale.setScalar(0.9 + 0.1 * e);
      if (cfg.front) plate.material.opacity = 0.2 + 0.14 * (0.5 + 0.5 * Math.sin(T * 1.6));
      if (i === 3) g.rotation.z = Math.sin(T * 0.7) * 0.008;
    });
    s.chips.forEach(({ g, ph, base, delay }) => {
      const e = intro(delay);
      g.position.set(base[0] + look.x * 0.2, base[1] + Math.sin(T * 1.1 + ph) * 0.05 - look.y * 0.1, base[2]);
      g.rotation.z = Math.sin(T * 0.8 + ph) * 0.06;
      g.rotation.y = Math.sin(T * 0.6 + ph) * 0.12;
      g.scale.setScalar(Math.max(0.001, ease.outBack(e)));
    });

    // point light orbit → moving petrol rim
    const sx = ((T / 42) + 0.28) % 1;
    s.satellite.position.set(-4.7 + sx * 9.4, 2.4 + Math.sin(T * 0.2) * 0.12 + sx * 0.2, -3.4);
    s.satellite.rotation.set(0.18 + Math.sin(T * 0.3) * 0.08, Math.sin(T * 0.11) * 0.6, 0.12);

    const ck = intro(1.1);
    cometAt(T, s.cometHead.position);
    s.cometHead.scale.setScalar(0.42 * ck * (1 + Math.sin(T * 9) * 0.06));
    s.cometTail.forEach((sp, i) => {
      cometAt(T - (i + 1) * COMET.lag, sp.position);
      sp.scale.setScalar(0.34 * sp.userData.k * ck);
    });
    // the comet carries the teal light, so windows light up as it flies past
    s.cometHead.getWorldPosition(s.tmp);
    s.lights.point.position.copy(s.tmp);
    s.lights.point.intensity = 14 * ck;

    // story loop: cursor → click CTA → toast
    const c = T < 2 ? -1 : (T - 2) % 8;
    const mid = [0.6, 0.2, 1.1];
    let cp = s.cursorStart;
    let cs = 1;
    let glow = 0;
    let toastK = 0;
    if (c >= 0) {
      if (c < 2) cp = bezier(s.cursorStart, mid, s.cursorTarget, ease.inOutCubic(c / 2));
      else if (c < 5.8) {
        cp = s.cursorTarget.slice();
        cp[0] += Math.sin((c - 2) * 1.3) * 0.03;
        cp[1] += Math.sin((c - 2) * 1.7) * 0.02;
        if (c < 2.25) cs = 1 - Math.sin(((c - 2) / 0.25) * Math.PI) * 0.12;
      } else cp = bezier(s.cursorTarget, [-0.2, -1.1, 1.0], s.cursorStart, ease.inOutCubic(clamp01((c - 5.8) / 2.2)));
      if (c >= 2 && c < 2.8) glow = c < 2.15 ? (c - 2) / 0.15 : 1 - (c - 2.15) / 0.65;
      if (c >= 2.35 && c < 6) toastK = c < 2.85 ? ease.outBack((c - 2.35) / 0.5) : c > 5.6 ? 1 - (c - 5.6) / 0.4 : 1;
    }
    const ci = intro(0.9);
    s.cursor.position.set(cp[0], cp[1], cp[2]);
    s.cursor.scale.setScalar(Math.max(0.001, cs * ci));
    s.cursor.rotation.z = 0.12;
    s.ctaGlow.material.opacity = clamp01(glow);
    s.toast.scale.setScalar(Math.max(0.001, toastK));
    s.toast.position.set(s.toastBase[0], s.toastBase[1] + Math.sin(T * 1.4) * 0.025, s.toastBase[2]);

    // typing
    const typed = typedAt(Math.max(0, T - 0.8));
    if (typed.text !== s.lastText) {
      s.lastText = typed.text;
      drawStrip(typed.text);
    }
    s.caret.visible = typed.typing || Math.floor(T * 2) % 2 === 0;
  };

  inst.resize = (w, h) => {
    if (!s) return;
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  };

  inst.pointer = (x, y) => {
    target.x = x;
    target.y = y;
  };

  inst.activate = () => {};
  inst.deactivate = () => {
    target.x = 0;
    target.y = 0;
  };

  inst.dispose = () => {
    if (!s) return;
    disposeAll(s.scene, s.textures);
    s = null;
    inst.scene = null;
    inst.camera = null;
    inst.built = false;
  };

  return inst;
}
