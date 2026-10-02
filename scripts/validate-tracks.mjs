// Sanity checks for track geometry: length, tightest corner, clearance between track sections,
// checkpoint/shortcut consistency. Exits non-zero if a track is unusable.
import { buildTrackData } from '../src/game/trackMath.js';
import { TRACKS } from '../src/game/tracks/index.js';

let failed = false;
for (const def of TRACKS) {
  const t = buildTrackData(def);
  let kMax = 0, kAt = 0;
  for (let i = 0; i < t.N; i++) if (Math.abs(t.kappa[i]) > kMax) { kMax = Math.abs(t.kappa[i]); kAt = i; }
  const minR = 1 / kMax;
  // Clearance between parts of the track that are far apart along the lap.
  let minClear = Infinity, cAt = [0, 0];
  const far = 140 / t.ds;
  for (let i = 0; i < t.N; i++) {
    for (let j = i + 1; j < t.N; j++) {
      const sep = Math.min(j - i, t.N - (j - i));
      if (sep < far) continue;
      const d = Math.hypot(t.x[i] - t.x[j], t.z[i] - t.z[j]);
      const clear = d - (t.w[i] / 2 + t.w[j] / 2) - t.shoulder * 2;
      if (clear < minClear) { minClear = clear; cAt = [i, j]; }
    }
  }
  const warnings = [];
  if (minClear < 6) warnings.push(`sections too close (${minClear.toFixed(1)} m clearance at ${cAt})`);
  if (minR < t.w[kAt] / 2 + t.shoulder + 3) warnings.push(`corner radius ${minR.toFixed(1)} m is too tight for width`);
  // Checkpoints must not sit inside a shortcut span, or a shortcut would skip the gate.
  for (const c of t.checkpoints) if (t.openL[c.i] || t.openR[c.i]) warnings.push(`checkpoint at ${c.s.toFixed(0)} m is inside a wall gap`);
  if (t.checkpoints.length < 3) warnings.push('needs at least 3 checkpoints');
  console.log(`${def.id.padEnd(8)} length ${t.length.toFixed(0)} m  samples ${t.N}  width ${def.width} m  tightest corner R=${minR.toFixed(1)} m @${(t.s[kAt]).toFixed(0)} m  min clearance ${minClear.toFixed(1)} m`);
  for (const w of warnings) { console.log('   WARN', w); failed = true; }
}
process.exit(failed ? 1 : 0);
