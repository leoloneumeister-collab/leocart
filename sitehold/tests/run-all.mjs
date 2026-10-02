// Runs every fast test. The browser test needs Chromium and takes about a minute, run it with `npm run test:browser`.
import { spawnSync } from 'node:child_process';

const steps = [
  ['typecheck', ['npx', 'tsc', '--noEmit']],
  ['map validation', ['node', 'scripts/validate-map.ts']],
  ['movement', ['node', 'tests/movement.mjs']],
  ['guns', ['node', 'tests/guns.mjs']],
  ['rules', ['node', 'tests/rules.mjs']],
  ['bot matches', ['node', 'scripts/sim.ts', '--matches', '10']],
  ['deathmatch', ['node', 'scripts/sim.ts', '--dm', '--matches', '4']],
];
if (process.argv.includes('--browser')) steps.push(['browser', ['node', 'tests/browser.mjs']]);

let failed = 0;
for (const [name, cmd] of steps) {
  console.log(`\n=== ${name}`);
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.log(`>>> ${name} FAILED`); }
}
console.log(failed ? `\n${failed} step(s) failed` : '\nall steps passed');
process.exit(failed ? 1 : 0);
