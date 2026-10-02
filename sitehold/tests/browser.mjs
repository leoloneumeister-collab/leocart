/**
 * End to end test in headless Chromium (software GL). Drives the real built game with real key and mouse events,
 * fast forwarding the fixed tick sim between actions so it does not depend on the software renderer's frame rate.
 */
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { startServer, launch, watch } from './lib.mjs';
import { check, done } from './helpers.mjs';

mkdirSync('tests/shots', { recursive: true });
if (!process.env.SKIP_BUILD) execSync('npx vite build', { stdio: 'ignore' });
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = watch(page);
const shot = (n) => page.screenshot({ path: `tests/shots/${n}.png` });

/** Run n seconds of sim time with the human's real input applied, like the game loop does. */
const advance = (secs) => page.evaluate((s) => {
  const g = window.__game, sim = g.sim, h = sim.human;
  for (let i = 0; i < Math.round(s * 64); i++) { if (h) g.prepareHumanCmd(sim, h); sim.step(); g.handleEvents(sim.drainEvents()); }
}, secs);
const state = () => page.evaluate(() => {
  const g = window.__game, sim = g.sim, h = sim.human;
  return { phase: sim.m.phase, round: sim.m.round, x: h.pos.x, y: h.pos.y, z: h.pos.z, hp: h.health, alive: h.alive, money: h.money, team: h.team,
    ammo: h.primary ? h.primary.ammo : h.secondary?.ammo, cur: h.cur, primary: h.primary?.def.id ?? null, grenades: sim.grenades.length, smokes: sim.smokes.length,
    bomb: sim.bomb.state, armor: h.armor, kit: h.kit, flashes: h.grenades.flash, smokesLeft: h.grenades.smoke, scope: h.scope, state: g.state };
});

console.log('browser');

// ------------------------------------------------------------------ menu
await page.goto('http://localhost:4173/?debug=1');
await page.waitForSelector('#menu .brand', { timeout: 20000 });
await page.waitForTimeout(1500);
await shot('t01-menu');
check('main menu is shown', await page.isVisible('#menu .brand'));
const px = await page.evaluate(() => { const c = document.getElementById('game'); return c.width * c.height > 0; });
check('canvas has a size', px);
await page.click('#menu .seg[data-id="side"] button[data-v="1"]');
await page.click('#menu .seg[data-id="difficulty"] button[data-v="1"]');
await page.click('#m-play');
await page.waitForTimeout(800);
let st = await state();
check('match starts in freeze time as a Breacher', st.phase === 'freeze' && st.team === 1, JSON.stringify(st));
await page.evaluate(() => { window.__game.input.locked = true; window.__game.sim.human.money = 9000; });

// ------------------------------------------------------------------ buy menu
await page.keyboard.press('KeyB');
await page.waitForTimeout(300);
check('buy menu opens with B', await page.isVisible('#buy .panel'));
await shot('t02-buy');
await page.click('#buy .item:has-text("VK-47")');
await page.click('#buy .item:has-text("Kevlar + Helmet")');
await page.click('#buy .item:has-text("Smoke")');
await page.click('#buy .item:has-text("Flashbang")');
st = await state();
check('bought rifle, armor, utility', st.primary === 'vk47' && st.armor === 100 && st.smokesLeft === 1 && st.flashes === 1, JSON.stringify(st));
check('money was spent', st.money === 9000 - 2700 - 1000 - 300 - 200, `money=${st.money}`);
await page.keyboard.press('KeyB');
await page.waitForTimeout(200);
check('buy menu closes', !(await page.isVisible('#buy .panel')));

// ------------------------------------------------------------------ live: movement and shooting
await page.evaluate(() => { const g = window.__game, sim = g.sim; sim.human.drawEnd = 0; for (const a of sim.actors) if (!a.isHuman) { a.cmd.yaw = a.cmd.yaw; } });
await advance(16);
st = await state();
check('round goes live', st.phase === 'live', st.phase);
await page.evaluate(() => { const g = window.__game, h = g.sim.human; h.pos = { x: 48.5, y: 0, z: 62 }; h.prev = { ...h.pos }; g.viewYaw = 0; g.viewPitch = 0; h.health = 100; });
const s0 = await state();
await page.keyboard.down('KeyW');
await advance(0.8);
await page.keyboard.up('KeyW');
let s1 = await state();
check('W moves forward along the view direction', s0.z - s1.z > 2.5 && Math.abs(s1.x - s0.x) < 0.5, `moved ${(s0.z - s1.z).toFixed(2)} m`);
await page.keyboard.down('Space');
await advance(0.25);
s1 = await state();
await page.keyboard.up('Space');
check('Space jumps', s1.y > 0.5, `y=${s1.y.toFixed(2)}`);
await advance(1);
await page.mouse.move(640, 360);
const a0 = (await state()).ammo;
await page.mouse.down();
await advance(0.5);
await page.mouse.up();
const a1 = (await state()).ammo;
check('left click fires the rifle', a1 < a0 - 3, `ammo ${a0} -> ${a1}`);
await shot('t03-shooting');
await page.keyboard.press('KeyR');
await advance(3);
const a2 = (await state()).ammo;
check('R reloads', a2 === 30, `ammo=${a2}`);
await page.keyboard.press('Digit2');
await advance(0.1);
check('2 switches to the pistol', (await state()).cur === 'secondary');
await page.keyboard.press('Digit3');
await advance(0.1);
check('3 switches to the knife', (await state()).cur === 'knife');
await page.keyboard.press('Digit1');
await advance(1);

