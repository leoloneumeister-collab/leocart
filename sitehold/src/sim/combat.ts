import { DEG, clamp, dist3, forwardOf, v3, type Vec3 } from './math.ts';
import { HITBOX_MUL, MOVE, type HitGroup } from './constants.ts';
import { cycleTime, falloff, KNIFE_RANGE, sprayPattern, WEAPONS, type GrenadeKind } from './weapons.ts';
import { currentWeapon, curDef, eyePos, hullHeight, type Actor, type Cmd, type SlotName } from './actor.ts';
import { newHit, penetrable, surfaceOf, type RayHit } from './world.ts';
import type { Sim } from './sim.ts';

// ---------------------------------------------------------------- hitboxes

interface Part { group: HitGroup; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
const PARTS: Part[] = [
  { group: 'chest', x0: -0.27, x1: 0.27, y0: 1.12, y1: 1.5, z0: -0.17, z1: 0.17 },
  { group: 'stomach', x0: -0.25, x1: 0.25, y0: 0.88, y1: 1.12, z0: -0.16, z1: 0.16 },
  { group: 'leg', x0: -0.23, x1: 0.23, y0: 0, y1: 0.88, z0: -0.17, z1: 0.17 },
  { group: 'arm', x0: -0.4, x1: -0.27, y0: 0.92, y1: 1.5, z0: -0.13, z1: 0.13 },
  { group: 'arm', x0: 0.27, x1: 0.4, y0: 0.92, y1: 1.5, z0: -0.13, z1: 0.13 },
];
const HEAD = { cy: 1.68, r: 0.155 };

export interface ActorHit { t: number; group: HitGroup }

/** Ray against one actor's hitboxes. Direction must be normalised. */
export function rayActor(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, a: Actor): ActorHit | null {
  // local frame: lx = right, lz = forward
  const s = Math.sin(a.yaw), c = Math.cos(a.yaw);
  const px = ox - a.pos.x, pz = oz - a.pos.z;
  const olx = px * c - pz * s, olz = -px * s - pz * c;
  const dlx = dx * c - dz * s, dlz = -dx * s - dz * c;
  const oly = oy - a.pos.y;
  const sy = hullHeight(a) / MOVE.heightStand;
  const iy = 1 / sy;
  const o = [olx, oly * iy, olz];
  const d = [dlx, dy * iy, dlz];
  // quick reject with an enclosing box
  let best: ActorHit | null = null;
  // head sphere (scaled in y, so work in the normalised space)
  {
    const cx = 0, cy = HEAD.cy, cz = 0;
    const ex = o[0] - cx, ey = o[1] - cy, ez = o[2] - cz;
    const A = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const B = ex * d[0] + ey * d[1] + ez * d[2];
    const C = ex * ex + ey * ey + ez * ez - HEAD.r * HEAD.r;
    const disc = B * B - A * C;
    if (disc >= 0 && A > 1e-9) {
      const sq = Math.sqrt(disc);
      let t = (-B - sq) / A;
      if (t < 0) t = (-B + sq) / A;
      if (t >= 0 && t <= maxT) best = { t, group: 'head' };
    }
  }
  for (let i = 0; i < PARTS.length; i++) {
    const p = PARTS[i];
    let t0 = 0, t1 = best ? best.t : maxT;
    let ok = true;
    const lo = [p.x0, p.y0, p.z0], hi = [p.x1, p.y1, p.z1];
    for (let k = 0; k < 3 && ok; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) ok = false; } else {
        let ta = (lo[k] - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k];
        if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) ok = false;
      }
    }
    if (ok && (!best || t0 < best.t)) best = { t: t0, group: p.group };
  }
  return best;
}

// ---------------------------------------------------------------- spread

export function currentSpread(a: Actor): number {
  const def = curDef(a);
  if (!def) return 0;
  const sp = Math.hypot(a.vel.x, a.vel.z);
  const accurate = def.speed * MOVE.crouchFrac;
  const frac = clamp((sp - accurate) / (def.speed * (1 - MOVE.crouchFrac)), 0, 1);
  const cm = a.crouching ? def.spread.crouch : 1;
  const scoped = a.scope > 0 && def.scope.length > 0;
  let spread = scoped ? 0 : def.spread.still * cm;
  spread += def.spread.move * frac * cm * (scoped ? 0.7 : 1);
  if (!a.onGround) spread += def.spread.air;
  spread += a.inaccuracy;
  return spread;
}

// ---------------------------------------------------------------- damage

export interface DamageResult { health: number; armor: number }

