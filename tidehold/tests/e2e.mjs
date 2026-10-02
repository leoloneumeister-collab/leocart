// Plays Tidehold on an emulated phone through the real touch UI: collect, build, train, raid, save and reload.
// Needs the dev server: npm run tidehold:dev (or set BASE_URL). Run: node tidehold/tests/e2e.mjs
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const BASE = (process.env.BASE_URL || 'http://localhost:5174/') + '?seed=3';
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { failed++; console.log('  FAIL ' + msg); }
};
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const S = () => page.evaluate(() => JSON.parse(JSON.stringify(window.tidehold.game.S)));
const wait = (ms) => page.waitForTimeout(ms);
const screenOf = (type, dz = 30) => page.evaluate(([t, z]) => {
  const g = window.tidehold.game;
  const b = g.S.buildings.find((x) => x.type === t);
  const s = window.tidehold.D.BUILDINGS[t].size;
  return g.r.cam.toScreen(b.x + s / 2, b.y + s / 2, z);
}, [type, dz]);

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('.dock');
await wait(1200);
console.log('boot');
ok(await page.locator('.pill.res.gold .v').innerText() === '1,500', 'starts with 1,500 gold');
await shot('01-home');

console.log('collect');
let [x, y] = await screenOf('gmine', 20);
await page.touchscreen.tap(x, y);
await wait(400);
let s = await S();
ok(s.res.gold > 1500, `tapping the mine collects gold (${s.res.gold})`);
ok(s.tutorial >= 1, 'tutorial moved on');

console.log('gestures');
const cam = () => page.evaluate(() => { const c = window.tidehold.game.r.cam; return { cx: c.cx, cy: c.cy, z: c.zoom }; });
const fire = (events) => page.evaluate((evs) => {
  const cv = document.getElementById('scene');
  for (const [type, id, x, y] of evs) cv.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }));
}, events);
const c0 = await cam();
await fire([['pointerdown', 1, 200, 700], ['pointermove', 1, 200, 680], ['pointermove', 1, 200, 600], ['pointermove', 1, 200, 540], ['pointerup', 1, 200, 540]]);
const c1 = await cam();
ok(Math.hypot(c1.cx - c0.cx, c1.cy - c0.cy) > 0.5, 'one finger drag pans the map');
await fire([['pointerdown', 1, 150, 600], ['pointerdown', 2, 250, 600], ['pointermove', 1, 110, 600], ['pointermove', 2, 290, 600], ['pointerup', 1, 110, 600], ['pointerup', 2, 290, 600]]);
const c2 = await cam();
ok(c2.z > c1.z * 1.3, `pinch zooms in (${c1.z.toFixed(2)} -> ${c2.z.toFixed(2)})`);
await fire([['pointerdown', 1, 110, 600], ['pointerdown', 2, 290, 600], ['pointermove', 1, 170, 600], ['pointermove', 2, 230, 600], ['pointerup', 1, 170, 600], ['pointerup', 2, 230, 600]]);
const c3 = await cam();
ok(c3.z < c2.z * 0.7, 'pinch zooms out');
await page.evaluate(() => window.tidehold.game.homeCamera());
await wait(100);

console.log('build');
await page.click('[data-id=shop]');
await wait(300);
await shot('02-shop');
await page.locator('.card', { hasText: 'Gold Mine' }).click();
await wait(300);
ok(await page.evaluate(() => !!window.tidehold.game.ghost), 'placement ghost appears');
await shot('03-placing');
{
  const gh0 = await page.evaluate(() => { const g = window.tidehold.game; const gh = g.ghost; const p = g.r.cam.toScreen(gh.x + gh.size / 2, gh.y + gh.size / 2); return { x: gh.x, y: gh.y, sx: p[0], sy: p[1] }; });
  await fire([['pointerdown', 1, gh0.sx, gh0.sy], ['pointermove', 1, gh0.sx + 40, gh0.sy + 20], ['pointermove', 1, gh0.sx + 100, gh0.sy + 50], ['pointerup', 1, gh0.sx + 100, gh0.sy + 50]]);
  const gh1 = await page.evaluate(() => { const gh = window.tidehold.game.ghost; return { x: gh.x, y: gh.y }; });
  ok(gh1.x !== gh0.x || gh1.y !== gh0.y, 'dragging the ghost moves the building');
  await page.touchscreen.tap(gh0.sx - 60, gh0.sy - 10);
  const gh2 = await page.evaluate(() => { const gh = window.tidehold.game.ghost; return { x: gh.x, y: gh.y }; });
  ok(gh2.x !== gh1.x || gh2.y !== gh1.y, 'tapping the map jumps the ghost there');
  // the spot we tapped may be taken: park the ghost on a free tile before confirming
  await page.evaluate(() => { const g = window.tidehold.game; const [wx, wy] = g.r.cam.toWorld(g.r.cam.w / 2, g.r.cam.h * 0.4); g.placeNear(wx, wy); });
  await wait(300);
}
const goldBefore = (await S()).res.gold;
await page.locator('.place .btn.green').click();
await wait(300);
s = await S();
ok(s.buildings.filter((b) => b.type === 'gmine').length === 2, 'second mine placed');
ok(s.res.gold === goldBefore - 200, 'cost was paid');
ok(s.buildings.find((b) => b.up && b.type === 'gmine'), 'it is under construction');
await page.evaluate(() => window.tidehold.advance(20000));
await wait(500);
s = await S();
ok(s.buildings.filter((b) => b.type === 'gmine' && b.lvl === 1).length === 2, 'construction finishes with time');

