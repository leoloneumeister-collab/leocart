/**
 * Bot brain. Bots use exactly the same movement, weapons and recoil as the human: they only produce a Cmd each tick.
 * No wallhacks: bots see through the same line of sight function (walls and smoke) and hear the same noise events.
 */
import { BOT_LEVELS, MOVE, TEAM_BREACHER, type Team } from './constants.ts';
import { DEG, angleDiff, clamp, dist2, forwardOf, v3, yawPitchTo, type Vec3 } from './math.ts';
import { cellPos, type Route } from './map.ts';
import { eyePos, hullHeight, type Actor } from './actor.ts';
import { cycleTime, type GrenadeKind } from './weapons.ts';
import { solveThrow } from './grenades.ts';
import { selectSlot } from './combat.ts';
import type { Sim } from './sim.ts';

export type Intent =
  | { k: 'idle' }
  | { k: 'goto'; pos: Vec3; walk?: boolean; arrive?: number }
  | { k: 'route'; route: Route; i: number; wait: number }
  | { k: 'hold'; pos: Vec3; look: Vec3; crouch: boolean; label: string }
  | { k: 'plant'; site: 'A' | 'B'; pos: Vec3 }
  | { k: 'retake'; site: 'A' | 'B'; stage: Vec3; exec: boolean; defuser: boolean; look: Vec3 }
  | { k: 'defuse' }
  | { k: 'save'; pos: Vec3 }
  | { k: 'pickBomb' }
  | { k: 'roam' };

export interface Seen { id: number; pos: Vec3; time: number; vis: boolean; firstSeen: number; lastVis: number }

export interface ThrowJob { kind: GrenadeKind; target: Vec3; state: 'equip' | 'aim' | 'hold' | 'wait'; t0: number; sol: { yaw: number; pitch: number; power: number } | null; started: number }

export interface UtilJob { kind: GrenadeKind; target: Vec3; atIdx: number; done: boolean }

type Level = (typeof BOT_LEVELS)[number];

export class Brain {
  sim: Sim;
  a: Actor;
  skill: Level;
  intent: Intent = { k: 'idle' };
  jobs: UtilJob[] = [];
  throwJob: ThrowJob | null = null;
  // navigation
  path: Vec3[] = [];
  pathI = 0;
  pathGoal: Vec3 = v3();
  repathAt = 0;
  lastPos: Vec3 = v3();
  stuckT = 0;
  stuckCheck = 0;
  unstickUntil = 0;
  unstickDir = 1;
  stuckEvents = 0;
  maxStuck = 0;
  // perception
  seen = new Map<number, Seen>();
  target = -1;
  suspect: Vec3 | null = null;
  suspectUntil = 0;
  lastKnown: Vec3 | null = null;
  lostAt = 0;
  noiseSeen = 0;
  nextPerceive = 0;
  // aim
  aimYaw = 0;
  aimPitch = 0;
  aimHead = false;
  aimRerollAt = 0;
  noiseX = 0;
  noiseY = 0;
  noiseAt = 0;
  // firing
  burstLeft = 0;
  pauseUntil = 0;
  nextTap = 0;
  lastAmmo = 0;
  strafeDir = 1;
  strafeUntil = 0;
  scopeToggleAt = 0;
  // misc
  buyAt = 0;
  bought = false;
  holdSweepAt = 0;
  holdSweep = 0;
  waitUntil = 0;
  radioAt = 0;
  carrierDelay = 0;
  /** sim time before which a bot waits at its staging point instead of entering the site */
  execAt = 0;
  reactAt = 0;
  engagedSince = 0;
  lookAt: Vec3 | null = null;

  constructor(sim: Sim, a: Actor) {
    this.sim = sim;
    this.a = a;
    this.skill = BOT_LEVELS[sim.cfg.difficulty];
  }

  reset() {
    this.intent = { k: 'idle' }; this.jobs = []; this.throwJob = null; this.path = []; this.pathI = 0;
    this.seen.clear(); this.target = -1; this.suspect = null; this.lastKnown = null; this.stuckT = 0;
    this.burstLeft = 0; this.bought = false; this.buyAt = this.sim.time + 0.4 + this.sim.rng.next() * 2.6;
    this.noiseSeen = this.sim.time; this.waitUntil = 0; this.unstickUntil = 0;
    this.aimYaw = this.a.cmd.yaw; this.aimPitch = 0;
    this.lastPos = { ...this.a.pos }; this.holdSweep = 0;
    this.lookAt = null; this.execAt = 0; this.reactAt = this.sim.time + 6;
    this.nextPerceive = this.sim.time + (this.a.id % 10) * 0.012;
  }

