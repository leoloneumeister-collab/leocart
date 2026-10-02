import { startServer, launch } from './lib.mjs';
const mission = process.argv[2] || '1';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:4173/?debug=1&mission=${mission}&god=1&q=medium&loadout=vk7,breaker`);
await page.waitForTimeout(5500);
const shot = (n) => page.screenshot({ path: `tests/shots/${n}.png` });
// teleport near the gate guards and face them
await page.evaluate(() => { const g = window.__game; g.player.pos.set(0, 0, 36); g.player.yaw = 0; g.player.pitch = 0; });
await page.waitForTimeout(1200);
await shot('fight-1');
// auto-aim helper: face nearest enemy and fire
for (let i = 0; i < 14; i++) {
  await page.evaluate(() => {
    const g = window.__game; const p = g.player;
    let best = null, bd = 1e9;
    for (const e of g.enemies) { if (e.dead) continue; const d = e.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = e; } }
    if (best) {
      const h = best.headPos(new g.player.pos.constructor());
      const eye = p.eye(new g.player.pos.constructor());
      const dx = h.x - eye.x, dy = h.y - eye.y, dz = h.z - eye.z;
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); p.recoilPitch = 0; p.recoilYaw = 0;
      g.input.buttons.add(0);
    }
  });
  await page.waitForTimeout(500);
  if (i === 5) await shot('fight-2');
  if (i === 10) await shot('fight-3');
}
await page.evaluate(() => window.__game.input.buttons.delete(0));
const st = await page.evaluate(() => ({ ...window.__game.stats, alive: window.__game.enemies.filter((e) => !e.dead).length, hp: window.__game.player.health }));
console.log(JSON.stringify(st));
console.log(errors.slice(0, 10).join('\n'));
await browser.close(); stop();
