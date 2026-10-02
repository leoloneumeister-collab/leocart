import { check, near, done } from './helpers.mjs';
import { Sim } from '../src/sim/sim.ts';
import { DT, ECON, ROUND } from '../src/sim/constants.ts';
import { mkWeapon } from '../src/sim/actor.ts';
import { buyItem, priceFor } from '../src/sim/economy.ts';
import { throwGrenade } from '../src/sim/grenades.ts';

const shared = new Sim({ mode: 'comp', humanSide: 0, difficulty: 1, seed: 3, passive: true });
const mk = (side = 0) => new Sim({ mode: 'comp', humanSide: side, difficulty: 1, seed: 3, passive: true }, { map: shared.map, world: shared.world, nav: shared.nav });
const run = (sim, secs, cmdFn) => { for (let i = 0; i < Math.round(secs / DT); i++) { cmdFn?.(); sim.step(); sim.drainEvents(); } };
const goLive = (sim) => { while (sim.m.phase === 'freeze') { sim.step(); sim.drainEvents(); } };

console.log('rules');
{
  const sim = mk(0); const h = sim.human;
  check('round 1 is a pistol round with $800', sim.actors.every((a) => a.money === 800) && sim.m.round === 1);
  check('everyone starts with their side pistol', sim.actors.every((a) => a.secondary.def.id === (a.team === 0 ? 'marshal' : 'viper')));
  check('exactly one Breacher carries the bomb', sim.actors.filter((a) => a.hasBomb).length === 1 && sim.actors.find((a) => a.hasBomb).team === 1);
  h.money = 16000;
  check('Sentinels cannot buy Breacher rifles', priceFor(h, 'vk47') === -1 && priceFor(h, 'carbine') === 3100);
  check('only Sentinels can buy a defuse kit', priceFor(h, 'kit') === 400 && priceFor(sim.actors.find((a) => a.team === 1), 'kit') === -1);
  check('buying works during freeze time', buyItem(sim, h, 'carbine') && h.money === 16000 - 3100);
  check('armor then helmet upgrade costs 350', buyItem(sim, h, 'kevlar') && h.armor === 100 && !h.helmet && priceFor(h, 'armor') === 350 && buyItem(sim, h, 'armor') && h.helmet);
  buyItem(sim, h, 'flash'); buyItem(sim, h, 'flash');
  check('at most two flashbangs', priceFor(h, 'flash') === -1 && h.grenades.flash === 2);
  buyItem(sim, h, 'smoke'); buyItem(sim, h, 'he');
  check('at most four grenades in total', grenadeTotal(h) === 4 && priceFor(h, 'fire') === -1, `${grenadeTotal(h)}`);
  function grenadeTotal(a) { return a.grenades.flash + a.grenades.smoke + a.grenades.he + a.grenades.fire; }
  goLive(sim);
  check('no buying once the round is live', !buyItem(sim, h, 'kevlar', true) || h.armor === 100);
}

{
  // round win and loss money
  const sim = mk(0); const h = sim.human;
  goLive(sim);
  const bre = sim.actors.filter((a) => a.team === 1);
  for (const a of bre) sim.killForTest(a, h); // Sentinels eliminate the Breachers
  const killMoney = 300 * 5;
  sim.step(); sim.drainEvents();
  check('Sentinels win by elimination', sim.m.roundWinner === 0 && sim.m.reason === 'elimination' && sim.m.score[0] === 1);
  near('winner gets $3250 plus kill rewards', h.money, 800 + ECON.winElim + killMoney, 1);
  const mate = sim.actors.find((a) => a.team === 0 && a !== h);
  check('teammates get the win money too', mate.money === 800 + ECON.winElim);
  check('losers get the first loss bonus of $1400', bre.every((a) => a.money === 800 + ECON.lossBonus[0]), `${bre.map((a) => a.money)}`);
  // second round, same side loses again -> 1900
  run(sim, ROUND.end + 0.1);
  goLive(sim);
  for (const a of sim.actors.filter((a) => a.team === 0)) sim.killForTest(a, sim.actors.find((x) => x.team === 1));
  sim.step(); sim.drainEvents();
  check('Breachers win round 2', sim.m.roundWinner === 1 && sim.m.score[1] === 1 && sim.m.score[0] === 1);
  const sMate = sim.actors.find((a) => a.team === 0 && a !== h), bMate = sim.actors.find((a) => a.team === 1);
  check('a win then a loss pays $3250 then $1400', sMate.money === 800 + ECON.winElim + ECON.lossBonus[0], `${sMate.money}`);
  check('a loss then a win pays $1400 then $3250', bMate.money >= 800 + ECON.lossBonus[0] + ECON.winElim, `${bMate.money}`);
}

