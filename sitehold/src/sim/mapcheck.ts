import { cellPos, type MapData } from './map.ts';
import type { NavGrid } from './nav.ts';
import { World } from './world.ts';

export function makeWorld(map: MapData) { return new World(map.boxes, map.bounds); }

/** Returns human readable problems. An empty list means the map is playable for the bots. */
export function validateMap(map: MapData, world: World, nav: NavGrid): string[] {
  const problems: string[] = [];
  const spawnNode = (t: 0 | 1, i: number) => nav.nearest(map.spawns[t][i].pos.x, 0, map.spawns[t][i].pos.z, 2);
  for (const t of [0, 1] as const) {
    map.spawns[t].forEach((s, i) => {
      if (!world.hullFree(s.pos.x, 0.01, s.pos.z, 0.45, 1.9)) problems.push(`spawn ${t}/${i} is inside geometry`);
      if (spawnNode(t, i) < 0) problems.push(`spawn ${t}/${i} has no nav node`);
    });
  }
  const seen = nav.reachableFrom(spawnNode(1, 0));
  const seenS = nav.reachableFrom(spawnNode(0, 0));
  const check = (label: string, c: number, r: number) => {
    const p = cellPos(c, r);
    const n = nav.nearest(p.x, 0, p.z, 2.5);
    if (n < 0) { problems.push(`${label} at ${c},${r} has no nav node`); return; }
    if (!seen[n]) problems.push(`${label} at ${c},${r} unreachable from Breacher spawn`);
    if (!seenS[n]) problems.push(`${label} at ${c},${r} unreachable from Sentinel spawn`);
  };
  for (const h of map.holds) { check(`hold ${h.name}`, h.at[0], h.at[1]); }
  for (const r of map.routes) r.points.forEach((p, i) => check(`route ${r.name}#${i}`, p[0], p[1]));
  for (const k of ['A', 'B'] as const) {
    map.retake[k].forEach((p, i) => check(`retake ${k}#${i}`, p[0], p[1]));
    map.postPlant[k].forEach((p, i) => check(`postPlant ${k}#${i}`, p[0], p[1]));
  }
  for (const s of map.sites) {
    const n = nav.nearest(s.plant.x, 0, s.plant.z, 2);
    if (n < 0 || !seen[n] || !seenS[n]) problems.push(`site ${s.id} plant spot unreachable`);
  }
  for (const t of [0, 1] as const) map.saveSpots[t].forEach((p, i) => check(`save ${t}#${i}`, p[0], p[1]));
  // every route must be walkable end to end as a path
  for (const r of map.routes) {
    let prev = spawnNode(1, 0);
    r.points.forEach((p, i) => {
      const q = cellPos(p[0], p[1]);
      const n = nav.nearest(q.x, 0, q.z, 2.5);
      if (prev >= 0 && n >= 0 && !nav.nodePath(prev, n)) problems.push(`route ${r.name} leg ${i} has no path`);
      prev = n;
    });
  }
  return problems;
}
