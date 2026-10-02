// Logic tests for Tidehold: economy rules, save/load, the island generator and battle balance.
// Pure node, no browser needed. Run: node tidehold/tests/run.mjs
import assert from 'node:assert/strict';
import * as D from '../js/data.js';
import * as St from '../js/state.js';
import * as G from '../js/gen.js';
import * as Sim from '../js/sim.js';

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}\n       ${e.message.split('\n')[0]}`);
  }
}

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;

console.log('data');
test('every cost fits in the storage the player has at that Keep level', () => {
  for (let k = 1; k <= D.KEEP_MAX; k++) {
    const lvl = Math.min(D.MAX_LVL, k + 1);
    const gold = D.BUILDINGS.keep.storeGold[k - 1] + D.countAllowed('vault', k) * D.storeCapacity('vault', lvl);
    const crystal = D.BUILDINGS.keep.storeCrystal[k - 1] + D.countAllowed('tank', k) * D.storeCapacity('tank', lvl);
    for (const type of Object.keys(D.BUILDINGS)) {
      if (type === 'keep') continue;
      for (let l = 1; l <= D.maxLevelAllowed(type, k); l++) {
        const c = D.buildCost(type, l);
        const cap = c.res === 'gold' ? gold : crystal;
        assert.ok(c.amt <= cap, `${type} L${l} costs ${c.amt} ${c.res}, storage at Keep ${k} is ${cap}`);
      }
    }
    if (k < D.KEEP_MAX) {
      const c = D.buildCost('keep', k + 1);
      assert.ok(c.amt <= gold, `Keep ${k + 1} costs ${c.amt}, storage at Keep ${k} is ${gold}`);
    }
  }
});
test('troop forge costs fit in crystal storage', () => {
  for (let k = 2; k <= D.KEEP_MAX; k++) {
    const crystal = D.BUILDINGS.keep.storeCrystal[k - 1] + D.countAllowed('tank', k) * D.storeCapacity('tank', Math.min(D.MAX_LVL, k + 1));
    for (const t of D.TROOP_ORDER) {
      const lvl = Math.min(D.TROOP_MAX, Math.min(5, k) + 1);
      assert.ok(D.forgeCost(t, lvl) <= crystal, `${t} L${lvl} forge cost ${D.forgeCost(t, lvl)} vs ${crystal} at Keep ${k}`);
    }
  }
});
test('levels, counts and times grow', () => {
  for (const [type, d] of Object.entries(D.BUILDINGS)) {
    for (let l = 2; l <= d.max; l++) {
      assert.ok(D.buildCost(type, l).amt >= D.buildCost(type, l - 1).amt, `${type} cost`);
      assert.ok(D.buildTime(type, l) >= D.buildTime(type, l - 1), `${type} time`);
    }
    for (let k = 2; k <= D.KEEP_MAX; k++) assert.ok(d.counts[k - 1] >= d.counts[k - 2], `${type} counts`);
  }
});

console.log('state');
test('a new island is valid and has no overlaps', () => {
  const S = St.newGame(NOW);
  const seen = new Set();
  const all = [...S.buildings.map((b) => ({ x: b.x, y: b.y, s: St.sizeOf(b) })), ...S.obstacles.map((o) => ({ x: o.x, y: o.y, s: o.size }))];
  for (const e of all) {
    assert.ok(St.inBuildArea(e.x, e.y, e.s));
    for (let y = e.y; y < e.y + e.s; y++) for (let x = e.x; x < e.x + e.s; x++) {
      assert.ok(!seen.has(y * 100 + x), `overlap at ${x},${y}`);
      seen.add(y * 100 + x);
    }
  }
  assert.equal(S.obstacles.length >= 8, true);
});
test('building takes a builder, money and time, then completes', () => {
  const S = St.newGame(NOW);
  const gold = S.res.gold;
  const r = St.startBuild(S, 'gmine', 24, 24, NOW);
  assert.ok(r.ok, r.err);
  assert.equal(S.res.gold, gold - D.buildCost('gmine', 1).amt);
  assert.equal(St.freeBuilders(S), 1);
  assert.equal(r.b.lvl, 0);
  const ev = St.tick(S, NOW + 5 * 60_000);
  assert.ok(ev.some((e) => e.type === 'built'));
  assert.equal(r.b.lvl, 1);
  assert.equal(St.freeBuilders(S), 2);
});
test('cannot build on top of things, outside the area, or past the limit', () => {
  const S = St.newGame(NOW);
  assert.equal(St.startBuild(S, 'gmine', 15, 15, NOW).ok, false);
  assert.equal(St.startBuild(S, 'gmine', 1, 1, NOW).ok, false);
  assert.ok(St.startBuild(S, 'gmine', 24, 24, NOW).ok);
  St.tick(S, NOW + HOUR);
  assert.equal(St.startBuild(S, 'gmine', 24, 28, NOW).ok, false, 'limit of 2 mines at Keep 1');
});
test('upgrades are gated by the Keep level', () => {
  const S = St.newGame(NOW);
  const mine = St.ofType(S, 'gmine')[0];
  S.res.gold = 1e6;
  assert.ok(St.startUpgrade(S, mine, NOW).ok);
  St.tick(S, NOW + HOUR);
  assert.equal(mine.lvl, 2);
  const again = St.startUpgrade(S, mine, NOW + HOUR);
  assert.equal(again.ok, false);
  assert.match(again.err, /Keep/);
});
test('collectors make resources over time, capped, and survive an upgrade', () => {
  const S = St.newGame(NOW);
  const mine = St.ofType(S, 'gmine')[0];
  const per = D.prodPerHour('gmine', 1);
  assert.equal(Math.round(St.collectorAmount(mine, NOW + HOUR)), per);
  assert.equal(Math.round(St.collectorAmount(mine, NOW + 100 * HOUR)), D.prodCapacity('gmine', 1));
  S.res.gold = 100000;
  St.startUpgrade(S, mine, NOW);
  St.tick(S, NOW + HOUR);
  const banked = St.collectorAmount(mine, NOW + HOUR);
  assert.ok(banked >= per * 0.99, 'production during the upgrade is kept');
});
test('collect respects storage room', () => {
  const S = St.newGame(NOW);
  const mine = St.ofType(S, 'gmine')[0];
  S.res.gold = St.capacity(S).gold - 100;
  const r = St.collect(S, mine, NOW + 5 * HOUR);
  assert.ok(r.ok);
  assert.equal(r.amt, 100);
  assert.equal(S.res.gold, St.capacity(S).gold);
  assert.equal(St.collect(S, mine, NOW + 5 * HOUR).ok, false);
  assert.ok(St.collectorAmount(mine, NOW + 5 * HOUR) > 1000, 'the rest stays in the mine');
});
test('training queues, runs on parallel barracks and works offline', () => {
  const S = St.newGame(NOW);
  S.res.crystal = 100000;
  for (let i = 0; i < 10; i++) assert.ok(St.train(S, 'squire', NOW).ok, 'train ' + i);
  assert.equal(St.train(S, 'squire', NOW).ok, true);
  assert.equal(St.armyUsed(S), 11);
  St.tick(S, NOW + 3 * MIN);
  assert.equal(S.army.squire, 11);
  assert.equal(S.queue.length, 0);
  assert.equal(St.armyUsed(S), 11);
});
test('camp capacity is enforced and cancel refunds', () => {
  const S = St.newGame(NOW);
  S.res.crystal = 2000;
  const cap = St.armyCapacity(S);
  for (let i = 0; i < cap; i++) assert.ok(St.train(S, 'squire', NOW).ok);
  assert.equal(St.train(S, 'squire', NOW).ok, false);
  const before = S.res.crystal;
  assert.equal(St.cancelQueued(S, S.queue.length - 1), true);
  assert.equal(S.res.crystal, before + D.TROOPS.squire.cost);
});
test('locked troops cannot be trained', () => {
  const S = St.newGame(NOW);
  S.res.crystal = 100000;
  assert.match(St.train(S, 'brute', NOW).err, /Barracks level/);
});
test('forge upgrades a troop', () => {
  const S = St.newGame(NOW);
  St.ofType(S, 'keep')[0].lvl = 2;
  S.res.gold = 100000;
  S.res.crystal = 100000;
  const f = St.startBuild(S, 'forge', 24, 24, NOW);
  assert.ok(f.ok, f.err);
  St.tick(S, NOW + HOUR);
  assert.ok(St.startForge(S, 'squire', NOW + HOUR).ok);
  St.tick(S, NOW + 3 * HOUR);
  assert.equal(S.troopLvl.squire, 2);
  assert.equal(St.startForge(S, 'squire', NOW + 3 * HOUR).ok, false, 'forge L1 only allows troop level 2');
});
test('obstacles pay out pearls when cleared', () => {
  const S = St.newGame(NOW);
  const o = S.obstacles[0];
  const pearls = S.res.pearls;
  assert.ok(St.clearObstacle(S, o, NOW).ok);
  St.tick(S, NOW + 5 * MIN);
  assert.equal(S.res.pearls, pearls + D.OBSTACLES[o.kind].pearls);
  assert.ok(!S.obstacles.includes(o));
});
test('speed up costs pearls and finishes the job', () => {
  const S = St.newGame(NOW);
  const mine = St.ofType(S, 'gmine')[0];
  S.res.gold = 1e6;
  St.startUpgrade(S, mine, NOW);
  const cost = St.speedUpCost(mine.up, NOW);
  const pearls = S.res.pearls;
  assert.ok(St.speedUp(S, mine, NOW));
  St.tick(S, NOW);
  assert.equal(mine.lvl, 2);
  assert.equal(S.res.pearls, pearls - cost);
});
test('walls are instant and can be upgraded in bulk', () => {
  const S = St.newGame(NOW);
  for (let i = 0; i < 5; i++) assert.ok(St.startBuild(S, 'wall', 6 + i, 5, NOW).ok);
  assert.equal(St.freeBuilders(S), 2);
  assert.equal(St.wallUpgradeQuote(S, 1).n, 5);
  const r = St.upgradeWalls(S, 1);
  assert.ok(r.ok);
  assert.equal(r.n, 5);
});
test('builders can be hired with pearls', () => {
  const S = St.newGame(NOW);
  S.res.pearls = 1000;
  assert.ok(St.buyBuilder(S));
  assert.equal(S.builders, 3);
  assert.ok(St.buyBuilder(S));
  assert.equal(St.buyBuilder(S), false);
});
test('quests pay pearls once', () => {
  const S = St.newGame(NOW);
  S.stats.wins = 1;
  const q = D.QUESTS.find((x) => x.id === 'win1');
  const p = S.res.pearls;
  assert.ok(St.claimQuest(S, q));
  assert.equal(S.res.pearls, p + q.reward);
  assert.equal(St.claimQuest(S, q), false);
});
test('save and load round trip, with offline progress', () => {
  const S = St.newGame(NOW);
  const mem = new Map();
  const storage = { setItem: (k, v) => mem.set(k, v), getItem: (k) => mem.get(k) ?? null };
  S.res.gold = 777;
  assert.ok(St.save(S, storage));
  const L = St.load(storage, NOW + 2 * HOUR);
  assert.equal(L.res.gold, 777);
  assert.deepEqual(L.buildings.map((b) => b.type), S.buildings.map((b) => b.type));
  const mine = St.ofType(L, 'gmine')[0];
  assert.ok(St.collectorAmount(mine, NOW + 2 * HOUR) > 900, 'two hours of mining while away');
});
test('a corrupt save is ignored', () => {
  const storage = { getItem: () => '{not json', setItem() {} };
  assert.equal(St.load(storage, NOW), null);
});

console.log('generator');
test('every tier makes a valid, deterministic island', () => {
  for (let t = 1; t <= 30; t++) {
    const a = G.outpost(t);
    const b = G.outpost(t);
    assert.deepEqual(a.buildings, b.buildings, `tier ${t} not deterministic`);
    const seen = new Set();
    for (const e of a.buildings) {
      const s = D.BUILDINGS[e.type].size;
      assert.ok(e.x >= D.BUILD0 && e.y >= D.BUILD0 && e.x + s <= D.BUILD1 && e.y + s <= D.BUILD1, `tier ${t} ${e.type} out of bounds`);
      for (let y = e.y; y < e.y + s; y++) for (let x = e.x; x < e.x + s; x++) {
        assert.ok(!seen.has(y * 100 + x), `tier ${t} overlap at ${x},${y}`);
        seen.add(y * 100 + x);
      }
    }
    assert.ok(a.buildings.some((e) => e.type === 'keep'));
    assert.ok(a.buildings.filter((e) => e.type === 'cannon').length >= 1);
  }
});
test('tiers get harder', () => {
  const power = (t) => G.outpost(t).buildings.filter((b) => D.DEFENSES.includes(b.type)).reduce((n, b) => n + b.lvl, 0);
  assert.ok(power(30) > power(15));
  assert.ok(power(15) > power(5));
});
test('rivals scale with the player', () => {
  const lo = G.rival(1, 0, 5);
  const hi = G.rival(6, 1500, 5);
  assert.ok(hi.tier > lo.tier);
  assert.ok(hi.loot.gold > lo.loot.gold);
});

console.log('battle');
const typicalArmy = G.typicalArmy;
function play(base, army, seed) {
  const B = Sim.createBattle(base, JSON.parse(JSON.stringify(army)), { seed });
  Sim.autoPlay(B, { seed });
  return Sim.runToEnd(B);
}
test('battles are deterministic', () => {
  const base = G.outpost(12);
  const a = play(base, typicalArmy(3), 4);
  const b = play(base, typicalArmy(3), 4);
  assert.deepEqual(a, b);
});
test('destroyed buildings give loot that never exceeds the pool', () => {
  const base = G.outpost(8);
  const r = play(base, typicalArmy(2), 2);
  assert.ok(r.loot.gold <= base.loot.gold && r.loot.crystal <= base.loot.crystal);
  assert.ok(r.loot.gold > 0);
  assert.ok(r.pct > 0 && r.pct <= 100);
});
test('stars follow the rules (50%, keep, 100%)', () => {
  const base = G.outpost(1);
  const army = { squire: { count: 30, lvl: 1 } };
  const B = Sim.createBattle(base, army, { seed: 1 });
  Sim.autoPlay(B, { seed: 1 });
  const r = Sim.runToEnd(B);
  assert.equal(r.stars, 3);
  assert.equal(r.pct, 100);
});
test('a lone squire cannot beat a defended island', () => {
  const r = play(G.outpost(10), { squire: { count: 1, lvl: 1 } }, 1);
  assert.equal(r.stars, 0);
});
test('the beacon redirects troops to a chosen area', () => {
  const base = G.outpost(10);
  const army = { squire: { count: 30, lvl: 1 }, slinger: { count: 20, lvl: 1 } };
  const B = Sim.createBattle(base, army, { seed: 2 });
  Sim.autoPlay(B, { seed: 2 });
  const gm = B.b.find((b) => b.type === 'gmine');
  Sim.setBeacon(B, gm.cx, gm.cy);
  for (let i = 0; i < 30 * 12; i++) Sim.step(B);
  const targets = B.units.filter((u) => u.target).map((u) => u.target);
  assert.ok(targets.length > 0);
  const inZone = targets.filter((t) => Math.hypot(t.cx - gm.cx, t.cy - gm.cy) <= Sim.BEACON_RADIUS + t.size / 2).length;
  assert.ok(inZone / targets.length > 0.5, `only ${inZone}/${targets.length} troops are working near the beacon`);
});
test('flyers ignore walls, ground troops break through closed rings', () => {
  const base = { name: 't', buildings: [], loot: { gold: 1000, crystal: 1000 }, trophyWin: 10, trophyLose: 10 };
  let id = 1;
  base.buildings.push({ id: id++, type: 'keep', x: 15, y: 15, lvl: 1 });
  for (let x = 12; x <= 21; x++) for (const y of [12, 21]) base.buildings.push({ id: id++, type: 'wall', x, y, lvl: 1 });
  for (let y = 13; y <= 20; y++) for (const x of [12, 21]) base.buildings.push({ id: id++, type: 'wall', x, y, lvl: 1 });
  const ground = Sim.createBattle(base, { squire: { count: 12, lvl: 1 } }, { seed: 1 });
  Sim.autoPlay(ground, { seed: 1 });
  assert.equal(Sim.runToEnd(ground).stars, 3, 'squires should hack through the wall');
  const air = Sim.createBattle(base, { glider: { count: 4, lvl: 1 } }, { seed: 1 });
  Sim.autoPlay(air, { seed: 1 });
  assert.equal(Sim.runToEnd(air).stars, 3);
});
test('mortars and traps hurt ground troops but not flyers', () => {
  const base = { name: 't', buildings: [{ id: 1, type: 'keep', x: 15, y: 15, lvl: 1 }, { id: 2, type: 'bomb', x: 12, y: 17, lvl: 4 }], loot: { gold: 1, crystal: 1 }, trophyWin: 1, trophyLose: 1 };
  const B = Sim.createBattle(base, { squire: { count: 5, lvl: 1 }, glider: { count: 1, lvl: 1 } }, { seed: 1 });
  Sim.deploy(B, 'squire', 12.5, 17.5);
  Sim.deploy(B, 'glider', 12.5, 17.5);
  const hp = B.units.find((u) => u.flying).hp;
  Sim.step(B);
  assert.ok(B.units.filter((u) => !u.flying).every((u) => u.hp < u.maxHp), 'squire took blast');
  assert.equal(B.units.find((u) => u.flying).hp, hp, 'glider unharmed');
});
test('red zone blocks drops next to buildings', () => {
  const B = Sim.createBattle(G.outpost(5), { squire: { count: 5, lvl: 1 } }, { seed: 1 });
  const keep = B.b.find((b) => b.type === 'keep');
  assert.equal(Sim.canDeploy(B, keep.cx, keep.cy), false);
  assert.equal(Sim.canDeploy(B, 1.6, 1.6), true);
  assert.equal(Sim.canDeploy(B, 0.2, 0.2), false);
});
test('balance: a typical army can win every stage most of the time', () => {
  const SEEDS = 4;
  const rows = [];
  for (let stage = 1; stage <= 30; stage++) {
    const base = G.outpost(stage);
    const army = typicalArmy(base.keepLvl);
    let wins = 0;
    let pct = 0;
    for (let s = 1; s <= SEEDS; s++) {
      const r = play(base, army, s);
      if (r.stars >= 1) wins++;
      pct += r.pct;
    }
    rows.push({ stage, wins, avg: pct / SEEDS });
    if (stage <= 9) assert.equal(wins, SEEDS, `stage ${stage} should always be winnable by a typical army (${wins}/${SEEDS})`);
    assert.ok(pct / SEEDS >= 35, `stage ${stage} average destruction ${(pct / SEEDS).toFixed(0)}% is too low`);
  }
  const hard = rows.filter((r) => r.wins === 0).length;
  assert.ok(hard <= 2, `${hard} stages were never won`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
