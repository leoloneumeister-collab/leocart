/** Jungle camps: spawning, aggro sharing, leashing and respawn. */
import { CAMP_SPOTS } from '../data/map.ts';
import { MONSTER_CAMPS } from '../data/units.ts';
import { performAttack } from './attack.ts';
import { inReach } from './core.ts';
import { dist, facingTo } from './math.ts';
import { followPath, setPath } from './movement.ts';
import type { Unit } from './types.ts';
import type { World } from './world.ts';

export interface Camp {
  id: number;
  kind: 'brutes' | 'thorns' | 'golem';
  x: number;
  z: number;
  members: number[];
  /** Time when the camp (re)spawns; 0 while monsters are alive. */
  respawnAt: number;
  aggroTarget: number;
  aggroUntil: number;
  lastSeenDamage: number;
}

export function initCamps(w: World) {
  if (w.setup.noJungle || w.setup.midOnly) return;
  CAMP_SPOTS.forEach((spot, i) => {
    const def = MONSTER_CAMPS[spot.kind];
    w.camps.push({ id: i, kind: spot.kind, x: spot.x, z: spot.z, members: [], respawnAt: def.firstSpawn, aggroTarget: 0, aggroUntil: 0, lastSeenDamage: -99 });
  });
}

function spawnCamp(w: World, camp: Camp) {
  const def = MONSTER_CAMPS[camp.kind];
  camp.members = [];
  for (const m of def.members) {
    const stats = {
      maxHp: m.hp,
      maxMana: 0,
      ad: m.ad,
      ap: 0,
      armor: m.armor,
      mr: m.mr,
      as: m.as,
      ms: m.ms,
      range: m.range,
      hpRegen: 0,
      manaRegen: 0,
      haste: 0,
      lifesteal: 0,
    };
    const u = w.createUnit('monster', 2, camp.kind, m.name, camp.x + m.dx, camp.z + m.dz, m.radius, m.height, stats);
    u.monster = { campId: camp.id, homeX: u.x, homeZ: u.z, leash: 20, aggro: 0, gold: m.gold, xp: m.xp, lastDamagedAt: -99 };
    u.facing = Math.atan2(-camp.x, -camp.z);
    camp.members.push(u.id);
  }
  camp.respawnAt = 0;
  camp.aggroTarget = 0;
}

export function stepMonsters(w: World, dt: number) {
  for (const camp of w.camps) {
    if (camp.respawnAt > 0) {
      if (w.time >= camp.respawnAt) spawnCamp(w, camp);
      continue;
    }
    // Detect cleared camp
    let alive = 0;
    let newest = camp.lastSeenDamage;
    let attacker = 0;
    for (const id of camp.members) {
      const u = w.get(id);
      if (!u || !u.alive) continue;
      alive++;
      if (u.lastDamagedByTime > newest && u.lastDamagedBy) {
        newest = u.lastDamagedByTime;
        attacker = u.lastDamagedBy;
      }
    }
    if (alive === 0) {
      camp.respawnAt = w.time + MONSTER_CAMPS[camp.kind].respawn;
      camp.members = [];
      continue;
    }
    if (attacker) {
      const a = w.get(attacker);
      if (a && a.alive && a.kind !== 'monster') {
        camp.aggroTarget = attacker;
        camp.aggroUntil = w.time + 5;
      }
      camp.lastSeenDamage = newest;
    }
    for (const id of camp.members) {
      const u = w.get(id);
      if (u && u.alive) monsterAI(w, u, camp, dt);
    }
  }
}

function monsterAI(w: World, u: Unit, camp: Camp, dt: number) {
  const ms = u.monster!;
  u.attackCd = Math.max(0, u.attackCd - dt);
  u.moved = 0;
  if (w.hasStatus(u, 'stun')) return;
  let t = camp.aggroTarget ? w.get(camp.aggroTarget) : undefined;
  if (t && (!t.alive || dist(t.x, t.z, ms.homeX, ms.homeZ) > ms.leash || w.time > camp.aggroUntil + 4)) {
    camp.aggroTarget = 0;
    t = undefined;
  }
  // Keep aggro alive while the target stays in the fight
  if (t && dist(t.x, t.z, u.x, u.z) < 14) camp.aggroUntil = Math.max(camp.aggroUntil, w.time + 4);
  if (t) {
    if (inReach(u, t)) {
      u.facing = facingTo(u.x, u.z, t.x, t.z);
      if (u.attackCd <= 0) performAttack(w, u, t);
    } else {
      u.pathAge += dt;
      if (u.path.length === 0 || u.pathAge > 0.4) setPath(w, u, t.x, t.z);
      followPath(w, u, dt, t.x, t.z, 0.1);
    }
    return;
  }
  // Return home and heal
  const d = dist(u.x, u.z, ms.homeX, ms.homeZ);
  if (d > 0.6) {
    u.pathAge += dt;
    if (u.path.length === 0 || u.pathAge > 0.6) setPath(w, u, ms.homeX, ms.homeZ);
    followPath(w, u, dt, ms.homeX, ms.homeZ, 0.3);
    u.hp = Math.min(u.s.maxHp, u.hp + u.s.maxHp * 0.08 * dt);
  } else {
    u.hp = Math.min(u.s.maxHp, u.hp + u.s.maxHp * 0.25 * dt);
    u.facing = Math.atan2(-ms.homeX, -ms.homeZ);
  }
}
