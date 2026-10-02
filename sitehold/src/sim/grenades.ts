import { GRENADE } from './constants.ts';
import { clamp, forwardOf, v3, type Vec3 } from './math.ts';
import { eyePos, type Actor } from './actor.ts';
import type { GrenadeKind } from './weapons.ts';
import { computeDamage, applyDamage } from './combat.ts';
import { newHit, type World } from './world.ts';
import type { Sim } from './sim.ts';

export interface Grenade {
  id: number;
  kind: GrenadeKind;
  owner: number;
  pos: Vec3;
  vel: Vec3;
  born: number;
  bounces: number;
  rest: number;
  alive: boolean;
}

export interface Smoke { id: number; pos: Vec3; start: number; end: number; r: number }
export interface Fire { id: number; pos: Vec3; start: number; end: number; r: number; owner: number }

const hit = newHit();

const DETONATE: Record<GrenadeKind, number> = { flash: 1.6, he: 1.6, smoke: 2.6, fire: 2.4 };

/** Advances a grenade body by dt. Returns true on a bounce. Shared by the sim and the bot throw solver. */
export function stepBody(world: World, g: { pos: Vec3; vel: Vec3; rest: number; bounces: number }, dt: number): { bounced: boolean; floor: boolean; speed: number } {
  g.vel.y -= GRENADE.gravity * dt;
  const sp = Math.hypot(g.vel.x, g.vel.y, g.vel.z);
  const len = sp * dt;
  let bounced = false, floor = false;
  let impact = 0;
  if (len > 1e-6) {
    const dx = g.vel.x / sp, dy = g.vel.y / sp, dz = g.vel.z / sp;
    if (world.raycast(g.pos.x, g.pos.y, g.pos.z, dx, dy, dz, len + GRENADE.radius, hit) && hit.t < len + GRENADE.radius) {
      const t = Math.max(0, hit.t - GRENADE.radius);
      g.pos.x += dx * t; g.pos.y += dy * t; g.pos.z += dz * t;
      const vn = g.vel.x * hit.nx + g.vel.y * hit.ny + g.vel.z * hit.nz;
      impact = Math.abs(vn);
      g.vel.x -= (1 + GRENADE.bounce) * vn * hit.nx;
      g.vel.y -= (1 + GRENADE.bounce) * vn * hit.ny;
      g.vel.z -= (1 + GRENADE.bounce) * vn * hit.nz;
      const tf = 1 - GRENADE.friction * (hit.ny > 0.5 ? 0.45 : 0.2);
      if (hit.ny > 0.5) { g.vel.x *= tf; g.vel.z *= tf; }
      else { g.vel.x *= 0.85; g.vel.z *= 0.85; g.vel.y *= 0.9; }
      g.bounces++;
      bounced = true;
      floor = hit.ny > 0.6;
    } else {
      g.pos.x += dx * len; g.pos.y += dy * len; g.pos.z += dz * len;
    }
  }
  if (floor && Math.hypot(g.vel.x, g.vel.y, g.vel.z) < 1.2) { g.vel.x = 0; g.vel.y = 0; g.vel.z = 0; }
  const resting = g.vel.x === 0 && g.vel.y === 0 && g.vel.z === 0;
  g.rest = resting ? g.rest + dt : 0;
  return { bounced, floor, speed: impact };
}

export function throwGrenade(sim: Sim, a: Actor, kind: GrenadeKind, power: number) {
  const eye = eyePos(a);
  const f = forwardOf(a.yaw, a.pitch + (power > 0.9 ? 0.1 : 0.05));
  const origin = v3(eye.x + f.x * 0.35, eye.y - 0.1 + f.y * 0.35, eye.z + f.z * 0.35);
  if (!sim.world.los(eye.x, eye.y, eye.z, origin.x, origin.y, origin.z)) { origin.x = eye.x; origin.y = eye.y - 0.1; origin.z = eye.z; }
  const sp = GRENADE.throwSpeed * power;
  const g: Grenade = {
    id: sim.nextId++, kind, owner: a.id, pos: origin,
    vel: v3(f.x * sp + a.vel.x * 0.45, f.y * sp + a.vel.y * 0.3, f.z * sp + a.vel.z * 0.45),
    born: sim.time, bounces: 0, rest: 0, alive: true,
  };
  sim.grenades.push(g);
  sim.emit({ t: 'throw', id: a.id, kind, pos: { ...origin } });
}

