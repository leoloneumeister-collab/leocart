import { MOVE } from './constants.ts';
import { hullHeight, maxSpeedOf, type Actor, type Cmd } from './actor.ts';
import type { World } from './world.ts';

export interface MoveEvents {
  /** Vertical speed on the tick the actor landed, 0 otherwise. */
  landed: number;
  hitWall: boolean;
}

const ev: MoveEvents = { landed: 0, hitWall: false };

/** Wish direction in world space from the stick values and yaw. */
export function wishFrom(fwd: number, side: number, yaw: number, out: { x: number; z: number }) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  out.x = -s * fwd + c * side;
  out.z = -c * fwd - s * side;
  return out;
}

const wish = { x: 0, z: 0 };

function overlaps(b: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }, x: number, y: number, z: number, r: number, h: number) {
  const e = 1e-3;
  return x + r > b.minX + e && x - r < b.maxX - e && z + r > b.minZ + e && z - r < b.maxZ - e && y + h > b.minY + e && y < b.maxY - e;
}

function moveAxis(world: World, a: Actor, axis: 'x' | 'z', delta: number, h: number, canStep: boolean): boolean {
  const r = MOVE.radius;
  a.pos[axis] += delta;
  const list = world.collect(a.pos.x - r, a.pos.z - r, a.pos.x + r, a.pos.z + r);
  let maxTop = -Infinity;
  let any = false;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (overlaps(b, a.pos.x, a.pos.y, a.pos.z, r, h)) { any = true; if (b.maxY > maxTop) maxTop = b.maxY; }
  }
  if (!any) return false;
  if (canStep && maxTop > a.pos.y && maxTop - a.pos.y <= MOVE.step + 1e-4 && world.hullFree(a.pos.x, maxTop + 0.002, a.pos.z, r, h)) {
    a.pos.y = maxTop + 0.002;
    return false;
  }
  // push out of everything we overlap
  const l2 = world.collect(a.pos.x - r, a.pos.z - r, a.pos.x + r, a.pos.z + r);
  for (let i = 0; i < l2.length; i++) {
    const b = l2[i];
    if (!overlaps(b, a.pos.x, a.pos.y, a.pos.z, r, h)) continue;
    if (axis === 'x') a.pos.x = delta > 0 ? Math.min(a.pos.x, b.minX - r - 1e-3) : Math.max(a.pos.x, b.maxX + r + 1e-3);
    else a.pos.z = delta > 0 ? Math.min(a.pos.z, b.minZ - r - 1e-3) : Math.max(a.pos.z, b.maxZ + r + 1e-3);
  }
  a.vel[axis] = 0;
  return true;
}

function moveVertical(world: World, a: Actor, dt: number, h: number): boolean {
  const r = MOVE.radius;
  const y0 = a.pos.y;
  a.pos.y += a.vel.y * dt;
  let landed = false;
  const list = world.collect(a.pos.x - r, a.pos.z - r, a.pos.x + r, a.pos.z + r);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!overlaps(b, a.pos.x, a.pos.y, a.pos.z, r, h)) continue;
    if (a.vel.y <= 0 && y0 >= b.maxY - 0.05) { a.pos.y = b.maxY; landed = true; a.vel.y = 0; }
    else if (a.vel.y > 0 && y0 + h <= b.minY + 0.05) { a.pos.y = b.minY - h - 1e-3; a.vel.y = 0; }
    else if (a.vel.y <= 0) { a.pos.y = b.maxY; landed = true; a.vel.y = 0; }
  }
  if (a.pos.y <= 0) { a.pos.y = 0; if (a.vel.y < 0) a.vel.y = 0; landed = true; }
  return landed;
}

