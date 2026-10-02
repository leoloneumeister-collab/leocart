import * as THREE from 'three';
import type { AABB } from './collision';

/** Simple 2D grid nav with A* and string pulling. */
export class NavGrid {
  cell = 1;
  w: number;
  h: number;
  blocked: Uint8Array;
  constructor(public minX: number, public minZ: number, public maxX: number, public maxZ: number, boxes: AABB[], inflate = 0.5) {
    this.w = Math.ceil((maxX - minX) / this.cell);
    this.h = Math.ceil((maxZ - minZ) / this.cell);
    this.blocked = new Uint8Array(this.w * this.h);
    for (const b of boxes) {
      if (b.maxY < 0.45 || b.minY > 1.6) continue;
      const x0 = Math.floor((b.minX - inflate - minX) / this.cell);
      const x1 = Math.floor((b.maxX + inflate - minX) / this.cell);
      const z0 = Math.floor((b.minZ - inflate - minZ) / this.cell);
      const z1 = Math.floor((b.maxZ + inflate - minZ) / this.cell);
      for (let z = Math.max(0, z0); z <= Math.min(this.h - 1, z1); z++)
        for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.blocked[z * this.w + x] = 1;
    }
  }

  toCell(v: THREE.Vector3): [number, number] {
    return [
      Math.min(this.w - 1, Math.max(0, Math.floor((v.x - this.minX) / this.cell))),
      Math.min(this.h - 1, Math.max(0, Math.floor((v.z - this.minZ) / this.cell))),
    ];
  }
  center(cx: number, cz: number, out = new THREE.Vector3()) {
    return out.set(this.minX + (cx + 0.5) * this.cell, 0, this.minZ + (cz + 0.5) * this.cell);
  }
  isBlockedAt(x: number, z: number) {
    const cx = Math.floor((x - this.minX) / this.cell);
    const cz = Math.floor((z - this.minZ) / this.cell);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return true;
    return this.blocked[cz * this.w + cx] === 1;
  }

  private nearestOpen(cx: number, cz: number): [number, number] {
    if (!this.blocked[cz * this.w + cx]) return [cx, cz];
    for (let r = 1; r < 6; r++) {
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= this.w || z >= this.h) continue;
          if (!this.blocked[z * this.w + x]) return [x, z];
        }
    }
    return [cx, cz];
  }

  lineClear(ax: number, az: number, bx: number, bz: number) {
    const dx = bx - ax, dz = bz - az;
    const steps = Math.ceil(Math.hypot(dx, dz) / (this.cell * 0.5));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isBlockedAt(ax + dx * t, az + dz * t)) return false;
    }
    return true;
  }

  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const [sx0, sz0] = this.toCell(from);
    const [gx0, gz0] = this.toCell(to);
    const [sx, sz] = this.nearestOpen(sx0, sz0);
    const [gx, gz] = this.nearestOpen(gx0, gz0);
    const W = this.w;
    const start = sz * W + sx, goal = gz * W + gx;
    if (start === goal) return [to.clone()];
    const g = new Float32Array(this.w * this.h).fill(Infinity);
    const parent = new Int32Array(this.w * this.h).fill(-1);
    const closed = new Uint8Array(this.w * this.h);
    // binary heap of [f, idx]
    const heap: number[] = [];
    const fs = new Float32Array(this.w * this.h);
    const push = (i: number) => {
      heap.push(i);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (fs[heap[p]] <= fs[heap[c]]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < heap.length && fs[heap[l]] < fs[heap[m]]) m = l;
          if (r < heap.length && fs[heap[r]] < fs[heap[m]]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    g[start] = 0;
    fs[start] = Math.hypot(gx - sx, gz - sz);
    push(start);
    let iter = 0;
    let found = false;
    while (heap.length && iter++ < 5000) {
      const cur = pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.h) continue;
          const ni = nz * W + nx;
          if (this.blocked[ni] || closed[ni]) continue;
          if (dx && dz && (this.blocked[cz * W + nx] || this.blocked[nz * W + cx])) continue;
          const ng = g[cur] + (dx && dz ? 1.414 : 1);
          if (ng < g[ni]) {
            g[ni] = ng;
            parent[ni] = cur;
            fs[ni] = ng + Math.hypot(gx - nx, gz - nz);
            push(ni);
          }
        }
      }
    }
    if (!found) return [to.clone()];
    const cells: number[] = [];
    for (let c = goal; c !== -1; c = parent[c]) cells.push(c);
    cells.reverse();
    const pts = cells.map((c) => this.center(c % W, (c / W) | 0));
    // string pulling
    const out: THREE.Vector3[] = [];
    let anchor = 0;
    while (anchor < pts.length - 1) {
      let far = anchor + 1;
      for (let i = pts.length - 1; i > anchor; i--) {
        if (this.lineClear(pts[anchor].x, pts[anchor].z, pts[i].x, pts[i].z)) { far = i; break; }
      }
      out.push(pts[far]);
      anchor = far;
    }
    if (out.length) out[out.length - 1] = new THREE.Vector3(to.x, 0, to.z);
    return out;
  }

  randomOpenNear(p: THREE.Vector3, radius: number, tries = 12): THREE.Vector3 {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!this.isBlockedAt(x, z)) return new THREE.Vector3(x, 0, z);
    }
    return p.clone();
  }
}