export function computeDamage(raw: number, group: HitGroup, armorPen: number, victim: Actor): DamageResult {
  let dmg = raw * HITBOX_MUL[group];
  let armorDmg = 0;
  const protectedBone = group === 'head' ? victim.helmet : group !== 'leg';
  if (victim.armor > 0 && protectedBone) {
    const toHealth = dmg * armorPen;
    armorDmg = (dmg - toHealth) * 0.5;
    if (armorDmg > victim.armor) { armorDmg = victim.armor; dmg = dmg - armorDmg * 2; } else dmg = toHealth;
  }
  return { health: Math.max(1, Math.round(dmg)), armor: Math.round(armorDmg) };
}

const _hit = newHit();

/** Applies damage and handles death. Returns true when the victim died. */
export function applyDamage(sim: Sim, victim: Actor, attacker: Actor | null, res: DamageResult, weaponId: string, head: boolean, wallbang: boolean, from: Vec3 | null): boolean {
  if (!victim.alive || victim.spawnProtect > sim.time) return false;
  const health = Math.min(victim.health, res.health);
  victim.health -= res.health;
  victim.armor = Math.max(0, victim.armor - res.armor);
  victim.hurtTime = sim.time;
  if (from) victim.hurtDir = Math.atan2(-(from.x - victim.pos.x), -(from.z - victim.pos.z));
  if (attacker && attacker !== victim) {
    attacker.stats.damage += health;
    attacker.roundDamage += health;
    victim.damagedBy.set(attacker.id, (victim.damagedBy.get(attacker.id) ?? 0) + health);
  }
  sim.emit({ t: 'hurt', id: victim.id, dmg: res.health, from });
  if (victim.health > 0) return false;
  victim.health = 0;
  killActor(sim, victim, attacker, weaponId, head, wallbang);
  return true;
}

export function killActor(sim: Sim, victim: Actor, killer: Actor | null, weaponId: string, head: boolean, wallbang: boolean) {
  if (!victim.alive) return;
  victim.alive = false;
  victim.deathTime = sim.time;
  victim.killedBy = killer ? killer.id : -1;
  victim.stats.deaths++;
  let assist = -1;
  for (const [id, dmg] of victim.damagedBy) {
    if (killer && id === killer.id) continue;
    if (dmg >= 35 && sim.actors[id] && sim.isEnemy(sim.actors[id], victim)) { assist = id; break; }
  }
  if (assist >= 0) { sim.actors[assist].stats.assists++; sim.actors[assist].stats.score += 1; }
  if (killer && killer !== victim) {
    const enemy = sim.isEnemy(killer, victim);
    if (enemy) {
      killer.stats.kills++; killer.roundKills++; killer.stats.score += weaponId === 'knife' ? 3 : 2;
      if (head) killer.stats.headshots++;
      sim.reward(killer, WEAPONS[weaponId]?.killReward ?? 300, 'kill');
    } else {
      killer.stats.kills--; killer.stats.score -= 2;
      sim.reward(killer, -300, 'teamkill');
    }
  }
  sim.emit({ t: 'kill', killer: killer ? killer.id : victim.id, victim: victim.id, weapon: weaponId, head, wallbang, assist, pos: { ...victim.pos } });
  sim.onDeath(victim);
}

// ---------------------------------------------------------------- shooting

const dir = v3();
const eye = v3();

