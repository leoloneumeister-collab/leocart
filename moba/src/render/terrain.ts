/** Ground texture, rocks, trees and map border. Everything is generated procedurally. */
import * as THREE from 'three';
import { CAMP_SPOTS, LANES, LANE_POINTS, LANE_WIDTH, MAP_HALF, NEXUS_POS, OBSTACLES } from '../data/map.ts';
import { distToSegment, Rng } from '../sim/math.ts';
import { G, mergeParts } from './geo.ts';
import type { Part } from './geo.ts';
import { buildRock } from './models.ts';

const PAD = 14;
export const GROUND_SIZE = (MAP_HALF + PAD) * 2;

export interface Painter {
  /** World to canvas pixels. */
  tx: (x: number) => number;
  tz: (z: number) => number;
  scale: number;
}

function painter(size: number): Painter {
  const scale = size / GROUND_SIZE;
  return { tx: (x) => (x + MAP_HALF + PAD) * scale, tz: (z) => (z + MAP_HALF + PAD) * scale, scale };
}

function polyline(ctx: CanvasRenderingContext2D, p: Painter, pts: { x: number; z: number }[]) {
  ctx.beginPath();
  pts.forEach((q, i) => (i === 0 ? ctx.moveTo(p.tx(q.x), p.tz(q.z)) : ctx.lineTo(p.tx(q.x), p.tz(q.z))));
}

