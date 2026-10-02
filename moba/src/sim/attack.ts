/** Basic attacks and projectile creation. */
import { CHAMPIONS } from '../data/champions.ts';
import { STRUCTURES } from '../data/units.ts';
import { cancelRecall, dealDamage } from './core.ts';
import { facingTo } from './math.ts';
import type { Projectile, Unit } from './types.ts';
import type { World } from './world.ts';

export function attackDamage(a: Unit, t: Unit): number {
  let dmg = a.s.ad;
  if (a.kind === 'tower') {
    if (t.kind === 'minion') dmg *= STRUCTURES[a.defId]?.vsMinion ?? 1;
  } else if (a.kind === 'minion' && a.minion) {
    dmg *= a.minion.dmgScale;
    if (t.struct) dmg *= 0.6;
  }
  return dmg;
}

export function newProjectile(w: World, p: Partial<Projectile> & { team: Projectile['team']; source: number; x: number; z: number }): Projectile {
  const proj: Projectile = {
    id: w.nextId++,
    team: p.team,
    source: p.source,
    x: p.x,
    z: p.z,
    px: p.x,
    pz: p.z,
    vx: p.vx ?? 0,
    vz: p.vz ?? 0,
    speed: p.speed ?? 30,
    radius: p.radius ?? 0.5,
    range: p.range ?? 0,
    homing: p.homing ?? 0,
    pierce: p.pierce ?? false,
    hit: [],
    dmg: p.dmg ?? 0,
    dmgType: p.dmgType ?? 'physical',
    ability: p.ability,
    rank: p.rank ?? 1,
    visual: p.visual ?? 'attack',
    isAttack: p.isAttack ?? false,
    alive: true,
  };
  w.projectiles.push(proj);
  w.emit({ t: 'projectile', id: proj.id });
  return proj;
}

export function performAttack(w: World, a: Unit, t: Unit) {
  a.attackCd = 1 / Math.max(0.1, a.s.as);
  a.facing = facingTo(a.x, a.z, t.x, t.z);
  cancelRecall(w, a);
  const ranged = a.projectileSpeed > 0;
  w.emit({ t: 'attack', id: a.id, target: t.id, tx: t.x, tz: t.z, ranged });
  const dmg = attackDamage(a, t);
  if (a.champ) {
    const p = CHAMPIONS[a.champ.defId].passive;
    if (p.type === 'stackOnHit' && p.stat === 'as') {
      a.champ.stacks = Math.min(p.max, (a.champ.stackUntil > w.time ? a.champ.stacks : 0) + 1);
      a.champ.stackUntil = w.time + p.duration;
      w.recomputeStats(a);
    }
  }
  if (!ranged) {
    dealDamage(w, a, t, dmg, a.attackDmgType, { isAttack: true });
  } else {
    const vis = a.kind === 'tower' ? 'tower' : a.kind === 'champion' ? `champ:${a.defId}` : 'attack';
    newProjectile(w, {
      team: a.team,
      source: a.id,
      x: a.x + Math.sin(a.facing) * a.radius,
      z: a.z + Math.cos(a.facing) * a.radius,
      speed: a.projectileSpeed,
      homing: t.id,
      dmg,
      dmgType: a.attackDmgType,
      isAttack: true,
      visual: vis,
      radius: 0.4,
    });
  }
}