{
  // plant, explosion, kill zone
  const sim = mk(1); const h = sim.human;
  goLive(sim);
  for (const a of sim.actors) if (a !== h && a.team === 1) a.hasBomb = false;
  h.hasBomb = true; sim.bomb.state = 'carried';
  const site = sim.map.sites[0];
  h.pos = { ...site.plant }; h.prev = { ...h.pos };
  const t0 = sim.time;
  run(sim, 3.0, () => { h.cmd.use = true; });
  check('not planted after 3.0 s', sim.bomb.state === 'carried' && h.planting > 2.9);
  run(sim, 0.4, () => { h.cmd.use = true; });
  check('planted after 3.2 s', sim.bomb.state === 'planted' && sim.bomb.site === 'A', sim.bomb.state);
  near('plant takes 3.2 s', sim.bomb.plantedAt - t0, 3.2, 0.1);
  near('planter earned $300', h.money, 800 + 300, 1);
  near('bomb timer is 40 s', sim.bombTimeLeft(), 40, 0.5);
  // move the human out of the blast
  h.pos = { x: 20, y: 0, z: 60 }; h.prev = { ...h.pos };
  const hp0 = sim.actors.filter((a) => a.team === 0).map((a) => a.health);
  run(sim, 40.2);
  check('bomb explodes after 40 s and Breachers win', sim.bomb.state === 'exploded' && sim.m.roundWinner === 1 && sim.m.reason === 'bomb');
  check('losing Sentinels still collect the loss bonus', sim.actors.filter((a) => a.team === 0).every((a) => a.money === 800 + ECON.lossBonus[0]), `${sim.actors.filter((a) => a.team === 0).map((a) => a.money)}`);
}

{
  // defuse timings and the plant bonus for losing breachers
  for (const kit of [false, true]) {
    const sim = mk(0); const h = sim.human;
    goLive(sim);
    const b = sim.actors.find((a) => a.team === 1);
    sim.bomb.state = 'planted'; sim.bomb.site = 'A'; sim.bomb.pos = { x: 83, y: 0, z: 13 }; sim.bomb.plantedAt = sim.time; sim.bomb.explodeAt = sim.time + 40; sim.bomb.plantedBy = b.id;
    h.kit = kit; h.pos = { x: 83, y: 0, z: 14.4 }; h.prev = { ...h.pos };
    const t0 = sim.time;
    let done_ = false;
    for (let i = 0; i < 64 * 14 && !done_; i++) { h.cmd.use = true; sim.step(); sim.drainEvents(); if (sim.bomb.state === 'defused') done_ = true; }
    near(kit ? 'defuse with a kit takes 5 s' : 'defuse without a kit takes 10 s', sim.time - t0, kit ? 5 : 10, 0.1);
    if (!kit) check('Breachers who planted but lost get the $800 plant bonus plus loss bonus', sim.actors.filter((a) => a.team === 1).every((a) => a.money === 800 + 800 + ECON.lossBonus[0]), `${sim.actors.filter((a) => a.team === 1).map((a) => a.money)}`);
    near('defuser earns $300', h.money, 800 + 300 + ECON.winBomb, 1);
  }
}

{
  // stopping a defuse resets it
  const sim = mk(0); const h = sim.human;
  goLive(sim);
  sim.bomb.state = 'planted'; sim.bomb.site = 'A'; sim.bomb.pos = { x: 83, y: 0, z: 13 }; sim.bomb.explodeAt = sim.time + 40; sim.bomb.plantedBy = 5;
  h.pos = { x: 83, y: 0, z: 14.4 }; h.prev = { ...h.pos };
  run(sim, 3, () => { h.cmd.use = true; });
  check('defuse progress builds', h.defusing > 2.9);
  run(sim, 0.1, () => { h.cmd.use = false; });
  check('letting go resets the defuse', h.defusing === 0 && sim.bomb.defuser === -1);
}