  setIntent(i: Intent) { this.intent = i; this.path = []; this.pathI = 0; this.waitUntil = 0; }

  // ============================================================== the tick

  think() {
    const sim = this.sim, a = this.a, cmd = a.cmd, now = sim.time;
    cmd.fwd = 0; cmd.side = 0; cmd.fire = false; cmd.alt = false; cmd.jump = false; cmd.use = false; cmd.crouch = false; cmd.walk = false; cmd.reload = false;
    const ph = sim.m.phase;
    if (ph === 'freeze') { this.freezeThink(); this.applyAim(); return; }
    if (ph === 'over' || ph === 'halftime') return;

    if (now >= this.nextPerceive) { this.perceive(); this.nextPerceive = now + 0.1 + ((a.id * 7) % 5) * 0.003; }
    const blind = a.flashFull > now;
    const flashed = a.flashEnd > now;
    // shot from somewhere unseen: turn toward it and expect an enemy there
    if (now - a.hurtTime < 0.12 && this.target < 0 && !flashed) {
      const ang = a.hurtDir;
      this.suspect = v3(a.pos.x - Math.sin(ang) * 14, 0, a.pos.z - Math.cos(ang) * 14);
      this.suspectUntil = now + 3;
      this.aimYaw = ang; this.aimPitch = 0;
      this.lastKnown = { ...this.suspect }; this.lostAt = now;
    }

    // ---- blind: look away, stop, maybe spray blindly
    if (blind) {
      cmd.fwd = 0; this.brake();
      this.aimYaw = cmd.yaw + (a.id % 2 ? 1 : -1) * 0.02;
      if (this.lastKnown && sim.rng.next() < this.skill.blindFire * 0.04 && a.cur !== 'grenade') { cmd.fire = true; }
      this.applyAim();
      return;
    }

    // ---- grenade job takes over
    if (this.throwJob) { this.doThrow(); this.applyAim(); this.manageWeapon(false); return; }

    // ---- fight
    const tgt = flashed ? null : this.pickTarget();
    const defusingNearlyDone = a.defusing > 0 && a.defusing / (a.kit ? 5 : 10) > 0.6;
    const plantingNearlyDone = a.planting > 1.6;
    // a carrier at the spot plants unless the enemy is close, a defuser keeps going if the threat is far
    const far = tgt ? dist2(tgt.pos, a.pos) > 15 : true;
    // the carrier runs for the plant spot instead of duelling at range, teammates cover
    const carrierRun = this.intent.k === 'plant' && a.hasBomb && !!tgt && dist2(tgt.pos, a.pos) > 20;
    const commitPlant = this.intent.k === 'plant' && a.hasBomb && dist2(a.pos, this.intent.pos) < 2.2 && (far || (!!tgt && dist2(tgt.pos, a.pos) > 11));
    const commitDefuse = this.intent.k === 'defuse' && sim.bomb.state === 'planted' && dist2(a.pos, sim.bomb.pos) < 2.0 && far;
    if (tgt && !defusingNearlyDone && !plantingNearlyDone && !commitPlant && !commitDefuse && !carrierRun) {
      this.fight(tgt);
      this.applyAim();
      this.manageWeapon(true);
      return;
    }
    this.target = -1;

    // ---- objectives and movement
    this.reactiveThrow();
    this.runIntent();
    this.manageWeapon(false);
    this.applyAim();
    this.checkStuck();
  }

  // ============================================================== freeze time

  private freezeThink() {
    const sim = this.sim, a = this.a;
    if (!this.bought && sim.time >= this.buyAt) {
      this.bought = true;
      sim.ai[a.team].botBuy(a);
    }
    // face the likely action
    if (!this.lookAt) {
      const lp = sim.ai[a.team].spawnLook(a);
      this.lookAt = lp;
    }
    const e = eyePos(a);
    const yp = yawPitchTo(e, this.lookAt);
    this.aimYaw = yp.yaw; this.aimPitch = 0;
  }

  // ============================================================== perception

