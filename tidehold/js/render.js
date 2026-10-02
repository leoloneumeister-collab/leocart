// Scene renderer: camera, island ground, depth-sorted buildings and troops, effects and overlays.
// It only reads a "scene" object built by main.js, so it knows nothing about game rules.

import * as D from './data.js';
import * as A from './art.js';
import { fmtTime } from './data.js';
import { mulberry32, clamp } from './util.js';

const { TW, TH } = A;
const HW = TW / 2;
const HH = TH / 2;
const L0 = D.LAND0;
const L1 = D.LAND1;
const B0 = D.BUILD0;
const B1 = D.BUILD1;

export class Camera {
  constructor() {
    this.cx = 17;
    this.cy = 17;
    this.zoom = 0.45;
    this.w = 360;
    this.h = 640;
    this.sx = 0;
    this.sy = 0;
  }

  toScreen(x, y, z = 0) {
    const k = this.zoom;
    return [this.w / 2 + this.sx + (x - this.cx - (y - this.cy)) * HW * k, this.h / 2 + this.sy + (x - this.cx + (y - this.cy)) * HH * k - z * k];
  }

  toWorld(px, py, z = 0) {
    const k = this.zoom;
    const a = (px - this.w / 2 - this.sx) / (HW * k);
    const b = (py - this.h / 2 - this.sy + z * k) / (HH * k);
    return [this.cx + (a + b) / 2, this.cy + (b - a) / 2];
  }

  panBy(dx, dy) {
    const [a, b] = this.toWorld(this.w / 2, this.h / 2);
    const [a2, b2] = this.toWorld(this.w / 2 - dx, this.h / 2 - dy);
    this.cx += a2 - a;
    this.cy += b2 - b;
    this.clamp();
  }

  zoomAt(factor, px, py) {
    const [wx, wy] = this.toWorld(px, py);
    this.zoom = clamp(this.zoom * factor, this.minZoom(), 1.5);
    const [wx2, wy2] = this.toWorld(px, py);
    this.cx += wx - wx2;
    this.cy += wy - wy2;
    this.clamp();
  }

  clamp() {
    this.cx = clamp(this.cx, L0, L1);
    this.cy = clamp(this.cy, L0, L1);
    this.zoom = clamp(this.zoom, this.minZoom(), 1.5);
  }

  minZoom() {
    return Math.max(0.24, Math.min(this.w / (D.MAP * TW * 0.62), 0.5));
  }
}

const WAVES = (() => {
  const r = mulberry32(5);
  return Array.from({ length: 70 }, () => ({ a: r() * Math.PI * 2, d: 0.55 + r() * 0.9, ph: r() * 6.28, sp: 0.3 + r() * 0.5, len: 8 + r() * 14 }));
})();

