// Share of time each bot spends in each mode during the first N minutes
import { createMatch, stepWorld } from '../src/sim/match.ts';
import { botMode } from '../src/sim/bots.ts';
const minutes = Number(process.argv[2] ?? 6);
const w = createMatch({ seed: Number(process.argv[3] ?? 4), difficulty: 'normal', allyDifficulty: 'normal', autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
const acc = new Map<number, Map<string, number>>();
for (let i = 0; i < 30 * 60 * minutes; i++) {
  stepWorld(w);
  w.drainEvents();
  if (i % 15 === 0) for (const c of w.champions) {
    if (c.team !== 0) continue;
    const m = !c.alive ? 'dead' : botMode(w, c.id);
    const mm = acc.get(c.id) ?? new Map();
    mm.set(m, (mm.get(m) ?? 0) + 0.5);
    acc.set(c.id, mm);
  }
}
for (const c of w.champions) {
  if (c.team !== 0) continue;
  const mm = acc.get(c.id)!;
  console.log(`${c.defId.padEnd(8)} cs${String(c.champ!.cs).padStart(3)} lvl${c.champ!.level} k/d/a ${c.champ!.kills}/${c.champ!.deaths}/${c.champ!.assists}  ` + [...mm.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${Math.round(v)}s`).join(' '));
}
