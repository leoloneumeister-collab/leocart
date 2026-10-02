/**
 * Headless bot vs bot matches. No GPU, no DOM. Usage: node scripts/sim.ts [--matches N] [--difficulty 0..3] [--seed N] [--verbose]
 * Asserts the things that must always hold: no crashes, no stuck rounds, no stuck bots, both objectives happen,
 * both sides win a fair share, money stays in range.
 */
import { Sim } from '../src/sim/sim.ts';
import { buildMap } from '../src/sim/map.ts';
import { World } from '../src/sim/world.ts';
import { NavGrid } from '../src/sim/nav.ts';
import { DT, ROUND } from '../src/sim/constants.ts';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const matches = arg('--matches', 6);
const difficulty = arg('--difficulty', 2) as 0 | 1 | 2 | 3;
const seed0 = arg('--seed', 1);
const verbose = process.argv.includes('--verbose');

const map = buildMap();
const world = new World(map.boxes, map.bounds);
const nav = new NavGrid(world);

const stats = {
  matches: 0, rounds: 0, breacherWins: 0, sentinelWins: 0, plants: 0, defuses: 0, explosions: 0, elim: 0, time: 0,
  stuckRounds: 0, maxRoundSecs: 0, sumRoundSecs: 0, kills: 0, headshots: 0, flashes: 0, smokes: 0, hes: 0, fires: 0,
  moneyViolations: 0, crashes: 0, stuckBots: 0, plantTimes: [] as number[], longestStuck: 0, maxTicks: 0, sites: { A: 0, B: 0 },
  reasons: {} as Record<string, number>, matchTicks: 0, wallMs: 0,
};
const problems: string[] = [];
const t0 = performance.now();

for (let mi = 0; mi < matches; mi++) {
  const sim = new Sim({ mode: 'comp', humanSide: null, difficulty, seed: seed0 + mi * 7919 }, { map, world, nav });
  let roundStartTick = sim.tick;
  let lastRound = sim.m.round;
  let guard = 0;
  let planted = false;
  try {
    while (sim.m.phase !== 'over' && guard++ < 64 * 60 * 60) {
      sim.step();
      for (const e of sim.drainEvents()) {
        if (e.t === 'kill') { stats.kills++; if (e.head) stats.headshots++; }
        else if (e.t === 'planted') { stats.plants++; stats.sites[e.site]++; planted = true; stats.plantTimes.push(sim.time - sim.m.liveStart); }
        else if (e.t === 'defused') stats.defuses++;
        else if (e.t === 'exploded') stats.explosions++;
        else if (e.t === 'detonate') { if (e.kind === 'flash') stats.flashes++; else if (e.kind === 'smoke') stats.smokes++; else if (e.kind === 'he') stats.hes++; else stats.fires++; }
        else if (e.t === 'roundEnd') {
          stats.rounds++;
          if (e.winner === 1) stats.breacherWins++; else stats.sentinelWins++;
          stats.reasons[e.reason] = (stats.reasons[e.reason] ?? 0) + 1;
          const secs = (sim.tick - roundStartTick) * DT;
          stats.sumRoundSecs += secs; stats.maxRoundSecs = Math.max(stats.maxRoundSecs, secs);
          if (secs > ROUND.freeze + ROUND.time + ROUND.bomb + 6) { stats.stuckRounds++; problems.push(`match ${mi} round ${lastRound} lasted ${secs.toFixed(0)}s`); }
          if (verbose) console.log(`m${mi} r${e.round} ${e.winner === 1 ? 'BREACH' : 'SENTINEL'} by ${e.reason} ${secs.toFixed(0)}s score ${sim.m.score.join('-')} plan ${sim.ai[1].planName}/${sim.ai[0].planName} mode ${sim.ai[0].mode}/${sim.ai[1].mode}`);
        } else if (e.t === 'freezeStart') { roundStartTick = sim.tick; lastRound = e.round; planted = false; }
      }
      void planted;
      for (const a of sim.actors) if (a.money < 0 || a.money > ROUND.maxMoney) { stats.moneyViolations++; problems.push(`money ${a.money}`); a.money = 0; }
    }
    if (sim.m.phase !== 'over') problems.push(`match ${mi} did not finish`);
    stats.matches++;
    stats.matchTicks += sim.tick;
    for (const b of sim.brains.values()) { stats.stuckBots += b.stuckEvents; stats.longestStuck = Math.max(stats.longestStuck, b.maxStuck); }
  } catch (err) {
    stats.crashes++;
    problems.push(`match ${mi} crashed: ${(err as Error).stack}`);
  }
}
stats.wallMs = performance.now() - t0;

const avgPlant = stats.plantTimes.length ? stats.plantTimes.reduce((a, b) => a + b, 0) / stats.plantTimes.length : 0;
console.log(`matches ${stats.matches}  rounds ${stats.rounds}  wall ${(stats.wallMs / 1000).toFixed(1)}s  (${(stats.matchTicks / (stats.wallMs / 1000) / 64).toFixed(0)}x realtime)`);
console.log(`breacher wins ${stats.breacherWins} (${((stats.breacherWins / Math.max(1, stats.rounds)) * 100).toFixed(0)}%)  sentinel wins ${stats.sentinelWins}`);
console.log(`reasons`, stats.reasons);
console.log(`plants ${stats.plants} (A ${stats.sites.A} / B ${stats.sites.B}, avg ${avgPlant.toFixed(0)}s after live)  defuses ${stats.defuses}  explosions ${stats.explosions}`);
console.log(`kills ${stats.kills}  hs ${((stats.headshots / Math.max(1, stats.kills)) * 100).toFixed(0)}%  kills/round ${(stats.kills / Math.max(1, stats.rounds)).toFixed(1)}  flashes ${stats.flashes} smokes ${stats.smokes} he ${stats.hes} fire ${stats.fires}`);
console.log(`avg round ${(stats.sumRoundSecs / Math.max(1, stats.rounds)).toFixed(0)}s, longest ${stats.maxRoundSecs.toFixed(0)}s, stuck events ${stats.stuckBots}, longest single stuck ${stats.longestStuck.toFixed(1)}s`);

const fail: string[] = [...problems.slice(0, 8)];
const rate = stats.breacherWins / Math.max(1, stats.rounds);
if (stats.crashes) fail.push('crashes');
if (stats.longestStuck > 8) fail.push(`a bot was stuck for ${stats.longestStuck.toFixed(1)}s`);
if (stats.plants === 0) fail.push('no bomb was ever planted');
if (stats.defuses === 0 && stats.rounds > 30) fail.push('no bomb was ever defused');
if (stats.rounds >= 40 && (rate < 0.3 || rate > 0.7)) fail.push(`unbalanced: breachers won ${(rate * 100).toFixed(0)}%`);
if (fail.length) { console.log('FAILED\n' + fail.join('\n')); process.exit(1); }
console.log('sim ok');
