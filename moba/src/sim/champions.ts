/** Champion update: orders, auto attacks, dashes, recall, regeneration and respawn. */
import { CONFIG } from '../data/config.ts';
import { SPAWN_POS } from '../data/map.ts';
import { abilityDef, castReach, hitArea, tryCast } from './abilities.ts';
import { respawnChampion } from './core.ts';
import { dist } from './math.ts';
import { followPath, setPath } from './movement.ts';
import { bestTarget, chase, engage, inAcquireRange } from './targeting.ts';
import type { Team, Unit } from './types.ts';
import type { World } from './world.ts';

export function stepChampions(w: World, dt: number) {
  for (const u of w.champions) {
    const c = u.champ!;
    if (!u.alive) {
      if (w.time >= c.respawnAt) respawnChampion(w, u);
      continue;
    }
    for (let i = 0; i < 4; i++) if (c.cooldowns[i] > 0) c.cooldowns[i] = Math.max(0, c.cooldowns[i] - dt);
    regen(w, u, dt);
    u.attackCd = Math.max(0, u.attackCd - dt);
    u.moved = 0;
    if (u.dash) {
      stepDash(w, u, dt);
      continue;
    }
    if (w.hasStatus(u, 'stun')) continue;
    runOrder(w, u, dt);
  }
}

function regen(w: World, u: Unit, dt: number) {
  const s = u.s;
  u.hp = Math.min(s.maxHp, u.hp + s.hpRegen * dt);
  u.mana = Math.min(s.maxMana, u.mana + s.manaRegen * dt);
  const sp = SPAWN_POS[u.team as Team];
  const d = dist(u.x, u.z, sp.x, sp.z);
  if (d <= CONFIG.fountainRadius) {
    u.hp = Math.min(s.maxHp, u.hp + s.maxHp * CONFIG.fountainRegenPctPerSec * dt);
    u.mana = Math.min(s.maxMana, u.mana + s.maxMana * CONFIG.fountainRegenPctPerSec * dt);
  }
  u.champ!.inShop = d <= CONFIG.shopRadius;
}

function stepDash(w: World, u: Unit, dt: number) {
  const d = u.dash!;
  if (d.targetId) {
    const t = w.get(d.targetId);
    if (t && t.alive) {
      const dd = dist(u.x, u.z, t.x, t.z);
      const stand = t.radius + u.radius + 0.2;
      const k = Math.max(0, dd - stand) / (dd || 1);
      d.tx = u.x + (t.x - u.x) * k;
      d.tz = u.z + (t.z - u.z) * k;
    }
  }
  const dx = d.tx - u.x;
  const dz = d.tz - u.z;
  const len = Math.hypot(dx, dz);
  const step = d.speed * dt;
  if (len > 0.001) u.facing = Math.atan2(dx, dz);
  u.moved = Math.min(step, len);
  if (len <= step) {
    u.x = d.tx;
    u.z = d.tz;
    u.dash = null;
    const def = abilityDef(u, d.slot);
    if (def.effects.length > 0) {
      const r = def.radius ?? 3;
      w.emit({ t: 'zoneHit', id: u.id, x: u.x, z: u.z, radius: r, visual: `spell:${u.champ!.defId}:${d.slot}`, team: u.team });
      hitArea(w, u, u.x, u.z, r, def.effects, d.rank);
    }
  } else {
    u.x += (dx / len) * step;
    u.z += (dz / len) * step;
  }
}

function pickValid(w: World, u: Unit, id: number): Unit | null {
  if (!id) return null;
  const t = w.get(id);
  return t && w.canBeTargeted(u, t) ? t : null;
}

function runOrder(w: World, u: Unit, dt: number) {
  const o = u.order;
  switch (o.t) {
    case 'idle': {
      let t = pickValid(w, u, u.target);
      if (t && !inAcquireRange(u, t, 0.4)) t = null;
      u.targetCheck -= dt;
      if (!t && u.targetCheck <= 0) {
        t = bestTarget(w, u, 0.4);
        u.targetCheck = 0.15;
      }
      u.target = t ? t.id : 0;
      if (t) engage(w, u, t, dt);
      break;
    }
    case 'move': {
      if (followPath(w, u, dt, o.x, o.z, 0.3)) u.order = { t: 'idle' };
      break;
    }
    case 'attackMove': {
      let t = pickValid(w, u, u.target);
      if (t && !inAcquireRange(u, t, 2.6)) t = null;
      u.targetCheck -= dt;
      if (!t && u.targetCheck <= 0) {
        t = bestTarget(w, u, 2.6);
        u.targetCheck = 0.12;
      }
      u.target = t ? t.id : 0;
      if (t) {
        engage(w, u, t, dt);
      } else {
        u.pathAge += dt;
        if (u.path.length === 0 || u.pathAge > 0.5) setPath(w, u, o.x, o.z);
        if (followPath(w, u, dt, o.x, o.z, 0.5)) u.order = { t: 'idle' };
      }
      break;
    }
    case 'attack': {
      const t = pickValid(w, u, o.target);
      if (!t) {
        u.order = { t: 'idle' };
        break;
      }
      u.target = t.id;
      engage(w, u, t, dt);
      break;
    }
    case 'cast': {
      const def = abilityDef(u, o.slot);
      const t = pickValid(w, u, o.target);
      if (!t) {
        u.order = { t: 'idle' };
        break;
      }
      if (dist(u.x, u.z, t.x, t.z) <= castReach(u, def, t)) {
        tryCast(w, u, o.slot, t.x, t.z, t.id);
        if (u.order.t === 'cast') u.order = { t: 'idle' };
      } else {
        chase(w, u, t, dt);
      }
      break;
    }
    case 'recall': {
      o.left -= dt;
      if (o.left <= 0) {
        const sp = SPAWN_POS[u.team as Team];
        u.x = sp.x;
        u.z = sp.z;
        u.px = u.x;
        u.pz = u.z;
        u.path = [];
        u.order = { t: 'idle' };
        w.emit({ t: 'recallDone', id: u.id });
      }
      break;
    }
  }
}