  private perceive() {
    const sim = this.sim, a = this.a, now = sim.time;
    const flashed = a.flashEnd > now;
    const eye = eyePos(a);
    const fwd = forwardOf(a.cmd.yaw, 0);
    for (const e of sim.actors) {
      if (!e.alive || !sim.isEnemy(a, e)) { continue; }
      const prev = this.seen.get(e.id);
      let visible = false;
      let chest: Vec3 | null = null;
      if (!flashed) {
        const sy = hullHeight(e) / MOVE.heightStand;
        const dx = e.pos.x - eye.x, dz = e.pos.z - eye.z;
        const d = Math.hypot(dx, dz);
        if (d < 120) {
          const cosA = (dx * fwd.x + dz * fwd.z) / Math.max(d, 1e-6);
          const inView = cosA > Math.cos(100 * DEG) || d < 4;
          if (inView) {
            const pts = [1.62 * sy, 1.15 * sy, 0.35];
            for (const py of pts) {
              if (sim.visible(eye.x, eye.y, eye.z, e.pos.x, e.pos.y + py, e.pos.z)) { visible = true; chest = v3(e.pos.x, e.pos.y + 1.15 * sy, e.pos.z); break; }
            }
          }
        }
      }
      if (visible && chest) {
        const fresh = !prev || now - prev.lastVis > 0.3;
        // being shot at or an alert team makes recognition faster
        let first = fresh ? now : prev!.firstSeen;
        if (fresh && now - a.hurtTime < 1.2) first -= this.skill.reaction * 0.6;
        else if (fresh && this.suspect && dist2(this.suspect, e.pos) < 14 && now < this.suspectUntil) first -= this.skill.reaction * 0.4;
        this.seen.set(e.id, { id: e.id, pos: chest, time: now, vis: true, firstSeen: first, lastVis: now });
        sim.ai[a.team].report(e, chest, a);
      } else if (prev) {
        prev.vis = false;
      }
    }
    // hearing
    for (let i = sim.noises.length - 1; i >= 0; i--) {
      const n = sim.noises[i];
      if (n.time <= this.noiseSeen) break;
      if (n.id === a.id || (sim.cfg.mode === 'comp' && n.team === a.team)) continue;
      const d = Math.hypot(n.pos.x - a.pos.x, n.pos.z - a.pos.z);
      let r = n.radius * this.skill.hearing;
      if (d > r * 0.5 && !sim.world.los(eye.x, eye.y, eye.z, n.pos.x, n.pos.y + 1, n.pos.z)) r *= 0.6;
      if (d <= r && n.kind !== 'reload') {
        this.suspect = { ...n.pos }; this.suspectUntil = now + 4;
        if (n.kind === 'shot' || n.kind === 'plant' || n.kind === 'defuse') sim.ai[a.team].heard(n.pos, n.kind, a);
      }
    }
    this.noiseSeen = now;
    // teammates' reports
    const rep = sim.ai[a.team].freshReport(a);
    if (rep && !this.suspect) { this.suspect = rep; this.suspectUntil = now + 3; }
  }

  private pickTarget(): Actor | null {
    const now = this.sim.time;
    let best: Actor | null = null, bestD = 1e9;
    for (const s of this.seen.values()) {
      if (!s.vis || now - s.lastVis > 0.3) continue;
      const e = this.sim.actors[s.id];
      if (!e.alive) continue;
      const d = dist2(e.pos, this.a.pos) + (s.id === this.target ? -4 : 0);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      if (this.target !== best.id) { this.target = best.id; this.engagedSince = now; }
      this.lastKnown = { ...best.pos };
      this.lostAt = now;
    }
    return best;
  }

  // ============================================================== fight

