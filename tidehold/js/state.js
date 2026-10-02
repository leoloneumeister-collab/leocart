// Game state and economy rules. Pure logic: every function takes the state and a timestamp (ms),
// so it runs the same in the browser and in node tests. Timers are absolute timestamps, which is
// what makes offline progress work: when the page opens again we just tick to "now".

import * as D from './data.js';
import { mulberry32 } from './util.js';

export const SAVE_KEY = 'tidehold.save.v1';
const HOUR = 3600 * 1000;

export function newGame(now = Date.now(), seed = 7) {
  const S = {
    v: 1,
    created: now,
    last: now,
    res: { gold: 1500, crystal: 1500, pearls: 120 },
    builders: 2,
    nextId: 1,
    buildings: [],
    obstacles: [],
    army: Object.fromEntries(D.TROOP_ORDER.map((t) => [t, 0])),
    queue: [],
    troopLvl: Object.fromEntries(D.TROOP_ORDER.map((t) => [t, 1])),
    forge: null,
    trophies: 0,
    shieldUntil: now + 24 * HOUR,
    stats: { wins: 0, losses: 0, stars: 0, destroyed: 0, trained: 0, collected: 0, upgrades: 0, raids: 0 },
    campaign: {},
    quests: {},
    tutorial: 0,
    log: [],
    settings: { sound: true },
    seed,
    lastRaidCheck: now,
  };
  const add = (type, x, y) => addBuilding(S, type, x, y, 1, now);
  add('keep', 15, 15);
  add('gmine', 10, 15);
  add('cwell', 21, 15);
  add('vault', 15, 11);
  add('tank', 19, 11);
  add('camp', 15, 20);
  add('barracks', 10, 20);
  add('cannon', 12, 11);
  add('cannon', 21, 20);
  scatterObstacles(S, seed);
  return S;
}

// A fresh island plus the little head start the tutorial relies on.
export function newPlayer(now = Date.now(), seed = 7) {
  const S = newGame(now, seed);
  S.army.squire = 12;
  for (const b of S.buildings) if (D.COLLECTORS.includes(b.type)) b.stored = 150;
  return S;
}

function addBuilding(S, type, x, y, lvl, now) {
  const b = { id: S.nextId++, type, x, y, lvl, up: null, stored: 0, t0: now, slot: null, free: now };
  S.buildings.push(b);
  return b;
}

function scatterObstacles(S, seed) {
  const rng = mulberry32(seed * 977 + 13);
  const kinds = ['rock', 'tree', 'tree', 'stump', 'stump', 'rock', 'tree', 'stump', 'tree', 'rock', 'stump', 'tree'];
  for (const kind of kinds) {
    const size = D.OBSTACLES[kind].size;
    for (let tries = 0; tries < 60; tries++) {
      const x = D.BUILD0 + Math.floor(rng() * (D.BUILD1 - D.BUILD0 - size + 1));
      const y = D.BUILD0 + Math.floor(rng() * (D.BUILD1 - D.BUILD0 - size + 1));
      if (isFree(S, x, y, size, size, 0, 1)) {
        S.obstacles.push({ id: S.nextId++, kind, x, y, size, clearing: null });
        break;
      }
    }
  }
}

// ---------- lookups ----------

export const sizeOf = (b) => D.BUILDINGS[b.type].size;
export const byId = (S, id) => S.buildings.find((b) => b.id === id) || null;
export const ofType = (S, type) => S.buildings.filter((b) => b.type === type);
export const keepOf = (S) => S.buildings.find((b) => b.type === 'keep');
export const keepLevel = (S) => keepOf(S).lvl;

// How many of a type exist, counting ones under construction.
export const countOf = (S, type) => S.buildings.filter((b) => b.type === type).length;

export function capacity(S) {
  const k = keepOf(S);
  let gold = D.BUILDINGS.keep.storeGold[k.lvl - 1];
  let crystal = D.BUILDINGS.keep.storeCrystal[k.lvl - 1];
  for (const b of S.buildings) {
    if (b.lvl < 1) continue;
    if (b.type === 'vault') gold += D.storeCapacity('vault', b.lvl);
    else if (b.type === 'tank') crystal += D.storeCapacity('tank', b.lvl);
  }
  return { gold, crystal };
}

export function armyCapacity(S) {
  let n = 0;
  for (const b of S.buildings) if (b.type === 'camp' && b.lvl >= 1) n += D.housingOf(b.lvl);
  return n;
}

export function armyUsed(S) {
  let n = 0;
  for (const t of D.TROOP_ORDER) n += S.army[t] * D.TROOPS[t].housing;
  return n + reservedHousing(S);
}

