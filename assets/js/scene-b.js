// Scene B «Конструктор страниц»: blocks fly along arcs from a scatter and snap into a page
// while a petrol «print head» scans down it. Progress follows the scroll with easing; once the
// page is built a cursor visits the CTA and the cards, so the scene stays alive.
import {
  Scene, PerspectiveCamera, Group, Mesh, InstancedMesh, Object3D, Color, PlaneGeometry, BoxGeometry,
  MeshStandardMaterial, MeshBasicMaterial, ShaderMaterial, PointLight, DoubleSide,
} from '../vendor/three.custom.min.js';
import {
  C, roundedSlab, prism, atlasPlane, makeCanvas, canvasTexture, fillRR, strokeRR, dot,
  addLights, cosmicEnvironment, disposeAll, ease, clamp01,
} from './three-kit.js';

const PAGE = { w: 4.3, h: 3.1, tw: 512, th: 368 };
const FACE_Z = 0.062;
const CTA = 7;

// Slots in page-local coordinates: [x, y, w, h, depth, colour]
const BLOCKS = [
  [-1.65, 1.08, 0.5, 0.14, 0.06, C.text],
  [0.75, 1.08, 0.42, 0.08, 0.04, C.bar2],
  [1.25, 1.08, 0.42, 0.08, 0.04, C.bar2],
  [1.75, 1.08, 0.42, 0.08, 0.04, C.bar2],
  [-0.85, 0.72, 2.0, 0.2, 0.08, '#2B2F34'],
  [-1.15, 0.42, 1.4, 0.2, 0.08, '#2B2F34'],
  [-1.05, 0.13, 1.6, 0.08, 0.04, C.bar],
  [-1.45, -0.17, 0.8, 0.2, 0.16, C.accent],
  [1.05, 0.28, 1.8, 1.1, 0.06, C.accentSoft],
  [0, -1.38, 3.9, 0.1, 0.04, C.bar],
];
const CARDS = [[-1.3, -0.82], [0, -0.82], [1.3, -0.82]];
const CARD = { w: 1.2, h: 0.75, d: 0.09 };

// Cursor tour after the page is built (seconds within an 8 s loop), page-local coordinates.
const TOUR = [
  [0, [2.7, -1.9, 1.1]],
  [1.4, [-1.3, -0.26, 0.34]],
  [1.9, [-1.3, -0.26, 0.34]],
  [3.0, [0.12, -0.92, 0.4]],
  [4.3, [0.12, -0.92, 0.4]],
  [5.1, [1.42, -0.92, 0.4]],
  [6.0, [1.42, -0.92, 0.4]],
  [7.3, [2.7, -1.9, 1.1]],
  [8.0, [2.7, -1.9, 1.1]],
];
const CLICK_AT = 1.55;
const HOVERS = [[3.0, 4.3, 1], [5.1, 6.0, 2]];

