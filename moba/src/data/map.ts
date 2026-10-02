/**
 * Map layout. Coordinates: x grows east (right on screen), z grows south (down on screen).
 * Blue base sits bottom-left, red base top-right. The map is point symmetric: rotating a
 * blue structure 180 degrees around the origin gives its red counterpart (top lane maps to
 * bot lane in that rotation, which is why the lane lists look mirrored).
 */
import type { Lane } from '../sim/types.ts';

export interface Pt {
  x: number;
  z: number;
}

export const MAP_HALF = 110;
export const LANES: readonly Lane[] = ['top', 'mid', 'bot'];
export const LANE_WIDTH = 18;

const rot = (p: Pt): Pt => ({ x: -p.x, z: -p.z });

/** Lane waypoint lists in blue to red direction. */
export const LANE_POINTS: Record<Lane, Pt[]> = {
  top: [
    { x: -92, z: 80 },
    { x: -93, z: 64 },
    { x: -93, z: -68 },
    { x: -86, z: -86 },
    { x: -68, z: -93 },
    { x: 64, z: -93 },
    { x: 80, z: -92 },
  ],
  mid: [
    { x: -80, z: 80 },
    { x: -50, z: 50 },
    { x: 0, z: 0 },
    { x: 50, z: -50 },
    { x: 80, z: -80 },
  ],
  bot: [
    { x: -80, z: 92 },
    { x: -64, z: 93 },
    { x: 68, z: 93 },
    { x: 86, z: 86 },
    { x: 93, z: 68 },
    { x: 93, z: -64 },
    { x: 92, z: -80 },
  ],
};

export function laneLength(lane: Lane): number {
  const pts = LANE_POINTS[lane];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return len;
}

/** Point at path distance d from the start (blue end) of a lane. */
export function pointOnLane(lane: Lane, d: number): Pt {
  const pts = LANE_POINTS[lane];
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (left <= seg) {
      const t = seg > 0 ? left / seg : 0;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t };
    }
    left -= seg;
  }
  return { ...pts[pts.length - 1] };
}

const cumCache: Partial<Record<Lane, number[]>> = {};

function cumulative(lane: Lane): number[] {
  let c = cumCache[lane];
  if (!c) {
    const pts = LANE_POINTS[lane];
    c = [0];
    for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    cumCache[lane] = c;
  }
  return c;
}

/** Project a point onto a lane. `s` is path distance from the blue end, `d` the distance off the lane center. */
export function projectOnLane(lane: Lane, x: number, z: number): { s: number; d: number } {
  const pts = LANE_POINTS[lane];
  const cum = cumulative(lane);
  let bestS = 0;
  let bestD = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x;
    const az = pts[i - 1].z;
    const bx = pts[i].x;
    const bz = pts[i].z;
    const abx = bx - ax;
    const abz = bz - az;
    const len2 = abx * abx + abz * abz;
    let t = len2 > 0 ? ((x - ax) * abx + (z - az) * abz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (ax + abx * t), z - (az + abz * t));
    if (d < bestD) {
      bestD = d;
      bestS = cum[i - 1] + Math.sqrt(len2) * t;
    }
  }
  return { s: bestS, d: bestD };
}

/** Distance along each lane from a team's own end where its structures stand. */
export const LANE_STRUCTURE_DIST: Record<Lane, { inhib: number; t3: number; t2: number; t1: number }> = {
  top: { inhib: 18, t3: 40, t2: 82, t1: 128 },
  mid: { inhib: 30, t3: 48, t2: 68, t1: 90 },
  bot: { inhib: 18, t3: 40, t2: 82, t1: 128 },
};

export const NEXUS_POS: [Pt, Pt] = [
  { x: -92, z: 92 },
  { x: 92, z: -92 },
];

/** Two towers guarding the nexus, per team. */
export const NEXUS_TOWER_POS: [Pt[], Pt[]] = [
  [
    { x: -76, z: 90 },
    { x: -90, z: 76 },
  ],
  [rot({ x: -76, z: 90 }), rot({ x: -90, z: 76 })],
];