function reservedHousing(S) {
  let n = 0;
  for (const q of S.queue) n += D.TROOPS[q.troop].housing;
  for (const b of S.buildings) if (b.slot) n += D.TROOPS[b.slot.troop].housing;
  return n;
}

export function barracksLevel(S) {
  let l = 0;
  for (const b of S.buildings) if (b.type === 'barracks' && b.lvl >= 1) l = Math.max(l, b.lvl);
  return l;
}

export function forgeOf(S) {
  return S.buildings.find((b) => b.type === 'forge' && b.lvl >= 1) || null;
}

export function builderBusy(S) {
  let n = 0;
  for (const b of S.buildings) if (b.up) n++;
  for (const o of S.obstacles) if (o.clearing) n++;
  return n;
}

export const freeBuilders = (S) => S.builders - builderBusy(S);

export function league(S) {
  return D.leagueOf(S.trophies);
}

// ---------- placement ----------

function isFree(S, x, y, w, h, ignoreId = 0, margin = 0) {
  for (const b of S.buildings) {
    if (b.id === ignoreId) continue;
    const s = sizeOf(b);
    if (x < b.x + s + margin && x + w + margin > b.x && y < b.y + s + margin && y + h + margin > b.y) {
      // margin only separates big things; walls and traps may touch anything
      return false;
    }
  }
  for (const o of S.obstacles) {
    if (x < o.x + o.size && x + w > o.x && y < o.y + o.size && y + h > o.y) return false;
  }
  return true;
}

export function inBuildArea(x, y, size) {
  return x >= D.BUILD0 && y >= D.BUILD0 && x + size <= D.BUILD1 && y + size <= D.BUILD1;
}

export function canPlace(S, type, x, y, ignoreId = 0) {
  const s = D.BUILDINGS[type].size;
  return inBuildArea(x, y, s) && isFree(S, x, y, s, s, ignoreId, 0);
}

// ---------- spending ----------

export function canAfford(S, res, amt) {
  return S.res[res] >= amt;
}

function spend(S, res, amt) {
  S.res[res] -= amt;
}

// Returns pearls needed to cover a shortfall, or 0 when you can already pay.
export function shortfall(S, res, amt) {
  const need = amt - S.res[res];
  return need > 0 ? D.pearlsForResource(need) : 0;
}

// Pay a resource shortfall with pearls and credit the missing resource.
export function topUpWithPearls(S, res, amt) {
  const need = amt - S.res[res];
  if (need <= 0) return true;
  const cost = D.pearlsForResource(need);
  if (S.res.pearls < cost) return false;
  S.res.pearls -= cost;
  S.res[res] += need;
  return true;
}

// ---------- building ----------

export function checkBuild(S, type) {
  const d = D.BUILDINGS[type];
  const k = keepLevel(S);
  const allowed = D.countAllowed(type, k);
  if (allowed === 0) {
    let need = k + 1;
    while (need <= D.KEEP_MAX && D.countAllowed(type, need) === 0) need++;
    return { ok: false, err: `Needs Keep level ${need}` };
  }
  if (countOf(S, type) >= allowed) return { ok: false, err: 'Limit reached. Upgrade the Keep for more.' };
  const c = D.buildCost(type, 1);
  if (!d.instant && freeBuilders(S) < 1) return { ok: false, err: 'All builders are busy', builders: true };
  if (!canAfford(S, c.res, c.amt)) return { ok: false, err: `Not enough ${c.res}`, need: c };
  return { ok: true, cost: c };
}

export function startBuild(S, type, x, y, now) {
  const chk = checkBuild(S, type);
  if (!chk.ok) return chk;
  if (!canPlace(S, type, x, y)) return { ok: false, err: 'Cannot build there' };
  const d = D.BUILDINGS[type];
  spend(S, chk.cost.res, chk.cost.amt);
  const b = addBuilding(S, type, x, y, 0, now);
  if (d.instant) {
    b.lvl = 1;
  } else {
    b.up = { from: 0, to: 1, start: now, end: now + D.buildTime(type, 1) * 1000 };
  }
  return { ok: true, b };
}

export function checkUpgrade(S, b) {
  if (b.up) return { ok: false, err: 'Already being built' };
  const k = keepLevel(S);
  const cap = D.maxLevelAllowed(b.type, k);
  if (b.lvl >= D.BUILDINGS[b.type].max) return { ok: false, err: 'Max level' };
  if (b.lvl >= cap) return { ok: false, err: `Needs Keep level ${b.lvl}`, keepNeeded: b.lvl };
  const d = D.BUILDINGS[b.type];
  const c = D.buildCost(b.type, b.lvl + 1);
  if (!d.instant && freeBuilders(S) < 1) return { ok: false, err: 'All builders are busy', builders: true, cost: c };
  if (!canAfford(S, c.res, c.amt)) return { ok: false, err: `Not enough ${c.res}`, need: c, cost: c };
  return { ok: true, cost: c };
}

