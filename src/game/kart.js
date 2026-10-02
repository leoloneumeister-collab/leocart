// Arcade kart physics. Pure logic (no THREE) so it runs headless in tests.
//
// The kart keeps a real world-space velocity. Steering rotates the heading and drags the
// velocity round only part of the way, so sideways slip appears on its own and is bled
// off by grip. Normal driving has high grip (planted); drifting has low grip and high
// slip, which gives the slide, and charging a drift pays out as a mini-turbo.

import { clamp, damp, lerp, wrapPi } from '../util/math.js';
import { TrackProbe, distToPolyline } from './trackMath.js';
import { deriveStats } from './characters.js';

export const KART_RADIUS = 1.15;

/** Drift charge thresholds in seconds of drifting and the boost each one pays out. */
export const DRIFT_LEVELS = [
  { t: 0.85, duration: 0.55, name: 'blue', color: 0x4aa8ff },
  { t: 1.8, duration: 0.95, name: 'orange', color: 0xffa21f },
  { t: 2.9, duration: 1.5, name: 'purple', color: 0xd24dff },
];

export const SURFACE = { road: 1, dirt: 0.82 };

export class Kart {
  constructor(track, character, opts = {}) {
    this.track = track;
    this.char = character;
    this.stats = deriveStats(character.stats);
    this.isPlayer = !!opts.isPlayer;
    this.index = opts.index ?? 0;
    this.name = opts.name ?? character.name;
    this.probe = new TrackProbe(track);

    this.controls = { steer: 0, throttle: 0, brake: 0, drift: false, item: false, back: false };

    this.x = 0;
    this.z = 0;
    this.h = 0;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0; // signed forward speed
    this.steer = 0; // smoothed steering

    this.surface = 'road';
    this.frozen = true;

    // drift
    this.drifting = false;
    this.driftDir = 0;
    this.driftTime = 0;
    this.driftLevel = 0;
    this.driftArm = false;
    this.driftKeyPrev = false;
    this.hopT = 0;

    // effects
    this.boostTimer = 0;
    this.boostMult = 1.35;
    this.spin = 0;
    this.spinDur = 1;
    this.spinAngle = 0;
    this.invuln = 0;
    this.shield = 0;
    this.comet = 0;
    this.slick = 0;
    this.airY = 0;
    this.airV = 0;
    this.rubber = 1;
    this.bumpCool = 0;

    // inventory
    this.item = null; // { id, count }
    this.itemCool = 0;

    // race state
    this.lap = 0;
    this.cp = 0;
    this.finished = false;
    this.finishTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;
    this.place = 1;
    this.padCool = 0;
    this.stuckT = 0;
    this.lastSafe = { s: 0 };
    this.wrongWayT = 0;
  }

  /** Put the kart on the track at arc length s with a lateral offset. */
  placeAt(x, z, h, initialDistance) {
    this.x = x;
    this.z = z;
    this.h = h;
    this.vx = this.vz = this.speed = 0;
    this.steer = 0;
    this.probe.prevS = undefined;
    this.probe.reset(x, z, initialDistance);
  }

  get distance() {
    return this.probe.distance;
  }

  get speedNorm() {
    return clamp(Math.abs(this.speed) / this.stats.vmax, 0, 1.5);
  }

  get boosting() {
    return this.boostTimer > 0 || this.comet > 0;
  }

  boost(duration, mult = 1.35, world) {
    this.boostMult = this.boostTimer > 0 ? Math.max(this.boostMult, mult) : mult;
    this.boostTimer = Math.max(this.boostTimer, duration);
    world?.emit('boost', this, { duration, mult });
  }

  cancelDrift() {
    this.drifting = false;
    this.driftTime = 0;
    this.driftLevel = 0;
    this.driftArm = false;
  }

