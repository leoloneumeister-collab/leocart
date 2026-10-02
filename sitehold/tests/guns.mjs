import { check, near, done } from './helpers.mjs';
import { Sim } from '../src/sim/sim.ts';
import { mkWeapon } from '../src/sim/actor.ts';
import { sprayPattern, WEAPONS } from '../src/sim/weapons.ts';
import { computeDamage } from '../src/sim/combat.ts';
import { DT } from '../src/sim/constants.ts';
import { eyePos } from '../src/sim/actor.ts';

const shared = new Sim({ mode: 'comp', humanSide: 1, difficulty: 1, seed: 7 });
const mk = () => new Sim({ mode: 'comp', humanSide: 1, difficulty: 1, seed: 7 }, { map: shared.map, world: shared.world, nav: shared.nav });

function setup(weapon, dist, opts = {}) {
  const sim = mk();
  sim.m.phase = 'live'; sim.m.phaseEnd = 1e9;
  const me = sim.human, foe = sim.actors.find((a) => a.team !== me.team);
  for (const a of sim.actors) if (a !== me && a !== foe) { a.alive = false; }
  me.pos = { x: 48.5, y: 0, z: 40 }; me.yaw = 0; me.pitch = 0;
  foe.pos = { x: 48.5, y: 0, z: 40 - dist }; foe.yaw = Math.PI; foe.vel = { x: 0, y: 0, z: 0 };
  me.primary = mkWeapon(weapon); me.cur = 'primary'; me.drawEnd = 0; me.nextAttack = 0;
  foe.armor = opts.armor ?? 0; foe.helmet = opts.helmet ?? false; foe.health = 100;
  return { sim, me, foe };
}
function aimAt(me, p) {
  const e = eyePos(me);
  me.yaw = me.cmd.yaw = Math.atan2(-(p.x - e.x), -(p.z - e.z));
  me.pitch = me.cmd.pitch = Math.atan2(p.y - e.y, Math.hypot(p.x - e.x, p.z - e.z));
}
function tap(sim, me) {
  me.cmd.fire = true; sim.step(); me.cmd.fire = false; sim.step();
}

