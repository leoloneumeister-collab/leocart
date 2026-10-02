/** Trees, bushes, grass, flowers, rocks and cliffs. Everything is procedural, merged and instanced. */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAMP_SPOTS, LANES, LANE_POINTS, LANE_WIDTH, MAP_HALF, NEXUS_POS, OBSTACLES } from '../data/map.ts';
import { distToSegment, Rng } from '../sim/math.ts';
import { SHARED, chainPatch, stylize } from './materials.ts';
import type { Quality } from './pipeline.ts';

type Vec3 = [number, number, number];
type Hook = (m: THREE.Material) => void;

// ------------------------------------------------------------------ geometry kit

/** Bake vertex colours with a vertical gradient and a little brightness jitter. */
function tint(geo: THREE.BufferGeometry, color: number, grad: [number, number] = [0.78, 1.14], jit = 0.07, seed = 1): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = g.getAttribute('position');
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  const c = new THREE.Color(color);
  const col = new Float32Array(pos.count * 3);
  const rng = new Rng(seed);
  // jitter per triangle so faces read as painted facets
  for (let i = 0; i < pos.count; i += 3) {
    const j = 1 + (rng.next() - 0.5) * jit * 2;
    for (let k = 0; k < 3; k++) {
      const t = maxY > minY ? (pos.getY(i + k) - minY) / (maxY - minY) : 0.5;
      const f = (grad[0] + (grad[1] - grad[0]) * t) * j;
      col[(i + k) * 3] = c.r * f;
      col[(i + k) * 3 + 1] = c.g * f;
      col[(i + k) * 3 + 2] = c.b * f;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function xf(g: THREE.BufferGeometry, p: Vec3 = [0, 0, 0], r: Vec3 = [0, 0, 0], s: Vec3 = [1, 1, 1]): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  g.applyMatrix4(m);
  return g;
}

/** Lumpy sphere: icosahedron with hashed radial noise and smooth normals. */
function blob(r: number, seed: number, lump = 0.18, detail = 1): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.getAttribute('position');
  const rng = new Rng(seed);
  const offs: number[] = [];
  for (let i = 0; i < pos.count; i++) offs.push(1 + (rng.next() - 0.5) * 2 * lump);
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * r * offs[i], pos.getY(i) * r * offs[i], pos.getZ(i) * r * offs[i]);
  g.computeVertexNormals();
  return g;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    return n;
  });
  return mergeGeometries(prepared, false)!;
}

function trunk(h: number, rt: number, rb: number, color: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rt, rb, h, 7, 2);
  g.translate(0, h / 2, 0);
  const root = new THREE.CylinderGeometry(rb, rb * 1.7, h * 0.18, 7, 1);
  root.translate(0, h * 0.09, 0);
  return merge([tint(g, color, [0.7, 1.05], 0.06, seed), tint(root, color, [0.6, 0.9], 0.05, seed + 1)]);
}

export function oakGeometry(variant: number): THREE.BufferGeometry {
  const palettes = [
    [0x3f8f3a, 0x4fa044, 0x358236, 0x62b04c],
    [0x4a9a3c, 0x5aa846, 0x3b8a38, 0x78c050],
    [0x2f7a3a, 0x3d8c42, 0x2a6e36, 0x56a64a],
  ][variant % 3];
  const parts = [trunk(2.6, 0.26, 0.42, 0x6e4a30, variant * 11)];
  const spots: [Vec3, number][] = [
    [[0, 3.7, 0], 1.95],
    [[1.2, 3.2, 0.6], 1.4],
    [[-1.2, 3.4, -0.5], 1.5],
    [[0.2, 5.0, -0.2], 1.45],
    [[-0.7, 4.5, 1.0], 1.2],
    [[1.0, 4.4, -1.0], 1.2],
  ];
  spots.forEach(([p, r], i) => parts.push(xf(tint(blob(r, variant * 7 + i, 0.16), palettes[i % 4], [0.7, 1.22], 0.05, i + variant), p)));
  return merge(parts);
}