  /**
   * Apply a hit. Returns 'hit' when it landed, 'blocked' when the shield absorbed it and
   * 'ignored' when the kart is invulnerable (recovering, or a comet).
   */
  hit(kind, world, source) {
    if (this.invuln > 0 || this.comet > 0) return 'ignored';
    if (this.shield > 0) {
      this.shield = 0;
      world?.emit('shieldBreak', this, { source });
      return 'blocked';
    }
    const big = kind === 'seeker' || kind === 'comet';
    this.spinDur = big ? 1.5 : kind === 'pulse' ? 1.2 : kind === 'oil' ? 1.0 : 1.1;
    this.spin = this.spinDur;
    this.spinAngle = 0;
    this.cancelDrift();
    this.boostTimer = 0;
    this.vx *= 0.35;
    this.vz *= 0.35;
    this.airV = big ? 9 : 6.5;
    this.invuln = this.spinDur + 1.4;
    world?.emit('hit', this, { kind, source });
    return 'hit';
  }

  /** Teleport back to the middle of the road at the last safe spot. */
  respawn(world) {
    const t = this.track;
    const s = this.lastSafe.s;
    const i = Math.floor((((s % t.length) + t.length) % t.length) / t.ds) % t.N;
    this.x = t.x[i];
    this.z = t.z[i];
    this.h = t.hd[i];
    this.vx = this.vz = this.speed = 0;
    this.probe.reset(this.x, this.z, this.probe.distance - this.probe.s + ((s % t.length) + t.length) % t.length);
    this.cancelDrift();
    this.spin = 0;
    this.boostTimer = 0;
    this.invuln = 2;
    this.stuckT = 0;
    world?.emit('respawn', this);
  }