function detonate(sim: Sim, g: Grenade) {
  g.alive = false;
  const owner = sim.actors[g.owner];
  const pos = v3(g.pos.x, g.pos.y, g.pos.z);
  sim.emit({ t: 'detonate', kind: g.kind, pos, owner: g.owner });
  switch (g.kind) {
    case 'smoke':
      sim.smokes.push({ id: sim.nextId++, pos: v3(pos.x, pos.y + 0.2, pos.z), start: sim.time, end: sim.time + GRENADE.smokeTime, r: GRENADE.smokeRadius });
      break;
    case 'fire':
      sim.fires.push({ id: sim.nextId++, pos: v3(pos.x, Math.max(0, pos.y - 0.05), pos.z), start: sim.time, end: sim.time + GRENADE.fireTime, r: GRENADE.fireRadius, owner: g.owner });
      sim.markFire(pos, GRENADE.fireRadius, GRENADE.fireTime);
      break;
    case 'flash':
      for (const v of sim.actors) {
        if (!v.alive) continue;
        const eye = eyePos(v);
        const dx = pos.x - eye.x, dy = pos.y + 0.1 - eye.y, dz = pos.z - eye.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > GRENADE.flashRange) continue;
        if (!sim.world.los(pos.x, pos.y + 0.1, pos.z, eye.x, eye.y, eye.z)) continue;
        const f = forwardOf(v.yaw, v.pitch);
        const facing = (f.x * dx + f.y * dy + f.z * dz) / Math.max(d, 1e-6);
        const aw = facing > 0.45 ? 1 : facing > -0.25 ? 0.62 : 0.28;
        const dist = clamp(1 - (d - 3) / 38, 0.18, 1);
        const dur = Math.max(0.5, 4.9 * aw * dist);
        if (v.flashEnd < sim.time + dur) {
          v.flashEnd = sim.time + dur;
          v.flashFull = sim.time + dur * 0.4;
        }
        sim.emit({ t: 'flashed', id: v.id, dur });
        if (owner && sim.isEnemy(owner, v) && v.isBot === false) { /* nothing extra */ }
        if (owner && v !== owner && sim.isEnemy(owner, v)) sim.flashAssist.set(v.id, { by: owner.id, until: v.flashEnd });
      }
      break;
    case 'he':
      for (const v of sim.actors) {
        if (!v.alive || (owner && !sim.isEnemy(owner, v) && v !== owner)) continue;
        if (v === owner) continue;
        const cx = v.pos.x, cy = v.pos.y + 1.0, cz = v.pos.z;
        const d = Math.hypot(cx - pos.x, cy - pos.y, cz - pos.z);
        if (d > GRENADE.heRadius) continue;
        if (!sim.world.los(pos.x, pos.y + 0.3, pos.z, cx, cy, cz)) continue;
        const raw = GRENADE.heDamage * Math.exp(-Math.pow(d / 5.2, 2));
        if (raw < 1) continue;
        const res = computeDamage(raw, 'chest', 0.57, v);
        applyDamage(sim, v, owner ?? null, res, 'he', false, false, pos);
      }
      break;
  }
}

export function updateGrenades(sim: Sim, dt: number) {
  for (let i = sim.grenades.length - 1; i >= 0; i--) {
    const g = sim.grenades[i];
    if (!g.alive) { sim.grenades.splice(i, 1); continue; }
    const r = stepBody(sim.world, g, dt);
    if (r.bounced && r.speed > 2) sim.emit({ t: 'bounce', kind: g.kind, pos: { ...g.pos } });
    const age = sim.time - g.born;
    let pop = false;
    if (g.kind === 'fire') pop = (r.floor && r.bounced) || age > DETONATE.fire;
    else if (g.kind === 'smoke') pop = (g.rest > 0.25 && age > 0.9) || age > DETONATE.smoke;
    else pop = age >= DETONATE[g.kind];
    if (g.pos.y < -5) pop = true;
    if (pop) detonate(sim, g);
  }
  for (let i = sim.smokes.length - 1; i >= 0; i--) if (sim.time > sim.smokes[i].end) sim.smokes.splice(i, 1);
  // fire damage
  for (let i = sim.fires.length - 1; i >= 0; i--) {
    const f = sim.fires[i];
    if (sim.time > f.end) { sim.fires.splice(i, 1); sim.clearFires(); for (const o of sim.fires) sim.markFire(o.pos, o.r, o.end - sim.time); continue; }
    for (const v of sim.actors) {
      if (!v.alive) continue;
      if (Math.hypot(v.pos.x - f.pos.x, v.pos.z - f.pos.z) > f.r || Math.abs(v.pos.y - f.pos.y) > 1.6) continue;
      const owner = sim.actors[f.owner];
      if (owner && !sim.isEnemy(owner, v)) continue;
      v.fireAcc += GRENADE.fireDps * dt;
      if (v.fireAcc >= 6) {
        const dmg = Math.floor(v.fireAcc); v.fireAcc -= dmg;
        applyDamage(sim, v, owner ?? null, { health: dmg, armor: 0 }, 'fire', false, false, null);
      }
    }
  }
}