console.log('upgrade and walls');
await page.evaluate(() => { const g = window.tidehold.game; g.select('building', g.S.buildings.find((b) => b.type === 'cannon').id); });
await wait(300);
await shot('04-selected');
await page.locator('.sel .btn.green').click();
await wait(300);
s = await S();
ok(s.buildings.find((b) => b.type === 'cannon' && b.up), 'cannon is upgrading');
await page.evaluate(() => window.tidehold.game.deselect());

console.log('walls and moving');
await page.click('[data-id=shop]');
await wait(300);
await page.locator('.tab', { hasText: 'Defence' }).click();
await wait(200);
await page.locator('.card', { hasText: 'Wall' }).click();
await wait(300);
for (let i = 0; i < 4; i++) { await page.locator('.place .btn').last().click(); await wait(150); }
s = await S();
ok(s.buildings.filter((b) => b.type === 'wall').length === 4, 'four walls placed in a row');
ok(await page.evaluate(() => window.tidehold.game.mode) === 'place', 'wall placement keeps going');
await page.locator('.place .btn.red').click();
await wait(200);
ok(await page.evaluate(() => window.tidehold.game.mode) === 'home', 'cancel leaves placement');
{
  const before = await page.evaluate(() => { const b = window.tidehold.game.S.buildings.find((x) => x.type === 'cannon'); window.tidehold.game.select('building', b.id); return { id: b.id, x: b.x, y: b.y }; });
  await wait(300);
  await page.locator('.sel .btn', { hasText: 'Move' }).click();
  await wait(300);
  const spot = await page.evaluate((b) => {
    const T = window.tidehold; const g = T.game;
    for (let y = 5; y < 28; y++) for (let x = 5; x < 28; x++) if ((x !== b.x || y !== b.y) && T.St.canPlace(g.S, 'cannon', x, y, b.id)) return g.r.cam.toScreen(x + 1, y + 1);
    return null;
  }, before);
  await page.touchscreen.tap(spot[0], spot[1]);
  await wait(200);
  await page.locator('.place .btn').last().click();
  await wait(300);
  const after = await page.evaluate((id) => { const b = window.tidehold.game.S.buildings.find((x) => x.id === id); return { x: b.x, y: b.y }; }, before.id);
  ok(after.x !== before.x || after.y !== before.y, 'a building can be moved');
  await page.evaluate(() => window.tidehold.game.deselect());
}

console.log('train');
await page.click('[data-id=army]');
await wait(400);
await shot('05-army');
const trainBtn = page.locator('.trainbtn').first();
const box = await trainBtn.boundingBox();
await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
await wait(200);
await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
await wait(300);
s = await S();
ok(s.queue.length + s.buildings.filter((b) => b.slot).length >= 2, 'two squires queued');
await page.evaluate(() => window.tidehold.game.ui.closeSheet());

console.log('raid');
await page.click('[data-id=raid]');
await wait(300);
await page.locator('.tab', { hasText: 'Outposts' }).click();
await wait(300);
await shot('06-raid-list');
await page.locator('.scout .btn', { hasText: 'Attack' }).first().click();
await wait(800);
ok(await page.evaluate(() => window.tidehold.game.mode) === 'battle', 'battle starts');
await shot('07-battle-start');
const drop = await page.evaluate(() => {
  const g = window.tidehold.game;
  const pts = [];
  for (let x = 2; x < 32; x += 0.7) for (const y of [1.6, 31.6]) pts.push([x, y]);
  const ok2 = pts.find(([wx, wy]) => window.tidehold.Sim.canDeploy(g.B, wx, wy));
  return g.r.cam.toScreen(ok2[0], ok2[1]);
});
for (let i = 0; i < 6; i++) { await page.touchscreen.tap(drop[0], drop[1]); await wait(120); }
await wait(1500);
await shot('08-battle');
const used = await page.evaluate(() => Object.values(window.tidehold.game.B.used).reduce((a, b) => a + b, 0));
ok(used >= 3, `troops were dropped by tapping (${used})`);
await page.locator('.bt-right .btn', { hasText: '1×' }).click();
for (let i = 0; i < 40 && !(await page.locator('.results').count()); i++) {
  await page.evaluate(() => { const g = window.tidehold.game; if (g.B && !g.B.ended) { const t = Object.keys(g.B.reserve).find((k) => g.B.reserve[k].count > 0); if (t) for (let k = 0; k < 3; k++) { g.deployTroop = t; } } });
  for (let k = 0; k < 4; k++) await page.touchscreen.tap(drop[0] + k * 6, drop[1]);
  await wait(900);
}
ok(await page.locator('.results').count() === 1, 'results appear when the raid ends');
await shot('09-results');
await page.locator('.results .btn').click();
await wait(500);
s = await S();
ok(s.stats.raids === 1, 'raid is recorded');
ok(await page.evaluate(() => window.tidehold.game.mode) === 'home', 'back home');

