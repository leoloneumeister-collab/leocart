import { buildMap } from '../src/sim/map.ts';
const m = buildMap();
console.log(m.grid.map((r, i) => String(i).padStart(2) + ' ' + r).join('\n'));
console.log('boxes', m.boxes.length);
