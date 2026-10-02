// Generates the README screenshots and the gameplay GIF from the real game.
// Needs the dev server running (npm run dev) and ffmpeg on the PATH for the GIF.
// Usage: node scripts/capture-media.mjs
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const OUT = 'docs/screenshots';
const FRAMES = 'test-output/gif-frames';
fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const open = async (url, w = 1280, h = 720) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'load' });
  return page;
};
const shot = async (page, name, wait = 1200) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 86 });
  console.log('shot', name);
};
const ready = (page) => page.waitForFunction(() => window.leocart.race && !window.leocart.busy, null, { timeout: 40000 });

// title + character select
{
  const page = await open(BASE);
  await page.waitForSelector('.screen.title');
  await shot(page, '01-title', 3500);
  await page.click('[data-a=cup]');
  await page.waitForSelector('.card.char');
  await page.focus('.card.char[data-i="4"]');
  await shot(page, '02-character-select', 3000);
  await page.close();
}

// gameplay: meadow with an item in hand
{
  const page = await open(`${BASE}?race=meadow&char=nova&seed=7`);
  await ready(page);
  await page.evaluate(() => {
    const g = window.leocart;
    g.manual = true;
    g.race.setPlayerBot(true, 0.97);
    g.advance(24);
    g.race.player.item = { id: 'seeker', count: 1, ready: true, rollT: 0 };
    g.advance(0.3);
  });
  await shot(page, '03-meadow-run');
  await page.close();
}

// desert shortcut
{
  const page = await open(`${BASE}?race=dunes&char=zip&seed=4`);
  await ready(page);
  await page.evaluate(() => {
    const g = window.leocart;
    g.manual = true;
    const r = g.race;
    g.advance(6);
    const p = r.player;
    p.lastSafe.s = r.track.shortcuts[0].sIn - 70;
    p.respawn(r);
    r.setPlayerBot(true, 1.0);
    g.advance(3.9);
  });
  await shot(page, '04-dune-canyon-shortcut');
  await page.close();
}

// night city drift and boost, plus the GIF
{
  const page = await open(`${BASE}?race=neon&char=ember&seed=2`, 800, 450);
  await ready(page);
  await page.evaluate(() => {
    const g = window.leocart;
    g.manual = true;
    g.race.setPlayerBot(true, 0.98);
    g.advance(3.2 + 9.5);
  });
  let n = 0;
  let drift = false;
  for (let i = 0; i < 70; i++) {
    const st = await page.evaluate(() => {
      const g = window.leocart;
      g.advance(1 / 15);
      const p = g.race.player;
      return { drifting: p.drifting, boost: p.boostTimer > 0 };
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${FRAMES}/f${String(n++).padStart(3, '0')}.png` });
    if ((st.drifting || st.boost) && !drift) {
      drift = true;
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/05-neon-district-drift.jpg`, type: 'jpeg', quality: 86 });
      console.log('shot 05-neon-district-drift');
      await page.setViewportSize({ width: 800, height: 450 });
      await page.waitForTimeout(600);
    }
  }
  await page.close();
}

// results and podium come from a full simulated cup
{
  const page = await open(BASE);
  await page.waitForSelector('.screen.title');
  await page.click('[data-a=cup]');
  await page.waitForSelector('.card.char');
  await page.click('.card.char[data-i="5"]');
  for (let r = 0; r < 3; r++) {
    await page.waitForFunction(() => window.leocart.mode === 'race' && window.leocart.race && !window.leocart.busy, null, { timeout: 40000 });
    await page.evaluate(() => window.leocart.race.setPlayerBot(true, 0.985));
    for (let i = 0; i < 80; i++) {
      const st = await page.evaluate(() => {
        window.leocart.advance(5);
        return window.leocart.race ? window.leocart.race.state : 'gone';
      });
      if (st === 'done' || st === 'gone') break;
    }
    await page.waitForSelector('.screen.results', { timeout: 20000 });
    if (r === 0) await shot(page, '06-results', 2500);
    await page.click('[data-a=next]');
    await page.waitForTimeout(500);
  }
  await page.waitForSelector('.screen.final', { timeout: 20000 });
  await shot(page, '07-cup-podium', 3500);
  await page.close();
}
await browser.close();

try {
  execSync(
    `ffmpeg -y -loglevel error -framerate 15 -i ${FRAMES}/f%03d.png -vf "scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" docs/gameplay.gif`,
  );
  console.log('wrote docs/gameplay.gif', (fs.statSync('docs/gameplay.gif').size / 1e6).toFixed(1), 'MB');
} catch (e) {
  console.log('GIF skipped:', e.message.split('\n')[0]);
}
