// Browser tests for the /apps/ folder: serves the repo statically, drives each app in Chromium with a
// fake camera (a synthetic pushup video) and a fake speech recogniser. Run: npm run test:apps:e2e
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SHOT_DIR || path.join(ROOT, 'test-output', 'apps');
mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}/apps/`;

// A 320x240 video that looks like a pushup from the camera's point of view: bright, then dark, then bright.
function writePushupVideo(file, { w = 320, h = 240, fps = 15, cycleMs = 1800, hi = 200, lo = 40 } = {}) {
  const frames = Math.round((cycleMs / 1000) * fps);
  const parts = [Buffer.from(`YUV4MPEG2 W${w} H${h} F${fps}:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < frames; i++) {
    const ph = i / frames;
    const y = ph < 0.3 ? hi : ph < 0.45 ? hi + (lo - hi) * ((ph - 0.3) / 0.15) : ph < 0.7 ? lo : ph < 0.85 ? lo + (hi - lo) * ((ph - 0.7) / 0.15) : hi;
    parts.push(Buffer.from('FRAME\n'), Buffer.alloc(w * h, Math.round(y)), Buffer.alloc((w * h) / 2, 128));
  }
  writeFileSync(file, Buffer.concat(parts));
}

const tmp = path.join(os.tmpdir(), 'leocart-apps-e2e');
mkdirSync(tmp, { recursive: true });
const video = path.join(tmp, 'pushup.y4m');
writePushupVideo(video);

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`, '--autoplay-policy=no-user-gesture-required'],
});

let failed = 0;
const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log('PASS', name);
  } catch (e) {
    failed++;
    results.push(['FAIL', name]);
    console.log('FAIL', name, '\n   ', e.message.split('\n')[0]);
  }
}
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ['camera', 'microphone'], ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.errors = errors;
  return page;
}

// ---- Pushwake ----------------------------------------------------------------------------

await check('pushwake: camera counts pushups and stops the alarm', async () => {
  const page = await newPage();
  await page.goto(BASE + 'pushwake/');
  await page.screenshot({ path: path.join(OUT, 'pushwake-home.png') });
  for (let i = 0; i < 7; i++) await page.click('#reps-minus'); // 10 -> 3
  ok((await page.textContent('#reps-out')) === '3', 'stepper should show 3');
  await page.click('#test-ring');
  await page.waitForSelector('#view-armed:not(.hidden)');
  await page.screenshot({ path: path.join(OUT, 'pushwake-armed.png') });
  await page.waitForSelector('#view-ring:not(.hidden)', { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, 'pushwake-ringing.png') });
  await page.waitForSelector('#view-done:not(.hidden)', { timeout: 30000 });
  await page.screenshot({ path: path.join(OUT, 'pushwake-done.png') });
  ok((await page.textContent('#done-sub')).includes('only a test'), 'test rings must not count towards the streak');
  ok(page.errors.length === 0, 'page errors: ' + page.errors.join('; '));
  await page.context().close();
});

await check('pushwake: tap mode works without a camera', async () => {
  const page = await newPage({ permissions: [] });
  await page.goto(BASE + 'pushwake/');
  await page.click('#mode [data-mode=tap]');
  for (let i = 0; i < 7; i++) await page.click('#reps-minus');
  await page.click('#test-ring');
  await page.waitForSelector('#view-ring:not(.hidden)', { timeout: 15000 });
  for (let i = 0; i < 3; i++) {
    await page.click('#tap-rep');
    await page.waitForTimeout(420);
  }
  await page.waitForSelector('#view-done:not(.hidden)');
  await page.context().close();
});

await check('pushwake: a blocked camera is reported when arming, not at 6am', async () => {
  const page = await newPage({ permissions: [] });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  });
  await page.goto(BASE + 'pushwake/');
  await page.click('#arm');
  await page.waitForSelector('#notice:not(.hidden)');
  ok((await page.textContent('#notice')).includes('blocked'), 'should explain the block');
  ok(await page.isVisible('#view-home'), 'must stay on the home screen');
  await page.context().close();
});

await check('pushwake: giving up needs a five second hold', async () => {
  const page = await newPage();
  await page.goto(BASE + 'pushwake/');
  await page.click('#test-ring');
  await page.waitForSelector('#view-ring:not(.hidden)', { timeout: 15000 });
  const box = await page.locator('#giveup').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  ok(await page.isVisible('#view-ring'), 'a short press must not stop the alarm');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForSelector('#view-home:not(.hidden)', { timeout: 8000 });
  await page.mouse.up();
  await page.context().close();
});

// ---- BiteLog -----------------------------------------------------------------------------

async function setupProfile(page, { sex = 'm', age = '30', weight = '80', height = '180', goal = 'maintain' } = {}) {
  await page.click(`#sex [data-v=${sex}]`);
  await page.fill('#age', age);
  await page.fill('#weight', weight);
  await page.fill('#height-cm', height);
  await page.selectOption('#activity', 'moderate');
  await page.click(`#goal-seg [data-v=${goal}]`);
  await page.click('#save-profile');
}

