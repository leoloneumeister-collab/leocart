import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack));
await page.goto(`http://localhost:4173/?debug=1&mission=1&q=low`);
await page.waitForTimeout(5000);
const st = () => page.evaluate(() => { const g = window.__game, w = g.waveState; return { wave: w ? w.idx + 1 + '/' + w.waves.length : null, alive: g.enemies.filter((e) => !e.dead).length, shield: g.relays.map((r) => r.shielded), hp: Math.round(g.player.health), obj: document.querySelector('.objs')?.innerText.replace(/\n/g, ' | ') }; });
console.log('t0', JSON.stringify(await st()));
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => window.__game.debugClearWave());
  await page.waitForTimeout(2500);
  console.log('step', i, JSON.stringify(await st()));
  if (i === 0) await page.screenshot({ path: 'tests/shots/wave-1.png' });
}
await page.evaluate(() => { const g = window.__game; const r = g.relays[0]; g.player.pos.set(r.pos.x + 9, 0, r.pos.z + 9); r.damage(9999, g); });
await page.waitForTimeout(1500);
console.log('shieldTest', JSON.stringify(await st()));
await page.screenshot({ path: 'tests/shots/wave-shield.png' });
console.log(errs.join('\n'));
await browser.close(); stop();
