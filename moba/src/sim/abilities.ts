/** Ability runtime: validates casts, spawns projectiles/zones/dashes and applies effects. */
import { CHAMPIONS } from '../data/champions.ts';
import type { AbilityDef } from '../data/champions.ts';
import { dealDamage, heal, cancelRecall, reach } from './core.ts';
import { dist, facingTo } from './math.ts';
import { newProjectile } from './attack.ts';
import type { HitEffect, Status, Unit } from './types.ts';
import type { World } from './world.ts';

export type CastResult = 'ok' | 'approach' | 'norank' | 'cooldown' | 'mana' | 'blocked' | 'notarget' | 'dead';

export function valueAt(arr: number[] | undefined, rank: number): number {
  if (!arr || arr.length === 0) return 0;
  return arr[Math.max(0, Math.min(arr.length - 1, rank - 1))];
}

export function abilityDef(u: Unit, slot: number): AbilityDef {
  return CHAMPIONS[u.champ!.defId].abilities[slot];
}

export function cooldownFor(u: Unit, def: AbilityDef, rank: number): number {
  return valueAt(def.cooldown, rank) * (100 / (100 + u.s.haste));
}

export function bonusAd(u: Unit): number {
  return Math.max(0, u.s.ad - u.baseStats.ad);
}

/** Pick the unit an unit-targeted ability should hit. */
export function resolveUnitTarget(w: World, u: Unit, x: number, z: number, targetId: number, def: AbilityDef): Unit | null {
  if (targetId) {
    const t = w.get(targetId);
    if (t && w.canBeTargeted(u, t)) return t;
  }
  // Nearest enemy champion to the cursor
  let best: Unit | null = null;
  let bd = 10;
  for (const c of w.champions) {
    if (c.team === u.team || !w.canBeTargeted(u, c)) continue;
    const d = dist(c.x, c.z, x, z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  void def;
  return best;
}

export function isSilenced(w: World, u: Unit): boolean {
  return w.hasStatus(u, 'silence') || w.hasStatus(u, 'stun');
}

export function canCast(w: World, u: Unit, slot: number): CastResult {
  const c = u.champ;
  if (!c || !u.alive) return 'dead';
  const def = abilityDef(u, slot);
  const rank = c.ranks[slot];
  if (rank <= 0) return 'norank';
  if (c.cooldowns[slot] > 0) return 'cooldown';
  if (u.mana < valueAt(def.mana, rank)) return 'mana';
  if (isSilenced(w, u) || u.dash) return 'blocked';
  return 'ok';
}

export function tryCast(w: World, u: Unit, slot: number, x: number, z: number, targetId: number): CastResult {
  const pre = canCast(w, u, slot);
  if (pre !== 'ok') return pre;
  const c = u.champ!;
  const def = abilityDef(u, slot);
  const rank = c.ranks[slot];

  let target: Unit | null = null;
  if (def.targeting === 'unit') {
    target = resolveUnitTarget(w, u, x, z, targetId, def);
    if (!target) return 'notarget';
    const d = dist(u.x, u.z, target.x, target.z);
    if (d > def.range + target.radius + u.radius * 0.5) return 'approach';
  }

  u.mana -= valueAt(def.mana, rank);
  c.cooldowns[slot] = cooldownFor(u, def, rank);
  cancelRecall(w, u);

  // Aim
  let dx = x - u.x;
  let dz = z - u.z;
  if (target) {
    dx = target.x - u.x;
    dz = target.z - u.z;
  }
  let dlen = Math.hypot(dx, dz);
  if (dlen < 0.01) {
    dx = Math.sin(u.facing);
    dz = Math.cos(u.facing);
    dlen = 1;
  }
  const ux = dx / dlen;
  const uz = dz / dlen;
  if (def.kind !== 'self' && def.kind !== 'nova') u.facing = facingTo(0, 0, ux, uz);

  const champId = c.defId;
  w.emit({ t: 'cast', id: u.id, slot, champ: champId, x: u.x, z: u.z, tx: x, tz: z });

  if (def.selfEffects) applySelfEffects(w, u, def.selfEffects, rank, slot);

  switch (def.kind) {
    case 'skillshot': {
      const p = newProjectile(w, {
        team: u.team,
        source: u.id,
        x: u.x + ux * (u.radius + 0.3),
        z: u.z + uz * (u.radius + 0.3),
        vx: ux * (def.speed ?? 40),
        vz: uz * (def.speed ?? 40),
        speed: def.speed ?? 40,
        radius: def.width ?? 1.2,
        range: def.range,
        pierce: !!def.pierce,
        ability: { champ: champId, slot },
        rank,
        visual: `spell:${champId}:${slot}`,
      });
      void p;
      break;
    }
    case 'target': {
      if (target) applyEffects(w, u, target, def.effects, rank);
      break;
    }
    case 'ground': {
      const d = Math.min(def.range, Math.hypot(x - u.x, z - u.z));
      const zx = u.x + ux * d;
      const zz = u.z + uz * d;
      const clipped = w.nav.isBlocked(zx, zz) ? { x: zx, z: zz } : { x: zx, z: zz };
      w.zones.push({
        id: w.nextId++,
        team: u.team,
        source: u.id,
        x: clipped.x,
        z: clipped.z,
        radius: def.radius ?? 5,
        triggerAt: w.time + (def.delay ?? 0.5),
        createdAt: w.time,
        ability: { champ: champId, slot },
        rank,
        visual: `spell:${champId}:${slot}`,
        alive: true,
      });
      w.emit({ t: 'zone', id: w.nextId - 1, x: clipped.x, z: clipped.z, radius: def.radius ?? 5, delay: def.delay ?? 0.5, visual: `spell:${champId}:${slot}`, team: u.team });
      break;
    }
    case 'nova': {
      const r = def.radius ?? 6;
      w.emit({ t: 'zoneHit', id: u.id, x: u.x, z: u.z, radius: r, visual: `spell:${champId}:${slot}`, team: u.team });
      hitArea(w, u, u.x, u.z, r, def.effects, rank);
      break;
    }
    case 'dash': {
      let tx: number;
      let tz: number;
      if (target) {
        const d = dist(u.x, u.z, target.x, target.z);
        const stand = target.radius + u.radius + 0.2;
        const k = Math.max(0, d - stand) / (d || 1);
        tx = u.x + (target.x - u.x) * k;
        tz = u.z + (target.z - u.z) * k;
      } else {
        const want = Math.min(def.range, Math.max(Math.hypot(x - u.x, z - u.z), 4));
        const end = w.nav.clipSegment(u.x, u.z, u.x + ux * want, u.z + uz * want);
        tx = end.x;
        tz = end.z;
      }
      u.dash = { tx, tz, speed: def.dashSpeed ?? 40, slot, targetId: target ? target.id : 0, rank };
      u.order = { t: 'idle' };
      u.path = [];
      w.emit({ t: 'dash', id: u.id, fx: u.x, fz: u.z, tx, tz });
      break;
    }
    case 'blink': {
      const want = Math.min(def.range, Math.max(Math.hypot(x - u.x, z - u.z), 3));
      const end = w.nav.clipSegment(u.x, u.z, u.x + ux * want, u.z + uz * want);
      w.emit({ t: 'blink', id: u.id, fx: u.x, fz: u.z, tx: end.x, tz: end.z });
      u.x = end.x;
      u.z = end.z;
      u.px = u.x;
      u.pz = u.z;
      u.path = [];
      break;
    }
    case 'self':
      break;
  }

  // Passive: casting grants a buff
  const passive = CHAMPIONS[champId].passive;
  if (passive.type === 'onCastBuff') {
    w.addStatus(u, { type: 'buff', stat: passive.stat, pct: true, amount: passive.amount, until: w.time + passive.duration, source: u.id, tag: 'passive' });
    w.recomputeStats(u);
  }
  return 'ok';
}

// ------------------------------------------------------------------ effects

export function hitArea(w: World, src: Unit, x: number, z: number, radius: number, effects: HitEffect[], rank: number) {
  const victims: Unit[] = [];
  w.query(x, z, radius + 3, (v) => {
    if (v.team === src.team || !v.alive) return;
    if (v.kind === 'champion' && src.team !== 2 && !w.canSee(src.team as 0 | 1, v) && false) return;
    const d = dist(x, z, v.x, v.z);
    if (d <= radius + v.radius * 0.6 && w.canBeTargeted(src, v)) victims.push(v);
  });
  for (const v of victims) applyEffects(w, src, v, effects, rank);
}

function effectNumber(e: HitEffect, rank: number): number {
  if (e.amounts) return valueAt(e.amounts, rank);
  return e.amount ?? 0;
}

export function applyEffects(w: World, src: Unit, victim: Unit, effects: HitEffect[], rank: number) {
  for (const e of effects) {
    switch (e.type) {
      case 'damage': {
        let amt = valueAt(e.base, rank);
        if (e.ad) amt += e.ad * src.s.ad;
        if (e.bonusAd) amt += e.bonusAd * bonusAd(src);
        if (e.ap) amt += e.ap * src.s.ap;
        if (e.maxHpPct) amt += e.maxHpPct * victim.s.maxHp;
        if (e.ownMaxHpPct) amt += e.ownMaxHpPct * src.s.maxHp;
        if (e.missingHpPct) amt += e.missingHpPct * (victim.s.maxHp - victim.hp);
        if (e.executeBelow && victim.hp / victim.s.maxHp < e.executeBelow) amt *= e.executeMult ?? 1.5;
        dealDamage(w, src, victim, amt, e.dmgType ?? 'physical');
        break;
      }
      case 'stun':
      case 'root':
      case 'silence': {
        if (victim.kind === 'tower' || victim.kind === 'inhibitor' || victim.kind === 'nexus') break;
        const dur = e.duration ?? 1;
        w.addStatus(victim, { type: e.type, until: w.time + dur, amount: 0, source: src.id, tag: e.tag });
        if (e.type === 'stun') {
          victim.dash = null;
          cancelRecall(w, victim);
        }
        w.emit({ t: 'status', id: victim.id, status: e.type, duration: dur });
        break;
      }
      case 'slow': {
        if (victim.kind === 'tower' || victim.kind === 'inhibitor' || victim.kind === 'nexus') break;
        const dur = e.duration ?? 1;
        w.addStatus(victim, { type: 'slow', until: w.time + dur, amount: e.amount ?? 0.3, source: src.id });
        w.recomputeStats(victim);
        w.emit({ t: 'status', id: victim.id, status: 'slow', duration: dur });
        break;
      }
      default:
        break;
    }
  }
}

export function applySelfEffects(w: World, u: Unit, effects: HitEffect[], rank: number, slot: number) {
  for (const e of effects) {
    switch (e.type) {
      case 'shield': {
        let amt = valueAt(e.base, rank);
        if (e.ap) amt += e.ap * u.s.ap;
        if (e.bonusAd) amt += e.bonusAd * bonusAd(u);
        if (e.ownMaxHpPct) amt += e.ownMaxHpPct * u.s.maxHp;
        const st: Status = { type: 'shield', until: w.time + (e.duration ?? 3), amount: amt, source: u.id, tag: `shield${slot}` };
        w.addStatus(u, st);
        w.emit({ t: 'shield', id: u.id });
        break;
      }
      case 'buff': {
        if (!e.stat) break;
        const amt = effectNumber(e, rank);
        w.addStatus(u, { type: 'buff', stat: e.stat, pct: e.pct, amount: amt, until: w.time + (e.duration ?? 3), source: u.id, tag: `buff${slot}${e.stat}` });
        w.recomputeStats(u);
        break;
      }
      case 'heal': {
        let amt = valueAt(e.base, rank);
        if (e.ap) amt += e.ap * u.s.ap;
        heal(w, u, amt);
        break;
      }
      default:
        break;
    }
  }
}

/** Does the ability need an approach (target out of range)? Used by the order system. */
export function castReach(u: Unit, def: AbilityDef, t: Unit): number {
  return def.range + t.radius + u.radius * 0.5;
}

export { reach };
