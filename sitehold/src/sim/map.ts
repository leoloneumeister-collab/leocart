/**
 * "Sandstone Yard": an original two site, three lane map. 96 x 76 m.
 * Built from a 2 m grid (walls, crates) plus ramps and thin wooden walls, then merged into boxes.
 */
import type { Box, Mat } from './world.ts';
import { v3, type Vec3 } from './math.ts';
import type { Team } from './constants.ts';

export const CELL = 2;
export const COLS = 48;
export const ROWS = 38;
export const MAP_W = COLS * CELL;
export const MAP_H = ROWS * CELL;
export const WALL_H = 5;

export const cellX = (c: number) => (c + 0.5) * CELL;
export const cellZ = (r: number) => (r + 0.5) * CELL;
export const cellPos = (c: number, r: number): Vec3 => v3(cellX(c), 0, cellZ(r));

export interface Deco {
  kind: 'ramp' | 'slab';
  x0: number; z0: number; x1: number; z1: number;
  h0: number; h1: number;
  /** ramp climbs along this axis towards the higher end, sign is direction of rising */
  axis: 'x' | 'z';
  rising: 1 | -1;
  mat: Mat;
}

export interface Rect { x0: number; z0: number; x1: number; z1: number }
export const rectOfCells = (c0: number, r0: number, c1: number, r1: number): Rect => ({ x0: c0 * CELL, z0: r0 * CELL, x1: (c1 + 1) * CELL, z1: (r1 + 1) * CELL });
export const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

export interface Site { id: 'A' | 'B'; rect: Rect; plant: Vec3; name: string }

export interface SpawnPoint { pos: Vec3; yaw: number }

export interface Place { name: string; rect: Rect }

/** A hold position for a defender: stand here and watch `look`. */
export interface Hold { name: string; at: [number, number]; look: [number, number]; site: 'A' | 'B' | 'M'; crouch?: boolean }

/** A route for attackers is a chain of cell waypoints. The last point is inside the site. */
export interface Route { name: string; site: 'A' | 'B'; points: Array<[number, number]>; /** index of the safe staging point where slow plays wait before committing */ stage: number; /** smoke or flash thrown while staging: target cell */ util: Array<{ kind: 'smoke' | 'flash' | 'he'; target: [number, number]; from?: [number, number] }> }

export interface MapData {
  name: string;
  boxes: Box[];
  deco: Deco[];
  grid: string[];
  sites: Site[];
  spawns: Record<Team, SpawnPoint[]>;
  places: Place[];
  holds: Hold[];
  routes: Route[];
  /** where defenders stage before a retake, per site */
  retake: Record<'A' | 'B', Array<[number, number]>>;
  /** where attackers stand after planting */
  postPlant: Record<'A' | 'B', Array<[number, number]>>;
  /** safe spots to save weapons */
  saveSpots: Record<Team, Array<[number, number]>>;
  bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
}

type Grid = string[][];

function blank(): Grid {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => '#'));
}

function carve(g: Grid, c0: number, r0: number, c1: number, r1: number, ch = '.') {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch;
}
const put = (g: Grid, c: number, r: number, ch: string) => { g[r][c] = ch; };

const CELL_SPEC: Record<string, { h: number; y0: number; mat: Mat }> = {
  '#': { h: WALL_H, y0: 0, mat: 'plaster' },
  '@': { h: 6, y0: 0, mat: 'stone' },
  '%': { h: 1.3, y0: 0, mat: 'stone' },
  c: { h: 1.2, y0: 0, mat: 'crate' },
  C: { h: 2.4, y0: 0, mat: 'crate' },
  T: { h: 1.6, y0: 3.4, mat: 'stone' },
  m: { h: 1.0, y0: 0, mat: 'metal' },
};

function gridToBoxes(g: Grid): Box[] {
  const boxes: Box[] = [];
  const used = Array.from({ length: ROWS }, () => new Array<boolean>(COLS).fill(false));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = g[r][c];
      if (used[r][c] || !CELL_SPEC[ch]) continue;
      let c1 = c;
      while (c1 + 1 < COLS && g[r][c1 + 1] === ch && !used[r][c1 + 1]) c1++;
      let r1 = r;
      outer: while (r1 + 1 < ROWS) {
        for (let k = c; k <= c1; k++) if (g[r1 + 1][k] !== ch || used[r1 + 1][k]) break outer;
        r1++;
      }
      for (let rr = r; rr <= r1; rr++) for (let cc = c; cc <= c1; cc++) used[rr][cc] = true;
      const s = CELL_SPEC[ch];
      boxes.push({ minX: c * CELL, maxX: (c1 + 1) * CELL, minZ: r * CELL, maxZ: (r1 + 1) * CELL, minY: s.y0, maxY: s.y0 + s.h, mat: s.mat, id: 0 });
    }
  }
  return boxes;
}

