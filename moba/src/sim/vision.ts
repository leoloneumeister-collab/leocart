/** Fog of war: which enemy units each team can currently see. */
import { CONFIG } from '../data/config.ts';
import type { Team, Unit } from './types.ts';
import type { World } from './world.ts';

export function visionRadius(u: Unit): number {
  switch (u.kind) {
    case 'champion':
      return CONFIG.visionChampion;
    case 'minion':
      return CONFIG.visionMinion;
    case 'tower':
      return CONFIG.visionTower;
    case 'nexus':
      return CONFIG.visionNexus;
    case 'inhibitor':
      return CONFIG.visionInhibitor;
    default:
      return 0;
  }
}

export function stepVision(w: World) {
  if (--w.visionTimer > 0) return;
  w.visionTimer = 5;
  for (const team of [0, 1] as Team[]) {
    const set = w.visible[team];
    set.clear();
    const viewers: Unit[] = [];
    for (const u of w.units) if (u.team === team && u.alive && visionRadius(u) > 0) viewers.push(u);
    for (const e of w.units) {
      if (e.team === team || !e.alive) continue;
      if (!w.fogOn || e.struct) {
        set.add(e.id);
        continue;
      }
      for (const v of viewers) {
        const r = visionRadius(v) + e.radius;
        const dx = v.x - e.x;
        const dz = v.z - e.z;
        if (dx * dx + dz * dz <= r * r) {
          set.add(e.id);
          break;
        }
      }
    }
  }
}
