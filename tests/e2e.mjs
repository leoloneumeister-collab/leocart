// End-to-end test. Loads the real game in headless Chromium, drives it, and fails on any
// console error. Run with: npm test   (needs `npm run dev` or `npm run preview` on BASE_URL)
//
// Covers: title screen, keyboard driving, drifting, items, pause, a full race on every
// track with all six karts finishing, and a complete 3-race cup played through the UI.

import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const OUT = process.env.OUT_DIR || 'test-output';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const results = [];
const errors = [];
let failed = false;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed = true;
}

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      errors.push(`[${m.type()}] ${m.text()}`);
      console.log(`      console ${m.type()}: ${m.text().slice(0, 300)}`);
    }
  });
  page.on('pageerror', (e) => {
    errors.push(`[pageerror] ${e.message}`);
    console.log(`      pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`);
  });
  return page;
}

// ---------------------------------------------------------------- 1. boot and title
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.screen.title', { timeout: 20000 });
  check('title screen renders', true);
  const gl = await page.evaluate(() => !!document.getElementById('gl').getContext && window.leocart.renderer.getContext().getParameter(7938));
  check('WebGL context is live', !!gl, String(gl).slice(0, 40));
  await page.screenshot({ path: `${OUT}/title.png` });
  await page.close();
}

// ---------------------------------------------------------------- 2. controls feel
{
  const page = await newPage();
  await page.goto(`${BASE}?race=meadow&char=nova&seed=4`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.leocart.race && !window.leocart.busy, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const g = window.leocart;
    const race = g.race;
    const p = race.player;
    g.advance(7); // intro + countdown
    const out = { state: race.state };
    g.input.down.add('KeyW');
    g.advance(4);
    out.speedAfter4s = p.speed;
    const h0 = p.h;
    g.input.down.add('KeyD');
    g.advance(0.8);
    out.turnedRight = h0 - p.h; // heading decreases when turning right
    g.input.down.delete('KeyD');
    g.input.down.add('KeyA');
    g.advance(1.6);
    g.input.down.delete('KeyA');
    out.turnedLeftNet = p.h - h0;
    // drift: hold shift while steering. Walls are removed so the test is about charging, not about the road layout.
    for (let i = 0; i < race.track.N; i++) {
      race.track.limL[i] = 1e5;
      race.track.limR[i] = 1e5;
    }
    g.input.down.add('KeyW');
    g.advance(2);
    g.input.down.add('KeyA');
    g.input.down.add('ShiftLeft');
    g.advance(0.5);
    out.drifting = p.drifting;
    g.advance(2.2);
    out.driftLevel = p.driftLevel;
    g.input.down.delete('ShiftLeft');
    g.advance(0.1);
    out.boostAfterDrift = p.boostTimer;
    g.input.down.delete('KeyA');
    g.advance(3);
    g.input.down.add('KeyW');
    g.advance(3);
    g.input.down.delete('KeyW');
    out.fullSpeed = p.speed;
    g.input.down.add('KeyS');
    g.advance(1.2);
    out.brakedTo = p.speed;
    g.input.down.delete('KeyS');
    return out;
  });
  check('race reaches racing state after intro and countdown', r.state === 'racing', r.state);
  check('accelerate key builds speed', r.speedAfter4s > 15, `${r.speedAfter4s.toFixed(1)} m/s`);
  check('steering right turns the kart right', r.turnedRight > 0.3, `${r.turnedRight.toFixed(2)} rad`);
  check('drift starts when holding drift and steering', r.drifting === true);
  check('drift charges and releases a mini-turbo', r.driftLevel >= 1 && r.boostAfterDrift > 0, `level ${r.driftLevel}, boost ${r.boostAfterDrift.toFixed(2)}s`);
  check('brake slows the kart', r.brakedTo < r.fullSpeed * 0.4, `${r.fullSpeed.toFixed(1)} -> ${r.brakedTo.toFixed(1)} m/s`);

  // pause
  await page.keyboard.press('Escape');
  await page.waitForSelector('.modal.pause', { timeout: 5000 });
  check('pause menu opens with Escape', true);
  const frozen = await page.evaluate(() => {
    const g = window.leocart;
    const t0 = g.race.time;
    g.race.update(0.5, null);
    return g.race.time === t0;
  });
  check('simulation is frozen while paused', frozen);
  await page.screenshot({ path: `${OUT}/pause.png` });
  await page.click('[data-a=resume]');
  await page.waitForFunction(() => !document.querySelector('.modal.pause'), null, { timeout: 5000 });
  check('resume closes the pause menu', true);
  await page.close();
}

