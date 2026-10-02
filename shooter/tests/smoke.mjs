import { startServer, launch } from './lib.mjs';

const stop = await startServer();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto('http://localhost:4173/?debug=1');
await page.waitForTimeout(2500);
await page.screenshot({ path: 'tests/shots/01-title.png' });
console.log('title ok, errors so far:', errors.length);
const info = await page.evaluate(() => ({ state: window.__game.state, fps: document.querySelector('.fps')?.textContent }));
console.log(info);
console.log(errors.slice(0, 15).join('\n'));
await browser.close();
stop();