async function addFood(page, meal, query, pick = 0) {
  await page.click(`[data-add=${meal}]`);
  await page.fill('#q', query);
  await page.locator('#results .result').nth(pick).click();
  await page.click('#am-add');
}

await check('bitelog: first run asks for a goal, then tracks food', async () => {
  const page = await newPage();
  await page.goto(BASE + 'bitelog/');
  ok(await page.isVisible('#tab-profile'), 'first run should open the goal form');
  await page.screenshot({ path: path.join(OUT, 'bitelog-setup.png') });
  await page.fill('#age', '30');
  await page.click('#save-profile');
  ok((await page.textContent('#profile-error')).length > 0, 'missing details should show an error');
  await setupProfile(page);
  await page.waitForSelector('#tab-today:not(.hidden)');
  ok((await page.textContent('#goal')).includes('2,760'), 'goal for a 30y 80kg 180cm man, moderate = 2,760, got ' + (await page.textContent('#goal')));
  await addFood(page, 'breakfast', 'banana');
  ok((await page.textContent('#eaten')).startsWith('105'), 'banana is 105 kcal');
  await page.click('[data-add=lunch]');
  await page.click('#add-tabs [data-p=quick]');
  await page.fill('#qa-name', 'Work lunch');
  await page.fill('#qa-kcal', '500');
  await page.fill('#qa-p', '30');
  await page.click('#qa-add');
  ok((await page.textContent('#eaten')).startsWith('605'), 'eaten should be 605');
  ok((await page.textContent('#left-n')) === '2,155', 'remaining should be 2,155, got ' + (await page.textContent('#left-n')));
  await page.screenshot({ path: path.join(OUT, 'bitelog-today.png') });
  await page.click('[data-add=dinner]');
  await page.fill('#q', 'chick br');
  await page.screenshot({ path: path.join(OUT, 'bitelog-add.png') });
  await page.locator('#results .result').first().click();
  await page.fill('#am-qty', '150');
  await page.click('#am-unit [data-v=g]'); // 150 servings -> converts to grams, so reset the amount
  await page.fill('#am-qty', '150');
  ok(Number(await page.textContent('#am-kcal')) === 248, 'chicken 150 g is 248 kcal (165 per 100 g), got ' + (await page.textContent('#am-kcal')));
  await page.click('#am-add');
  await page.click('[data-del]:near(:text("Banana"))').catch(async () => page.locator('[data-del]').first().click());
  ok(page.errors.length === 0, 'page errors: ' + page.errors.join('; '));
  await page.context().close();
});

await check('bitelog: data survives a reload, and recent foods add in one tap', async () => {
  const page = await newPage();
  await page.goto(BASE + 'bitelog/');
  await setupProfile(page);
  await addFood(page, 'snacks', 'apple');
  await page.reload();
  ok((await page.textContent('#eaten')).startsWith('95'), 'apple should still be logged after reload');
  await page.click('[data-add=lunch]');
  await page.waitForSelector('[data-recent]');
  await page.click('[data-recent="0"]');
  ok((await page.textContent('#eaten')).startsWith('190'), 'adding the recent apple again doubles it');
  await page.click('#prev');
  ok((await page.textContent('#eaten')).startsWith('0 '), 'yesterday is empty');
  ok(await page.isDisabled('#next') === false, 'can go forward from yesterday');
  await page.click('#next');
  ok(await page.isDisabled('#next'), 'cannot go past today');
  await page.context().close();
});

await check('bitelog: progress charts and weight', async () => {
  const page = await newPage();
  await page.goto(BASE + 'bitelog/');
  await setupProfile(page);
  await addFood(page, 'breakfast', 'oatmeal');
  await page.click('[data-tab=progress]');
  await page.waitForSelector('#chart svg rect[fill="#34d399"]'); // today's bar, empty days have none
  await page.fill('#weight-in', '80.5');
  await page.click('#weight-save');
  ok((await page.textContent('#weight-note')).includes('80.5'), 'weight note should show 80.5');
  await page.screenshot({ path: path.join(OUT, 'bitelog-progress.png') });
  await page.context().close();
});