/** Quake style player movement. Mutates the actor and returns what happened this tick. */
export function stepMovement(world: World, a: Actor, cmd: Cmd, dt: number): MoveEvents {
  ev.landed = 0; ev.hitWall = false;
  const r = MOVE.radius;

  // ---- duck
  if (cmd.crouch && !a.crouching) {
    a.crouching = true;
    if (!a.onGround) {
      // pull the legs up like the real thing so crouch jumps reach higher ledges
      const lift = MOVE.heightStand - MOVE.heightCrouch;
      if (world.hullFree(a.pos.x, a.pos.y + lift, a.pos.z, r, MOVE.heightCrouch)) a.pos.y += lift;
    }
  } else if (!cmd.crouch && a.crouching) {
    if (world.hullFree(a.pos.x, a.pos.y, a.pos.z, r, MOVE.heightStand)) a.crouching = false;
  }
  const targetDuck = a.crouching ? 1 : 0;
  a.crouchAmt += Math.sign(targetDuck - a.crouchAmt) * Math.min(Math.abs(targetDuck - a.crouchAmt), dt / 0.18);
  const h = hullHeight(a);

  // ---- wish
  let maxSpeed = maxSpeedOf(a);
  if (a.crouching) maxSpeed *= MOVE.crouchFrac;
  else if (cmd.walk) maxSpeed *= MOVE.walkFrac;
  let fwd = cmd.fwd, side = cmd.side;
  const mag = Math.hypot(fwd, side);
  if (mag > 1) { fwd /= mag; side /= mag; }
  wishFrom(fwd, side, a.yaw, wish);
  let wishSpeed = Math.hypot(wish.x, wish.z) * maxSpeed;
  let wx = 0, wz = 0;
  if (wishSpeed > 1e-4) { wx = wish.x / Math.hypot(wish.x, wish.z); wz = wish.z / Math.hypot(wish.x, wish.z); }
  if (wishSpeed > maxSpeed) wishSpeed = maxSpeed;

  // ---- jump (edge triggered with a small buffer so scroll wheel hops work)
  if (cmd.jump && !a.jumpHeld) a.jumpBuffer = 0.1;
  a.jumpHeld = cmd.jump;
  a.jumpBuffer = Math.max(0, a.jumpBuffer - dt);

  if (a.onGround) {
    const sp = Math.hypot(a.vel.x, a.vel.z);
    if (sp > 0) {
      const control = Math.max(sp, MOVE.stopSpeed);
      const drop = control * MOVE.friction * dt;
      const ns = Math.max(0, sp - drop) / sp;
      a.vel.x *= ns; a.vel.z *= ns;
    }
    const cur = a.vel.x * wx + a.vel.z * wz;
    const add = wishSpeed - cur;
    if (add > 0) {
      // acceleration is scaled by at least 75% of run speed so crouch and walk do not feel sluggish
      const acc = Math.min(add, MOVE.accel * dt * Math.max(wishSpeed, maxSpeedOf(a) * 0.75));
      a.vel.x += wx * acc; a.vel.z += wz * acc;
    }
    if (a.jumpBuffer > 0 && !a.crouching) {
      a.vel.y = MOVE.jump;
      a.onGround = false;
      a.jumpBuffer = 0;
      const cap = maxSpeedOf(a) * 1.1;
      const s2 = Math.hypot(a.vel.x, a.vel.z);
      if (s2 > cap) { a.vel.x *= cap / s2; a.vel.z *= cap / s2; }
    }
  } else {
    const capped = Math.min(wishSpeed, MOVE.airCap);
    const cur = a.vel.x * wx + a.vel.z * wz;
    const add = capped - cur;
    if (add > 0) {
      const acc = Math.min(add, MOVE.airAccel * wishSpeed * dt);
      a.vel.x += wx * acc; a.vel.z += wz * acc;
    }
    a.vel.y = Math.max(-MOVE.terminal, a.vel.y - MOVE.gravity * dt);
  }

  const wasGrounded = a.onGround;
  const vyBefore = a.vel.y;

  // ---- collide
  if (a.vel.x !== 0 && moveAxis(world, a, 'x', a.vel.x * dt, h, wasGrounded)) ev.hitWall = true;
  if (a.vel.z !== 0 && moveAxis(world, a, 'z', a.vel.z * dt, h, wasGrounded)) ev.hitWall = true;
  let grounded = false;
  if (!wasGrounded || a.vel.y > 0) grounded = moveVertical(world, a, dt, h);
  else a.vel.y = 0;

  // ---- ground probe, with step down snapping so ramps and stairs stay glued
  if (!grounded && a.vel.y <= 0) {
    const gh = world.groundHeight(a.pos.x, a.pos.z, r, a.pos.y + 0.02);
    const gap = a.pos.y - gh;
    if (gap <= 0.02) { a.pos.y = gh; grounded = true; }
    else if (wasGrounded && gap <= MOVE.step && a.vel.y <= 0) { a.pos.y = gh; grounded = true; }
  }
  if (grounded) {
    if (!wasGrounded && vyBefore < -3) {
      ev.landed = -vyBefore;
      a.vel.x *= MOVE.landingSlow; a.vel.z *= MOVE.landingSlow;
    }
    a.vel.y = 0;
  }
  a.onGround = grounded;
  a.fallSpeed = grounded ? 0 : Math.max(a.fallSpeed, -a.vel.y);
  return ev;
}