export function pineGeometry(variant: number): THREE.BufferGeometry {
  const cols = [0x2c6e4a, 0x35805a, 0x2a6a40][variant % 3];
  const parts = [trunk(2.4, 0.22, 0.38, 0x5a3e2c, variant * 5 + 3)];
  const tiers = [
    [2.0, 2.3, 2.2],
    [3.2, 1.8, 2.1],
    [4.4, 1.4, 2.0],
    [5.6, 1.0, 1.9],
    [6.6, 0.55, 1.5],
  ];
  tiers.forEach(([y, r, h], i) => {
    const c = new THREE.ConeGeometry(r, h, 8, 1);
    c.translate(0, h / 2, 0);
    parts.push(xf(tint(c, cols, [0.62, 1.22], 0.07, i + variant * 9), [0, y, 0], [0, i * 0.5, 0]));
  });
  return merge(parts);
}

export function blossomGeometry(): THREE.BufferGeometry {
  const parts = [trunk(2.2, 0.22, 0.38, 0x6a4a3a, 77)];
  const cols = [0xf0a2bf, 0xffc6d8, 0xe48cb0, 0xffd9e4];
  const spots: [Vec3, number][] = [
    [[0, 3.4, 0], 1.7],
    [[1.2, 3.0, 0.5], 1.2],
    [[-1.1, 3.2, -0.4], 1.3],
    [[0.1, 4.5, 0.1], 1.2],
    [[-0.5, 4.0, 1.0], 1.0],
  ];
  spots.forEach(([p, r], i) => parts.push(xf(tint(blob(r, 40 + i, 0.2), cols[i % 4], [0.78, 1.18], 0.05, i), p)));
  return merge(parts);
}

export function bushGeometry(variant: number): THREE.BufferGeometry {
  const cols = [0x3f9440, 0x4aa04a, 0x56ac4c];
  const parts: THREE.BufferGeometry[] = [];
  const spots: [Vec3, number][] = [
    [[0, 0.55, 0], 0.85],
    [[0.7, 0.4, 0.3], 0.62],
    [[-0.6, 0.42, -0.3], 0.66],
    [[0.1, 0.35, 0.8], 0.5],
  ];
  spots.forEach(([p, r], i) => parts.push(xf(tint(blob(r, 90 + variant * 4 + i, 0.2), cols[(i + variant) % 3], [0.7, 1.2], 0.06, i), p)));
  if (variant === 2) {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      parts.push(xf(tint(new THREE.SphereGeometry(0.09, 6, 4), 0xe0384a, [1, 1], 0), [Math.cos(a) * 0.7, 0.7 + (i % 3) * 0.12, Math.sin(a) * 0.7]));
    }
  }
  return merge(parts);
}

export function rockGeometry(seed: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.getAttribute('position');
  const rng = new Rng(seed);
  const jitter: number[] = [];
  for (let i = 0; i < pos.count; i++) jitter.push(0.78 + rng.next() * 0.44);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setXYZ(i, pos.getX(i) * jitter[i], y * jitter[i] * (y > 0 ? 0.8 : 0.5), pos.getZ(i) * jitter[i]);
  }
  g = g.toNonIndexed();
  g.computeVertexNormals();
  return tint(g, 0x9a9a98, [0.62, 1.12], 0.1, seed);
}

export function mushroomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spots: [Vec3, number, number][] = [
    [[0, 0, 0], 0.5, 0xe0503c],
    [[0.5, 0, 0.3], 0.34, 0xf0f0e0],
    [[-0.4, 0, 0.35], 0.28, 0xe0503c],
  ];
  spots.forEach(([p, s, c], i) => {
    const stem = new THREE.CylinderGeometry(0.07 * s * 2, 0.1 * s * 2, 0.5 * s * 2, 6);
    stem.translate(0, 0.25 * s * 2, 0);
    parts.push(xf(tint(stem, 0xf4ead0, [0.8, 1.0], 0.02, i), p));
    const cap = new THREE.SphereGeometry(0.26 * s * 2, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(0, 0.5 * s * 2, 0);
    parts.push(xf(tint(cap, c, [0.85, 1.1], 0.03, i + 5), p));
  });
  return merge(parts);
}

function grassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const h = 0.7 + (i % 2) * 0.4;
    const g = new THREE.BufferGeometry();
    const w = 0.13;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0.03, h, 0], 3));
    g.setIndex([0, 1, 2]);
    g.computeVertexNormals();
    const c = new Float32Array([0.5, 0.62, 0.35, 0.5, 0.62, 0.35, 1.4, 1.45, 0.75]);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const a = i * 0.8 + 0.3;
    parts.push(xf(g, [Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18], [(i - 1.5) * 0.12, a, 0]));
  }
  return merge(parts);
}

// ------------------------------------------------------------------ materials