await check('bitelog: barcode lookup (network mocked)', async () => {
  const page = await newPage();
  await page.route('https://world.openfoodfacts.org/**', (route) => {
    const url = route.request().url();
    const body = url.includes('5000159407236')
      ? { status: 1, product: { product_name: 'Milk Chocolate Bar', brands: 'Acme', serving_size: '25 g', serving_quantity: 25, nutriments: { 'energy-kcal_100g': 530, proteins_100g: 7, carbohydrates_100g: 57, fat_100g: 30 } } }
      : { status: 0 };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(BASE + 'bitelog/');
  await setupProfile(page);
  await page.click('[data-add=snacks]');
  await page.click('#add-tabs [data-p=barcode]');
  await page.fill('#barcode', '123');
  await page.click('#barcode-go');
  ok((await page.textContent('#barcode-status')).includes('8 to 14'), 'short codes are rejected');
  await page.fill('#barcode', '9999999999999');
  await page.click('#barcode-go');
  await page.waitForFunction(() => document.getElementById('barcode-status').textContent.includes('Not found'));
  await page.fill('#barcode', '5000159407236');
  await page.click('#barcode-go');
  await page.waitForSelector('#p-amount:not(.hidden)');
  ok((await page.textContent('#am-name')) === 'Acme Milk Chocolate Bar', 'name should combine brand and product');
  ok((await page.textContent('#am-kcal')) === '133', '25 g of 530 kcal/100 g is 133 kcal, got ' + (await page.textContent('#am-kcal')));
  await page.click('#am-add');
  ok((await page.textContent('#eaten')).startsWith('133'), 'scanned food logged');
  await page.context().close();
});

await check('bitelog: an unreachable food database fails politely', async () => {
  const page = await newPage();
  await page.route('https://world.openfoodfacts.org/**', (route) => route.abort());
  await page.goto(BASE + 'bitelog/');
  await setupProfile(page);
  await page.click('[data-add=snacks]');
  await page.click('#add-tabs [data-p=barcode]');
  await page.fill('#barcode', '5000159407236');
  await page.click('#barcode-go');
  await page.waitForFunction(() => document.getElementById('barcode-status').textContent.includes('Could not reach'));
  await page.context().close();
});

await check('bitelog: under 18s are never given a deficit', async () => {
  const page = await newPage();
  await page.goto(BASE + 'bitelog/');
  await setupProfile(page, { sex: 'f', age: '15', weight: '55', height: '165', goal: 'lose' });
  await page.click('[data-tab=profile]');
  ok((await page.textContent('#t-note')).includes('under 18'), 'must explain why the goal is maintain');
  await page.context().close();
});

await check('bitelog: imperial units convert and save', async () => {
  const page = await newPage();
  await page.goto(BASE + 'bitelog/');
  await page.click('#units [data-v=imperial]');
  await page.click('#sex [data-v=m]');
  await page.fill('#age', '30');
  await page.fill('#weight', '176.4'); // 80 kg
  await page.fill('#height-ft', '5');
  await page.fill('#height-in', '11'); // 180.3 cm
  await page.selectOption('#activity', 'moderate');
  await page.click('#save-profile');
  const goal = await page.textContent('#goal');
  ok(goal.includes('2,7'), 'imperial input should give about the same goal as metric, got ' + goal);
  await page.context().close();
});

await check('bitelog: backup exports and restores', async () => {
  const page = await newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + 'bitelog/');
  await setupProfile(page);
  await addFood(page, 'breakfast', 'banana');
  await page.click('[data-tab=profile]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  const file = path.join(tmp, 'backup.json');
  await download.saveAs(file);
  await page.click('#reset');
  await page.waitForSelector('#welcome:not(.hidden)');
  await page.setInputFiles('#import-file', file);
  await page.waitForSelector('#tab-today:not(.hidden)');
  ok((await page.textContent('#eaten')).startsWith('105'), 'banana restored from backup');
  await page.context().close();
});

// ---- Voicepad ----------------------------------------------------------------------------

// A stand-in for the browser's speech engine that the test can push words into.
const FAKE_SPEECH = () => {
  // recent Chromium has the unprefixed name natively, so replace both
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    constructor() { window.__sr = this; }
    start() { this.onstart && this.onstart(); }
    stop() { this.onend && this.onend(); }
    emit(list) {
      const results = list.map(({ t, final }) => { const r = [{ transcript: t }]; r.isFinal = final; return r; });
      this.onresult({ resultIndex: 0, results });
    }
    fail(error) { this.onerror({ error }); this.onend(); }
  };
};

await check('voicepad: speech becomes a tidy saved note', async () => {
  const page = await newPage();
  await page.addInitScript(FAKE_SPEECH);
  await page.goto(BASE + 'voicepad/');
  await page.click('#mic');
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Listening'));
  await page.evaluate(() => window.__sr.emit([{ t: 'um so i i think', final: false }]));
  ok((await page.textContent('#interim')).includes('so i i think'), 'interim words are shown');
  await page.evaluate(() => window.__sr.emit([{ t: 'um so i i think we should uh go on thursday', final: true }]));
  ok((await page.inputValue('#text')).includes('go on thursday'), 'final words land in the note');
  await page.screenshot({ path: path.join(OUT, 'voicepad-listening.png') });
  await page.click('#mic'); // stop: auto tidy runs
  ok((await page.inputValue('#text')) === 'So I think we should go on Thursday.', 'auto tidy, got: ' + (await page.inputValue('#text')));
  await page.click('#undo');
  ok((await page.inputValue('#text')).startsWith('um so i i think'), 'undo brings the raw words back');
  await page.click('#tidy');
  await page.click('#save');
  await page.waitForSelector('#notes .note-item');
  ok((await page.textContent('#notes .t')).startsWith('I think we should'), 'title: ' + (await page.textContent('#notes .t')));
  await page.reload();
  ok((await page.inputValue('#text')).startsWith('So I think'), 'draft survives a reload');
  ok((await page.locator('#notes .note-item').count()) === 1, 'saved note survives a reload');
  await page.screenshot({ path: path.join(OUT, 'voicepad-saved.png') });
  page.on('dialog', (d) => d.accept());
  await page.click('[data-del]');
  ok((await page.locator('#notes .note-item').count()) === 0, 'note deleted');
  ok(page.errors.length === 0, 'page errors: ' + page.errors.join('; '));
  await page.context().close();
});

await check('voicepad: bullets, to-dos and undo', async () => {
  const page = await newPage();
  await page.addInitScript(FAKE_SPEECH);
  await page.goto(BASE + 'voicepad/');
  await page.fill('#text', 'i went for a walk. i need to call the dentist. remind me to send the invoice');
  await page.click('#todos');
  ok((await page.inputValue('#text')) === '- [ ] Call the dentist\n- [ ] Send the invoice', 'to-dos: ' + (await page.inputValue('#text')));
  await page.click('#undo');
  await page.click('#bullets');
  ok((await page.inputValue('#text')).startsWith('- I went for a walk'), 'bullets');
  await page.fill('#text', 'the sky was blue');
  await page.click('#todos');
  ok((await page.inputValue('#text')) === 'the sky was blue', 'no to-dos leaves the text alone');
  await page.context().close();
});

await check('voicepad: a blocked microphone keeps its error message', async () => {
  const page = await newPage();
  await page.addInitScript(FAKE_SPEECH);
  await page.goto(BASE + 'voicepad/');
  await page.click('#mic');
  await page.evaluate(() => window.__sr.fail('not-allowed'));
  await page.waitForTimeout(400);
  ok((await page.textContent('#status')).includes('blocked'), 'error stays visible, got: ' + (await page.textContent('#status')));
  ok((await page.getAttribute('#mic', 'aria-pressed')) === 'false', 'mic button resets');
  await page.context().close();
});

await check('voicepad: keeps listening through silence (browser ends the session)', async () => {
  const page = await newPage();
  await page.addInitScript(FAKE_SPEECH);
  await page.goto(BASE + 'voicepad/');
  await page.click('#mic');
  await page.evaluate(() => window.__sr.onend()); // browser stopped after a pause
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('Listening'), null, { timeout: 3000 });
  ok((await page.getAttribute('#mic', 'aria-pressed')) === 'true', 'still listening');
  await page.context().close();
});

