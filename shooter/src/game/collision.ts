import * as THREE from 'three';

export type SurfaceKind = 'concrete' | 'metal' | 'wood' | 'dirt' | 'flesh';

export interface AABB {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  kind: SurfaceKind;
  owner?: unknown;
}

export interface RayHit {
  dist: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  kind: SurfaceKind;
  box?: AABB;
}

export function makeBox(cx: number, y0: number, cz: number, w: number, h: number, d: number, kind: SurfaceKind = 'concrete'): AABB {
  return { minX: cx - w / 2, maxX: cx + w / 2, minY: y0, maxY: y0 + h, minZ: cz - d / 2, maxZ: cz + d / 2, kind };
}

/** Slab ray test. Returns distance or -1. Writes normal into n if provided. */
export function rayAABB(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  b: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number },
  maxT: number, n?: THREE.Vector3,
): number {
  let tmin = 0;
  let tmax = maxT;
  let axis = -1;
  let sgn = 0;
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  const lo = [b.minX, b.minY, b.minZ];
  const hi = [b.maxX, b.maxY, b.maxZ];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1;
    } else {
      const inv = 1 / d[i];
      let t1 = (lo[i] - o[i]) * inv;
      let t2 = (hi[i] - o[i]) * inv;
      let s = -1;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; s = 1; }
      if (t1 > tmin) { tmin = t1; axis = i; sgn = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  if (n) {
    n.set(0, 0, 0);
    if (axis >= 0) (axis === 0 ? (n.x = sgn) : axis === 1 ? (n.y = sgn) : (n.z = sgn));
  }
  return tmin;
}

const _n = new THREE.Vector3();

/** Raycast against static boxes + ground plane. */
export function raycastWorld(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, boxes: AABB[], out?: RayHit): boolean {
  let best = maxDist;
  let kind: SurfaceKind = 'concrete';
  let found = false;
  let hitBox: AABB | undefined;
  const bn = new THREE.Vector3();
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b, best, _n);
    if (t >= 0 && t < best) {
      best = t; kind = b.kind; found = true; bn.copy(_n); hitBox = b;
    }
  }
  if (dir.y < -1e-6) {
    const t = -origin.y / dir.y;
    if (t >= 0 && t < best) {
      best = t; kind = 'dirt'; found = true; bn.set(0, 1, 0); hitBox = undefined;
    }
  }
  if (found && out) {
    out.dist = best;
    out.point.copy(origin).addScaledVector(dir, best);
    out.normal.copy(bn);
    out.kind = kind;
    out.box = hitBox;
  }
  return found;
}

export function lineOfSight(a: THREE.Vector3, b: THREE.Vector3, boxes: AABB[]): boolean {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  if (len < 0.01) return true;
  dir.multiplyScalar(1 / len);
  for (let i = 0; i < boxes.length; i++) {
    const t = rayAABB(a.x, a.y, a.z, dir.x, dir.y, dir.z, boxes[i], len - 0.05);
    if (t >= 0 && t < len - 0.05) return false;
  }
  return true;
}

export interface MoveResult { grounded: boolean; hitWall: boolean }

/**
 * Move a vertical box (feet position) by delta against static boxes. Handles step up, gravity landing.
 * pos is feet center.
 */
export function moveBody(
  pos: THREE.Vector3, vel: THREE.Vector3, radius: number, height: number,
  dt: number, boxes: AABB[], stepHeight = 0.5,
): MoveResult {
  let grounded = false;
  let hitWall = false;
  const eps = 1e-4;

  const overlaps = (b: AABB) =>
    pos.x + radius > b.minX + eps && pos.x - radius < b.maxX - eps &&
    pos.z + radius > b.minZ + eps && pos.z - radius < b.maxZ - eps &&
    pos.y + height > b.minY + eps && pos.y < b.maxY - eps;

  const anyOverlap = () => {
    for (let i = 0; i < boxes.length; i++) if (overlaps(boxes[i])) return true;
    return false;
  };

  // horizontal axes
  for (let axis = 0; axis < 2; axis++) {
    const delta = (axis === 0 ? vel.x : vel.z) * dt;
    if (delta === 0) continue;
    if (axis === 0) pos.x += delta; else pos.z += delta;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!overlaps(b)) continue;
      // try step-up
      if (b.maxY - pos.y <= stepHeight && b.maxY - pos.y > 0) {
        const oldY = pos.y;
        pos.y = b.maxY + 0.001;
        if (!anyOverlap()) continue;
        pos.y = oldY;
      }
      hitWall = true;
      if (axis === 0) {
        if (delta > 0) pos.x = b.minX - radius; else pos.x = b.maxX + radius;
        vel.x = 0;
      } else {
        if (delta > 0) pos.z = b.minZ - radius; else pos.z = b.maxZ + radius;
        vel.z = 0;
      }
    }
  }

  // vertical
  pos.y += vel.y * dt;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!overlaps(b)) continue;
    if (vel.y <= 0) {
      pos.y = b.maxY;
      grounded = true;
    } else {
      pos.y = b.minY - height - 0.001;
    }
    vel.y = 0;
  }
  if (pos.y <= 0) {
    pos.y = 0;
    if (vel.y < 0) vel.y = 0;
    grounded = true;
  } else if (!grounded && vel.y <= 0) {
    // standing exactly on a box top
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (
        pos.x + radius > b.minX && pos.x - radius < b.maxX &&
        pos.z + radius > b.minZ && pos.z - radius < b.maxZ &&
        Math.abs(pos.y - b.maxY) < 0.02
      ) { grounded = true; break; }
    }
  }
  return { grounded, hitWall };
}

/** Horizontal-only circle move for ground enemies. */
export function moveFlat(pos: THREE.Vector3, radius: number, dx: number, dz: number, boxes: AABB[]) {
  const lo = 0.4, hi = 1.7;
  const test = () => {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.maxY < lo || b.minY > hi) continue;
      if (pos.x + radius > b.minX && pos.x - radius < b.maxX && pos.z + radius > b.minZ && pos.z - radius < b.maxZ) return b;
    }
    return null;
  };
  pos.x += dx;
  let b = test();
  if (b) pos.x = dx > 0 ? b.minX - radius - 0.001 : b.maxX + radius + 0.001;
  pos.z += dz;
  b = test();
  if (b) pos.z = dz > 0 ? b.minZ - radius - 0.001 : b.maxZ + radius + 0.001;
}
