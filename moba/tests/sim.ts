/**
 * Headless bot-vs-bot match tests (no browser). Runs full matches at accelerated time and asserts
 * that they finish with a nexus kill, stay finite, and are deterministic for a given seed.
 */
import { createMatch, stepWorld } from '../src/sim/match.ts';
import type { Difficulty } from '../src/sim/types.ts';
import type { World } from '../src/sim/world.ts';

const MAX_MINUTES = 45;
let failures = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`);
  if (!ok) failures++;
}

function checksum(w: World): number {
  let h = 2166136261;
  const mix = (v: number) => {
    h ^= Math.round(v * 100) | 0;
    h = Math.imul(h, 16777619);
  };
  for (const u of w.units) {
    mix(u.id);
    mix(u.x);
    mix(u.z);
    mix(u.hp);
  }
  for (const c of w.champions) mix(c.champ!.gold);
  return h >>> 0;
}

function finite(w: World): boolean {
  for (const u of w.units) {
    if (!Number.isFinite(u.x) || !Number.isFinite(u.z) || !Number.isFinite(u.hp) || !Number.isFinite(u.mana)) return false;
    if (u.champ && (!Number.isFinite(u.champ.gold) || !Number.isFinite(u.champ.xp))) return false;
  }
  return true;
}

function play(seed: number, diff: Difficulty, maxMin = MAX_MINUTES) {
  const w = createMatch({ seed, difficulty: diff, allyDifficulty: diff, autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
  let ok = true;
  const t0 = Date.now();
  for (let i = 0; i < 30 * 60 * maxMin && w.winner === -1; i++) {
    stepWorld(w);
    w.drainEvents();
    if (i % 150 === 0 && !finite(w)) {
      ok = false;
      break;
    }
  }
  return { w, finite: ok && finite(w), ms: Date.now() - t0 };
}

for (const [seed, diff] of [
  [1, 'easy'],
  [2, 'normal'],
  [3, 'hard'],
  [4, 'normal'],
] as [number, Difficulty][]) {
  const r = play(seed, diff);
  const w = r.w;
  check(`${diff} match (seed ${seed}) ends with a nexus kill`, w.winner !== -1, `winner=${w.winner === 0 ? 'blue' : 'red'} at ${(w.time / 60).toFixed(1)}m kills=${w.teamKills.join('-')} towers=${w.teamTowers.join('-')} (${r.ms}ms)`);
  check(`${diff} match (seed ${seed}) finishes within ${MAX_MINUTES} minutes`, w.time <= MAX_MINUTES * 60);
  check(`${diff} match (seed ${seed}) stays finite`, r.finite);
  const nexus = w.structures.find((s) => s.kind === 'nexus' && s.team !== w.winner);
  check(`${diff} match (seed ${seed}) loser nexus is destroyed`, !!nexus && !nexus.alive);
  const everyone = w.champions.every((c) => c.champ!.kills + c.champ!.deaths + c.champ!.assists + c.champ!.cs > 0);
  check(`${diff} match (seed ${seed}) every champion took part`, everyone);
}

// Determinism: same seed, same world
{
  const a = play(11, 'normal', 8);
  const b = play(11, 'normal', 8);
  const c = play(12, 'normal', 8);
  check('same seed reproduces the exact same world', checksum(a.w) === checksum(b.w) && a.w.time === b.w.time);
  check('different seeds diverge', checksum(a.w) !== checksum(c.w));
}

// Fog of war: bots only see what their team sees
{
  const w = createMatch({ seed: 5, difficulty: 'normal', autoPlayer: true, fog: true, playerChampion: 'ironvow', playerLane: 'top' });
  for (let i = 0; i < 30 * 20; i++) stepWorld(w);
  const redInBlueView = w.champions.filter((c) => c.team === 1 && w.visible[0].has(c.id)).length;
  check('enemy champions in their fountain are hidden from the other team at 20s', redInBlueView === 0);
}

console.log(failures === 0 ? 'SIM TESTS PASSED' : `${failures} SIM CHECK(S) FAILED`);
if (failures) process.exit(1);
