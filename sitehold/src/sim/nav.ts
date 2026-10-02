/**
 * Layered navigation grid built straight from the collision world. Every node is a standable spot, so the
 * map author never places waypoints by hand. Paths are found with A* and then string pulled using real hull checks.
 */
import { MOVE } from './constants.ts';
import { v3, type Rng, type Vec3 } from './math.ts';
import type { World } from './world.ts';

const NAV_CELL = 1;
const NAV_R = 0.5;       // clearance used for planning, wider than the 0.4 hull
const MAX_FLOOR = 3.2;

export class NavGrid {
  cols: number;
  rows: number;
  minX: number;
  minZ: number;
  nx: number[] = [];
  nz: number[] = [];
  nh: number[] = [];
  adj: number[][] = [];
  private cellNodes: number[][];
  /** extra path cost per node, used to steer around fire */
  penalty: Float32Array;
  private g: Float32Array;
  private parent: Int32Array;
  private seen: Int32Array;
  private closed: Int32Array;
  private stamp = 0;
  private heap: number[] = [];
  private fs: Float32Array;

  private world: World;

  constructor(world: World) {
    this.world = world;
    this.minX = world.minX; this.minZ = world.minZ;
    this.cols = Math.ceil((world.maxX - world.minX) / NAV_CELL);
    this.rows = Math.ceil((world.maxZ - world.minZ) / NAV_CELL);
    this.cellNodes = Array.from({ length: this.cols * this.rows }, () => []);
    this.build();
    const n = this.nx.length;
    this.penalty = new Float32Array(n);
    this.g = new Float32Array(n);
    this.fs = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Int32Array(n);
    this.closed = new Int32Array(n);
  }

  get size() { return this.nx.length; }

