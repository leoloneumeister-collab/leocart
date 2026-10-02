/** Status effect expiry. */
import type { World } from './world.ts';

export function stepStatuses(w: World, _dt: number) {
  for (const u of w.units) {
    if (!u.alive) continue;
    let changed = false;
    if (u.statuses.length > 0) {
      const t = w.time;
      const keep = u.statuses.filter((s) => s.until > t && !(s.type === 'shield' && s.amount <= 0));
      if (keep.length !== u.statuses.length) {
        u.statuses = keep;
        changed = true;
      }
    }
    if (u.champ && u.champ.stacks > 0 && u.champ.stackUntil <= w.time) {
      u.champ.stacks = 0;
      changed = true;
    }
    if (changed) w.recomputeStats(u);
  }
}
