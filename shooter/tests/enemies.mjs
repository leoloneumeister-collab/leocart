import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:4173/?debug=1&mission=2&god=1&q=medium`);
await page.waitForTimeout(5500);
await page.evaluate(() => {
  const g = window.__game;
  for (const e of g.enemies) { g.scene.remove(e.rig.root); }
  g.enemies.length = 0;
  g.player.pos.set(0, 0, 50); g.player.yaw = 0; g.player.pitch = 0;
  g.hud.show(false);
  const types = ['grunt', 'rusher', 'heavy', 'boss'];
  types.forEach((t, i) => { const e = g.spawnEnemy(t, -6 + i * 4, 44, 0); e.yaw = Math.PI; e.aware = false; e.update = function () { this.rig.root.position.copy(this.pos); this.rig.root.rotation.y = this.yaw; }; });
});
await page.waitForTimeout(1500);
await page.screenshot({ path: 'tests/shots/enemies.png' });
console.log(errors.join('\n'));
await browser.close(); stop();
