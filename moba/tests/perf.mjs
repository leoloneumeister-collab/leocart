// Main-thread cost per frame in a busy late game (10 champions, full waves). GPU time is not measured
// (headless uses a software rasterizer), so this is the JS-side budget: it must stay far below 16 ms.
import { launch } from './lib.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:5174/?auto=1&quality=medium&fog=1&lane=mid');
await page.waitForFunction(() => window.__game);
const info = await page.evaluate(async () => {
  const g = window.__game;
  const w = g.world;
  g.player.champ.isBot = true;
  const t0 = performance.now();
  let ticks = 0;
  for (let i = 0; i < 30 * 60 * 14; i++) {
    window.__api.stepWorld(w);
    w.drainEvents();
    ticks++;
  }
  const simMs = performance.now() - t0;
  g.renderer.rig.setTarget(g.player.x, g.player.z);
  return { t: w.time, tickMs: simMs / ticks, units: w.units.length, projectiles: w.projectiles.length };
});
console.log('sim', info);
await page.waitForTimeout(500);
await page.evaluate(() => window.__game.perf());
await page.waitForTimeout(6000);
const perf = await page.evaluate(() => window.__game.perf());
const gl = await page.evaluate(() => {
  const i = window.__game.renderer.renderer.info;
  return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
});
console.log('frame (ms, main thread):', Object.fromEntries(Object.entries(perf).map(([k, v]) => [k, +v.toFixed(2)])));
console.log('gl', gl);
await browser.close();