function traceBullet(sim: Sim, a: Actor, def: ReturnType<typeof curDef> & object, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, flat: number) {
  let mul = flat;
  let penLeft = def.penetration >= 2 ? 2 : def.penetration;
  let travelled = 0;
  let cx = ox, cy = oy, cz = oz;
  let wallbang = false;
  let endX = ox + dx * 200, endY = oy + dy * 200, endZ = oz + dz * 200;
  for (let pass = 0; pass < 3; pass++) {
    const remain = 200 - travelled;
    const hitWall = sim.world.raycast(cx, cy, cz, dx, dy, dz, remain, _hit);
    const tWall = hitWall ? _hit.t : remain;
    // nearest enemy body
    let victim: Actor | null = null, vh: ActorHit | null = null;
    for (let i = 0; i < sim.actors.length; i++) {
      const v = sim.actors[i];
      if (!v.alive || v === a || !sim.isEnemy(a, v)) continue;
      // cheap cylinder reject
      const rx = v.pos.x - cx, rz = v.pos.z - cz;
      const along = rx * dx + rz * dz;
      const horiz = Math.hypot(dx, dz);
      if (horiz > 1e-6 && (along < -0.5)) continue;
      const cross = Math.abs(rx * dz - rz * dx) / Math.max(horiz, 1e-6);
      if (cross > 0.7) continue;
      const h = rayActor(cx, cy, cz, dx, dy, dz, tWall, v);
      if (h && (!vh || h.t < vh.t)) { vh = h; victim = v; }
    }
    if (victim && vh) {
      const dist = travelled + vh.t;
      const raw = def.damage * falloff(def, dist) * mul;
      const res = computeDamage(raw, vh.group, def.armorPen, victim);
      const px = cx + dx * vh.t, py = cy + dy * vh.t, pz = cz + dz * vh.t;
      sim.emit({ t: 'impact', pos: v3(px, py, pz), normal: v3(-dx, -dy, -dz), surface: vh.group === 'head' ? 'head' : 'flesh' });
      const armored = victim.armor > 0 && (vh.group === 'head' ? victim.helmet : vh.group !== 'leg');
      sim.emit({ t: 'hit', attacker: a.id, victim: victim.id, dmg: res.health, head: vh.group === 'head', armor: armored, pos: v3(px, py, pz) });
      applyDamage(sim, victim, a, res, def.id, vh.group === 'head', wallbang, a.pos);
      endX = px; endY = py; endZ = pz;
      return { endX, endY, endZ };
    }
    if (!hitWall) break;
    const px = cx + dx * _hit.t, py = cy + dy * _hit.t, pz = cz + dz * _hit.t;
    const box = _hit.box;
    sim.emit({ t: 'impact', pos: v3(px, py, pz), normal: v3(_hit.nx, _hit.ny, _hit.nz), surface: box ? surfaceOf(box.mat) : 'sand' });
    endX = px; endY = py; endZ = pz;
    if (box && penLeft > 0 && penetrable(box.mat) && _hit.exit - _hit.t < 0.55) {
      penLeft--;
      wallbang = true;
      mul *= 0.62;
      const adv = _hit.exit + 0.02;
      travelled += adv;
      cx += dx * adv; cy += dy * adv; cz += dz * adv;
      sim.emit({ t: 'impact', pos: v3(cx, cy, cz), normal: v3(dx, dy, dz), surface: 'wood' });
      continue;
    }
    break;
  }
  return { endX, endY, endZ };
}

/** Fires one shot (or one pellet volley). */
function shoot(sim: Sim, a: Actor) {
  const ws = currentWeapon(a)!;
  const def = ws.def;
  eyePos(a, eye);
  const pat = sprayPattern(def);
  const idx = Math.min(a.shotIndex, pat.length - 1);
  const [pp, py] = [a.punchP, a.punchY];
  const spread = currentSpread(a);
  const n = def.pellets;
  let tx = eye.x, ty = eye.y, tz = eye.z;
  for (let k = 0; k < n; k++) {
    const ang = sim.rng.next() * Math.PI * 2;
    const r = Math.sqrt(sim.rng.next()) * (spread + (n > 1 ? def.spread.still : 0)) * DEG;
    const yaw = a.yaw - py * DEG + Math.cos(ang) * r;
    const pitch = a.pitch + pp * DEG + Math.sin(ang) * r;
    forwardOf(yaw, pitch, dir);
    const end = traceBullet(sim, a, def, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 1);
    tx = end.endX; ty = end.endY; tz = end.endZ;
    if (k === 0 || n > 1) sim.emit({ t: 'tracer', id: a.id, from: v3(eye.x, eye.y, eye.z), to: v3(tx, ty, tz) });
  }
  ws.ammo--;
  sim.emit({ t: 'shot', id: a.id, pos: v3(eye.x, eye.y, eye.z), weapon: def.id });
  sim.noise(a, 'shot', 55);
  // recoil: advance the pattern, add punch for the next bullet
  a.shotIndex++;
  const next = pat[Math.min(a.shotIndex, pat.length - 1)];
  const cur = pat[idx];
  a.punchP += next[0] - cur[0];
  a.punchY += next[1] - cur[1];
  if (n > 1) { a.punchP += def.recoil.pitch * 0.5; }
  a.inaccuracy = Math.min(def.spread.fireMax, a.inaccuracy + def.spread.fire);
  a.lastShot = sim.time;
  if (def.scope.length) a.scope = 0;
}

// ---------------------------------------------------------------- weapon handling per tick

export function giveBestSlot(a: Actor): SlotName {
  return a.primary ? 'primary' : a.secondary ? 'secondary' : 'knife';
}

