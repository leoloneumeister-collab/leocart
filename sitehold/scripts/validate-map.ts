import { buildMap, COLS, ROWS } from '../src/sim/map.ts';
import { NavGrid } from '../src/sim/nav.ts';
import { makeWorld, validateMap } from '../src/sim/mapcheck.ts';

const map = buildMap();
const world = makeWorld(map);
let t0 = performance.now();
const nav = new NavGrid(world);
console.log(`nav built: ${nav.size} nodes in ${(performance.now() - t0).toFixed(0)} ms, boxes ${map.boxes.length}`);
const problems = validateMap(map, world, nav);
console.log(problems.length ? problems.join('\n') : 'map ok');

// ascii overlay: '.' walkable, ' ' not, digit = layers
const rows: string[] = [];
for (let r = 0; r < ROWS * 2; r++) {
  let line = '';
  for (let c = 0; c < COLS * 2; c++) {
    const x = c + 0.5, z = r + 0.5;
    let hs: number[] = [];
    for (let i = 0; i < nav.size; i++) if (Math.abs(nav.nx[i] - x) < 0.01 && Math.abs(nav.nz[i] - z) < 0.01) hs.push(nav.nh[i]);
    line += hs.length === 0 ? '#' : hs.length === 1 ? (hs[0] > 0.05 ? String(Math.min(9, Math.round(hs[0] * 3))) : '.') : '+';
  }
  rows.push(line);
}
if (process.argv.includes('--nav')) console.log(rows.join('\n'));
t0 = performance.now();
const s = nav.nearest(map.spawns[1][0].pos.x, 0, map.spawns[1][0].pos.z);
let paths = 0;
for (let i = 0; i < 20; i++) { const e = nav.nearest(map.sites[i % 2].plant.x, 0, map.sites[i % 2].plant.z); if (nav.nodePath(s, e)) paths++; }
console.log(`20 A* queries: ${paths} found in ${(performance.now() - t0).toFixed(1)} ms`);
if (problems.length) process.exit(1);