// ------------------------------------------------------------------ grenades
await page.keyboard.press('Digit4');
await advance(0.7);
check('4 selects a grenade', (await state()).cur === 'grenade');
await page.keyboard.press('Digit4');
await advance(0.2);
check('pressing 4 again cycles to the smoke', await page.evaluate(() => window.__game.sim.human.grenadeSel === 'smoke'));
await page.evaluate(() => { const g = window.__game; g.viewPitch = 0.2; });
await page.mouse.down();
await advance(0.4);
await page.mouse.up();
await advance(0.2);
check('releasing the button throws', (await state()).grenades > 0 || (await state()).smokes > 0);
await advance(4);
st = await state();
check('smoke bursts and stays', st.smokes === 1 && st.smokesLeft === 0, JSON.stringify({ s: st.smokes, left: st.smokesLeft }));
await page.evaluate(() => { const g = window.__game, h = g.sim.human; h.cur = 'primary'; });
await shot('t04-after-throw');

// ------------------------------------------------------------------ scoreboard and pause
await page.keyboard.down('Tab');
await page.waitForTimeout(500);
check('Tab shows the scoreboard', await page.isVisible('#scoreboard .panel'));
await shot('t05-scoreboard');
await page.keyboard.up('Tab');
await page.waitForTimeout(500);
await page.evaluate(() => window.__game.pause());
await page.waitForTimeout(300);
check('pause menu opens', await page.isVisible('.overlay .panel:has-text("Paused")'));
await page.click('#p-set');
check('settings open from pause', await page.isVisible('#s-back'));
await page.click('[data-tab="Crosshair"]');
await page.waitForTimeout(200);
await shot('t06-settings');
await page.click('#s-back');
await page.click('#p-leave');
await page.waitForTimeout(800);
check('leaving returns to the menu', await page.isVisible('#menu .brand'));

// ------------------------------------------------------------------ plant and defuse flow
await page.goto('http://localhost:4173/?debug=1&auto=1&side=1&diff=0&seed=9&god=1');
await page.waitForTimeout(1500);
await advance(16);
await page.evaluate(() => {
  const g = window.__game, sim = g.sim, h = sim.human;
  for (const a of sim.actors) if (a !== h && a.team !== h.team) { a.pos = { x: 10, y: 0, z: 10 }; a.prev = { ...a.pos }; sim.brains.get(a.id).setIntent({ k: 'idle' }); a.cmd.fwd = 0; } // park the defenders far away for a quiet plant
  for (const a of sim.actors) if (a !== h && a.team === h.team) { a.hasBomb = false; }
  h.hasBomb = true; sim.bomb.state = 'carried';
  h.pos = { x: 83, y: 0, z: 13 }; h.prev = { ...h.pos }; h.vel = { x: 0, y: 0, z: 0 };
});
await page.keyboard.down('KeyE');
await advance(1.5);
st = await state();
check('holding E starts the plant and shows the bar', st.bomb === 'carried' && (await page.evaluate(() => window.__game.sim.human.planting)) > 1);
await shot('t07-planting');
await advance(2.2);
await page.keyboard.up('KeyE');
st = await state();
check('bomb gets planted after 3.2 s', st.bomb === 'planted', st.bomb);
await advance(1);
await shot('t08-planted');
check('planting pays the planter', st.money >= 300);

// defuse as a sentinel in a fresh match
await page.goto('http://localhost:4173/?debug=1&auto=1&side=0&diff=0&seed=10&god=1');
await page.waitForTimeout(1500);
await advance(16);
await page.evaluate(() => {
  const g = window.__game, sim = g.sim, h = sim.human;
  const b = sim.actors.find((a) => a.team === 1 && a.hasBomb) ?? sim.actors.find((a) => a.team === 1);
  for (const a of sim.actors) if (a.team === 1 && a !== b) a.alive = false;
  b.pos = { x: 76, y: 0, z: 20 }; b.hasBomb = true; b.alive = true;
  sim.bomb.state = 'planted'; sim.bomb.site = 'A'; sim.bomb.plantedAt = sim.time; sim.bomb.explodeAt = sim.time + 40; sim.bomb.pos = { x: 83, y: 0, z: 13 };
  b.hasBomb = false; b.alive = false;
  h.kit = true; h.pos = { x: 83, y: 0, z: 14.5 }; h.prev = { ...h.pos }; h.vel = { x: 0, y: 0, z: 0 };
});
await page.keyboard.down('KeyE');
await advance(2);
check('defuse is in progress with a kit', (await page.evaluate(() => window.__game.sim.human.defusing)) > 1.5);
await shot('t09-defusing');
await advance(3.5);
await page.keyboard.up('KeyE');
st = await state();
check('bomb defused in 5 seconds with a kit', st.bomb === 'defused', st.bomb);
await advance(1);
await shot('t10-round-won');
check('Sentinels win the round', await page.evaluate(() => window.__game.sim.m.roundWinner === 0));

