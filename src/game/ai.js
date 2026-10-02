// Bot driver. Follows a racing line with pure pursuit, brakes for corners from a
// precomputed per-kart speed profile, drifts long bends, dodges karts and hazards,
// and spends items sensibly. Skill (per character) scales cornering speed and reaction.

import { clamp, wrapPi, mulberry32 } from '../util/math.js';

const BRAKE_DECEL = 24;

export class AIDriver {
  constructor(kart, track, opts = {}) {
    this.kart = kart;
    this.track = track;
    this.skill = opts.skill ?? 0.94;
    this.aggression = opts.aggression ?? 0.5;
    this.rng = mulberry32(opts.seed ?? 1);
    this.phase = this.rng() * 6.28;
    this.lineBias = 0.85 + this.rng() * 0.2;
    this.itemTimer = 0;
    this.hadItem = false;
    this.driftOn = false;
    this.shortcutPlan = new Map();
    this._buildSpeedProfile();
  }

  /** Allowed speed at every sample, with braking distance propagated backwards. */
  _buildSpeedProfile() {
    const t = this.track;
    const k = this.kart;
    const N = t.N;
    // kappa of the actual racing line is smaller than the centreline's; use a smoothed absolute curvature
    const omega = k.stats.turn * 0.7;
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let kk = 0;
      for (let q = -4; q <= 4; q++) kk = Math.max(kk, Math.abs(t.kappa[(i + q + N) % N]));
      const r = 1 / Math.max(kk, 1e-4);
      v[i] = clamp(omega * r * 1.12, 15, k.stats.vmax * 1.6);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const nxt = v[(i + 1) % N];
        const allow = Math.sqrt(nxt * nxt + 2 * BRAKE_DECEL * t.ds);
        if (allow < v[i]) v[i] = allow;
      }
    }
    this.vAllow = v;
  }

  update(dt, race) {
    const k = this.kart;
    const t = this.track;
    const p = k.probe;
    const c = k.controls;
    const N = t.N;
    const speed = Math.max(0, k.speed);
    const half = t.w[p.idx] / 2;

    // ---- target point on the racing line ----
    const look = clamp(7 + speed * (0.42 + (1 - this.skill) * 1.5), 9, 28);
    const iT = (p.idx + Math.round(look / t.ds)) % N;
    let off = t.lineOff[iT] * this.lineBias + Math.sin(t.s[iT] * 0.013 + this.phase) * 0.1 * half;

    // dodge karts directly ahead
    const myLat = p.lat;
    for (const o of race.karts) {
      if (o === k) continue;
      const dAhead = o.probe.distance - p.distance;
      if (dAhead > 0 && dAhead < 15 && Math.abs(o.probe.lat - myLat) < 3.4) {
        const dir = o.probe.lat >= myLat ? -1 : 1;
        off = myLat + dir * 4.5;
        break;
      }
    }
    // dodge hazards (oil) ahead
    if (race.items) {
      for (const hz of race.items.hazards) {
        const dAhead = hz.probe.distance - p.distance;
        if (dAhead > 2 && dAhead < 22 && Math.abs(hz.probe.lat - myLat) < 3.2) {
          off = myLat + (hz.probe.lat >= myLat ? -1 : 1) * 4.2;
          break;
        }
      }
    }
    off = clamp(off, -(half - 2.4), half - 2.4);

    let tx = t.x[iT] + t.nx[iT] * off;
    let tz = t.z[iT] + t.nz[iT] * off;

    // shortcuts: confident bots cut the corner when they have the speed for it
    const sc = this._shortcutTarget(race);
    if (sc) {
      tx = sc.x;
      tz = sc.z;
    }

    const desired = Math.atan2(tx - k.x, tz - k.z);
    const err = wrapPi(desired - k.h); // + = target is to the left
    const react = 2.1 + this.skill * 0.9;
    c.steer = clamp(-err * react, -1, 1);

    // ---- speed ----
    const iV = (p.idx + Math.round((4 + speed * 0.35) / t.ds)) % N;
    let target = this.vAllow[iV] * this.skill;
    const cap = k.stats.vmax * this.skill * k.rubber;
    if (target > cap) target = cap;
    if (sc) target = Math.min(target, 30);
    if (Math.abs(err) > 0.9) target = Math.min(target, 12);
    if (speed < target + 0.4) {
      c.throttle = 1;
      c.brake = 0;
    } else if (speed > target + 3.5) {
      c.throttle = 0;
      c.brake = clamp((speed - target - 3.5) / 8, 0.25, 1);
    } else {
      c.throttle = 0.25;
      c.brake = 0;
    }
    if (k.surface === 'rough' && !sc) c.throttle = 1;

    // ---- drifting: hold through bends, release on the way out for a mini-turbo ----
    let kAhead = 0;
    for (let q = 4; q <= 22; q += 3) kAhead += t.kappa[(p.idx + q) % N];
    kAhead /= 7;
    const kAbs = Math.abs(kAhead);
    let turnAhead = 0;
    for (let q = 0; q < 34; q += 2) turnAhead += t.kappa[(p.idx + q) % N] * t.ds * 2;
    const wantsDrift =
      this.skill > 0.9 && speed > 21 && kAbs > 1 / 70 && Math.abs(turnAhead) > 0.8 &&
      c.steer * kAhead < -0.02 && Math.abs(c.steer) > 0.27 && !sc;
    if (!this.driftOn && wantsDrift) this.driftOn = true;
    else if (this.driftOn && (kAbs < 1 / 130 || speed < 15)) this.driftOn = false;
    if (k.drifting && k.driftLevel >= 2 && kAbs < 1 / 90) this.driftOn = false;
    c.drift = this.driftOn;

    // ---- items ----
    this._items(dt, race);
  }

  _shortcutTarget(race) {
    const k = this.kart;
    const t = this.track;
    if (!t.shortcuts.length || this.skill < 0.93) return null;
    const p = k.probe;
    for (let si = 0; si < t.shortcuts.length; si++) {
      const s = t.shortcuts[si];
      let d = p.s - s.sIn;
      if (d < -t.length / 2) d += t.length;
      else if (d > t.length / 2) d -= t.length;
      const span = s.sOut - s.sIn;
      if (d < -45 || d > span + 6) {
        this.shortcutPlan.delete(si);
        continue;
      }
      // decide once per pass; bolder characters take it more often
      if (!this.shortcutPlan.has(si)) {
        const take = this.rng() < 0.35 + (this.skill - 0.93) * 6 + this.aggression * 0.2;
        this.shortcutPlan.set(si, take);
      }
      if (!this.shortcutPlan.get(si)) continue;
      // follow the ribbon: find the point on it ~12 m ahead of our position
      let bi = 0;
      let bd = Infinity;
      for (let q = 0; q < s.pts.length; q++) {
        const dd = Math.hypot(s.pts[q][0] - k.x, s.pts[q][1] - k.z);
        if (dd < bd) {
          bd = dd;
          bi = q;
        }
      }
      const tgt = s.pts[Math.min(s.pts.length - 1, bi + 2)];
      if (d < 0 && bd > 12) {
        // still on the road approaching the entry: aim for the entry point
        return { x: s.entry.x, z: s.entry.z };
      }
      return { x: tgt[0], z: tgt[1] };
    }
    return null;
  }

  _items(dt, race) {
    const k = this.kart;
    const c = k.controls;
    c.item = false;
    c.back = false;
    if (!k.item) {
      this.hadItem = false;
      return;
    }
    if (!this.hadItem) {
      this.hadItem = true;
      this.itemTimer = 0.8 + this.rng() * 2.6 * (1.4 - this.aggression);
      this.heldFor = 0;
    }
    this.heldFor += dt;
    this.itemTimer -= dt;
    if (this.itemTimer > 0 || k.spin > 0 || k.itemCool > 0) return;

    const id = k.item.id;
    const p = k.probe;
    const karts = race.karts;
    let aheadNear = null;
    let behindNear = null;
    for (const o of karts) {
      if (o === k) continue;
      const d = o.probe.distance - p.distance;
      const lat = Math.abs(o.probe.lat - p.lat);
      if (d > 0 && d < 40 && lat < 4.5 && (!aheadNear || d < aheadNear.d)) aheadNear = { o, d };
      if (d < 0 && d > -26 && lat < 4 && (!behindNear || d > behindNear.d)) behindNear = { o, d };
    }
    const anyAhead = karts.some((o) => o !== k && o.probe.distance > p.distance && !o.finished);
    const straight = Math.abs(k.track.kappa[(p.idx + 8) % k.track.N]) < 1 / 140;

    let use = false;
    switch (id) {
      case 'turbo':
      case 'trio':
        use = straight && k.boostTimer <= 0 && k.speed > 12;
        break;
      case 'bolt':
        if (aheadNear) use = true;
        else if (behindNear && this.rng() < 0.5 + this.aggression * 0.4) {
          use = true;
          c.back = true;
        } else if (this.heldFor > 9) use = true;
        break;
      case 'seeker':
        use = anyAhead && (this.heldFor > 1.5 || !!aheadNear);
        if (!anyAhead && this.heldFor > 12) use = true;
        break;
      case 'oil':
        use = !!behindNear || this.heldFor > 14;
        break;
      case 'aegis':
        use = this.heldFor > 3 + (1 - this.aggression) * 4;
        break;
      case 'comet':
        use = true;
        break;
      case 'pulse':
        use = karts.filter((o) => o !== k && o.probe.distance > p.distance).length >= 2 || this.heldFor > 6;
        break;
      default:
        use = true;
    }
    if (use) c.item = true;
  }
}

/** Autopilot for the comet item and for the player's kart after finishing. */
export class AutoPilot extends AIDriver {
  constructor(kart, track, opts = {}) {
    super(kart, track, { skill: 1, aggression: 0, ...opts });
    this.skill = opts.skill ?? 0.97;
  }

  _items() {
    this.kart.controls.item = false;
  }
}
