import { startServer, launch } from './lib.mjs';
const mission = process.argv[2] || '1';
const px = Number(process.argv[3] ?? 0), pz = Number(process.argv[4] ?? 10);
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:4173/?debug=1&mission=${mission}&god=1&q=low`);
await page.waitForTimeout(5000);
await page.evaluate(([x, z]) => { const g = window.__game; g.player.pos.set(x, 0, z); g.player.yaw = 0; g.player.pitch = 0; if (g.waveState) g.waveState.delay = 0.05; }, [px, pz]);
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => { const g = window.__game; const ae = g.enemies.filter((e) => !e.dead); const near = ae.filter((e) => e.pos.distanceTo(g.player.pos) < 40); return { dmg: Math.round(g.stats.damageTaken), alive: ae.length, near: near.length, sees: ae.filter((e) => e.sees).length, moving: ae.filter((e) => e.speedNow > 0).length, t: +g.time.toFixed(1) }; });
  console.log(JSON.stringify(s));
  if (i === 2) await page.screenshot({ path: 'tests/shots/sim.png' });
}
console.log(errors.slice(0, 8).join('\n'));
await browser.close(); stop();
