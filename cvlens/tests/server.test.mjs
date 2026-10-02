import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp, WIDGET_URI } from '../server/index.js';
import { sampleCv } from '../core/sample.js';

let httpServer;
let app;
let base;

before(async () => {
  app = createApp({ siteUrl: 'https://cvlens.example', ratePerMinute: 25 });
  await new Promise((resolve) => {
    httpServer = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${httpServer.address().port}`;
});

after(async () => {
  app.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

async function connect() {
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return client;
}

test('health check', async () => {
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('the tool advertises its UI and safe annotations', async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.equal(tools.length, 1);
  const [tool] = tools;
  assert.equal(tool.name, 'visualize_cv');
  assert.equal(tool._meta.ui.resourceUri, WIDGET_URI);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.ok(tool.title);
  assert.ok(tool.inputSchema.required.includes('name'));
  assert.ok(tool.inputSchema.required.includes('experience'));
  await client.close();
});

test('the widget resource is one self-contained HTML document', async () => {
  const client = await connect();
  const res = await client.readResource({ uri: WIDGET_URI });
  const [content] = res.contents;
  assert.equal(content.mimeType, 'text/html;profile=mcp-app');
  assert.ok(content.text.includes('<!doctype html>') || content.text.includes('<!DOCTYPE html>'));
  assert.ok(!/<script[^>]+src=/i.test(content.text), 'no external scripts');
  assert.ok(!/<link[^>]+href=/i.test(content.text), 'no external stylesheets');
  await client.close();
});

test('calling the tool returns structured content for the widget and text for the model', async () => {
  const client = await connect();
  const res = await client.callTool({ name: 'visualize_cv', arguments: sampleCv });
  assert.ok(!res.isError);
  assert.equal(res.structuredContent.site.url, 'https://cvlens.example');
  const cv = res.structuredContent.cv;
  assert.equal(cv.name, 'Sam Rivera');
  assert.equal(cv.work.length, 4);
  assert.equal(cv.stats.employers, 4);
  const text = res.content[0].text;
  assert.ok(text.includes('Sam Rivera'));
  assert.ok(!text.includes('cvlens.example'), 'the model-facing text carries no promotion');
  await client.close();
});

test('unreadable entries come back as warnings, and no usable data is an error', async () => {
  const client = await connect();
  const partial = await client.callTool({
    name: 'visualize_cv',
    arguments: {
      name: 'P',
      experience: [
        { title: 'Good', organization: 'Co', start: '2020-01' },
        { title: 'Bad', organization: 'Co', start: 'whenever' },
      ],
    },
  });
  assert.ok(!partial.isError);
  assert.equal(partial.structuredContent.cv.warnings.length, 1);
  assert.ok(partial.content[0].text.includes('Bad'));

  const none = await client.callTool({
    name: 'visualize_cv',
    arguments: { name: 'P', experience: [{ title: 'Bad', organization: 'Co', start: 'whenever' }] },
  });
  assert.equal(none.isError, true);
  assert.ok(none.content[0].text.includes('Nothing could be drawn'));
  await client.close();
});

test('schema violations are rejected', async () => {
  const client = await connect();
  const res = await client.callTool({ name: 'visualize_cv', arguments: { name: 'P' } }).catch((e) => ({ thrown: e }));
  assert.ok(res.isError || res.thrown, 'missing experience must fail');
  await client.close();
});

test('GET and DELETE on /mcp are not allowed', async () => {
  assert.equal((await fetch(`${base}/mcp`)).status, 405);
  assert.equal((await fetch(`${base}/mcp`, { method: 'DELETE' })).status, 405);
});

test('oversized bodies are refused', async () => {
  const res = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ pad: 'x'.repeat(300_000) }),
  });
  assert.equal(res.status, 413);
});

test('the rate limit kicks in', async () => {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
  let limited = 0;
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${base}/mcp`, { method: 'POST', headers, body });
    if (res.status === 429) limited += 1;
  }
  assert.ok(limited > 0, 'expected at least one 429');
});
