// Renders apps/icons/*.svg to the PNG sizes phones want for home-screen icons. Run: node scripts/make-app-icons.mjs
// PNGs are full bleed squares (no rounded corners) so they also work as maskable icons.
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'icons');
const names = readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.replace('.svg', ''));
const sizes = [180, 192, 512];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const name of names) {
  const svg = readFileSync(path.join(dir, name + '.svg'), 'utf8').replace(/rx="112"/g, 'rx="0"');
  for (const size of sizes) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    const buf = await page.screenshot({ type: 'png', omitBackground: true });
    writeFileSync(path.join(dir, `${name}-${size}.png`), buf);
  }
}
await browser.close();
console.log('wrote', names.length * sizes.length, 'icons');
