// Packs the production build into one self-contained page (CSS and JS inlined, no other files).
// Usage: npm run tidehold:build && node tidehold/tools/build-single-file.mjs <out.html> [--fragment]
// --fragment writes only the page content (no doctype/head/body), which is what claude.ai artifacts want.
// --stage=<dir> also copies models/ and icons/ui/ into <dir> for publishing next to the page. Artifacts do not
// serve .glb, so the models are staged as .wasm (any binary the host will serve works, GLTFLoader sniffs the bytes).
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find((a) => !a.startsWith('--')) || 'tidehold-single.html';
const dist = new URL('../dist/', import.meta.url).pathname;
const assets = path.join(dist, 'assets');
const css = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find((f) => f.endsWith('.css'))), 'utf8');
const stage = (args.find((a) => a.startsWith('--stage=')) || '').slice(8);
let js = fs.readFileSync(path.join(assets, fs.readdirSync(assets).find((f) => f.endsWith('.js'))), 'utf8').replace(/<\/script/gi, '<\\/script');
if (stage) js = js.replace(/\.glb\b/g, '.wasm');
const icon = 'data:image/png;base64,' + fs.readFileSync(path.join(dist, 'icons/icon-192.png')).toString('base64');
const body = `<canvas id="scene" tabindex="-1"></canvas>
<div id="ui"></div>
<div id="boot"><div class="logo">TIDE<b>HOLD</b></div><div class="bar"><i></i></div></div>
<script type="module">${js}</script>
`;
const head = `<title>Tidehold</title>
<style>${css}</style>
`;
const page = fragment
  ? head + body
  : `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"><meta name="theme-color" content="#2a86c4"><link rel="icon" href="${icon}">
${head}</head><body>
${body}</body></html>
`;
if (stage) {
  const copy = (from, to, rename = (n) => n) => {
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      if (e.isDirectory()) copy(path.join(from, e.name), path.join(to, e.name), rename);
      else {
        fs.mkdirSync(to, { recursive: true });
        fs.copyFileSync(path.join(from, e.name), path.join(to, rename(e.name)));
      }
    }
  };
  fs.rmSync(stage, { recursive: true, force: true });
  copy(path.join(dist, 'models'), path.join(stage, 'models'), (n) => n.replace(/\.glb$/, '.wasm'));
  copy(path.join(dist, 'icons/ui'), path.join(stage, 'icons/ui'));
  console.log(`staged assets in ${stage}`);
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1e3).toFixed(0)} KB${fragment ? ', fragment' : ''})`);
