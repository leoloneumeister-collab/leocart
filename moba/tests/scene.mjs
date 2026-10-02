// Usage: node tests/scene.mjs out.png '{"min":4,"x":0,"z":0,"dist":40,"champion":"kestrel","quality":"medium","fog":0}'
// Simulates N minutes of bot play, then frames a world position with the real renderer and saves a screenshot.
import { launch } from './lib.mjs';
const [, , out = 'tests/shots/scene.png', optJson = '{}'] = process.argv;
const o = { min: 3, x: 0, z: 0, dist: 44, champion: 'ironvow', quality: 'medium', fog: 0, w: 1280, h: 720, ...JSON.parse(optJson) };
const browser = await launch();
const page = await browser.newPage({ viewport: { width: o.w, height: o.h } });
const errs = [];
page.on('console', (m) => { if (['error'].includes(m.type())) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack ?? '')));
await page.goto(`http://localhost:5174/?auto=1&quality=${o.quality}&fog=${o.fog}&champion=${o.champion}&lane=mid`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__game, null, { timeout: 90000 });
await page.evaluate(async (o) => {
  const g = window.__game;
  const w = g.world;
  g.player.champ.isBot = true;
  for (let i = 0; i < 30 * 60 * o.min; i++) { window.__api.stepWorld(w); w.drainEvents(); }
  if (o.focus) {
    const us = w.units.filter((u) => u.alive && (o.focus === 'minions' ? u.kind === 'minion' : o.focus === 'monsters' ? u.kind === 'monster' : u.kind === o.focus));
    if (us.length) {
      const pick = us[Math.floor(us.length / 2)];
      o.x = pick.x + (o.dx ?? 0);
      o.z = pick.z + (o.dz ?? 0);
    }
  }
  g.renderer.rig.locked = false;
  g.renderer.rig.dist = o.dist;
  g.renderer.rig.setTarget(o.x, o.z);
  g.renderer.rig.x = o.x; g.renderer.rig.z = o.z;
}, o);
await page.waitForTimeout(o.wait ?? 3500);
await page.screenshot({ path: out });
console.log('errors:', errs.length, errs.slice(0, 3).join('\n'));
await browser.close();
