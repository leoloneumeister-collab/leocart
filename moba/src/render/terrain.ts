/** Ground texture, rocks, trees and map border. Everything is generated procedurally. */
import * as THREE from 'three';
import { CAMP_SPOTS, LANES, LANE_POINTS, LANE_WIDTH, MAP_HALF, NEXUS_POS } from '../data/map.ts';
import { Rng } from '../sim/math.ts';
import { buildFoliage } from './foliage.ts';
import { chainPatch, stylize } from './materials.ts';
import type { Quality } from './pipeline.ts';
import { buildWater } from './water.ts';

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

/** Paint the whole map into a square canvas. `detail` adds painterly strokes and decals (big texture only). */
export function paintMap(ctx: CanvasRenderingContext2D, size: number, detail: boolean): Painter {
  const p = painter(size);
  const rng = new Rng(7);
  const S = p.scale;
  const field = { x: p.tx(-MAP_HALF), z: p.tz(-MAP_HALF), w: MAP_HALF * 2 * S };
  // Out of bounds
  ctx.fillStyle = '#16231a';
  ctx.fillRect(0, 0, size, size);
  // Playfield base, a little lighter around the lanes
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#4a8a3a');
  grad.addColorStop(0.5, '#559a42');
  grad.addColorStop(1, '#4a8a3a');
  ctx.fillStyle = grad;
  ctx.fillRect(field.x, field.z, field.w, field.w);
  if (detail) {
    // big soft colour blotches: the "hand painted" underlayer
    const tones = ['rgba(34,92,48,', 'rgba(94,168,70,', 'rgba(120,184,84,', 'rgba(44,110,60,', 'rgba(150,176,80,'];
    for (let i = 0; i < 700; i++) {
      const x = rng.range(-MAP_HALF, MAP_HALF);
      const z = rng.range(-MAP_HALF, MAP_HALF);
      const r = rng.range(5, 24) * S;
      const g = ctx.createRadialGradient(p.tx(x), p.tz(z), 0, p.tx(x), p.tz(z), r);
      const c = tones[rng.int(0, tones.length - 1)];
      g.addColorStop(0, c + '0.20)');
      g.addColorStop(1, c + '0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.tx(x), p.tz(z), r, 0, Math.PI * 2);
      ctx.fill();
    }
    // grass strokes
    ctx.lineCap = 'round';
    for (let i = 0; i < 52000; i++) {
      const x = rng.range(-MAP_HALF, MAP_HALF);
      const z = rng.range(-MAP_HALF, MAP_HALF);
      const a = rng.range(-2.2, -0.9);
      const l = rng.range(0.8, 2.6) * S;
      ctx.strokeStyle = rng.next() < 0.5 ? `rgba(30,84,40,${rng.range(0.12, 0.3)})` : `rgba(150,214,100,${rng.range(0.1, 0.26)})`;
      ctx.lineWidth = rng.range(0.25, 0.7) * S;
      ctx.beginPath();
      ctx.moveTo(p.tx(x), p.tz(z));
      ctx.lineTo(p.tx(x) + Math.cos(a) * l, p.tz(z) + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  // River bed and sandy banks (the animated water mesh sits on top)
  ctx.save();
  ctx.lineCap = 'butt';
  const rv: [number, number][] = [[-MAP_HALF - 12, -MAP_HALF - 12], [MAP_HALF + 12, MAP_HALF + 12]];
  const rline = () => polyline(ctx, p, rv.map(([x, z]) => ({ x, z })));
  if (detail) {
    ctx.strokeStyle = 'rgba(120,90,50,0.35)';
    ctx.lineWidth = 27 * S;
    rline();
    ctx.stroke();
    ctx.strokeStyle = '#cdb98c';
    ctx.lineWidth = 23 * S;
    rline();
    ctx.stroke();
    ctx.strokeStyle = '#e2d3a8';
    ctx.lineWidth = 20 * S;
    rline();
    ctx.stroke();
    ctx.strokeStyle = '#2c6e84';
    ctx.lineWidth = 15 * S;
    rline();
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#3b6f86';
    ctx.lineWidth = 17 * S;
    rline();
    ctx.stroke();
    ctx.strokeStyle = '#4f94b0';
    ctx.lineWidth = 11 * S;
    rline();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,230,245,0.35)';
    ctx.lineWidth = 2.2 * S;
    rline();
    ctx.stroke();
  }
  ctx.restore();
  // Camp clearings: trampled dirt with a darker rim
  for (const c of CAMP_SPOTS) {
    const g = ctx.createRadialGradient(p.tx(c.x), p.tz(c.z), 0, p.tx(c.x), p.tz(c.z), 9 * S);
    g.addColorStop(0, 'rgba(150,118,76,0.95)');
    g.addColorStop(0.72, 'rgba(132,102,64,0.85)');
    g.addColorStop(1, 'rgba(110,86,54,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.tx(c.x), p.tz(c.z), 9 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  // Lanes: dark dirt edge, packed earth, lighter worn centre
  for (const lane of LANES) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = detail ? 'rgba(70,52,30,0.55)' : '#5b4a30';
    ctx.lineWidth = (LANE_WIDTH + 3.6) * S;
    polyline(ctx, p, LANE_POINTS[lane]);
    ctx.stroke();
    ctx.strokeStyle = '#a58b60';
    ctx.lineWidth = (LANE_WIDTH + 0.8) * S;
    polyline(ctx, p, LANE_POINTS[lane]);
    ctx.stroke();
    ctx.strokeStyle = '#b89e70';
    ctx.lineWidth = LANE_WIDTH * 0.8 * S;
    polyline(ctx, p, LANE_POINTS[lane]);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(224,206,158,0.5)';
    ctx.lineWidth = LANE_WIDTH * 0.42 * S;
    polyline(ctx, p, LANE_POINTS[lane]);
    ctx.stroke();
  }
  if (detail) {
    // pebbles, cart tracks and cracks on the lanes
    for (let i = 0; i < 16000; i++) {
      const lane = LANES[i % 3];
      const pts = LANE_POINTS[lane];
      const seg = rng.int(0, pts.length - 2);
      const t = rng.next();
      const x = pts[seg].x + (pts[seg + 1].x - pts[seg].x) * t + rng.range(-LANE_WIDTH / 2, LANE_WIDTH / 2);
      const z = pts[seg].z + (pts[seg + 1].z - pts[seg].z) * t + rng.range(-LANE_WIDTH / 2, LANE_WIDTH / 2);
      const k = rng.next();
      ctx.fillStyle = k < 0.4 ? 'rgba(96,74,46,0.2)' : k < 0.8 ? 'rgba(236,220,176,0.2)' : 'rgba(120,120,116,0.3)';
      ctx.beginPath();
      ctx.ellipse(p.tx(x), p.tz(z), rng.range(0.15, 0.55) * S, rng.range(0.12, 0.35) * S, rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(80,60,36,0.13)';
    ctx.lineWidth = 0.6 * S;
    for (const lane of LANES) {
      for (const off of [-3.2, 3.2]) {
        const pts = LANE_POINTS[lane];
        ctx.beginPath();
        pts.forEach((q, i) => {
          const nx = i < pts.length - 1 ? pts[i + 1].x - q.x : q.x - pts[i - 1].x;
          const nz = i < pts.length - 1 ? pts[i + 1].z - q.z : q.z - pts[i - 1].z;
          const l = Math.hypot(nx, nz) || 1;
          const x = q.x - (nz / l) * off;
          const z = q.z + (nx / l) * off;
          if (i === 0) ctx.moveTo(p.tx(x), p.tz(z));
          else ctx.lineTo(p.tx(x), p.tz(z));
        });
        ctx.stroke();
      }
    }
  }
  // Bases: tiled stone platform with a glowing rune ring
  for (const team of [0, 1] as const) {
    const n = NEXUS_POS[team];
    const base = team === 0 ? '#41568a' : '#8a4146';
    const baseDark = team === 0 ? '#2e3f6e' : '#6e2e34';
    const light = team === 0 ? '#8fb2ff' : '#ff9a96';
    const cx = p.tx(n.x);
    const cz = p.tz(n.z);
    const g = ctx.createRadialGradient(cx, cz, 2, cx, cz, 38 * S);
    g.addColorStop(0, base);
    g.addColorStop(0.8, baseDark);
    g.addColorStop(1, 'rgba(60,60,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cz, 38 * S, 0, Math.PI * 2);
    ctx.fill();
    // stone tiles in rings
    ctx.lineWidth = 0.35 * S;
    for (let r = 6; r < 34; r += 3.6) {
      const count = Math.round((r * Math.PI * 2) / 4.2);
      for (let i = 0; i < count; i++) {
        const a0 = (i / count) * Math.PI * 2 + r * 0.3;
        const a1 = ((i + 0.92) / count) * Math.PI * 2 + r * 0.3;
        ctx.fillStyle = (i + Math.round(r)) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        ctx.strokeStyle = 'rgba(10,10,30,0.22)';
        ctx.beginPath();
        ctx.arc(cx, cz, r * S, a0, a1);
        ctx.arc(cx, cz, (r + 3.3) * S, a1, a0, true);
        ctx.closePath();
        ctx.fill();
        if (detail) ctx.stroke();
      }
    }
    ctx.strokeStyle = light;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.7 * S;
    for (const r of [9, 17, 25, 32]) {
      ctx.beginPath();
      ctx.arc(cx, cz, r * S, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 10 * S, cz + Math.sin(a) * 10 * S);
      ctx.lineTo(cx + Math.cos(a) * 31 * S, cz + Math.sin(a) * 31 * S);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // rune ticks on the outer ring
    if (detail) {
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * 28.5 * S, cz + Math.sin(a) * 28.5 * S);
        ctx.rotate(a);
        ctx.fillRect(-0.15 * S, -(i % 3 === 0 ? 0.9 : 0.45) * S, 0.3 * S, (i % 3 === 0 ? 1.8 : 0.9) * S);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    // Fountain pool
    const fx = p.tx(n.x - (team === 0 ? -5 : 5));
    const fz = p.tz(n.z + (team === 0 ? 5 : -5));
    const fg = ctx.createRadialGradient(fx, fz, 0, fx, fz, 14 * S);
    fg.addColorStop(0, team === 0 ? 'rgba(130,210,255,0.55)' : 'rgba(255,150,130,0.55)');
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(fx, fz, 14 * S, 0, Math.PI * 2);
    ctx.fill();
  }
  if (detail) {
    // darken toward the map edge
    const edge = ctx.createRadialGradient(size / 2, size / 2, size * 0.36, size / 2, size / 2, size * 0.72);
    edge.addColorStop(0, 'rgba(8,20,12,0)');
    edge.addColorStop(1, 'rgba(8,20,12,0.62)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, size, size);
  }
  return p;
}

export function buildGroundTexture(size = 2048): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  paintMap(ctx, size, true);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function buildTerrain(onMaterial: (m: THREE.Material) => void, quality: Quality = 'medium'): THREE.Group {
  const root = new THREE.Group();
  // Ground: painted albedo + soft moving cloud shadows
  const groundMat = new THREE.MeshStandardMaterial({ map: buildGroundTexture(quality === 'high' ? 4096 : 2048), roughness: 0.95, metalness: 0, color: 0xd8d8d8 });
  stylize(groundMat, { rim: 0, paint: 0.1, paintScale: 0.16, ao: 0 });
  chainPatch(groundMat, 'clouds', (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{ float cl = lfFbm(vec3(vLfWPos.xz * 0.011 + vec2(uTime * 0.55, uTime * 0.2), 3.0));
  outgoingLight *= 1.0 - 0.2 * smoothstep(0.48, 0.74, cl); }
#include <opaque_fragment>`,
    );
  });
  onMaterial(groundMat);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  // Far dark ground so the camera never sees the void
  const far = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: 0x0f1c14 }));
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.4;
  root.add(far);
  root.add(buildWater(onMaterial));
  root.add(buildFoliage(onMaterial, quality));
  return root;
}
