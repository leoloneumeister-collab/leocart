// Chase camera with drift lag, speed-based FOV, boost kick, shake and cinematic modes.

import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, lerpAngle, smoothstep } from '../util/math.js';
import { settings } from '../game/settings.js';

const UP = new THREE.Vector3(0, 1, 0);

export class ChaseCamera {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.heading = 0;
    this.fov = 62;
    this.baseFov = 62;
    this.shakeAmt = 0;
    this.roll = 0;
    this.back = 0; // 0..1 look-behind blend
    this.mode = 'chase';
    this.modeT = 0;
    this.time = 0;
    this._tmp = new THREE.Vector3();
  }

  snapTo(kart) {
    this.heading = kart.h;
    const d = this._chasePos(kart, 6.8, 3.2, this.heading);
    this.pos.copy(d);
    this.fov = this.baseFov;
  }

  shake(a) {
    if (!settings.shake) return;
    this.shakeAmt = Math.min(1.4, Math.max(this.shakeAmt, a));
  }

  _chasePos(kart, dist, height, heading) {
    return this._tmp.set(kart.x - Math.sin(heading) * dist, height, kart.z - Math.cos(heading) * dist);
  }

  /** mode: 'chase' | 'intro' | 'finish'. */
  setMode(mode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this.modeT = 0;
    }
  }

  update(dt, kart, { lookBack = false } = {}) {
    const cam = this.camera;
    this.time += dt;
    this.modeT += dt;
    const sn = clamp(kart.speedNorm, 0, 1.4);
    const boosting = kart.boostTimer > 0 || kart.comet > 0;

    // desired heading: kart heading blended with velocity direction so drifts show some side-on view
    let target = kart.h;
    const vs = Math.hypot(kart.vx, kart.vz);
    if (vs > 4) target = lerpAngle(kart.h, Math.atan2(kart.vx, kart.vz), 0.4);
    this.heading = dampAngle(this.heading, target, kart.drifting ? 3.2 : 6.5, dt);

    this.back = damp(this.back, lookBack ? 1 : 0, 10, dt);
    const heading = this.heading + this.back * Math.PI;

    let dist = 6.9 + sn * 1.1 + (boosting ? 1.5 : 0) - this.back * 1.2;
    let height = 3.15 + sn * 0.3 + (boosting ? 0.25 : 0);

    const desired = this._chasePos(kart, dist, height, heading).clone();
    // follow tightly in height, slightly softer horizontally so speed reads
    this.pos.x = damp(this.pos.x, desired.x, 16, dt);
    this.pos.z = damp(this.pos.z, desired.z, 16, dt);
    this.pos.y = damp(this.pos.y, desired.y, 8, dt);

    const lead = lerp(3.2, 5.5, clamp(sn, 0, 1)) * (1 - this.back * 2);
    const targetLook = this._tmp.set(
      kart.x + Math.sin(heading) * lead,
      1.5 + kart.airY * 0.5,
      kart.z + Math.cos(heading) * lead,
    );
    this.look.x = damp(this.look.x, targetLook.x, 22, dt);
    this.look.y = damp(this.look.y, targetLook.y, 10, dt);
    this.look.z = damp(this.look.z, targetLook.z, 22, dt);

    // cinematic intro: a sweep that eases into the chase position
    let px = this.pos.x;
    let py = this.pos.y;
    let pz = this.pos.z;
    if (this.mode === 'intro') {
      const t = clamp(this.modeT / (this.introDuration || 3), 0, 1);
      const e = smoothstep(0, 1, t);
      const ang = heading + Math.PI * (1.15 - 1.15 * e) + 0.4;
      const r = lerp(24, dist, e);
      const ox = kart.x - Math.sin(ang) * r;
      const oz = kart.z - Math.cos(ang) * r;
      const oy = lerp(11, height, e);
      px = lerp(ox, px, e * e);
      py = lerp(oy, py, e * e);
      pz = lerp(oz, pz, e * e);
    } else if (this.mode === 'finish') {
      const ang = heading + this.modeT * 0.55 + 2.4;
      const r = 11;
      px = kart.x + Math.sin(ang) * r;
      pz = kart.z + Math.cos(ang) * r;
      py = 4.4;
    }

    // shake
    this.shakeAmt *= Math.exp(-5.5 * dt);
    let shake = this.shakeAmt;
    if (kart.surface !== 'road' && kart.speed > 8) shake += 0.035 * sn;
    if (boosting) shake += 0.03;
    const t = this.time;
    const sx = (Math.sin(t * 61) + Math.sin(t * 37.3 + 1)) * 0.5 * shake * 0.35;
    const sy = (Math.sin(t * 53 + 2) + Math.sin(t * 29.1)) * 0.5 * shake * 0.3;

    cam.position.set(px + sx, py + sy, pz + sx * 0.5);
    cam.lookAt(this.look);

    // bank into drifts
    const targetRoll = kart.drifting ? -kart.driftDir * 0.045 : 0;
    this.roll = damp(this.roll, targetRoll, 5, dt);
    cam.rotateZ(this.roll + sx * 0.02);

    // FOV widens with speed and kicks on boost
    const targetFov = this.baseFov + sn * sn * 7 + (boosting ? 11 : 0) + (kart.drifting ? 2 : 0);
    this.fov = damp(this.fov, targetFov, boosting ? 9 : 4, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
