// Performance budget check: CPU cost of simulation + render submission, draw calls, triangles.
// GPU raster time cannot be measured in headless software GL, so we budget what we can measure.
// Run: node tests/perf.mjs  (dev server on BASE_URL)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
for (const track of ['meadow', 'dunes', 'neon']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`${BASE}?race=${track}&char=nova&seed=3`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.leocart.race && !window.leocart.busy, null, { timeout: 40000 });
  const r = await page.evaluate(() => {
    const g = window.leocart;
    const race = g.race;
    race.setPlayerBot(true);
    g.advance(12); // into the race
    // simulation cost: 600 steps of the full 6-kart race at 60 Hz
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) race.update(1 / 60, null);
    const simMs = (performance.now() - t0) / 600;
    // render submission cost (JS side) and scene statistics
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) race.render();
    const renderMs = (performance.now() - t1) / 20;
    race.render();
    const info = g.renderer.info;
    return {
      simMs, renderMs,
      calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, tex: info.memory.textures,
      cpuFrameMs: simMs + renderMs,
    };
  });
  const okCalls = r.calls < 400;
  const okSim = r.simMs < 3;
  console.log(`${track.padEnd(7)} sim ${r.simMs.toFixed(2)} ms/step  render-submit ${r.renderMs.toFixed(1)} ms  draw calls ${r.calls}  triangles ${(r.tris / 1000).toFixed(0)}k  geometries ${r.geos}  textures ${r.tex}  ${okCalls && okSim ? 'OK' : 'OVER BUDGET'}`);
  if (!okCalls || !okSim) failed = true;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
