import * as THREE from 'three';
import { makeCanvas } from './util';

/** Procedural PBR texture sets (albedo, normal, roughness/metalness) generated once and cached. */
export type TexKind = 'concrete' | 'brick' | 'corrugated' | 'paint' | 'wood' | 'fabric' | 'asphalt';

export interface TexSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  ormMap: THREE.CanvasTexture;
  normalScale: number;
  metal: number;
  /** world units per texture tile */
  tile: number;
}

function hash2(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Tileable value noise with lattice period `per`. */
function tnoise(x: number, y: number, per: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % per) + per) % per, x1 = (x0 + 1) % per;
  const y0 = ((yi % per) + per) % per, y1 = (y0 + 1) % per;
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(u: number, v: number, per: number, oct: number, s: number) {
  let sum = 0, amp = 0.5, norm = 0, p = per;
  for (let o = 0; o < oct; o++) {
    sum += tnoise(u * p, v * p, p, s + o * 17) * amp;
    norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

interface Field { h: number; a: number; r: number; m: number }

function sample(kind: TexKind, u: number, v: number, N: number): Field {
  const px = u * N, py = v * N;
  switch (kind) {
    case 'concrete': {
      const big = fbm(u, v, 3, 4, 1), fine = fbm(u, v, 24, 3, 2);
      const pits = fbm(u, v, 40, 2, 3) > 0.78 ? 1 : 0;
      const stain = fbm(u * 1, v * 0.18 + 0.3, 6, 3, 4); // vertical streaks (v stretched)
      const seamH = Math.abs(v - 0.5) < 0.004 ? 1 : 0;
      const seamV = (Math.abs(u - 0.5) < 0.003 || u < 0.002) ? 1 : 0;
      const tie = (() => { const gx = (u * 4) % 1, gy = (v * 4) % 1; return Math.hypot(gx - 0.5, gy - 0.5) < 0.018 ? 1 : 0; })();
      const h = 0.55 + big * 0.18 + fine * 0.12 - pits * 0.3 - seamH * 0.4 - seamV * 0.3 - tie * 0.35;
      const a = 0.68 + big * 0.2 + fine * 0.1 - pits * 0.25 - (stain > 0.62 ? (stain - 0.62) * 1.2 : 0) - seamH * 0.2 - tie * 0.2;
      return { h, a, r: 0.82 + fine * 0.15 - pits * 0.1, m: 0 };
    }
    case 'brick': {
      const rows = 12, per = 4;
      const ry = v * rows, row = Math.floor(ry);
      const off = (row % 2) * 0.5;
      const bx = u * per + off, col = Math.floor(bx);
      const fx = bx - col, fy = ry - row;
      const mort = fx < 0.045 || fx > 0.955 || fy < 0.09 || fy > 0.92;
      const id = hash2(((col % per) + per) % per, row, 9);
      const grain = fbm(u, v, 48, 3, 5);
      const edge = Math.min(fx, 1 - fx, fy * 0.7, (1 - fy) * 0.7);
      const h = mort ? 0.15 + grain * 0.1 : 0.7 + Math.min(0.12, edge * 0.5) + grain * 0.12 + id * 0.05;
      const a = mort ? 0.82 + grain * 0.1 : 0.55 + id * 0.35 + grain * 0.16 - (id > 0.93 ? 0.3 : 0);
      return { h, a, r: mort ? 0.95 : 0.78 + grain * 0.15, m: 0 };
    }
    case 'corrugated': {
      const ribs = 10;
      const phase = u * ribs;
      const rib = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
      const wear = fbm(u, v, 6, 5, 6);
      const scr = fbm(u * 0.05 + 0.3, v * 3, 8, 2, 7);
      const edgeWear = Math.abs(((phase % 1) + 1) % 1 - 0.5) < 0.12 ? 1 : 0;
      const rust = wear > 0.6 ? (wear - 0.6) * 2.4 : 0;
      const h = 0.4 + rib * 0.5 + wear * 0.06;
      const a = 0.8 - rust * 0.4 - (edgeWear && wear > 0.5 ? 0.18 : 0) + scr * 0.08;
      return { h, a, r: 0.5 + rust * 0.4 + wear * 0.12, m: 0.55 - rust * 0.5 };
    }
    case 'paint': {
      const n = fbm(u, v, 12, 4, 8), fine = fbm(u, v, 64, 2, 9);
      const scr = fbm(u * 0.1, v * 14, 14, 2, 10) > 0.8 ? 1 : 0;
      const dirt = fbm(u, v, 5, 4, 11);
      const h = 0.5 + n * 0.08 + fine * 0.05 - scr * 0.2;
      const a = 0.82 + n * 0.12 - (dirt > 0.6 ? (dirt - 0.6) * 0.6 : 0) - scr * 0.12;
      return { h, a, r: 0.45 + dirt * 0.3 + fine * 0.1 + scr * 0.2, m: 0.12 };
    }
    case 'wood': {
      const planks = 5, pl = Math.floor(u * planks);
      const fu = u * planks - pl;
      const id = hash2(pl, 3, 12);
      const grain = fbm(fu * 0.6 + id * 5, v * 0.06 + id, 24, 4, 13);
      const rings = 0.5 + 0.5 * Math.sin((grain * 12 + fu * 3) * Math.PI);
      const seam = fu < 0.025 || fu > 0.975;
      const knot = (() => { const kx = hash2(pl, 1, 14), ky = hash2(pl, 2, 15); return Math.hypot((fu - kx) * 2, (v - ky) * 0.6) < 0.05 ? 1 : 0; })();
      const h = seam ? 0.1 : 0.6 + rings * 0.12 + grain * 0.1 - knot * 0.2;
      const a = seam ? 0.35 : 0.6 + grain * 0.3 + rings * 0.08 - knot * 0.25 + id * 0.1 - 0.1;
      return { h, a, r: 0.7 + grain * 0.2, m: 0 };
    }
    case 'fabric': {
      const wx = Math.sin(px * 1.0 * Math.PI * 0.25) * 0.5 + 0.5, wy = Math.sin(py * 1.0 * Math.PI * 0.25) * 0.5 + 0.5;
      const weave = ((Math.floor(px / 4) + Math.floor(py / 4)) % 2) ? wx : wy;
      const n = fbm(u, v, 10, 4, 16);
      const h = 0.4 + weave * 0.3 + n * 0.2;
      const a = 0.62 + weave * 0.15 + n * 0.25;
      return { h, a, r: 0.95, m: 0 };
    }
    case 'asphalt': {
      const agg = fbm(u, v, 64, 3, 20), mid = fbm(u, v, 12, 4, 21), low = fbm(u, v, 3, 3, 22);
      const speck = hash2(Math.floor(px), Math.floor(py), 23) > 0.93 ? 1 : 0;
      const crack = (() => { const c = Math.abs(fbm(u * 1, v * 1, 5, 4, 24) - 0.5); return c < 0.006 ? 1 : 0; })();
      const patch = low > 0.58 ? 1 : 0;
      const puddle = low < 0.4 ? 1 : 0;
      const h = 0.5 + agg * 0.3 + mid * 0.1 - crack * 0.5 + speck * 0.08;
      const a = (0.32 + agg * 0.14 + mid * 0.12 + speck * 0.16 - crack * 0.2 - patch * 0.05);
      return { h, a, r: puddle ? 0.2 + mid * 0.2 : 0.82 + agg * 0.12 - speck * 0.1, m: 0 };
    }
  }
}

const cache = new Map<string, TexSet>();

export function getTexSet(kind: TexKind, opts: { size?: number; wet?: boolean } = {}): TexSet {
  const key = `${kind}${opts.wet ? '-wet' : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const N = opts.size ?? (kind === 'fabric' || kind === 'wood' ? 256 : 512);
  const alb = makeCanvas(N, N), nor = makeCanvas(N, N), orm = makeCanvas(N, N);
  const ag = alb.getContext('2d')!, ng = nor.getContext('2d')!, og = orm.getContext('2d')!;
  const ai = ag.createImageData(N, N), ni = ng.createImageData(N, N), oi = og.createImageData(N, N);
  const H = new Float32Array(N * N);
  const A = new Float32Array(N * N), R = new Float32Array(N * N), M = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const f = sample(kind, (x + 0.5) / N, (y + 0.5) / N, N);
      const i = y * N + x;
      H[i] = f.h; A[i] = f.a; R[i] = opts.wet && kind === 'asphalt' ? Math.min(f.r, 0.58 + f.a * 0.25) : f.r; M[i] = f.m;
    }
  }
  const strength = kind === 'brick' ? 5 : kind === 'corrugated' ? 4.2 : kind === 'concrete' ? 3.5 : kind === 'asphalt' ? 3 : kind === 'wood' ? 3 : kind === 'fabric' ? 4 : 1.5;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const hl = H[y * N + ((x - 1 + N) % N)], hr = H[y * N + ((x + 1) % N)];
      const hu = H[((y - 1 + N) % N) * N + x], hd = H[((y + 1) % N) * N + x];
      let nx = (hl - hr) * strength, ny = (hu - hd) * strength; // y flipped: canvas v goes down
      const nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l;
      const p = i * 4;
      ni.data[p] = (nx * 0.5 + 0.5) * 255; ni.data[p + 1] = (ny * 0.5 + 0.5) * 255; ni.data[p + 2] = (nz / l * 0.5 + 0.5) * 255; ni.data[p + 3] = 255;
      const a = Math.round(clamp01(A[i]) * 255);
      ai.data[p] = a; ai.data[p + 1] = a; ai.data[p + 2] = a; ai.data[p + 3] = 255;
      oi.data[p] = 255; oi.data[p + 1] = Math.round(clamp01(R[i]) * 255); oi.data[p + 2] = Math.round(clamp01(M[i]) * 255); oi.data[p + 3] = 255;
    }
  }
  ag.putImageData(ai, 0, 0); ng.putImageData(ni, 0, 0); og.putImageData(oi, 0, 0);
  const mk = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const tile = kind === 'concrete' ? 2.8 : kind === 'brick' ? 1.0 : kind === 'corrugated' ? 1.0 : kind === 'paint' ? 2.0 : kind === 'wood' ? 1.0 : kind === 'fabric' ? 0.5 : 4;
  const set: TexSet = { map: mk(alb, true), normalMap: mk(nor, false), ormMap: mk(orm, false), normalScale: 1, metal: kind === 'corrugated' ? 0.7 : kind === 'paint' ? 0.4 : 0, tile };
  cache.set(key, set);
  return set;
}

export function makeStandardMaterial(kind: TexKind, opts: { vertexColors?: boolean; wet?: boolean } = {}) {
  const t = getTexSet(kind, { wet: opts.wet });
  const m = new THREE.MeshStandardMaterial({
    vertexColors: opts.vertexColors ?? true,
    map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(t.normalScale, t.normalScale),
    roughnessMap: t.ormMap, metalnessMap: t.ormMap, roughness: 1, metalness: t.metal > 0 ? 1 : 0,
  });
  return m;
}
