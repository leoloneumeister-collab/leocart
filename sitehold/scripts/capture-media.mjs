/**
 * Captures the README screenshots from the built game (run `npm run build` first). Output: docs/screenshots/*.jpg
 * Usage: node scripts/capture-media.mjs
 */
import { mkdirSync } from 'node:fs';
import { startServer, launch } from '../tests/lib.mjs';

mkdirSync('docs/screenshots', { recursive: true });
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const shot = (n) => page.screenshot({ path: `docs/screenshots/${n}.jpg`, type: 'jpeg', quality: 82 });
const adv = (secs) => page.evaluate((s) => { const g = window.__game, sim = g.sim, h = sim.human; for (let i = 0; i < Math.round(s * 64); i++) { g.prepareHumanCmd(sim, h); sim.step(); g.handleEvents(sim.drainEvents()); } }, secs);
const put = (x, z, yaw, pitch = 0) => page.evaluate(([x, z, yaw, pitch]) => { const g = window.__game, h = g.sim.human; h.pos = { x, y: 0, z }; h.prev = { x, y: 0, z }; h.vel = { x: 0, y: 0, z: 0 }; g.viewYaw = yaw; g.viewPitch = pitch; }, [x, z, yaw, pitch]);

await page.goto('http://localhost:4173/?debug=1');
await page.waitForTimeout(3500);
await shot('01-menu');

await page.goto('http://localhost:4173/?debug=1&auto=1&side=0&diff=1&seed=21&money=16000&god=1');
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.__game, sim = g.sim, h = sim.human; sim.buy(h, 'carbine'); sim.buy(h, 'armor'); sim.buy(h, 'smoke'); sim.buy(h, 'flash'); h.drawEnd = 0; g.toggleBuy(); });
await page.waitForTimeout(700);
await shot('02-buy-menu');
await page.evaluate(() => window.__game.toggleBuy());
await adv(16);
await page.evaluate(() => { const sim = window.__game.sim; sim.brains.forEach((b) => b.setIntent({ k: 'idle' })); for (const a of sim.actors) if (a !== sim.human) { a.pos = { x: 10, y: 0, z: 10 }; a.prev = { ...a.pos }; } });
await put(48.5, 14, Math.PI * 0.5 + 0.35, 0.02);
await page.evaluate(() => { const sim = window.__game.sim; const foes = sim.actors.filter((a) => a.team === 1); foes[0].pos = { x: 36, y: 0, z: 19.5 }; foes[0].prev = { ...foes[0].pos }; foes[0].cmd.yaw = foes[0].yaw = -1; foes[1].pos = { x: 33.5, y: 0, z: 16.5 }; foes[1].prev = { ...foes[1].pos }; });
await page.waitForTimeout(1200);
await shot('03-hall-fight');
await page.evaluate(() => { const g = window.__game, h = g.sim.human; h.grenades.smoke = 1; g.sim.throwGrenade(h, 'smoke', 1); });
await adv(4);
await shot('04-smoke');
await page.keyboard.down('Tab');
await page.waitForTimeout(700);
await shot('05-scoreboard');
await page.keyboard.up('Tab');
await page.goto('http://localhost:4173/?debug=1&auto=1&side=1&diff=1&seed=9&god=1');
await page.waitForTimeout(1500);
await adv(16);
await page.evaluate(() => {
  const g = window.__game, sim = g.sim, h = sim.human;
  for (const a of sim.actors) if (a !== h && a.team !== h.team) { a.pos = { x: 10, y: 0, z: 10 }; a.prev = { ...a.pos }; sim.brains.get(a.id).setIntent({ k: 'idle' }); }
  for (const a of sim.actors) a.hasBomb = false; h.hasBomb = true; sim.bomb.state = 'carried';
  h.pos = { x: 83, y: 0, z: 13 }; h.prev = { ...h.pos }; g.viewYaw = -1.2; g.viewPitch = -0.1;
});
await page.keyboard.down('KeyE');
await adv(1.8);
await page.waitForTimeout(500);
await shot('06-planting');
await page.keyboard.up('KeyE');
await browser.close();
stop();
console.log('screenshots written to docs/screenshots');
