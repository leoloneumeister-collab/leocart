// End to end: the real MCP server, the real built widget inside a sandboxed iframe
// with a real MCP Apps host bridge (AppBridge) on the other side, and the website.
// Needs `npm run build` first. Writes screenshots to docs/screenshots/.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge';
import { createApp, WIDGET_URI } from '../server/index.js';
import { sampleCv } from '../core/sample.js';

// A stuck browser should fail the run, not hang it.
setTimeout(() => {
  console.error('e2e timed out after 3 minutes');
  process.exit(2);
}, 180_000).unref();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'docs', 'screenshots');
mkdirSync(shots, { recursive: true });

const SITE_URL = 'https://cvlens.example';
const app = createApp({ siteUrl: SITE_URL, serveSite: true });
const server = await new Promise((resolve) => {
  const s = app.listen(0, '127.0.0.1', () => resolve(s));
});
const base = `http://127.0.0.1:${server.address().port}`;

let browser;
let mcp;
const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
    console.log(`ok   ${name}`);
  } catch (err) {
    results.push(['FAIL', name]);
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}

try {
  try {
    browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  } catch {
    browser = await chromium.launch({ args: ['--no-sandbox'] });
  }

  // ---- Widget inside a host ------------------------------------------------

  mcp = new Client({ name: 'e2e-host', version: '0.0.0' });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const widgetHtml = (await mcp.readResource({ uri: WIDGET_URI })).contents[0].text;

  async function openWidget(colorScheme, width = 760) {
    const page = await browser.newPage({ colorScheme, viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.setContent('<!doctype html><body style="margin:0;background:transparent"><iframe id="w" style="width:100%;height:980px;border:0"></iframe></body>');
    await page.evaluate((html) => {
      const frame = document.getElementById('w');
      frame.setAttribute('sandbox', 'allow-scripts'); // no same-origin, like a real host
      frame.srcdoc = html;
      window.addEventListener('message', (e) => {
        if (e.source === frame.contentWindow) window.__fromWidget(e.data);
      });
      window.__toWidget = (m) => frame.contentWindow.postMessage(m, '*');
    }, widgetHtml);

    // A transport that carries MCP Apps JSON-RPC between Node and the iframe.
    const transport = {
      onmessage: undefined,
      onclose: undefined,
      onerror: undefined,
      async start() {},
      async close() {},
      async send(message) {
        await page.evaluate((m) => window.__toWidget(m), message);
      },
    };
    await page.exposeFunction('__fromWidget', (m) => transport.onmessage?.(m));

    const bridge = new AppBridge(null, { name: 'e2e-host', version: '0.0.0' }, { openLinks: {}, downloadFile: {} }, {
      hostContext: { theme: colorScheme, displayMode: 'inline' },
    });
    const events = { links: [], downloads: [] };
    bridge.onopenlink = async (p) => {
      events.links.push(p.url);
      return {};
    };
    bridge.ondownloadfile = async (p) => {
      events.downloads.push(p.contents[0].resource);
      return {};
    };
    const ready = new Promise((resolve) => (bridge.oninitialized = resolve));
    await bridge.connect(transport);
    await ready;
    return { page, bridge, events, errors, frame: page.frameLocator('#w') };
  }

  await step('widget draws the chart from a real tool result', async () => {
    const { page, bridge, frame, errors } = await openWidget('light');
    const result = await mcp.callTool({ name: 'visualize_cv', arguments: sampleCv });
    await bridge.sendToolResult(result);
    const svg = frame.locator('svg.cvl-svg');
    await svg.waitFor({ timeout: 5000 });
    assert.match(await svg.getAttribute('aria-labelledby'), /cvl-t/);
    assert.match(await svg.locator('title').first().textContent(), /Sam Rivera/);
    assert.ok((await frame.locator('text', { hasText: 'Senior Analytics Engineer' }).count()) > 0);
    assert.ok((await frame.locator('text', { hasText: 'cvlens.example' }).count()) > 0, 'footer carries the site address');
    await page.screenshot({ path: path.join(shots, 'widget-light.png') });
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    await page.close();
  });

  await step('widget switches to the stacked layout on a phone and back when widened', async () => {
    const { page, bridge, frame, errors } = await openWidget('light', 390);
    await bridge.sendToolResult(await mcp.callTool({ name: 'visualize_cv', arguments: sampleCv }));
    const svg = frame.locator('svg.cvl-svg');
    await svg.waitFor({ timeout: 5000 });
    assert.match(await svg.getAttribute('viewBox'), /^0 0 380 /);
    await page.screenshot({ path: path.join(shots, 'widget-phone.png'), fullPage: true });
    await page.setViewportSize({ width: 760, height: 1000 });
    await page.waitForFunction(() => /^0 0 760 /.test(document.getElementById('w').contentDocument?.querySelector?.('svg')?.getAttribute('viewBox') ?? '') || true);
    for (let i = 0; i < 40; i++) {
      if ((await svg.getAttribute('viewBox')).startsWith('0 0 760 ')) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.match(await svg.getAttribute('viewBox'), /^0 0 760 /);
    assert.deepEqual(errors, []);
    await page.close();
  });

  await step('table view shows the same data', async () => {
    const { page, bridge, frame } = await openWidget('light');
    await bridge.sendToolResult(await mcp.callTool({ name: 'visualize_cv', arguments: sampleCv }));
    await frame.locator('#tab-table').click();
    await frame.locator('table.cvl-table').first().waitFor();
    assert.equal(await frame.locator('table.cvl-table').count(), 3);
    assert.ok((await frame.locator('td', { hasText: 'Stakeholder management' }).count()) > 0);
    await frame.locator('#tab-chart').click();
    await frame.locator('svg.cvl-svg').waitFor();
    await page.close();
  });

  await step('host theme switches the palette', async () => {
    const { page, bridge, frame } = await openWidget('light');
    await bridge.sendToolResult(await mcp.callTool({ name: 'visualize_cv', arguments: sampleCv }));
    await frame.locator('svg.cvl-svg').waitFor();
    bridge.setHostContext({ theme: 'dark', displayMode: 'inline' });
    await page.waitForFunction(() => document.getElementById('w').contentDocument === null || true);
    await frame.locator('html[data-theme="dark"]').waitFor({ timeout: 3000 });
    const bg = await frame.locator('svg.cvl-svg').evaluate((el) => getComputedStyle(el).getPropertyValue('--cvl-bg').trim());
    assert.equal(bg, '#1a1a19');
    await page.screenshot({ path: path.join(shots, 'widget-dark.png') });
    await page.close();
  });

  await step('save asks the host for a light SVG with the site footer', async () => {
    const { page, bridge, frame, events } = await openWidget('dark');
    await bridge.sendToolResult(await mcp.callTool({ name: 'visualize_cv', arguments: sampleCv }));
    await frame.locator('#download').click();
    await page.waitForFunction(() => true);
    for (let i = 0; i < 50 && !events.downloads.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(events.downloads.length, 1);
    const file = events.downloads[0];
    assert.equal(file.mimeType, 'image/svg+xml');
    assert.match(file.uri, /sam-rivera-overview\.svg$/);
    assert.ok(file.text.includes('--cvl-bg:#fcfcfb'), 'exports are pinned to the light palette');
    assert.ok(file.text.includes('cvlens.example'));
    assert.ok(!file.text.includes('prefers-color-scheme'));
    await page.close();
  });

  await step('the call to action opens the site through the host', async () => {
    const { page, bridge, frame, events } = await openWidget('light');
    await bridge.sendToolResult(await mcp.callTool({ name: 'visualize_cv', arguments: sampleCv }));
    await frame.locator('#cta').click();
    for (let i = 0; i < 50 && !events.links.length; i++) await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(events.links, [SITE_URL]);
    await page.close();
  });

  await step('an error result shows its message instead of a chart', async () => {
    const { page, bridge, frame } = await openWidget('light');
    const bad = await mcp.callTool({ name: 'visualize_cv', arguments: { name: 'X', experience: [{ title: 'a', organization: 'b', start: 'never' }] } });
    await bridge.sendToolResult(bad);
    await frame.locator('#status', { hasText: 'Nothing could be drawn' }).waitFor({ timeout: 5000 });
    assert.equal(await frame.locator('svg.cvl-svg').count(), 0);
    await page.close();
  });

  // ---- Website --------------------------------------------------------------

  await step('website renders the demo, offers and install cards', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${base}/`);
    await page.locator('#stage svg.cvl-svg').waitFor();
    assert.ok((await page.locator('#stage text', { hasText: 'Sam Rivera' }).count()) > 0);
    assert.equal(await page.locator('#offers .card').count(), 3);
    assert.equal(await page.locator('#offers .card .btn[aria-disabled="true"]').count(), 2, 'paid offers are disabled until a checkout URL is set');
    assert.ok((await page.locator('#card-claude .pending').count()) === 1, 'no connector URL configured yet');
    await page.screenshot({ path: path.join(shots, 'site-desktop.png'), fullPage: true });
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    await page.close();
  });

  await step('editing the data redraws; bad JSON is reported and keeps the last chart', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`${base}/`);
    await page.locator('summary', { hasText: 'Edit the data' }).click();
    const edited = { ...sampleCv, name: 'Jordan Lee' };
    await page.locator('#json').fill(JSON.stringify(edited));
    await page.locator('#stage text', { hasText: 'Jordan Lee' }).first().waitFor({ timeout: 3000 });
    await page.locator('#json').fill('{ nope');
    await page.locator('#problem', { hasText: 'not valid JSON' }).waitFor({ timeout: 3000 });
    assert.ok((await page.locator('#stage text', { hasText: 'Jordan Lee' }).count()) > 0, 'last good chart stays');
    await page.locator('#json').fill(JSON.stringify({ name: 'W', experience: [{ title: 'T', organization: 'O', start: 'soon' }] }));
    await page.locator('#warnings li').first().waitFor({ timeout: 3000 });
    assert.match(await page.locator('#warnings li').first().textContent(), /start date/);
    await page.locator('#reset').click();
    await page.locator('#stage text', { hasText: 'Sam Rivera' }).first().waitFor({ timeout: 3000 });
    await page.close();
  });

  await step('table tab and SVG download work on the site', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`${base}/`);
    await page.locator('#tab-table').click();
    await page.locator('#stage table.cvl-table').first().waitFor();
    await page.locator('#tab-chart').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#save').click()]);
    assert.equal(download.suggestedFilename(), 'sam-rivera-overview.svg');
    const text = readFileSync(await download.path(), 'utf8');
    assert.ok(text.startsWith('<svg') && text.includes('--cvl-bg:#fcfcfb'));
    await page.close();
  });

  await step('privacy page loads and the site is usable on a phone', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark' });
    await page.goto(`${base}/`);
    await page.locator('#stage svg.cvl-svg').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, `page scrolls sideways by ${overflow}px`);
    assert.match(await page.locator('#stage svg.cvl-svg').getAttribute('viewBox'), /^0 0 380 /, 'phone gets the stacked layout');
    await page.goto(`${base}/privacy.html`);
    await page.locator('h1', { hasText: 'Privacy' }).waitFor();
    await page.close();
  });
} finally {
  await browser?.close();
  await mcp?.close?.();
  app.close();
  server.close();
}

const failed = results.filter(([s]) => s !== 'ok');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
