import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

export async function startServer(port = 4173) {
  const p = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${port}/`); if (r.ok) break; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return () => { try { process.kill(-p.pid); } catch { /* gone */ } };
}

function pick() {
  const c = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter(Boolean);
  return c.find((p) => existsSync(p));
}

export async function launch() {
  return chromium.launch({
    ...(pick() ? { executablePath: pick() } : {}),
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
}

export function watch(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack ?? ''}`));
  return errors;
}
