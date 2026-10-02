import { createMatch, stepWorld } from '../src/sim/match.ts';
const w = createMatch({ seed: 2, difficulty: 'normal', allyDifficulty: 'normal', autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
const s = w.champions.find((c) => c.team === 0 && c.defId === 'sable')!;
let last = 0;
for (let i = 0; i < 30 * 60 * 7 && w.winner === -1; i++) {
  stepWorld(w);
  w.drainEvents();
  if (w.time - last >= 10) {
    last = w.time;
    const camps = w.camps.filter((c) => c.id < 6).map((c) => `${c.kind[0]}${c.respawnAt > 0 ? 'x' + Math.round(c.respawnAt) : c.members.filter((id) => w.get(id)?.alive).length}`).join(' ');
    console.log(`${w.time.toFixed(0)}s sable (${s.x.toFixed(0)},${s.z.toFixed(0)}) ${s.order.t} hp${(s.hp / s.s.maxHp * 100).toFixed(0)} lvl${s.champ!.level} cs${s.champ!.cs} xp${s.champ!.xp.toFixed(0)} camps ${camps}`);
  }
}
