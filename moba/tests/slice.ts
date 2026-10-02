/** Phase 1 gate: a scripted champion follows its minion wave and pushes the mid lane to a nexus kill. */
import { createMatch, stepWorld } from '../src/sim/match.ts';
import { pointOnLane, laneLength } from '../src/data/map.ts';
import { dist } from '../src/sim/math.ts';

const w = createMatch({ midOnly: true, blueChampions: ['ironvow'], redChampions: [], playerChampion: 'ironvow', seed: 3 });
const p = w.getPlayer()!;
w.push({ type: 'levelUp', unit: p.id, slot: 0 });
const total = laneLength('mid');
let recalling = false;
const t0 = Date.now();
let lastLog = 0;
for (let i = 0; i < 30 * 60 * 40 && w.winner === -1; i++) {
  if (i % 10 === 0 && p.alive) {
    if (p.champ!.inShop && p.champ!.gold >= 350) {
      for (const id of ['longblade', 'clothplate', 'vitalgem', 'warblade']) w.push({ type: 'buy', unit: p.id, item: id });
    }
    for (const s of [0, 1, 2, 0, 1, 0, 2, 3]) w.push({ type: 'levelUp', unit: p.id, slot: s });
    if (p.hp / p.s.maxHp < 0.4 && !recalling && p.order.t !== 'recall') {
      w.push({ type: 'recall', unit: p.id });
      recalling = true;
    } else if (recalling) {
      if (p.hp / p.s.maxHp > 0.95 && p.champ!.inShop) recalling = false;
    } else {
      const mins = w.units.filter((u) => u.kind === 'minion' && u.team === 0);
      let best = -1;
      let bx = p.x;
      let bz = p.z;
      for (const m of mins) {
        // progress along mid lane: project on blue->red diagonal
        const prog = (m.x - m.z) / 2;
        if (prog > best) {
          best = prog;
          bx = m.x;
          bz = m.z;
        }
      }
      if (mins.length > 0) {
        const k = 0.9;
        w.push({ type: 'attackMove', unit: p.id, x: bx + 3 * k, z: bz - 3 * k });
      }
    }
  }
  stepWorld(w);
  w.drainEvents();
  if (w.time - lastLog >= 120) {
    lastLog = w.time;
    console.log(`t=${(w.time / 60).toFixed(0)}m lvl=${p.champ!.level} gold=${p.champ!.totalGold.toFixed(0)} cs=${p.champ!.cs} deaths=${p.champ!.deaths} towers=${w.teamTowers[0]} hp=${p.hp.toFixed(0)}/${p.s.maxHp.toFixed(0)} pos=(${p.x.toFixed(0)},${p.z.toFixed(0)})`);
  }
}
void pointOnLane;
void dist;
console.log(`winner=${w.winner} time=${(w.time / 60).toFixed(1)}m wall=${Date.now() - t0}ms total=${total.toFixed(0)}`);
if (w.winner !== 0) {
  console.error('FAIL: blue did not destroy the red nexus');
  process.exit(1);
}
console.log('PASS');