export function buildMap(): MapData {
  const g = blank();
  // ring wall is taller stone
  for (let c = 0; c < COLS; c++) { g[0][c] = '@'; g[ROWS - 1][c] = '@'; }
  for (let r = 0; r < ROWS; r++) { g[r][0] = '@'; g[r][COLS - 1] = '@'; }

  // ---- Sentinel side
  carve(g, 18, 1, 29, 5);       // sentinel spawn
  carve(g, 16, 6, 31, 10);      // central hall
  carve(g, 32, 6, 35, 8);       // A ramp corridor
  carve(g, 36, 1, 46, 12);      // A site
  carve(g, 12, 8, 15, 10);      // B hall corridor
  carve(g, 1, 1, 11, 12);       // B site

  // ---- Mid lane with a narrow door
  carve(g, 20, 11, 27, 29);
  carve(g, 20, 14, 22, 15, '#');
  carve(g, 25, 14, 27, 15, '#');

  // ---- Lower mid S bend: two overlapping blocks so there is no straight sightline from the door to Breacher spawn
  carve(g, 24, 22, 27, 23, '#');   // east block, forces traffic to the west side
  carve(g, 20, 26, 25, 27, '#');   // west block, forces traffic to the east side

  // ---- Short routes
  carve(g, 28, 17, 35, 19);     // A short from mid
  carve(g, 34, 13, 38, 19);     // up into A site
  carve(g, 13, 21, 19, 23);     // B alley from mid
  carve(g, 10, 13, 12, 23);     // up into B site

  // ---- Long A and east yard
  carve(g, 41, 13, 45, 28);
  carve(g, 41, 26, 41, 28, '#');
  carve(g, 45, 26, 45, 28, '#');
  carve(g, 33, 29, 46, 36);

  // ---- Breacher spawn and yards
  carve(g, 18, 30, 29, 36);
  carve(g, 30, 31, 32, 35);
  carve(g, 15, 31, 17, 35);
  carve(g, 1, 29, 14, 36);

  // ---- B tunnels, roofed in the middle
  carve(g, 3, 13, 4, 28);
  carve(g, 3, 18, 4, 26, 'T');

  // ---- Cover: A site
  put(g, 38, 3, 'C'); put(g, 39, 3, 'c'); put(g, 38, 4, 'c');
  put(g, 41, 6, 'C'); put(g, 42, 6, 'c');
  put(g, 45, 2, 'C'); put(g, 46, 2, 'c');
  put(g, 38, 9, 'c'); put(g, 37, 11, 'C');
  // ---- Cover: B site
  put(g, 3, 3, 'C'); put(g, 4, 3, 'c'); put(g, 3, 4, 'c');
  put(g, 6, 6, 'c'); put(g, 7, 6, 'C'); put(g, 7, 7, 'c');
  put(g, 9, 3, 'c'); put(g, 10, 3, 'C');
  put(g, 5, 10, 'c'); put(g, 2, 9, 'C'); put(g, 2, 10, 'c');
  // ---- Cover: hall and mid
  put(g, 21, 8, 'c'); put(g, 22, 8, 'c'); put(g, 26, 9, 'C'); put(g, 18, 9, '%'); put(g, 29, 9, '%');
  put(g, 22, 18, 'c'); put(g, 25, 18, 'C'); put(g, 22, 24, 'c'); put(g, 26, 29, 'C');
  put(g, 24, 12, '%'); put(g, 23, 12, '%'); put(g, 22, 21, 'c');
  // ---- Cover: long, yards
  put(g, 43, 18, 'c'); put(g, 44, 18, 'c'); put(g, 41, 21, 'C'); put(g, 45, 23, 'C'); put(g, 43, 25, 'c');
  put(g, 36, 32, 'c'); put(g, 40, 34, 'C'); put(g, 44, 31, 'c'); put(g, 38, 30, 'c'); put(g, 35, 35, 'C');
  put(g, 5, 32, 'c'); put(g, 9, 34, 'C'); put(g, 12, 31, 'c'); put(g, 7, 30, 'c'); put(g, 3, 35, 'C');
  put(g, 22, 33, 'c'); put(g, 25, 33, 'c'); put(g, 18, 35, 'c');
  put(g, 20, 4, 'c'); put(g, 27, 4, 'c');
  // ---- Cover: A short and B alley
  put(g, 31, 18, 'c'); put(g, 36, 15, 'c'); put(g, 16, 22, 'c'); put(g, 11, 17, 'C');

  const boxes = gridToBoxes(g);
  const deco: Deco[] = [];

  // ---- Elevated roost on A site, climbed by a ramp. Collision is a stair of thin hidden boxes.
  boxes.push({ minX: 88, maxX: 94, minZ: 18, maxZ: 26, minY: 0, maxY: 2.8, mat: 'stone', id: 0 });
  addRamp(boxes, deco, 77, 20, 88, 24, 0, 2.8, 'x', 1, 'stone');
  // low rail around the roost lip facing the site
  boxes.push({ minX: 87.7, maxX: 88.1, minZ: 24, maxZ: 26, minY: 2.8, maxY: 3.5, mat: 'metal', id: 0 });
  boxes.push({ minX: 87.7, maxX: 88.1, minZ: 18, maxZ: 20, minY: 2.8, maxY: 3.5, mat: 'metal', id: 0 });
  // B back platform and ramp
  boxes.push({ minX: 2, maxX: 8, minZ: 2, maxZ: 6, minY: 0, maxY: 1.4, mat: 'stone', id: 0 });
  // (cover cells on the platform area are replaced below)
  addRamp(boxes, deco, 8, 3, 13, 5.2, 0, 1.4, 'x', -1, 'stone');

  // ---- Thin wooden walls: they stop movement but not bullets.
  const wood = (x0: number, z0: number, x1: number, z1: number, h = 2.6) =>
    boxes.push({ minX: Math.min(x0, x1), maxX: Math.max(x1, x0) + (x0 === x1 ? 0.3 : 0), minZ: Math.min(z0, z1), maxZ: Math.max(z1, z0) + (z0 === z1 ? 0.3 : 0), minY: 0, maxY: h, mat: 'wood', id: 0 });
  wood(6, 26.4, 7.6, 26.4);                // B tunnel exit barricade
  wood(82, 26.4, 86, 26.4);                // A long exit barricade
  wood(42, 35, 47, 35, 2.2);               // mid planks, left of the door lane
  wood(50, 38, 55, 38, 2.2);

  // ---- Doorway lintel over mid door
  boxes.push({ minX: 46, maxX: 50, minZ: 28, maxZ: 32, minY: 3.4, maxY: 5, mat: 'plaster', id: 0 });

  // sentinel and breacher spawn pads
  const spawns: Record<Team, SpawnPoint[]> = { 0: [], 1: [] };
  const xs = [40, 44, 48, 52, 56];
  xs.forEach((x, i) => {
    spawns[0].push({ pos: v3(x, 0, 4 + (i % 2) * 2.4), yaw: Math.PI });
    spawns[1].push({ pos: v3(x, 0, 71 - (i % 2) * 2.4), yaw: 0 });
  });

  const sites: Site[] = [
    { id: 'A', name: 'A Site', rect: { x0: 74, z0: 3, x1: 92, z1: 25 }, plant: v3(83, 0, 13) },
    { id: 'B', name: 'B Site', rect: { x0: 3, z0: 3, x1: 21, z1: 25 }, plant: v3(13, 0, 15) },
  ];

  const R = rectOfCells;
  const places: Place[] = [
    { name: 'Roost', rect: { x0: 88, z0: 18, x1: 94, z1: 26 } },
    { name: 'Roost Ramp', rect: { x0: 77, z0: 20, x1: 88, z1: 24 } },
    { name: 'A Site', rect: sites[0].rect },
    { name: 'B Platform', rect: { x0: 2, z0: 2, x1: 8, z1: 6 } },
    { name: 'B Site', rect: sites[1].rect },
    { name: 'A Ramp', rect: R(32, 5, 35, 9) },
    { name: 'B Hall', rect: R(12, 7, 15, 11) },
    { name: 'Sentinel Spawn', rect: R(18, 1, 29, 5) },
    { name: 'Hall', rect: R(16, 6, 31, 10) },
    { name: 'Mid Doors', rect: R(20, 11, 27, 16) },
    { name: 'Mid', rect: R(20, 11, 27, 29) },
    { name: 'A Short', rect: R(28, 13, 38, 19) },
    { name: 'B Alley', rect: R(10, 13, 19, 23) },
    { name: 'Long Doors', rect: R(41, 24, 45, 29) },
    { name: 'Long A', rect: R(41, 13, 45, 28) },
    { name: 'B Tunnels', rect: R(3, 13, 4, 28) },
    { name: 'East Yard', rect: R(33, 29, 46, 36) },
    { name: 'West Yard', rect: R(1, 29, 14, 36) },
    { name: 'Breacher Spawn', rect: R(18, 30, 29, 36) },
    { name: 'Breacher Spawn', rect: R(15, 31, 32, 35) },
  ];

  const holds: Hold[] = [
    { name: 'A Site', at: [41, 8], look: [43, 20], site: 'A' },
    { name: 'A Roost', at: [45, 10], look: [43, 20], site: 'A' },
    { name: 'A Ramp', at: [34, 7], look: [41, 7], site: 'A' },
    { name: 'A Short', at: [37, 5], look: [36, 17], site: 'A', crouch: true },
    { name: 'A Back', at: [44, 3], look: [43, 11], site: 'A' },
    { name: 'B Site', at: [7, 9], look: [3, 20], site: 'B' },
    { name: 'B Window', at: [11, 11], look: [11, 21], site: 'B' },
    { name: 'B Platform', at: [4, 4], look: [4, 14], site: 'B' },
    { name: 'B Hall', at: [13, 9], look: [8, 9], site: 'B' },
    { name: 'B Back', at: [9, 2], look: [5, 10], site: 'B' },
    { name: 'Mid Doors', at: [23, 10], look: [23, 20], site: 'M' },
    { name: 'Mid Hall', at: [24, 8], look: [23, 14], site: 'M' },
    { name: 'Hall East', at: [30, 9], look: [33, 14], site: 'M' },
    { name: 'Hall West', at: [17, 8], look: [12, 14], site: 'M' },
  ];

  const routes: Route[] = [
    { name: 'Long A', site: 'A', stage: 2, points: [[26, 32], [33, 32], [38, 31], [43, 28], [43, 22], [43, 15], [41, 10]],
      util: [{ kind: 'smoke', target: [43, 13] }, { kind: 'flash', target: [43, 12] }] },
    { name: 'Short A', site: 'A', stage: 0, points: [[24, 30], [24, 22], [23, 17], [29, 18], [35, 17], [37, 14], [40, 9]],
      util: [{ kind: 'smoke', target: [38, 11] }, { kind: 'flash', target: [37, 9] }] },
    { name: 'Mid to B', site: 'B', stage: 0, points: [[24, 30], [24, 22], [20, 22], [14, 22], [11, 20], [10, 14], [8, 9]],
      util: [{ kind: 'smoke', target: [10, 11] }, { kind: 'flash', target: [9, 9] }] },
    { name: 'Tunnels B', site: 'B', stage: 2, points: [[22, 33], [16, 33], [8, 32], [4, 29], [4, 20], [3, 14], [6, 9]],
      util: [{ kind: 'smoke', target: [4, 12] }, { kind: 'flash', target: [5, 10] }] },
  ];

  const retake: MapData['retake'] = {
    A: [[33, 7], [36, 15], [32, 7]],
    B: [[14, 9], [11, 15], [15, 9]],
  };
  const postPlant: MapData['postPlant'] = {
    A: [[43, 14], [38, 12], [45, 10], [40, 4], [37, 8]],
    B: [[5, 14], [10, 12], [3, 6], [8, 4], [12, 9]],
  };
  const saveSpots: MapData['saveSpots'] = {
    0: [[23, 2], [27, 2], [19, 3]],
    1: [[19, 35], [28, 35], [20, 33]],
  };

  return {
    name: 'Sandstone Yard', boxes, deco, grid: g.map((r) => r.join('')), sites, spawns, places, holds, routes, retake, postPlant, saveSpots,
    bounds: { minX: 0, minZ: 0, maxX: MAP_W, maxZ: MAP_H },
  };
}

