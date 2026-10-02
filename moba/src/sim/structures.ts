/** Towers, inhibitors and nexus behaviour. */
import { CONFIG } from '../data/config.ts';
import { STRUCTURES } from '../data/units.ts';
import { performAttack } from './attack.ts';
import { dist, facingTo } from './math.ts';
import type { Unit } from './types.ts';
import type { World } from './world.ts';

export function stepStructures(w: World, dt: number) {
  for (const s of w.structures) {
    const st = s.struct!;
    if (!s.alive) {
      if (s.kind === 'inhibitor' && st.destroyed && w.time >= st.respawnAt && st.respawnAt > 0) respawnInhibitor(w, s);
      continue;
    }
    // Regen
    if (s.s.hpRegen > 0) s.hp = Math.min(s.s.maxHp, s.hp + s.s.hpRegen * dt);
    if (s.kind !== 'tower') continue;
    s.attackCd = Math.max(0, s.attackCd - dt);
    s.targetCheck -= dt;
    towerAI(w, s);
  }
}

function respawnInhibitor(w: World, s: Unit) {
  const st = s.struct!;
  st.destroyed = false;
  st.respawnAt = 0;
  s.alive = true;
  s.removed = false;
  s.hp = s.s.maxHp;
  const c = w.structCircle.get(s.id);
  if (c) w.nav.setActive(c, true);
  w.emit({ t: 'inhibRespawn', id: s.id, team: s.team });
}

function towerAI(w: World, t: Unit) {
  const def = STRUCTURES[t.defId];
  let cur = t.target ? w.get(t.target) : undefined;
  const reachTo = (v: Unit) => def.range + v.radius;
  if (cur && (!cur.alive || !w.canBeTargeted(t, cur) || dist(t.x, t.z, cur.x, cur.z) > reachTo(cur) + 1)) {
    cur = undefined;
    t.target = 0;
  }
  if (!cur || t.targetCheck <= 0) {
    t.targetCheck = 0.2;
    let aggro: Unit | null = null;
    let minion: Unit | null = null;
    let champ: Unit | null = null;
    let md = Infinity;
    let cd = Infinity;
    let ad = Infinity;
    w.query(t.x, t.z, def.range + 4, (v) => {
      if (v.team === t.team || !w.canBeTargeted(t, v)) return;
      const d = dist(t.x, t.z, v.x, v.z);
      if (d > reachTo(v)) return;
      if (v.kind === 'minion') {
        if (d < md) {
          md = d;
          minion = v;
        }
      } else if (v.kind === 'champion') {
        if (d < cd) {
          cd = d;
          champ = v;
        }
        const c = v.champ!;
        if (w.time - c.lastAttackedChampAt < CONFIG.aggroMemory) {
          const victim = w.get(c.lastAttackedChampId);
          if (victim && victim.team === t.team && d < ad) {
            ad = d;
            aggro = v;
          }
        }
      }
    });
    const chosen = aggro ?? minion ?? champ;
    if (aggro || !cur) cur = chosen ?? undefined;
    t.target = cur ? cur.id : 0;
  }
  if (cur && t.attackCd <= 0) {
    t.facing = facingTo(t.x, t.z, cur.x, cur.z);
    performAttack(w, t, cur);
  }
}
