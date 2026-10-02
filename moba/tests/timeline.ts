import { createMatch, stepWorld } from '../src/sim/match.ts';
const seed = Number(process.argv[2] ?? 1);
const w = createMatch({ seed, difficulty: 'normal', allyDifficulty: 'normal', autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
for (let i = 0; i < 30 * 60 * 60 && w.winner === -1; i++) {
  stepWorld(w);
  for (const e of w.drainEvents()) {
    if (e.t === 'structureDown') console.log(`${(w.time / 60).toFixed(1)}m  ${e.team === 0 ? 'BLUE' : 'RED '} ${e.kind} ${e.lane} destroyed`);
  }
}
console.log('winner', w.winner, (w.time / 60).toFixed(1));
