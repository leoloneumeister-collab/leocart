import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://localhost:4173/?debug=1&mission=2&cp=0&god=1&q=low`);
await page.waitForTimeout(5000);
await page.evaluate(() => { const g = window.__game; g.hud.show(false); g.player.pos.set(0, 0, 30); g.player.yaw = 0; g.player.pitch = 0; g.viewmodel.root.visible = false; });
await page.waitForTimeout(800);
const kids = await page.evaluate(() => window.__game.scene.children.map((c, i) => `${i}:${c.type}:${c.children.length}:${c.name}`));
console.log(kids.join('\n'));
const res = [];
for (let i = 0; i < kids.length; i++) {
  await page.evaluate((i) => { const g = window.__game; g.scene.children.forEach((c, j) => { c.userData._v = c.userData._v ?? c.visible; c.visible = j !== i && c.userData._v; }); }, i);
  await page.waitForTimeout(500);
  const buf = await page.screenshot({ clip: { x: 200, y: 0, width: 240, height: 40 } });
  // measure darkness of the top strip
  const dark = await page.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += d[k] + d[k + 1] + d[k + 2]; return Math.round(s / (d.length / 4) / 3); }, buf.toString('base64'));
  res.push(`${i}:${kids[i]} -> brightness ${dark}`);
}
console.log(res.join('\n'));
await browser.close(); stop();
