// Usage: node tests/shot.mjs "<query>" out.png [waitMs] [js]
import { launch } from './lib.mjs';
const [, , query = '?auto=1&slice=1&quality=low', out = 'tests/shots/shot.png', wait = '2500', js = ''] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:5174/${query}`);
await page.waitForTimeout(Number(wait));
if (js) { const r = await page.evaluate(js); if (r !== undefined) console.log(JSON.stringify(r)); await page.waitForTimeout(800); }
await page.screenshot({ path: out });
console.log('errors:', errs.length);
console.log(errs.slice(0, 12).join('\n'));
await browser.close();