  update(dt, world) {
    const st = this.stats;
    const c = this.controls;
    const track = this.track;

    this.invuln = Math.max(0, this.invuln - dt);
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.slick = Math.max(0, this.slick - dt);
    this.itemCool = Math.max(0, this.itemCool - dt);
    this.padCool = Math.max(0, this.padCool - dt);
    this.bumpCool = Math.max(0, this.bumpCool - dt);
    if (this.comet > 0) {
      this.comet = Math.max(0, this.comet - dt);
      if (this.comet === 0) world?.emit('cometEnd', this);
    }

    // Vertical hop (drift start and hits).
    this.hopT = Math.max(0, this.hopT - dt);
    if (this.airV !== 0 || this.airY > 0) {
      this.airV -= 26 * dt;
      this.airY += this.airV * dt;
      if (this.airY <= 0) {
        this.airY = 0;
        this.airV = 0;
      }
    }

    if (this.frozen) {
      this.probe.update(this.x, this.z);
      return;
    }

    const spinning = this.spin > 0;
    let steerIn = c.steer;
    let throttle = c.throttle;
    let brake = c.brake;
    let driftKey = c.drift;
    if (spinning) {
      steerIn = 0;
      throttle = 0;
      brake = 0;
      driftKey = false;
      this.spin -= dt;
      this.spinAngle += ((Math.PI * 4) / this.spinDur) * dt;
      if (this.spin <= 0) this.spinAngle = 0;
    }

    this.steer = damp(this.steer, steerIn, 16, dt);
    const speedAbs = Math.abs(this.speed);

    // ---- drift state machine ----
    const pressed = driftKey && !this.driftKeyPrev;
    this.driftKeyPrev = driftKey;
    if (pressed && speedAbs > 11 && !this.drifting && this.airY < 0.05) {
      this.driftArm = true;
      this.hopT = 0.26;
      this.airV = Math.max(this.airV, 5.2);
    }
    if (!driftKey) this.driftArm = false;
    if (this.driftArm && !this.drifting && Math.abs(this.steer) > 0.25) {
      this.drifting = true;
      this.driftArm = false;
      this.driftDir = this.steer > 0 ? -1 : 1; // heading increases to the left
      this.driftTime = 0;
      this.driftLevel = 0;
      world?.emit('driftStart', this);
    }
    if (this.drifting) {
      const toward = -this.steer * this.driftDir; // + when steering into the drift
      this.driftTime += dt * (1 + 0.35 * toward);
      let lvl = 0;
      for (let i = 0; i < DRIFT_LEVELS.length; i++) if (this.driftTime >= DRIFT_LEVELS[i].t) lvl = i + 1;
      if (lvl !== this.driftLevel) {
        this.driftLevel = lvl;
        if (lvl > 0) world?.emit('driftLevel', this, { level: lvl });
      }
      if (!driftKey || this.speed < 9) {
        const lvlDone = this.driftLevel;
        const ok = this.speed >= 9 && lvlDone > 0;
        this.cancelDrift();
        if (ok) {
          const L = DRIFT_LEVELS[lvlDone - 1];
          this.boost(L.duration, 1.3 + lvlDone * 0.04, world);
          world?.emit('miniTurbo', this, { level: lvlDone });
        }
      }
    }

    // ---- steering ----
    const steerAuth = clamp(speedAbs / 6, 0, 1) * (1 - 0.3 * clamp(speedAbs / st.vmax, 0, 1));
    const turnLeft = -this.steer;
    let dh;
    if (this.drifting) {
      const toward = turnLeft * this.driftDir;
      dh = this.driftDir * st.driftTurn * (0.55 + 0.35 * toward) * dt * clamp(speedAbs / 9, 0, 1);
    } else {
      dh = turnLeft * st.turn * steerAuth * dt * (this.speed < -0.5 ? -1 : 1);
    }
    this.h = wrapPi(this.h + dh);
    const slip = this.drifting ? st.driftSlip : this.slick > 0 ? 0.5 : 0.04;
    const rot = dh * (1 - slip);
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const nvx = this.vx * cr + this.vz * sr;
    const nvz = this.vz * cr - this.vx * sr;
    this.vx = nvx;
    this.vz = nvz;

    // ---- longitudinal ----
    const fx = Math.sin(this.h);
    const fz = Math.cos(this.h);
    const rx = -fz;
    const rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vL = this.vx * rx + this.vz * rz;

    const surfF = this.comet > 0 ? 1 : this.surface === 'road' ? 1 : this.surface === 'dirt' ? SURFACE.dirt : st.offroad;
    const boosting = this.boostTimer > 0 || this.comet > 0;
    let vcap = st.vmax * surfF * this.rubber;
    if (boosting) {
      const mult = this.comet > 0 ? 1.55 : this.boostMult;
      vcap = st.vmax * mult * lerp(surfF, 1, 0.65) * this.rubber;
    }
    if (throttle > 0.01) {
      if (vF < 0) vF = Math.min(0, vF + 34 * throttle * dt);
      else if (vF < vcap) {
        const a = Math.max(2.5, st.accelK * (vcap - vF)) * throttle + (boosting ? 26 : 0);
        vF = Math.min(vcap, vF + a * dt);
      }
    }
    if (brake > 0.01) {
      if (vF > 0.8) vF = Math.max(0, vF - 40 * brake * dt);
      else vF = Math.max(-11, vF - 15 * brake * dt);
    }
    if (vF > vcap) vF = Math.max(vcap, vF - ((vF - vcap) * (boosting ? 0.6 : 2.6) + 2) * dt);
    if (throttle < 0.01 && brake < 0.01) {
      vF *= Math.exp(-0.3 * dt);
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), 1.4 * dt);
    }
    if (spinning) vF *= Math.exp(-2.6 * dt);

    let grip = this.drifting ? st.driftGrip : st.grip;
    if (this.surface !== 'road') grip *= 0.8;
    if (this.slick > 0) grip = 0.9;
    if (spinning) grip = 1.5;
    vL *= Math.exp(-grip * dt);

    this.vx = fx * vF + rx * vL;
    this.vz = fz * vF + rz * vL;
    this.speed = vF;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // ---- track interaction ----
    this.probe.update(this.x, this.z);
    this._walls(world);
    this._obstacles(world);
    this._surface(world);

    if (!spinning && this.airY < 0.4) {
      this.lastSafe.s = this.probe.s;
    }
  }

  _walls(world) {
    const t = this.track;
    const p = this.probe;
    const i = p.idx;
    const lim = (p.lat >= 0 ? t.limR[i] : t.limL[i]) - KART_RADIUS * 0.9;
    const over = Math.abs(p.lat) - lim;
    if (over <= 0) return;
    const sg = p.lat >= 0 ? 1 : -1;
    const ox = t.nx[i] * sg; // outward normal
    const oz = t.nz[i] * sg;
    this.x -= ox * over;
    this.z -= oz * over;
    const vN = this.vx * ox + this.vz * oz;
    if (vN > 0) {
      this.vx -= 1.25 * vN * ox;
      this.vz -= 1.25 * vN * oz;
      const keep = 1 - clamp(vN * 0.012, 0, 0.3) / (0.6 + this.stats.mass * 0.4);
      this.vx *= keep;
      this.vz *= keep;
      if (vN > 5 && this.bumpCool <= 0) {
        this.bumpCool = 0.25;
        world?.emit('wall', this, { impact: vN, x: this.x + ox * 1.1, z: this.z + oz * 1.1 });
      }
      if (this.drifting && vN > 8) this.cancelDrift();
    }
    this.probe.update(this.x, this.z);
  }

  _obstacles(world) {
    const obs = this.track.obstacles;
    if (!obs || !obs.length) return;
    for (let k = 0; k < obs.length; k++) {
      const o = obs[k];
      const dx = this.x - o.x;
      const dz = this.z - o.z;
      const rr = o.r + KART_RADIUS * 0.85;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      this.x += nx * (rr - d);
      this.z += nz * (rr - d);
      const vN = this.vx * nx + this.vz * nz;
      if (vN < 0) {
        this.vx -= 1.4 * vN * nx;
        this.vz -= 1.4 * vN * nz;
        this.vx *= 0.82;
        this.vz *= 0.82;
        if (-vN > 5 && this.bumpCool <= 0) {
          this.bumpCool = 0.25;
          world?.emit('wall', this, { impact: -vN, x: o.x + nx * o.r, z: o.z + nz * o.r });
        }
      }
    }
  }

  _surface(world) {
    const t = this.track;
    const p = this.probe;
    const half = t.w[p.idx] / 2;
    if (Math.abs(p.lat) <= half + 0.4) {
      this.surface = 'road';
    } else {
      this.surface = 'rough';
      for (const sc of t.shortcuts) {
        let ds = p.s - sc.sIn;
        if (ds < -t.length / 2) ds += t.length;
        else if (ds > t.length / 2) ds -= t.length;
        if (ds > -20 && ds < sc.sOut - sc.sIn + 20 && distToPolyline(sc.pts, this.x, this.z) < sc.width / 2) {
          this.surface = 'dirt';
          break;
        }
      }
    }
    // Boost pads.
    if (this.padCool <= 0) {
      for (const pad of t.boostPads) {
        let ds = p.s - pad.s;
        if (ds < -t.length / 2) ds += t.length;
        else if (ds > t.length / 2) ds -= t.length;
        if (Math.abs(ds) < pad.len / 2 + 1 && Math.abs(p.lat - pad.lat) < pad.width / 2 + 1) {
          this.padCool = 1.2;
          this.boost(1.1, 1.42, world);
          world?.emit('pad', this);
          break;
        }
      }
    }
  }
}