console.log('persistence');
await page.evaluate(() => window.tidehold.game.save());
const before = await S();
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.dock');
await wait(800);
const after = await S();
ok(after.stats.raids === 1 && after.buildings.length === before.buildings.length, 'island survives a reload');
await shot('10-reloaded');

console.log('rivals, defence test, sheets');
await page.evaluate(() => { const g = window.tidehold.game; g.skipTutorial(); g.S.res.gold = 5000; g.S.res.crystal = 5000; });
await page.click('[data-id=raid]');
await wait(300);
const goldBeforeSearch = (await S()).res.gold;
await page.locator('.btn', { hasText: 'Search again' }).click();
await wait(300);
ok((await S()).res.gold === goldBeforeSearch - 50, 'searching for new rivals costs 50 gold');
ok(await page.locator('.scout').count() === 3, 'three rivals are offered');
await page.locator('.tab', { hasText: 'Defence' }).click();
await wait(200);
await page.locator('.btn', { hasText: 'Watch a raid' }).click();
await wait(600);
ok(await page.evaluate(() => window.tidehold.game.spectate), 'defence test runs as a spectator');
await page.evaluate(() => { window.tidehold.game.speed = 8; });
for (let i = 0; i < 60 && !(await page.locator('.panel h2', { hasText: 'Defence report' }).count()); i++) await wait(500);
ok(await page.locator('.panel h2', { hasText: 'Defence report' }).count() === 1, 'defence report appears');
const raidsBefore = (await S()).stats.raids;
await page.locator('.results .btn').click();
await wait(400);
ok((await S()).stats.raids === raidsBefore, 'the defence test costs nothing and is not a raid');
await page.click('[data-id=raid]');
await wait(300);
await page.locator('.scout .btn', { hasText: 'Attack' }).first().click();
await wait(600);
ok(await page.evaluate(() => window.tidehold.game.mode) === 'battle', 'rival raid starts');
const used0 = await page.evaluate(() => { const g = window.tidehold.game; const T = window.tidehold; const B = g.B; for (let x = 2; x < 32; x += 0.7) if (T.Sim.canDeploy(B, x, 1.6)) { T.Sim.deploy(B, g.deployTroop, x, 1.6); break; } return Object.values(B.used).reduce((a, b) => a + b, 0); });
ok(used0 === 1, 'dropped one troop');
await page.locator('.bt-right .btn', { hasText: 'End' }).click();
await wait(600);
ok(await page.locator('.panel h2', { hasText: 'Defeat' }).count() === 1, 'ending early with no stars is a defeat');
await page.locator('.results .btn').click();
await wait(300);
s = await S();
ok(s.stats.losses >= 1, 'the loss is recorded');
await page.evaluate(() => { const g = window.tidehold.game; g.S.stats.wins = 1; g.ui.openQuests(); });
await wait(300);
const pearlsBefore = (await S()).res.pearls;
await page.locator('.qrow2 .btn.gold').first().click();
await wait(300);
ok((await S()).res.pearls > pearlsBefore, 'a finished goal pays pearls');
await page.evaluate(() => window.tidehold.game.ui.closeSheet());
await page.click('.pill.builders');
await wait(300);
ok(await page.locator('.panel h2', { hasText: 'Builders' }).count() === 1, 'builders sheet opens');
await page.evaluate(() => window.tidehold.game.ui.closeSheet());
await page.click('.round >> nth=1');
await wait(300);
ok(await page.locator('.panel h2', { hasText: 'Settings' }).count() === 1, 'settings open');
await shot('11-settings');
await page.evaluate(() => window.tidehold.game.ui.closeSheet());

ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nALL E2E CHECKS PASSED');
process.exit(failed ? 1 : 0);