export function startUpgrade(S, b, now) {
  const chk = checkUpgrade(S, b);
  if (!chk.ok) return chk;
  const d = D.BUILDINGS[b.type];
  spend(S, chk.cost.res, chk.cost.amt);
  if (d.instant) {
    b.lvl += 1;
    S.stats.upgrades++;
    return { ok: true, instant: true };
  }
  b.up = { from: b.lvl, to: b.lvl + 1, start: now, end: now + D.buildTime(b.type, b.lvl + 1) * 1000 };
  return { ok: true };
}

// Upgrade every wall of a given level at once. Stops when the money runs out.
export function upgradeWalls(S, lvl) {
  const cap = D.maxLevelAllowed('wall', keepLevel(S));
  if (lvl >= cap) return { ok: false, err: 'Walls are at the limit for this Keep level' };
  const c = D.buildCost('wall', lvl + 1);
  let n = 0;
  for (const b of S.buildings) {
    if (b.type !== 'wall' || b.lvl !== lvl) continue;
    if (S.res[c.res] < c.amt) break;
    spend(S, c.res, c.amt);
    b.lvl++;
    S.stats.upgrades++;
    n++;
  }
  return n ? { ok: true, n } : { ok: false, err: `Not enough ${c.res}`, need: c };
}

export function wallUpgradeQuote(S, lvl) {
  const n = S.buildings.filter((b) => b.type === 'wall' && b.lvl === lvl).length;
  const c = D.buildCost('wall', lvl + 1);
  return { n, res: c.res, each: c.amt, total: c.amt * n };
}

export function moveBuilding(S, b, x, y) {
  if (!canPlace(S, b.type, x, y, b.id)) return false;
  b.x = x;
  b.y = y;
  return true;
}

export function remainingMs(task, now) {
  return Math.max(0, task.end - now);
}

export function speedUpCost(task, now) {
  return D.pearlsForTime(remainingMs(task, now) / 1000);
}

// Finish a building task right now for pearls.
export function speedUp(S, b, now) {
  if (!b.up) return false;
  const cost = speedUpCost(b.up, now);
  if (S.res.pearls < cost) return false;
  S.res.pearls -= cost;
  b.up.end = now;
  return true;
}

export function speedUpForge(S, now) {
  if (!S.forge) return false;
  const cost = speedUpCost(S.forge, now);
  if (S.res.pearls < cost) return false;
  S.res.pearls -= cost;
  S.forge.end = now;
  return true;
}

// ---------- obstacles ----------

export function checkClear(S, o) {
  const d = D.OBSTACLES[o.kind];
  if (o.clearing) return { ok: false, err: 'Already clearing' };
  if (freeBuilders(S) < 1) return { ok: false, err: 'All builders are busy', builders: true };
  if (!canAfford(S, 'gold', d.cost)) return { ok: false, err: 'Not enough gold', need: { res: 'gold', amt: d.cost } };
  return { ok: true, cost: d.cost };
}

export function clearObstacle(S, o, now) {
  const chk = checkClear(S, o);
  if (!chk.ok) return chk;
  spend(S, 'gold', chk.cost);
  o.clearing = { start: now, end: now + D.OBSTACLES[o.kind].time * 1000 };
  return { ok: true };
}

export function speedUpObstacle(S, o, now) {
  if (!o.clearing) return false;
  const cost = speedUpCost(o.clearing, now);
  if (S.res.pearls < cost) return false;
  S.res.pearls -= cost;
  o.clearing.end = now;
  return true;
}

// ---------- builders ----------

export function builderPrice(S) {
  return S.builders >= D.MAX_BUILDERS ? 0 : D.BUILDER_PRICES[S.builders + 1];
}

export function buyBuilder(S) {
  const p = builderPrice(S);
  if (!p || S.res.pearls < p) return false;
  S.res.pearls -= p;
  S.builders++;
  return true;
}

// ---------- collectors ----------

export function collectorAmount(b, now) {
  if (b.lvl < 1) return 0;
  const cap = D.prodCapacity(b.type, b.lvl);
  const perMs = D.prodPerHour(b.type, b.lvl) / HOUR;
  return Math.min(cap, b.stored + perMs * Math.max(0, now - b.t0));
}

