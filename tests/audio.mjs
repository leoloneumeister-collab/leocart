// Renders every music style and every sound effect offline and checks they are audible, not clipping,
// and free of NaNs. Needs the dev server (npm run dev). Run: node tests/audio.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForSelector('.screen.title');

const report = await page.evaluate(async () => {
  const { AudioEngine } = await import('/src/audio/engine.js');
  const { STYLES } = await import('/src/audio/music.js');
  const sr = 44100;
  const analyse = (buf) => {
    let peak = 0, sum = 0, n = 0, bad = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        const v = d[i];
        if (!Number.isFinite(v)) bad++;
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        n++;
      }
    }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4), bad };
  };
  const out = {};
  for (const id of Object.keys(STYLES)) {
    const style = STYLES[id];
    const bars = style.chords.length;
    const stepDur = 60 / style.bpm / 4;
    const secs = bars * 16 * stepDur;
    const ctx = new OfflineAudioContext(2, Math.ceil(sr * (secs + 1.5)), sr);
    const a = new AudioEngine();
    a._init(ctx);
    a.music.tempoMult = 1;
    for (let step = 0; step < bars * 16; step++) a._scheduleStep(style, step, 0.05 + step * stepDur);
    const buf = await ctx.startRendering();
    out['music:' + id] = { seconds: +secs.toFixed(1), ...analyse(buf) };
  }
  const names = ['hover', 'click', 'back', 'count', 'go', 'driftStart', 'driftLevel', 'miniTurbo', 'boostItem', 'boost', 'pad', 'bump', 'hit', 'shield', 'shieldBreak', 'itemGet', 'itemReady', 'boxBreak', 'throw', 'oil', 'comet', 'pulse', 'lap', 'finalLap', 'finish', 'respawn', 'winJingle', 'loseJingle', 'wrongWay'];
  for (const n of names) {
    const ctx = new OfflineAudioContext(2, sr * 3, sr);
    const a = new AudioEngine();
    a._init(ctx);
    a.sfx(n, { gain: 1 });
    const buf = await ctx.startRendering();
    out['sfx:' + n] = analyse(buf);
  }
  return out;
});

let bad = 0;
for (const [k, v] of Object.entries(report)) {
  const silent = v.rms < 0.002;
  const clip = v.peak > 1.0;
  const flag = silent ? 'SILENT' : clip ? 'CLIPS' : v.bad ? 'NaN' : 'ok';
  if (flag !== 'ok') bad++;
  console.log(`${flag.padEnd(7)} ${k.padEnd(22)} peak ${v.peak}  rms ${v.rms}${v.seconds ? '  loop ' + v.seconds + 's' : ''}`);
}
if (errors.length) { console.log('errors:', errors.join(' | ')); bad++; }
await browser.close();
console.log(bad ? `\n${bad} problem(s)` : '\nall audio renders cleanly');
process.exit(bad ? 1 : 0);
