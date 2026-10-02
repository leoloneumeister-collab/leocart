import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:4173/?debug=1&mission=1&cp=3&god=1&q=low`);
await page.waitForTimeout(5000);
for (let i = 0; i < 6; i++) {
  console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game; const m = g.mission; return { heliT: m.heliT, ext: m.extractActive, done: m.done, t: g.time, d: Math.hypot(g.player.pos.x + 44, g.player.pos.z + 74), st: g.state, comp: g.completing }; })));
  await page.waitForTimeout(4000);
  if (i === 1) await page.evaluate(() => { const g = window.__game; g.player.pos.set(-44, 0, -70); });
}
await page.screenshot({ path: 'tests/shots/dbg.png' });
console.log(errors.join('\n'));
await browser.close(); stop();