const PALMS = (() => {
  const r = mulberry32(21);
  const out = [];
  for (let i = L0 + 1; i < L1 - 1; i += 2 + Math.floor(r() * 3)) {
    if (r() < 0.8) out.push({ x: i + 0.5, y: L0 + 0.5 + r() * 0.6, s: 0.8 + r() * 0.3 });
    if (r() < 0.8) out.push({ x: i + 0.5, y: L1 - 1.1 + r() * 0.6, s: 0.8 + r() * 0.3 });
    if (r() < 0.8) out.push({ x: L0 + 0.5 + r() * 0.6, y: i + 0.5, s: 0.8 + r() * 0.3 });
    if (r() < 0.8) out.push({ x: L1 - 1.1 + r() * 0.6, y: i + 0.5, s: 0.8 + r() * 0.3 });
  }
  return out;
})();

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.cam = new Camera();
    this.dpr = 1;
    this.t = 0;
    this.fx = [];
    this.jolt = new Map();
    this.shake = 0;
    this.R = 1;
    this.stats = { frames: 0 };
  }

  resize(w, h, dpr) {
    this.dpr = dpr;
    this.cam.w = w;
    this.cam.h = h;
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.cam.clamp();
  }

  // ---------- effects ----------

  add(p) {
    if (this.fx.length > 500) this.fx.shift();
    this.fx.push(p);
  }

  ingest(events) {
    for (const e of events) {
      switch (e.t) {
        case 'shot': {
          this.add({ k: 'proj', kind: e.kind, fx: e.fx, fy: e.fy, tx: e.tx, ty: e.ty, life: 0, max: e.flight, arc: e.kind === 'mortar' ? 70 : e.kind === 'sling' ? 10 : 6 });
          if (e.kind !== 'sling') this.add({ k: 'puff', x: e.fx, y: e.fy, z: 22, life: 0, max: 0.35, r: 6, c: 'rgba(255,230,160,0.9)' });
          break;
        }
        case 'boom': {
          const big = e.kind === 'trap' || e.kind === 'sapper';
          this.add({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.45, r: e.r, c: e.kind === 'shell' ? '255,170,60' : '255,120,50' });
          this.add({ k: 'puff', x: e.x, y: e.y, z: 6, life: 0, max: 0.4, r: e.r * 22, c: 'rgba(255,200,90,0.9)' });
          for (let i = 0; i < (big ? 14 : 8); i++) this.spark(e.x, e.y, 6, 2.5 + Math.random() * 2.5);
          for (let i = 0; i < 4; i++) this.smoke(e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * e.r, 8, 0.9);
          this.shake = Math.max(this.shake, big ? 5 : 2.5);
          break;
        }
        case 'destroyed': {
          const n = Math.min(26, 8 + e.size * 4);
          for (let i = 0; i < n; i++) this.debris(e.x, e.y, e.size);
          for (let i = 0; i < 5 + e.size; i++) this.smoke(e.x + (Math.random() - 0.5) * e.size * 0.7, e.y + (Math.random() - 0.5) * e.size * 0.7, 10, 1.6);
          this.add({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.5, r: e.size * 0.9, c: '255,225,170' });
          if (e.type !== 'wall' && e.type !== 'bomb') this.shake = Math.max(this.shake, 3 + e.size);
          break;
        }
        case 'hit': {
          this.jolt.set(e.id, 0.12);
          if (Math.random() < 0.5) this.spark(e.x + (Math.random() - 0.5), e.y + (Math.random() - 0.5), 14, 1.2);
          break;
        }
        case 'die': {
          this.add({ k: 'puff', x: e.x, y: e.y, z: 8, life: 0, max: 0.45, r: 10, c: 'rgba(255,255,255,0.9)' });
          for (let i = 0; i < 5; i++) this.spark(e.x, e.y, 8, 1.5);
          break;
        }
        case 'deploy': {
          this.add({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.35, r: 0.8, c: '255,255,255' });
          break;
        }
        case 'beacon': {
          this.add({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.9, r: 4.5, c: '90,200,255' });
          break;
        }
        default:
      }
    }
  }

  spark(x, y, z, speed) {
    const a = Math.random() * Math.PI * 2;
    this.add({ k: 'spark', x, y, z, vx: Math.cos(a) * speed * 0.5, vy: Math.sin(a) * speed * 0.5, vz: 40 + Math.random() * 60, life: 0, max: 0.35 + Math.random() * 0.3 });
  }

  smoke(x, y, z, scale) {
    this.add({ k: 'smoke', x, y, z, vz: 14 + Math.random() * 14, life: 0, max: 0.9 + Math.random() * 0.8, r: (6 + Math.random() * 6) * scale });
  }

  debris(x, y, size) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.8 + Math.random() * 2.2;
    this.add({ k: 'debris', x: x + (Math.random() - 0.5) * size * 0.6, y: y + (Math.random() - 0.5) * size * 0.6, z: 10 + Math.random() * 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 60 + Math.random() * 90, life: 0, max: 0.9 + Math.random() * 0.5, c: Math.random() < 0.5 ? '#8d867b' : '#5d564d', sz: 2 + Math.random() * 3 });
  }

  floatText(x, y, text, color, z = 40) {
    this.add({ k: 'text', x, y, z, text, color, life: 0, max: 1.3 });
  }

  update(dt) {
    this.t += dt;
    for (const [id, v] of this.jolt) {
      if (v - dt <= 0) this.jolt.delete(id);
      else this.jolt.set(id, v - dt);
    }
    this.shake = Math.max(0, this.shake - dt * 14);
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i];
      p.life += dt;
      if (p.life >= p.max) {
        this.fx.splice(i, 1);
        continue;
      }
      if (p.vx !== undefined) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.k === 'spark' || p.k === 'debris') {
        p.vz -= 260 * dt;
        p.z += p.vz * dt;
        if (p.z < 0) { p.z = 0; p.vz *= -0.3; if (p.k === 'debris') { p.vx *= 0.5; p.vy *= 0.5; } }
      } else if (p.k === 'smoke' || p.k === 'text') {
        p.z += (p.vz || 22) * dt;
      }
    }
  }

  // ---------- picking ----------

  // Returns the front-most building / obstacle under a screen point.
  pick(px, py, scene) {
    const cam = this.cam;
    let best = null;
    let bk = -1e9;
    const consider = (kind, o, size) => {
      for (let z = 0; z <= 90; z += 10) {
        const [wx, wy] = cam.toWorld(px, py, z);
        if (wx >= o.x && wx < o.x + size && wy >= o.y && wy < o.y + size) {
          const k = o.x + o.y + size;
          if (k > bk) { bk = k; best = { kind, id: o.id, o }; }
          return;
        }
      }
    };
    for (const b of scene.buildings) {
      if (b.alive === false) continue;
      consider('building', b, D.BUILDINGS[b.type].size);
    }
    for (const o of scene.obstacles || []) consider('obstacle', o, o.size);
    return best;
  }

  // ---------- frame ----------

  frame(scene) {
    const g = this.g;
    const cam = this.cam;
    const z = cam.zoom;
    this.R = clamp(Math.ceil(z * this.dpr), 1, 3);
    const sh = this.shake;
    cam.sx = sh ? (Math.random() - 0.5) * sh : 0;
    cam.sy = sh ? (Math.random() - 0.5) * sh : 0;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    this.drawWater(g);
    this.drawGround(g, scene);
    if (scene.mode === 'battle' && scene.showRed) this.drawRedZone(g, scene);
    if (scene.ghost || scene.showGrid) this.drawGrid(g, scene);
    if (scene.selected) this.drawSelection(g, scene);
    if (scene.beacon) this.drawBeacon(g, scene.beacon);
    this.drawEntities(g, scene);
    this.drawFx(g, scene);
    this.drawOverlays(g, scene);
    this.stats.frames++;
  }

  drawWater(g) {
    const { w, h } = this.cam;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3aa5dc');
    grad.addColorStop(1, '#2a86c4');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    const cam = this.cam;
    g.lineCap = 'round';
    g.lineWidth = Math.max(1.2, 2 * cam.zoom);
    const cxm = (L0 + L1) / 2;
    for (const wv of WAVES) {
      const rad = (L1 - L0) * 0.5 * (1.08 + wv.d * 0.55);
      const x = cxm + Math.cos(wv.a) * rad;
      const y = cxm + Math.sin(wv.a) * rad;
      const al = 0.1 + 0.25 * (0.5 + 0.5 * Math.sin(this.t * wv.sp + wv.ph));
      const [px, py] = cam.toScreen(x, y);
      if (px < -40 || py < -20 || px > w + 40 || py > h + 20) continue;
      g.strokeStyle = `rgba(255,255,255,${al})`;
      const l = wv.len * cam.zoom * 1.4;
      g.beginPath();
      g.moveTo(px - l, py);
      g.quadraticCurveTo(px, py - l * 0.35, px + l, py);
      g.stroke();
    }
  }

  drawGround(g, scene) {
    const cam = this.cam;
    const z = cam.zoom;
    const N = cam.toScreen(L0, L0);
    const E = cam.toScreen(L1, L0);
    const S = cam.toScreen(L1, L1);
    const W = cam.toScreen(L0, L1);
    const depth = 30 * z;
    // soft shadow in the water
    g.fillStyle = 'rgba(10,50,90,0.25)';
    g.beginPath();
    g.moveTo(W[0] - 6 * z, W[1] + depth + 4 * z);
    g.lineTo(S[0], S[1] + depth + 10 * z);
    g.lineTo(E[0] + 6 * z, E[1] + depth + 4 * z);
    g.lineTo(S[0], S[1] + depth + 22 * z);
    g.closePath();
    g.fill();
    // cliff faces
    let grad = g.createLinearGradient(0, W[1], 0, W[1] + depth);
    grad.addColorStop(0, '#b0804f');
    grad.addColorStop(1, '#7c5230');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(W[0], W[1]);
    g.lineTo(S[0], S[1]);
    g.lineTo(S[0], S[1] + depth);
    g.lineTo(W[0], W[1] + depth);
    g.closePath();
    g.fill();
    grad = g.createLinearGradient(0, E[1], 0, E[1] + depth);
    grad.addColorStop(0, '#8e6339');
    grad.addColorStop(1, '#5f3d22');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(S[0], S[1]);
    g.lineTo(E[0], E[1]);
    g.lineTo(E[0], E[1] + depth);
    g.lineTo(S[0], S[1] + depth);
    g.closePath();
    g.fill();
    // strata
    g.strokeStyle = 'rgba(0,0,0,0.12)';
    g.lineWidth = 1;
    for (const f of [0.35, 0.7]) {
      g.beginPath();
      g.moveTo(W[0], W[1] + depth * f);
      g.lineTo(S[0], S[1] + depth * f);
      g.lineTo(E[0], E[1] + depth * f);
      g.stroke();
    }
    // beach
    g.fillStyle = PAL_SAND;
    g.beginPath();
    g.moveTo(N[0], N[1]);
    g.lineTo(E[0], E[1]);
    g.lineTo(S[0], S[1]);
    g.lineTo(W[0], W[1]);
    g.closePath();
    g.fill();
    // grass
    const i0 = L0 + 1;
    const i1 = L1 - 1;
    const gN = cam.toScreen(i0, i0);
    const gE = cam.toScreen(i1, i0);
    const gS = cam.toScreen(i1, i1);
    const gW = cam.toScreen(i0, i1);
    g.fillStyle = '#8fd46d';
    g.beginPath();
    g.moveTo(gN[0], gN[1]);
    g.lineTo(gE[0], gE[1]);
    g.lineTo(gS[0], gS[1]);
    g.lineTo(gW[0], gW[1]);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(80,140,60,0.5)';
    g.lineWidth = 2 * z;
    g.stroke();
    // checkerboard
    g.fillStyle = 'rgba(70,150,60,0.16)';
    g.beginPath();
    for (let y = i0; y < i1; y++) {
      for (let x = i0 + ((y + i0) & 1); x < i1; x += 2) {
        const a = cam.toScreen(x, y);
        if (a[0] < -HW * z * 2 || a[0] > cam.w + HW * z * 2 || a[1] < -TH * z * 2 || a[1] > cam.h + TH * z) continue;
        g.moveTo(a[0], a[1]);
        g.lineTo(a[0] + HW * z, a[1] + HH * z);
        g.lineTo(a[0], a[1] + TH * z);
        g.lineTo(a[0] - HW * z, a[1] + HH * z);
        g.closePath();
      }
    }
    g.fill();
    // build area
    const bN = cam.toScreen(B0, B0);
    const bE = cam.toScreen(B1, B0);
    const bS = cam.toScreen(B1, B1);
    const bW = cam.toScreen(B0, B1);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.moveTo(bN[0], bN[1]);
    g.lineTo(bE[0], bE[1]);
    g.lineTo(bS[0], bS[1]);
    g.lineTo(bW[0], bW[1]);
    g.closePath();
    g.fill();
    // foam
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 1.6);
    g.strokeStyle = `rgba(255,255,255,${0.55 + pulse * 0.25})`;
    g.lineWidth = 3 * z;
    g.beginPath();
    g.moveTo(W[0], W[1]);
    g.lineTo(N[0], N[1]);
    g.lineTo(E[0], E[1]);
    g.lineTo(S[0], S[1]);
    g.lineTo(W[0], W[1]);
    g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.2 + (1 - pulse) * 0.2})`;
    g.lineWidth = 2 * z;
    const o = (3 + pulse * 3) * z;
    g.beginPath();
    g.moveTo(W[0] - o, W[1]);
    g.lineTo(N[0], N[1] - o * 0.5);
    g.lineTo(E[0] + o, E[1]);
    g.lineTo(S[0], S[1] + o * 0.5);
    g.closePath();
    g.stroke();
  }

  tilePoly(g, x, y, w, h, z0 = 0) {
    const cam = this.cam;
    const a = cam.toScreen(x, y, z0);
    const b = cam.toScreen(x + w, y, z0);
    const c = cam.toScreen(x + w, y + h, z0);
    const d = cam.toScreen(x, y + h, z0);
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.lineTo(c[0], c[1]);
    g.lineTo(d[0], d[1]);
    g.closePath();
  }

  drawGrid(g, scene) {
    const cam = this.cam;
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = B0; i <= B1; i++) {
      const a = cam.toScreen(i, B0);
      const b = cam.toScreen(i, B1);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      const c = cam.toScreen(B0, i);
      const d = cam.toScreen(B1, i);
      g.moveTo(c[0], c[1]);
      g.lineTo(d[0], d[1]);
    }
    g.stroke();
    const gh = scene.ghost;
    if (gh) {
      g.fillStyle = gh.valid ? 'rgba(80,230,110,0.42)' : 'rgba(255,70,70,0.42)';
      g.beginPath();
      this.tilePoly(g, gh.x, gh.y, gh.size, gh.size);
      g.fill();
      g.strokeStyle = gh.valid ? '#35c85a' : '#ff4a4a';
      g.lineWidth = 2.5;
      g.stroke();
    }
    // outline everything that is already placed so free space is easy to see
    g.fillStyle = 'rgba(0,0,0,0.1)';
    g.beginPath();
    for (const b of scene.buildings) this.tilePoly(g, b.x, b.y, D.BUILDINGS[b.type].size, D.BUILDINGS[b.type].size);
    for (const o of scene.obstacles || []) this.tilePoly(g, o.x, o.y, o.size, o.size);
    g.fill();
  }

  drawRedZone(g, scene) {
    const m = D.RED_ZONE;
    g.fillStyle = 'rgba(255,40,40,0.24)';
    g.strokeStyle = 'rgba(255,60,60,0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (const b of scene.buildings) {
      if (!b.alive || b.type === 'bomb') continue;
      const s = D.BUILDINGS[b.type].size;
      this.tilePoly(g, b.x - m, b.y - m, s + m * 2, s + m * 2);
    }
    g.fill();
    g.stroke();
  }

  drawSelection(g, scene) {
    const sel = scene.selected;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    g.fillStyle = `rgba(255,255,255,${0.2 + pulse * 0.15})`;
    g.strokeStyle = '#fff';
    g.lineWidth = 2.5;
    g.beginPath();
    this.tilePoly(g, sel.x - 0.1, sel.y - 0.1, sel.size + 0.2, sel.size + 0.2);
    g.fill();
    g.stroke();
    if (sel.range) {
      const [cx, cy] = [sel.x + sel.size / 2, sel.y + sel.size / 2];
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.lineWidth = 2;
      g.setLineDash([8, 6]);
      this.isoCircle(g, cx, cy, sel.range);
      g.fill();
      g.stroke();
      if (sel.minRange) {
        this.isoCircle(g, cx, cy, sel.minRange);
        g.stroke();
      }
      g.setLineDash([]);
    }
  }

  isoCircle(g, x, y, r) {
    const cam = this.cam;
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const p = cam.toScreen(x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (i) g.lineTo(p[0], p[1]);
      else g.moveTo(p[0], p[1]);
    }
    g.closePath();
  }

  drawBeacon(g, bc) {
    const cam = this.cam;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    g.fillStyle = `rgba(90,200,255,${0.1 + pulse * 0.08})`;
    g.strokeStyle = `rgba(120,220,255,${0.65 + pulse * 0.25})`;
    g.lineWidth = 2.5;
    g.setLineDash([10, 7]);
    this.isoCircle(g, bc.x, bc.y, bc.r);
    g.fill();
    g.stroke();
    g.setLineDash([]);
    const [px, py] = cam.toScreen(bc.x, bc.y);
    const z = cam.zoom;
    g.strokeStyle = '#6b4a2a';
    g.lineWidth = 3 * Math.max(0.7, z);
    g.beginPath();
    g.moveTo(px, py);
    g.lineTo(px, py - 34 * z * 1.4);
    g.stroke();
    const k = z * 1.4;
    const wv = Math.sin(this.t * 6) * 2 * k;
    g.fillStyle = '#35b8ff';
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px, py - 34 * k);
    g.lineTo(px + 18 * k, py - 29 * k + wv);
    g.lineTo(px, py - 22 * k);
    g.closePath();
    g.fill();
    g.stroke();
  }

  // ---------- entities ----------

  drawEntities(g, scene) {
    const cam = this.cam;
    const z = cam.zoom;
    const items = [];
    const wallSet = new Set();
    for (const b of scene.buildings) {
      if (b.type === 'wall' && b.alive !== false && b.lvl >= 1) wallSet.add(b.y * D.MAP + b.x);
    }
    scene.wallSet = wallSet;
    for (const b of scene.buildings) {
      const s = D.BUILDINGS[b.type].size;
      if (b.type === 'bomb' && scene.mode === 'battle' && b.alive !== false) continue; // hidden traps
      items.push({ k: b.x + b.y + s * (b.alive === false ? 0.2 : 1), t: 0, o: b });
    }
    for (const o of scene.obstacles || []) items.push({ k: o.x + o.y + o.size, t: 1, o });
    for (const p of PALMS) items.push({ k: p.x + p.y + 0.5, t: 3, o: p });
    for (const u of scene.units || []) items.push({ k: u.x + u.y + (u.flying ? 3 : 0.1), t: 2, o: u });
    items.sort((a, b) => a.k - b.k);
    const margin = 160;
    for (const it of items) {
      if (it.t === 0) this.drawBuilding(g, it.o, scene);
      else if (it.t === 1) this.drawObstacle(g, it.o, scene);
      else if (it.t === 2) this.drawUnit(g, it.o);
      else {
        const [x, y] = cam.toScreen(it.o.x, it.o.y);
        if (x > -margin && x < cam.w + margin && y > -margin && y < cam.h + margin) this.drawPalm(g, x, y, it.o.s * z);
      }
    }
  }

  onScreen(x0, y0, x1, y1) {
    return x1 > -10 && y1 > -10 && x0 < this.cam.w + 10 && y0 < this.cam.h + 10;
  }

  drawBuilding(g, b, scene) {
    const cam = this.cam;
    const z = cam.zoom;
    const d = D.BUILDINGS[b.type];
    const s = d.size;
    let [nx, ny] = cam.toScreen(b.x, b.y);
    const jolt = this.jolt.get(b.id);
    if (jolt) ny += (Math.random() - 0.5) * 3;
    const w = s * TW * z;
    if (!this.onScreen(nx - w / 2 - 20, ny - 160 * z, nx + w / 2 + 20, ny + w / 2 + 20)) return;
    const R = this.R;
    let sp;
    if (b.alive === false) {
      if (b.type === 'wall' || b.type === 'bomb') return;
      sp = A.rubbleSprite(s, R);
    } else if (b.lvl === 0) {
      sp = A.scaffoldSprite(s, R);
    } else if (b.type === 'wall') {
      const mask = (scene.wallSet.has(b.y * D.MAP + b.x + 1) ? 1 : 0) | (scene.wallSet.has((b.y + 1) * D.MAP + b.x) ? 2 : 0);
      sp = A.buildingSprite('wall', b.lvl, scene.team, 1, mask, R);
    } else {
      sp = A.buildingSprite(b.type, b.lvl, scene.team, s, 0, R);
    }
    const k = z / sp.R;
    const sel = scene.selected && scene.selected.id === b.id;
    const bob = sel ? Math.sin(this.t * 8) * 1.5 : 0;
    const dim = scene.ghost && scene.ghost.moving === b.id;
    if (dim) g.globalAlpha = 0.35;
    g.drawImage(sp.canvas, nx - sp.ox * z, ny - sp.oy * z + bob, sp.canvas.width * k, sp.canvas.height * k);
    if (dim) g.globalAlpha = 1;
    if (b.alive !== false && b.lvl >= 1 && D.DEFENSES.includes(b.type)) {
      g.save();
      g.translate(nx, ny + bob);
      g.scale(z, z);
      A.drawTurret(g, { ...b, size: s, ang: scene.mode === 'battle' ? b.ang : 0.8 + Math.sin(this.t * 0.5 + b.id) * 0.9 }, this.t, b.recoil || 0);
      g.restore();
    }
    if (b.alive !== false && b.lvl >= 1 && b.type === 'forge' && Math.random() < 0.05) this.smoke(b.x + 2.2, b.y + 0.68, 72, 0.6);
    if (b.alive !== false && b.lvl >= 1 && b.type === 'camp') this.campFire(g, nx, ny, z);
    this.drawBuildingBadges(g, b, nx, ny, z, scene);
  }

  campFire(g, nx, ny, z) {
    const [fx, fy] = [nx + (2.5 - 2.5) * HW * z, ny + (2.5 + 2.5) * HH * z - 3 * z];
    const f = 0.7 + 0.3 * Math.sin(this.t * 14);
    g.fillStyle = `rgba(255,${160 + Math.sin(this.t * 11) * 40},40,0.9)`;
    g.beginPath();
    g.ellipse(fx, fy - 7 * z, 3 * z * f, 7 * z * f, 0, 0, Math.PI * 2);
    g.fill();
  }

  drawBuildingBadges(g, b, nx, ny, z, scene) {
    const s = D.BUILDINGS[b.type].size;
    const topY = ny + s * HH * z - (s >= 4 ? 140 : s === 3 ? 100 : 74) * z;
    const cx = nx;
    const now = scene.now;
    if (scene.mode === 'home') {
      if (b.up) {
        const left = Math.max(0, b.up.end - now) / 1000;
        const total = Math.max(1, (b.up.end - b.up.start) / 1000);
        this.pill(g, cx, topY, `${fmtTime(left)}`, 1 - left / total, '#ffcf4a', b.lvl === 0 ? '🔨' : '⬆');
      } else if (scene.collectable && scene.collectable.has(b.id) && !scene.ghost) {
        const c = scene.collectable.get(b.id);
        const bob = Math.sin(this.t * 4 + b.id) * 3 * z;
        this.bubble(g, cx, topY + bob, c.res);
      } else if (b.slot && b.lvl >= 1) {
        const left = Math.max(0, b.slot.end - now) / 1000;
        const total = (b.slot.end - b.slot.start) / 1000;
        this.pill(g, cx, topY + 6 * z, fmtTime(left), 1 - left / Math.max(1, total), '#6fb6ff', '');
      }
    } else if (scene.mode === 'battle' && b.alive !== false && b.hp < b.maxHp && b.type !== 'bomb' && b.type !== 'wall') {
      this.hpBar(g, cx, ny + s * HH * z - (s >= 3 ? 38 : 24) * z, Math.max(18, s * 18) * Math.max(0.7, z * 1.3), b.hp / b.maxHp, '#ff5a4a');
    }
    if (scene.mode === 'home' && scene.tutorialTarget === b.id) this.pointer(g, cx, topY - 8 * z);
  }

  pointer(g, x, y) {
    const bob = Math.sin(this.t * 7) * 6;
    g.fillStyle = '#ffe14a';
    g.strokeStyle = '#7a5a00';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x, y + bob);
    g.lineTo(x - 13, y - 20 + bob);
    g.lineTo(x + 13, y - 20 + bob);
    g.closePath();
    g.fill();
    g.stroke();
  }

  hpBar(g, x, y, w, f, color) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.roundRect(x - w / 2 - 1, y - 1, w + 2, 6, 3);
    g.fill();
    g.fillStyle = f > 0.5 ? '#5fd35f' : f > 0.25 ? '#ffc43a' : color;
    g.beginPath();
    g.roundRect(x - w / 2, y, Math.max(2, w * f), 4, 2);
    g.fill();
  }

  pill(g, x, y, text, prog, color, icon) {
    g.font = '700 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    const tw = g.measureText(text).width;
    const w = tw + 20 + (icon ? 16 : 0);
    g.fillStyle = 'rgba(20,25,40,0.82)';
    g.beginPath();
    g.roundRect(x - w / 2, y - 11, w, 22, 11);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x - w / 2 + 2, y + 5, Math.max(4, (w - 4) * clamp(prog, 0, 1)), 4, 2);
    g.fill();
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    if (icon) g.fillText(icon, x - w / 2 + 6, y - 1);
    g.fillText(text, x - w / 2 + (icon ? 22 : 10), y - 1.5);
  }

  bubble(g, x, y, res) {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(x - 5, y + 13);
    g.lineTo(x, y + 21);
    g.lineTo(x + 5, y + 13);
    g.fill();
    this.resIcon(g, x, y, res, 9);
  }

  resIcon(g, x, y, res, r) {
    if (res === 'gold') {
      g.fillStyle = '#ffd24a';
      g.strokeStyle = '#b07d0c';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = '#fff3b0';
      g.beginPath();
      g.arc(x, y, r * 0.55, 0.3, 2.2);
      g.stroke();
    } else if (res === 'crystal') {
      g.fillStyle = '#7ad7ff';
      g.strokeStyle = '#2f6fc0';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x, y - r * 1.15);
      g.lineTo(x + r * 0.85, y - r * 0.1);
      g.lineTo(x, y + r * 1.1);
      g.lineTo(x - r * 0.85, y - r * 0.1);
      g.closePath();
      g.fill();
      g.stroke();
    } else {
      g.fillStyle = '#fff3fb';
      g.strokeStyle = '#d58acb';
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x, y, r * 0.85, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }

  drawObstacle(g, o, scene) {
    const cam = this.cam;
    const z = cam.zoom;
    const [nx, ny] = cam.toScreen(o.x, o.y);
    const w = o.size * TW * z;
    if (!this.onScreen(nx - w, ny - 120 * z, nx + w, ny + w)) return;
    const sp = A.obstacleSprite(o.kind, o.size, this.R);
    const k = z / sp.R;
    g.drawImage(sp.canvas, nx - sp.ox * z, ny - sp.oy * z, sp.canvas.width * k, sp.canvas.height * k);
    if (o.clearing) {
      const left = Math.max(0, o.clearing.end - scene.now) / 1000;
      const total = (o.clearing.end - o.clearing.start) / 1000;
      this.pill(g, nx, ny + o.size * HH * z - 52 * z, fmtTime(left), 1 - left / Math.max(1, total), '#ffcf4a', '⛏');
    }
    if (scene.tutorialTarget === 'obstacle' && scene.obstacles[0] === o) this.pointer(g, nx, ny - 60 * z);
  }

  drawPalm(g, x, y, s) {
    const sway = Math.sin(this.t * 1.4 + x * 0.05) * 2 * s;
    g.strokeStyle = '#8d6238';
    g.lineWidth = 5 * s;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y + 4 * s);
    g.quadraticCurveTo(x + 5 * s, y - 24 * s, x + 2 * s + sway * 0.5, y - 46 * s);
    g.stroke();
    const tx = x + 2 * s + sway * 0.5;
    const ty = y - 46 * s;
    g.fillStyle = '#3f9a45';
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const ex = tx + Math.cos(a) * 22 * s;
      const ey = ty + Math.sin(a) * 9 * s + 7 * s + sway * 0.3;
      g.beginPath();
      g.moveTo(tx, ty);
      g.quadraticCurveTo((tx + ex) / 2, ty - 10 * s, ex, ey);
      g.quadraticCurveTo((tx + ex) / 2, ty - 3 * s, tx, ty + 1 * s);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#6b4a2a';
    g.beginPath();
    g.arc(tx - 2 * s, ty + 3 * s, 3 * s, 0, Math.PI * 2);
    g.arc(tx + 3 * s, ty + 4 * s, 3 * s, 0, Math.PI * 2);
    g.fill();
  }

  drawUnit(g, u) {
    const cam = this.cam;
    const z = cam.zoom;
    const [x, y] = cam.toScreen(u.x, u.y);
    if (x < -40 || y < -60 || x > cam.w + 40 || y > cam.h + 40) return;
    const since = u.interval - u.cd;
    const swing = since >= 0 && since < 0.25 ? Math.sin((since / 0.25) * Math.PI) : 0;
    const face = (u.vx - u.vy) < -0.01 ? -1 : (u.vx - u.vy) > 0.01 ? 1 : (u.dir > Math.PI / 2 || u.dir < -Math.PI / 2 ? -1 : 1) * (u.faceFlip || 1);
    const s = Math.max(0.55, z * 1.5);
    A.drawTroop(g, u.troop, x, y, s, this.t, { face, moving: u.moving, swing, seed: u.id });
    if (u.hp < u.maxHp) this.hpBar(g, x, y - (u.flying ? 38 : u.troop === 'brute' ? 44 : 32) * s, 22 * Math.max(0.8, s), u.hp / u.maxHp, '#ff5a4a');
  }

  // ---------- effects ----------

  drawFx(g) {
    const cam = this.cam;
    const z = cam.zoom;
    for (const p of this.fx) {
      const f = p.life / p.max;
      switch (p.k) {
        case 'proj': {
          const x = p.fx + (p.tx - p.fx) * f;
          const y = p.fy + (p.ty - p.fy) * f;
          const h = 22 + Math.sin(f * Math.PI) * p.arc;
          const [sx, sy] = cam.toScreen(x, y, h);
          if (p.kind === 'ballista' || p.kind === 'sling') {
            const [bx, by] = cam.toScreen(x - (p.tx - p.fx) * 0.12, y - (p.ty - p.fy) * 0.12, h);
            g.strokeStyle = p.kind === 'sling' ? '#cfc7b8' : '#e8e2d2';
            g.lineWidth = Math.max(1.5, 2.2 * z);
            g.beginPath();
            g.moveTo(bx, by);
            g.lineTo(sx, sy);
            g.stroke();
          } else {
            g.fillStyle = p.kind === 'mortar' ? '#2c2f38' : '#23262d';
            g.beginPath();
            g.arc(sx, sy, (p.kind === 'mortar' ? 6 : 4) * Math.max(0.7, z * 1.4), 0, Math.PI * 2);
            g.fill();
            if (p.kind === 'mortar') {
              const [gx, gy] = cam.toScreen(x, y);
              g.fillStyle = 'rgba(0,0,0,0.2)';
              g.beginPath();
              g.ellipse(gx, gy, 6 * z * 1.4, 3 * z * 1.4, 0, 0, Math.PI * 2);
              g.fill();
            }
          }
          break;
        }
        case 'puff': {
          const [sx, sy] = cam.toScreen(p.x, p.y, p.z);
          g.fillStyle = p.c;
          g.globalAlpha = 1 - f;
          g.beginPath();
          g.arc(sx, sy, p.r * (0.5 + f) * Math.max(0.6, z * 1.3), 0, Math.PI * 2);
          g.fill();
          g.globalAlpha = 1;
          break;
        }
        case 'ring': {
          g.strokeStyle = `rgba(${p.c},${(1 - f) * 0.9})`;
          g.fillStyle = `rgba(${p.c},${(1 - f) * 0.18})`;
          g.lineWidth = 3 * Math.max(0.7, z * 1.4);
          this.isoCircle(g, p.x, p.y, p.r * (0.25 + f * 0.85));
          g.fill();
          g.stroke();
          break;
        }
        case 'spark': {
          const [sx, sy] = cam.toScreen(p.x, p.y, p.z);
          g.fillStyle = `rgba(255,${190 - f * 100},60,${1 - f})`;
          g.beginPath();
          g.arc(sx, sy, 2.2 * Math.max(0.7, z * 1.4), 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'smoke': {
          const [sx, sy] = cam.toScreen(p.x, p.y, p.z);
          g.fillStyle = `rgba(70,66,62,${0.55 * (1 - f)})`;
          g.beginPath();
          g.arc(sx, sy, p.r * (0.6 + f) * Math.max(0.6, z * 1.3), 0, Math.PI * 2);
          g.fill();
          break;
        }
        case 'debris': {
          const [sx, sy] = cam.toScreen(p.x, p.y, p.z);
          g.fillStyle = p.c;
          g.globalAlpha = 1 - f * f;
          g.fillRect(sx - p.sz / 2, sy - p.sz / 2, p.sz * Math.max(0.8, z * 1.4), p.sz * Math.max(0.8, z * 1.4));
          g.globalAlpha = 1;
          break;
        }
        case 'text': {
          const [sx, sy] = cam.toScreen(p.x, p.y, p.z);
          g.globalAlpha = 1 - f * f;
          g.font = '800 17px system-ui, -apple-system, "Segoe UI", sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.lineWidth = 4;
          g.strokeStyle = 'rgba(0,0,0,0.6)';
          g.strokeText(p.text, sx, sy);
          g.fillStyle = p.color;
          g.fillText(p.text, sx, sy);
          g.globalAlpha = 1;
          break;
        }
        default:
      }
    }
  }

  // ---------- overlays ----------

  drawOverlays(g, scene) {
    const gh = scene.ghost;
    if (gh && gh.type) {
      const cam = this.cam;
      const z = cam.zoom;
      const [nx, ny] = cam.toScreen(gh.x, gh.y);
      const s = gh.size;
      const sp = gh.type === 'wall' ? A.buildingSprite('wall', gh.lvl || 1, 'p', 1, 0, this.R) : A.buildingSprite(gh.type, gh.lvl || 1, 'p', s, 0, this.R);
      const k = z / sp.R;
      g.globalAlpha = 0.82;
      g.drawImage(sp.canvas, nx - sp.ox * z, ny - sp.oy * z - Math.abs(Math.sin(this.t * 5)) * 3, sp.canvas.width * k, sp.canvas.height * k);
      g.globalAlpha = 1;
      if (D.DEFENSES.includes(gh.type)) {
        const a = D.BUILDINGS[gh.type].atk;
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.setLineDash([8, 6]);
        g.lineWidth = 2;
        this.isoCircle(g, gh.x + s / 2, gh.y + s / 2, a.range);
        g.stroke();
        g.setLineDash([]);
      }
    }
  }
}

const PAL_SAND = '#f3deaa';
