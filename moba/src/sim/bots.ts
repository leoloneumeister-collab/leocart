/**
 * Bot controller. Bots only act through the same commands a player can issue, and they only
 * react to enemies their team can currently see.
 *
 * Structure:
 *  - team blackboard (lane fronts, structure targets, team plan) refreshed twice a second
 *  - per bot "think" at a difficulty dependent reaction time, picking the first applicable rule:
 *    shop, retreat, recall, fight, defend/push, lane
 */
import { CHAMPIONS } from '../data/champions.ts';
import type { AbilityDef } from '../data/champions.ts';
import { CONFIG } from '../data/config.ts';
import { ITEMS, priceWith } from '../data/items.ts';
import { LANES, laneLength, pointOnLane, projectOnLane, SPAWN_POS } from '../data/map.ts';
import { abilityDef, canCast, valueAt } from './abilities.ts';
import { attackDamage } from './attack.ts';
import { canBuy, autoLevel } from './economy.ts';
import { mitigation, reach } from './core.ts';
import { dist, dist2, clamp } from './math.ts';
import type { Difficulty, Lane, Team, Unit } from './types.ts';
import type { World } from './world.ts';

interface Skill {
  reaction: number;
  lastHit: number;
  aim: number;
  dodge: number;
  aggr: number;
  macro: number;
  mistakes: number;
  pushTime: number;
}

const SKILL: Record<Difficulty, Skill> = {
  easy: { reaction: 0.7, lastHit: 0.3, aim: 0.15, dodge: 0, aggr: 0.75, macro: 0.2, mistakes: 0.28, pushTime: 900 },
  normal: { reaction: 0.33, lastHit: 0.75, aim: 0.65, dodge: 0.12, aggr: 1, macro: 0.6, mistakes: 0.07, pushTime: 540 },
  hard: { reaction: 0.12, lastHit: 0.98, aim: 1, dodge: 0.5, aggr: 1.3, macro: 1, mistakes: 0.01, pushTime: 450 },
};

type Mode = 'idle' | 'lane' | 'fight' | 'retreat' | 'recall' | 'push' | 'defend' | 'respawn';

interface Bot {
  id: number;
  mode: Mode;
  lane: Lane;
  homeLane: Lane;
  nextThink: number;
  castLock: number;
  recallAt: number;
  lastCmdKey: string;
  lastCmdAt: number;
  lastRoam: number;
  retreatUntil: number;
  stuckT: number;
  lastX: number;
  lastZ: number;
}

interface TeamBB {
  team: Team;
  t: number;
  allies: Unit[];
  enemies: Unit[];
  enemiesAll: Unit[];
  /** Front positions per lane (path distance from the blue end) and counts. */
  front: Record<Lane, { own: number; enemy: number; ownN: number; enemyN: number }>;
  plan: { mode: 'lane' | 'push' | 'defend'; lane: Lane; until: number };
  towers: Unit[];
  enemyTowers: Unit[];
}

const bots = new WeakMap<World, Map<number, Bot>>();
const boards = new WeakMap<World, [TeamBB, TeamBB]>();

function newBB(team: Team): TeamBB {
  return {
    team,
    t: -99,
    allies: [],
    enemies: [],
    enemiesAll: [],
    front: { top: { own: NaN, enemy: NaN, ownN: 0, enemyN: 0 }, mid: { own: NaN, enemy: NaN, ownN: 0, enemyN: 0 }, bot: { own: NaN, enemy: NaN, ownN: 0, enemyN: 0 } },
    plan: { mode: 'lane', lane: 'mid', until: 0 },
    towers: [],
    enemyTowers: [],
  };
}

function botState(w: World): Map<number, Bot> {
  let m = bots.get(w);
  if (!m) {
    m = new Map();
    bots.set(w, m);
  }
  return m;
}

function board(w: World, team: Team): TeamBB {
  let b = boards.get(w);
  if (!b) {
    b = [newBB(0), newBB(1)];
    boards.set(w, b);
  }
  return b[team];
}

function skillFor(w: World, u: Unit): Skill {
  const d: Difficulty = u.team === 0 ? w.setup.allyDifficulty ?? 'normal' : w.setup.difficulty;
  return SKILL[d];
}

// ---------------------------------------------------------------------------- entry

export function stepBots(w: World, _dt: number) {
  if (w.setup.noBots) return;
  const states = botState(w);
  for (const u of w.champions) {
    const c = u.champ!;
    if (!c.isBot) continue;
    let b = states.get(u.id);
    if (!b) {
      b = {
        id: u.id,
        mode: 'idle',
        lane: c.lane,
        homeLane: c.lane,
        nextThink: w.time + (u.id % 7) * 0.05,
        castLock: 0,
        recallAt: 0,
        lastCmdKey: '',
        lastCmdAt: -9,
        lastRoam: 0,
        retreatUntil: 0,
        stuckT: 0,
        lastX: u.x,
        lastZ: u.z,
      };
      states.set(u.id, b);
    }
    if (w.time < b.nextThink) continue;
    const sk = skillFor(w, u);
    b.nextThink = w.time + sk.reaction * (0.8 + w.rng.next() * 0.4);
    const bb = refreshBoard(w, u.team as Team);
    think(w, u, b, bb, sk);
  }
}

