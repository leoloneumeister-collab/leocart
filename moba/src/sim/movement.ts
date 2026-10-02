/** Movement helpers: path following, collision resolution and unit separation. */
import { facingTo } from './math.ts';
import type { Pt } from './nav.ts';
import type { Unit } from './types.ts';
import type { World } from './world.ts';

const tmp: Pt = { x: 0, z: 0 };

export function setPath(w: World, u: Unit, x: number, z: number) {
  u.path = w.nav.findPath(u.x, u.z, x, z);
  u.pathAge = 0;
}

/** Collision resolve a unit against static obstacles and map bounds. */
export function resolveUnit(w: World, u: Unit) {
  w.nav.resolve(u.x, u.z, u.radius * 0.85, tmp);
  u.x = tmp.x;
  u.z = tmp.z;
}

/**
 * Advance along `u.path` (or straight toward goal if the path is empty).
 * Returns true when the unit has reached the last waypoint (within stopDist).
 */
export function followPath(w: World, u: Unit, dt: number, goalX: number, goalZ: number, stopDist = 0.25): boolean {
  u.moved = 0;
  if (w.hasStatus(u, 'root')) return false;
  let budget = u.s.ms * dt;
  let moved = 0;
  let arrived = false;
  for (let guard = 0; guard < 5 && budget > 0.0001; guard++) {
    const hasPath = u.path.length > 0;
    const wx = hasPath ? u.path[0].x : goalX;
    const wz = hasPath ? u.path[0].z : goalZ;
    const last = !hasPath || u.path.length === 1;
    const dx = wx - u.x;
    const dz = wz - u.z;
    const d = Math.hypot(dx, dz);
    const stop = last ? stopDist : 0.05;
    if (d <= stop) {
      if (hasPath) u.path.shift();
      if (last) {
        arrived = true;
        break;
      }
      continue;
    }
    const need = d - (last ? stopDist * 0.5 : 0);
    const step = Math.min(budget, need);
    u.x += (dx / d) * step;
    u.z += (dz / d) * step;
    u.facing = facingTo(0, 0, dx, dz);
    budget -= step;
    moved += step;
    if (step >= need) {
      if (hasPath) u.path.shift();
      if (last) {
        arrived = true;
        break;
      }
    }
  }
  u.moved = moved;
  resolveUnit(w, u);
  return arrived;
}

/** Push overlapping ground units apart. Heavier units yield less. */
export function separateUnits(w: World) {
  const units = w.units;
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!a.alive || a.dash || a.kind === 'tower' || a.kind === 'inhibitor' || a.kind === 'nexus') continue;
    const wa = weight(a);
    w.query(a.x, a.z, a.radius + 2.2, (b) => {
      if (b.id <= a.id || b.dash) return;
      if (b.kind === 'tower' || b.kind === 'inhibitor' || b.kind === 'nexus') return;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const min = (a.radius + b.radius) * 0.82;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) return;
      const d = Math.sqrt(d2) || 0.001;
      const overlap = (min - d) * 0.5;
      const nx = d < 0.001 ? 1 : dx / d;
      const nz = d < 0.001 ? 0 : dz / d;
      const wb = weight(b);
      const share = wb / (wa + wb);
      a.x -= nx * overlap * share * 2 * 0.5;
      a.z -= nz * overlap * share * 2 * 0.5;
      b.x += nx * overlap * (1 - share) * 2 * 0.5;
      b.z += nz * overlap * (1 - share) * 2 * 0.5;
    });
  }
}

function weight(u: Unit): number {
  if (u.kind === 'champion') return u.order.t === 'idle' ? 2.4 : 2;
  if (u.kind === 'monster') return 3;
  return 1;
}
