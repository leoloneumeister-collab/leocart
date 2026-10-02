import * as THREE from 'three';
import { audio } from '../../engine/audio';
import { angleDiff, clamp, damp, dir2D, lerp, rand } from '../../engine/util';
import { raycastWorld, moveFlat } from '../collision';
import type { GameCtx } from '../types';
import { buildRig, EnemyType, Rig } from './rig';

interface Def {
  hp: number; speed: number; run: number; radius: number; sight: number; head: number; armor: number;
  burstMin: number; burstMax: number; interval: number; pauseMin: number; pauseMax: number;
  dmg: number; acc: number; minRange: number; maxRange: number; react: number; hitHalf: number; hitH: number;
  melee: boolean; name: string; score: number;
}

const DEFS: Record<EnemyType, Def> = {
  grunt:  { name: 'Hostile', hp: 60, speed: 2.2, run: 3.6, radius: 0.36, sight: 55, head: 2, armor: 1, burstMin: 3, burstMax: 5, interval: 0.11, pauseMin: 0.7, pauseMax: 1.5, dmg: 6, acc: 0.6, minRange: 9, maxRange: 26, react: 0.55, hitHalf: 0.3, hitH: 1.55, melee: false, score: 100 },
  rusher: { name: 'Rusher', hp: 45, speed: 3.2, run: 6.4, radius: 0.34, sight: 45, head: 2, armor: 1, burstMin: 0, burstMax: 0, interval: 1, pauseMin: 1, pauseMax: 1, dmg: 13, acc: 1, minRange: 0, maxRange: 2, react: 0.3, hitHalf: 0.28, hitH: 1.5, melee: true, score: 120 },
  heavy:  { name: 'Heavy', hp: 280, speed: 1.6, run: 2.3, radius: 0.5, sight: 60, head: 1.6, armor: 0.62, burstMin: 9, burstMax: 14, interval: 0.075, pauseMin: 1.2, pauseMax: 2.2, dmg: 5.5, acc: 0.42, minRange: 12, maxRange: 30, react: 0.8, hitHalf: 0.42, hitH: 1.9, melee: false, score: 300 },
  boss:   { name: 'VOSS', hp: 1700, speed: 2.4, run: 3.4, radius: 0.5, sight: 90, head: 1.5, armor: 0.8, burstMin: 5, burstMax: 8, interval: 0.085, pauseMin: 0.6, pauseMax: 1.1, dmg: 8, acc: 0.62, minRange: 8, maxRange: 34, react: 0.2, hitHalf: 0.42, hitH: 1.95, melee: false, score: 2000 },
};

const DIFF_HP = [0.7, 0.95, 1.25];
const DIFF_ACC = [0.42, 0.75, 1.1];
const DIFF_DMG = [0.45, 0.8, 1.2];
const DIFF_REACT = [2.2, 1.3, 0.7];

const FLASH = new THREE.MeshBasicMaterial({ color: 0xffffff });
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _d = new THREE.Vector3();

export interface EnemyHit { dist: number; head: boolean }

export class Enemy {
  static nextId = 1;
  id = Enemy.nextId++;
  def: Def;
  rig: Rig;
  pos = new THREE.Vector3();
  yaw = 0;
  hp: number;
  maxHp: number;
  dead = false;
  deadT = 0;
  zone: number;
  aware = false;
  awareness = 0;
  alertDelay = 0;
  sees = false;
  seeTimer = rand(0, 0.2);
  lastSeen = new THREE.Vector3();
  hasLastSeen = false;
  path: THREE.Vector3[] = [];
  pathTimer = rand(0, 0.5);
  strafeDir = Math.random() < 0.5 ? -1 : 1;
  strafeTimer = rand(0.5, 1.5);
  burstLeft = 0;
  fireTimer = 0;
  pauseTimer = 0;
  reactTimer = 0;
  meleeWind = 0;
  meleeCd = 0;
  phase = 0;
  invuln = 0;
  grenadeTimer = 6;
  flinch = 0;
  flash = 0;
  anim = rand(0, 6);
  speedNow = 0;
  aim = 0;
  patrol: THREE.Vector3[] = [];
  patrolIdx = 0;
  patrolWait = 0;
  lookTimer = rand(1, 3);
  lookYaw = 0;
  fallDir = Math.random() < 0.5 ? 1 : -1;
  headshotKill = false;
  deathVel = new THREE.Vector3();
  steerAvoid = 0;
  suppressedBy = 0;