/** Where champions appear after death and where recall lands. */
export const SPAWN_POS: [Pt, Pt] = [
  { x: -97, z: 97 },
  { x: 97, z: -97 },
];

/** Position of a team's structure for a lane, from path distance measured from that team's end. */
export function structurePoint(team: 0 | 1, lane: Lane, distFromOwnEnd: number): Pt {
  const total = laneLength(lane);
  const d = team === 0 ? distFromOwnEnd : total - distFromOwnEnd;
  return pointOnLane(lane, d);
}

/** Static round obstacles (rocks, trees, camp walls). Structures are added by the world. */
export interface Obstacle {
  x: number;
  z: number;
  r: number;
  /** Visual kind. */
  kind: 'rock' | 'tree' | 'wall';
}

function ring(cx: number, cz: number, r: number, n: number, rr: number, kind: Obstacle['kind'], skip: number[] = []): Obstacle[] {
  const out: Obstacle[] = [];
  for (let i = 0; i < n; i++) {
    if (skip.includes(i)) continue;
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, r: rr, kind });
  }
  return out;
}

function line(ax: number, az: number, bx: number, bz: number, rr: number, spacing: number, kind: Obstacle['kind']): Obstacle[] {
  const out: Obstacle[] = [];
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.round(len / spacing));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, r: rr, kind });
  }
  return out;
}

function mirrorObstacle(o: Obstacle): Obstacle {
  return { x: -o.x, z: -o.z, r: o.r, kind: o.kind };
}

/** Obstacles for the blue half of the jungle. The red half is the 180 degree rotation. */
const BLUE_HALF_OBSTACLES: Obstacle[] = [
  // Walls that separate the top-lane jungle from the mid lane (blue side), with gaps
  ...line(-70, 30, -52, 12, 2.4, 3, 'wall'),
  ...line(-70, -2, -52, -20, 2.4, 3, 'wall'),
  // Walls between bot lane jungle and mid lane
  ...line(-30, 70, -12, 52, 2.4, 3, 'wall'),
  ...line(2, 70, 20, 52, 2.4, 3, 'wall'),
  // Camp enclosures (rock rings with an opening)
  ...ring(-70, 12, 8, 12, 1.8, 'rock', [3, 4]),
  ...ring(-42, 66, 8, 12, 1.8, 'rock', [9, 10]),
  ...ring(-70, 40, 6, 9, 1.6, 'rock', [0, 1]),
  ...ring(-24, 82, 6, 9, 1.6, 'rock', [4, 5]),
  // Scattered rocks near the river
  { x: -30, z: 30, r: 3, kind: 'rock' },
  { x: -20, z: 40, r: 2.4, kind: 'rock' },
  { x: -44, z: 22, r: 2.4, kind: 'rock' },
  { x: -10, z: 22, r: 2.6, kind: 'rock' },
  { x: -22, z: 14, r: 2.2, kind: 'rock' },
];

export const OBSTACLES: Obstacle[] = [...BLUE_HALF_OBSTACLES, ...BLUE_HALF_OBSTACLES.map(mirrorObstacle)];

/** Jungle camp spots (blue half; red half is rotated). */
export interface CampSpot {
  x: number;
  z: number;
  kind: 'brutes' | 'thorns' | 'golem';
}

const BLUE_CAMPS: CampSpot[] = [
  { x: -70, z: 12, kind: 'golem' },
  { x: -42, z: 66, kind: 'golem' },
  { x: -70, z: 40, kind: 'brutes' },
  { x: -24, z: 82, kind: 'brutes' },
  { x: -46, z: 46, kind: 'thorns' },
  { x: -26, z: 50, kind: 'thorns' },
];

export const CAMP_SPOTS: CampSpot[] = [...BLUE_CAMPS, ...BLUE_CAMPS.map((c) => ({ ...c, x: -c.x, z: -c.z }))];
