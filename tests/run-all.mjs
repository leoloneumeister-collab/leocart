// One command to run every check: lint, track validation, then the browser tests against a
// throwaway dev server. Usage: npm test
import { spawn, spawnSync } from 'node:child_process';

const PORT = 4599;
const BASE = `http://localhost:${PORT}/`;

function run(label, cmd, args, env = {}) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  return r.status === 0;
}

let ok = true;
ok = run('lint', 'npx', ['eslint', 'src', 'scripts', 'tests']) && ok;
ok = run('track validation', 'node', ['scripts/validate-tracks.mjs']) && ok;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  ok = run('end-to-end (full races, cup, controls, gamepad)', 'node', ['tests/e2e.mjs'], { BASE_URL: BASE }) && ok;
  ok = run('audio render', 'node', ['tests/audio.mjs'], { BASE_URL: BASE }) && ok;
  ok = run('performance budget', 'node', ['tests/perf.mjs'], { BASE_URL: BASE }) && ok;
} finally {
  server.kill();
}
console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