export function collect(S, b, now) {
  const d = D.BUILDINGS[b.type];
  const res = d.prod.res;
  const amount = collectorAmount(b, now);
  const room = capacity(S)[res] - S.res[res];
  if (amount < 1) return { ok: false, err: 'Nothing to collect yet' };
  if (room < 1) return { ok: false, err: res === 'gold' ? 'Gold storage is full' : 'Crystal storage is full' };
  const take = Math.floor(Math.min(amount, room));
  S.res[res] += take;
  S.stats.collected += take;
  b.stored = amount - take;
  b.t0 = now;
  return { ok: true, amt: take, res };
}

// ---------- training and the forge ----------

export function troopUnlocked(S, troop) {
  return barracksLevel(S) >= D.TROOPS[troop].unlock;
}

export function checkTrain(S, troop) {
  const t = D.TROOPS[troop];
  if (!troopUnlocked(S, troop)) return { ok: false, err: `Needs Barracks level ${t.unlock}` };
  if (!S.buildings.some((b) => b.type === 'barracks' && b.lvl >= 1)) return { ok: false, err: 'Build a Barracks first' };
  if (armyUsed(S) + t.housing > armyCapacity(S)) return { ok: false, err: 'Your camps are full' };
  if (!canAfford(S, 'crystal', t.cost)) return { ok: false, err: 'Not enough crystal', need: { res: 'crystal', amt: t.cost } };
  return { ok: true };
}

export function train(S, troop, now) {
  const chk = checkTrain(S, troop);
  if (!chk.ok) return chk;
  spend(S, 'crystal', D.TROOPS[troop].cost);
  S.queue.push({ troop, at: now });
  const ev = [];
  pumpTraining(S, now, ev);
  return { ok: true };
}

export function cancelQueued(S, index) {
  const q = S.queue[index];
  if (!q) return false;
  S.res.crystal = Math.min(capacity(S).crystal, S.res.crystal + D.TROOPS[q.troop].cost);
  S.queue.splice(index, 1);
  return true;
}

function pumpTraining(S, now, events) {
  const rax = S.buildings.filter((b) => b.type === 'barracks' && b.lvl >= 1);
  for (let guard = 0; guard < 5000; guard++) {
    let did = false;
    for (const b of rax) {
      if (b.slot && b.slot.end <= now) {
        S.army[b.slot.troop]++;
        S.stats.trained++;
        events.push({ type: 'trained', troop: b.slot.troop, b });
        b.free = b.slot.end;
        b.slot = null;
        did = true;
      }
    }
    for (const b of rax) {
      if (!b.slot && S.queue.length) {
        const q = S.queue.shift();
        const start = Math.max(b.free || 0, q.at);
        b.slot = { troop: q.troop, start, end: start + D.TROOPS[q.troop].time * 1000 };
        did = true;
      }
    }
    if (!did) break;
  }
}

export function trainingStatus(S) {
  const slots = S.buildings.filter((b) => b.type === 'barracks' && b.lvl >= 1 && b.slot).map((b) => b.slot);
  return { slots, queue: S.queue };
}

export function checkForge(S, troop) {
  const f = forgeOf(S);
  if (!f) return { ok: false, err: 'Build a Forge first' };
  if (S.forge) return { ok: false, err: 'The forge is busy' };
  const lvl = S.troopLvl[troop];
  if (lvl >= D.troopMaxLevel(f.lvl)) {
    return { ok: false, err: lvl >= D.TROOP_MAX ? 'Max level' : `Upgrade the Forge to level ${f.lvl + 1}` };
  }
  const cost = D.forgeCost(troop, lvl + 1);
  if (!canAfford(S, 'crystal', cost)) return { ok: false, err: 'Not enough crystal', need: { res: 'crystal', amt: cost } };
  return { ok: true, cost };
}

export function startForge(S, troop, now) {
  const chk = checkForge(S, troop);
  if (!chk.ok) return chk;
  spend(S, 'crystal', chk.cost);
  const to = S.troopLvl[troop] + 1;
  S.forge = { troop, to, start: now, end: now + D.forgeTime(troop, to) * 1000 };
  return { ok: true };
}

// ---------- the clock ----------