/** True when smoke sits between two points. */
export function smokeBlocks(sim: Sim, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  if (sim.smokes.length === 0) return false;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const ux = dx / len, uy = dy / len, uz = dz / len;
  for (const s of sim.smokes) {
    const age = sim.time - s.start;
    const grow = Math.min(1, 0.35 + 0.65 * (age / 1.0));
    const fade = s.end - sim.time < 2 ? Math.max(0, (s.end - sim.time) / 2) : 1;
    const r = s.r * grow * (fade < 1 ? 0.5 + 0.5 * fade : 1);
    if (fade <= 0.05) continue;
    const cy = s.pos.y + 1.4;
    const ex = s.pos.x - ax, ey = cy - ay, ez = s.pos.z - az;
    const along = ex * ux + ey * uy + ez * uz;
    const px = ex - along * ux, py = ey - along * uy, pz = ez - along * uz;
    const d2 = px * px + py * py + pz * pz;
    if (d2 >= r * r) continue;
    const half = Math.sqrt(r * r - d2);
    const t0 = Math.max(0, along - half), t1 = Math.min(len, along + half);
    if (t1 - t0 > 0.9) return true;
  }
  return false;
}

/** Finds a throw that lands near the target. Returns view angles and power, or null if nothing gets close.
 *  Candidate angles come from the closed form ballistic solution and are then checked against the real bouncing physics. */
export function solveThrow(sim: Sim, from: Vec3, vel: Vec3, kind: GrenadeKind, target: Vec3, maxMiss = 3): { yaw: number; pitch: number; power: number; miss: number } | null {
  const baseYaw = Math.atan2(-(target.x - from.x), -(target.z - from.z));
  const d = Math.hypot(target.x - from.x, target.z - from.z);
  const h = target.y - from.y;
  const g = GRENADE.gravity;
  let best: { yaw: number; pitch: number; power: number; miss: number } | null = null;
  const tmp = { pos: v3(), vel: v3(), rest: 0, bounces: 0 };
  const limit = DETONATE[kind];
  for (const power of [1, 0.7, 0.32]) {
    const v = GRENADE.throwSpeed * power;
    const bias = power > 0.9 ? 0.1 : 0.05;
    const disc = v * v * v * v - g * (g * d * d + 2 * h * v * v);
    const cands: number[] = [];
    if (disc >= 0 && d > 0.5) {
      const sq = Math.sqrt(disc);
      for (const sg of [-1, 1]) {
        const p = Math.atan((v * v + sg * sq) / (g * d)) - bias;
        if (p > -0.4 && p < 1.2) cands.push(p - 0.06, p, p + 0.06);
      }
    }
    // long throws rely on bouncing and rolling, so also try a coarse sweep at full power
    if (power === 1) for (const p of [-0.05, 0.15, 0.35, 0.55, 0.75, 0.95]) cands.push(p);
    for (const pitch of cands) {
      const f = forwardOf(baseYaw, pitch + bias);
      tmp.pos.x = from.x + f.x * 0.35; tmp.pos.y = from.y - 0.1 + f.y * 0.35; tmp.pos.z = from.z + f.z * 0.35;
      tmp.vel.x = f.x * v + vel.x * 0.45; tmp.vel.y = f.y * v + vel.y * 0.3; tmp.vel.z = f.z * v + vel.z * 0.45;
      tmp.rest = 0; tmp.bounces = 0;
      let landed: Vec3 | null = null;
      for (let t = 0; t < limit; t += 1 / 32) {
        const r = stepBody(sim.world, tmp, 1 / 32);
        if (kind === 'fire' && r.floor && r.bounced) { landed = { ...tmp.pos }; break; }
        if (kind === 'smoke' && tmp.rest > 0.25 && t > 0.9) { landed = { ...tmp.pos }; break; }
        if (tmp.pos.y < -2) break;
      }
      if (!landed) landed = { ...tmp.pos };
      const miss = kind === 'flash' ? Math.hypot(landed.x - target.x, landed.z - target.z) + Math.abs(landed.y - target.y) * 0.4 : Math.hypot(landed.x - target.x, landed.z - target.z);
      if (!best || miss < best.miss) best = { yaw: baseYaw, pitch, power, miss };
    }
  }
  return best && best.miss <= maxMiss ? best : null;
}
