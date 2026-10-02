import { createMatch, stepWorld } from '../src/sim/match.ts';
import type { Difficulty } from '../src/sim/types.ts';

const diff = (process.argv[2] ?? 'normal') as Difficulty;
const seed = Number(process.argv[3] ?? 1);
const maxMin = Number(process.argv[4] ?? 50);
const w = createMatch({ seed, difficulty: diff, allyDifficulty: diff, autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
const t0 = Date.now();
let last = 0;
const ev = { structure: 0 };
for (let i = 0; i < 30 * 60 * maxMin && w.winner === -1; i++) {
  stepWorld(w);
  for (const e of w.drainEvents()) if (e.t === 'structureDown') ev.structure++;
  if (w.time - last >= 120) {
    last = w.time;
    const s = (t: 0 | 1) => w.champions.filter((c) => c.team === t).map((c) => `${c.defId[0].toUpperCase()}${c.champ!.level}`).join(' ');
    console.log(`t=${(w.time / 60).toFixed(0)}m kills ${w.teamKills[0]}-${w.teamKills[1]} towers ${w.teamTowers[0]}-${w.teamTowers[1]}  blue[${s(0)}] red[${s(1)}] wall=${Date.now() - t0}ms`);
  }
}
for (const c of w.champions) {
  const cc = c.champ!;
  console.log(`${c.team === 0 ? 'B' : 'R'} ${c.defId.padEnd(8)} lvl ${String(cc.level).padStart(2)} ${cc.kills}/${cc.deaths}/${cc.assists} cs ${String(cc.cs).padStart(3)} gold ${cc.totalGold.toFixed(0).padStart(6)} items [${cc.items.filter(Boolean).join(',')}] dmg ${cc.damageDealt.toFixed(0)}`);
}
console.log(`winner=${w.winner} time=${(w.time / 60).toFixed(1)}m wall=${Date.now() - t0}ms`);
