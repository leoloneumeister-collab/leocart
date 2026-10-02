// Landing page checks (site/): scroll stages, reduced motion, phone layout, no-WebGL fallback,
// copy rules (no dashes, hero fits two lines). Run: node tests/site.mjs  (site dev server on BASE_URL)
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5174/';
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];
let failed = false;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  (${extra})` : ''}`);
  if (!ok) failed = true;
};

async function open(browser, { width = 1280, height = 720, reducedMotion = 'no-preference' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  return { page, errors, ctx };
}

const stageAt = async (page, y) => {
  await page.evaluate((t) => window.scrollTo(0, t), y);
  await page.waitForTimeout(1200);
  return page.evaluate(() => window.leocartSite.stage);
};
const zoneTop = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  const box = (el.closest('.pin-spacer') || el).getBoundingClientRect();
  return { top: box.top + window.scrollY, h: box.height };
}, sel);

// ---- desktop, motion on -------------------------------------------------------------------------
{
  const browser = await chromium.launch({ args: GL });
  const { page, errors } = await open(browser);
  check('title mentions LeoCart', (await page.title()).includes('LeoCart'));

  const heroH = await page.evaluate(() => document.querySelector('[data-hero-title]').getBoundingClientRect().height);
  const lineH = await page.evaluate(() => parseFloat(window.getComputedStyle(document.querySelector('[data-hero-title]')).lineHeight));
  check('hero headline is at most 2 lines', heroH / lineH < 2.4, `${(heroH / lineH).toFixed(2)} lines`);
  const ctaVisible = await page.evaluate(() => document.querySelector('[data-hero-cta] .btn-primary').getBoundingClientRect().bottom <= window.innerHeight);
  check('hero CTA visible without scrolling', ctaVisible);
  for (const [w, h] of [[1920, 1080], [1024, 768], [768, 1024]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(700);
    const ratio = await page.evaluate(() => {
      const el = document.querySelector('[data-hero-title]');
      return el.getBoundingClientRect().height / parseFloat(window.getComputedStyle(el).lineHeight);
    });
    check(`hero headline is at most 2 lines at ${w}x${h}`, ratio < 2.4, `${ratio.toFixed(2)} lines`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(700);

  check('hero stage at top', (await page.evaluate(() => window.leocartSite.stage)) === 'hero');
  const drift = await zoneTop(page, '#drift');
  const racers = await zoneTop(page, '#racers');
  const tracks = await zoneTop(page, '#tracks');
  check('drift stage while the drift section is pinned', (await stageAt(page, drift.top + 600)) === 'drift');
  const charge = await page.evaluate(() => window.leocartSite.p.charge);
  check('scrolling the drift pin raises the charge', charge > 0.1, `charge ${charge.toFixed(2)}`);
  await stageAt(page, drift.top + drift.h - 720 - 10);
  const boost = await page.evaluate(() => window.leocartSite.p.boost);
  check('end of the drift pin releases the boost', boost > 0.5, `boost ${boost.toFixed(2)}`);
  check('roster stage while the racers section is pinned', (await stageAt(page, racers.top + 800)) === 'roster');
  const roster = await page.evaluate(() => window.leocartSite.p.roster);
  check('scrolling the roster moves the camera along the line-up', roster > 0.3, `roster ${roster.toFixed(2)}`);
  check('idle stage over the tracks, canvas hidden', (await stageAt(page, tracks.top + 900)) === 'idle' && (await page.evaluate(() => document.getElementById('stage').classList.contains('is-hidden'))));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  check('finale stage after jumping straight to the bottom', (await stageAt(page, 999999)) === 'finale');
  check('nav is solid at the very bottom', await page.evaluate(() => document.getElementById('nav').classList.contains('is-solid')));

  const text = await page.evaluate(() => {
    const bits = [document.body.innerText, document.title];
    document.querySelectorAll('[alt], [aria-label], meta[name=description]').forEach((n) => bits.push(n.getAttribute('alt') || n.getAttribute('aria-label') || n.getAttribute('content')));
    return bits.join('\n');
  });
  check('no em or en dashes in visible copy', !/[–—]/.test(text));
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a.btn-primary')].map((a) => a.getAttribute('href')));
  check('every Play now button goes to the game', hrefs.length >= 3 && hrefs.every((h) => h === '../'), hrefs.join(' '));
  check('no console errors or warnings', errors.length === 0, errors.join(' | '));
  await browser.close();
}

// ---- reduced motion: static, everything readable ---------------------------------------------------
{
  const browser = await chromium.launch({ args: GL });
  const { page, errors } = await open(browser, { reducedMotion: 'reduce' });
  const r = await page.evaluate(() => ({
    hidden: document.documentElement.classList.contains('js-pre'),
    isStatic: document.documentElement.classList.contains('is-static'),
    live: document.querySelector('#racers').classList.contains('racers--live'),
    pins: document.querySelectorAll('.pin-spacer').length,
    racers: [...document.querySelectorAll('.racer')].every((el) => window.getComputedStyle(el).opacity === '1'),
    sticky: window.getComputedStyle(document.querySelector('.stack-item')).position,
    running: window.leocartSite.running,
  }));
  check('reduced motion: nothing hidden, no pins, no render loop', !r.hidden && r.isStatic && !r.live && r.pins === 0 && !r.running, JSON.stringify(r));
  check('reduced motion: all six racers readable', r.racers);
  check('reduced motion: sticky stack turned off', r.sticky === 'static');
  check('reduced motion: no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
}

// ---- phone ---------------------------------------------------------------------------------------
{
  const browser = await chromium.launch({ args: GL });
  const { page, errors } = await open(browser, { width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone: no horizontal overflow', overflow <= 0, `${overflow}px`);
  const navLinks = await page.evaluate(() => window.getComputedStyle(document.querySelector('.nav-links')).display);
  check('phone: nav collapses to logo + Play now', navLinks === 'none');
  const ctaVisible = await page.evaluate(() => document.querySelector('[data-hero-cta] .btn-primary').getBoundingClientRect().bottom <= window.innerHeight);
  check('phone: hero CTA visible without scrolling', ctaVisible);
  check('phone: no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
}

// ---- no WebGL: page still works ----------------------------------------------------------------------
{
  const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-webgl', '--disable-3d-apis', '--disable-software-rasterizer'] });
  const { page } = await open(browser);
  const r = await page.evaluate(() => ({
    noGl: document.documentElement.classList.contains('no-webgl'),
    h1: document.querySelector('[data-hero-title]').getBoundingClientRect().height > 20,
    hidden: document.documentElement.classList.contains('js-pre'),
  }));
  check('no WebGL: falls back to the plain page with the hero visible', r.noGl && r.h1 && !r.hidden, JSON.stringify(r));
  await browser.close();
}

console.log(failed ? '\nSITE CHECKS FAILED' : '\nSITE CHECKS PASSED');
process.exit(failed ? 1 : 0);