// Advance all timers to `now`. Returns events the UI can react to.
export function tick(S, now) {
  const events = [];
  for (const b of S.buildings) {
    if (b.up && b.up.end <= now) {
      const up = b.up;
      if (up.from > 0 && D.COLLECTORS.includes(b.type)) {
        b.stored = collectorAmount(b, up.end);
        b.t0 = up.end;
      }
      b.lvl = up.to;
      b.up = null;
      if (up.from === 0) {
        b.t0 = up.end;
        b.stored = 0;
        b.free = up.end;
        events.push({ type: 'built', b });
      } else {
        S.stats.upgrades++;
        events.push({ type: 'upgraded', b });
      }
    }
  }
  for (let i = S.obstacles.length - 1; i >= 0; i--) {
    const o = S.obstacles[i];
    if (o.clearing && o.clearing.end <= now) {
      const pearls = D.OBSTACLES[o.kind].pearls;
      S.res.pearls += pearls;
      S.obstacles.splice(i, 1);
      events.push({ type: 'cleared', o, pearls });
    }
  }
  if (S.forge && S.forge.end <= now) {
    S.troopLvl[S.forge.troop] = S.forge.to;
    events.push({ type: 'forged', troop: S.forge.troop, lvl: S.forge.to });
    S.forge = null;
  }
  pumpTraining(S, now, events);
  S.last = now;
  return events;
}

// ---------- quests ----------

export function questProgress(S, q) {
  switch (q.kind) {
    case 'have': return S.buildings.filter((b) => b.type === q.type && b.lvl >= 1).length;
    case 'keep': return keepLevel(S);
    case 'wins': return S.stats.wins;
    case 'stars': return S.stats.stars;
    case 'destroyed': return S.stats.destroyed;
    case 'trained': return S.stats.trained;
    case 'collected': return S.stats.collected;
    case 'upgrades': return S.stats.upgrades;
    case 'forge': return Math.max(...D.TROOP_ORDER.map((t) => S.troopLvl[t]));
    case 'builders': return S.builders;
    default: return 0;
  }
}

export function questState(S, q) {
  const cur = Math.min(questProgress(S, q), q.goal);
  return { cur, goal: q.goal, done: cur >= q.goal, claimed: !!S.quests[q.id] };
}

export function claimQuest(S, q) {
  const st = questState(S, q);
  if (!st.done || st.claimed) return false;
  S.quests[q.id] = true;
  S.res.pearls += q.reward;
  return true;
}

export function claimableQuests(S) {
  return D.QUESTS.filter((q) => {
    const st = questState(S, q);
    return st.done && !st.claimed;
  });
}

// ---------- raids ----------

// Fold the outcome of a raid into the player's state. `result` comes from the battle sim.
export function applyRaid(S, result, now) {
  for (const [t, n] of Object.entries(result.used || {})) S.army[t] = Math.max(0, S.army[t] - n);
  const cap = capacity(S);
  const gold = Math.min(result.loot.gold, Math.max(0, cap.gold - S.res.gold));
  const crystal = Math.min(result.loot.crystal, Math.max(0, cap.crystal - S.res.crystal));
  S.res.gold += gold;
  S.res.crystal += crystal;
  S.stats.collected += gold + crystal;
  S.stats.raids++;
  S.stats.stars += result.stars;
  S.stats.destroyed += result.destroyed;
  let pearls = 0;
  if (result.stars >= 1) {
    S.stats.wins++;
    S.trophies += result.trophies;
  } else {
    S.stats.losses++;
    S.trophies = Math.max(0, S.trophies - Math.abs(result.trophyLoss || 0));
  }
  if (result.stage != null) {
    const prev = S.campaign[result.stage] || 0;
    if (result.stars > prev) {
      pearls = (result.stars - prev) * 3;
      S.res.pearls += pearls;
      S.campaign[result.stage] = result.stars;
    }
  }
  S.shieldUntil = 0;
  return { gold, crystal, pearls, lostToCap: result.loot.gold - gold + (result.loot.crystal - crystal) };
}

// ---------- persistence ----------

export function serialize(S) {
  return JSON.stringify(S);
}

export function save(S, storage) {
  try {
    storage.setItem(SAVE_KEY, serialize(S));
    return true;
  } catch {
    return false;
  }
}

export function load(storage, now = Date.now()) {
  let raw = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const S = JSON.parse(raw);
    if (!S || S.v !== 1 || !Array.isArray(S.buildings) || !keepOf(S)) return null;
    // fill anything an older save may lack
    const base = newGame(now, S.seed || 7);
    for (const k of Object.keys(base)) if (S[k] === undefined) S[k] = base[k];
    for (const k of Object.keys(base.stats)) if (S.stats[k] === undefined) S.stats[k] = 0;
    for (const t of D.TROOP_ORDER) {
      if (S.army[t] === undefined) S.army[t] = 0;
      if (S.troopLvl[t] === undefined) S.troopLvl[t] = 1;
    }
    if (S.last > now) S.last = now; // clock moved backwards: do not give free time
    for (const b of S.buildings) if (b.t0 > now) b.t0 = now;
    return S;
  } catch {
    return null;
  }
}