  private fight(tgt: Actor) {
    const sim = this.sim, a = this.a, cmd = a.cmd, now = sim.time, sk = this.skill;
    const ws = a.cur === 'primary' ? a.primary : a.cur === 'secondary' ? a.secondary : null;
    const def = ws?.def ?? null;
    const eye = eyePos(a);
    const seen = this.seen.get(tgt.id)!;
    const sy = hullHeight(tgt) / MOVE.heightStand;
    const dist = Math.hypot(tgt.pos.x - a.pos.x, tgt.pos.y - a.pos.y, tgt.pos.z - a.pos.z);

    if (now >= this.aimRerollAt) {
      this.aimHead = sim.rng.next() < sk.headBias;
      this.aimRerollAt = now + 0.7 + sim.rng.next() * 0.6;
    }
    if (now >= this.noiseAt) {
      this.noiseX = sim.rng.gauss() * sk.aimErr * 0.8;
      this.noiseY = sim.rng.gauss() * sk.aimErr * 0.5;
      this.noiseAt = now + 0.22;
    }
    const aimPoint = v3(tgt.pos.x, tgt.pos.y + (this.aimHead ? 1.64 : 1.2) * sy, tgt.pos.z);
    const ideal = yawPitchTo(eye, aimPoint);
    // recoil compensation
    const control = sk.sprayControl;
    this.aimYaw = ideal.yaw + this.noiseX * DEG + a.punchY * DEG * control;
    this.aimPitch = ideal.pitch + this.noiseY * DEG - a.punchP * DEG * control;

    if (!def) {
      // grenade or bomb or knife in hand: switch to a gun
      return;
    }

    // current bullet direction versus the ideal aim
    const bulletYaw = cmd.yaw - a.punchY * DEG, bulletPitch = a.cmd.pitch + a.punchP * DEG;
    const errYaw = Math.abs(angleDiff(bulletYaw, ideal.yaw)) * Math.cos(ideal.pitch);
    const errPitch = Math.abs(bulletPitch - ideal.pitch);
    const err = Math.hypot(errYaw, errPitch);
    const tol = Math.atan(0.26 / Math.max(dist, 1.5)) + 0.25 * DEG;

    const speed = Math.hypot(a.vel.x, a.vel.z);
    const accurateSpeed = def.speed * MOVE.crouchFrac * 1.1;
    const close = dist < 7;
    const reactionOk = now - seen.firstSeen >= sk.reaction;

    // sniper scope
    if (def.scope.length) {
      if (dist > 14 && a.scope === 0 && now >= this.scopeToggleAt) { cmd.alt = true; this.scopeToggleAt = now + 0.5; }
      if (dist <= 14 && a.scope > 0 && now >= this.scopeToggleAt) { cmd.alt = true; this.scopeToggleAt = now + 0.5; }
    }

    // movement: stop to shoot unless close
    let canFire = reactionOk && err < tol * (def.cls === 'smg' || close ? 1.8 : 1.15);
    const disciplined = sim.rng.next() < sk.stopDisc || this.engagedSince === now;
    if (!close && def.cls !== 'knife') {
      if (speed > accurateSpeed) {
        this.brake();
        if (disciplined) canFire = false;
      } else if (def.cls === 'sniper' && dist > 25 && a.scope === 0) canFire = false;
    } else if (close) {
      // strafe while spraying at close range
      if (now >= this.strafeUntil) { this.strafeDir = sim.rng.next() < 0.5 ? -1 : 1; this.strafeUntil = now + 0.35 + sim.rng.next() * 0.5; }
      cmd.side = this.strafeDir;
    }
    if (a.scope > 0 && def.scope.length && err > tol * 3) canFire = false;
    if (!reactionOk) {
      // use the reaction time to side step a little
      if (now >= this.strafeUntil) { this.strafeDir = sim.rng.next() < 0.5 ? -1 : 1; this.strafeUntil = now + 0.3 + sim.rng.next() * 0.4; }
      if (!close && speed <= accurateSpeed) cmd.side = 0;
    }
    // shotgun and knife want to be close
    if (def.cls === 'shotgun' && dist > 8) this.steer(tgt.pos, 1, false);

    if (!canFire || !ws) return;
    if (a.reloadEnd > 0) return;
    if (ws.ammo <= 0) { cmd.reload = true; return; }
    // fire discipline
    if (def.cls === 'rifle' || def.cls === 'smg') {
      if (now < this.pauseUntil) return;
      if (this.burstLeft <= 0) {
        this.burstLeft = dist < 10 ? 12 + Math.floor(sim.rng.next() * 8) : dist < 28 ? 4 + Math.floor(sim.rng.next() * 3) : 2 + Math.floor(sim.rng.next() * 2);
        if (this.lastAmmo === 0) this.lastAmmo = ws.ammo;
      }
      cmd.fire = true;
      if (ws.ammo < this.lastAmmo) {
        const shots = this.lastAmmo - ws.ammo;
        this.burstLeft -= shots;
        if (this.burstLeft <= 0) this.pauseUntil = now + (dist < 10 ? 0.1 : dist < 28 ? 0.28 : 0.4) + sim.rng.next() * 0.12;
      }
      this.lastAmmo = ws.ammo;
    } else {
      if (now >= this.nextTap) {
        cmd.fire = true;
        this.nextTap = now + Math.max(cycleTime(def), 0.14) + 0.04 + sim.rng.next() * 0.16 * (1.2 - sk.stopDisc * 0.4);
      }
    }
  }

  private cmdCrouchMaybe() { if (this.a.id % 3 === 0) this.a.cmd.crouch = true; }

