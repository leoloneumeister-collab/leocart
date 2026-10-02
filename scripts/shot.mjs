// Dev helper: open the game, optionally fast-forward, grab a screenshot and print console errors.
// Usage: node scripts/shot.mjs "<url>" <out.png> [seconds-to-advance] [extra JS to run in page]
import { chromium } from 'playwright';

const [url, out, adv = '0', js = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);
try {
  if (Number(adv) > 0) await page.evaluate((s) => window.leocart.advance(s), Number(adv));
  if (js) console.log('eval ->', JSON.stringify(await page.evaluate(js)));
} catch (e) {
  errors.push(`[eval failed] ${e.message.split('\n')[0]}`);
}
await page.waitForTimeout(600);
await page.screenshot({ path: out });
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
