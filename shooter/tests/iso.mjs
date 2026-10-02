import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:4173/?debug=1&mission=2&cp=0&god=1&q=low`);
await page.waitForTimeout(5000);
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.player.pos.set(0, 0, 30); g.player.yaw = 0; g.player.pitch = 0; });
await page.waitForTimeout(800);
const kids = await page.evaluate(() => window.__game.level.group.children.map((c, i) => `${i}:${c.type}:${c.geometry?.type}:${c.geometry?.attributes?.position?.count}`));
console.log(kids.join('\n'));
for (const i of [9, 10, 11, 12]) {
  await page.evaluate((i) => { const g = window.__game; g.level.group.children.forEach((c, j) => (c.visible = j !== i)); }, i);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `tests/shots/iso-${i}.png`, clip: { x: 0, y: 0, width: 1280, height: 200 } });
}
await browser.close(); stop();
