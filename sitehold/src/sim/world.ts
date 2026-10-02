/** Static collision world: axis aligned boxes on a flat ground plane, with a uniform grid for fast queries. */

export type Mat = 'stone' | 'plaster' | 'wood' | 'crate' | 'metal' | 'tile' | 'sand';
export type Surface = 'stone' | 'wood' | 'metal' | 'sand';

export interface Box {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  mat: Mat;
  id: number;
  /** Collision only, the renderer draws something else here (ramp stairs). */
  hide?: boolean;
}

export const surfaceOf = (m: Mat): Surface => (m === 'wood' || m === 'crate' ? 'wood' : m === 'metal' ? 'metal' : m === 'sand' ? 'sand' : 'stone');
/** Wood and crates can be shot through, everything else stops bullets. */
export const penetrable = (m: Mat) => m === 'wood' || m === 'crate';

export interface RayHit {
  t: number;
  /** Distance where the ray leaves the same box, so thickness is exit - t. */
  exit: number;
  nx: number; ny: number; nz: number;
  box: Box | null;
  ground: boolean;
}

export const newHit = (): RayHit => ({ t: 0, exit: 0, nx: 0, ny: 1, nz: 0, box: null, ground: false });

const CELL = 4;

export class World {
  boxes: Box[];
  minX: number; minZ: number; maxX: number; maxZ: number;
  private cols: number;
  private rows: number;
  private cells: number[][];
  private stamp: Int32Array;
  private stampId = 1;
  private cand: Box[] = [];
  private cand2: Box[] = [];

