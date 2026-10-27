// Shared WebGL stage: one renderer whose canvas moves between the hero and the
// builder containers. Only the most visible scene renders; inactive scenes are
// paused and their GPU resources freed after a few seconds out of view.
import {
  WebGLRenderer, BufferGeometry, BufferAttribute, PlaneGeometry, CanvasTexture,
  HemisphereLight, DirectionalLight, PointLight, SRGBColorSpace, ACESFilmicToneMapping,
  PMREMGenerator, Scene, Mesh, SphereGeometry, MeshBasicMaterial, BackSide,
} from '../vendor/three.custom.min.js';

export const FONT = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Roboto, Arial, sans-serif';
export const MONO = 'Consolas, "SF Mono", Menlo, "Roboto Mono", monospace';
export const C = {
  bg: '#FAF8F5', surface: '#FFFFFF', surface2: '#F3F0EA', text: '#16181B', muted: '#5A5F63',
  line: '#E5E0D8', bar: '#D9D4CB', bar2: '#C9C4BB', accent: '#1E5A66', accentLight: '#3C8F9C', accentSoft: '#E4EEEF',
  body: '#F1EDE6',
};

/* ---------- geometry ---------- */

// Slab with rounded corners in XY and a soft bevel on both faces. UVs on the caps span 0..1.
export function roundedSlab(w, h, d, r, seg = 8, bevel = Math.min(d * 0.35, r * 0.5)) {
  r = Math.min(r, w / 2, h / 2);
  const ring = (inset) => {
    const rr = Math.max(r - inset, 1e-4);
    const hw = w / 2 - inset;
    const hh = h / 2 - inset;
    const pts = [];
    const corners = [[hw - rr, hh - rr, 0], [-hw + rr, hh - rr, Math.PI / 2], [-hw + rr, -hh + rr, Math.PI], [hw - rr, -hh + rr, Math.PI * 1.5]];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * (Math.PI / 2);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, Math.cos(a), Math.sin(a)]);
      }
    }
    return pts;
  };
  const inner = ring(bevel);
  const outer = ring(0);
  const pos = [];
  const nor = [];
  const uv = [];
  const n3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
  const push = (p, n, u) => { pos.push(...p); nor.push(...n); uv.push(...u); };
  const capUv = (x, y) => [(x + w / 2) / w, (y + h / 2) / h];

  const cap = (pts, z, dir) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const tri = dir > 0 ? [[0, 0], a, b] : [[0, 0], b, a];
      for (const p of tri) push([p[0], p[1], z], [0, 0, dir], capUv(p[0], p[1]));
    }
  };
  const band = (A, zA, nA, B, zB, nB) => {
    for (let i = 0; i < A.length; i++) {
      const j = (i + 1) % A.length;
      const a0 = A[i]; const a1 = A[j]; const b0 = B[i]; const b1 = B[j];
      const va0 = [a0[0], a0[1], zA]; const va1 = [a1[0], a1[1], zA];
      const vb0 = [b0[0], b0[1], zB]; const vb1 = [b1[0], b1[1], zB];
      const u0 = i / A.length; const u1 = (i + 1) / A.length;
      push(va0, nA(a0), [u0, 1]); push(vb0, nB(b0), [u0, 0]); push(vb1, nB(b1), [u1, 0]);
      push(va0, nA(a0), [u0, 1]); push(vb1, nB(b1), [u1, 0]); push(va1, nA(a1), [u1, 1]);
    }
  };

  const zf = d / 2;
  const zb = -d / 2;
  cap(inner, zf, 1);
  band(inner, zf, (p) => n3(p[2] * 0.45, p[3] * 0.45, 1), outer, zf - bevel, (p) => n3(p[2], p[3], 0.45));
  band(outer, zf - bevel, (p) => [p[2], p[3], 0], outer, zb + bevel, (p) => [p[2], p[3], 0]);
  band(outer, zb + bevel, (p) => n3(p[2], p[3], -0.45), inner, zb, (p) => n3(p[2] * 0.45, p[3] * 0.45, -1));
  cap(inner, zb, -1);

  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.computeBoundingSphere();
  return g;
}

// Extruded convex polygon (CCW points), flat-shaded sides.
export function prism(points, depth) {
  const pos = [];
  const nor = [];
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const zf = depth / 2;
  const zb = -depth / 2;
  const tri = (a, b, c, n) => { pos.push(...a, ...b, ...c); nor.push(...n, ...n, ...n); };
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    tri([cx, cy, zf], [a[0], a[1], zf], [b[0], b[1], zf], [0, 0, 1]);
    tri([cx, cy, zb], [b[0], b[1], zb], [a[0], a[1], zb], [0, 0, -1]);
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l = Math.hypot(ex, ey) || 1;
    const n = [ey / l, -ex / l, 0];
    tri([a[0], a[1], zf], [a[0], a[1], zb], [b[0], b[1], zb], n);
    tri([a[0], a[1], zf], [b[0], b[1], zb], [b[0], b[1], zf], n);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.computeBoundingSphere();
  return g;
}

