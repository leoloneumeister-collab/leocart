// MCP server for CV Lens. One tool, `visualize_cv`, plus the widget that draws
// the result inside ChatGPT or Claude (an MCP App, ui:// resource).
//
// Stateless on purpose: nothing about a CV is stored or logged. Each request
// builds a fresh server, answers and is gone.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { normalizeCv, formatYears } from '../core/normalize.js';
import { cvInputShape } from './schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WIDGET_URI = 'ui://cvlens/overview.html';

let widgetHtml;
function loadWidget() {
  if (widgetHtml) return widgetHtml;
  const file = path.join(root, 'dist', 'widget', 'index.html');
  if (!existsSync(file)) throw new Error(`Widget not built. Run "npm run build:widget" first (looked for ${file}).`);
  widgetHtml = readFileSync(file, 'utf8');
  return widgetHtml;
}

const TOOL_DESCRIPTION = [
  "Draw a visual one-page overview of a person's CV: a career timeline plus a chart of years of hands-on use per skill.",
  'Use it when the user shares CV or resume text and wants it visualised.',
  'Fill the arguments only from what the CV says. Never invent roles, dates, employers or skills.',
  'Dates are YYYY-MM or YYYY; leave end empty or use "present" for a current job.',
  'Put each skill on the role where the CV shows it was used, because the skills chart measures years of use from those roles.',
].join(' ');

function modelSummary(cv) {
  const lines = [`Showed the CV overview for ${cv.name} to the user.`];
  if (cv.work.length) {
    lines.push(
      `${formatYears(cv.stats.yearsExperience)} years of experience, ${cv.stats.employers} employer(s), ${cv.stats.roles} role(s).`,
    );
  }
  if (cv.skills.length) {
    lines.push(`Longest used skills: ${cv.skills.slice(0, 5).map((s) => `${s.name} ${formatYears(s.years)}y`).join(', ')}.`);
  }
  if (cv.warnings.length) lines.push(`Not shown, fix and call again if needed: ${cv.warnings.join(' ')}`);
  lines.push('The chart is already visible to the user, so do not repeat its contents in full.');
  return lines.join(' ');
}

export function buildServer({ siteUrl = '' } = {}) {
  const server = new McpServer({ name: 'cvlens', version: '0.1.0' });

  registerAppTool(
    server,
    'visualize_cv',
    {
      title: 'Visualize a CV',
      description: TOOL_DESCRIPTION,
      inputSchema: cvInputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: WIDGET_URI }, 'openai/outputTemplate': WIDGET_URI },
    },
    async (args) => {
      const cv = normalizeCv(args);
      if (!cv.work.length && !cv.edu.length) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Nothing could be drawn. ${cv.warnings.join(' ') || 'No usable experience or education entries were provided.'}`,
            },
          ],
        };
      }
      return {
        content: [{ type: 'text', text: modelSummary(cv) }],
        structuredContent: { cv, site: { url: siteUrl } },
      };
    },
  );

  registerAppResource(
    server,
    'CV overview',
    WIDGET_URI,
    { description: 'Interactive CV timeline and skills chart' },
    async () => ({
      contents: [{ uri: WIDGET_URI, mimeType: RESOURCE_MIME_TYPE, text: loadWidget() }],
    }),
  );

  return server;
}

// Sliding window per client address, kept only in memory. Addresses are used as
// map keys and never logged.
function rateLimiter(limit, windowMs = 60_000) {
  const hits = new Map();
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, list] of hits) {
      const fresh = list.filter((t) => t > cutoff);
      if (fresh.length) hits.set(key, fresh);
      else hits.delete(key);
    }
  }, windowMs);
  timer.unref();
  const middleware = (req, res, next) => {
    const now = Date.now();
    const list = (hits.get(req.ip) ?? []).filter((t) => t > now - windowMs);
    if (list.length >= limit) {
      res.status(429).json({ jsonrpc: '2.0', error: { code: -32029, message: 'Too many requests. Try again in a minute.' }, id: null });
      return;
    }
    list.push(now);
    hits.set(req.ip, list);
    next();
  };
  middleware.stop = () => clearInterval(timer);
  return middleware;
}

export function createApp(options = {}) {
  const {
    host = '127.0.0.1',
    siteUrl = '',
    serveSite = false,
    ratePerMinute = 60,
    trustProxy = false,
  } = options;

  const app = createMcpExpressApp({ host });
  if (trustProxy) app.set('trust proxy', 1);
  const limit = rateLimiter(ratePerMinute);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.post('/mcp', limit, async (req, res) => {
    const server = buildServer({ siteUrl });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('mcp request failed:', err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  });
  const notAllowed = (_req, res) =>
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);

  const siteDir = path.join(root, 'dist', 'site');
  if (serveSite && existsSync(siteDir)) app.use(express.static(siteDir, { extensions: ['html'] }));

  // Errors raised before a route runs (oversized or malformed JSON). Answer in
  // JSON-RPC shape without printing a stack trace for client mistakes.
  app.use((err, _req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error('request failed:', err.message);
    if (res.headersSent) return;
    const message = status === 413 ? 'Request too large.' : status >= 500 ? 'Internal server error' : 'Bad request.';
    res.status(status).json({ jsonrpc: '2.0', error: { code: status >= 500 ? -32603 : -32600, message }, id: null });
  });

  app.close = () => limit.stop();
  return app;
}

function envFlag(name) {
  return ['1', 'true', 'yes'].includes(String(process.env[name] ?? '').toLowerCase());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  loadWidget(); // fail at startup, not on the first request
  const app = createApp({
    host,
    siteUrl: process.env.SITE_URL ?? '',
    serveSite: envFlag('SERVE_SITE'),
    ratePerMinute: Number(process.env.RATE_LIMIT_PER_MIN ?? 60),
    trustProxy: envFlag('TRUST_PROXY'),
  });
  app.listen(port, host, (err) => {
    if (err) {
      console.error(`failed to listen on ${port}: ${err.message}`);
      process.exit(1);
    }
    console.log(`cvlens MCP server on http://${host}:${port}/mcp`);
  });
}
