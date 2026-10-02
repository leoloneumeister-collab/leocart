import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack));
await page.goto(`http://localhost:4173/?debug=1&mission=1&god=1&q=medium&loadout=vk7,breaker`);
await page.waitForTimeout(5000);
await page.evaluate(() => { const g = window.__game; g.player.pos.set(-4, 0, 34); g.player.yaw = 0.05; g.player.pitch = 0.0; g.hud.show(true); });
await page.waitForTimeout(800);
for (let i = 0; i < 4; i++) {
  await page.evaluate(() => { const g = window.__game; g.input.buttons.add(0); });
  await page.waitForTimeout(60);
  await page.screenshot({ path: `tests/shots/flash-${i}.png` });
  await page.evaluate(() => { const g = window.__game; g.input.buttons.delete(0); });
  await page.waitForTimeout(500);
}
console.log(errs.join('\n'));
await browser.close(); stop();