// Plane whose UVs cover a pixel rect [x, y, w, h] of an atlas of size [aw, ah].
export function atlasPlane(w, h, rect, aw, ah) {
  const g = new PlaneGeometry(w, h);
  const [x, y, rw, rh] = rect;
  const u0 = x / aw; const u1 = (x + rw) / aw;
  const v1 = 1 - y / ah; const v0 = 1 - (y + rh) / ah;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  return g;
}

/* ---------- procedural textures ---------- */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(canvas, stage) {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = Math.min(8, stage?.maxAniso || 4);
  return t;
}

export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function fillRR(ctx, color, x, y, w, h, r) {
  ctx.fillStyle = color;
  rr(ctx, x, y, w, h, r);
  ctx.fill();
}

export function strokeRR(ctx, color, lw, x, y, w, h, r) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  rr(ctx, x + lw / 2, y + lw / 2, w - lw, h - lw, r);
  ctx.stroke();
}

export function dot(ctx, color, x, y, r) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/* ---------- lights ---------- */
export function addLights(scene) {
  const hemi = new HemisphereLight(0xdff6ff, 0x1a1640, 0.7);
  const dir = new DirectionalLight(0xffffff, 1.9);
  dir.position.set(-4, 6, 6);
  const point = new PointLight(0x4cc3cf, 18, 0, 2);
  point.position.set(1.8, 1.2, 1.6);
  // violet rim from behind: outlines the bodies against the dark sky
  const rim = new PointLight(0x8b6cff, 26, 0, 2);
  rim.position.set(-2.4, 1.9, -2.8);
  scene.add(hemi, dir, point, rim);
  return { hemi, dir, point, rim };
}

// Procedural «nebula» environment, prefiltered once per renderer: metallic bodies reflect space.
export function cosmicEnvironment(stage) {
  if (stage.env) return stage.env;
  const c = makeCanvas(512, 256);
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#0B0F2A');
  sky.addColorStop(0.42, '#14324A');
  sky.addColorStop(0.55, '#1E6F7A');
  sky.addColorStop(0.7, '#0E1730');
  sky.addColorStop(1, '#05070D');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  const blob = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(120, 112, 96, 'rgba(76,195,207,.9)');
  blob(380, 92, 120, 'rgba(140,90,220,.85)');
  blob(262, 58, 34, 'rgba(255,255,255,.95)');
  blob(40, 150, 60, 'rgba(110,86,220,.6)');
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const scene = new Scene();
  const sphere = new Mesh(new SphereGeometry(10, 32, 16), new MeshBasicMaterial({ map: tex, side: BackSide }));
  scene.add(sphere);
  const pmrem = new PMREMGenerator(stage.renderer);
  stage.envTarget = pmrem.fromScene(scene, 0.02);
  stage.env = stage.envTarget.texture;
  sphere.geometry.dispose();
  sphere.material.dispose();
  tex.dispose();
  pmrem.dispose();
  return stage.env;
}

export function disposeAll(scene, textures = []) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
  textures.forEach((t) => t.dispose());
}

export const ease = {
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outBack: (x) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2,
};
export const clamp01 = (x) => Math.min(1, Math.max(0, x));