// ---------------------------------------------------------------------------- blackboard

function refreshBoard(w: World, team: Team): TeamBB {
  const bb = board(w, team);
  if (w.time - bb.t < 0.4) return bb;
  bb.t = w.time;
  const enemy: Team = team === 0 ? 1 : 0;
  bb.allies = w.champions.filter((c) => c.team === team && c.alive);
  bb.enemiesAll = w.champions.filter((c) => c.team === enemy);
  bb.enemies = bb.enemiesAll.filter((c) => c.alive && w.visible[team].has(c.id));
  bb.towers = w.structures.filter((s) => s.team === team && s.kind === 'tower' && s.alive);
  bb.enemyTowers = w.structures.filter((s) => s.team === enemy && s.kind === 'tower' && s.alive);
  for (const lane of LANES) {
    const f = bb.front[lane];
    let own = team === 0 ? -Infinity : Infinity;
    let en = team === 0 ? Infinity : -Infinity;
    f.ownN = 0;
    f.enemyN = 0;
    for (const u of w.units) {
      if (u.kind !== 'minion' || !u.alive || u.minion!.lane !== lane) continue;
      const p = projectOnLane(lane, u.x, u.z);
      if (p.d > 16) continue;
      if (u.team === team) {
        f.ownN++;
        own = team === 0 ? Math.max(own, p.s) : Math.min(own, p.s);
      } else if (w.visible[team].has(u.id)) {
        f.enemyN++;
        en = team === 0 ? Math.min(en, p.s) : Math.max(en, p.s);
      }
    }
    f.own = Number.isFinite(own) ? own : NaN;
    f.enemy = Number.isFinite(en) ? en : NaN;
  }
  updatePlan(w, bb);
  return bb;
}

function aliveCount(list: Unit[]): number {
  let n = 0;
  for (const u of list) if (u.alive) n++;
  return n;
}

/** First enemy structure in a lane that can currently be attacked. */
function nextEnemyStruct(w: World, team: Team, lane: Lane | 'base'): Unit | null {
  const enemy: Team = team === 0 ? 1 : 0;
  let best: Unit | null = null;
  let bs = Infinity;
  for (const s of w.structures) {
    if (s.team !== enemy || !s.alive || !w.structureVulnerable(s)) continue;
    if (lane !== 'base' && s.struct!.lane !== lane) continue;
    if (lane === 'base' && s.struct!.lane !== 'base') continue;
    // closest to our own side
    const key = lane === 'base' ? dist(s.x, s.z, SPAWN_POS[team].x, SPAWN_POS[team].z) : team === 0 ? projectOnLane(lane, s.x, s.z).s : -projectOnLane(lane, s.x, s.z).s;
    if (key < bs) {
      bs = key;
      best = s;
    }
  }
  return best;
}

function laneAttackTarget(w: World, team: Team, lane: Lane): Unit | null {
  return nextEnemyStruct(w, team, lane) ?? nextEnemyStruct(w, team, 'base');
}

function updatePlan(w: World, bb: TeamBB) {
  if (w.time < bb.plan.until) return;
  const team = bb.team;
  const sk = SKILL[team === 0 ? w.setup.allyDifficulty ?? 'normal' : w.setup.difficulty];
  bb.plan.until = w.time + 4;
  const allyAlive = bb.allies.length;
  const enemyAlive = aliveCount(bb.enemiesAll);
  // Defend: enemy champions or a pile of minions near our structures
  let threat: { lane: Lane; amount: number } | null = null;
  for (const s of w.structures) {
    if (s.team !== team || !s.alive) continue;
    let champs = 0;
    let minions = 0;
    w.query(s.x, s.z, 24, (v) => {
      if (v.team === team) return;
      if (v.kind === 'champion') champs++;
      else if (v.kind === 'minion') minions++;
    });
    const amount = champs * 3 + minions * 0.7;
    if (amount >= 3.5 && (!threat || amount > threat.amount)) {
      const lane = s.struct!.lane === 'base' ? nearestLaneOf(s) : (s.struct!.lane as Lane);
      threat = { lane, amount };
    }
  }
  if (threat && Math.random() < 0.01 + sk.macro) {
    bb.plan = { mode: 'defend', lane: threat.lane, until: w.time + 6 };
    return;
  }
  const late = w.time > sk.pushTime;
  const advantage = allyAlive - enemyAlive;
  const wantPush = late && allyAlive >= 3 && (advantage >= 0 || w.time > 1500) && sk.macro > 0.2;
  const wipe = enemyAlive <= 2 && allyAlive >= 3 && w.time > 360;
  if (wantPush || wipe) {
    // Choose the lane where we are furthest along: fewest enemy structures left or front closest to enemy base
    let bestLane: Lane = 'mid';
    let bestScore = -Infinity;
    for (const lane of LANES) {
      const total = laneLength(lane);
      const f = bb.front[lane];
      const ownF = Number.isFinite(f.own) ? (team === 0 ? f.own : total - f.own) : 0;
      let towersDown = 0;
      for (const s of w.structures) if (s.team !== team && s.struct!.lane === lane && !s.alive) towersDown++;
      const score = ownF / total + towersDown * 0.45 + f.ownN * 0.05 - f.enemyN * 0.03 + Math.random() * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestLane = lane;
      }
    }
    bb.plan = { mode: 'push', lane: bestLane, until: w.time + 8 };
    return;
  }
  bb.plan = { mode: 'lane', lane: 'mid', until: w.time + 4 };
}

