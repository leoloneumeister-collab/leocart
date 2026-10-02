import { createMatch, stepWorld } from '../src/sim/match.ts';
import type { Difficulty } from '../src/sim/types.ts';

const diffs = (process.argv[2] ?? 'normal').split(',') as Difficulty[];
const seeds = Number(process.argv[3] ?? 4);
let total = 0;
let n = 0;
for (const d of diffs) {
  for (let seed = 1; seed <= seeds; seed++) {
    const w = createMatch({ seed, difficulty: d, allyDifficulty: d, autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
    const t0 = Date.now();
    let nan = false;
    for (let i = 0; i < 30 * 60 * 60 && w.winner === -1; i++) {
      stepWorld(w);
      w.drainEvents();
      if (i % 300 === 0) for (const u of w.units) if (!Number.isFinite(u.x) || !Number.isFinite(u.z) || !Number.isFinite(u.hp)) nan = true;
    }
    total += w.time;
    n++;
    console.log(`${d.padEnd(6)} seed ${seed}: winner=${w.winner === 0 ? 'blue' : w.winner === 1 ? 'red ' : 'none'} time=${(w.time / 60).toFixed(1)}m kills=${w.teamKills.join('-')} towers=${w.teamTowers.join('-')} wall=${Date.now() - t0}ms${nan ? ' NaN!' : ''}`);
  }
}
console.log(`avg ${(total / n / 60).toFixed(1)}m over ${n} matches`);
