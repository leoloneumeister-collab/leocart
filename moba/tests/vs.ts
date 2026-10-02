// Bot skill ladder: blue allies are always "normal", red uses each difficulty.
import { createMatch, stepWorld } from '../src/sim/match.ts';
import type { Difficulty } from '../src/sim/types.ts';
const seeds = Number(process.argv[2] ?? 8);
for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
  let blue = 0;
  let total = 0;
  let kills = [0, 0];
  for (let seed = 1; seed <= seeds; seed++) {
    const w = createMatch({ seed: seed * 7, difficulty: d, allyDifficulty: 'normal', autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
    for (let i = 0; i < 30 * 60 * 60 && w.winner === -1; i++) {
      stepWorld(w);
      w.drainEvents();
    }
    if (w.winner === 0) blue++;
    total += w.time;
    kills[0] += w.teamKills[0];
    kills[1] += w.teamKills[1];
  }
  console.log(`red=${d.padEnd(6)} blue(normal) wins ${blue}/${seeds}  avg ${(total / seeds / 60).toFixed(1)}m  kills blue ${kills[0]} red ${kills[1]}`);
}
