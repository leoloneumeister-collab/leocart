// Packs the production build into one self-contained HTML page (CSS and JS inlined, no other files).
// Handy for hosts that only take a single page. Usage: npm run build && node scripts/build-single-file.mjs <out.html>
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'dist-single/leocart.html';
const dir = 'dist/assets';
const css = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.css'))), 'utf8');
let js = fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => f.endsWith('.js'))), 'utf8');
js = js.replace(/<\/script/gi, '<\\/script');
const page = `<title>LeoCart</title>
<style>${css}</style>
<canvas id="gl" tabindex="-1"></canvas>
<div id="hud" class="hidden"></div>
<div id="ui"></div>
<div id="boot" class="boot"><div class="boot-logo">LEO<b>CART</b></div><div class="boot-bar"><i></i></div></div>
<script type="module">${js}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1e6).toFixed(2)} MB)`);