function nearestLaneOf(s: Unit): Lane {
  let best: Lane = 'mid';
  let bd = Infinity;
  for (const lane of LANES) {
    const d = projectOnLane(lane, s.x, s.z).d;
    if (d < bd) {
      bd = d;
      best = lane;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------- helpers

function power(u: Unit): number {
  const dps = u.s.ad * u.s.as * 0.9 + u.s.ap * 0.55 + 22;
  const tough = u.hp * (1 + (u.s.armor + u.s.mr) / 200);
  return tough * dps;
}

function hpFrac(u: Unit): number {
  return u.hp / u.s.maxHp;
}

function issue(w: World, u: Unit, b: Bot, key: string, make: () => void, minGap = 0.35) {
  if (b.lastCmdKey === key && w.time - b.lastCmdAt < minGap + 1.2) return;
  b.lastCmdKey = key;
  b.lastCmdAt = w.time;
  make();
}

function moveTo(w: World, u: Unit, b: Bot, x: number, z: number) {
  // Quantise so tiny shifts do not re-issue the path every think
  const qx = Math.round(x / 2.5);
  const qz = Math.round(z / 2.5);
  const key = `m${qx},${qz}`;
  if (u.order.t === 'move' && Math.hypot(u.order.x - x, u.order.z - z) < 2.5) return;
  issue(w, u, b, key, () => w.push({ type: 'move', unit: u.id, x, z }), 0.6);
}

function attackMoveTo(w: World, u: Unit, b: Bot, x: number, z: number) {
  if (u.order.t === 'attackMove' && Math.hypot(u.order.x - x, u.order.z - z) < 3) return;
  issue(w, u, b, `a${Math.round(x / 3)},${Math.round(z / 3)}`, () => w.push({ type: 'attackMove', unit: u.id, x, z }), 0.6);
}

function attackUnit(w: World, u: Unit, b: Bot, t: Unit) {
  if (u.order.t === 'attack' && u.order.target === t.id) return;
  issue(w, u, b, `t${t.id}`, () => w.push({ type: 'attack', unit: u.id, target: t.id }), 0.1);
}

function stopUnit(w: World, u: Unit, b: Bot) {
  if (u.order.t === 'idle') return;
  issue(w, u, b, 'stop', () => w.push({ type: 'stop', unit: u.id }), 0.2);
}

function threatenedByTower(w: World, bb: TeamBB, x: number, z: number, margin = 2.5): Unit | null {
  for (const t of bb.enemyTowers) {
    if (!t.alive) continue;
    if (dist(t.x, t.z, x, z) <= t.s.range + margin) return t;
  }
  return null;
}

/** Position on our side of the lane to stand, relative to path distance `s`. */
function laneStand(team: Team, lane: Lane, s: number): { x: number; z: number } {
  const total = laneLength(lane);
  const clamped = clamp(s, 12, total - 12);
  void team;
  return pointOnLane(lane, clamped);
}

function retreatPoint(w: World, bb: TeamBB, u: Unit, lane: Lane): { x: number; z: number } {
  const team = u.team as Team;
  // The closest of our towers along this lane (outermost alive tower toward our base)
  let best: Unit | null = null;
  let bd = Infinity;
  for (const t of bb.towers) {
    const d = dist(t.x, t.z, u.x, u.z);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  const sp = SPAWN_POS[team];
  if (!best) return sp;
  // Stand slightly behind that tower toward the base
  const dx = sp.x - best.x;
  const dz = sp.z - best.z;
  const len = Math.hypot(dx, dz) || 1;
  void lane;
  void w;
  return { x: best.x + (dx / len) * 6, z: best.z + (dz / len) * 6 };
}

function predict(t: Unit, speed: number, from: Unit, aim: number, extra = 0): { x: number; z: number } {
  const vx = (t.x - t.px) * CONFIG.tickRate;
  const vz = (t.z - t.pz) * CONFIG.tickRate;
  const d = dist(from.x, from.z, t.x, t.z);
  const tt = (speed > 0 ? d / speed : 0) + extra;
  return { x: t.x + vx * tt * aim, z: t.z + vz * tt * aim };
}

// ---------------------------------------------------------------------------- shopping

function buildTarget(u: Unit): string | null {
  const c = u.champ!;
  const def = CHAMPIONS[c.defId];
  const counts = new Map<string, number>();
  for (const id of c.items) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  const used = new Map<string, number>();
  for (const id of def.build) {
    const have = counts.get(id) ?? 0;
    const need = (used.get(id) ?? 0) + 1;
    if (have >= need) {
      used.set(id, need);
      continue;
    }
    return id;
  }
  return null;
}

/** What to buy next toward `target`: the full item if affordable, otherwise an affordable component. */
function nextPurchase(u: Unit, target: string): string | null {
  const c = u.champ!;
  const chk = canBuy(u, target);
  if (chk.ok) return target;
  if (chk.reason === 'full' || chk.reason === 'boots' || chk.reason === 'shop') return null;
  const def = ITEMS[target];
  for (const comp of def.from) {
    if (c.items.includes(comp)) continue;
    const r = nextPurchase(u, comp);
    if (r) return r;
  }
  return null;
}

function shop(w: World, u: Unit) {
  const c = u.champ!;
  for (let i = 0; i < 6; i++) {
    const target = buildTarget(u);
    if (!target) break;
    const buy = nextPurchase(u, target);
    if (!buy) break;
    w.push({ type: 'buy', unit: u.id, item: buy });
    // simulate immediate effect on the gold estimate by breaking; the next think buys more
    if (priceWith(buy, c.items).cost > c.gold - 0) break;
    break;
  }
}

function wantsToShop(u: Unit): boolean {
  const c = u.champ!;
  const target = buildTarget(u);
  if (!target) return false;
  const buy = nextPurchase(u, target);
  if (!buy) return false;
  const cost = priceWith(buy, c.items).cost;
  if (c.gold < cost) return false;
  // Do not make trips for small purchases unless it is the very first one
  return c.gold >= 900 || (c.items.every((i) => i === null) && c.gold >= 400 && u.champ!.cs > 0) || cost >= 1500;
}

// ---------------------------------------------------------------------------- abilities

function spellProjectiles(w: World, u: Unit): { x: number; z: number; vx: number; vz: number; radius: number }[] {
  const out: { x: number; z: number; vx: number; vz: number; radius: number }[] = [];
  for (const p of w.projectiles) {
    if (!p.ability || p.team === u.team) continue;
    out.push({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, radius: p.radius });
  }
  return out;
}

function tryDodge(w: World, u: Unit, b: Bot, sk: Skill): boolean {
  if (sk.dodge <= 0 || w.time < b.castLock) return false;
  for (const p of spellProjectiles(w, u)) {
    const d = dist(p.x, p.z, u.x, u.z);
    if (d > 16 || d < 3) continue;
    const sp = Math.hypot(p.vx, p.vz) || 1;
    const dx = p.vx / sp;
    const dz = p.vz / sp;
    // lateral offset of unit from projectile line
    const rx = u.x - p.x;
    const rz = u.z - p.z;
    const along = rx * dx + rz * dz;
    if (along < 0) continue;
    const lateral = Math.abs(rx * dz - rz * dx);
    if (lateral < p.radius + u.radius + 0.6 && w.rng.chance(sk.dodge)) {
      const side = rx * dz - rz * dx > 0 ? 1 : -1;
      moveTo(w, u, b, u.x + dz * side * 5, u.z - dx * side * 5);
      b.castLock = w.time + 0.5;
      return true;
    }
  }
  return false;
}

function abilityDamage(u: Unit, def: AbilityDef, rank: number): number {
  let amt = 0;
  for (const e of def.effects) {
    if (e.type !== 'damage') continue;
    let d = valueAt(e.base, rank);
    if (e.bonusAd) d += e.bonusAd * Math.max(0, u.s.ad - u.baseStats.ad);
    if (e.ap) d += e.ap * u.s.ap;
    if (e.ad) d += e.ad * u.s.ad;
    if (e.ownMaxHpPct) d += e.ownMaxHpPct * u.s.maxHp;
    amt += d;
  }
  return amt;
}

function estimateUltDamage(u: Unit, def: AbilityDef): number {
  return abilityDamage(u, def, Math.max(1, u.champ!.ranks[3]));
}

/**
 * Cast abilities for the current situation. `target` is the champion we are fighting (may be null).
 * Returns true if a cast was issued.
 */
function useSkills(w: World, u: Unit, b: Bot, sk: Skill, mode: Mode, target: Unit | null, enemiesNear: Unit[]): boolean {
  if (w.time < b.castLock || w.hasStatus(u, 'stun') || w.hasStatus(u, 'silence')) return false;
  const c = u.champ!;
  const cdef = CHAMPIONS[c.defId];
  const manaReserve = mode === 'lane' ? 0.35 : 0;
  const nearest = enemiesNear.reduce<Unit | null>((a, e) => (!a || dist2(u.x, u.z, e.x, e.z) < dist2(u.x, u.z, a.x, a.z) ? e : a), null);

  const order = [3, 1, 0, 2];
  for (const slot of order) {
    if (canCast(w, u, slot) !== 'ok') continue;
    const ad = cdef.abilities[slot];
    const rank = c.ranks[slot];
    const cost = valueAt(ad.mana, rank);
    if (ad.ai !== 'ultimate' && ad.ai !== 'escape' && u.mana - cost < u.s.maxMana * manaReserve) continue;
    if (w.rng.chance(sk.mistakes)) continue;
    const issueCast = (x: number, z: number, tid = 0) => {
      w.push({ type: 'cast', unit: u.id, slot, x, z, target: tid });
      b.castLock = w.time + 0.3;
      return true;
    };
    const tdist = target ? dist(u.x, u.z, target.x, target.z) : Infinity;
    switch (ad.ai) {
      case 'escape': {
        if (!nearest) break;
        const nd = dist(u.x, u.z, nearest.x, nearest.z);
        const danger = (mode === 'retreat' && nd < 13) || (hpFrac(u) < 0.3 && nd < 10);
        if (!danger) break;
        const ax = u.x - nearest.x;
        const az = u.z - nearest.z;
        const len = Math.hypot(ax, az) || 1;
        // Run toward our base if that is roughly away from the enemy
        const sp = SPAWN_POS[u.team as Team];
        const bx = sp.x - u.x;
        const bz = sp.z - u.z;
        const bl = Math.hypot(bx, bz) || 1;
        const mx = (ax / len) * 0.6 + (bx / bl) * 0.4;
        const mz = (az / len) * 0.6 + (bz / bl) * 0.4;
        return issueCast(u.x + mx * 12, u.z + mz * 12);
      }
      case 'shield': {
        if (!nearest) break;
        const nd = dist(u.x, u.z, nearest.x, nearest.z);
        if (nd < 16 && (mode === 'fight' || mode === 'retreat' || hpFrac(u) < 0.8)) return issueCast(u.x, u.z);
        break;
      }
      case 'buff': {
        if (target && tdist < reach(u, target) + 4 && (mode === 'fight' || mode === 'lane')) return issueCast(u.x, u.z);
        break;
      }
      case 'engage': {
        if (mode !== 'fight' || !target) break;
        if (ad.targeting === 'unit') {
          if (tdist <= ad.range && tdist > reach(u, target) + 1.5) return issueCast(target.x, target.z, target.id);
        } else if (tdist <= ad.range + 2 && tdist > reach(u, target) + 2) {
          return issueCast(target.x, target.z);
        }
        break;
      }
      case 'ultimate': {
        if (!target || mode === 'lane') break;
        if (tdist > ad.range + 1) break;
        const dmg = estimateUltDamage(u, ad) * mitigation(Math.max(target.s.armor, target.s.mr) * 0.6);
        const killable = dmg * 1.05 >= target.hp;
        let clustered = 0;
        for (const e of enemiesNear) if (dist(e.x, e.z, target.x, target.z) <= (ad.radius ?? 5) + 1) clustered++;
        const strong = mode === 'fight' && hpFrac(u) > 0.35 && (clustered >= 2 || killable || target.hp / target.s.maxHp < 0.6);
        if (!(killable || strong)) break;
        if (ad.targeting === 'unit') return issueCast(target.x, target.z, target.id);
        const p = predict(target, ad.speed ?? 0, u, sk.aim, ad.delay ?? 0);
        return issueCast(p.x, p.z, target.id);
      }
      case 'cc':
      case 'damage': {
        // AoE novas also work on minion clumps
        if (ad.kind === 'nova') {
          const r = (ad.radius ?? 6) - 0.5;
          let champs = 0;
          let minions = 0;
          for (const e of enemiesNear) if (dist(u.x, u.z, e.x, e.z) <= r) champs++;
          w.query(u.x, u.z, r, (v) => {
            if (v.team !== u.team && v.kind === 'minion') minions++;
          });
          if (champs > 0 || (minions >= 3 && mode !== 'retreat' && u.mana > u.s.maxMana * 0.55)) return issueCast(u.x, u.z);
          break;
        }
        if (!target || mode === 'retreat') break;
        if (tdist > ad.range) break;
        if (mode === 'lane' && ad.ai === 'cc') break;
        const p = predict(target, ad.speed ?? 0, u, sk.aim, ad.delay ?? 0);
        // do not waste skillshots on very distant predicted positions
        const pd = dist(u.x, u.z, p.x, p.z);
        if (pd > ad.range + 1) break;
        return issueCast(p.x, p.z, target.id);
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------- the think loop

function think(w: World, u: Unit, b: Bot, bb: TeamBB, sk: Skill) {
  const c = u.champ!;
  const team = u.team as Team;
  autoLevel(w, u);
  if (!u.alive) {
    b.mode = 'respawn';
    b.recallAt = 0;
    return;
  }
  if (w.hasStatus(u, 'stun')) return;
  if (tryDodge(w, u, b, sk)) return;

  const sp = SPAWN_POS[team];
  const inBase = dist(u.x, u.z, sp.x, sp.z) <= CONFIG.fountainRadius + 4;
  c.holdFire = false;

  // 1. Shop and heal in base
  if (c.inShop) {
    shop(w, u);
    if (hpFrac(u) < 0.9 || u.mana < u.s.maxMana * 0.6) {
      if (inBase) {
        stopUnit(w, u, b);
        b.mode = 'respawn';
        return;
      }
    }
  }
  if (b.mode === 'respawn' || b.mode === 'recall') {
    if (c.inShop && hpFrac(u) < 0.92 && inBase) {
      stopUnit(w, u, b);
      return;
    }
    if (b.mode === 'respawn' || (b.mode === 'recall' && u.order.t !== 'recall')) b.mode = 'lane';
  }

  // 2. Perception
  const enemies = bb.enemies;
  const near: Unit[] = [];
  let nearestE: Unit | null = null;
  let ned = Infinity;
  for (const e of enemies) {
    const d = dist(u.x, u.z, e.x, e.z);
    if (d <= 32) near.push(e);
    if (d < ned) {
      ned = d;
      nearestE = e;
    }
  }
  const allyNear = bb.allies.filter((a) => dist(a.x, a.z, u.x, u.z) <= 30);
  let allyPow = 0;
  for (const a of allyNear) allyPow += power(a);
  let enemyPow = 0;
  for (const e of near) if (dist(e.x, e.z, u.x, u.z) <= 30) enemyPow += power(e);
  const tower = threatenedByTower(w, bb, u.x, u.z);
  const recentHit = w.time - c.lastDamagedAt < 3;
  const lane = b.lane;

  // 3. Recall in progress: stay unless danger
  if (u.order.t === 'recall') {
    if (near.length > 0 && ned < 20) {
      // cancelled by moving away
      b.mode = 'retreat';
      const rp = retreatPoint(w, bb, u, lane);
      moveTo(w, u, b, rp.x, rp.z);
    }
    return;
  }

  // 4. Retreat / recall decisions
  const lowThr = (nearestE && ned < 28 ? 0.38 : 0.3) / Math.max(0.8, sk.aggr);
  const rich = wantsToShop(u);
  const unsafe = recentHit || (nearestE !== null && ned < 30) || tower !== null;
  if (!inBase && hpFrac(u) < lowThr) {
    b.mode = 'retreat';
    const rp = retreatPoint(w, bb, u, lane);
    if (useSkills(w, u, b, sk, 'retreat', nearestE, near)) return;
    if (!unsafe && dist(u.x, u.z, rp.x, rp.z) < 14 || (!unsafe && hpFrac(u) < 0.25)) {
      w.push({ type: 'recall', unit: u.id });
      b.mode = 'recall';
      return;
    }
    moveTo(w, u, b, rp.x, rp.z);
    return;
  }
  if (!inBase && rich && !unsafe && hpFrac(u) > 0.2) {
    const rp = retreatPoint(w, bb, u, lane);
    if (dist(u.x, u.z, rp.x, rp.z) > 16 && c.gold < 2200) {
      b.mode = 'retreat';
      moveTo(w, u, b, rp.x, rp.z);
      return;
    }
    w.push({ type: 'recall', unit: u.id });
    b.mode = 'recall';
    return;
  }

  // 5. Fight evaluation
  if (near.length > 0) {
    const target = chooseTarget(u, near);
    const underTower = target ? threatenedByTower(w, bb, target.x, target.z, 1.5) : null;
    let ratio = enemyPow > 0 ? allyPow / enemyPow : 9;
    if (underTower) ratio *= 0.45;
    const engage = 1.15 / sk.aggr;
    const killable = target ? target.hp < estimateBurst(u) : false;
    const stayAway = tower !== null && !allyMinionsNear(w, tower) && hpFrac(u) < 0.8;
    if (stayAway) {
      b.mode = 'retreat';
      const rp = retreatPoint(w, bb, u, lane);
      moveTo(w, u, b, rp.x, rp.z);
      return;
    }
    if (target && (ratio >= engage || killable) && hpFrac(u) > 0.35 && (!underTower || killable)) {
      b.mode = 'fight';
      c.holdFire = false;
      useSkills(w, u, b, sk, 'fight', target, near);
      attackUnit(w, u, b, target);
      return;
    }
    if (ratio < 0.7 / sk.aggr && nearestE && ned < 20) {
      b.mode = 'retreat';
      useSkills(w, u, b, sk, 'retreat', nearestE, near);
      const rp = retreatPoint(w, bb, u, lane);
      moveTo(w, u, b, rp.x, rp.z);
      return;
    }
    // Poke for ranged champions when it is safe
    if (target && tdist(u, target) <= reach(u, target) + 1 && !underTower) {
      b.mode = 'lane';
      useSkills(w, u, b, sk, 'lane', target, near);
      attackUnit(w, u, b, target);
      return;
    }
    if (target && !underTower && CHAMPIONS[c.defId].melee === false && tdist(u, target) < u.s.range + 5) {
      useSkills(w, u, b, sk, 'lane', target, near);
    }
  }

  // 6. Plan
  const plan = bb.plan;
  let goalLane: Lane = lane;
  let mode: Mode = 'lane';
  if (plan.mode === 'defend' && sk.macro > 0.2) {
    goalLane = plan.lane;
    mode = 'defend';
  } else if (plan.mode === 'push' && sk.macro > 0.2) {
    goalLane = plan.lane;
    mode = 'push';
  } else {
    // Assassins rotate to wherever the enemy is weak
    if (CHAMPIONS[c.defId].laneHint === 'roam' && w.time > 240 && w.time - b.lastRoam > 40) {
      b.lastRoam = w.time;
      b.lane = pickRoamLane(w, bb, u, sk);
    }
    goalLane = b.lane;
  }
  b.mode = mode;
  if (mode === 'defend') {
    defendBehaviour(w, u, b, bb, goalLane, near);
    return;
  }
  if (mode === 'push') {
    pushBehaviour(w, u, b, bb, sk, goalLane, near);
    return;
  }
  laneBehaviour(w, u, b, bb, sk, goalLane, near);
}

function tdist(u: Unit, t: Unit): number {
  return dist(u.x, u.z, t.x, t.z);
}

function allyMinionsNear(w: World, tower: Unit): boolean {
  let n = 0;
  w.query(tower.x, tower.z, tower.s.range + 3, (v) => {
    if (v.kind === 'minion' && v.team !== tower.team) n++;
  });
  return n >= 2;
}

function estimateBurst(u: Unit): number {
  const def = CHAMPIONS[u.champ!.defId];
  let sum = u.s.ad * u.s.as * 2;
  for (let i = 0; i < 4; i++) {
    const r = u.champ!.ranks[i];
    if (r <= 0 || u.champ!.cooldowns[i] > 0 || u.mana < valueAt(def.abilities[i].mana, r)) continue;
    sum += abilityDamage(u, def.abilities[i], r) * 0.8;
  }
  return sum;
}

function chooseTarget(u: Unit, near: Unit[]): Unit | null {
  let best: Unit | null = null;
  let bs = -Infinity;
  for (const e of near) {
    const d = dist(u.x, u.z, e.x, e.z);
    const frac = hpFrac(e);
    const score = (1 - frac) * 40 - d * 0.7 + (e.champ!.defId === 'ysolde' || e.champ!.defId === 'kestrel' ? 6 : 0);
    if (score > bs) {
      bs = score;
      best = e;
    }
  }
  return best;
}

function pickRoamLane(w: World, bb: TeamBB, u: Unit, sk: Skill): Lane {
  void sk;
  // Lane where an enemy champion is visible, or where we have the fewest allies
  let best: Lane = u.champ!.lane;
  let bs = -Infinity;
  for (const lane of LANES) {
    let score = 0;
    for (const e of bb.enemies) if (projectOnLane(lane, e.x, e.z).d < 16) score += 2 + (1 - hpFrac(e)) * 3;
    for (const a of bb.allies) if (a !== u && a.champ!.lane === lane) score -= 0.8;
    const f = bb.front[lane];
    score += f.ownN * 0.1;
    score += w.rng.next() * 0.8;
    if (score > bs) {
      bs = score;
      best = lane;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------- behaviours

function defendBehaviour(w: World, u: Unit, b: Bot, bb: TeamBB, lane: Lane, near: Unit[]) {
  void bb;
  // Go to our closest alive structure in that lane (or base) and fight what is there
  let spot: Unit | null = null;
  let bd = Infinity;
  for (const s of w.structures) {
    if (s.team !== u.team || !s.alive) continue;
    if (s.struct!.lane !== lane && s.struct!.lane !== 'base') continue;
    const d = dist(s.x, s.z, u.x, u.z);
    // prefer structures that have enemies near
    let enemies = 0;
    w.query(s.x, s.z, 24, (v) => {
      if (v.team !== u.team) enemies++;
    });
    const key = d - enemies * 8;
    if (key < bd) {
      bd = key;
      spot = s;
    }
  }
  if (!spot) return;
  if (dist(u.x, u.z, spot.x, spot.z) > 14) {
    moveTo(w, u, b, spot.x, spot.z);
    return;
  }
  u.champ!.holdFire = false;
  if (near.length > 0) useSkills(w, u, b, SKILL.normal, 'fight', chooseTarget(u, near), near);
  attackMoveTo(w, u, b, spot.x, spot.z);
}

function pushBehaviour(w: World, u: Unit, b: Bot, bb: TeamBB, sk: Skill, lane: Lane, near: Unit[]) {
  const team = u.team as Team;
  const target = laneAttackTarget(w, team, lane);
  if (!target) {
    laneBehaviour(w, u, b, bb, sk, lane, near);
    return;
  }
  // Gather: wait for allies near the front before diving into a tower
  const d = dist(u.x, u.z, target.x, target.z);
  const tower = target.kind === 'tower';
  const alliesAtTarget = bb.allies.filter((a) => dist(a.x, a.z, target.x, target.z) < 26).length;
  const minionCover = allyMinionsNear(w, target);
  const ready = hpFrac(u) > 0.5 && (alliesAtTarget >= 2 || minionCover || !tower);
  u.champ!.holdFire = false;
  if (d > target.s.range + 6 && tower) {
    // approach the staging point just outside tower range
    const f = bb.front[lane];
    const total = laneLength(lane);
    let stageS = projectOnLane(lane, target.x, target.z).s;
    const back = target.s.range + 6;
    stageS += team === 0 ? -back : back;
    const own = Number.isFinite(f.own) ? f.own : stageS;
    // do not stand ahead of our own minions
    stageS = team === 0 ? Math.min(stageS, own) : Math.max(stageS, own);
    const p = laneStand(team, lane, clamp(stageS, 10, total - 10));
    if (dist(u.x, u.z, p.x, p.z) > 3) moveTo(w, u, b, p.x, p.z);
    else if (ready) attackMoveTo(w, u, b, target.x, target.z);
    return;
  }
  if (ready) {
    if (near.length > 0) useSkills(w, u, b, sk, 'fight', chooseTarget(u, near), near);
    // clear minions blocking the way, then hit the structure
    if (u.order.t === 'attack' && u.order.target === target.id) return;
    attackUnitIfReach(w, u, b, target);
  } else {
    const rp = retreatPoint(w, bb, u, lane);
    moveTo(w, u, b, rp.x, rp.z);
  }
}

function attackUnitIfReach(w: World, u: Unit, b: Bot, target: Unit) {
  // Prefer attack-move so champions deal with units in the way first
  attackMoveTo(w, u, b, target.x, target.z);
  void reach;
}

function laneBehaviour(w: World, u: Unit, b: Bot, bb: TeamBB, sk: Skill, lane: Lane, near: Unit[]) {
  const team = u.team as Team;
  const c = u.champ!;
  const def = CHAMPIONS[c.defId];
  const total = laneLength(lane);
  const f = bb.front[lane];
  const melee = def.melee;
  const backoff = melee ? 4 : 8.5;
  const dir = team === 0 ? 1 : -1;

  // Enemy minions within reach for last hitting
  const myDmg = attackDamage(u, u) * 1;
  let lastHit: Unit | null = null;
  let lhScore = Infinity;
  let anyEnemyMinion: Unit | null = null;
  let aemD = Infinity;
  let weakSoon: Unit | null = null;
  w.query(u.x, u.z, u.s.range + u.radius + 4, (v) => {
    if (v.team === u.team || !v.alive) return;
    if (v.kind !== 'minion' && v.kind !== 'monster') return;
    if (v.team !== 2 && !w.visible[team].has(v.id)) return;
    const d = dist(u.x, u.z, v.x, v.z);
    const inR = d <= reach(u, v) + 0.2;
    // damage incoming from allied projectiles
    let pending = 0;
    for (const p of w.projectiles) if (p.homing === v.id && p.team === u.team) pending += p.dmg * mitigation(p.dmgType === 'magic' ? v.s.mr : v.s.armor);
    const eff = v.hp - pending;
    const dmg = myDmg * mitigation(v.s.armor);
    if (inR && eff <= dmg * 1.02 && eff > 0) {
      if (eff < lhScore) {
        lhScore = eff;
        lastHit = v;
      }
    }
    if (inR && d < aemD) {
      aemD = d;
      anyEnemyMinion = v;
    }
    if (eff < dmg * 2.2 && eff > dmg * 1.02) weakSoon = v;
  });

  // Last hit
  if (lastHit && w.rng.chance(sk.lastHit)) {
    c.holdFire = false;
    attackUnit(w, u, b, lastHit);
    return;
  }
  // Wave is low on allies or we are clearing it: free attack
  const enemyNear = near.length > 0;
  if (anyEnemyMinion && !weakSoon && !enemyNear) {
    const pushOK = f.ownN >= f.enemyN || w.rng.chance(1 - sk.lastHit);
    if (pushOK && w.rng.chance(0.4 + (1 - sk.lastHit))) {
      c.holdFire = false;
      attackUnit(w, u, b, anyEnemyMinion);
      return;
    }
  }
  // AoE clear when mana allows
  if (near.length === 0 && anyEnemyMinion) {
    if (useSkills(w, u, b, sk, 'lane', null, near)) return;
  }
  // Positioning: behind our minion front, never deep into the enemy tower unless it is safe
  let s: number;
  const clash = Number.isFinite(f.own) && Number.isFinite(f.enemy) ? (f.own + f.enemy) / 2 : Number.isFinite(f.own) ? f.own : NaN;
  if (Number.isFinite(clash)) s = clash - dir * backoff;
  else {
    // no wave: stand by our outer tower
    const own = bb.towers.filter((t) => projectOnLane(lane, t.x, t.z).d < 10).map((t) => projectOnLane(lane, t.x, t.z).s);
    s = own.length ? (team === 0 ? Math.max(...own) : Math.min(...own)) + dir * 4 : team === 0 ? 40 : total - 40;
  }
  let p = laneStand(team, lane, s);
  const tw = threatenedByTower(w, bb, p.x, p.z, 1);
  if (tw && !allyMinionsNear(w, tw)) {
    // back out of tower range along the lane
    const ts = projectOnLane(lane, tw.x, tw.z).s;
    s = ts - dir * (tw.s.range + 3);
    p = laneStand(team, lane, s);
  }
  c.holdFire = true;
  if (dist(u.x, u.z, p.x, p.z) > 2.2) moveTo(w, u, b, p.x, p.z);
  else stopUnit(w, u, b);
}

export { SKILL };
void SKILL;
