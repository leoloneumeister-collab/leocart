// How does a match go if the human never touches the controls (4v5 on autopilot teammates)?
import { createMatch, stepWorld } from '../src/sim/match.ts';
import type { Difficulty } from '../src/sim/types.ts';
for (const d of ['easy', 'normal', 'hard'] as Difficulty[]) {
  const res: string[] = [];
  let blue = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const w = createMatch({ seed: seed * 13, difficulty: d, autoPlayer: false, fog: true, playerChampion: 'kestrel', playerLane: 'bot' });
    for (let i = 0; i < 30 * 60 * 60 && w.winner === -1; i++) {
      stepWorld(w);
      w.drainEvents();
    }
    if (w.winner === 0) blue++;
    res.push(`${w.winner === 0 ? 'W' : w.winner === 1 ? 'L' : '?'}${(w.time / 60).toFixed(0)}m`);
  }
  console.log(`AFK human vs ${d.padEnd(6)}: ${res.join(' ')}  (blue wins ${blue}/6)`);
}
