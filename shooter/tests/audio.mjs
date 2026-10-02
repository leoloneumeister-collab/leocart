import { startServer, launch } from './lib.mjs';
const stop = await startServer();
const browser = await launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack));
await page.goto(`http://localhost:4173/?debug=1`);
await page.waitForTimeout(2000);
const res = await page.evaluate(async () => {
  const a = window.__audio;
  const out = {};
  const mk = (name, fn, secs = 2) => async () => {
    a.ctx = null;
    window.AudioContext = class extends OfflineAudioContext { constructor() { super(2, 44100 * secs, 44100); } };
    a.init();
    fn(a);
    const buf = await a.ctx.startRendering();
    let peak = 0, sum = 0;
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += v * v; }
    out[name] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4) };
  };
  await mk('rifle', (a) => a.gun('rifle'))();
  await mk('shotgun', (a) => a.gun('shotgun'))();
  await mk('smg', (a) => a.gun('smg'))();
  await mk('dmr', (a) => a.gun('dmr'))();
  await mk('enemy', (a) => a.gun('enemy', 0.5, 0.75, 30))();
  await mk('explosion', (a) => a.explosion(1), 3)();
  await mk('radio', (a) => a.radio('Wraith you are clear to move compound is dark'), 6)();
  await mk('hurt', (a) => a.hurt())();
  await mk('step', (a) => a.step())();
  await mk('reload', (a) => { a.reload('out'); a.reload('in'); }, 2)();
  await mk('hit', (a) => { a.hitMarker(); a.headshot(); a.kill(); })();
  await mk('rifleBurst', (a) => { for (let i = 0; i < 20; i++) setTimeout(() => {}, 0); for (let i = 0; i < 10; i++) { const t = a.ctx.currentTime; void t; a.gun('rifle'); } }, 2)();
  return out;
});
console.log(JSON.stringify(res, null, 1));
console.log(errs.join('\n'));
await browser.close(); stop();
