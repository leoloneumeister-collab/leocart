// Runs the real api/*.js functions on a bare Node http server. Vercel's runtime is not
// available here, so this covers our code (routing, body handling, limits, MCP), not the platform.

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import mcp from '../api/mcp.js';
import health from '../api/health.js';
import { siteUrlFromEnv, readJsonBody } from '../server/vercel.js';
import { sampleCv } from '../core/sample.js';

const route = (req, res) => (req.url === '/health' ? health(req, res) : req.url === '/mcp' ? mcp(req, res) : (res.statusCode = 404, res.end()));

// Mimics Vercel's Node runtime, which can hand the handler a body that is already parsed.
async function preParsed(req, res) {
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const text = Buffer.concat(chunks).toString('utf8');
    try {
      req.body = JSON.parse(text);
    } catch {
      req.body = text;
    }
  }
  return route(req, res);
}

const servers = {};
const bases = {};
before(async () => {
  process.env.SITE_URL = 'https://cvlens.example';
  for (const [name, handler] of [['raw', route], ['parsed', preParsed]]) {
    servers[name] = http.createServer(handler);
    await new Promise((resolve) => servers[name].listen(0, '127.0.0.1', resolve));
    bases[name] = `http://127.0.0.1:${servers[name].address().port}`;
  }
});
after(async () => {
  delete process.env.SITE_URL;
  for (const s of Object.values(servers)) await new Promise((resolve) => s.close(resolve));
});

for (const mode of ['raw', 'parsed']) {
  test(`[${mode} body] health, tool list and a real tool call`, async () => {
    assert.deepEqual(await (await fetch(`${bases[mode]}/health`)).json(), { ok: true });
    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${bases[mode]}/mcp`)));
    const { tools } = await client.listTools();
    assert.equal(tools[0].name, 'visualize_cv');
    const widget = await client.readResource({ uri: tools[0]._meta.ui.resourceUri });
    assert.equal(widget.contents[0].mimeType, 'text/html;profile=mcp-app');
    const res = await client.callTool({ name: 'visualize_cv', arguments: sampleCv });
    assert.equal(res.structuredContent.cv.name, 'Sam Rivera');
    assert.equal(res.structuredContent.site.url, 'https://cvlens.example');
    await client.close();
  });
}

test('wrong method, bad JSON, empty body and oversize bodies get clean JSON-RPC errors', async () => {
  const post = (body) =>
    fetch(`${bases.raw}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body });
  assert.equal((await fetch(`${bases.raw}/mcp`)).status, 405);
  const bad = await post('{ nope');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.message, 'Bad request.');
  assert.equal((await post('')).status, 400);
  const big = await post(JSON.stringify({ pad: 'x'.repeat(200_000) }));
  assert.equal(big.status, 413);
});

test('siteUrlFromEnv prefers SITE_URL, then the Vercel production host', () => {
  assert.equal(siteUrlFromEnv({ SITE_URL: 'https://a.example/' }), 'https://a.example');
  assert.equal(siteUrlFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: 'cvlens.vercel.app' }), 'https://cvlens.vercel.app');
  assert.equal(siteUrlFromEnv({ SITE_URL: 'https://a.example', VERCEL_PROJECT_PRODUCTION_URL: 'b.app' }), 'https://a.example');
  assert.equal(siteUrlFromEnv({}), '');
});

test('readJsonBody accepts an already parsed object, string or buffer', async () => {
  assert.deepEqual(await readJsonBody({ body: { a: 1 } }), { a: 1 });
  assert.deepEqual(await readJsonBody({ body: '{"a":2}' }), { a: 2 });
  assert.deepEqual(await readJsonBody({ body: Buffer.from('{"a":3}') }), { a: 3 });
});
