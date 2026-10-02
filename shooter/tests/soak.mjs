import { startServer, launch } from './lib.mjs';
const mission = process.argv[2] || '2';
const px = Number(process.argv[3] ?? 0), pz = Number(process.argv[4] ?? 0);
const secs = Number(process.argv[5] ?? 90);
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack));
await page.goto(`http://localhost:4173/?debug=1&mission=${mission}&god=1&q=low&loadout=hornet,vk7`);
await page.waitForTimeout(5000);
await page.evaluate(([x, z]) => { const g = window.__game; g.player.pos.set(x, 0, z); for (const e of g.enemies) e.becomeAware(g, 0); }, [px, pz]);
const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < secs * 1000) {
  await page.evaluate(() => {
    const g = window.__game, p = g.player;
    let best = null, bd = 1e9;
    for (const e of g.enemies) { if (e.dead || !e.sees) continue; const d = e.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = e; } }
    if (best) {
      const h = best.headPos(new p.pos.constructor()), eye = p.eye(new p.pos.constructor());
      const dx = h.x - eye.x, dy = h.y - eye.y, dz = h.z - eye.z;
      p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); p.recoilPitch = 0; p.recoilYaw = 0;
      g.input.buttons.add(0);
    } else { g.input.buttons.delete(0); }
    if (g.weapons.cw.mag < 5) g.weapons.startReload();
    g.weapons.cw.reserve = 999;
  });
  await page.waitForTimeout(400);
  if (++i % 15 === 0) console.log(JSON.stringify(await page.evaluate(() => { const g = window.__game; return { t: +g.time.toFixed(0), kills: g.stats.kills, alive: g.enemies.filter((e) => !e.dead).length, total: g.enemies.length, fps: document.querySelector('.fps')?.textContent }; })));
}
await page.screenshot({ path: 'tests/shots/soak.png' });
console.log('errors:', errs.length, errs.slice(0, 5).join('\n'));
await browser.close(); stop();
