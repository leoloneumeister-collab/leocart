// Draws the app icons from the game's own art (the Keep sprite on a little island) and saves PNGs.
// Needs the dev server running (npm run tidehold:dev). Run: node tidehold/tools/make-icons.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5174/';
const out = new URL('../public/icons/', import.meta.url).pathname;
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'load' });
const data = await page.evaluate(async () => {
  const A = await import('/js/art.js');
  const make = (size) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const k = size / 512;
    const bg = g.createRadialGradient(size * 0.5, size * 0.3, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
    bg.addColorStop(0, '#5cc4f2');
    bg.addColorStop(1, '#1c68a6');
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    // waves
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 5 * k;
    g.lineCap = 'round';
    for (const [x, y, l] of [[90, 420, 50], [380, 440, 40], [60, 300, 34], [440, 330, 44]]) {
      g.beginPath();
      g.moveTo((x - l) * k, y * k);
      g.quadraticCurveTo(x * k, (y - l * 0.35) * k, (x + l) * k, y * k);
      g.stroke();
    }
    // island diamond
    const cx = size / 2;
    const cy = size * 0.66;
    const w = size * 0.74;
    const h = w / 2;
    const dia = (r, fill) => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(cx, cy - h * r / 2);
      g.lineTo(cx + w * r / 2, cy);
      g.lineTo(cx, cy + h * r / 2);
      g.lineTo(cx - w * r / 2, cy);
      g.closePath();
      g.fill();
    };
    g.save();
    g.translate(0, 26 * k);
    dia(1, '#8a5a33');
    g.restore();
    g.fillStyle = '#7c522e';
    g.beginPath();
    g.moveTo(cx - w / 2, cy);
    g.lineTo(cx, cy + h / 2);
    g.lineTo(cx, cy + h / 2 + 26 * k);
    g.lineTo(cx - w / 2, cy + 26 * k);
    g.closePath();
    g.fill();
    dia(1, '#f3deaa');
    dia(0.9, '#8fd46d');
    // the Keep
    const sp = A.buildingSprite('keep', 3, 'p', 4, 0, 2);
    const sw = sp.canvas.width;
    const sh = sp.canvas.height;
    const scale = (size * 0.66) / sw;
    // footprint centre of a 4x4 keep sits at (ox, oy + 2 * TH) in the sprite
    const fx = sp.ox * 2;
    const fy = (sp.oy + 4 * 16) * 2;
    g.drawImage(sp.canvas, cx - fx * scale, cy + 4 * k - fy * scale, sw * scale, sh * scale);
    return c.toDataURL('image/png');
  };
  return { 192: make(192), 512: make(512), 180: make(180) };
});
for (const [size, url] of Object.entries(data)) {
  const buf = Buffer.from(url.split(',')[1], 'base64');
  fs.writeFileSync(`${out}icon-${size}.png`, buf);
  console.log(`wrote icon-${size}.png (${buf.length} bytes)`);
}
await browser.close();
