import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AABB, SurfaceKind, makeBox } from '../collision';
import { NavGrid } from '../nav';
import { makeCanvas, mulberry32 } from '../../engine/util';

export interface LampDef { pos: THREE.Vector3; color: number; intensity: number; flicker: boolean; mesh?: THREE.Mesh }
export interface Level {
  group: THREE.Group;
  colliders: AABB[];
  nav: NavGrid;
  lamps: LampDef[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export interface Opening { side: 'n' | 's' | 'e' | 'w'; at: number; width: number; sill?: number; top?: number }
export interface BoxOpts { kind?: SurfaceKind; collide?: boolean; metal?: boolean; tint?: number; uv?: number }

function detailTexture(kind: 'concrete' | 'metal' | 'ground', seed: number) {
  const rng = mulberry32(seed);
  const S = 256;
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d')!;
  const base = kind === 'ground' ? 150 : kind === 'metal' ? 236 : 220;
  g.fillStyle = `rgb(${base},${base},${base})`;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < (kind === 'ground' ? 5000 : 2600); i++) {
    const v = Math.floor(rng() * 255);
    g.fillStyle = `rgba(${v},${v},${v},${0.04 + rng() * 0.1})`;
    const s = rng() * 3 + 0.5;
    g.fillRect(rng() * S, rng() * S, s, s);
  }
  for (let i = 0; i < 6; i++) {
    const x = rng() * S, y = rng() * S, r = 30 + rng() * 70;
    const grd = g.createRadialGradient(x, y, 1, x, y, r);
    grd.addColorStop(0, 'rgba(0,0,0,0.10)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  if (kind === 'metal') {
    for (let x = 0; x < S; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 2, S);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 2, 0, 1, S);
    }
  } else if (kind === 'concrete') {
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    g.strokeRect(0, 0, S, S);
    g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.lineWidth = 1.2; g.stroke();
  } else {
    // asphalt cracks
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); let x = rng() * S, y = rng() * S; g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (rng() - 0.5) * 40; y += (rng() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class LevelBuilder {
  boxes: AABB[] = [];
  lamps: LampDef[] = [];
  group = new THREE.Group();
  rng: () => number;
  private rough: THREE.BufferGeometry[] = [];
  private metal: THREE.BufferGeometry[] = [];
  private glow: THREE.BufferGeometry[] = [];
  private tmpColor = new THREE.Color();

  constructor(seed = 1) { this.rng = mulberry32(seed); }

  // ------------------------------------------------------------ primitives
  private prep(geo: THREE.BufferGeometry, y0: number, color: number, tint: number, uvScale: number, h: number) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    const c = this.tmpColor.setHex(color);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i), wy = pos.getY(i), wz = pos.getZ(i);
      const nx = nor.getX(i), ny = nor.getY(i);
      if (Math.abs(ny) > 0.5) uv.setXY(i, wx * uvScale, wz * uvScale);
      else if (Math.abs(nx) > 0.5) uv.setXY(i, wz * uvScale, wy * uvScale);
      else uv.setXY(i, wx * uvScale, wy * uvScale);
      const near = Math.min(1, Math.max(0, wy / 3));
      let ao = 0.74 + 0.26 * near;
      if (ny > 0.5) ao *= 1.12; else if (ny < -0.5) ao *= 0.5;
      const hh = h > 0 ? (wy - y0) / h : 0;
      ao *= 0.94 + 0.06 * hh;
      const k = ao * tint * 1.5;
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }

