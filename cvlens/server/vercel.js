// Adapters for running the MCP server as Vercel functions (see api/ and vercel.json).
// Plain Node req/res on purpose: no Express, so nothing depends on how the platform
// treats the request stream.

import { handleMcp, MAX_BODY_BYTES } from './index.js';

export function siteUrlFromEnv(env = process.env) {
  const explicit = env.SITE_URL?.replace(/\/$/, '');
  if (explicit) return explicit;
  // Vercel exposes the production domain (host only) to builds and functions.
  return env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '';
}

function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

function parseJson(text) {
  if (!text.trim()) throw fail(400, 'Empty body');
  try {
    return JSON.parse(text);
  } catch {
    throw fail(400, 'Invalid JSON');
  }
}

/**
 * Reads the JSON body whether or not the platform already consumed the stream.
 * Vercel's Node runtime can parse it into req.body; plain Node leaves it as a stream.
 */
export async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  const pre = req.body;
  if (Buffer.isBuffer(pre)) return parseJson(pre.toString('utf8'));
  if (typeof pre === 'string') return parseJson(pre);
  if (pre && typeof pre === 'object') return pre;

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw fail(413, 'Request too large');
    chunks.push(chunk);
  }
  return parseJson(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(payload));
}

const rpcError = (code, message) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

export async function mcpHandler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, rpcError(-32000, 'Method not allowed.'));
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    const status = err.status ?? 400;
    return sendJson(res, status, rpcError(-32600, status === 413 ? 'Request too large.' : 'Bad request.'));
  }
  return handleMcp(req, res, body, { siteUrl: siteUrlFromEnv() });
}

export function healthHandler(_req, res) {
  sendJson(res, 200, { ok: true });
}
