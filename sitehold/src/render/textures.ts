import * as THREE from 'three';

/** Small procedural texture set. Everything is generated once from code, there are no image files. */

function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, per: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % per) + per) % per, x1 = (x0 + 1) % per;
  const y0 = ((yi % per) + per) % per, y1 = (y0 + 1) % per;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(u: number, v: number, per: number, oct: number, s: number) {
  let sum = 0, amp = 0.5, norm = 0, p = per;
  for (let o = 0; o < oct; o++) { sum += vnoise(u * p, v * p, p, s + o * 13) * amp; norm += amp; amp *= 0.5; p *= 2; }
  return sum / norm;
}

type Painter = (u: number, v: number, N: number) => [number, number, number];

function make(N: number, paint: Painter, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const [r, gg, b] = paint((x + 0.5) / N, (y + 0.5) / N, N);
      const i = (y * N + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, r));
      img.data[i + 1] = Math.max(0, Math.min(255, gg));
      img.data[i + 2] = Math.max(0, Math.min(255, b));
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const mix = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface TextureSet {
  plaster: THREE.CanvasTexture;
  stone: THREE.CanvasTexture;
  wood: THREE.CanvasTexture;
  crate: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  ground: THREE.CanvasTexture;
  sand: THREE.CanvasTexture;
}

let cache: TextureSet | null = null;

export function getTextures(): TextureSet {
  if (cache) return cache;
  const N = 256;
  const plaster = make(N, (u, v) => {
    const big = fbm(u, v, 3, 4, 1), fine = fbm(u, v, 32, 2, 2);
    const stain = fbm(u * 0.8, v * 0.25, 5, 3, 3);
    let t = 0.55 + big * 0.3 + fine * 0.14 - (stain > 0.62 ? (stain - 0.62) * 0.9 : 0);
    t = Math.max(0.2, Math.min(1, t));
    const c = mix([196, 168, 124], [236, 214, 170], t);
    const crack = Math.abs(fbm(u, v, 4, 4, 9) - 0.5) < 0.006 ? 0.8 : 1;
    return [c[0] * crack, c[1] * crack, c[2] * crack];
  });
  const stone = make(N, (u, v) => {
    const rows = 6, row = Math.floor(v * rows), off = (row % 2) * 0.5;
    const bx = u * 3 + off, col = Math.floor(bx);
    const fx = bx - col, fy = v * rows - row;
    const mort = fx < 0.04 || fx > 0.96 || fy < 0.06 || fy > 0.94;
    const id = hash(col, row, 5);
    const grain = fbm(u, v, 24, 3, 6);
    const base = mix([164, 140, 108], [200, 176, 138], id * 0.7 + grain * 0.4);
    const k = mort ? 0.62 : 0.9 + grain * 0.18;
    return [base[0] * k, base[1] * k, base[2] * k];
  });
  const wood = make(N, (u, v) => {
    const planks = 4, pl = Math.floor(u * planks), fu = u * planks - pl;
    const id = hash(pl, 1, 7);
    const grain = fbm(fu * 0.5 + id * 5, v * 0.05, 16, 4, 8);
    const rings = 0.5 + 0.5 * Math.sin((grain * 14 + fu * 2) * Math.PI);
    const seam = fu < 0.03 || fu > 0.97;
    const c = mix([128, 88, 52], [176, 128, 78], 0.25 + rings * 0.35 + id * 0.25);
    const k = seam ? 0.45 : 0.92 + grain * 0.15;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  const crate = make(N, (u, v) => {
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const frame = edge < 0.1;
    const diag = Math.abs(u - v) < 0.045 || Math.abs(u + v - 1) < 0.0;
    const planks = 5, pl = Math.floor(v * planks), fv = v * planks - pl;
    const grain = fbm(u * 0.4, v * 0.6, 12, 4, 11);
    const id = hash(pl, 2, 12);
    const c = frame || diag ? mix([108, 74, 42], [140, 98, 58], grain) : mix([150, 108, 64], [196, 150, 92], grain * 0.6 + id * 0.3);
    const k = fv < 0.04 && !frame ? 0.6 : edge < 0.012 ? 0.5 : 1;
    return [c[0] * k, c[1] * k, c[2] * k];
  });
  const metal = make(N, (u, v) => {
    const n = fbm(u, v, 16, 3, 14);
    const panel = (Math.abs((u * 2) % 1 - 0.5) > 0.48 || Math.abs((v * 2) % 1 - 0.5) > 0.48) ? 0.55 : 1;
    const rivet = (() => { const gx = (u * 8) % 1, gy = (v * 8) % 1; return Math.hypot(gx - 0.5, gy - 0.5) < 0.07 ? 1.25 : 1; })();
    const c = mix([86, 98, 108], [120, 130, 138], n);
    return [c[0] * panel * rivet, c[1] * panel * rivet, c[2] * panel * rivet];
  });
  const ground = make(N, (u, v) => {
    const big = fbm(u, v, 4, 4, 21), fine = fbm(u, v, 48, 2, 22);
    const speck = hash(Math.floor(u * N), Math.floor(v * N), 23) > 0.96 ? 0.82 : 1;
    const c = mix([196, 168, 120], [226, 200, 150], big * 0.8 + fine * 0.2);
    return [c[0] * speck, c[1] * speck, c[2] * speck];
  });
  const sand = make(N, (u, v) => {
    const big = fbm(u, v, 5, 4, 31);
    const c = mix([204, 176, 128], [232, 208, 158], big);
    return [c[0], c[1], c[2]];
  });
  cache = { plaster, stone, wood, crate, metal, ground, sand };
  return cache;
}

/** Soft round sprite used by smoke, dust and glows. */
export function softCircle(size = 64, hard = 0.0): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, size * 0.5 * hard, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function noiseCloud(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      const d = Math.hypot(u - 0.5, v - 0.5) * 2;
      const n = fbm(u, v, 4, 4, 41);
      const a = Math.max(0, 1 - d * d) * (0.55 + n * 0.7);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.max(0, Math.min(255, a * 255));
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function bulletHoleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, 'rgba(10,8,6,0.95)');
  grad.addColorStop(0.35, 'rgba(20,16,12,0.8)');
  grad.addColorStop(1, 'rgba(30,24,18,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