await check('voicepad: browsers without speech support still work for typing', async () => {
  const page = await newPage();
  await page.addInitScript(() => { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; });
  await page.goto(BASE + 'voicepad/');
  ok(await page.isVisible('#no-speech'), 'notice shown');
  ok(await page.isDisabled('#mic'), 'mic disabled');
  await page.fill('#text', 'um hello comma world');
  await page.click('#tidy');
  ok((await page.inputValue('#text')) === 'Hello, world.', 'tidy works without speech');
  await page.context().close();
});

await check('voicepad: other languages are not mangled', async () => {
  const page = await newPage();
  await page.addInitScript(FAKE_SPEECH);
  await page.goto(BASE + 'voicepad/');
  await page.selectOption('#lang', 'de-DE');
  await page.fill('#text', 'er hat gesagt dass er morgen kommt');
  await page.click('#tidy');
  ok((await page.inputValue('#text')) === 'Er hat gesagt dass er morgen kommt.', 'got: ' + (await page.inputValue('#text')));
  await page.context().close();
});

// ---- Hub, sharing, installability --------------------------------------------------------

await check('hub: lists the apps and opens a share sheet with QR, link and chat buttons', async () => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  await page.goto(BASE);
  await page.screenshot({ path: path.join(OUT, 'hub.png'), fullPage: true });
  ok((await page.locator('article.app').count()) === 4, 'four cards');
  await page.locator('[data-share="pushwake/"]').click();
  await page.waitForSelector('dialog[open] .qr svg');
  const url = await page.textContent('dialog[open] .urlbox');
  ok(url === BASE + 'pushwake/', 'share url should be the absolute app url, got ' + url);
  ok((await page.getAttribute('dialog[open] [data-k=wa]', 'href')).startsWith('https://wa.me/?text='), 'whatsapp link');
  ok((await page.getAttribute('dialog[open] [data-k=sms]', 'href')).startsWith('sms:'), 'sms link');
  ok((await page.getAttribute('dialog[open] [data-k=mail]', 'href')).startsWith('mailto:'), 'mail link');
  await page.screenshot({ path: path.join(OUT, 'share-sheet.png') });
  await page.click('dialog[open] [data-act=copy]');
  ok((await page.evaluate(() => navigator.clipboard.readText())) === url, 'link copied to the clipboard');
  await page.click('dialog[open] [data-act=close]');
  ok((await page.locator('dialog[open]').count()) === 0, 'sheet closes');
  ok(page.errors.length === 0, 'page errors: ' + page.errors.join('; '));
  await page.context().close();
});

