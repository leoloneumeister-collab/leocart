// Dev tool: renders every track as a top-down SVG then screenshots it with Playwright.
// Usage: node scripts/plot-tracks.mjs <outDir>
import { chromium } from 'playwright';
import { buildTrackData } from '../src/game/trackMath.js';
import { TRACKS } from '../src/game/tracks/index.js';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || './test-output';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
for (const def of TRACKS) {
  const t = buildTrackData(def);
  const pad = 60;
  const b = t.bounds;
  const W = b.maxX - b.minX + pad * 2;
  const H = b.maxZ - b.minZ + pad * 2;
  const sx = (x) => x - b.minX + pad;
  const sz = (z) => z - b.minZ + pad;
  let road = '';
  let line = '';
  for (let i = 0; i < t.N; i++) {
    road += `${i ? 'L' : 'M'}${sx(t.x[i]).toFixed(1)},${sz(t.z[i]).toFixed(1)}`;
    const lx = t.x[i] + t.nx[i] * t.lineOff[i];
    const lz = t.z[i] + t.nz[i] * t.lineOff[i];
    line += `${i ? 'L' : 'M'}${sx(lx).toFixed(1)},${sz(lz).toFixed(1)}`;
  }
  let extras = '';
  for (const c of t.checkpoints) extras += `<circle cx="${sx(t.x[c.i])}" cy="${sz(t.z[c.i])}" r="8" fill="#0af"/>`;
  for (const p of t.boostPads) extras += `<circle cx="${sx(t.x[p.i])}" cy="${sz(t.z[p.i])}" r="7" fill="#fa0"/>`;
  for (const r of t.itemRows) extras += `<rect x="${sx(t.x[r.i]) - 5}" y="${sz(t.z[r.i]) - 5}" width="10" height="10" fill="#c0f"/>`;
  for (const sc of t.shortcuts) extras += `<polyline fill="none" stroke="#c96" stroke-width="${sc.width}" stroke-opacity=".6" points="${sc.pts.map((p) => `${sx(p[0])},${sz(p[1])}`).join(' ')}"/>`;
  const open = [];
  for (let i = 0; i < t.N; i++) if (t.openL[i] || t.openR[i]) open.push(`<circle cx="${sx(t.x[i])}" cy="${sz(t.z[i])}" r="3" fill="#f33"/>`);
  const w = t.def.width;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="background:#2a3a2a">
  <path d="${road}Z" fill="none" stroke="#111" stroke-width="${w + 4}"/>
  <path d="${road}Z" fill="none" stroke="#777" stroke-width="${w}"/>
  <path d="${line}Z" fill="none" stroke="#fe0" stroke-width="1.5"/>
  ${open.join('')}${extras}
  <circle cx="${sx(t.x[0])}" cy="${sz(t.z[0])}" r="10" fill="#fff" stroke="#f00" stroke-width="3"/>
  <text x="14" y="30" fill="#fff" font-size="22" font-family="sans-serif">${def.name}  L=${t.length.toFixed(0)}m</text></svg>`;
  await page.setViewportSize({ width: Math.ceil(W), height: Math.ceil(H) });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: path.join(out, `track-${def.id}.png`) });
  console.log('wrote', def.id);
}
await browser.close();