  constructor(public type: EnemyType, x: number, z: number, zone: number, difficulty: 0 | 1 | 2, yaw = 0) {
    this.def = DEFS[type];
    this.rig = buildRig(type);
    this.zone = zone;
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.maxHp = this.hp = Math.round(this.def.hp * DIFF_HP[difficulty]);
    this.rig.root.position.copy(this.pos);
    for (const m of this.rig.meshes) m.userData.m0 = m.material;
  }

  get alive() { return !this.dead; }

  headPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.66 * this.rig.scale, this.pos.z);
  }
  chestPos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.15 * this.rig.scale, this.pos.z);
  }
  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + 1.55 * this.rig.scale, this.pos.z);
  }

  /** Ray vs head sphere and body box. */
  rayHit(o: THREE.Vector3, d: THREE.Vector3, maxT: number): EnemyHit | null {
    if (this.dead) return null;
    const s = this.rig.scale;
    // head sphere
    const hc = this.headPos(_v), hr = 0.2 * s;
    _w.subVectors(hc, o);
    const t0 = _w.dot(d);
    let best = Infinity, head = false;
    if (t0 > 0) {
      const d2 = _w.lengthSq() - t0 * t0;
      if (d2 < hr * hr) { const t = t0 - Math.sqrt(hr * hr - d2); if (t >= 0 && t < maxT) { best = t; head = true; } }
    }
    // body box
    const hw = this.def.hitHalf, hh = this.def.hitH;
    let tmin = 0, tmax = maxT;
    const lo = [this.pos.x - hw, this.pos.y, this.pos.z - hw], hi = [this.pos.x + hw, this.pos.y + hh * 0.93, this.pos.z + hw];
    const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    let ok = true;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < lo[i] || oo[i] > hi[i]) { ok = false; break; } }
      else {
        let t1 = (lo[i] - oo[i]) / dd[i], t2 = (hi[i] - oo[i]) / dd[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin < best - 0.02) { best = tmin; head = false; }
    if (best === Infinity) return null;
    return { dist: best, head };
  }

  takeDamage(amount: number, head: boolean, point: THREE.Vector3, dir: THREE.Vector3, ctx: GameCtx, headMult = 2): boolean {
    if (this.dead) return false;
    if (this.invuln > 0) { audio.click(3200, 0.03, 0.2); ctx.fx.impact(point, dir.clone().negate(), 'metal'); return false; }
    const dmg = amount * (head ? Math.min(headMult, this.def.head * 1.3) : this.def.armor);
    this.hp -= dmg;
    this.flash = 0.06;
    this.flinch = Math.min(1, this.flinch + dmg / (this.type === 'heavy' || this.type === 'boss' ? 160 : 55));
    ctx.fx.blood(point, dir, head ? 12 : 6);
    this.headshotKill = head;
    if (!this.aware) this.becomeAware(ctx, 0.15);
    this.lastSeen.copy(ctx.player.pos); this.hasLastSeen = true;
    if (this.type === 'boss') this.checkPhase(ctx);
    if (this.hp <= 0) { this.die(head, dir, ctx); return true; }
    return false;
  }

  private checkPhase(ctx: GameCtx) {
    const f = this.hp / this.maxHp;
    if (this.phase === 0 && f < 0.66) this.enterPhase(1, ctx);
    else if (this.phase === 1 && f < 0.33) this.enterPhase(2, ctx);
  }
  private enterPhase(p: number, ctx: GameCtx) {
    this.phase = p; this.invuln = 1.6; this.burstLeft = 0; this.pauseTimer = 1.2;
    ctx.bossEvent(p === 1 ? 'phase2' : 'phase3');
    if (p === 1) {
      for (let i = 0; i < 3; i++) {
        const a = rand(0, Math.PI * 2);
        ctx.spawnEnemy('grunt', this.pos.x + Math.cos(a) * 6, this.pos.z + Math.sin(a) * 6, this.zone, true);
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const a = rand(0, Math.PI * 2);
        ctx.spawnEnemy('rusher', this.pos.x + Math.cos(a) * 7, this.pos.z + Math.sin(a) * 7, this.zone, true);
      }
    }
  }

  die(head: boolean, dir: THREE.Vector3, ctx: GameCtx) {
    this.dead = true; this.deadT = 0;
    this.deathVel.copy(dir).setY(0).multiplyScalar(this.type === 'heavy' ? 1.2 : 3.2);
    this.fallDir = dir.dot(_d.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))) > 0 ? -1 : 1;
    ctx.enemyKilled(this, head);
    for (const m of this.rig.meshes) m.material = m.userData.m0;
  }

  becomeAware(ctx: GameCtx, delay = 0.2) {
    if (this.aware) return;
    this.aware = true; this.awareness = 1;
    this.reactTimer = this.def.react * DIFF_REACT[ctx.difficulty] + delay;
    ctx.alertNear(this.pos, 14, 0.6);
  }

  hear(ctx: GameCtx, pos: THREE.Vector3, delay: number) {
    if (this.dead || this.aware) return;
    if (this.alertDelay <= 0) this.alertDelay = delay;
    this.lastSeen.copy(pos); this.hasLastSeen = true;
    void ctx;
  }

  // ------------------------------------------------------------------ update
  update(dt: number, ctx: GameCtx) {
    const r = this.rig;
    if (this.dead) { this.updateDeath(dt); return; }
    this.flinch = damp(this.flinch, 0, 9, dt);
    if (this.flash > 0) {
      this.flash -= dt;
      for (const m of r.meshes) m.material = this.flash > 0 ? FLASH : m.userData.m0;
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.alertDelay > 0) { this.alertDelay -= dt; if (this.alertDelay <= 0) this.becomeAware(ctx, 0.1); }

    const p = ctx.player;
    const toP = _d.set(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z);
    const dist = toP.length();

    // perception
    this.seeTimer -= dt;
    if (this.seeTimer <= 0) {
      this.seeTimer = 0.14 + Math.random() * 0.06;
      this.sees = false;
      if (dist < this.def.sight && p.alive) {
        const fwdx = Math.sin(this.yaw), fwdz = Math.cos(this.yaw);
        const dot = (toP.x * fwdx + toP.z * fwdz) / (dist || 1);
        if (this.aware || dot > 0.25) {
          const eye = this.eyePos(_v), pe = p.eye(_w);
          pe.y -= 0.25;
          this.sees = ctx.hasLOS(eye, pe);
        }
      }
      if (this.sees) { this.lastSeen.copy(p.pos); this.hasLastSeen = true; }
    }
    if (!this.aware) {
      if (this.sees) {
        const rate = (1 / (0.5 + dist / 30)) * (ctx.difficulty === 0 ? 0.7 : ctx.difficulty === 2 ? 1.5 : 1) * (p.crouch > 0.5 ? 0.6 : 1);
        this.awareness += rate * dt;
        if (this.awareness >= 1) this.becomeAware(ctx, 0);
      } else this.awareness = Math.max(0, this.awareness - dt * 0.25);
    }

    this.pathTimer -= dt;
    this.speedNow = 0;
    if (!this.aware) this.idleBehavior(dt, ctx);
    else if (this.reactTimer > 0) { this.reactTimer -= dt; this.faceToward(p.pos, dt, 9); this.aim = damp(this.aim, 1, 8, dt); }
    else if (this.type === 'rusher') this.rusherBehavior(dt, ctx, dist);
    else this.rangedBehavior(dt, ctx, dist);

    // separation from allies
    for (const o of ctx.enemies) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz, min = this.def.radius + o.def.radius;
      if (d2 < min * min && d2 > 1e-4) {
        const dd = Math.sqrt(d2), push = (min - dd) * 0.5;
        moveFlat(this.pos, this.def.radius, (dx / dd) * push, (dz / dd) * push, ctx.level.colliders);
      }
    }
    this.animate(dt, dist, ctx);
  }

  private faceToward(target: THREE.Vector3, dt: number, rate: number) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    this.yaw += angleDiff(this.yaw, want) * Math.min(1, rate * dt);
  }

  private idleBehavior(dt: number, ctx: GameCtx) {
    this.aim = damp(this.aim, 0, 6, dt);
    if (this.patrol.length > 1) {
      if (this.patrolWait > 0) { this.patrolWait -= dt; return; }
      const tgt = this.patrol[this.patrolIdx];
      if (Math.hypot(tgt.x - this.pos.x, tgt.z - this.pos.z) < 0.8) {
        this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; this.patrolWait = rand(1.5, 4); return;
      }
      this.moveTo(tgt, this.def.speed, dt, ctx, true);
    } else {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) { this.lookTimer = rand(2, 5); this.lookYaw = rand(-1.2, 1.2); }
      this.yaw += angleDiff(this.yaw, this.yaw + this.lookYaw) * Math.min(1, 0.6 * dt);
      this.lookYaw *= Math.max(0, 1 - dt * 0.6);
    }
  }

  private moveTo(target: THREE.Vector3, speed: number, dt: number, ctx: GameCtx, face = true) {
    // follow path to target
    const needPath = this.path.length === 0 || this.pathTimer <= 0;
    if (needPath && ctx.pathBudget > 0 && Math.hypot(target.x - this.pos.x, target.z - this.pos.z) > 1.2) {
      ctx.pathBudget--;
      this.path = ctx.level.nav.findPath(this.pos, target);
      this.pathTimer = 0.6 + Math.random() * 0.5;
    }
    let wp = this.path[0];
    while (wp && Math.hypot(wp.x - this.pos.x, wp.z - this.pos.z) < 0.6) { this.path.shift(); wp = this.path[0]; }
    if (!wp) return;
    const dir = dir2D(this.pos, wp, _d);
    const mx = dir.x * speed * dt, mz = dir.z * speed * dt;
    moveFlat(this.pos, this.def.radius, mx, mz, ctx.level.colliders);
    this.speedNow = speed;
    if (face) this.yaw += angleDiff(this.yaw, Math.atan2(dir.x, dir.z)) * Math.min(1, 10 * dt);
  }

  private rangedBehavior(dt: number, ctx: GameCtx, dist: number) {
    const p = ctx.player, d = this.def;
    const boss = this.type === 'boss';
    if (boss && this.invuln > 0) { this.faceToward(p.pos, dt, 6); return; }
    const speedMul = boss && this.phase === 2 ? 1.5 : 1;
    if (this.sees) {
      this.aim = damp(this.aim, 1, 7, dt);
      this.faceToward(p.pos, dt, 10);
      const tooFar = dist > d.maxRange, tooClose = dist < d.minRange;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) { this.strafeTimer = rand(0.9, 2.2); if (Math.random() < 0.5) this.strafeDir *= -1; }
      if (tooFar) this.moveTo(p.pos, d.run * speedMul, dt, ctx, false);
      else if (tooClose) {
        const away = _v.set(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z).normalize();
        const nx = this.pos.x + away.x * 2, nz = this.pos.z + away.z * 2;
        if (!ctx.level.nav.isBlockedAt(nx, nz)) { moveFlat(this.pos, d.radius, away.x * d.speed * dt, away.z * d.speed * dt, ctx.level.colliders); this.speedNow = d.speed; }
      } else if (this.type !== 'heavy') {
        const right = _v.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(this.strafeDir);
        const nx = this.pos.x + right.x * 1.5, nz = this.pos.z + right.z * 1.5;
        if (ctx.level.nav.isBlockedAt(nx, nz)) this.strafeDir *= -1;
        else { moveFlat(this.pos, d.radius, right.x * d.speed * 0.8 * dt, right.z * d.speed * 0.8 * dt, ctx.level.colliders); this.speedNow = d.speed * 0.8; }
      }
      if (boss && this.phase === 2 && dist > 5) this.moveTo(p.pos, d.run * speedMul, dt, ctx, false);
      // shooting
      this.fireTimer -= dt;
      if (this.pauseTimer > 0) this.pauseTimer -= dt;
      else if (this.burstLeft <= 0) { this.burstLeft = Math.round(rand(d.burstMin, d.burstMax)); this.fireTimer = 0.05; }
      if (this.burstLeft > 0 && this.fireTimer <= 0) {
        this.shoot(ctx, dist);
        this.burstLeft--;
        this.fireTimer = d.interval * (boss && this.phase === 2 ? 0.75 : 1);
        if (this.burstLeft <= 0) this.pauseTimer = rand(d.pauseMin, d.pauseMax) * (boss && this.phase === 2 ? 0.6 : 1);
      }
      // grenades
      if (boss && this.phase >= 1) {
        this.grenadeTimer -= dt;
        if (this.grenadeTimer <= 0 && dist > 7) {
          this.grenadeTimer = this.phase === 2 ? 5 : 7.5;
          ctx.throwGrenade(this.eyePos(new THREE.Vector3()), p.pos);
          audio.whoosh();
        }
      }
    } else {
      this.aim = damp(this.aim, 0.2, 4, dt);
      this.burstLeft = 0;
      const tgt = this.hasLastSeen ? this.lastSeen : p.pos;
      if (Math.hypot(tgt.x - this.pos.x, tgt.z - this.pos.z) > 2) this.moveTo(tgt, d.run * speedMul, dt, ctx);
      else { this.hasLastSeen = false; this.moveTo(p.pos, d.speed * speedMul, dt, ctx); }
    }
  }

  private rusherBehavior(dt: number, ctx: GameCtx, dist: number) {
    const p = ctx.player, d = this.def;
    this.aim = damp(this.aim, 0.6, 6, dt);
    this.meleeCd -= dt;
    if (this.meleeWind > 0) {
      this.meleeWind -= dt;
      this.faceToward(p.pos, dt, 14);
      if (this.meleeWind <= 0) {
        if (dist < 2.3) { ctx.damagePlayer(d.dmg * DIFF_DMG[ctx.difficulty], this.pos); audio.whoosh(); }
        this.meleeCd = 0.9;
      }
      return;
    }
    if (dist < 1.9 && this.meleeCd <= 0) { this.meleeWind = 0.32; return; }
    const target = this.sees ? p.pos : this.hasLastSeen ? this.lastSeen : p.pos;
    this.moveTo(target, d.run * (1 + (ctx.difficulty - 1) * 0.1), dt, ctx);
  }

  private shoot(ctx: GameCtx, dist: number) {
    const d = this.def, p = ctx.player;
    const muz = _v;
    this.rig.muzzle.getWorldPosition(muz);
    const from = muz.clone();
    const chest = p.eye(new THREE.Vector3()); chest.y -= 0.3;
    let acc = d.acc * DIFF_ACC[ctx.difficulty] - dist * 0.0085;
    acc *= 1 - clamp(p.speed / 7, 0, 1) * 0.35;
    if (p.crouch > 0.5) acc *= 0.85;
    if (this.type === 'boss') acc += 0.05;
    acc = clamp(acc, 0.06, 0.85);
    const hit = Math.random() < acc;
    const target = chest.clone();
    if (!hit) target.add(new THREE.Vector3(rand(-1.4, 1.4), rand(-0.9, 0.9), rand(-1.4, 1.4)));
    const dir = target.clone().sub(from).normalize();
    // clip tracer to world
    const rh = { dist: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), kind: 'concrete' as const };
    const maxD = from.distanceTo(target) + (hit ? 0 : 12);
    let end = from.clone().addScaledVector(dir, maxD);
    if (raycastWorld(from, dir, maxD, ctx.level.colliders, rh)) {
      end = rh.point.clone();
      ctx.fx.impact(rh.point, rh.normal, rh.kind);
    } else if (hit) {
      ctx.damagePlayer(d.dmg * DIFF_DMG[ctx.difficulty], this.pos);
    }
    if (!hit && end.distanceTo(chest) < 1.6) ctx.suppress(0.12);
    ctx.fx.tracer(from, end, this.type === 'boss' ? 0xff5a3a : 0xffb070, this.type === 'heavy' ? 0.03 : 0.016, 0.09);
    ctx.fx.flash(from, 0xffa050, 28, 0.05, 10);
    ctx.fx.add.emit(from, 0, 0, 0, new THREE.Color(0xffc070), 0.5, 0.05, 1, 0, 0, 0.3);
    audio.gun(this.type === 'boss' || this.type === 'heavy' ? 'boss' : 'enemy', ctx.panFor(this.pos), 1.9, dist);
    this.flinch = Math.min(1, this.flinch + 0.04);
  }

  // ------------------------------------------------------------------ anim
  private animate(dt: number, dist: number, ctx: GameCtx) {
    const r = this.rig, s = r.scale;
    this.anim += dt * (3 + this.speedNow * 1.55);
    const amp = clamp(this.speedNow / 5.5, 0, 1);
    const sw = Math.sin(this.anim) * 0.9 * amp;
    r.legL.rotation.x = sw; r.legR.rotation.x = -sw;
    r.hips.position.y = 0.88 * s * 1 / s + Math.abs(Math.cos(this.anim)) * 0.045 * amp - 0.02 * this.flinch;
    r.hips.position.y = 0.88 + Math.abs(Math.cos(this.anim)) * 0.045 * amp;
    const breath = Math.sin(ctx.time * 2 + this.id) * 0.012;
    r.torso.position.y = breath;
    // lean forward when running
    const lean = amp * 0.18 + (this.type === 'rusher' ? 0.15 * amp : 0);
    r.torso.rotation.x = lean - this.flinch * 0.28;
    r.torso.rotation.z = Math.sin(this.anim * 0.5) * 0.03 * amp + this.flinch * (this.id % 2 ? 0.1 : -0.1);

    const aimP = this.aim;
    // pitch toward player
    const pitch = clamp(Math.atan2(ctx.player.pos.y + 1.4 - (this.pos.y + 1.4 * s), Math.max(1, dist)), -0.5, 0.5);
    if (this.type === 'rusher') {
      const wind = this.meleeWind > 0 ? 1 - this.meleeWind / 0.32 : 0;
      r.armR.rotation.x = -0.9 + (this.meleeWind > 0 ? -1.9 * (1 - wind) + wind * 1.4 : sw * 0.9);
      r.armL.rotation.x = -0.9 - sw * 0.9;
      r.gun.visible = false;
    } else {
      const carryR = -0.55 + sw * 0.6, carryL = -0.4 - sw * 0.6;
      r.armR.rotation.x = lerp(carryR, -1.4 - pitch, aimP);
      r.armL.rotation.x = lerp(carryL, -1.3 - pitch, aimP);
      r.armL.rotation.y = lerp(0, 0.45, aimP);
      r.armR.rotation.y = lerp(0, -0.12, aimP);
      r.gun.position.set(0.12 * (this.type === 'heavy' ? 1.35 : 1), lerp(0.36, 0.56, aimP), lerp(0.24, 0.4, aimP));
      r.gun.rotation.x = lerp(0.5, -pitch, aimP);
    }
    if (this.type === 'boss' && this.invuln > 0) {
      r.armL.rotation.x = -2.8; r.armR.rotation.x = -2.8;
      r.visor.scale.set(1.2, 1.5 + Math.sin(ctx.time * 30) * 0.5, 1);
    } else if (this.type === 'boss') r.visor.scale.set(1, 1, 1);
    r.head.rotation.y = this.aware ? 0 : Math.sin(ctx.time * 0.6 + this.id) * 0.4;
    r.root.position.copy(this.pos);
    r.root.rotation.set(0, this.yaw, 0);
    r.root.rotation.x = 0;
  }

  private updateDeath(dt: number) {
    const r = this.rig;
    this.deadT += dt;
    const t = clamp(this.deadT / 0.55, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    r.root.rotation.set(0, this.yaw, 0);
    r.root.rotation.x = -Math.PI / 2 * e * 0.98 * this.fallDir * 1;
    r.root.position.set(this.pos.x, this.pos.y + (1 - e) * 0 + 0.12 * e, this.pos.z);
    this.pos.addScaledVector(this.deathVel, dt);
    this.deathVel.multiplyScalar(Math.max(0, 1 - dt * 5));
    r.legL.rotation.x = lerp(r.legL.rotation.x, 0.4, dt * 8); r.legR.rotation.x = lerp(r.legR.rotation.x, -0.3, dt * 8);
    r.armL.rotation.x = lerp(r.armL.rotation.x, -2.2, dt * 6); r.armR.rotation.x = lerp(r.armR.rotation.x, -1.0, dt * 6);
    r.torso.rotation.x = lerp(r.torso.rotation.x, 0, dt * 8);
    r.visor.visible = false;
    if (this.deadT > 8) r.root.position.y -= (this.deadT - 8) * 0.25;
  }
}
