/** Grid navigation: obstacle collision, line of sight and A* pathfinding on a coarse grid. */
import { MAP_HALF } from '../data/map.ts';
import type { Obstacle } from '../data/map.ts';

export interface Pt {
  x: number;
  z: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
  active: boolean;
}

const CELL = 2;
const N = Math.ceil((MAP_HALF * 2) / CELL);
const BUCKET = 10;
const NB = Math.ceil((MAP_HALF * 2) / BUCKET) + 1;
const CLEARANCE = 1.7;
export const BOUND = MAP_HALF - 1.5;

class MinHeap {
  keys: number[] = [];
  vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

export class NavGrid {
  readonly circles: Circle[] = [];
  private blocked = new Uint8Array(N * N);
  private buckets: Circle[][] = [];
  private gScore = new Float32Array(N * N);
  private came = new Int32Array(N * N);
  private closed = new Uint8Array(N * N);
  private openMark = new Uint32Array(N * N);
  private stamp = 1;
  private dirty = true;

  constructor(obstacles: Obstacle[]) {
    for (const o of obstacles) this.circles.push({ x: o.x, z: o.z, r: o.r, active: true });
    this.rebuild();
  }

  addCircle(x: number, z: number, r: number): Circle {
    const c: Circle = { x, z, r, active: true };
    this.circles.push(c);
    this.dirty = true;
    return c;
  }

  setActive(c: Circle, active: boolean) {
    if (c.active !== active) {
      c.active = active;
      this.dirty = true;
    }
  }

  /** Rebuild buckets and the blocked grid after obstacles changed. */
  rebuild() {
    this.dirty = false;
    this.buckets = [];
    for (let i = 0; i < NB * NB; i++) this.buckets.push([]);
    this.blocked.fill(0);
    for (const c of this.circles) {
      const x0 = Math.floor((c.x - c.r - 4 + MAP_HALF) / BUCKET);
      const x1 = Math.floor((c.x + c.r + 4 + MAP_HALF) / BUCKET);
      const z0 = Math.floor((c.z - c.r - 4 + MAP_HALF) / BUCKET);
      const z1 = Math.floor((c.z + c.r + 4 + MAP_HALF) / BUCKET);
      for (let bz = Math.max(0, z0); bz <= Math.min(NB - 1, z1); bz++)
        for (let bx = Math.max(0, x0); bx <= Math.min(NB - 1, x1); bx++) this.buckets[bz * NB + bx].push(c);
      if (!c.active) continue;
      const rr = c.r + CLEARANCE;
      const cx0 = Math.max(0, Math.floor((c.x - rr + MAP_HALF) / CELL));
      const cx1 = Math.min(N - 1, Math.floor((c.x + rr + MAP_HALF) / CELL));
      const cz0 = Math.max(0, Math.floor((c.z - rr + MAP_HALF) / CELL));
      const cz1 = Math.min(N - 1, Math.floor((c.z + rr + MAP_HALF) / CELL));
      for (let cz = cz0; cz <= cz1; cz++)
        for (let cx = cx0; cx <= cx1; cx++) {
          const wx = cx * CELL - MAP_HALF + CELL / 2;
          const wz = cz * CELL - MAP_HALF + CELL / 2;
          if (Math.hypot(wx - c.x, wz - c.z) < rr) this.blocked[cz * N + cx] = 1;
        }
    }
    // Map border
    const border = Math.ceil(CLEARANCE / CELL) - 1;
    for (let i = 0; i < N; i++)
      for (let b = 0; b <= border; b++) {
        this.blocked[b * N + i] = 1;
        this.blocked[(N - 1 - b) * N + i] = 1;
        this.blocked[i * N + b] = 1;
        this.blocked[i * N + (N - 1 - b)] = 1;
      }
  }

  private ensure() {
    if (this.dirty) this.rebuild();
  }

  private cellOf(x: number, z: number): number {
    const cx = Math.min(N - 1, Math.max(0, Math.floor((x + MAP_HALF) / CELL)));
    const cz = Math.min(N - 1, Math.max(0, Math.floor((z + MAP_HALF) / CELL)));
    return cz * N + cx;
  }

  isBlocked(x: number, z: number): boolean {
    this.ensure();
    return this.blocked[this.cellOf(x, z)] === 1;
  }

