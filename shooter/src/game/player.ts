import * as THREE from 'three';
import type { Input } from '../engine/input';
import { audio } from '../engine/audio';
import { clamp, damp, lerp } from '../engine/util';
import { AABB, moveBody } from './collision';

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  recoilPitch = 0;
  recoilYaw = 0;
  health = 100;
  maxHealth = 100;
  radius = 0.34;
  crouch = 0; // 0..1
  sprint = 0; // 0..1 smoothed
  sprinting = false;
  grounded = true;
  bobPhase = 0;
  moveAmt = 0;
  landKick = 0;
  lastHurt = -99;
  alive = true;
  private stepAcc = 0;
  private wantCrouch = false;
  private lastVy = 0;
  shake = 0;
  speed = 0;

  get height() { return lerp(1.8, 1.15, this.crouch); }
  get eyeHeight() { return lerp(1.65, 1.08, this.crouch); }

  eye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
  }

  lookDir(out = new THREE.Vector3()) {
    const p = this.pitch + this.recoilPitch, y = this.yaw + this.recoilYaw;
    const cp = Math.cos(p);
    return out.set(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
  }

  reset(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.recoilPitch = 0; this.recoilYaw = 0;
    this.health = this.maxHealth; this.alive = true; this.crouch = 0; this.sprint = 0;
  }

  private headBlocked(boxes: AABB[], h: number) {
    const r = this.radius * 0.9;
    for (const b of boxes) {
      if (this.pos.x + r > b.minX && this.pos.x - r < b.maxX && this.pos.z + r > b.minZ && this.pos.z - r < b.maxZ && this.pos.y + h > b.minY + 0.01 && this.pos.y + 0.9 < b.maxY) {
        if (b.minY > this.pos.y + 0.8) return true;
      }
    }
    return false;
  }

  update(dt: number, input: Input, boxes: AABB[], opts: { speedMult: number; ads: number; firing: boolean; sens: number; invertY: boolean; adsZoom: number; frozen: boolean }, time: number) {
    if (!this.alive || opts.frozen) {
      this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt);
      this.vel.y -= 16 * dt;
      moveBody(this.pos, this.vel, this.radius, this.height, dt, boxes);
      return;
    }
    // look
    const sensBase = 0.0022 * opts.sens * opts.adsZoom;
    const dx = input.mouseDX + input.lookDX, dy = input.mouseDY + input.lookDY;
    this.yaw -= dx * sensBase;
    this.pitch -= dy * sensBase * (opts.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.5, 1.5);
    // recoil recovery
    this.recoilPitch = damp(this.recoilPitch, 0, 5.5, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 6, dt);

    // crouch
    this.wantCrouch = input.down('KeyC') || input.down('ControlLeft') || input.touchCrouch;
    if (!this.wantCrouch && this.crouch > 0 && this.headBlocked(boxes, 1.8)) this.wantCrouch = true;
    this.crouch = damp(this.crouch, this.wantCrouch ? 1 : 0, 12, dt);

    const mv = input.moveVec();
    const wantsSprint = (input.down('ShiftLeft') || input.touchSprint) && mv.y > 0.3 && opts.ads < 0.2 && !opts.firing && this.crouch < 0.3;
    this.sprinting = wantsSprint && this.grounded;
    this.sprint = damp(this.sprint, this.sprinting ? 1 : 0, 9, dt);

    let speed = 4.3;
    if (this.sprinting) speed = 7.2;
    speed = lerp(speed, 2.1, this.crouch);
    speed *= lerp(1, 0.62, opts.ads) * opts.speedMult;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward vector = (-sin, -cos), right = (cos, -sin)
    const tx = (-sin * mv.y + cos * mv.x) * speed;
    const tz = (-cos * mv.y - sin * mv.x) * speed;
    const accel = this.grounded ? 12 : 2.5;
    this.vel.x = damp(this.vel.x, tx, accel, dt);
    this.vel.z = damp(this.vel.z, tz, accel, dt);

    if (this.grounded && (input.pressed('Space') || (input.touchJump))) {
      this.vel.y = 5.4; this.grounded = false; input.touchJump = false;
    }
    this.vel.y -= 16 * dt;
    this.lastVy = this.vel.y;
    const res = moveBody(this.pos, this.vel, this.radius, this.height, dt, boxes, 0.42);
    if (res.grounded && !this.grounded && this.lastVy < -5) { this.landKick = Math.min(1, -this.lastVy / 10); audio.step('hard', 1.1); }
    this.grounded = res.grounded;
    this.landKick = damp(this.landKick, 0, 10, dt);

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    const ratio = clamp(this.speed / 7.2, 0, 1);
    this.moveAmt = this.grounded ? ratio : 0;
    if (this.grounded && this.speed > 0.5) {
      const rate = this.sprinting ? 12 : this.crouch > 0.5 ? 6 : 8.6;
      this.bobPhase += this.speed * dt * rate / 4.3 * 0.6;
      this.stepAcc += this.speed * dt;
      const stride = this.sprinting ? 2.4 : 1.8;
      if (this.stepAcc > stride) { this.stepAcc = 0; audio.step('hard', this.crouch > 0.5 ? 0.2 : this.sprinting ? 0.8 : 0.5); }
    }
    this.shake = damp(this.shake, 0, 7, dt);
    void time;
  }

  /** Apply camera transform. */
  applyCamera(cam: THREE.PerspectiveCamera, time: number) {
    const bobY = Math.abs(Math.cos(this.bobPhase)) * 0.045 * this.moveAmt * (this.sprinting ? 1.4 : 1);
    const bobX = Math.sin(this.bobPhase) * 0.03 * this.moveAmt;
    cam.position.set(this.pos.x, this.pos.y + this.eyeHeight - this.landKick * 0.12 + bobY, this.pos.z);
    cam.rotation.order = 'YXZ';
    const sh = this.shake;
    cam.rotation.y = this.yaw + this.recoilYaw + (Math.sin(time * 61) * 0.01) * sh;
    cam.rotation.x = this.pitch + this.recoilPitch + (Math.sin(time * 53 + 1) * 0.01) * sh;
    // strafe roll + bob roll
    cam.rotation.z = -bobX * 0.2 + (Math.cos(time * 47) * 0.01) * sh;
  }
}
