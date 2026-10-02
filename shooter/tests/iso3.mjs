import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:4173/?debug=1&mission=2&cp=0&god=1&q=low`);
await page.waitForTimeout(5000);
await page.evaluate(() => { const g = window.__game; g.player.pos.set(0, 0, 30); g.player.yaw = 0; g.player.pitch = 0; });
await page.waitForTimeout(800);
const out = await page.evaluate(() => {
  const g = window.__game, T = window.THREE;
  g.camera.updateMatrixWorld();
  const rc = new T.Raycaster();
  const res = [];
  for (const y of [0.9, 0.8, 0.7, 0.6]) {
    rc.setFromCamera(new T.Vector2(0, y), g.camera);
    const hits = rc.intersectObjects(g.scene.children, true).slice(0, 3);
    res.push(`y=${y}: ` + hits.map((h) => `${h.object.type}/${h.object.geometry?.type} d=${h.distance.toFixed(1)} pt=${h.point.toArray().map((v) => v.toFixed(1))} parent=${h.object.parent?.type}`).join(' | '));
  }
  return res.join('\n');
});
console.log(out);
await browser.close(); stop();
