/** Target acquisition and engagement shared by champions, minions, monsters. */
import { inReach, reach } from './core.ts';
import { performAttack } from './attack.ts';
import { facingTo } from './math.ts';
import { followPath, setPath } from './movement.ts';
import type { Unit } from './types.ts';
import type { World } from './world.ts';

/**
 * Best enemy for a champion style auto-acquire: closest by edge distance, champions slightly
 * favoured, structures only when nothing else is around.
 */
export function bestTarget(w: World, u: Unit, extra: number): Unit | null {
  let best: Unit | null = null;
  let bs = Infinity;
  const q = u.s.range + u.radius + extra + 4;
  w.query(u.x, u.z, q, (v) => {
    if (!w.canBeTargeted(u, v)) return;
    const edge = Math.hypot(v.x - u.x, v.z - u.z) - v.radius - (u.kind === 'tower' ? 0 : u.radius);
    if (edge > u.s.range + extra) return;
    let score = edge;
    if (v.kind === 'champion') score *= 0.75;
    else if (v.kind === 'minion' || v.kind === 'monster') score *= 1;
    else score = score * 1.3 + 4;
    if (score < bs) {
      bs = score;
      best = v;
    }
  });
  return best;
}

/** Chase a target by repathing a few times a second. */
export function chase(w: World, u: Unit, t: Unit, dt: number) {
  u.pathAge += dt;
  if (u.path.length === 0 || u.pathAge > 0.3) setPath(w, u, t.x, t.z);
  followPath(w, u, dt, t.x, t.z, 0.1);
}

/** Attack when in reach, otherwise chase. */
export function engage(w: World, u: Unit, t: Unit, dt: number) {
  if (inReach(u, t)) {
    u.moved = 0;
    u.facing = facingTo(u.x, u.z, t.x, t.z);
    u.pathAge = 99;
    u.path = [];
    if (u.attackCd <= 0) performAttack(w, u, t);
  } else {
    chase(w, u, t, dt);
  }
}

export function inAcquireRange(u: Unit, t: Unit, extra: number): boolean {
  return Math.hypot(t.x - u.x, t.z - u.z) <= reach(u, t) + extra;
}
