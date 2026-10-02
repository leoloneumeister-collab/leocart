import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

/** Start `vite preview` (needs a build) or `vite` dev server and wait until it answers. */
export async function startServer({ port = 5175, dev = false } = {}) {
  const args = dev ? ['vite', '--port', String(port), '--strictPort'] : ['vite', 'preview', '--port', String(port), '--strictPort'];
  const p = spawn('npx', args, { stdio: 'ignore', detached: true });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/`);
      if (r.ok) break;
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return () => {
    try {
      process.kill(-p.pid);
    } catch {
      /* already gone */
    }
  };
}

function chromePath() {
  const cands = [process.env.CHROMIUM_PATH, '/opt/pw-browsers/chromium'];
  try {
    for (const d of readdirSync('/opt/pw-browsers')) if (d.startsWith('chromium-')) cands.push(`/opt/pw-browsers/${d}/chrome-linux/chrome`);
  } catch {
    /* no browsers dir */
  }
  return cands.filter(Boolean).find((p) => existsSync(p));
}

export async function launch() {
  const exe = chromePath();
  return chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
}
