import { check, near, done } from './helpers.mjs';
import { World } from '../src/sim/world.ts';
import { newActor, newCmd } from '../src/sim/actor.ts';
import { stepMovement } from '../src/sim/movement.ts';
import { DT, MOVE } from '../src/sim/constants.ts';
import { mkWeapon } from '../src/sim/actor.ts';

const box = (x0, y0, z0, x1, y1, z1, mat = 'stone') => ({ minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1, mat, id: 0 });
const boxes = [
  box(-50, 0, -40, 50, 5, -39),       // north wall
  box(8, 0, -2, 9, 0.3, 2),           // low step 0.3 high
  box(14, 0, -2, 18, 1.0, 2),         // 1.0 high ledge
  box(21, 0, -2, 25, 1.8, 2),         // 1.8 high ledge (crouch jump only)
  box(28, 0, -2, 29, 3.0, 2),         // tall wall
];
const world = new World(boxes, { minX: -50, minZ: -50, maxX: 50, maxZ: 50 });

function mk() {
  const a = newActor(1, 'T', 1, false, true);
  a.alive = true; a.pos = { x: 0, y: 0, z: 0 }; a.yaw = -Math.PI / 2; // facing +X
  a.secondary = mkWeapon('viper'); a.cur = 'knife';
  return a;
}
const run = (a, cmd, secs) => { for (let i = 0; i < Math.round(secs / DT); i++) stepMovement(world, a, cmd, DT); };