  /** Axis aligned box. cx/cz centre, y0 base. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, o: BoxOpts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(cx, y0 + h / 2, cz);
    const tint = o.tint ?? 0.9 + this.rng() * 0.18;
    this.prep(geo, y0, color, tint, o.uv ?? 0.36, h);
    (o.metal ? this.metal : this.rough).push(geo);
    if (o.collide !== false) this.boxes.push(makeBox(cx, y0, cz, w, h, d, o.kind ?? (o.metal ? 'metal' : 'concrete')));
  }

  /** Emissive box (no collision) used for lights, signs, strips. */
  glowBox(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, power = 3) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(cx, y0 + h / 2, cz);
    const c = this.tmpColor.setHex(color).multiplyScalar(power);
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < geo.attributes.position.count; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    this.glow.push(geo);
  }

  /** Non-colliding decorative box (stripes, pipes, trim). */
  deco(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: number, metal = false) {
    this.box(cx, y0, cz, w, h, d, color, { collide: false, metal, tint: 1 });
  }

  lamp(x: number, y: number, z: number, color = 0xffd9a0, intensity = 1, flicker = false, bulb = true) {
    const def: LampDef = { pos: new THREE.Vector3(x, y, z), color, intensity, flicker };
    this.lamps.push(def);
    if (bulb) this.glowBox(x, y - 0.08, z, 0.28, 0.12, 0.28, color, 4);
  }

  // ------------------------------------------------------------ structures
  wallRect(cx: number, cz: number, w: number, d: number, h: number, t: number, openings: Opening[], color: number, o: { roof?: boolean; y0?: number; roofColor?: number; metal?: boolean } = {}) {
    const y0 = o.y0 ?? 0;
    const metal = o.metal ?? false;
    const seg = (a: number, b: number, fixed: number, alongX: boolean, ya: number, yb: number) => {
      if (b - a < 0.05 || yb - ya < 0.05) return;
      const mid = (a + b) / 2, len = b - a;
      if (alongX) this.box(mid, y0 + ya, fixed, len, yb - ya, t, color, { metal });
      else this.box(fixed, y0 + ya, mid, t, yb - ya, len, color, { metal });
    };
    const sides: Record<string, { alongX: boolean; fixed: number; from: number; to: number; center: number }> = {
      n: { alongX: true, fixed: cz - d / 2 + t / 2, from: cx - w / 2, to: cx + w / 2, center: cx },
      s: { alongX: true, fixed: cz + d / 2 - t / 2, from: cx - w / 2, to: cx + w / 2, center: cx },
      w: { alongX: false, fixed: cx - w / 2 + t / 2, from: cz - d / 2 + t, to: cz + d / 2 - t, center: cz },
      e: { alongX: false, fixed: cx + w / 2 - t / 2, from: cz - d / 2 + t, to: cz + d / 2 - t, center: cz },
    };
    for (const key of ['n', 's', 'e', 'w']) {
      const s = sides[key];
      const ops = openings.filter((q) => q.side === key).sort((a, b) => a.at - b.at);
      let cursor = s.from;
      for (const op of ops) {
        const o0 = s.center + op.at - op.width / 2, o1 = s.center + op.at + op.width / 2;
        seg(cursor, o0, s.fixed, s.alongX, 0, h);
        seg(o0, o1, s.fixed, s.alongX, 0, op.sill ?? 0);
        seg(o0, o1, s.fixed, s.alongX, op.top ?? 2.4, h);
        cursor = o1;
      }
      seg(cursor, s.to, s.fixed, s.alongX, 0, h);
    }
    if (o.roof !== false) {
      this.box(cx, y0 + h, cz, w + 0.4, 0.35, d + 0.4, o.roofColor ?? 0x3a3f44);
      // parapet trim and rooftop props
      const par = 0x24282b;
      this.deco(cx, y0 + h + 0.35, cz - d / 2 - 0.1, w + 0.5, 0.35, 0.2, par);
      this.deco(cx, y0 + h + 0.35, cz + d / 2 + 0.1, w + 0.5, 0.35, 0.2, par);
      this.deco(cx - w / 2 - 0.1, y0 + h + 0.35, cz, 0.2, 0.35, d + 0.5, par);
      this.deco(cx + w / 2 + 0.1, y0 + h + 0.35, cz, 0.2, 0.35, d + 0.5, par);
      const n = Math.min(4, Math.floor((w * d) / 120) + 1);
      for (let i = 0; i < n; i++) {
        const px = cx + (this.rng() - 0.5) * (w - 3), pz = cz + (this.rng() - 0.5) * (d - 3);
        const kind = this.rng();
        if (kind < 0.5) { this.deco(px, y0 + h + 0.35, pz, 1.6, 0.9, 1.2, 0x5c6266, true); this.deco(px, y0 + h + 1.25, pz, 1.2, 0.08, 0.9, 0x1c1f21, true); }
        else if (kind < 0.8) { this.deco(px, y0 + h + 0.35, pz, 0.6, 1.6, 0.6, 0x4a4f53, true); }
        else this.deco(px, y0 + h + 0.35, pz, 2.4, 0.5, 0.4, 0x30363a, true);
      }
    }
    // plinth along the base
    const pl = 0x4a4d4f;
    this.deco(cx, y0, cz - d / 2 - 0.05, w + 0.2, 0.3, 0.2, pl); this.deco(cx, y0, cz + d / 2 + 0.05, w + 0.2, 0.3, 0.2, pl);
    this.deco(cx - w / 2 - 0.05, y0, cz, 0.2, 0.3, d + 0.2, pl); this.deco(cx + w / 2 + 0.05, y0, cz, 0.2, 0.3, d + 0.2, pl);
  }

  crate(x: number, z: number, s = 1, color = 0x6b5436, y0 = 0) {
    this.box(x, y0, z, s, s, s, color, { kind: 'wood', tint: 0.85 + this.rng() * 0.3 });
    this.deco(x, y0 + s * 0.46, z, s * 1.02, s * 0.08, s * 1.02, 0x2a2118);
    this.deco(x, y0 + s * 0.02, z, s * 1.02, s * 0.08, s * 1.02, 0x2a2118);
  }

  crateStack(x: number, z: number, color = 0x6b5436) {
    this.crate(x, z, 1.1, color);
    this.crate(x + 1.15, z + 0.1, 1.0, color);
    this.crate(x + 0.5, z + 0.05, 0.9, color, 1.1);
  }

  container(x: number, z: number, alongX = true, color = 0x8a3b2a, stacked = false) {
    const L = 6.1, W = 2.45, H = 2.6;
    const w = alongX ? L : W, d = alongX ? W : L;
    this.box(x, 0, z, w, H, d, color, { metal: true, tint: 0.85 + this.rng() * 0.3 });
    // door end frame stripes
    this.deco(x, 0.05, z, w + 0.04, 0.1, d + 0.04, 0x222222, true);
    this.deco(x, H - 0.1, z, w + 0.04, 0.1, d + 0.04, 0x222222, true);
    if (stacked) this.box(x + (alongX ? 0.4 : 0), H, z + (alongX ? 0 : 0.4), w, H, d, 0x3d5a70, { metal: true });
  }

  truck(x: number, z: number, alongX = true, color = 0x3d4a3a) {
    const s = alongX ? 1 : -1;
    const w = alongX ? 7.2 : 2.6, d = alongX ? 2.6 : 7.2;
    // cargo
    this.box(x - (alongX ? 0.9 : 0), 0.7, z - (alongX ? 0 : 0.9), alongX ? 5 : 2.5, 2.3, alongX ? 2.5 : 5, color, { metal: true });
    // cab
    this.box(x + (alongX ? 3 * s : 0), 0.5, z + (alongX ? 0 : 3), alongX ? 1.9 : 2.5, 1.9, alongX ? 2.5 : 1.9, 0x2c352b, { metal: true });
    // chassis
    this.box(x, 0.35, z, w - 0.4, 0.45, d - 0.4, 0x151515, { metal: true });
    // wheels (decorative)
    for (const f of [-2.6, 0.3, 2.9]) {
      for (const side of [-1.15, 1.15]) {
        const wx = alongX ? x + f : x + side, wz = alongX ? z + side : z + f;
        this.box(wx, 0, wz, alongX ? 0.95 : 0.35, 0.95, alongX ? 0.35 : 0.95, 0x0d0d0d, { collide: false });
      }
    }
  }

  car(x: number, z: number, alongX = true, color = 0x445566, burned = false) {
    const L = 4.4, W = 1.9;
    const w = alongX ? L : W, d = alongX ? W : L;
    const c = burned ? 0x1a1816 : color;
    this.box(x, 0.3, z, w, 0.75, d, c, { metal: true });
    this.box(x - (alongX ? 0.2 : 0), 1.05, z - (alongX ? 0 : 0.2), alongX ? 2.2 : 1.7, 0.6, alongX ? 1.7 : 2.2, burned ? 0x0e0e0e : 0x1d2832, { metal: true });
    for (const f of [-1.3, 1.3]) for (const side of [-0.95, 0.95]) {
      this.box(alongX ? x + f : x + side, 0, alongX ? z + side : z + f, alongX ? 0.7 : 0.25, 0.7, alongX ? 0.25 : 0.7, 0x0b0b0b, { collide: false });
    }
  }

  barrier(x: number, z: number, len = 3, alongX = true, color = 0x8c8f8f) {
    const w = alongX ? len : 0.7, d = alongX ? 0.7 : len;
    this.box(x, 0, z, w, 1.0, d, color);
  }

  sandbags(x: number, z: number, len = 3, alongX = true) {
    const w = alongX ? len : 0.8, d = alongX ? 0.8 : len;
    this.box(x, 0, z, w, 0.55, d, 0x8a7d5c, { kind: 'dirt' });
    this.box(x, 0.55, z, w * 0.88, 0.45, d * 0.88, 0x8f8260, { kind: 'dirt' });
  }

  stairs(x: number, z: number, dir: 'n' | 's' | 'e' | 'w', steps: number, width: number, rise = 0.32, run = 0.5, color = 0x5a5f63) {
    for (let i = 0; i < steps; i++) {
      const off = i * run;
      const sx = dir === 'e' ? x + off : dir === 'w' ? x - off : x;
      const sz = dir === 's' ? z + off : dir === 'n' ? z - off : z;
      const alongX = dir === 'e' || dir === 'w';
      this.box(sx, 0, sz, alongX ? run : width, rise * (i + 1), alongX ? width : run, color);
    }
  }

  lampPost(x: number, z: number, color = 0xffd9a0, intensity = 1, flicker = false, h = 5) {
    this.box(x, 0, z, 0.18, h, 0.18, 0x2b2f33, { metal: true });
    this.box(x + 0.35, h - 0.05, z, 0.8, 0.1, 0.22, 0x2b2f33, { metal: true, collide: false });
    this.lamp(x + 0.55, h - 0.12, z, color, intensity, flicker);
    this.cone(x + 0.55, h - 0.2, z, color);
  }

  cone(x: number, y: number, z: number, color: number, radius = 2.4) {
    const geo = new THREE.CylinderGeometry(0.15, radius, y, 16, 1, true);
    geo.translate(x, y / 2, z);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 4);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const wy = geo.attributes.position.getY(i);
      const a = Math.pow(Math.max(0, wy / y), 1.8) * 0.055;
      col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = a;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    m.renderOrder = 3;
    this.group.add(m);
  }

  /** Emissive text sign on a dark panel. rotY 0 faces +z (south). */
  textSign(x: number, y: number, z: number, w: number, h: number, text: string, color = '#ffb347', rotY = 0, sub = '') {
    const px = 512, py = Math.max(64, Math.round((512 * h) / w));
    const cv = makeCanvas(px, py);
    const g = cv.getContext('2d')!;
    g.fillStyle = '#0a0d10'; g.fillRect(0, 0, px, py);
    g.strokeStyle = color; g.lineWidth = 6; g.strokeRect(8, 8, px - 16, py - 16);
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const size = Math.min(py * (sub ? 0.46 : 0.6), (px * 0.84) / Math.max(4, text.length) * 1.75);
    g.font = `800 ${size}px "Arial Narrow", "Bahnschrift", Arial, sans-serif`;
    g.fillText(text, px / 2, py * (sub ? 0.38 : 0.52));
    if (sub) { g.font = `600 ${size * 0.38}px Arial, sans-serif`; g.fillText(sub, px / 2, py * 0.78); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: 0xcfcfcf, side: THREE.FrontSide }));
    m.position.set(x, y, z); m.rotation.y = rotY;
    this.group.add(m);
  }

  /** Slanted additive light shaft from (x0,y0,z0) down to (x1,y1,z1). */
  shaft(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, width: number, color = 0xffd9a0, alpha = 0.16) {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? new THREE.Vector3(-dir.z, 0, dir.x).normalize() : new THREE.Vector3(0, 1, 0).cross(dir).cross(dir).normalize().multiplyScalar(k === 1 ? 1 : 1);
      const w0 = width * 0.5, w1 = width * 0.9;
      const v = [
        a.clone().addScaledVector(side, -w0), a.clone().addScaledVector(side, w0),
        b.clone().addScaledVector(side, -w1), b.clone().addScaledVector(side, w1),
      ];
      const pos = new Float32Array(v.flatMap((p) => [p.x, p.y, p.z]));
      const c = new THREE.Color(color);
      const col = new Float32Array(16);
      [0.0, 0.0, 1, 1].forEach((t, i) => { col.set([c.r, c.g, c.b, i < 2 ? alpha : alpha * 0.1], i * 4); void t; });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      geo.setIndex([0, 1, 2, 1, 3, 2]);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
      m.renderOrder = 3; m.frustumCulled = false;
      this.group.add(m);
    }
  }

  tower(x: number, z: number, h = 7) {
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) this.box(x + dx, 0, z + dz, 0.25, h, 0.25, 0x4a4f52, { metal: true });
    this.box(x, h, z, 3.4, 0.25, 3.4, 0x3a3f42, { metal: true });
    this.box(x, h + 0.25, z - 1.55, 3.4, 0.9, 0.2, 0x3a3f42, { metal: true });
    this.box(x, h + 0.25, z + 1.55, 3.4, 0.9, 0.2, 0x3a3f42, { metal: true });
    this.box(x - 1.55, h + 0.25, z, 0.2, 0.9, 3.4, 0x3a3f42, { metal: true });
    this.box(x + 1.55, h + 0.25, z, 0.2, 0.9, 3.4, 0x3a3f42, { metal: true });
    this.box(x, h + 2.4, z, 4, 0.2, 4, 0x2c3033, { metal: true, collide: false });
    this.lamp(x, h + 2.2, z, 0xff9a60, 0.6, true);
  }

  sign(x: number, y: number, z: number, w: number, h: number, d: number, color: number, power = 2.5) {
    this.glowBox(x, y, z, w, h, d, color, power);
  }

  helipad(x: number, z: number, color = 0x66ffcc) {
    this.box(x, 0, z, 16, 0.12, 16, 0x20262a, { kind: 'concrete', tint: 1 });
    const r = 6.5;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.glowBox(x + Math.cos(a) * r, 0.12, z + Math.sin(a) * r, 0.5, 0.15, 0.5, color, 4);
    }
    this.glowBox(x - 1.4, 0.12, z, 0.35, 0.05, 3.4, 0xffffff, 1.6);
    this.glowBox(x + 1.4, 0.12, z, 0.35, 0.05, 3.4, 0xffffff, 1.6);
    this.glowBox(x, 0.12, z, 2.8, 0.05, 0.35, 0xffffff, 1.6);
  }

  // ------------------------------------------------------------ finalise
  build(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, groundTint: number, concretePattern = 7): Level {
    const detailC = detailTexture('concrete', concretePattern);
    const detailM = detailTexture('metal', concretePattern + 1);
    const addMerged = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) => {
      if (!geos.length) return;
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadow; mesh.receiveShadow = shadow;
      this.group.add(mesh);
    };
    addMerged(this.rough, new THREE.MeshStandardMaterial({ vertexColors: true, map: detailC, roughness: 0.9, metalness: 0.04 }));
    addMerged(this.metal, new THREE.MeshStandardMaterial({ vertexColors: true, map: detailM, roughness: 0.62, metalness: 0.1 }));
    if (this.glow.length) {
      const merged = mergeGeometries(this.glow, false);
      this.group.add(new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true })));
    }
    // ground
    const gt = detailTexture('ground', concretePattern + 2);
    const gw = bounds.maxX - bounds.minX + 160, gd = bounds.maxZ - bounds.minZ + 160;
    gt.repeat.set(gw / 6, gd / 6);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(gw, gd),
      new THREE.MeshStandardMaterial({ map: gt, color: groundTint, roughness: 0.92, metalness: 0.02 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
    ground.receiveShadow = true;
    this.group.add(ground);
    // invisible world boundary
    const B = 40;
    const bx = (bounds.minX + bounds.maxX) / 2, bz = (bounds.minZ + bounds.maxZ) / 2;
    const bw = bounds.maxX - bounds.minX, bd = bounds.maxZ - bounds.minZ;
    this.boxes.push(
      makeBox(bx, -2, bounds.minZ - 1, bw + 4, B, 2), makeBox(bx, -2, bounds.maxZ + 1, bw + 4, B, 2),
      makeBox(bounds.minX - 1, -2, bz, 2, B, bd + 4), makeBox(bounds.maxX + 1, -2, bz, 2, B, bd + 4),
    );
    const nav = new NavGrid(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, this.boxes);
    return { group: this.group, colliders: this.boxes, nav, lamps: this.lamps, bounds };
  }
}