// ------------------------------------------------------------------ deathmatch
await page.goto('http://localhost:4173/?debug=1&auto=1&mode=dm&diff=1&seed=3');
await page.waitForTimeout(1500);
await advance(30);
st = await state();
const dm = await page.evaluate(() => { const sim = window.__game.sim; return { kills: sim.actors.reduce((s, a) => s + a.stats.kills, 0), phase: sim.m.phase }; });
check('deathmatch runs with kills and respawns', dm.phase === 'dm' && dm.kills > 3, JSON.stringify(dm));
await shot('t11-deathmatch');

// ------------------------------------------------------------------ halftime swap and match end
await page.goto('http://localhost:4173/?debug=1&auto=1&side=0&diff=2&seed=4&round=8');
await page.waitForTimeout(2500);
const half = await page.evaluate(() => { const sim = window.__game.sim; const h = sim.human; return { round: sim.m.round, swapped: sim.m.swapped, team: h.team, money: h.money, hist: sim.m.history.length, phase: sim.m.phase, grp: h.grp }; });
check('sides swap after round 7 and the economy resets', half.swapped && half.team === 1 && half.money <= 800 + 100 && half.hist === 7 && half.round === 8, JSON.stringify(half));
await shot('t12-after-halftime');
await page.goto('http://localhost:4173/?debug=1&auto=1&side=1&diff=1&seed=6&god=1');
await page.waitForTimeout(1500);
await advance(16);
await page.evaluate(() => {
  const g = window.__game, sim = g.sim, h = sim.human;
  sim.m.score[h.grp] = 7;
  for (const a of sim.actors) if (a.team !== h.team) sim.killForTest(a, h);
});
await advance(10);
check('winning the 8th round ends the match', await page.evaluate(() => window.__game.sim.m.phase === 'over' && window.__game.sim.m.winnerGrp === window.__game.sim.human.grp));
await page.waitForSelector('#results .panel', { timeout: 5000 });
check('results screen shows', await page.isVisible('#results .panel') && (await page.textContent('#results')).includes('Victory'));
await shot('t13-results');
await page.click('#r-again');
await page.waitForTimeout(500);
check('play again starts a fresh match', await page.evaluate(() => window.__game.sim.m.round === 1 && window.__game.state === 'playing'));

// ------------------------------------------------------------------ every sound function runs without throwing
await page.goto('http://localhost:4173/?debug=1&auto=1&side=0&diff=0&seed=2');
await page.waitForTimeout(1200);
const audioReport = await page.evaluate(() => {
  const a = window.__audio; a.init();
  const pos = { x: 10, y: 1, z: 10 };
  const calls = [
    () => a.gun('rifle', pos, 20, 1, 1), () => a.gun('pistol', null, 0), () => a.gun('sniper', pos, 60), () => a.gun('shotgun', pos, 5), () => a.gun('smg', pos, 5),
    () => a.click(1000, 0.05, 0.3, pos, 3, 0.01), () => a.reload('rifle', pos, 3), () => a.reload('shotgun', null, 0), () => a.dryfire(null, 0), () => a.draw(pos, 3),
    () => a.tone(440, 0.1), () => a.hitMarker(), () => a.headshot(), () => a.kill(), () => a.uiClick(), () => a.uiHover(), () => a.buy(), () => a.deny(), () => a.pickup(),
    () => a.roundStart(), () => a.win(), () => a.lose(), () => a.tick(), () => a.hurt(), () => a.step('sand', pos, 5), () => a.step('metal', null, 0), () => a.land(pos, 4, 8),
    () => a.whoosh(), () => a.stab(pos, 2, true), () => a.stab(null, 0, false), () => a.explosion(pos, 20, true), () => a.flashBang(pos, 8), () => a.smokePop(pos, 8),
    () => a.flashRing(1.5), () => a.bombBeep(pos, 8, true), () => a.plantTone(pos, 8), () => a.defuseTick(pos, 4), () => a.defused(), () => a.radio('Enemy spotted at A site'),
    () => a.setListener({ x: 0, y: 1.6, z: 0 }, 1.2), () => a.setVolumes(0.5, 0.2), () => { a.startMusic(); a.stopMusic(); }, () => a.toggleMute(), () => a.toggleMute(),
  ];
  const failures = [];
  calls.forEach((c, i) => { try { c(); } catch (e) { failures.push(`${i}: ${e.message}`); } });
  return { total: calls.length, failures, state: a.ctx ? a.ctx.state : 'no context' };
});
check('every sound function runs without throwing', audioReport.failures.length === 0, JSON.stringify(audioReport));

// ------------------------------------------------------------------ renderer stats and errors
const info = await page.evaluate(() => { const i = window.__game.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; });
console.log('  renderer', JSON.stringify(info));
check('draw calls stay modest', info.calls < 600, `${info.calls} calls`);
check('no console errors during the whole run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
stop();
done('browser');
