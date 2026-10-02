// Browser smoke test: builds the app, plays a few real inputs, checks rendering and the end screen.
import { execSync } from 'node:child_process';
import { startServer, launch } from './lib.mjs';

const PORT = 5175;
execSync('npx vite build', { stdio: 'ignore' });
const stop = await startServer({ port: PORT });
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let failed = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`);
  if (!ok) failed++;
};
const ev = (fn, arg) => page.evaluate(fn, arg);
/** Wait (real time) until a page predicate holds. Software rendering is slow, so no fixed sleeps. */
const until = (fn, arg, timeout = 6000) =>
  page
    .waitForFunction(fn, arg, { timeout, polling: 50 })
    .then(() => true)
    .catch(() => false);

async function imageStats(buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0;
    let sum2 = 0;
    let n = 0;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 37) {
      const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      sum += l;
      sum2 += l * l;
      n++;
      seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    }
    const mean = sum / n;
    return { mean, std: Math.sqrt(sum2 / n - mean * mean), colors: seen.size };
  }, buf.toString('base64'));
}

try {
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('.menu');
  check('menu renders with five champions', (await page.$$('.champ-card')).length === 5);
  await page.click('.champ-card:nth-child(2)');
  await page.click('.opt-row[data-key=lane] .opt[data-val=mid]');
  await page.click('.opt-row[data-key=difficulty] .opt[data-val=easy]');
  await page.click('.opt-row[data-key=quality] .opt[data-val=low]');
  check('champion selection applies', await page.$eval('.champ-card.sel .cc-name', (e) => e.textContent === 'Ysolde'));
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__game && window.__game.world);
  await page.waitForTimeout(1500);

  check('HUD shows four abilities', (await page.$$('.ability')).length === 4);
  const shot = await page.screenshot();
  const st = await imageStats(shot);
  check('3D canvas renders real content', st.std > 18 && st.colors > 60, `std=${st.std.toFixed(1)} colors=${st.colors}`);

  // movement
  const start = await ev(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
  await page.mouse.click(760, 330, { button: 'right' });
  check('right click issues a move order', await until(() => window.__game.player.order.t === 'move'));
  const walked = await until((s) => Math.hypot(window.__game.player.x - s.x, window.__game.player.z - s.z) > 4, start);
  check('champion walks to the clicked point', walked);

  // abilities
  await page.mouse.move(700, 300);
  await page.keyboard.press('q');
  check('Q casts and starts its cooldown', await until(() => window.__game.player.champ.cooldowns[0] > 0));
  await ev(() => window.__api.grantXp(window.__game.world, window.__game.player, 600));
  await page.keyboard.down('Control');
  await page.keyboard.press('w');
  await page.keyboard.up('Control');
  check('Ctrl+W spends a skill point', await until(() => window.__game.player.champ.ranks[1] === 1));

  // order keys
  await page.keyboard.press('s');
  check('S stops', await until(() => window.__game.player.order.t === 'idle'));
  await page.keyboard.press('a');
  await page.mouse.click(800, 280, { button: 'left' });
  check('A + click attack-moves', await until(() => window.__game.player.order.t === 'attackMove'));
  await page.keyboard.press('b');
  check('B starts recall', await until(() => window.__game.player.order.t === 'recall'));

  // shop (teleport home first)
  await ev(() => {
    const p = window.__game.player;
    p.x = p.px = -97;
    p.z = p.pz = 97;
    p.champ.gold = 2000;
  });
  await until(() => window.__game.player.champ.inShop);
  await page.keyboard.press('p');
  await page.waitForSelector('.shop:not(.hidden)');
  check('P opens the shop in base', true);
  const cards = await page.$$('.item-card');
  await cards[0].dblclick();
  const bought = await page
    .waitForFunction(() => window.__game.player.champ.items.filter(Boolean).length === 1, null, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
  check('shop purchase lands in the inventory', bought);
  await page.keyboard.press('Escape');
  check('Esc closes the shop', await until(() => document.querySelector('.shop').classList.contains('hidden')));

  // scoreboard and pause
  await page.keyboard.down('Tab');
  check('Tab shows the scoreboard', await until(() => !document.querySelector('.scoreboard').classList.contains('hidden')));
  await page.keyboard.up('Tab');
  await page.keyboard.press('Escape');
  check('Esc pauses', await until(() => !document.querySelector('.pause').classList.contains('hidden')));
  await page.keyboard.press('Escape');
  check('Esc resumes', await until(() => document.querySelector('.pause').classList.contains('hidden')));
  await page.keyboard.press(']');
  check('] changes game speed', await until(() => document.querySelector('.speed')?.textContent === 'x2'));

  // let bots play a few minutes with the player on autopilot, then force a win
  const sim = await ev(() => {
    const m = window.__api;
    const g = window.__game;
    g.player.champ.isBot = true;
    const w = g.world;
    const t0 = performance.now();
    for (let i = 0; i < 30 * 60 * 6; i++) {
      m.stepWorld(w);
      w.drainEvents();
    }
    return { t: w.time, ms: performance.now() - t0, units: w.units.length, kills: w.teamKills };
  });
  check('six minutes of bot play simulate cleanly', sim.t > 360 && sim.units > 30, `${(sim.ms / 1000).toFixed(2)}s wall, units=${sim.units}, kills=${sim.kills}`);
  await ev(() => {
    const w = window.__game.world;
    const nexus = w.structures.find((s) => s.team === 1 && s.kind === 'nexus');
    window.__api.killUnit(w, nexus, w.getPlayer());
  });
  await page.waitForSelector('.endscreen', { timeout: 15000 });
  check('end screen appears after the nexus falls', (await page.$eval('.end-title', (e) => e.textContent)) === 'VICTORY');
  await page.screenshot({ path: 'tests/shots/smoke-end.png' });
} catch (e) {
  console.error('smoke test crashed:', e);
  failed++;
}
check('no console or page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
stop();
if (failed) {
  console.error(`${failed} smoke check(s) failed`);
  process.exit(1);
}
console.log('SMOKE TEST PASSED');