{
  // smoke blocks vision, flash blinds
  const sim = mk(0); const h = sim.human;
  goLive(sim);
  const foe = sim.actors.find((a) => a.team === 1);
  h.pos = { x: 36, y: 0, z: 14 }; h.prev = { ...h.pos }; h.yaw = 0; h.cmd.yaw = 0; h.pitch = 0;
  foe.pos = { x: 60, y: 0, z: 14 };
  const eye = { x: h.pos.x, y: 1.63, z: h.pos.z };
  check('open lane has line of sight', sim.visible(eye.x, eye.y, eye.z, foe.pos.x, 1.2, foe.pos.z));
  sim.smokes.push({ id: 1, pos: { x: 48, y: 0.2, z: 14 }, start: sim.time - 3, end: sim.time + 15, r: 3.7 });
  check('a smoke between two players blocks sight', !sim.visible(eye.x, eye.y, eye.z, foe.pos.x, 1.2, foe.pos.z));
  sim.smokes.length = 0;
  // flash right in front of the human, facing it
  h.cmd.yaw = -Math.PI / 2; h.yaw = -Math.PI / 2; // facing east
  const g = { id: 9, kind: 'flash', owner: foe.id, pos: { x: 40, y: 1.6, z: 14 }, vel: { x: 0, y: 0, z: 0 }, born: sim.time - 1.59, bounces: 0, rest: 0, alive: true };
  sim.grenades.push(g);
  run(sim, 0.1);
  check('a flash in front of you blinds you for several seconds', h.flashEnd - sim.time > 3, `${(h.flashEnd - sim.time).toFixed(1)} s`);
  const fullBlind = h.flashFull - sim.time;
  check('the white out phase is shorter than the whole effect', fullBlind > 0.5 && fullBlind < h.flashEnd - sim.time);
  // one facing away is blinded less
  const sim2 = mk(0); const h2 = sim2.human; goLive(sim2);
  h2.pos = { x: 36, y: 0, z: 14 }; h2.prev = { ...h2.pos }; h2.cmd.yaw = Math.PI / 2; h2.yaw = Math.PI / 2; // facing west, away from the flash
  sim2.grenades.push({ id: 9, kind: 'flash', owner: 5, pos: { x: 40, y: 1.6, z: 14 }, vel: { x: 0, y: 0, z: 0 }, born: sim2.time - 1.59, bounces: 0, rest: 0, alive: true });
  run(sim2, 0.1);
  check('looking away shortens the flash', h2.flashEnd - sim2.time < (h.flashEnd - sim.time) * 0.6, `${(h2.flashEnd - sim2.time).toFixed(1)} s`);
}

{
  // HE damage falls off, never hurts teammates
  const sim = mk(0); const h = sim.human;
  goLive(sim);
  const foes = sim.actors.filter((a) => a.team === 1);
  const mate = sim.actors.find((a) => a.team === 0 && a !== h);
  const c = { x: 44, y: 0, z: 14 };
  foes[0].pos = { x: c.x + 1, y: 0, z: c.z }; foes[1].pos = { x: c.x + 5, y: 0, z: c.z }; mate.pos = { x: c.x + 1, y: 0, z: c.z + 1 };
  h.pos = { x: 36, y: 0, z: 14 }; h.prev = { ...h.pos };
  sim.grenades.push({ id: 7, kind: 'he', owner: h.id, pos: { x: c.x, y: 0.2, z: c.z }, vel: { x: 0, y: 0, z: 0 }, born: sim.time - 1.59, bounces: 0, rest: 0, alive: true });
  run(sim, 0.1);
  check('HE deals heavy damage up close and less far away', foes[0].health < foes[1].health && foes[0].health < 40, `${foes[0].health} vs ${foes[1].health}`);
  check('HE does not hurt teammates', mate.health === 100);
}

{
  // asking for a drop
  const sim = mk(0); const h = sim.human;
  for (const a of sim.actors) if (a.team === 0 && a !== h) a.money = 5000;
  sim.ai[0].giveDrop(h);
  check('a rich teammate drops a rifle for you', sim.drops.some((d) => d.weaponId === 'carbine'));
}
done('rules');
