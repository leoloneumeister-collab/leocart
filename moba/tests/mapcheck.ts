import { CAMP_SPOTS, LANES, LANE_POINTS, NEXUS_POS, OBSTACLES } from '../src/data/map.ts';
import { distToSegment } from '../src/sim/math.ts';
import { NavGrid } from '../src/sim/nav.ts';
const nav = new NavGrid(OBSTACLES);
for (const c of CAMP_SPOTS) {
  let ld = Infinity;
  let lane = '';
  for (const l of LANES) {
    const pts = LANE_POINTS[l];
    for (let i = 1; i < pts.length; i++) {
      const d = distToSegment(c.x, c.z, pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z);
      if (d < ld) { ld = d; lane = l; }
    }
  }
  const nd = Math.min(...NEXUS_POS.map((n) => Math.hypot(n.x - c.x, n.z - c.z)));
  const blocked = nav.isBlocked(c.x, c.z);
  console.log(`${c.kind.padEnd(7)} (${String(c.x).padStart(4)},${String(c.z).padStart(4)}) lane ${lane} dist ${ld.toFixed(1)}  nexus ${nd.toFixed(0)} ${blocked ? 'BLOCKED' : ''}`);
}