// ---------------------------------------------------------------- 3. full race on every track
for (const trackId of ['meadow', 'dunes', 'neon']) {
  const page = await newPage();
  await page.goto(`${BASE}?race=${trackId}&char=ember&seed=9`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.leocart.race, null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const g = window.leocart;
    const race = g.race;
    race.setPlayerBot(true);
    const ev = {};
    race.on((t) => (ev[t] = (ev[t] || 0) + 1));
    let guard = 0;
    while (race.state !== 'done' && guard++ < 120) g.advance(5);
    const res = race.results || [];
    return {
      state: race.state,
      time: race.time,
      ev,
      finished: res.filter((x) => x.finished).length,
      places: res.map((x) => x.place),
      laps: race.karts.map((k) => k.lap),
      respawns: ev.respawn || 0,
    };
  });
  check(`${trackId}: race completes`, r.state === 'done', `${r.time.toFixed(0)} s race time`);
  check(`${trackId}: all 6 racers finish 3 laps`, r.finished === 6 && r.laps.every((l) => l === 3), JSON.stringify(r.laps));
  check(`${trackId}: places are unique 1..6`, [...r.places].sort().join() === '1,2,3,4,5,6');
  check(`${trackId}: items were picked up and used`, (r.ev.itemGet || 0) > 10 && (r.ev.itemUse || 0) > 5, `${r.ev.itemGet} pickups, ${r.ev.itemUse} uses, ${r.ev.hit || 0} hits`);
  check(`${trackId}: checkpoints registered`, (r.ev.checkpoint || 0) >= 9);
  check(`${trackId}: bots rarely need rescuing`, r.respawns <= 4, `${r.respawns} respawns`);
  await page.screenshot({ path: `${OUT}/race-${trackId}-end.png` });
  await page.close();
}

// ---------------------------------------------------------------- 4. cup through the UI
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.screen.title');
  await page.click('[data-a=cup]');
  await page.waitForSelector('.card.char');
  await page.click('.card.char[data-i="5"]');
  const names = [];
  for (let n = 0; n < 3; n++) {
    await page.waitForFunction(() => window.leocart.mode === 'race' && window.leocart.race, null, { timeout: 40000 });
    names.push(await page.evaluate(() => window.leocart.race.def.name));
    await page.evaluate(() => window.leocart.race.setPlayerBot(true));
    for (let i = 0; i < 80; i++) {
      const st = await page.evaluate(() => {
        window.leocart.advance(5);
        return window.leocart.race ? window.leocart.race.state : 'gone';
      });
      if (st === 'done' || st === 'gone') break;
    }
    await page.waitForSelector('.screen.results', { timeout: 20000 });
    if (n === 0) await page.screenshot({ path: `${OUT}/results.png` });
    await page.click('[data-a=next]');
    await page.waitForTimeout(400);
  }
  check('cup plays the three tracks in order', names.join() === 'Meadow Run,Dune Canyon,Neon District', names.join(' > '));
  await page.waitForSelector('.screen.final', { timeout: 20000 });
  const rows = await page.evaluate(() => document.querySelectorAll('.screen.final .rtable tr').length);
  check('cup final shows 6 standings', rows === 6, `${rows} rows`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/cup-final.png` });
  await page.close();
}

// ---------------------------------------------------------------- 5. settings persist
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('.screen.title');
  await page.click('[data-a=settings]');
  await page.waitForSelector('.screen.settings');
  await page.click('[data-bind="drift"][data-slot="0"]');
  await page.keyboard.press('KeyG');
  const label = await page.textContent('[data-bind="drift"][data-slot="0"]');
  check('key rebinding works', label.trim() === 'G', label);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('leocart.v1')).bindings.drift[0]);
  check('settings are saved to localStorage', stored === 'KeyG', stored);
  await page.close();
}

check('no console errors or warnings in any scenario', errors.length === 0, errors.slice(0, 3).join(' || '));
await browser.close();
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