/** Stairs of thin hidden boxes approximating a ramp, plus a render only wedge. */
function addRamp(boxes: Box[], deco: Deco[], x0: number, z0: number, x1: number, z1: number, h0: number, h1: number, axis: 'x' | 'z', rising: 1 | -1, mat: Mat) {
  const len = axis === 'x' ? x1 - x0 : z1 - z0;
  const n = Math.max(2, Math.ceil(Math.abs(h1 - h0) / 0.12));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * len, b = ((i + 1) / n) * len;
    const h = h0 + ((i + 1) / n) * (h1 - h0);
    const lo = rising === 1 ? a : len - b;
    const hi = rising === 1 ? b : len - a;
    if (axis === 'x') boxes.push({ minX: x0 + lo, maxX: x0 + hi + 0.001, minZ: z0, maxZ: z1, minY: 0, maxY: h, mat, id: 0 });
    else boxes.push({ minX: x0, maxX: x1, minZ: z0 + lo, maxZ: z0 + hi + 0.001, minY: 0, maxY: h, mat, id: 0 });
    boxes[boxes.length - 1].hide = true;
  }
  deco.push({ kind: 'ramp', x0, z0, x1, z1, h0, h1, axis, rising, mat });
}

export function placeAt(map: MapData, x: number, z: number): string {
  for (const p of map.places) if (inRect(p.rect, x, z)) return p.name;
  return 'Open';
}

export function asciiMap(map: MapData): string {
  return map.grid.join('\n');
}