function foliageMaterial(hook: Hook, o: { sway?: number; rim?: number; flat?: boolean; roughness?: number } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness ?? 0.9, metalness: 0, flatShading: !!o.flat });
  stylize(m, { rim: o.rim ?? 0.28, rimColor: 0xd6ffb0, paint: 0.12, paintScale: 0.35, ao: 0.28 });
  if (o.sway) {
    const amp = o.sway;
    chainPatch(m, `sway${amp}`, (shader) => {
      shader.uniforms.uTime = SHARED.uTime;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
 vec2 swP = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
#else
 vec2 swP = vec2(0.0);
#endif
 float swH = max(transformed.y, 0.0);
 float swK = swH * swH * ${amp.toFixed(4)};
 transformed.x += sin(uTime * 1.35 + swP.x * 0.21 + swP.y * 0.13) * swK + sin(uTime * 3.1 + swP.y * 0.4) * swK * 0.25;
 transformed.z += cos(uTime * 1.1 + swP.y * 0.19 + swP.x * 0.11) * swK * 0.7;`,
      );
    });
  }
  hook(m);
  return m;
}

// ------------------------------------------------------------------ placement

function nearestLaneDist(x: number, z: number): number {
  let best = Infinity;
  for (const lane of LANES) {
    const pts = LANE_POINTS[lane];
    for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(x, z, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z));
  }
  return best;
}

const riverDist = (x: number, z: number) => Math.abs(x - z) / Math.SQRT2;
const baseDist = (x: number, z: number) => Math.min(Math.hypot(x - NEXUS_POS[0].x, z - NEXUS_POS[0].z), Math.hypot(x - NEXUS_POS[1].x, z - NEXUS_POS[1].z));
const nearCamp = (x: number, z: number, r: number) => CAMP_SPOTS.some((c) => Math.hypot(c.x - x, c.z - z) < r);
const nearObstacle = (x: number, z: number, pad: number) => OBSTACLES.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + pad);

/** Open ground inside the playfield that is not a lane, river, base or camp. */
function isJungle(x: number, z: number, pad = 5): boolean {
  if (Math.abs(x) > MAP_HALF - 4 || Math.abs(z) > MAP_HALF - 4) return false;
  if (nearestLaneDist(x, z) < LANE_WIDTH / 2 + pad) return false;
  if (riverDist(x, z) < 8 + pad * 0.5) return false;
  if (baseDist(x, z) < 38) return false;
  if (nearObstacle(x, z, pad * 0.6)) return false;
  if (nearCamp(x, z, 9)) return false;
  return true;
}

class Scatter {
  private mesh: THREE.InstancedMesh;
  private n = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private c = new THREE.Color();
  readonly cap: number;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number, shadows: boolean, root: THREE.Object3D) {
    this.cap = cap;
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.castShadow = shadows;
    this.mesh.receiveShadow = shadows;
    this.mesh.frustumCulled = false;
    root.add(this.mesh);
  }
  get count() {
    return this.n;
  }
  get full() {
    return this.n >= this.cap;
  }
  add(x: number, y: number, z: number, scale: number | Vec3, yaw: number, tilt = 0, color?: THREE.ColorRepresentation) {
    if (this.n >= this.cap) return;
    this.e.set(tilt * (Math.sin(yaw * 7) * 0.5), yaw, tilt * Math.cos(yaw * 5) * 0.5);
    this.q.setFromEuler(this.e);
    const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, s);
    this.mesh.setMatrixAt(this.n, this.m);
    if (color !== undefined) this.mesh.setColorAt(this.n, this.c.set(color));
    this.n++;
  }
  done() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ public

export function buildFoliage(hook: Hook, quality: Quality): THREE.Group {
  const root = new THREE.Group();
  const rng = new Rng(2024);
  const shadows = quality !== 'low';
  const dens = quality === 'high' ? 1 : quality === 'medium' ? 0.7 : 0.35;

  // ---- trees (inside the map, in the jungle)
  const treeMat = foliageMaterial(hook, { sway: 0.0045, rim: 0.3 });
  const kinds = [
    { geo: oakGeometry(0), w: 3, cap: Math.floor(130 * dens) + 20 },
    { geo: oakGeometry(1), w: 3, cap: Math.floor(130 * dens) + 20 },
    { geo: pineGeometry(0), w: 4, cap: Math.floor(150 * dens) + 20 },
    { geo: pineGeometry(1), w: 3, cap: Math.floor(100 * dens) + 20 },
    { geo: blossomGeometry(), w: 1, cap: Math.floor(40 * dens) + 6 },
  ];
  const trees = kinds.map((k) => new Scatter(k.geo, treeMat, k.cap, shadows, root));
  const totalW = kinds.reduce((a, k) => a + k.w, 0);
  let guard = 0;
  while (trees.some((t) => !t.full) && guard++ < 60000) {
    const x = rng.range(-MAP_HALF + 4, MAP_HALF - 4);
    const z = rng.range(-MAP_HALF + 4, MAP_HALF - 4);
    if (!isJungle(x, z, 6)) continue;
    // thin out near the lane edge so lanes read clearly, thicken inside the jungle
    let r = rng.next() * totalW;
    let ki = 0;
    for (; ki < kinds.length - 1; ki++) {
      if (r < kinds[ki].w) break;
      r -= kinds[ki].w;
    }
    if (trees[ki].full) continue;
    const s = rng.range(0.85, 1.35);
    trees[ki].add(x, 0, z, [s, s * rng.range(0.9, 1.25), s], rng.range(0, 6.28), 0.05);
  }

  // ---- outer forest wall beyond the playfield edge (hides the void)
  const wallMat = foliageMaterial(hook, { sway: 0.003, rim: 0.12 });
  const wallPine = new Scatter(pineGeometry(2), wallMat, Math.floor(260 * dens) + 40, shadows, root);
  const wallOak = new Scatter(oakGeometry(2), wallMat, Math.floor(160 * dens) + 30, shadows, root);
  for (let i = 0; i < wallPine.cap + wallOak.cap; i++) {
    const side = rng.int(0, 3);
    const a = rng.range(-MAP_HALF - 12, MAP_HALF + 12);
    const off = MAP_HALF + rng.range(4, 24);
    const [x, z] = side === 0 ? [a, -off] : side === 1 ? [a, off] : side === 2 ? [-off, a] : [off, a];
    const s = rng.range(1.2, 2.2);
    const col = new THREE.Color().setHSL(0.34 + rng.range(-0.03, 0.03), 0.4, 0.2 + rng.next() * 0.08);
    (i % 2 ? wallPine : wallOak).add(x, 0, z, [s, s * rng.range(1.0, 1.5), s], rng.range(0, 6.28), 0.05, col);
  }
  wallPine.done();
  wallOak.done();
  trees.forEach((t) => t.done());

  // ---- bushes along lanes and in the jungle
  const bushMat = foliageMaterial(hook, { sway: 0.012 });
  const bushes = [0, 1, 2].map((v) => new Scatter(bushGeometry(v), bushMat, Math.floor(160 * dens) + 10, shadows, root));
  guard = 0;
  while (bushes.some((b) => !b.full) && guard++ < 40000) {
    const x = rng.range(-MAP_HALF + 4, MAP_HALF - 4);
    const z = rng.range(-MAP_HALF + 4, MAP_HALF - 4);
    const ld = nearestLaneDist(x, z);
    const edge = ld > LANE_WIDTH / 2 + 1.2 && ld < LANE_WIDTH / 2 + 7;
    if (!edge && !isJungle(x, z, 3)) continue;
    if (riverDist(x, z) < 9.5 || baseDist(x, z) < 36 || nearObstacle(x, z, 1) || nearCamp(x, z, 7)) continue;
    const b = bushes[rng.int(0, 2)];
    const s = rng.range(0.8, 1.5);
    b.add(x, 0, z, [s, s * rng.range(0.8, 1.1), s], rng.range(0, 6.28), 0.06);
  }
  bushes.forEach((b) => b.done());

  // ---- grass tufts
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  stylize(grassMat, { rim: 0.2, rimColor: 0xe8ffb8, paint: 0.2, paintScale: 0.5, ao: 0 });
  chainPatch(grassMat, 'grass', (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
 vec2 gP = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
 float gK = transformed.y * 0.28;
 transformed.x += sin(uTime * 1.9 + gP.x * 0.35 + gP.y * 0.2) * gK;
 transformed.z += cos(uTime * 1.6 + gP.y * 0.3) * gK * 0.6;`,
    );
  });
  hook(grassMat);
  const grass = new Scatter(grassGeometry(), grassMat, Math.floor(16000 * dens), false, root);
  const tones = [0x6db84a, 0x5aa83e, 0x82c455, 0x4c9a3a, 0x95c85a];
  guard = 0;
  while (!grass.full && guard++ < 200000) {
    const x = rng.range(-MAP_HALF + 2, MAP_HALF - 2);
    const z = rng.range(-MAP_HALF + 2, MAP_HALF - 2);
    const ld = nearestLaneDist(x, z);
    if (ld < LANE_WIDTH / 2 + 0.6 || riverDist(x, z) < 8.8 || baseDist(x, z) < 34) continue;
    // denser away from lanes
    if (rng.next() > 0.35 + Math.min(0.65, (ld - LANE_WIDTH / 2) / 18)) continue;
    const s = rng.range(0.8, 1.7);
    grass.add(x, 0, z, [s, s * rng.range(0.8, 1.3), s], rng.range(0, 6.28), 0, tones[rng.int(0, 4)]);
  }
  grass.done();

  // ---- reeds along the river banks
  const reeds = new Scatter(grassGeometry(), grassMat, Math.floor(900 * dens) + 50, false, root);
  guard = 0;
  while (!reeds.full && guard++ < 20000) {
    const t = rng.range(-1, 1) * (MAP_HALF - 6);
    const side = rng.next() < 0.5 ? -1 : 1;
    const off = side * rng.range(7.2, 9.6);
    const x = t * Math.SQRT1_2 + off * Math.SQRT1_2 + rng.range(-0.8, 0.8);
    const z = t * Math.SQRT1_2 - off * Math.SQRT1_2 + rng.range(-0.8, 0.8);
    if (baseDist(x, z) < 32 || nearestLaneDist(x, z) < LANE_WIDTH / 2) continue;
    const s = rng.range(1.2, 2.2);
    reeds.add(x, 0, z, [s * 0.8, s * 1.4, s * 0.8], rng.range(0, 6.28), 0, rng.next() < 0.8 ? 0xa8b868 : 0x7aa050);
  }
  reeds.done();

  // ---- flowers
  const flowerMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  stylize(flowerMat, { rim: 0.2, paint: 0.05, ao: 0 });
  hook(flowerMat);
  const flowers = new Scatter(new THREE.IcosahedronGeometry(0.22, 0), flowerMat, Math.floor(1100 * dens) + 60, false, root);
  const fcols = [0xfff2b0, 0xffffff, 0xffa8c8, 0xa8c8ff, 0xffd060];
  guard = 0;
  while (!flowers.full && guard++ < 40000) {
    const x = rng.range(-MAP_HALF + 4, MAP_HALF - 4);
    const z = rng.range(-MAP_HALF + 4, MAP_HALF - 4);
    if (nearestLaneDist(x, z) < LANE_WIDTH / 2 + 1 || riverDist(x, z) < 9 || baseDist(x, z) < 34) continue;
    if (rng.next() > 0.5) continue;
    flowers.add(x, 0.28, z, [1, 0.7, 1], rng.range(0, 6.28), 0, fcols[rng.int(0, 4)]);
  }
  flowers.done();

  // ---- mushrooms near camps and tree bases
  const shroomMat = foliageMaterial(hook, { rim: 0.3 });
  const shrooms = new Scatter(mushroomGeometry(), shroomMat, 120, false, root);
  for (let i = 0; i < 120; i++) {
    const c = CAMP_SPOTS[rng.int(0, CAMP_SPOTS.length - 1)];
    const a = rng.range(0, 6.28);
    const d = rng.range(5, 9.5);
    const x = c.x + Math.cos(a) * d;
    const z = c.z + Math.sin(a) * d;
    if (nearObstacle(x, z, 0.5)) continue;
    const s = rng.range(0.7, 1.3);
    shrooms.add(x, 0, z, s, rng.range(0, 6.28), 0.1);
  }
  shrooms.done();

  // ---- rocks: obstacles, lane edge stones, camp rings, cliffs
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, flatShading: true });
  stylize(rockMat, { rim: 0.22, rimColor: 0xcfe0ff, paint: 0.22, paintScale: 0.5, ao: 0.4 });
  chainPatch(rockMat, 'moss', (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
{ vec3 fn = normalize(cross(dFdx(vLfWPos), dFdy(vLfWPos)));
  float mossK = smoothstep(0.55, 0.86, fn.y) * smoothstep(0.35, 0.6, lfFbm(vLfWPos * 0.9));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.52, 0.20) * (0.8 + 0.4 * lfNoise(vLfWPos * 3.0)), mossK * 0.92); }`,
    );
  });
  hook(rockMat);
  const rockGeos = [rockGeometry(3), rockGeometry(8), rockGeometry(15), rockGeometry(21)];
  const big = rockGeos.map((g) => new Scatter(g, rockMat, 220, shadows, root));
  OBSTACLES.forEach((o, i) => {
    const h = o.kind === 'wall' ? rng.range(2.8, 4.2) : rng.range(2.0, 3.2);
    const R = big[i % 4];
    R.add(o.x, h * 0.18, o.z, [o.r * 1.1, h * 0.95, o.r * 1.1], rng.range(0, 6.28), 0, new THREE.Color().setHSL(0.1, 0.04, 0.42 + rng.next() * 0.16));
    const sat = o.r > 2.2 ? 3 : 2;
    for (let k = 0; k < sat; k++) {
      const a = rng.range(0, 6.28);
      const d = o.r * rng.range(0.7, 1.1);
      const s = o.r * rng.range(0.35, 0.6);
      big[(i + k + 1) % 4].add(o.x + Math.cos(a) * d, s * 0.2, o.z + Math.sin(a) * d, [s, s * rng.range(0.7, 1.1), s], rng.range(0, 6.28), 0, new THREE.Color().setHSL(0.1, 0.04, 0.4 + rng.next() * 0.18));
    }
  });
  // lane edge stones
  const stones = new Scatter(rockGeos[1], rockMat, Math.floor(700 * dens) + 40, false, root);
  guard = 0;
  while (!stones.full && guard++ < 30000) {
    const lane = LANES[rng.int(0, 2)];
    const pts = LANE_POINTS[lane];
    const si = rng.int(0, pts.length - 2);
    const t = rng.next();
    const px = pts[si].x + (pts[si + 1].x - pts[si].x) * t;
    const pz = pts[si].z + (pts[si + 1].z - pts[si].z) * t;
    const dx = pts[si + 1].x - pts[si].x;
    const dz = pts[si + 1].z - pts[si].z;
    const len = Math.hypot(dx, dz) || 1;
    const side = rng.next() < 0.5 ? -1 : 1;
    const off = side * (LANE_WIDTH / 2 + rng.range(0.4, 1.6));
    const x = px + (-dz / len) * off;
    const z = pz + (dx / len) * off;
    if (baseDist(x, z) < 30 || riverDist(x, z) < 8 || nearObstacle(x, z, 0.5)) continue;
    const s = rng.range(0.25, 0.75);
    stones.add(x, s * 0.1, z, [s, s * 0.8, s], rng.range(0, 6.28), 0, new THREE.Color().setHSL(0.09, 0.05, 0.45 + rng.next() * 0.2));
  }
  stones.done();
  // camp stone rings
  const rings = new Scatter(rockGeos[2], rockMat, CAMP_SPOTS.length * 9 + 4, shadows, root);
  for (const c of CAMP_SPOTS) {
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rng.range(-0.15, 0.15);
      const s = rng.range(0.5, 0.95);
      rings.add(c.x + Math.cos(a) * 7.5, s * 0.25, c.z + Math.sin(a) * 7.5, [s, s, s], rng.range(0, 6.28), 0, new THREE.Color().setHSL(0.09, 0.05, 0.4 + rng.next() * 0.2));
    }
  }
  rings.done();
  // border cliffs: two staggered rows of large rock
  const cliffs = [0, 1, 2, 3].map((i) => new Scatter(rockGeos[i], rockMat, Math.floor(130 * dens) + 20, shadows, root));
  for (let i = 0; i < cliffs.reduce((a, c) => a + c.cap, 0); i++) {
    const side = rng.int(0, 3);
    const a = rng.range(-MAP_HALF - 6, MAP_HALF + 6);
    const row = rng.next() < 0.55 ? 0 : 1;
    const off = MAP_HALF + 1 + row * 6 + rng.range(-1.5, 2.5);
    const [x, z] = side === 0 ? [a, -off] : side === 1 ? [a, off] : side === 2 ? [-off, a] : [off, a];
    const s = rng.range(3.4, 6.5) * (row ? 1.25 : 1);
    cliffs[rng.int(0, 3)].add(x, s * 0.25, z, [s, s * rng.range(0.9, 1.7), s], rng.range(0, 6.28), 0, new THREE.Color().setHSL(0.08, 0.06, 0.3 + rng.next() * 0.14));
  }
  big.forEach((b) => b.done());
  cliffs.forEach((c) => c.done());
  return root;
}