  /** Is the straight segment free of obstacles for a unit with grid clearance? */
  los(ax: number, az: number, bx: number, bz: number): boolean {
    this.ensure();
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / (CELL * 0.6)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.blocked[this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t)] === 1) return false;
    }
    return true;
  }

  /** Furthest free point along the segment from a toward b. */
  clipSegment(ax: number, az: number, bx: number, bz: number): Pt {
    this.ensure();
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / 0.5));
    let lx = ax;
    let lz = az;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (this.blocked[this.cellOf(x, z)] === 1 || Math.abs(x) > BOUND || Math.abs(z) > BOUND) break;
      lx = x;
      lz = z;
    }
    return { x: lx, z: lz };
  }

  nearestFree(x: number, z: number): Pt {
    this.ensure();
    if (!this.blocked[this.cellOf(x, z)]) return { x, z };
    const cx0 = Math.min(N - 1, Math.max(0, Math.floor((x + MAP_HALF) / CELL)));
    const cz0 = Math.min(N - 1, Math.max(0, Math.floor((z + MAP_HALF) / CELL)));
    for (let r = 1; r < 30; r++) {
      let best: Pt | null = null;
      let bd = Infinity;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const cx = cx0 + dx;
          const cz = cz0 + dz;
          if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
          if (this.blocked[cz * N + cx]) continue;
          const wx = cx * CELL - MAP_HALF + CELL / 2;
          const wz = cz * CELL - MAP_HALF + CELL / 2;
          const d = Math.hypot(wx - x, wz - z);
          if (d < bd) {
            bd = d;
            best = { x: wx, z: wz };
          }
        }
      if (best) return best;
    }
    return { x, z };
  }

  /** Path from a to b as a list of waypoints (not including a). Straight line when possible. */
  findPath(ax: number, az: number, bx: number, bz: number): Pt[] {
    this.ensure();
    const goal = this.nearestFree(bx, bz);
    if (this.los(ax, az, goal.x, goal.z)) return [goal];
    const start = this.nearestFree(ax, az);
    const sIdx = this.cellOf(start.x, start.z);
    const gIdx = this.cellOf(goal.x, goal.z);
    if (sIdx === gIdx) return [goal];

    this.stamp++;
    const stamp = this.stamp;
    const heap = new MinHeap();
    this.gScore[sIdx] = 0;
    this.came[sIdx] = -1;
    this.openMark[sIdx] = stamp;
    this.closed[sIdx] = 0;
    heap.push(0, sIdx);
    const gx = gIdx % N;
    const gz = (gIdx / N) | 0;
    let found = false;
    let expansions = 0;
    const SQ = Math.SQRT2;
    while (heap.size > 0 && expansions < 9000) {
      const cur = heap.pop();
      if (this.openMark[cur] === stamp && this.closed[cur] === 2) continue;
      this.closed[cur] = 2;
      expansions++;
      if (cur === gIdx) {
        found = true;
        break;
      }
      const cx = cur % N;
      const cz = (cur / N) | 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
          const ni = nz * N + nx;
          if (this.blocked[ni]) continue;
          if (dx !== 0 && dz !== 0 && (this.blocked[cz * N + nx] || this.blocked[nz * N + cx])) continue;
          const g = this.gScore[cur] + (dx !== 0 && dz !== 0 ? SQ : 1);
          if (this.openMark[ni] === stamp) {
            if (this.closed[ni] === 2 || g >= this.gScore[ni]) continue;
          }
          this.openMark[ni] = stamp;
          this.closed[ni] = 1;
          this.gScore[ni] = g;
          this.came[ni] = cur;
          const hx = Math.abs(nx - gx);
          const hz = Math.abs(nz - gz);
          const h = Math.max(hx, hz) + (SQ - 1) * Math.min(hx, hz);
          heap.push(g + h * 1.05, ni);
        }
    }
    if (!found) return [goal];
    const cells: Pt[] = [];
    for (let c = gIdx; c !== -1 && c !== sIdx; c = this.came[c]) {
      cells.push({ x: (c % N) * CELL - MAP_HALF + CELL / 2, z: ((c / N) | 0) * CELL - MAP_HALF + CELL / 2 });
    }
    cells.reverse();
    // String pulling
    const out: Pt[] = [];
    let anchor: Pt = { x: ax, z: az };
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.los(anchor.x, anchor.z, cells[j].x, cells[j].z)) j--;
      out.push(cells[j]);
      anchor = cells[j];
      i = j + 1;
    }
    out[out.length - 1] = goal;
    return out;
  }

  /** Push a circle out of obstacles and clamp it inside the map. Returns the corrected position. */
  resolve(x: number, z: number, r: number, outPt: Pt): Pt {
    this.ensure();
    const bx = Math.floor((x + MAP_HALF) / BUCKET);
    const bz = Math.floor((z + MAP_HALF) / BUCKET);
    if (bx >= 0 && bz >= 0 && bx < NB && bz < NB) {
      const list = this.buckets[bz * NB + bx];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.active) continue;
        const dx = x - c.x;
        const dz = z - c.z;
        const min = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2);
          if (d < 0.0001) {
            x += min;
          } else {
            const push = (min - d) / d;
            x += dx * push;
            z += dz * push;
          }
        }
      }
    }
    const lim = MAP_HALF - r - 0.2;
    x = x < -lim ? -lim : x > lim ? lim : x;
    z = z < -lim ? -lim : z > lim ? lim : z;
    outPt.x = x;
    outPt.z = z;
    return outPt;
  }
}