/* ---------- stage ---------- */
export class Stage {
  constructor({ preserveDrawingBuffer = false } = {}) {
    const r = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer });
    r.outputColorSpace = SRGBColorSpace;
    r.toneMapping = ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.setClearColor(0x000000, 0);
    this.renderer = r;
    this.canvas = r.domElement;
    this.canvas.setAttribute('aria-hidden', 'true');
    this.maxAniso = r.capabilities.getMaxAnisotropy();
    this.dprCap = 2;
    this.slots = [];
    this.active = null;
    this.loopId = 0;
    this.queued = false;
    this.last = 0;
    this.slow = 0;
    this.suspended = false;
    this.failed = false;
  }

  register(container, factory) {
    this.slots.push({ container, factory, instance: null, pending: null, ratio: 0, near: false, idleSince: performance.now() });
  }

  async ensure(slot) {
    if (slot.instance && slot.instance.built) return slot.instance;
    if (!slot.pending) {
      slot.pending = (async () => {
        if (!slot.instance) slot.instance = await slot.factory();
        if (!slot.instance.built) slot.instance.build();
        return slot.instance;
      })().finally(() => { slot.pending = null; });
    }
    return slot.pending;
  }

  pick() {
    if (this.failed || this.suspended) return;
    // Hysteresis: a new scene wins only when clearly more visible than the current one.
    let best = this.active && this.active.ratio > 0 ? this.active : null;
    for (const s of this.slots) {
      if (s !== best && s.ratio > 0 && (!best || s.ratio > best.ratio + 0.05)) best = s;
    }
    if (!best) { this.stop(); return; }
    if (best !== this.active) this.activate(best);
    else if (best.instance?.continuous && !this.loopId) this.loop();
  }

  async activate(slot) {
    const prev = this.active;
    this.active = slot;
    this.stop();
    if (prev && prev !== slot) {
      prev.container.classList.remove('is-live');
      prev.instance?.deactivate?.();
      prev.idleSince = performance.now();
    }
    let inst;
    try {
      inst = await this.ensure(slot);
    } catch (err) {
      console.warn('[3d] scene failed:', err);
      return;
    }
    if (this.active !== slot || this.failed || this.suspended) return;
    slot.container.append(this.canvas);
    this.resize();
    inst.activate?.();
    this.frame(performance.now());
    requestAnimationFrame(() => slot.container.classList.add('is-live'));
    if (inst.continuous) this.loop();
  }

  frame(now) {
    const inst = this.active?.instance;
    if (!inst || !inst.built) return;
    inst.update(now / 1000);
    this.renderer.render(inst.scene, inst.camera);
  }

  loop() {
    if (this.loopId) return;
    this.last = 0;
    const tick = (now) => {
      this.loopId = 0;
      if (!this.active || document.hidden || this.suspended || this.failed) return;
      const dt = this.last ? now - this.last : 16;
      this.last = now;
      this.frame(now);
      this.adapt(dt);
      if (this.active.instance?.continuous) this.loopId = requestAnimationFrame(tick);
    };
    this.loopId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.loopId) cancelAnimationFrame(this.loopId);
    this.loopId = 0;
  }

  requestRender() {
    if (this.queued || !this.active) return;
    this.queued = true;
    requestAnimationFrame((now) => {
      this.queued = false;
      if (!document.hidden && !this.suspended && !this.failed) this.frame(now);
    });
  }

  // 30 slow frames in a row → drop to DPR 1 once.
  adapt(dt) {
    this.slow = dt > 22 ? this.slow + 1 : 0;
    if (this.slow >= 30 && this.dprCap > 1) {
      this.dprCap = 1;
      this.resize();
    }
  }

  resize() {
    const slot = this.active;
    if (!slot || !slot.instance) return;
    const w = slot.container.clientWidth;
    const h = slot.container.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap, Math.sqrt(1.6e6 / (w * h)));
    this.renderer.setPixelRatio(Math.max(0.75, dpr));
    this.renderer.setSize(w, h, false);
    slot.instance.resize(w, h);
  }

  suspend(on) {
    this.suspended = on;
    if (on) {
      this.stop();
      this.slots.forEach((s) => s.container.classList.remove('is-live'));
      this.active?.instance?.deactivate?.();
      this.canvas.remove();
      this.active = null;
    } else {
      this.pick();
    }
  }

  fail() {
    this.failed = true;
    this.stop();
    this.slots.forEach((s) => s.container.classList.remove('is-live'));
    this.canvas.remove();
  }

  sweep() {
    const now = performance.now();
    for (const s of this.slots) {
      if (s === this.active || s.near || !s.instance?.built) continue;
      if (now - s.idleSince > 5000) s.instance.dispose();
    }
  }
}

export function start({ hero, builder }, { forced = new URLSearchParams(location.search).get('3d') === '1' } = {}) {
  const stage = new Stage();
  stage.register(hero, () => import('./hero3d.js').then((m) => m.createHero(stage)));
  if (builder) stage.register(builder, () => import('./scene-b.js').then((m) => m.createBuilder(stage, builder)));

  stage.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stage.fail();
  });

  const visible = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const slot = stage.slots.find((s) => s.container === en.target);
      if (slot) slot.ratio = en.isIntersecting ? en.intersectionRatio : 0;
    }
    stage.pick();
  }, { threshold: [0, 0.05, 0.15, 0.3, 0.5, 0.75, 1] });

  const near = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const slot = stage.slots.find((s) => s.container === en.target);
      if (!slot) continue;
      slot.near = en.isIntersecting;
      if (!slot.near) slot.idleSince = performance.now();
      else if (slot !== stage.active) {
        const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
        idle(() => { if (slot.near && !stage.failed) stage.ensure(slot).catch(() => {}); });
      }
    }
  }, { rootMargin: '60% 0px' });

  stage.slots.forEach((s) => { visible.observe(s.container); near.observe(s.container); });

  const ro = new ResizeObserver(() => {
    if (!stage.active) return;
    stage.resize();
    if (!stage.active.instance?.continuous) stage.requestRender();
  });
  stage.slots.forEach((s) => ro.observe(s.container));

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.stop();
    else stage.pick();
  });
  // A dialog (assistant, case, viewer) covers the page: no point drawing 3D underneath it.
  document.addEventListener('xl:ui', () => {
    if (document.documentElement.classList.contains('is-locked')) stage.stop();
    else stage.pick();
  });

  if (!forced) {
    const wide = matchMedia('(min-width: 1024px)');
    wide.addEventListener('change', () => stage.suspend(!wide.matches));
  }

  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      stage.active?.instance?.pointer?.((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    }, { passive: true });
  }

  setInterval(() => stage.sweep(), 2000);
  return stage;
}