await check('hub: the QR in the sheet encodes the displayed link', async () => {
  const page = await newPage();
  await page.goto(BASE);
  await page.locator('[data-share="bitelog/"]').click();
  await page.waitForSelector('dialog[open] .qr svg');
  const info = await page.evaluate(async () => {
    const { qrSvg } = await import('./shared/share.js');
    const url = document.querySelector('dialog[open] .urlbox').textContent;
    const drawn = document.querySelector('dialog[open] .qr svg path').getAttribute('d');
    const expected = new DOMParser().parseFromString(qrSvg(url), 'image/svg+xml').querySelector('path').getAttribute('d');
    return { drawn, expected, url };
  });
  ok(info.drawn && info.drawn === info.expected, 'the QR drawn in the sheet must encode exactly the displayed url');
  await page.context().close();
});

await check('every app has a valid manifest, real icons, and no broken local links', async () => {
  const page = await newPage();
  const fetchOk = async (url) => (await page.request.get(url)).status() === 200;
  for (const app of ['', 'pushwake/', 'bitelog/', 'voicepad/']) {
    const html = await (await page.request.get(BASE + app)).text();
    const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|mailto:|sms:)/.test(u));
    for (const r of refs) ok(await fetchOk(new URL(r, BASE + app).href), `${app || 'hub'} links to missing file ${r}`);
    const manifestUrl = new URL(html.match(/rel="manifest" href="([^"]+)"/)[1], BASE + app).href;
    const manifest = await (await page.request.get(manifestUrl)).json();
    ok(manifest.name && manifest.start_url && manifest.display === 'standalone' || manifest.display === 'standalone', `${app} manifest basics`);
    for (const icon of manifest.icons) ok(await fetchOk(new URL(icon.src, manifestUrl).href), `${app} icon ${icon.src} missing`);
    ok(manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'), `${app} needs 192 and 512 icons`);
  }
  await page.context().close();
});

await check('the service worker registers and serves pages offline', async () => {
  const page = await newPage();
  await page.goto(BASE + 'bitelog/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the worker, which caches what it serves
  await page.waitForTimeout(500);
  await page.context().setOffline(true);
  await page.reload();
  ok(await page.isVisible('#tab-profile') || await page.isVisible('#tab-today'), 'app opens offline');
  await page.context().close();
});

await browser.close();
server.close();
console.log(`\n${results.filter((r) => r[0] === 'PASS').length} passed, ${failed} failed. Screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