console.log('guns');
{
  const { sim, me, foe } = setup('vk47', 20);
  aimAt(me, { x: foe.pos.x, y: 1.68, z: foe.pos.z });
  tap(sim, me);
  check('rifle headshot at 20 m kills an unarmored target in one shot', !foe.alive, `hp=${foe.health}`);
}
{
  const { sim, me, foe } = setup('vk47', 20, { armor: 100, helmet: true });
  aimAt(me, { x: foe.pos.x, y: 1.68, z: foe.pos.z });
  tap(sim, me);
  check('rifle headshot through a helmet still kills at mid range (one tap feel)', !foe.alive, `hp=${foe.health}`);
}
{
  const { sim, me, foe } = setup('vk47', 10, { armor: 100, helmet: true });
  aimAt(me, { x: foe.pos.x, y: 1.3, z: foe.pos.z });
  tap(sim, me);
  near('rifle chest shot into armor does about 28 damage', 100 - foe.health, 28, 3);
  check('armor absorbs a little', foe.armor < 100 && foe.armor > 90, `armor=${foe.armor}`);
}
{
  const { sim, me, foe } = setup('bolt50', 30);
  aimAt(me, { x: foe.pos.x, y: 1.3, z: foe.pos.z });
  me.scope = 2;
  tap(sim, me);
  check('heavy sniper one shot to the chest kills', !foe.alive);
}
{
  const { sim, me, foe } = setup('marshal', 10);
  me.secondary = mkWeapon('cobra'); me.primary = null; me.cur = 'secondary';
  aimAt(me, { x: foe.pos.x, y: 1.68, z: foe.pos.z });
  tap(sim, me);
  check('hand cannon headshot one taps', !foe.alive);
}
{
  const { sim, me, foe } = setup('hornet', 8);
  aimAt(me, { x: foe.pos.x, y: 1.0, z: foe.pos.z });
  me.cmd.fire = true;
  let ticks = 0;
  while (foe.alive && ticks < 400) { sim.step(); ticks++; }
  me.cmd.fire = false;
  near('SMG time to kill at 8 m is under half a second', ticks * DT, 0.25, 0.3);
}
{
  // determinism and shape of the spray pattern
  const def = WEAPONS.vk47; const pat = sprayPattern(def);
  check('first bullet has no recoil', pat[0][0] === 0 && pat[0][1] === 0);
  check('pattern climbs steeply then flattens', pat[8][0] > pat[3][0] && pat[20][0] - pat[10][0] < pat[10][0] - pat[2][0]);
  const again = sprayPattern(def);
  check('pattern is deterministic', again === pat || JSON.stringify(again) === JSON.stringify(pat));
  const { sim, me } = setup('vk47', 25);
  me.cmd.fire = true;
  let shots = 0, lastAmmo = me.primary.ammo;
  while (shots < 10) { sim.step(); if (me.primary.ammo < lastAmmo) { shots += lastAmmo - me.primary.ammo; lastAmmo = me.primary.ammo; } }
  me.cmd.fire = false;
  near('ten bullets in, accumulated punch matches the pattern pitch', me.punchP, pat[10][0], 0.6);
}
{
  // movement inaccuracy
  const { me } = setup('vk47', 25);
  const { currentSpread } = await import('../src/sim/combat.ts');
  const still = currentSpread(me);
  me.vel = { x: 5, y: 0, z: 0 };
  const moving = currentSpread(me);
  me.vel = { x: 0, y: 0, z: 0 }; me.onGround = false;
  const air = currentSpread(me);
  check('standing still is pin accurate for the first shot', still < 0.1, `${still.toFixed(3)} deg`);
  check('running is wildly inaccurate', moving > 3, `${moving.toFixed(2)} deg`);
  check('jumping is worse than running', air > moving - 1, `${air.toFixed(2)} deg`);
}
{
  // wallbang through wood
  const sim = mk(); sim.m.phase = 'live'; sim.m.phaseEnd = 1e9;
  const me = sim.human, foe = sim.actors.find((a) => a.team !== me.team);
  for (const a of sim.actors) if (a !== me && a !== foe) a.alive = false;
  me.pos = { x: 6.9, y: 0, z: 29 }; me.yaw = 0; me.pitch = 0;
  foe.pos = { x: 6.9, y: 0, z: 22 }; foe.yaw = Math.PI;
  me.primary = mkWeapon('vk47'); me.cur = 'primary';
  aimAt(me, { x: 6.9, y: 1.3, z: 22 });
  const kills = []; tap(sim, me);
  check('bullets pass through a thin wooden wall', foe.health < 100, `hp=${foe.health}`);
  near('damage is reduced by the wall', 100 - foe.health, 36 * 0.62, 5);
  // stone wall blocks
  foe.health = 100; foe.pos = { x: 6.9, y: 0, z: 14 };
  me.pos = { x: 18, y: 0, z: 40 }; // behind big stone
  aimAt(me, { x: 18, y: 1.3, z: 4 }); // straight through plaster walls
  foe.pos = { x: 18, y: 0, z: 4 }; foe.health = 100;
  me.nextAttack = 0; tap(sim, me);
  check('solid walls stop bullets', foe.health === 100, `hp=${foe.health}`);
}
{
  // economy and kill reward
  const { sim, me, foe } = setup('vk47', 15);
  me.money = 0;
  aimAt(me, { x: foe.pos.x, y: 1.68, z: foe.pos.z }); tap(sim, me);
  check('kill reward 300 plus round win 3250', me.money === 3550, `money=${me.money}`);
  check('kill is counted', me.stats.kills === 1 && foe.stats.deaths === 1);
}
{
  const dmg = computeDamage(36, 'leg', 0.775, { armor: 100, helmet: true });
  check('legs are not protected by armor, and take 0.75x', dmg.health === 27 && dmg.armor === 0, JSON.stringify(dmg));
}
done('guns');