  /** Throw a grenade at where an enemy was last known, a hold-the-angle habit of decent players. */
  private reactiveThrow() {
    const sim = this.sim, a = this.a, now = sim.time;
    if (now < this.reactAt || this.throwJob) return;
    this.reactAt = now + 2 + sim.rng.next() * 3;
    if (!this.lastKnown || now - this.lostAt > 4 || now - this.lostAt < 0.4) return;
    if (sim.rng.next() > this.skill.util * 0.55) return;
    const d = dist2(a.pos, this.lastKnown);
    if (d < 9 || d > 34) return;
    const pick: GrenadeKind | null = a.grenades.he > 0 ? 'he' : a.grenades.fire > 0 ? 'fire' : a.grenades.flash > 0 && a.team === TEAM_BREACHER ? 'flash' : null;
    if (!pick) return;
    this.startThrow(pick, cellPosGround(sim, v3(this.lastKnown.x, 0, this.lastKnown.z)));
  }

  /** Stop commanding movement entirely, used when a bot has arrived. */
  private cmdStop() { const c = this.a.cmd; c.fwd = 0; c.side = 0; }

  /** Counter strafe: push against the current velocity. */
  private brake() {
    const a = this.a, cmd = a.cmd;
    const y = cmd.yaw;
    const vf = -a.vel.x * Math.sin(y) - a.vel.z * Math.cos(y);
    const vs = a.vel.x * Math.cos(y) - a.vel.z * Math.sin(y);
    const m = Math.hypot(vf, vs);
    if (m < 0.25) return;
    cmd.fwd = clamp(-vf / 3, -1, 1);
    cmd.side = clamp(-vs / 3, -1, 1);
  }

  // ============================================================== weapons

  private manageWeapon(inFight: boolean) {
    const sim = this.sim, a = this.a, cmd = a.cmd;
    if (this.throwJob || a.planting > 0 || a.defusing > 0) return;
    if (a.cur === 'bomb' && a.planting === 0) cmd.select = a.primary ? 'primary' : 'secondary';
    const ws = a.cur === 'primary' ? a.primary : a.cur === 'secondary' ? a.secondary : null;
    if (a.cur === 'grenade' || a.cur === 'knife') {
      if (a.pinPulled === 0 && sim.time >= a.drawEnd) cmd.select = a.primary ? 'primary' : a.secondary ? 'secondary' : 'knife';
      return;
    }
    if (ws) {
      if (ws.ammo === 0 && ws.reserve === 0) {
        if (a.cur === 'primary' && a.secondary && (a.secondary.ammo > 0 || a.secondary.reserve > 0)) cmd.select = 'secondary';
        else if (a.cur === 'secondary' && !a.primary) cmd.select = 'knife';
      } else if (inFight && ws.ammo === 0 && a.cur === 'primary' && a.secondary && a.secondary.ammo > 0 && sim.time - a.hurtTime < 3) {
        cmd.select = 'secondary';
      } else if (!inFight && ws.ammo < ws.def.mag * 0.5 && ws.reserve > 0 && a.reloadEnd === 0) {
        cmd.reload = true;
      }
    } else if (a.primary) cmd.select = 'primary';
    else if (a.secondary) cmd.select = 'secondary';
    // prefer the primary when out of a fight
    if (!inFight && a.cur === 'secondary' && a.primary && (a.primary.ammo > 0 || a.primary.reserve > 0)) cmd.select = 'primary';
  }

  // ============================================================== grenades

  startThrow(kind: GrenadeKind, target: Vec3): boolean {
    const a = this.a;
    if (a.grenades[kind] <= 0 || this.throwJob) return false;
    this.throwJob = { kind, target, state: 'equip', t0: this.sim.time, sol: null, started: this.sim.time };
    return true;
  }

  private doThrow() {
    const sim = this.sim, a = this.a, cmd = a.cmd, now = sim.time;
    const j = this.throwJob!;
    // abort when an enemy is in the face, or it takes too long
    if (a.grenades[j.kind] <= 0 || now - j.started > 6 || (this.pickTarget() && dist2(sim.actors[this.target].pos, a.pos) < 14 && j.state !== 'hold')) {
      this.throwJob = null;
      return;
    }
    this.brake();
    const eye = eyePos(a);
    if (j.state === 'equip') {
      if (a.cur !== 'grenade') { cmd.select = 'grenade'; return; }
      if (a.grenadeSel !== j.kind) { if (now - j.t0 > 0.12) { cmd.nextGrenade = true; j.t0 = now; } return; }
      j.sol = solveThrow(sim, eye, a.vel, j.kind, j.target, 4.5);
      if (!j.sol) { this.throwJob = null; return; }
      j.state = 'aim'; j.t0 = now;
    }
    if (j.state === 'aim' && j.sol) {
      this.aimYaw = j.sol.yaw; this.aimPitch = j.sol.pitch;
      const err = Math.hypot(angleDiff(cmd.yaw, j.sol.yaw), cmd.pitch - j.sol.pitch);
      if (err < 0.012 && now >= a.drawEnd && Math.hypot(a.vel.x, a.vel.z) < 0.4) {
        j.state = 'hold'; j.t0 = now;
      } else if (now - j.t0 > 2.5) {
        this.throwJob = null;
      }
      return;
    }
    if (j.state === 'hold' && j.sol) {
      this.aimYaw = j.sol.yaw; this.aimPitch = j.sol.pitch;
      if (now - j.t0 < 0.18) {
        cmd.fire = j.sol.power >= 0.7; cmd.alt = j.sol.power <= 0.7;
        if (j.sol.power === 0.7) { cmd.fire = true; cmd.alt = true; }
      } else {
        j.state = 'wait'; j.t0 = now;
        const txt = j.kind === 'smoke' ? 'Smoke out' : j.kind === 'flash' ? 'Flash out' : j.kind === 'he' ? 'Fire in the hole' : 'Molotov out';
        sim.ai[a.team].say(a, txt);
      }
      return;
    }
    if (j.state === 'wait') {
      if (now - j.t0 > 0.35) { this.throwJob = null; cmd.select = a.primary ? 'primary' : 'secondary'; }
    }
  }