  constructor(boxes: Box[], bounds: { minX: number; minZ: number; maxX: number; maxZ: number }) {
    this.boxes = boxes;
    this.minX = bounds.minX; this.minZ = bounds.minZ; this.maxX = bounds.maxX; this.maxZ = bounds.maxZ;
    this.cols = Math.ceil((this.maxX - this.minX) / CELL) + 1;
    this.rows = Math.ceil((this.maxZ - this.minZ) / CELL) + 1;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.stamp = new Int32Array(boxes.length);
    boxes.forEach((b, i) => {
      b.id = i;
      const c0 = this.cx(b.minX), c1 = this.cx(b.maxX), r0 = this.cz(b.minZ), r1 = this.cz(b.maxZ);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.cols + c].push(i);
    });
  }

  private cx(x: number) { return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / CELL))); }
  private cz(z: number) { return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / CELL))); }

  /** Boxes whose footprint overlaps the rectangle. Result is valid until the next call. */
  collect(minX: number, minZ: number, maxX: number, maxZ: number): Box[] {
    return this.scan(minX, minZ, maxX, maxZ, this.cand);
  }

  private scan(minX: number, minZ: number, maxX: number, maxZ: number, out: Box[]): Box[] {
    out.length = 0;
    const id = ++this.stampId;
    const c0 = this.cx(minX), c1 = this.cx(maxX), r0 = this.cz(minZ), r1 = this.cz(maxZ);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const cell = this.cells[r * this.cols + c];
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k];
          if (this.stamp[i] === id) continue;
          this.stamp[i] = id;
          const b = this.boxes[i];
          if (b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ) out.push(b);
        }
      }
    }
    return out;
  }

  /** True when a hull (feet position, radius, height) overlaps nothing. */
  hullFree(x: number, y: number, z: number, r: number, h: number, eps = 1e-3): boolean {
    if (y < -eps) return false;
    const list = this.scan(x - r, z - r, x + r, z + r, this.cand2);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (y + h > b.minY + eps && y < b.maxY - eps && x + r > b.minX + eps && x - r < b.maxX - eps && z + r > b.minZ + eps && z - r < b.maxZ - eps) return false;
    }
    return true;
  }

  /** Highest surface under a footprint that is at or below maxY. Ground plane is 0. */
  groundHeight(x: number, z: number, r: number, maxY: number): number {
    let best = 0;
    const list = this.scan(x - r, z - r, x + r, z + r, this.cand2);
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.maxY <= maxY + 1e-4 && b.maxY > best && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) best = b.maxY;
    }
    return best;
  }

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out?: RayHit): boolean {
    let bestT = maxT;
    let bestBox: Box | null = null;
    let bestExit = 0, bnx = 0, bny = 0, bnz = 0;
    let ground = false;

    if (dy < -1e-9 && oy > 0) {
      const tg = -oy / dy;
      if (tg >= 0 && tg < bestT) { bestT = tg; ground = true; bny = 1; bestExit = tg; }
    }

    const id = ++this.stampId;
    // 2D DDA through the grid
    let cxi = Math.floor((ox - this.minX) / CELL), czi = Math.floor((oz - this.minZ) / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const invX = Math.abs(dx) < 1e-12 ? Infinity : CELL / Math.abs(dx);
    const invZ = Math.abs(dz) < 1e-12 ? Infinity : CELL / Math.abs(dz);
    const nextX = this.minX + (dx > 0 ? cxi + 1 : cxi) * CELL;
    const nextZ = this.minZ + (dz > 0 ? czi + 1 : czi) * CELL;
    let tMaxX = Math.abs(dx) < 1e-12 ? Infinity : (nextX - ox) / dx;
    let tMaxZ = Math.abs(dz) < 1e-12 ? Infinity : (nextZ - oz) / dz;
    let guard = 0;
    while (guard++ < 200) {
      if (cxi >= 0 && cxi < this.cols && czi >= 0 && czi < this.rows) {
        const cell = this.cells[czi * this.cols + cxi];
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k];
          if (this.stamp[i] === id) continue;
          this.stamp[i] = id;
          const b = this.boxes[i];
          // slab test
          let t0 = 0, t1 = bestT, ax = -1, sg = 0, hit = true;
          // x
          if (Math.abs(dx) < 1e-12) { if (ox < b.minX || ox > b.maxX) hit = false; } else {
            const inv = 1 / dx; let a = (b.minX - ox) * inv, c = (b.maxX - ox) * inv, s = -1;
            if (a > c) { const tmp = a; a = c; c = tmp; s = 1; }
            if (a > t0) { t0 = a; ax = 0; sg = s; }
            if (c < t1) t1 = c;
            if (t0 > t1) hit = false;
          }
          if (hit) {
            if (Math.abs(dy) < 1e-12) { if (oy < b.minY || oy > b.maxY) hit = false; } else {
              const inv = 1 / dy; let a = (b.minY - oy) * inv, c = (b.maxY - oy) * inv, s = -1;
              if (a > c) { const tmp = a; a = c; c = tmp; s = 1; }
              if (a > t0) { t0 = a; ax = 1; sg = s; }
              if (c < t1) t1 = c;
              if (t0 > t1) hit = false;
            }
          }
          if (hit) {
            if (Math.abs(dz) < 1e-12) { if (oz < b.minZ || oz > b.maxZ) hit = false; } else {
              const inv = 1 / dz; let a = (b.minZ - oz) * inv, c = (b.maxZ - oz) * inv, s = -1;
              if (a > c) { const tmp = a; a = c; c = tmp; s = 1; }
              if (a > t0) { t0 = a; ax = 2; sg = s; }
              if (c < t1) t1 = c;
              if (t0 > t1) hit = false;
            }
          }
          if (hit && t0 < bestT) {
            bestT = t0; bestBox = b; ground = false; bestExit = t1;
            bnx = ax === 0 ? sg : 0; bny = ax === 1 ? sg : 0; bnz = ax === 2 ? sg : 0;
          }
        }
      }
      const tNext = Math.min(tMaxX, tMaxZ);
      if (tNext > bestT) break;
      if (tMaxX < tMaxZ) { cxi += stepX; tMaxX += invX; } else { czi += stepZ; tMaxZ += invZ; }
      if (cxi < -1 || cxi > this.cols || czi < -1 || czi > this.rows) break;
    }
    if (bestBox === null && !ground) return false;
    if (out) {
      out.t = bestT; out.exit = bestExit; out.nx = bnx; out.ny = bny; out.nz = bnz; out.box = bestBox; out.ground = ground;
    }
    return true;
  }

  /** True if nothing solid lies between the points. */
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    const inv = 1 / len;
    return !this.raycast(ax, ay, az, dx * inv, dy * inv, dz * inv, len - 0.03);
  }
}
