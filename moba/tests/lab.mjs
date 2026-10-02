// Usage: node tests/lab.mjs out.png '<json for __lab.set>' [query]
// Renders the look-dev gallery with a fixed pose and saves a screenshot.
import { launch } from './lib.mjs';
const [, , out = 'tests/shots/lab.png', setJson = '{}', query = '?gallery=1&anim=0&quality=medium', w = '1280', h = '720'] = process.argv;
const browser = await launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack ?? '')));
await page.goto(`http://localhost:5174/${query}`);
await page.waitForFunction(() => window.__lab, null, { timeout: 30000 });
await page.evaluate((j) => window.__lab.set(JSON.parse(j)), setJson);
await page.waitForTimeout(700);
await page.evaluate(() => window.__lab.frame());
await page.screenshot({ path: out });
console.log('errors:', errs.length, errs.slice(0, 4).join('\n'));
await browser.close();