console.log('movement');
{
  const a = mk(); const c = newCmd(); c.fwd = 1; c.yaw = a.yaw;
  run(a, c, 0.6);
  near('knife run speed reaches max', Math.hypot(a.vel.x, a.vel.z), MOVE.maxSpeed, 0.05);
  check('moved along +X when facing +X', a.pos.x > 2 && Math.abs(a.pos.z) < 0.01, `x=${a.pos.x.toFixed(2)}`);
  // counter strafe: tap opposite key
  const c2 = newCmd(); c2.fwd = -1;
  let ticks = 0;
  while (Math.hypot(a.vel.x, a.vel.z) > MOVE.maxSpeed * 0.34 && ticks < 200) { stepMovement(world, a, c2, DT); ticks++; }
  check('counter strafe drops below accurate speed fast', ticks * DT < 0.15, `${(ticks * DT * 1000).toFixed(0)} ms`);
  const c3 = newCmd(); let t3 = 0;
  while (Math.hypot(a.vel.x, a.vel.z) > 0.01 && t3 < 300) { stepMovement(world, a, c3, DT); t3++; }
  check('friction alone stops within 0.7 s', t3 * DT < 0.7, `${(t3 * DT * 1000).toFixed(0)} ms`);
}
{
  const a = mk(); const c = newCmd(); c.fwd = 1; c.walk = true;
  run(a, c, 0.8);
  near('walk is 52 percent', Math.hypot(a.vel.x, a.vel.z), MOVE.maxSpeed * MOVE.walkFrac, 0.05);
  const b = mk(); const cc = newCmd(); cc.fwd = 1; cc.crouch = true;
  run(b, cc, 1.0);
  near('crouch walk is 34 percent', Math.hypot(b.vel.x, b.vel.z), MOVE.maxSpeed * MOVE.crouchFrac, 0.05);
}
{
  // jump height and distance
  const a = mk(); a.pos.x = -30; const c = newCmd(); c.jump = true;
  let apex = 0, t = 0;
  for (let i = 0; i < 200; i++) { stepMovement(world, a, c, DT); apex = Math.max(apex, a.pos.y); t++; if (a.onGround && i > 3) break; c.jump = false; }
  near('standing jump apex', apex, 1.45, 0.08);
  near('jump airtime', t * DT, 0.755, 0.08);
}
{
  // run jump distance
  const a = mk(); a.pos.x = -30; const c = newCmd(); c.fwd = 1; run(a, c, 1.2);
  const x0 = a.pos.x; c.jump = true; let n = 0;
  stepMovement(world, a, c, DT); c.jump = false;
  while (!a.onGround && n++ < 200) stepMovement(world, a, c, DT);
  const dist = a.pos.x - x0;
  check('running jump covers 4 to 5.5 m', dist > 4 && dist < 5.5, `${dist.toFixed(2)} m`);
}
{
  // air strafe bends velocity
  const a = mk(); a.pos.x = -30; const c = newCmd(); c.fwd = 1; run(a, c, 1.0);
  c.jump = true; stepMovement(world, a, c, DT); c.jump = false; c.fwd = 0; c.side = -1;
  const sp0 = Math.hypot(a.vel.x, a.vel.z);
  for (let i = 0; i < 20; i++) { a.yaw += 0.03; stepMovement(world, a, c, DT); }
  const sp1 = Math.hypot(a.vel.x, a.vel.z);
  check('air strafing with turning gains speed', sp1 > sp0, `${sp0.toFixed(2)} -> ${sp1.toFixed(2)}`);
}
{
  const a = mk(); a.pos.x = 5; const c = newCmd(); c.fwd = 1; run(a, c, 1.0);
  check('steps up a 0.3 m ledge', a.pos.x > 9.5 && Math.abs(a.pos.y - 0.3) < 0.01 || a.pos.y === 0 && a.pos.x > 9.5, `x=${a.pos.x.toFixed(2)} y=${a.pos.y.toFixed(2)}`);
}
{
  const a = mk(); a.pos.x = 11; const c = newCmd(); c.fwd = 1; run(a, c, 1.0);
  check('blocked by a 1.0 m ledge when walking', a.pos.x < 13.7, `x=${a.pos.x.toFixed(2)}`);
  const b = mk(); b.pos.x = 11; const cj = newCmd(); cj.fwd = 1; let top = 0;
  for (let i = 0; i < 120; i++) { cj.jump = i === 30; stepMovement(world, b, cj, DT); if (b.onGround) top = Math.max(top, b.pos.y); if (i > 100) break; }
  check('can jump onto a 1.0 m ledge', top > 0.99 && top < 1.01, `stood at y=${top.toFixed(2)}`);
}
{
  const a = mk(); a.pos.x = 18.5; const c = newCmd(); c.fwd = 1; let top = 0;
  for (let i = 0; i < 160; i++) { c.jump = i === 30; stepMovement(world, a, c, DT); if (a.onGround) top = Math.max(top, a.pos.y); }
  check('cannot reach 1.8 m ledge with a plain jump', top < 0.01, `top=${top.toFixed(2)}`);
  const b = mk(); b.pos.x = 18.5; const cc = newCmd(); cc.fwd = 1; let topB = 0;
  for (let i = 0; i < 160; i++) { cc.jump = i === 30; cc.crouch = i >= 36 && i < 70; stepMovement(world, b, cc, DT); if (b.onGround) topB = Math.max(topB, b.pos.y); }
  check('crouch jump reaches 1.8 m ledge', topB > 1.79 && topB < 1.81, `top=${topB.toFixed(2)}`);
}
{
  // no wall clipping fuzz
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let clipped = 0;
  const a = mk(); a.pos = { x: 26, y: 0, z: 0 };
  for (let i = 0; i < 1000; i++) {
    const c = newCmd(); c.fwd = rnd() * 2 - 1; c.side = rnd() * 2 - 1; c.jump = rnd() < 0.05; c.crouch = rnd() < 0.1;
    a.yaw += (rnd() - 0.5) * 0.6;
    for (let k = 0; k < 8; k++) stepMovement(world, a, c, DT);
    // inside the tall wall slab x 26..27, or north wall
    const inside = (a.pos.x + MOVE.radius > 28.01 && a.pos.x - MOVE.radius < 28.99 && a.pos.y < 2.9 && Math.abs(a.pos.z) < 2 - 0.01);
    if (inside) { if (clipped < 3) console.log('inside wall at', a.pos); clipped++; }
    if (!world.hullFree(a.pos.x, a.pos.y, a.pos.z, MOVE.radius, a.crouching ? MOVE.heightCrouch : MOVE.heightStand, 2e-3)) { if (clipped < 3) console.log('clip at', a.pos, a.crouching, a.onGround); clipped++; }
    if (Math.abs(a.pos.z) > 38) { a.pos = { x: 26, y: 0, z: 0 }; }
    if (a.pos.x > 28.6 || a.pos.x < 25.4) a.pos = { x: 26, y: 0, z: 0 };
  }
  check('1000 random wall hugging inputs never clip into solids', clipped === 0, `${clipped} clips`);
}
done('movement');