export function selectSlot(sim: Sim, a: Actor, slot: SlotName) {
  if (slot === a.cur && slot !== 'grenade') return;
  if (slot === 'primary' && !a.primary) return;
  if (slot === 'secondary' && !a.secondary) return;
  if (slot === 'bomb' && !a.hasBomb) return;
  if (slot === 'grenade') {
    const total = a.grenades.flash + a.grenades.smoke + a.grenades.he + a.grenades.fire;
    if (total === 0) return;
    if (a.cur === 'grenade') { cycleGrenade(a); return; }
    if (!a.grenadeSel || a.grenades[a.grenadeSel] <= 0) a.grenadeSel = (['flash', 'smoke', 'he', 'fire'] as GrenadeKind[]).find((k) => a.grenades[k] > 0) ?? null;
  }
  if (a.cur !== slot) a.last = a.cur;
  a.cur = slot;
  a.reloadEnd = 0;
  a.scope = 0;
  a.pinPulled = 0;
  a.shotIndex = 0;
  const d = currentWeapon(a)?.def;
  const draw = d ? d.draw : slot === 'grenade' ? 0.5 : 0.7;
  a.drawEnd = sim.time + draw;
  a.nextAttack = Math.max(a.nextAttack, a.drawEnd);
  sim.emit({ t: 'draw', id: a.id, weapon: d ? d.id : slot });
}

export function cycleGrenade(a: Actor) {
  const order: GrenadeKind[] = ['flash', 'smoke', 'he', 'fire'];
  const start = a.grenadeSel ? order.indexOf(a.grenadeSel) : -1;
  for (let i = 1; i <= 4; i++) {
    const k = order[(start + i + 4) % 4];
    if (a.grenades[k] > 0) { a.grenadeSel = k; return; }
  }
}

export function startReload(sim: Sim, a: Actor) {
  const ws = currentWeapon(a);
  if (!ws || ws.def.cls === 'knife') return;
  if (ws.ammo >= ws.def.mag || ws.reserve <= 0 || a.reloadEnd > 0) return;
  a.reloadEnd = sim.time + ws.def.reload;
  a.scope = 0;
  sim.emit({ t: 'reload', id: a.id, weapon: ws.def.id });
  sim.noise(a, 'reload', 14);
}

const swing = v3();

function knifeAttack(sim: Sim, a: Actor, stab: boolean) {
  eyePos(a, eye);
  forwardOf(a.yaw, a.pitch, swing);
  let victim: Actor | null = null, best = KNIFE_RANGE;
  for (const v of sim.actors) {
    if (!v.alive || v === a || !sim.isEnemy(a, v)) continue;
    const h = rayActor(eye.x, eye.y, eye.z, swing.x, swing.y, swing.z, best, v);
    if (h && h.t < best) { best = h.t; victim = v; }
    else {
      // generous cone for melee
      const dx = v.pos.x - a.pos.x, dz = v.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < KNIFE_RANGE * 0.8 && Math.abs(v.pos.y - a.pos.y) < 1.2 && (dx * swing.x + dz * swing.z) / Math.max(d, 1e-6) > 0.82 && d < best) { best = d; victim = v; }
    }
  }
  sim.emit({ t: 'knife', id: a.id, stab, hit: !!victim });
  if (!victim) return;
  const vf = forwardOf(victim.yaw, 0, v3());
  const back = vf.x * swing.x + vf.z * swing.z > 0.35;
  const raw = back ? (stab ? 195 : 90) : stab ? 65 : 40;
  const res = computeDamage(raw, 'chest', 0.85, victim);
  sim.emit({ t: 'hit', attacker: a.id, victim: victim.id, dmg: res.health, head: false, armor: victim.armor > 0, pos: v3(victim.pos.x, victim.pos.y + 1.2, victim.pos.z) });
  applyDamage(sim, victim, a, res, 'knife', false, false, a.pos);
}