/** Paint the whole map into a square canvas. `detail` adds noise and decals (big texture only). */
export function paintMap(ctx: CanvasRenderingContext2D, size: number, detail: boolean): Painter {
  const p = painter(size);
  const rng = new Rng(7);
  // Out of bounds
  ctx.fillStyle = '#1b1f1c';
  ctx.fillRect(0, 0, size, size);
  // Playfield (jungle green)
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#2c5530');
  grad.addColorStop(0.5, '#336437');
  grad.addColorStop(1, '#2c5530');
  ctx.fillStyle = grad;
  ctx.fillRect(p.tx(-MAP_HALF), p.tz(-MAP_HALF), MAP_HALF * 2 * p.scale, MAP_HALF * 2 * p.scale);
  if (detail) {
    for (let i = 0; i < 9000; i++) {
      const x = rng.range(-MAP_HALF, MAP_HALF);
      const z = rng.range(-MAP_HALF, MAP_HALF);
      const l = rng.range(0, 1);
      ctx.fillStyle = l < 0.5 ? 'rgba(20,50,25,0.18)' : 'rgba(90,150,70,0.12)';
      ctx.beginPath();
      ctx.arc(p.tx(x), p.tz(z), rng.range(2, 9) * p.scale * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // River along the anti-diagonal (top-left to bottom-right)
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#3b6f86';
  ctx.lineWidth = 17 * p.scale;
  polyline(ctx, p, [{ x: -MAP_HALF, z: -MAP_HALF }, { x: MAP_HALF, z: MAP_HALF }]);
  ctx.stroke();
  ctx.strokeStyle = '#4f94b0';
  ctx.lineWidth = 11 * p.scale;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(190,230,245,0.35)';
  ctx.lineWidth = 2.2 * p.scale;
  ctx.stroke();
  ctx.restore();
  // Camp clearings
  for (const c of CAMP_SPOTS) {
    const g = ctx.createRadialGradient(p.tx(c.x), p.tz(c.z), 0, p.tx(c.x), p.tz(c.z), 8 * p.scale);
    g.addColorStop(0, 'rgba(120,98,62,0.9)');
    g.addColorStop(1, 'rgba(120,98,62,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.tx(c.x), p.tz(c.z), 8 * p.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lanes
  for (const lane of LANES) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5b4a30';
    ctx.lineWidth = (LANE_WIDTH + 2.4) * p.scale;
    polyline(ctx, p, LANE_POINTS[lane]);
    ctx.stroke();
    ctx.strokeStyle = '#a58b60';
    ctx.lineWidth = LANE_WIDTH * p.scale;
    polyline(ctx, p, LANE_POINTS[lane]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(210,190,140,0.35)';
    ctx.lineWidth = LANE_WIDTH * 0.45 * p.scale;
    polyline(ctx, p, LANE_POINTS[lane]);
    ctx.stroke();
  }
  if (detail) {
    for (let i = 0; i < 6000; i++) {
      const lane = LANES[i % 3];
      const pts = LANE_POINTS[lane];
      const seg = rng.int(0, pts.length - 2);
      const t = rng.next();
      const x = pts[seg].x + (pts[seg + 1].x - pts[seg].x) * t + rng.range(-8, 8);
      const z = pts[seg].z + (pts[seg + 1].z - pts[seg].z) * t + rng.range(-8, 8);
      ctx.fillStyle = rng.next() < 0.5 ? 'rgba(90,70,45,0.25)' : 'rgba(220,200,150,0.18)';
      ctx.fillRect(p.tx(x), p.tz(z), rng.range(0.5, 2) * p.scale, rng.range(0.5, 2) * p.scale);
    }
  }
  // Bases
  for (const team of [0, 1] as const) {
    const n = NEXUS_POS[team];
    const base = team === 0 ? '#3a4c78' : '#7a3a3e';
    const light = team === 0 ? '#6a86c4' : '#c46a70';
    const g = ctx.createRadialGradient(p.tx(n.x), p.tz(n.z), 2, p.tx(n.x), p.tz(n.z), 36 * p.scale);
    g.addColorStop(0, base);
    g.addColorStop(0.75, base);
    g.addColorStop(1, 'rgba(60,60,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.tx(n.x), p.tz(n.z), 36 * p.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = light;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.8 * p.scale;
    for (const r of [10, 16, 24, 30]) {
      ctx.beginPath();
      ctx.arc(p.tx(n.x), p.tz(n.z), r * p.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Spokes
    ctx.strokeStyle = light;
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(p.tx(n.x + Math.cos(a) * 10), p.tz(n.z + Math.sin(a) * 10));
      ctx.lineTo(p.tx(n.x + Math.cos(a) * 30), p.tz(n.z + Math.sin(a) * 30));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Fountain
    ctx.fillStyle = team === 0 ? 'rgba(80,170,255,0.30)' : 'rgba(255,110,100,0.30)';
    ctx.beginPath();
    ctx.arc(p.tx(n.x - (team === 0 ? -5 : 5)), p.tz(n.z + (team === 0 ? 5 : -5)), 14 * p.scale, 0, Math.PI * 2);
    ctx.fill();
  }
  return p;
}

export function buildGroundTexture(): THREE.CanvasTexture {
  const size = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  paintMap(ctx, size, true);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function nearestLaneDist(x: number, z: number): number {
  let best = Infinity;
  for (const lane of LANES) {
    const pts = LANE_POINTS[lane];
    for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(x, z, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z));
  }
  return best;
}

export function buildTerrain(onMaterial?: (m: THREE.Material) => void): THREE.Group {
  const root = new THREE.Group();
  // Ground
  const groundMat = new THREE.MeshStandardMaterial({ map: buildGroundTexture(), roughness: 1, metalness: 0 });
  onMaterial?.(groundMat);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  // Far dark ground so the camera never sees the void
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshBasicMaterial({ color: 0x0d100e }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.4;
  root.add(far);

  // Border cliffs
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 1, flatShading: true });
  onMaterial?.(cliffMat);
  const rng = new Rng(21);
  const cliffGeo = buildRock(1, 3);
  const cliffs = new THREE.InstancedMesh(cliffGeo, cliffMat, 520);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let ci = 0;
  for (let i = 0; i < 130; i++) {
    const t = (i / 130) * 2 - 1;
    const pos = t * (MAP_HALF + 4);
    for (const [x, z] of [
      [pos, -MAP_HALF - 3],
      [pos, MAP_HALF + 3],
      [-MAP_HALF - 3, pos],
      [MAP_HALF + 3, pos],
    ]) {
      const s = rng.range(2.4, 4.4);
      e.set(rng.range(0, 3), rng.range(0, 6), rng.range(0, 3));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x + rng.range(-2, 2), s * 0.35, z + rng.range(-2, 2)), q, new THREE.Vector3(s, s * rng.range(0.7, 1.4), s));
      cliffs.setMatrixAt(ci++, m);
    }
  }
  cliffs.count = ci;
  cliffs.castShadow = true;
  cliffs.receiveShadow = true;
  root.add(cliffs);

  // Obstacles
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.95, flatShading: true });
  onMaterial?.(rockMat);
  const rocks = new THREE.InstancedMesh(buildRock(1, 9), rockMat, OBSTACLES.length);
  const col = new THREE.Color();
  OBSTACLES.forEach((o, i) => {
    const h = o.kind === 'wall' ? rng.range(2.6, 3.8) : rng.range(1.8, 3.0);
    e.set(0, rng.range(0, 6.28), 0);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(o.x, h * 0.35, o.z), q, new THREE.Vector3(o.r * 1.15, h * 0.9, o.r * 1.15));
    rocks.setMatrixAt(i, m);
    col.setHSL(0.08, 0.05 + rng.next() * 0.05, 0.38 + rng.next() * 0.18);
    rocks.setColorAt(i, col);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  root.add(rocks);

  // Trees
  const treeParts: Part[] = [
    { geo: G.cyl(0.35, 0.5, 2.2, 6), color: 0x4a3524, p: [0, 1.1, 0] },
    { geo: G.cone(2.0, 3.2, 7), color: 0x2f6a38, p: [0, 3.4, 0] },
    { geo: G.cone(1.5, 2.6, 7), color: 0x3a7a40, p: [0, 5.0, 0] },
    { geo: G.cone(1.0, 2.0, 7), color: 0x4a8a48, p: [0, 6.4, 0] },
  ];
  const treeGeo = mergeParts(treeParts);
  const maxTrees = 520;
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  onMaterial?.(treeMat);
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, maxTrees);
  let ti = 0;
  let guard = 0;
  while (ti < maxTrees && guard++ < 20000) {
    const border = ti < 160;
    let x: number;
    let z: number;
    if (border) {
      const side = rng.int(0, 3);
      const a = rng.range(-MAP_HALF, MAP_HALF);
      const off = MAP_HALF - rng.range(0, 3.5);
      [x, z] = side === 0 ? [a, -off] : side === 1 ? [a, off] : side === 2 ? [-off, a] : [off, a];
    } else {
      x = rng.range(-MAP_HALF + 5, MAP_HALF - 5);
      z = rng.range(-MAP_HALF + 5, MAP_HALF - 5);
    }
    if (!border) {
      if (nearestLaneDist(x, z) < LANE_WIDTH / 2 + 5) continue;
      if (Math.abs(x - z) / Math.SQRT2 < 10) continue; // river
      if (Math.hypot(x - NEXUS_POS[0].x, z - NEXUS_POS[0].z) < 40 || Math.hypot(x - NEXUS_POS[1].x, z - NEXUS_POS[1].z) < 40) continue;
      if (OBSTACLES.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + 3)) continue;
      if (CAMP_SPOTS.some((c) => Math.hypot(c.x - x, c.z - z) < 10)) continue;
    } else if (nearestLaneDist(x, z) < 11) continue;
    const s = rng.range(0.6, 1.0);
    e.set(rng.range(-0.06, 0.06), rng.range(0, 6.28), rng.range(-0.06, 0.06));
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * rng.range(0.9, 1.3), s));
    trees.setMatrixAt(ti++, m);
  }
  trees.count = ti;
  trees.castShadow = true;
  root.add(trees);
  return root;
}
