import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(`http://localhost:4173/?debug=1&mission=2&cp=0&god=1&q=low`);
await page.waitForTimeout(5000);
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.player.pos.set(0, 0, 33); g.player.yaw = 0; g.player.pitch = 0; g.viewmodel.root.visible = false; });
await page.waitForTimeout(800);
const shots = { A: () => {}, B: () => { window.__game.setup.sky.visible = false; }, C: () => { const g = window.__game; g.setup.sky.visible = true; g.weather.mesh.visible = false; }, D: () => { const g = window.__game; g.fx.add.points.visible = false; g.fx.norm.points.visible = false; }, E: () => { const g = window.__game; g.sun.castShadow = false; } };
for (const [k, f] of Object.entries(shots)) {
  await page.evaluate(f);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `tests/shots/iso4-${k}.png`, clip: { x: 0, y: 0, width: 960, height: 160 } });
}
await browser.close(); stop();