/** Handles select, reload, fire and throw for one actor for one tick. */
export function stepWeapon(sim: Sim, a: Actor, cmd: Cmd, dt: number) {
  const now = sim.time;
  // ---- selection and drops
  if (cmd.select) { selectSlot(sim, a, cmd.select); cmd.select = null; }
  if (cmd.nextGrenade) { cycleGrenade(a); cmd.nextGrenade = false; }
  if (cmd.lastWeapon) { selectSlot(sim, a, a.last); cmd.lastWeapon = false; }
  if (cmd.drop) { sim.dropCurrent(a); cmd.drop = false; }

  // ---- recoil recovery
  const def = curDef(a);
  const idle = def ? now - a.lastShot > Math.max(cycleTime(def) * 1.25, 0.12) : true;
  if (idle) {
    const k = 1 - Math.exp(-9 * dt);
    a.punchP -= a.punchP * k; a.punchY -= a.punchY * k;
    if (Math.abs(a.punchP) < 0.01) a.punchP = 0;
    if (Math.abs(a.punchY) < 0.01) a.punchY = 0;
    if (def) a.inaccuracy = Math.max(0, a.inaccuracy - def.spread.recover * dt);
    if (def && now - a.lastShot > def.recoil.reset) a.shotIndex = 0;
  }

  const ws = currentWeapon(a);

  // ---- reload progress
  if (a.reloadEnd > 0 && ws) {
    if (now >= a.reloadEnd) {
      if (ws.def.cls === 'shotgun') {
        ws.ammo++; ws.reserve--;
        a.reloadEnd = ws.ammo < ws.def.mag && ws.reserve > 0 ? now + ws.def.reload : 0;
      } else {
        const take = Math.min(ws.def.mag - ws.ammo, ws.reserve);
        ws.ammo += take; ws.reserve -= take; a.reloadEnd = 0;
      }
    }
  } else if (a.reloadEnd > 0) a.reloadEnd = 0;
  if (cmd.reload) { startReload(sim, a); cmd.reload = false; }

  // ---- scope toggle
  if (cmd.alt && !a.altHeld && ws && ws.def.scope.length && now >= a.drawEnd) {
    a.scope = (a.scope + 1) % (ws.def.scope.length + 1);
  }

  // ---- fire
  const fireEdge = cmd.fire && !a.attackHeld;
  const altEdge = cmd.alt && !a.altHeld;
  if (a.cur === 'grenade') {
    stepGrenadeThrow(sim, a, cmd);
  } else if (a.cur === 'bomb') {
    // planting is driven by the use key in rules, nothing to do here
  } else if (ws) {
    if (ws.def.cls === 'knife') {
      if (now >= a.nextAttack && (cmd.fire || cmd.alt) && now >= a.drawEnd) {
        const stab = cmd.alt && !cmd.fire;
        knifeAttack(sim, a, stab);
        a.nextAttack = now + (stab ? 1.0 : 0.5);
      }
    } else if (cmd.fire && (ws.def.auto || fireEdge) && now >= a.nextAttack && now >= a.drawEnd) {
      const reloadingShell = ws.def.cls === 'shotgun' && a.reloadEnd > 0 && ws.ammo > 0;
      if (reloadingShell) a.reloadEnd = 0;
      if (a.reloadEnd > 0) { /* busy */ }
      else if (ws.ammo > 0) {
        shoot(sim, a);
        a.nextAttack = now + cycleTime(ws.def);
        if (ws.ammo === 0 && ws.reserve > 0 && ws.def.cls !== 'shotgun') startReload(sim, a);
      } else {
        if (fireEdge) sim.emit({ t: 'dryfire', id: a.id });
        a.nextAttack = now + 0.2;
        startReload(sim, a);
      }
    }
  }
  a.attackHeld = cmd.fire;
  a.altHeld = cmd.alt;
  void altEdge;
}

function stepGrenadeThrow(sim: Sim, a: Actor, cmd: Cmd) {
  const now = sim.time;
  const kind = a.grenadeSel;
  if (!kind || a.grenades[kind] <= 0) { a.pinPulled = 0; return; }
  const down = cmd.fire || cmd.alt;
  if (a.pinPulled === 0) {
    if (down && now >= a.drawEnd && now >= a.throwCooldown) {
      a.pinPulled = now;
      a.pinPower = cmd.fire && cmd.alt ? 0.7 : cmd.alt ? 0.32 : 1;
      sim.emit({ t: 'pin', id: a.id, kind });
    }
    return;
  }
  if (cmd.fire && cmd.alt) a.pinPower = 0.7;
  if (!down) {
    sim.throwGrenade(a, kind, a.pinPower);
    a.pinPulled = 0;
    a.throwCooldown = now + 0.4;
    a.grenades[kind]--;
    if (a.grenades[kind] <= 0) {
      const left = (['flash', 'smoke', 'he', 'fire'] as GrenadeKind[]).find((k) => a.grenades[k] > 0);
      if (left) a.grenadeSel = left;
      else { a.grenadeSel = null; selectSlot(sim, a, giveBestSlot(a)); }
    }
  }
}

export { dist3 };
