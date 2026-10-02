import { startServer, launch } from './lib.mjs';
const mission = process.argv[2] || '1';
const cp = process.argv[3] || '0';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:4173/?debug=1&mission=${mission}&cp=${cp}&god=1&q=medium`);
await page.waitForTimeout(6000);
const shot = async (name) => { await page.screenshot({ path: `tests/shots/${name}.png` }); };
await shot(`m${mission}-start`);
const cams = JSON.parse(process.argv[4] || '[]');
for (let i = 0; i < cams.length; i++) {
  const [x, z, yaw, pitch] = cams[i];
  await page.evaluate(([x, z, yaw, pitch]) => { const g = window.__game; g.player.pos.set(x, 0, z); g.player.yaw = yaw; g.player.pitch = pitch; }, [x, z, yaw, pitch]);
  await page.waitForTimeout(1500);
  await shot(`m${mission}-cam${i}`);
}
console.log(await page.evaluate(() => document.querySelector('.fps')?.textContent));
console.log(errors.slice(0, 20).join('\n'));
await browser.close();
stop();
