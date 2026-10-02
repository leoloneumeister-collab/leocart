import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack));
await page.goto(`http://localhost:4173/?debug=1&mission=1&q=medium&loadout=breaker,vk7`);
await page.waitForTimeout(5000);
const ev = (f, a) => page.evaluate(f, a);
// 1. barrel explosion kills nearby grunt
console.log('barrel', await ev(() => {
  const g = window.__game; const b = g.barrels[0]; const e = g.spawnEnemy('grunt', b.pos.x + 2, b.pos.z + 1, 0);
  g.player.pos.set(b.pos.x - 12, 0, b.pos.z); g.player.yaw = -Math.PI / 2; const hp0 = e.hp; b.damage(999, g); return [hp0, g.barrels.length];
}));
await page.waitForTimeout(1500);
console.log('after barrel', await ev(() => { const g = window.__game; return [g.enemies.at(-1).hp, g.enemies.at(-1).dead, g.barrels.length]; }));
await page.screenshot({ path: 'tests/shots/misc-barrel.png' });
// 2. grenade
await ev(() => { const g = window.__game; g.player.health = 100; g.throwGrenade(g.player.pos.clone().add({ x: 0, y: 2, z: -6 }), g.player.pos.clone()); });
await page.waitForTimeout(3500);
console.log('grenade hp', await ev(() => window.__game.player.health));
await page.screenshot({ path: 'tests/shots/misc-grenade.png' });
// 3. knife on rusher
await ev(() => { const g = window.__game; g.player.health = 100; const p = g.player; const e = g.spawnEnemy('rusher', p.pos.x, p.pos.z - 1.6, 0); e.update = function () {}; e.rig.root.position.copy(e.pos); p.yaw = 0; p.pitch = 0; window.__rusher = e; });
await page.keyboard.press('KeyF');
await page.waitForTimeout(1500);
console.log('knife', await ev(() => [window.__rusher.hp, window.__rusher.dead]));
// 4. shotgun reload
await ev(() => { const g = window.__game; const w = g.weapons; w.cw.mag = 2; });
await page.keyboard.press('KeyR');
await page.waitForTimeout(5000);
console.log('shotgun reload', await ev(() => { const w = window.__game.weapons; return [w.cw.mag, w.cw.reserve, w.reloading]; }));
// 5. heavy + boss shoot
await ev(() => { const g = window.__game; g.god = true; for (const t of ['heavy', 'rusher']) { const e = g.spawnEnemy(t, g.player.pos.x + 6, g.player.pos.z - 10, 0, true); } });
await page.waitForTimeout(6000);
console.log('enemies ok', await ev(() => window.__game.enemies.filter((e) => !e.dead).length));
console.log(errs.join('\n'));
await browser.close(); stop();
