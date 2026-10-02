import { createMatch, stepWorld } from '../src/sim/match.ts';
const seed = Number(process.argv[2] ?? 1);
const from = Number(process.argv[3] ?? 18) * 60;
const to = Number(process.argv[4] ?? 23) * 60;
const w = createMatch({ seed, difficulty: 'normal', allyDifficulty: 'normal', autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
let last = 0;
for (let i = 0; i < 30 * 60 * 60 && w.winner === -1 && w.time < to; i++) {
  stepWorld(w);
  w.drainEvents();
  if (w.time >= from && w.time - last >= 15) {
    last = w.time;
    const row = (t: 0 | 1) => w.champions.filter((c) => c.team === t).map((c) => `${c.defId.slice(0, 3)}${c.alive ? '' : '(dead)'}@${c.x.toFixed(0)},${c.z.toFixed(0)}:${c.order.t}${c.order.t === 'recall' ? '' : ''}h${(c.hp / c.s.maxHp * 100).toFixed(0)}`).join(' ');
    console.log(`${(w.time / 60).toFixed(2)}m B: ${row(0)}\n         R: ${row(1)}`);
  }
}