  // ============================================================== intents

  private runIntent() {
    const sim = this.sim, a = this.a, cmd = a.cmd, now = sim.time;
    const it = this.intent;
    switch (it.k) {
      case 'idle': {
        this.faceAround();
        break;
      }
      case 'goto': {
        const d = this.follow(it.pos, !!it.walk);
        if (d < (it.arrive ?? 1.2)) { this.setIntent({ k: 'idle' }); }
        break;
      }
      case 'route': {
        const r = it.route;
        const pt = cellPos(r.points[it.i][0], r.points[it.i][1]);
        // utility jobs fire on arrival at their point
        const job = this.jobs.find((j) => !j.done && j.atIdx <= it.i);
        const jp = job ? cellPos(r.points[Math.min(job.atIdx, r.points.length - 1)][0], r.points[Math.min(job.atIdx, r.points.length - 1)][1]) : null;
        if (job && jp && it.i > 0 && a.grenades[job.kind] > 0 && now >= this.execAt - 1 && dist2(a.pos, jp) < 3.8) {
          if (this.waitUntil === 0) this.waitUntil = now + 0.6 + (a.id % 3) * 0.5;
          if (now >= this.waitUntil) { job.done = true; this.waitUntil = 0; this.startThrow(job.kind, cellPosGround(sim, job.target)); break; }
          this.brake(); this.faceToward(pt);
          break;
        } else if (job && (a.grenades[job.kind] <= 0 || it.i > job.atIdx + 1)) job.done = true;
        // slow plays: wait at the staging point until the team is ready to execute
        const stage = r.stage;
        if (it.i >= stage && now < this.execAt) {
          const holdAt = cellPos(r.points[stage][0], r.points[stage][1]);
          if (it.i === stage) {
            const dd = this.follow(holdAt, false);
            if (dd < 1.3) { this.cmdStop(); this.brake(); this.faceToward(cellPos(r.points[Math.min(stage + 1, r.points.length - 1)][0], r.points[Math.min(stage + 1, r.points.length - 1)][1])); this.cmdCrouchMaybe(); }
            else if (dd < 4) cmd.walk = true;
            break;
          }
        }
        const d = this.follow(pt, false);
        if (d < 2.0) {
          if (it.i + 1 >= r.points.length) this.arriveAtSite(it.route.site);
          else it.i++;
        }
        break;
      }
      case 'plant': {
        const d = this.follow(it.pos, false);
        const enemyNear = this.target >= 0 && dist2(sim.actors[this.target].pos, a.pos) < 15;
        if (d < 1.4 && !enemyNear && a.hasBomb && a.onGround) {
          this.cmdStop(); this.brake();
          cmd.use = true;
        } else if (d < 1.4) { this.cmdStop(); this.brake(); }
        if (!a.hasBomb && sim.bomb.state === 'planted') this.setIntent({ k: 'idle' });
        break;
      }
      case 'hold': {
        const d = this.follow(it.pos, false, it.crouch ? 0.5 : 1.5);
        if (d < 0.6) {
          this.cmdStop();
          this.brake();
          if (it.crouch) cmd.crouch = true;
          this.faceHold(it.look);
        } else if (d < 3 && this.suspect === null) cmd.walk = true;
        break;
      }
      case 'retake': {
        if (!it.exec) {
          const d = this.follow(it.stage, false);
          if (d < 1.2) { this.cmdStop(); this.brake(); this.faceToward(it.look); cmd.crouch = false; }
          else if (d < 6) cmd.walk = true;
        } else if (it.defuser) {
          this.setIntent({ k: 'defuse' });
        } else {
          const d = this.follow(sim.bomb.pos, false);
          if (d < 4) { this.cmdStop(); this.brake(); this.faceToward(sim.bomb.pos); }
        }
        break;
      }
      case 'defuse': {
        if (sim.bomb.state !== 'planted') { this.setIntent({ k: 'idle' }); break; }
        const d = this.follow(sim.bomb.pos, false);
        if (d < 1.3) {
          this.cmdStop(); this.brake();
          cmd.use = true;
        }
        break;
      }
      case 'save': {
        const d = this.follow(it.pos, false);
        if (d < 1.2) { this.cmdStop(); this.brake(); this.faceAround(); }
        break;
      }
      case 'pickBomb': {
        if (sim.bomb.state !== 'dropped') { this.setIntent({ k: 'idle' }); break; }
        const d = this.follow(sim.bomb.pos, false);
        if (d < 0.9 && a.hasBomb) this.setIntent({ k: 'idle' });
        break;
      }
      case 'roam': {
        if (this.path.length === 0 || this.pathI >= this.path.length || now > this.repathAt) {
          const n = sim.rng.int(0, sim.nav.size - 1);
          const goal = sim.nav.pos(n);
          const p = sim.nav.path(a.pos, goal);
          this.path = p ?? []; this.pathI = 0; this.pathGoal = goal; this.repathAt = now + 14;
        }
        const d = this.follow(this.pathGoal, false);
        if (d < 1.5) this.path = [];
        break;
      }
    }
    // suspicion: look toward the last noise, slow down
    if (this.suspect && now < this.suspectUntil && (it.k === 'route' || it.k === 'goto' || it.k === 'roam')) {
      if (it.k === 'route' && this.sim.rng.next() < 0.0) cmd.walk = true;
    }
  }