const OUTLINE_VERT = `
varying vec2 vUv;
varying vec2 vSize;
void main() {
  vUv = uv;
  vSize = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
// Dashed «blueprint» frame with constant world-space thickness; dashes march with uTime.
const OUTLINE_FRAG = `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vUv;
varying vec2 vSize;
void main() {
  vec2 d = min(vUv, 1.0 - vUv) * vSize;
  float edge = min(d.x, d.y);
  float line = 1.0 - smoothstep(0.011, 0.02, edge);
  float along = d.x < d.y ? vUv.y * vSize.y + vUv.x : vUv.x * vSize.x + vUv.y;
  float dash = step(0.42, fract(along / 0.075 - uTime * 0.9));
  float a = line * dash * 0.8 + 0.06;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
  #include <colorspace_fragment>
}`;

function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawPage(ctx) {
  const { tw: W, th: H } = PAGE;
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(30,90,102,.16)';
  for (let y = 40; y < H; y += 16) for (let x = 8; x < W; x += 16) ctx.fillRect(x, y, 1.6, 1.6);
  ctx.fillStyle = '#F1EEE9';
  ctx.fillRect(0, 0, W, 26);
  ctx.fillStyle = C.line;
  ctx.fillRect(0, 26, W, 1.5);
  dot(ctx, '#E8776F', 16, 13, 4);
  dot(ctx, '#E9C46A', 30, 13, 4);
  dot(ctx, '#7FB77E', 44, 13, 4);
  fillRR(ctx, C.surface, 150, 6, 240, 14, 7);
  fillRR(ctx, C.bar, 166, 11, 80, 4, 2);
}

function drawCard(ctx) {
  ctx.fillStyle = C.surface;
  ctx.fillRect(0, 0, 256, 160);
  strokeRR(ctx, C.line, 3, 0, 0, 256, 160, 14);
  fillRR(ctx, C.accentSoft, 18, 18, 40, 40, 10);
  fillRR(ctx, C.text, 18, 78, 150, 12, 6);
  fillRR(ctx, C.bar, 18, 104, 210, 9, 4.5);
  fillRR(ctx, C.bar, 18, 124, 160, 9, 4.5);
}

// 256×256 atlas: top half — scan trail gradient, bottom half — soft contact shadow.
function drawFx(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(60,143,156,0)');
  g.addColorStop(1, 'rgba(60,143,156,.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  ctx.save();
  ctx.translate(128, 192);
  ctx.scale(1, 0.45);
  const s = ctx.createRadialGradient(0, 0, 0, 0, 0, 126);
  s.addColorStop(0, 'rgba(76,195,207,.32)');
  s.addColorStop(0.6, 'rgba(110,86,220,.1)');
  s.addColorStop(1, 'rgba(110,86,220,0)');
  ctx.fillStyle = s;
  ctx.fillRect(-128, -142, 256, 284);
  ctx.restore();
}

const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const bezier = (a, c, b, k) => lerp3(lerp3(a, c, k), lerp3(c, b, k), k);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function tourAt(t) {
  for (let i = 1; i < TOUR.length; i++) {
    const [t1, p1] = TOUR[i];
    const [t0, p0] = TOUR[i - 1];
    if (t <= t1) return lerp3(p0, p1, ease.inOutCubic(clamp01((t - t0) / (t1 - t0 || 1))));
  }
  return TOUR[TOUR.length - 1][1];
}

export function createBuilder(stage, container) {
  const inst = { continuous: true, built: false, scene: null, camera: null };
  let s = null;
  let target = 0;
  let shown = 0;
  let lastNow = null;
  let idleStart = null;
  let onScroll = null;
  const pointer = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };

  inst.build = () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(30, 6 / 5, 0.1, 60);
    const lights = addLights(scene);
    lights.point.position.set(2.4, 1.6, 2.4);
    scene.environment = cosmicEnvironment(stage);

    const textures = [];
    const tex = (w, h, draw) => {
      const c = makeCanvas(w, h);
      draw(c.getContext('2d'));
      const t = canvasTexture(c, stage);
      textures.push(t);
      return t;
    };
    const pageTex = tex(PAGE.tw, PAGE.th, drawPage);
    const cardTex = tex(256, 160, drawCard);
    const fxTex = tex(256, 256, drawFx);

    const rig = new Group();
    scene.add(rig);

    rig.add(new Mesh(roundedSlab(PAGE.w + 0.1, PAGE.h + 0.1, 0.12, 0.12), new MeshStandardMaterial({ color: '#E9EEF2', metalness: 0.5, roughness: 0.28, envMapIntensity: 1.1 })));
    const page = new Mesh(new PlaneGeometry(PAGE.w, PAGE.h), new MeshBasicMaterial({ map: pageTex, toneMapped: false }));
    page.position.z = 0.061;
    rig.add(page);

    const shadow = new Mesh(atlasPlane(5.8, 1.7, [0, 128, 256, 128], 256, 256),
      new MeshBasicMaterial({ map: fxTex, transparent: true, depthWrite: false, toneMapped: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -1.95, 0.35);
    rig.add(shadow);

    // print head: line + glowing trail + a light that rides along
    const scan = new Group();
    const trail = new Mesh(atlasPlane(PAGE.w, 0.6, [0, 0, 256, 128], 256, 256),
      new MeshBasicMaterial({ map: fxTex, transparent: true, depthWrite: false, toneMapped: false }));
    trail.position.y = 0.3;
    const line = new Mesh(new PlaneGeometry(PAGE.w * 0.98, 0.022),
      new MeshBasicMaterial({ color: C.accentLight, transparent: true, depthWrite: false, toneMapped: false }));
    scan.add(trail, line);
    scan.position.z = FACE_Z + 0.004;
    rig.add(scan);
    const scanLight = new PointLight(0x3c8f9c, 0, 3.5, 2);
    rig.add(scanLight);

    const box = new BoxGeometry(1, 1, 1);
    const blocks = new InstancedMesh(box, new MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.4 }), BLOCKS.length);
    const cards = new InstancedMesh(box, new MeshStandardMaterial({ map: cardTex, emissive: 0xffffff, emissiveMap: cardTex, emissiveIntensity: 0.45, metalness: 0.15, roughness: 0.45 }), CARDS.length);
    const outlineMat = new ShaderMaterial({
      uniforms: { uColor: { value: new Color(C.accent) }, uTime: { value: 0 } },
      vertexShader: OUTLINE_VERT,
      fragmentShader: OUTLINE_FRAG,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const outlines = new InstancedMesh(new PlaneGeometry(1, 1), outlineMat, BLOCKS.length + CARDS.length);
    // Instances move far from the base geometry; a stale bounding sphere would cull them.
    [outlines, blocks, cards].forEach((m) => { m.frustumCulled = false; });
    rig.add(outlines, blocks, cards);

    // cursor for the idle tour
    const S = 0.24;
    const darkMat = new MeshStandardMaterial({ color: C.text, metalness: 0.3, roughness: 0.35 });
    const cursor = new Group();
    cursor.add(
      new Mesh(prism([[0, 0], [0, -1], [0.72, -0.72]].map(([x, y]) => [x * S, y * S]), 0.035), darkMat),
      new Mesh(prism([[0.244, -0.737], [0.474, -1.207], [0.626, -1.133], [0.396, -0.663]].map(([x, y]) => [x * S, y * S]), 0.035), darkMat),
    );
    cursor.rotation.z = 0.12;
    cursor.scale.setScalar(0.001);
    rig.add(cursor);

    const rand = rng(23);
    const items = [];
    const make = (mesh, index, x, y, w, h, d, color) => {
      const slot = [x, y, FACE_Z + d / 2];
      const from = [(rand() - 0.5) * 5.4, (rand() - 0.5) * 3.6, 0.7 + rand() * 1.4];
      // Arc bulges towards the camera so blocks visibly «fly in» rather than slide.
      const ctrl = [(from[0] + slot[0]) / 2, (from[1] + slot[1]) / 2 + 0.5, Math.max(from[2], slot[2]) + 1.4];
      items.push({
        mesh, index, slot, from, ctrl, size: [w, h, d],
        rot: [(rand() - 0.5) * 2.2, (rand() - 0.5) * 2.2, (rand() - 0.5) * 1.6],
        base: color ? new Color(color) : null, landedAt: null, lift: 0,
      });
    };
    BLOCKS.forEach(([x, y, w, h, d, col], i) => make(blocks, i, x, y, w, h, d, col));
    CARDS.forEach(([x, y], i) => make(cards, i, x, y, CARD.w, CARD.h, CARD.d, null));
    // Assembly order: top → bottom, so the page reads as being printed.
    items.sort((a, b) => b.slot[1] - a.slot[1]).forEach((it, i, arr) => { it.delay = (i / arr.length) * 0.58; it.outline = i; });
    BLOCKS.forEach((b, i) => blocks.setColorAt(i, new Color(b[5])));

    s = {
      scene, camera, rig, items, blocks, cards, outlines, outlineMat, scan, line, trail, scanLight, cursor,
      textures, dummy: new Object3D(), color: new Color(), flash: new Color(C.accentLight),
    };
    inst.scene = scene;
    inst.camera = camera;
    inst.built = true;
  };

  function measure() {
    const r = container.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 when the stage centre enters at the bottom, 1 when it reaches ~45% from the top.
    return clamp01((vh - (r.top + r.height / 2)) / (vh * 0.55));
  }

  inst.update = (now) => {
    if (!s) return;
    const dt = lastNow === null ? 0.016 : Math.min(0.1, now - lastNow);
    lastNow = now;
    shown += (target - shown) * (1 - Math.exp(-dt * 4.5));
    if (Math.abs(target - shown) < 1e-4) shown = target;
    const P = shown;
    const k = 1 - Math.exp(-dt * 3);
    look.x += (pointer.x - look.x) * k;
    look.y += (pointer.y - look.y) * k;

    const idle = smooth(0.94, 1, P);
    if (idle > 0.5 && idleStart === null) idleStart = now;
    if (idle < 0.05) idleStart = null;
    const tour = idleStart === null ? -1 : (now - idleStart) % 8;

    const { camera, rig, dummy, items } = s;
    camera.position.set(0, 0.45 - 0.1 * P, 10.4 - 1.3 * ease.inOutCubic(P));
    camera.lookAt(0, -0.05, 0);
    rig.rotation.set(
      0.18 - 0.12 * P + look.y * 0.06 + Math.sin(now * 0.5) * 0.02 * idle,
      -0.66 + 0.46 * P + look.x * 0.14 + Math.sin(now * 0.35) * 0.05 * idle,
      0,
    );

    // cursor tour + its effects on the CTA and cards
    let click = 0;
    if (tour >= 0) {
      const cp = tourAt(tour);
      s.cursor.position.set(cp[0], cp[1], cp[2]);
      const press = tour > CLICK_AT && tour < CLICK_AT + 0.22 ? Math.sin(((tour - CLICK_AT) / 0.22) * Math.PI) : 0;
      s.cursor.scale.setScalar(Math.max(0.001, idle * (1 - press * 0.14)));
      if (tour > CLICK_AT) click = Math.exp(-(tour - CLICK_AT) * 3.2);
    } else {
      s.cursor.scale.setScalar(0.001);
    }
    const hover = [0, 0, 0];
    for (const [a, b, card] of HOVERS) hover[card] = tour < 0 ? 0 : smooth(a - 0.3, a, tour) * (1 - smooth(b, b + 0.4, tour));

    let colorsDirty = false;
    for (const it of items) {
      const p = clamp01((P - it.delay) / 0.32);
      const e = ease.outCubic(p);
      if (p >= 1) { if (it.landedAt === null) it.landedAt = now; } else it.landedAt = null;
      const flash = it.landedAt === null ? 0 : Math.exp(-(now - it.landedAt) * 4);
      const pos = bezier(it.from, it.ctrl, it.slot, e);
      const isCard = it.mesh === s.cards;
      if (isCard) {
        pos[2] += (Math.sin(now * 1.6 + it.index * 0.9) * 0.03 + hover[it.index] * 0.16) * idle;
        pos[1] += hover[it.index] * 0.04 * idle;
      }
      const bump = 1 + 0.1 * flash + (it.index === CTA && !isCard ? click * 0.12 : 0);
      dummy.position.set(pos[0], pos[1], pos[2]);
      dummy.rotation.set(it.rot[0] * (1 - e), it.rot[1] * (1 - e), it.rot[2] * (1 - e));
      dummy.scale.set(it.size[0] * bump, it.size[1] * bump, it.size[2] * (1 + 0.6 * flash));
      dummy.updateMatrix();
      it.mesh.setMatrixAt(it.index, dummy.matrix);

      if (it.base) {
        let mix = flash * 0.65;
        if (it.index === CTA) mix = Math.max(mix, click * 0.8, (0.5 + 0.5 * Math.sin(now * 2.4)) * 0.18 * idle);
        s.color.copy(it.base).lerp(s.flash, mix);
        it.mesh.setColorAt(it.index, s.color);
        colorsDirty = true;
      }

      const o = 1 - ease.inOutCubic(clamp01((p - 0.82) / 0.18));
      dummy.position.set(it.slot[0], it.slot[1], FACE_Z + 0.003);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(Math.max(1e-4, it.size[0] * o), Math.max(1e-4, it.size[1] * o), 1);
      dummy.updateMatrix();
      s.outlines.setMatrixAt(it.outline, dummy.matrix);
    }
    s.blocks.instanceMatrix.needsUpdate = true;
    s.cards.instanceMatrix.needsUpdate = true;
    s.outlines.instanceMatrix.needsUpdate = true;
    if (colorsDirty) s.blocks.instanceColor.needsUpdate = true;
    s.outlineMat.uniforms.uTime.value = now;

    // print head sweeps top → bottom slightly ahead of the landing blocks
    const sweep = clamp01((P - 0.02) / 0.8);
    const y = 1.42 - sweep * 2.9;
    const vis = smooth(0, 0.06, P) * (1 - smooth(0.82, 0.96, P));
    s.scan.position.y = y;
    s.scan.visible = vis > 0.002;
    s.line.material.opacity = 0.95 * vis;
    s.trail.material.opacity = vis;
    s.scanLight.position.set(0, y, 1.0);
    s.scanLight.intensity = 7 * vis;
  };

  inst.resize = (w, h) => {
    if (!s) return;
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  };

  inst.pointer = (x, y) => {
    pointer.x = x;
    pointer.y = y;
  };

  inst.activate = () => {
    target = measure();
    lastNow = null;
    // measured at most once per frame (scroll can fire several times between frames)
    let queued = false;
    onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; if (onScroll) target = measure(); });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  };

  inst.deactivate = () => {
    if (onScroll) window.removeEventListener('scroll', onScroll);
    onScroll = null;
    pointer.x = 0;
    pointer.y = 0;
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
