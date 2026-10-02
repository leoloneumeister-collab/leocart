// Packs the production build into one self contained HTML file, so the game runs by double clicking it (file://).
// Usage: npm run build && node scripts/single-file.mjs   ->   dist/sitehold.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const assets = readdirSync(join(dist, 'assets'));
const js = readFileSync(join(dist, 'assets', assets.find((f) => f.endsWith('.js'))), 'utf8');
const css = readFileSync(join(dist, 'assets', assets.find((f) => f.endsWith('.css'))), 'utf8');

let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/\s*<script type="module"[^>]*><\/script>/, '');
html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`);
// inline module scripts are deferred, so the DOM is ready when it runs. Escape anything that would close the tag early
html = html.replace('</body>', () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>\n</body>`);

writeFileSync(join(dist, 'sitehold.html'), html);
console.log(`dist/sitehold.html  ${(html.length / 1024).toFixed(0)} KB`);
