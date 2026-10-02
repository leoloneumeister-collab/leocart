import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://localhost:4173/?debug=1&mission=2&cp=0&god=1&q=low`);
await page.waitForTimeout(5000);
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.viewmodel.root.visible = false; for (const e of g.enemies) g.scene.remove(e.rig.root); g.player.pos.set(-30, 0, -43); g.player.yaw = 0; g.player.pitch = 0.1; });
await page.waitForTimeout(800);
const steps = {
  A: () => {},
  B: () => { const m = window.__game.level.group.children.find((c) => c.material?.metalness === 0.28).material; m.map = null; m.needsUpdate = true; },
  C: () => { const m = window.__game.level.group.children.find((c) => c.material?.metalness === 0.28).material; m.metalness = 0; m.needsUpdate = true; },
  D: () => { const m = window.__game.level.group.children.find((c) => c.material?.metalness === 0.28).material; m.vertexColors = false; m.color.set(0x888888); m.needsUpdate = true; },
};
for (const [k, f] of Object.entries(steps)) {
  await page.evaluate(f);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `tests/shots/iso5-${k}.png` });
}
console.log(await page.evaluate(() => { const m = window.__game.level.group.children.filter((c) => c.material?.vertexColors).map((c) => `${c.material.metalness}/${c.material.roughness}`); return m.join(' '); }));
await browser.close(); stop();