  private arriveAtSite(site: 'A' | 'B') {
    this.sim.ai[this.a.team].onArrive(this.a, site);
  }

  /** Walk the path toward goal. Returns planar distance to the goal. */
  private follow(goal: Vec3, walk: boolean, _arrive = 1): number {
    const sim = this.sim, a = this.a, cmd = a.cmd, now = sim.time;
    const dGoal = dist2(a.pos, goal);
    if (this.unstickUntil > now) {
      cmd.fwd = 0; cmd.side = this.unstickDir; cmd.jump = (a.id + Math.floor(now * 3)) % 4 === 0;
      return dGoal;
    }
    if (this.path.length === 0 || dist2(this.pathGoal, goal) > 1.5 || now > this.repathAt) {
      if (dGoal >= 1.8 && sim.pathBudget <= 0) {
        // out of planning budget this tick: head straight for the goal and plan next tick
        if (this.path.length === 0) { this.path = [goal]; this.pathI = 0; this.pathGoal = { ...goal }; }
        this.repathAt = now;
        this.steer(this.path[Math.min(this.pathI, this.path.length - 1)], 1, walk);
        return dGoal;
      }
      if (dGoal >= 1.8) sim.pathBudget--;
      const p = dGoal < 1.8 ? [goal] : sim.nav.path(a.pos, goal);
      this.path = p ?? [goal];
      this.pathI = 0;
      this.pathGoal = { ...goal };
      this.repathAt = now + 3.5 + sim.rng.next() * 2;
    }
    while (this.pathI < this.path.length - 1 && dist2(a.pos, this.path[this.pathI]) < 0.75) this.pathI++;
    const wp = this.path[Math.min(this.pathI, this.path.length - 1)];
    if (dGoal > 0.45) this.steer(wp, 1, walk);
    this.faceTravel(wp);
    return dGoal;
  }

  private steer(t: Vec3, mag: number, walk: boolean) {
    const a = this.a, cmd = a.cmd;
    const dx = t.x - a.pos.x, dz = t.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return;
    const y = cmd.yaw;
    cmd.fwd = (-dx * Math.sin(y) - dz * Math.cos(y)) / d * mag;
    cmd.side = (dx * Math.cos(y) - dz * Math.sin(y)) / d * mag;
    if (walk) cmd.walk = true;
  }

  // ---- looking

  private faceTravel(wp: Vec3) {
    const a = this.a;
    const now = this.sim.time;
    if (this.suspect && now < this.suspectUntil && dist2(this.suspect, a.pos) > 3) {
      const yp = yawPitchTo(eyePos(a), v3(this.suspect.x, a.pos.y + 1.4, this.suspect.z));
      this.aimYaw = yp.yaw; this.aimPitch = 0;
      return;
    }
    const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z;
    if (Math.hypot(dx, dz) > 0.3) { this.aimYaw = Math.atan2(-dx, -dz); this.aimPitch = 0; }
  }

