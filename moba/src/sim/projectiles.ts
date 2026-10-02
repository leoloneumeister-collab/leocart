/** Projectile flight, spell hits and delayed ground zones. */
import { CHAMPIONS } from '../data/champions.ts';
import { applyEffects, hitArea } from './abilities.ts';
import { dealDamage } from './core.ts';
import { distToSegment } from './math.ts';
import { CONFIG } from '../data/config.ts';
import type { World } from './world.ts';

export function stepProjectiles(w: World, dt: number) {
  const projs = w.projectiles;
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    if (!p.alive) continue;
    p.px = p.x;
    p.pz = p.z;
    const src = w.get(p.source);
    if (p.homing) {
      const t = w.get(p.homing);
      if (!t || !t.alive) {
        p.alive = false;
        continue;
      }
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = p.speed * dt;
      if (d <= step + t.radius * 0.5) {
        dealDamage(w, src ?? null, t, p.dmg, p.dmgType, { isAttack: true });
        p.alive = false;
        continue;
      }
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      p.vx = (dx / d) * p.speed;
      p.vz = (dz / d) * p.speed;
      continue;
    }
    // Skillshot
    const step = p.speed * dt;
    const nx = p.x + (p.vx / p.speed) * step;
    const nz = p.z + (p.vz / p.speed) * step;
    let stop = false;
    w.query((p.x + nx) / 2, (p.z + nz) / 2, step / 2 + p.radius + 3, (v) => {
      if (stop || v.team === p.team || !v.alive || p.hit.includes(v.id)) return;
      if (v.kind === 'tower' || v.kind === 'inhibitor' || v.kind === 'nexus') {
        if (!w.structureVulnerable(v)) return;
      }
      if (v.invulnUntil > w.time) return;
      const d = distToSegment(v.x, v.z, p.x, p.z, nx, nz);
      if (d <= p.radius + v.radius * 0.8) {
        const caster = src ?? null;
        p.hit.push(v.id);
        if (caster && p.ability) {
          const def = CHAMPIONS[p.ability.champ].abilities[p.ability.slot];
          applyEffects(w, caster, v, def.effects, p.rank);
        }
        if (!p.pierce) {
          stop = true;
          p.x = v.x;
          p.z = v.z;
        }
      }
    });
    if (stop) {
      p.alive = false;
      continue;
    }
    p.x = nx;
    p.z = nz;
    p.range -= step;
    if (p.range <= 0 || Math.abs(p.x) > CONFIG.mapHalf || Math.abs(p.z) > CONFIG.mapHalf) p.alive = false;
  }
  // Compact
  let j = 0;
  for (let i = 0; i < projs.length; i++) if (projs[i].alive) projs[j++] = projs[i];
  projs.length = j;

  // Zones
  const zones = w.zones;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z.alive || w.time < z.triggerAt) continue;
    z.alive = false;
    const src = w.get(z.source);
    const def = CHAMPIONS[z.ability.champ].abilities[z.ability.slot];
    w.emit({ t: 'zoneHit', id: z.id, x: z.x, z: z.z, radius: z.radius, visual: z.visual, team: z.team });
    if (src) hitArea(w, src, z.x, z.z, z.radius, def.effects, z.rank);
  }
  let k = 0;
  for (let i = 0; i < zones.length; i++) if (zones[i].alive) zones[k++] = zones[i];
  zones.length = k;
}
