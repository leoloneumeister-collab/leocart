// Usage: node tests/vfx.mjs champion "0,1,2,3" outPrefix
// Casts abilities in the real game, screenshots shortly after each cast.
import { launch } from './lib.mjs';
const [, , champion = 'ysolde', slots = '0,1,2,3', prefix = 'tests/shots/vfx', quality = 'medium', width = '1280', height = '720'] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://localhost:5174/?auto=1&quality=${quality}&fog=0&champion=${champion}&lane=mid`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(async () => {
  const g = window.__game, w = g.world, p = g.player;
  window.__api.grantXp(w, p, 99999);
  for (let s = 0; s < 4; s++) for (let k = 0; k < 4; k++) w.commands.push({ type: 'levelUp', unit: p.id, slot: s });
  window.__api.stepWorld(w);
  p.x = p.px = -10; p.z = p.pz = 10; p.facing = Math.PI * 0.75; p.order = { t: 'idle' };
  g.renderer.rig.locked = true; g.renderer.rig.dist = 38;
  g.fixedDt = 1 / 30; g.acc = 0;
});
// let the level-up flood of effects die before casting
{
  const fc0 = await page.evaluate(() => window.__game.frameCount);
  await page.waitForFunction((n) => window.__game.frameCount >= n, fc0 + 60, { timeout: 120000 });
}
for (const slot of slots.split(',').map(Number)) {
  await page.evaluate(async (slot) => {
    const g = window.__game, w = g.world, p = g.player;
    p.mana = 9999;
    p.champ.cooldowns = [0, 0, 0, 0];
    const a = p.facing;
    w.commands.push({ type: 'cast', unit: p.id, slot, x: p.x + Math.sin(a) * 16, z: p.z + Math.cos(a) * 16, target: 0 });
  }, slot);
  let fc = await page.evaluate(() => window.__game.frameCount);
  for (const [i, frames] of [4, 6, 8].entries()) {
    await page.waitForFunction((n) => window.__game.frameCount >= n, fc + frames, { timeout: 60000 });
    fc += frames;
    await page.evaluate(() => { window.__game.paused = true; });
    await page.screenshot({ path: `${prefix}_${champion}_${slot}_${i}.png` });
    await page.evaluate(() => { window.__game.paused = false; });
  }
  // let the cast finish and cooldowns settle
  await page.evaluate(() => { const p = window.__game.player; p.champ.cooldowns = [0, 0, 0, 0]; });
  fc = await page.evaluate(() => window.__game.frameCount);
  await page.waitForFunction((n) => window.__game.frameCount >= n, fc + 40, { timeout: 90000 });
}
console.log('errors:', errs.length, errs.slice(0, 3).join('\n'));
await browser.close();
