import { Sim } from '../src/sim/sim.ts';
import { buildMap } from '../src/sim/map.ts';
import { World } from '../src/sim/world.ts';
import { NavGrid } from '../src/sim/nav.ts';
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const map = buildMap(), world = new World(map.boxes, map.bounds), nav = new NavGrid(world);
const seed = Number(process.argv[2] ?? 3), roundWanted = Number(process.argv[3] ?? 2);
const sim = new Sim({ mode: 'comp', humanSide: null, difficulty: 2, seed }, { map, world, nav });
const trails = sim.actors.map(() => []); const kills = []; const events = [];
let rec = false, plan = '';
while (sim.m.phase !== 'over') {
  sim.step();
  for (const e of sim.drainEvents()) {
    if (e.t === 'live' && sim.m.round === roundWanted) { rec = true; plan = sim.ai[1].planName + ' vs ' + sim.ai[0].planName; }
    if (rec && e.t === 'kill') { const v = sim.actors[e.victim]; kills.push({ x: v.pos.x, z: v.pos.z, t: sim.time - sim.m.liveStart, team: v.team }); }
    if (rec && e.t === 'detonate') events.push({ x: e.pos.x, z: e.pos.z, kind: e.kind });
    if (rec && e.t === 'planted') events.push({ x: e.pos.x, z: e.pos.z, kind: 'plant' });
    if (rec && e.t === 'roundEnd') rec = false;
  }
  if (rec && sim.tick % 16 === 0) sim.actors.forEach((a, i) => { if (a.alive) trails[i].push([a.pos.x, a.pos.z, a.team, +(sim.time - sim.m.liveStart).toFixed(1)]); });
  if (sim.m.round > roundWanted) break;
}
const html = `<canvas id=c width=960 height=760 style="background:#c9ae7e"></canvas><div id=t style="font:14px sans-serif;position:absolute;top:4px;left:8px;background:#fffa;padding:2px 8px">${plan}</div><script>
const S=10, g=c.getContext('2d'); const boxes=${JSON.stringify(map.boxes.filter((b) => !b.hide && b.minY < 3).map((b) => [b.minX, b.minZ, b.maxX, b.maxZ, b.maxY]))};
for (const b of boxes){ g.fillStyle=b[4]>3?'#3a3f46':b[4]>1.5?'#6d5a3e':'#8a7550'; g.fillRect(b[0]*S,b[1]*S,(b[2]-b[0])*S,(b[3]-b[1])*S); }
const trails=${JSON.stringify(trails)}; const cols=['#1c8cff','#ff5a1a'];
trails.forEach((tr,i)=>{ g.strokeStyle=cols[tr[0]?tr[0][2]:0]; g.lineWidth=2; g.beginPath(); tr.forEach((p,k)=>{ k?g.lineTo(p[0]*S,p[1]*S):g.moveTo(p[0]*S,p[1]*S); }); g.stroke(); if(tr.length){ const p=tr[tr.length-1]; g.fillStyle=cols[p[2]]; g.beginPath(); g.arc(p[0]*S,p[1]*S,5,0,7); g.fill(); } });
for (const k of ${JSON.stringify(kills)}){ g.strokeStyle='#000'; g.lineWidth=3; g.beginPath(); g.moveTo(k.x*S-7,k.z*S-7); g.lineTo(k.x*S+7,k.z*S+7); g.moveTo(k.x*S+7,k.z*S-7); g.lineTo(k.x*S-7,k.z*S+7); g.stroke(); g.fillStyle='#000'; g.font='11px sans-serif'; g.fillText(k.t.toFixed(0)+'s', k.x*S+8,k.z*S); }
for (const e of ${JSON.stringify(events)}){ g.fillStyle=e.kind==='smoke'?'#fff8':e.kind==='flash'?'#ff08':e.kind==='plant'?'#f00':'#0f08'; g.beginPath(); g.arc(e.x*S,e.z*S,e.kind==='smoke'?30:8,0,7); g.fill(); }
</script>`;
writeFileSync('/tmp/plot.html', html);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 760 } });
await page.goto('file:///tmp/plot.html');
await page.screenshot({ path: `tests/shots/plot-${seed}-${roundWanted}.png` });
await browser.close();
console.log(plan, 'kills', kills.length, 'events', events.length);
