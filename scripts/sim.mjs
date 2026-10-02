// Headless physics/AI check. Usage: node scripts/sim.mjs [trackId] [laps]
// Drives every character solo around each track with the bot and reports lap times.
import { buildTrackData, posAt } from '../src/game/trackMath.js';
import { TRACKS } from '../src/game/tracks/index.js';
import { CHARACTERS } from '../src/game/characters.js';
import { Kart } from '../src/game/kart.js';
import { AIDriver } from '../src/game/ai.js';

const only = process.argv[2];
const laps = Number(process.argv[3] || 2);
for (const def of TRACKS) {
  if (only && def.id !== only) continue;
  const track = buildTrackData(def);
  console.log(`\n== ${def.name} (${track.length.toFixed(0)} m) ==`);
  for (const ch of CHARACTERS) {
    const kart = new Kart(track, ch, { index: 0 });
    const st = posAt(track, -20, 0);
    kart.placeAt(st.x, st.z, st.h);
    kart.frozen = false;
    const stats = { wall: 0, drifts: 0, minis: 0, respawn: 0, rough: 0 };
    const world = {
      karts: [kart],
      items: null,
      emit(type) {
        if (type === 'wall') stats.wall++;
        if (type === 'driftStart') stats.drifts++;
        if (type === 'miniTurbo') stats.minis++;
        if (type === 'respawn') stats.respawn++;
      },
    };
    const ai = new AIDriver(kart, track, { skill: ch.ai.skill, aggression: ch.ai.aggression, seed: 3 });
    const dt = 1 / 60;
    let t = 0, lapStart = 0, lap = 0;
    const times = [];
    let top = 0;
    let slowT = 0;
    while (t < 400 && lap < laps) {
      ai.update(dt, world);
      kart.update(dt, world);
      t += dt;
      top = Math.max(top, kart.speed);
      if (kart.surface === 'rough') stats.rough += dt;
      if (kart.speed < 2 && t > 3) slowT += dt; else slowT = 0;
      if (slowT > 3) { kart.respawn(world); slowT = 0; }
      const d = kart.probe.distance;
      if (d >= (lap + 1) * track.length) { lap++; times.push(t - lapStart); lapStart = t; }
    }
    console.log(
      `${ch.name.padEnd(6)} laps ${times.map((x) => x.toFixed(1)).join(' / ').padEnd(14)} top ${(top * 3.6).toFixed(0)} km/h  walls ${stats.wall}  drifts ${stats.drifts} minis ${stats.minis}  offroad ${stats.rough.toFixed(1)}s  respawns ${stats.respawn}`,
    );
  }
}