  private build() {
    const w = this.world;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = this.minX + (c + 0.5) * NAV_CELL, z = this.minZ + (r + 0.5) * NAV_CELL;
        const heights: number[] = [0];
        const near = w.collect(x - NAV_R, z - NAV_R, x + NAV_R, z + NAV_R);
        for (let i = 0; i < near.length; i++) {
          const top = near[i].maxY;
          if (top > 0.01 && top <= MAX_FLOOR && !heights.some((h) => Math.abs(h - top) < 0.05)) heights.push(top);
        }
        const cell = this.cellNodes[r * this.cols + c];
        for (const h of heights) {
          // floor must exist under the centre and the standing hull must fit with margin
          const floor = w.groundHeight(x, z, 0.05, h + 0.01);
          if (Math.abs(floor - h) > 0.02) continue;
          if (!w.hullFree(x, h + MOVE.step, z, NAV_R, MOVE.heightStand - MOVE.step)) continue;
          const id = this.nx.length;
          this.nx.push(x); this.nz.push(z); this.nh.push(h);
          this.adj.push([]);
          cell.push(id);
        }
      }
    }
    // connect neighbours
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        for (const a of this.cellNodes[r * this.cols + c]) {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (!dr && !dc) continue;
              const cc = c + dc, rr = r + dr;
              if (cc < 0 || rr < 0 || cc >= this.cols || rr >= this.rows) continue;
              for (const b of this.cellNodes[rr * this.cols + cc]) {
                const dh = this.nh[b] - this.nh[a];
                if (Math.abs(dh) > MOVE.step) continue;
                if (dr && dc) {
                  // diagonal: both orthogonal neighbours must be passable at this height
                  let ok = true;
                  for (const [oc, or] of [[c + dc, r], [c, r + dr]] as const) {
                    ok = ok && this.cellNodes[or * this.cols + oc].some((o) => Math.abs(this.nh[o] - this.nh[a]) <= MOVE.step);
                  }
                  if (!ok) continue;
                }
                const mx = (this.nx[a] + this.nx[b]) / 2, mz = (this.nz[a] + this.nz[b]) / 2;
                const my = Math.max(this.nh[a], this.nh[b]) + MOVE.step;
                if (!w.hullFree(mx, my, mz, NAV_R - 0.05, MOVE.heightStand - MOVE.step)) continue;
                this.adj[a].push(b);
              }
            }
          }
        }
      }
    }
  }

  pos(i: number, out: Vec3 = v3()): Vec3 { out.x = this.nx[i]; out.y = this.nh[i]; out.z = this.nz[i]; return out; }

  /** Nearest node to a point, preferring ones whose height is close to y. */
  nearest(x: number, y: number, z: number, maxDist = 6): number {
    const c0 = Math.floor((x - this.minX) / NAV_CELL), r0 = Math.floor((z - this.minZ) / NAV_CELL);
    let best = -1, bestD = Infinity;
    const R = Math.ceil(maxDist / NAV_CELL);
    for (let rad = 0; rad <= R; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
          for (const n of this.cellNodes[r * this.cols + c]) {
            const dy = this.nh[n] - y;
            const d = Math.hypot(this.nx[n] - x, this.nz[n] - z) + Math.abs(dy) * 2 + (dy > 0.8 ? 5 : 0);
            if (d < bestD) { bestD = d; best = n; }
          }
        }
      }
      if (best >= 0 && bestD <= rad * NAV_CELL) break;
    }
    return best;
  }

  randomNode(rng: Rng): number { return rng.int(0, this.size - 1); }

  // ---------------- A*
  private push(n: number) {
    const h = this.heap, fs = this.fs;
    h.push(n);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (fs[h[p]] <= fs[h[i]]) break;
      const t = h[p]; h[p] = h[i]; h[i] = t; i = p;
    }
  }
  private pop(): number {
    const h = this.heap, fs = this.fs;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < h.length && fs[h[l]] < fs[h[m]]) m = l;
        if (r < h.length && fs[h[r]] < fs[h[m]]) m = r;
        if (m === i) break;
        const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
      }
    }
    return top;
  }

  /** Raw node path, or null when unreachable. */
  nodePath(from: number, to: number): number[] | null {
    if (from < 0 || to < 0) return null;
    if (from === to) return [from];
    const st = ++this.stamp;
    this.heap.length = 0;
    this.g[from] = 0; this.parent[from] = -1; this.seen[from] = st;
    this.fs[from] = this.hDist(from, to);
    this.push(from);
    const nx = this.nx, nz = this.nz, nh = this.nh;
    while (this.heap.length) {
      const cur = this.pop();
      if (this.closed[cur] === st) continue;
      this.closed[cur] = st;
      if (cur === to) {
        const out: number[] = [];
        for (let n = to; n !== -1; n = this.parent[n]) out.push(n);
        return out.reverse();
      }
      const adj = this.adj[cur];
      for (let k = 0; k < adj.length; k++) {
        const nb = adj[k];
        if (this.closed[nb] === st) continue;
        const cost = this.g[cur] + Math.hypot(nx[nb] - nx[cur], nz[nb] - nz[cur], (nh[nb] - nh[cur]) * 2) + this.penalty[nb];
        if (this.seen[nb] !== st || cost < this.g[nb]) {
          this.seen[nb] = st; this.g[nb] = cost; this.parent[nb] = cur;
          this.fs[nb] = cost + this.hDist(nb, to);
          this.push(nb);
        }
      }
    }
    return null;
  }

  private hDist(a: number, b: number) { return Math.hypot(this.nx[a] - this.nx[b], this.nz[a] - this.nz[b]); }

  /** Smoothed list of points to walk through, or null. */
  path(from: Vec3, to: Vec3): Vec3[] | null {
    const a = this.nearest(from.x, from.y, from.z, 4), b = this.nearest(to.x, to.y, to.z, 6);
    const raw = this.nodePath(a, b);
    if (!raw) return null;
    return this.smooth(raw);
  }

  /** Can an actor walk the straight line without hitting walls or dropping off ledges? */
  canWalk(ax: number, ay: number, az: number, bx: number, bz: number): boolean {
    const w = this.world;
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / 0.3));
    let y = ay;
    for (let i = 1; i <= n; i++) {
      const x = ax + (dx * i) / n, z = az + (dz * i) / n;
      const gh = w.groundHeight(x, z, 0.3, y + MOVE.step);
      if (y - gh > MOVE.step * 0.9) return false; // would walk off a ledge
      if (gh - y > MOVE.step) return false;
      y = gh;
      if (!w.hullFree(x, y + MOVE.step, z, NAV_R - 0.08, MOVE.heightStand - MOVE.step)) return false;
    }
    return true;
  }

  private smooth(raw: number[]): Vec3[] {
    const pts = raw.map((n) => this.pos(n));
    if (pts.length <= 2) return pts;
    const out: Vec3[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.canWalk(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  /** Flood fill from a node. Used by the map validator. */
  reachableFrom(start: number): Uint8Array {
    const seen = new Uint8Array(this.size);
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const n = stack.pop()!;
      for (const m of this.adj[n]) if (!seen[m]) { seen[m] = 1; stack.push(m); }
    }
    return seen;
  }
}
