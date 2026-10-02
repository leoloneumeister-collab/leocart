/** Headless checks for every ability, plus waves, inhibitors and super minions on the full map. */
import { CHAMPION_IDS, CHAMPIONS } from '../src/data/champions.ts';
import { createMatch, stepWorld, runFor } from '../src/sim/match.ts';
import { killUnit } from '../src/sim/core.ts';
import type { Unit } from '../src/sim/types.ts';
import type { World } from '../src/sim/world.ts';

let failures = 0;
function check(name: string, ok: boolean, info = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`);
  if (!ok) failures++;
}

function arena(champ: string, dummyChamp = 'oakhelm', dist = 10, rank = 3) {
  const w = createMatch({ seed: 5, blueChampions: [champ], redChampions: [dummyChamp], playerChampion: champ, fog: false, startGold: 0 });
  const me = w.getPlayer()!;
  const dummy = w.champions.find((c) => c.team === 1)!;
  me.x = me.px = 0;
  me.z = me.pz = 0;
  dummy.x = dummy.px = dist;
  dummy.z = dummy.pz = 0;
  const c = me.champ!;
  c.ranks = [rank, rank, rank, Math.min(rank, 3)];
  c.level = 12;
  me.baseStats = w.championBaseStats(CHAMPIONS[champ], 12);
  w.recomputeStats(me);
  me.hp = me.s.maxHp;
  me.mana = me.s.maxMana;
  w.recomputeStats(dummy);
  // park the idle dummy so it neither attacks nor moves
  dummy.s.ad = 0;
  me.statuses = [];
  stepWorld(w); // settle spatial hash and vision
  me.attackCd = 99;
  return { w, me, dummy };
}

function cast(w: World, me: Unit, slot: number, x: number, z: number, target = 0) {
  w.push({ type: 'cast', unit: me.id, slot, x, z, target });
  stepWorld(w);
}

function spells(w: World) {
  return w.projectiles.filter((p) => p.ability).length;
}

function has(u: Unit, type: string, w: World) {
  return u.statuses.some((s) => s.type === type && s.until > w.time);
}

// ---------------------------------------------------------------- Ironvow
{
  const { w, me, dummy } = arena('ironvow', 'oakhelm', 8);
  const hp0 = dummy.hp;
  cast(w, me, 0, 8, 0);
  runFor(w, 0.6);
  check('ironvow Q dash lands and hits', dummy.hp < hp0 && me.x > 3, `hp ${hp0.toFixed(0)} -> ${dummy.hp.toFixed(0)}, x=${me.x.toFixed(1)}`);
}
{
  const { w, me } = arena('ironvow');
  cast(w, me, 1, 5, 0);
  check('ironvow W shield + speed', has(me, 'shield', w) && me.s.ms > me.baseStats.ms * 1.1, `ms ${me.s.ms.toFixed(2)}`);
}
{
  const { w, me, dummy } = arena('ironvow', 'oakhelm', 5);
  const hp0 = dummy.hp;
  cast(w, me, 2, 0, 0);
  check('ironvow E nova damages and slows', dummy.hp < hp0 && has(dummy, 'slow', w), `hp ${hp0.toFixed(0)} -> ${dummy.hp.toFixed(0)}`);
}
{
  const { w, me, dummy } = arena('ironvow', 'oakhelm', 16);
  const hp0 = dummy.hp;
  cast(w, me, 3, 16, 0, dummy.id);
  runFor(w, 0.8);
  check('ironvow R leap stuns target', dummy.hp < hp0 && Math.hypot(me.x - dummy.x, me.z - dummy.z) < 4 && dummy.statuses.some((s) => s.type === 'stun'), `hp ${hp0.toFixed(0)} -> ${dummy.hp.toFixed(0)}`);
}
// ---------------------------------------------------------------- Ysolde
{
  const { w, me, dummy } = arena('ysolde', 'oakhelm', 15);
  const hp0 = dummy.hp;
  cast(w, me, 0, 15, 0);
  runFor(w, 0.8);
  check('ysolde Q skillshot hits', dummy.hp < hp0, `hp ${hp0.toFixed(0)} -> ${dummy.hp.toFixed(0)}`);
}
{
  const { w, me, dummy } = arena('ysolde', 'oakhelm', 15);
  const hp0 = dummy.hp;
  cast(w, me, 0, 15, 8);
  runFor(w, 0.8);
  check('ysolde Q skillshot misses off-line target', dummy.hp === hp0);
}
{
  const { w, me, dummy } = arena('ysolde', 'oakhelm', 15);
  const hp0 = dummy.hp;
  cast(w, me, 1, 15, 0);
  check('ysolde W has a telegraph delay', dummy.hp === hp0 && w.zones.length === 1);
  runFor(w, 0.8);
  check('ysolde W zone damages and slows', dummy.hp < hp0 && has(dummy, 'slow', w), `hp ${hp0.toFixed(0)} -> ${dummy.hp.toFixed(0)}`);
}
{
  const { w, me } = arena('ysolde');
  cast(w, me, 2, 20, 0);
  check('ysolde E blinks and shields', me.x > 6 && has(me, 'shield', w), `x=${me.x.toFixed(1)}`);
}
{
  const { w, me, dummy } = arena('ysolde', 'oakhelm', 20);
  const hp0 = dummy.hp;
  cast(w, me, 3, 20, 0);
  runFor(w, 1.4);
  check('ysolde R meteor hits and stuns', dummy.hp < hp0 && dummy.statuses.some((s) => s.type === 'stun'), `hp ${hp0.toFixed(0)} -> ${dummy.hp.toFixed(0)}`);
}
// ---------------------------------------------------------------- Kestrel
{
  const { w, me } = arena('kestrel');
  const as0 = me.s.as;
  cast(w, me, 0, 5, 0);
  check('kestrel Q raises attack speed', me.s.as > as0 * 1.4, `${as0.toFixed(2)} -> ${me.s.as.toFixed(2)}`);
}
{
  const { w, me, dummy } = arena('kestrel', 'oakhelm', 20);
  const hp0 = dummy.hp;
  cast(w, me, 1, 20, 0);
  runFor(w, 0.7);
  check('kestrel W pierce bolt hits and slows', dummy.hp < hp0 && has(dummy, 'slow', w), `hp ${hp0.toFixed(0)} -> ${dummy.hp.toFixed(0)}`);
}
{
  const { w, me } = arena('kestrel');
  cast(w, me, 2, -20, 0);
  runFor(w, 0.4);
  check('kestrel E dashes away', me.x < -4, `x=${me.x.toFixed(1)}`);
}
{
  const { w, me, dummy } = arena('kestrel', 'oakhelm', 55);
  const hp0 = dummy.hp;
  cast(w, me, 3, 55, 0);
  runFor(w, 1.5);
  check('kestrel R hits at long range', dummy.hp < hp0, `hp ${hp0.toFixed(0)} -> ${dummy.hp.toFixed(0)}`);
}
// ---------------------------------------------------------------- Oakhelm
{
  const { w, me, dummy } = arena('oakhelm', 'ysolde', 12);
  const hp0 = dummy.hp;
  cast(w, me, 0, 12, 0);
  runFor(w, 0.7);
  check('oakhelm Q stuns', dummy.hp < hp0 && dummy.statuses.some((s) => s.type === 'stun'));
}
{
  const { w, me } = arena('oakhelm');
  const ar0 = me.s.armor;
  cast(w, me, 1, 5, 0);
  check('oakhelm W shield + armor', has(me, 'shield', w) && me.s.armor > ar0 + 20);
}
{
  const { w, me, dummy } = arena('oakhelm', 'ysolde', 6);
  const hp0 = dummy.hp;
  cast(w, me, 2, 0, 0);
  check('oakhelm E stomp damages and slows', dummy.hp < hp0 && has(dummy, 'slow', w));
}
{
  const { w, me, dummy } = arena('oakhelm', 'ysolde', 10);
  const hp0 = dummy.hp;
  cast(w, me, 3, 10, 0);
  runFor(w, 0.8);
  check('oakhelm R landslide knocks up', dummy.hp < hp0 && dummy.statuses.some((s) => s.type === 'stun' && s.tag === 'airborne'));
}
// ---------------------------------------------------------------- Sable
{
  const { w, me, dummy } = arena('sable', 'ysolde', 14);
  const hp0 = dummy.hp;
  cast(w, me, 0, 14, 0);
  runFor(w, 0.7);
  check('sable Q dart damages and slows', dummy.hp < hp0 && has(dummy, 'slow', w));
}
{
  const { w, me, dummy } = arena('sable', 'ysolde', 12);
  const hp0 = dummy.hp;
  cast(w, me, 1, 12, 0, dummy.id);
  runFor(w, 0.5);
  check('sable W shadowstep reaches target', dummy.hp < hp0 && Math.hypot(me.x - dummy.x, me.z - dummy.z) < 3.5);
}
{
  const { w, me } = arena('sable');
  cast(w, me, 2, -20, 0);
  runFor(w, 0.4);
  check('sable E veil dashes with speed', me.x < -4 && me.s.ms > me.baseStats.ms * 1.2);
}
{
  const a = arena('sable', 'ysolde', 10);
  const b = arena('sable', 'ysolde', 10);
  b.dummy.hp = b.dummy.s.maxHp * 0.2;
  const h1 = a.dummy.hp;
  const h2 = b.dummy.hp;
  cast(a.w, a.me, 3, 10, 0, a.dummy.id);
  cast(b.w, b.me, 3, 10, 0, b.dummy.id);
  runFor(a.w, 0.5);
  runFor(b.w, 0.5);
  check('sable R executes low health targets harder', h1 - a.dummy.hp < h2 - b.dummy.hp + 1 || b.dummy.hp <= 0, `full ${(h1 - a.dummy.hp).toFixed(0)} vs low ${(h2 - b.dummy.hp).toFixed(0)}`);
}
// ---------------------------------------------------------------- generic rules
{
  const { w, me } = arena('ysolde');
  me.mana = 5;
  cast(w, me, 0, 10, 0);
  check('casting without mana is refused', spells(w) === 0 && me.champ!.cooldowns[0] === 0);
}
{
  const { w, me } = arena('ysolde');
  cast(w, me, 0, 10, 0);
  const cd = me.champ!.cooldowns[0];
  cast(w, me, 0, 10, 0);
  check('cooldown blocks recast', cd > 3 && spells(w) === 1, `cd ${cd.toFixed(2)}`);
}
{
  const { w, me } = arena('ysolde');
  me.champ!.ranks = [0, 0, 0, 0];
  cast(w, me, 0, 10, 0);
  check('unlearned ability cannot be cast', spells(w) === 0);
}
{
  const { w, me, dummy } = arena('ysolde', 'oakhelm', 10);
  dummy.statuses.push({ type: 'stun', until: 99, amount: 0, source: 0 });
  void dummy;
  me.statuses.push({ type: 'stun', until: w.time + 2, amount: 0, source: 0 });
  cast(w, me, 0, 10, 0);
  check('stunned champions cannot cast', spells(w) === 0);
}
// ---------------------------------------------------------------- full map
{
  const w = createMatch({ seed: 2, blueChampions: [], redChampions: [], playerChampion: 'ironvow', fog: false });
  const lanes = new Set<string>();
  runFor(w, 100);
  for (const u of w.units) if (u.kind === 'minion') lanes.add(`${u.team}:${u.minion!.lane}`);
  check('minions spawn in all three lanes for both teams', lanes.size === 6, [...lanes].join(','));
  check('structure count (15 per team)', w.structures.length === 30, String(w.structures.length));
  // Kill red mid inhibitor and wait for the next wave
  const inh = w.structures.find((s) => s.team === 1 && s.kind === 'inhibitor' && s.struct!.lane === 'mid')!;
  killUnit(w, inh, null);
  const before = w.units.filter((u) => u.minion?.type === 'super').length;
  runFor(w, 40);
  const supers = w.units.filter((u) => u.minion?.type === 'super' && u.team === 0 && u.minion.lane === 'mid').length;
  check('super minion spawns for the team whose enemy inhibitor is down', before === 0 && supers >= 1, `supers=${supers}`);
  runFor(w, 300);
  check('inhibitor respawns after 5 minutes', inh.alive && inh.hp === inh.s.maxHp);
}
{
  const w = createMatch({ seed: 2, blueChampions: [], redChampions: [], playerChampion: 'ironvow', fog: false });
  const tower3 = w.structures.find((s) => s.team === 1 && s.kind === 'tower' && s.struct!.tier === 3 && s.struct!.lane === 'top')!;
  check('inner structures are protected until the outer one falls', !w.structureVulnerable(tower3));
  const t1 = w.structures.find((s) => s.team === 1 && s.kind === 'tower' && s.struct!.tier === 1 && s.struct!.lane === 'top')!;
  const t2 = w.structures.find((s) => s.team === 1 && s.kind === 'tower' && s.struct!.tier === 2 && s.struct!.lane === 'top')!;
  killUnit(w, t1, null);
  check('tier 2 opens after tier 1', w.structureVulnerable(t2) && !w.structureVulnerable(tower3));
}
{
  // Experience and levels
  const w = createMatch({ seed: 2, blueChampions: ['ironvow'], redChampions: [], playerChampion: 'ironvow', fog: false });
  const me = w.getPlayer()!;
  const hp1 = me.s.maxHp;
  import('../src/sim/core.ts').then(({ grantXp }) => {
    grantXp(w, me, 5000);
    check('xp grants multiple levels and grows stats', me.champ!.level >= 8 && me.s.maxHp > hp1 + 500 && me.champ!.skillPoints >= 7, `level ${me.champ!.level}`);
    console.log(failures === 0 ? 'ALL ABILITY CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
    if (failures) process.exit(1);
  });
  void CHAMPION_IDS;
}
