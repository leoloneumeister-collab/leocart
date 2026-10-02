import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:4173/?debug=1&mission=1&god=1&q=low`);
await page.waitForTimeout(5000);
const ev = (f, a) => page.evaluate(f, a);
const status = () => ev(() => { const g = window.__game; return { state: g.state, cp: g.cp, relays: g.stats.relays, alive: g.enemies.filter((e) => !e.dead).length, enemies: g.enemies.length, heli: g.heli.group.visible }; });
console.log('start', JSON.stringify(await status()));
// destroy relays one by one, walking there
for (let i = 0; i < 3; i++) {
  await ev((i) => { const g = window.__game; const r = g.relays.find((r) => !r.destroyed); g.player.pos.set(r.pos.x, 0, r.pos.z + 9); g.player.yaw = 0; r.damage(9999, g); }, i);
  await page.waitForTimeout(1500);
  console.log('relay', i, JSON.stringify(await status()));
  await page.screenshot({ path: `tests/shots/flow1-relay${i}.png` });
}
await page.waitForTimeout(13000);
console.log('after wave', JSON.stringify(await status()));
await page.screenshot({ path: 'tests/shots/flow1-heli.png' });
await ev(() => { const g = window.__game; g.player.pos.set(-44, 0, -70); });
await ev(() => { window.__game.mission.heliT = 0.995; });
await page.waitForTimeout(6000);
console.log('heli', JSON.stringify(await status()));
await page.screenshot({ path: 'tests/shots/flow1-heli2.png' });
await page.waitForTimeout(14000);
console.log('end', JSON.stringify(await status()));
await page.screenshot({ path: 'tests/shots/flow1-results.png' });
console.log(errors.slice(0, 10).join('\n'));
await browser.close(); stop();