  private faceToward(p: Vec3) {
    const yp = yawPitchTo(eyePos(this.a), v3(p.x, this.a.pos.y + 1.4, p.z));
    this.aimYaw = yp.yaw; this.aimPitch = clamp(yp.pitch, -0.3, 0.3);
  }

  private faceHold(look: Vec3) {
    const sim = this.sim, a = this.a, now = sim.time;
    const e = eyePos(a);
    let target = v3(look.x, a.pos.y + 1.5, look.z);
    if (this.suspect && now < this.suspectUntil) target = v3(this.suspect.x, a.pos.y + 1.4, this.suspect.z);
    else if (this.lastKnown && now - this.lostAt < 1.6) target = v3(this.lastKnown.x, a.pos.y + 1.4, this.lastKnown.z);
    const yp = yawPitchTo(e, target);
    if (now >= this.holdSweepAt) { this.holdSweep = (sim.rng.next() - 0.5) * 0.35; this.holdSweepAt = now + 1.2 + sim.rng.next() * 1.8; }
    this.aimYaw = yp.yaw + this.holdSweep; this.aimPitch = clamp(yp.pitch, -0.2, 0.2);
  }

  private faceAround() {
    const now = this.sim.time;
    if (now >= this.holdSweepAt) { this.holdSweep = (this.sim.rng.next() - 0.5) * 4; this.holdSweepAt = now + 1.5 + this.sim.rng.next() * 2; }
    if (this.suspect && now < this.suspectUntil) {
      const yp = yawPitchTo(eyePos(this.a), v3(this.suspect.x, this.a.pos.y + 1.4, this.suspect.z));
      this.aimYaw = yp.yaw; this.aimPitch = 0;
    } else this.aimYaw = this.a.cmd.yaw + (this.holdSweep > 0 ? 0.004 : -0.004) * Math.abs(this.holdSweep) * 0.2;
  }

  /** Turn toward the desired angles at the skill's turn rate. */
  private applyAim() {
    const cmd = this.a.cmd;
    const dt = 1 / 64;
    const maxStep = this.skill.turn * DEG * dt * (this.target >= 0 ? 1.15 : 0.55);
    const dy = angleDiff(cmd.yaw, this.aimYaw);
    const dp = this.aimPitch - cmd.pitch;
    const k = 1 - Math.exp(-(this.target >= 0 ? 18 : 6) * dt);
    cmd.yaw += clamp(dy * k, -maxStep, maxStep);
    cmd.pitch += clamp(dp * k, -maxStep, maxStep);
    cmd.pitch = clamp(cmd.pitch, -1.2, 1.2);
  }

  // ============================================================== stuck handling

  private checkStuck() {
    const sim = this.sim, a = this.a, now = sim.time, cmd = a.cmd;
    if (now < this.stuckCheck) return;
    this.stuckCheck = now + 0.5;
    const wantsMove = Math.abs(cmd.fwd) + Math.abs(cmd.side) > 0.3 && !cmd.use && a.planting === 0;
    const moved = dist2(a.pos, this.lastPos);
    this.lastPos = { ...a.pos };
    if (wantsMove && moved < 0.25 && this.unstickUntil < now) {
      this.stuckT += 0.5;
      this.maxStuck = Math.max(this.maxStuck, this.stuckT);
      if (this.stuckT >= 1.0) {
        this.unstickUntil = now + 0.5; this.unstickDir = sim.rng.next() < 0.5 ? -1 : 1; this.repathAt = 0; this.path = [];
        this.stuckEvents++;
      }
    } else if (moved >= 0.25) this.stuckT = 0;
  }
}

/** Cell target with the floor height of the nav node there. */
export function cellPosGround(sim: Sim, c: Vec3): Vec3;
export function cellPosGround(sim: Sim, c: [number, number]): Vec3;
export function cellPosGround(sim: Sim, c: Vec3 | [number, number]): Vec3 {
  const p = Array.isArray(c) ? cellPos(c[0], c[1]) : c;
  const n = sim.nav.nearest(p.x, p.y, p.z, 3);
  return n >= 0 ? sim.nav.pos(n) : p;
}

export function createBrain(sim: Sim, a: Actor): Brain { return new Brain(sim, a); }
export function thinkBot(_sim: Sim, _a: Actor, b: Brain) { b.think(); }

export type { Team };
export { TEAM_BREACHER };
export { selectSlot };