/** Resolve kart-vs-kart overlap with mass-weighted impulses. Returns true on contact. */
export function collideKarts(a, b, world) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const min = KART_RADIUS * 2;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 < 1e-6) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const nz = dz / d;
  const ma = a.stats.mass * (a.comet > 0 ? 3 : 1);
  const mb = b.stats.mass * (b.comet > 0 ? 3 : 1);
  const overlap = min - d;
  a.x -= nx * overlap * (mb / (ma + mb));
  a.z -= nz * overlap * (mb / (ma + mb));
  b.x += nx * overlap * (ma / (ma + mb));
  b.z += nz * overlap * (ma / (ma + mb));
  const rvn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (rvn > 0) {
    const e = 0.55;
    const j = ((1 + e) * rvn) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx;
    a.vz -= (j / ma) * nz;
    b.vx += (j / mb) * nx;
    b.vz += (j / mb) * nz;
    if (rvn > 4 && a.bumpCool <= 0 && b.bumpCool <= 0) {
      a.bumpCool = b.bumpCool = 0.2;
      world?.emit('kartBump', a, { other: b, impact: rvn, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
    }
  }
  if (a.comet > 0 && b.comet <= 0) b.hit('comet', world, a);
  else if (b.comet > 0 && a.comet <= 0) a.hit('comet', world, b);
  return true;
}
