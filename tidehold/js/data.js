// Tidehold game data: map constants, building and troop definitions, level curves, quests.
// Pure data and small helpers. No DOM, so the same file runs in the browser and in node tests.

export const MAP = 34; // tiles per side
export const LAND0 = 1; // land is [LAND0, LAND1)
export const LAND1 = 33;
export const BUILD0 = 4; // buildable area is [BUILD0, BUILD1)
export const BUILD1 = 30;
export const KEEP_MAX = 6;
export const MAX_LVL = 7;
export const RED_ZONE = 1.2; // tiles around a building where troops cannot be dropped
export const BATTLE_TIME = 180; // seconds

function nice(n) {
  if (n < 100) return Math.round(n);
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

// cat: core | res | army | def | wall | trap
// cost is paid for reaching level L: nice(c0 * cg^(L-1)). Time likewise in seconds.
// counts[k-1] = how many you may own at Keep level k.
export const BUILDINGS = {
  keep: {
    name: 'Keep', cat: 'core', size: 4, max: KEEP_MAX, hp0: 1500, hpG: 1.35, counts: [1, 1, 1, 1, 1, 1],
    costs: [0, 1800, 8000, 28000, 80000, 190000], times: [0, 30, 240, 1800, 10800, 43200], res: 'gold',
    storeGold: [1000, 1500, 2500, 4000, 6500, 10000], storeCrystal: [1000, 1500, 2500, 4000, 6500, 10000],
    desc: 'The heart of your island. Upgrading it unlocks new buildings and higher levels.',
  },
  gmine: {
    name: 'Gold Mine', cat: 'res', size: 3, max: MAX_LVL, hp0: 380, hpG: 1.2, counts: [2, 3, 4, 5, 5, 6],
    res: 'gold', c0: 200, cg: 1.8, t0: 6, tg: 2.3, prod: { res: 'gold', p0: 500, g: 1.38 },
    desc: 'Digs gold out of the island. Tap it to collect.',
  },
  cwell: {
    name: 'Crystal Well', cat: 'res', size: 3, max: MAX_LVL, hp0: 380, hpG: 1.2, counts: [2, 3, 4, 5, 5, 6],
    res: 'gold', c0: 200, cg: 1.8, t0: 6, tg: 2.3, prod: { res: 'crystal', p0: 500, g: 1.38 },
    desc: 'Draws crystal from deep below. Tap it to collect.',
  },
  vault: {
    name: 'Gold Vault', cat: 'res', size: 3, max: MAX_LVL, hp0: 600, hpG: 1.22, counts: [1, 2, 2, 3, 4, 4],
    res: 'crystal', c0: 250, cg: 1.8, t0: 10, tg: 2.3, store: { res: 'gold', c0: 3000, g: 1.75 },
    desc: 'Keeps your gold safe. More vaults, more room.',
  },
  tank: {
    name: 'Crystal Tank', cat: 'res', size: 3, max: MAX_LVL, hp0: 600, hpG: 1.22, counts: [1, 2, 2, 3, 4, 4],
    res: 'gold', c0: 250, cg: 1.8, t0: 10, tg: 2.3, store: { res: 'crystal', c0: 3000, g: 1.75 },
    desc: 'Stores your crystal.',
  },
  camp: {
    name: 'Army Camp', cat: 'army', size: 4, max: MAX_LVL, hp0: 450, hpG: 1.18, counts: [1, 2, 2, 3, 3, 4],
    res: 'gold', c0: 300, cg: 1.8, t0: 12, tg: 2.3, housing: { h0: 20, step: 5 },
    desc: 'Troops rest here. Each camp holds more as it levels.',
  },
  barracks: {
    name: 'Barracks', cat: 'army', size: 3, max: MAX_LVL, hp0: 420, hpG: 1.18, counts: [1, 2, 2, 3, 3, 4],
    res: 'crystal', c0: 250, cg: 1.8, t0: 12, tg: 2.3,
    desc: 'Trains troops. Each barracks trains one at a time. Higher levels unlock new troops.',
  },
  forge: {
    name: 'Forge', cat: 'army', size: 3, max: 5, hp0: 520, hpG: 1.2, counts: [0, 1, 1, 1, 1, 1],
    res: 'gold', c0: 1500, cg: 2.0, t0: 60, tg: 2.4,
    desc: 'Upgrade your troops here. Troops cannot pass Forge level + 1.',
  },
  cannon: {
    name: 'Cannon', cat: 'def', size: 2, max: MAX_LVL, hp0: 330, hpG: 1.22, counts: [2, 2, 3, 4, 5, 6],
    res: 'gold', c0: 250, cg: 1.85, t0: 8, tg: 2.3,
    atk: { dmg: 16, dmgG: 1.2, interval: 0.8, range: 5.5, air: false, flight: 0.25 },
    desc: 'Fast and cheap. Hits ground troops only.',
  },
  ballista: {
    name: 'Ballista', cat: 'def', size: 2, max: MAX_LVL, hp0: 250, hpG: 1.22, counts: [0, 1, 2, 3, 3, 4],
    res: 'gold', c0: 600, cg: 1.85, t0: 14, tg: 2.3,
    atk: { dmg: 22, dmgG: 1.2, interval: 1.0, range: 7.5, air: true, flight: 0.3 },
    desc: 'Long range. The only defence that hits flyers.',
  },
  mortar: {
    name: 'Mortar', cat: 'def', size: 3, max: MAX_LVL, hp0: 300, hpG: 1.22, counts: [0, 0, 1, 1, 2, 3],
    res: 'gold', c0: 1200, cg: 1.85, t0: 20, tg: 2.3,
    atk: { dmg: 38, dmgG: 1.2, interval: 3.2, range: 9, minRange: 2.5, air: false, splash: 1.6, flight: 0.9 },
    desc: 'Lobs shells that hurt a crowd. Slow and cannot hit what is close.',
  },
  bomb: {
    name: 'Bomb Trap', cat: 'trap', size: 1, max: 4, hp0: 1, hpG: 1, counts: [0, 2, 3, 4, 5, 6],
    res: 'gold', c0: 300, cg: 2.0, t0: 5, tg: 2.2,
    atk: { dmg: 140, dmgG: 1.3, trigger: 1.1, splash: 2.0 },
    desc: 'Hidden. Blows up when ground troops step near, once per raid.',
  },
  wall: {
    name: 'Wall', cat: 'wall', size: 1, max: MAX_LVL, hp0: 130, hpG: 1.5, counts: [20, 40, 60, 80, 100, 120],
    res: 'gold', c0: 40, cg: 1.9, t0: 0, tg: 1, instant: true,
    desc: 'Cheap and tough. Troops must break through or walk around.',
  },
};

export const BUILD_ORDER = ['gmine', 'cwell', 'vault', 'tank', 'camp', 'barracks', 'forge', 'cannon', 'ballista', 'mortar', 'bomb', 'wall'];
export const SHOP_TABS = [
  { id: 'res', name: 'Economy', types: ['gmine', 'cwell', 'vault', 'tank'] },
  { id: 'army', name: 'Army', types: ['camp', 'barracks', 'forge'] },
  { id: 'def', name: 'Defence', types: ['cannon', 'ballista', 'mortar', 'bomb', 'wall'] },
];
export const COLLECTORS = ['gmine', 'cwell'];
export const STORAGES = ['vault', 'tank'];
export const DEFENSES = ['cannon', 'ballista', 'mortar'];

export const TROOPS = {
  squire: {
    name: 'Squire', housing: 1, hp: 62, dmg: 11, interval: 0.9, range: 0.7, speed: 1.5, cost: 25, time: 6,
    unlock: 1, pref: 'any', flying: false, desc: 'Cheap sword fighter. Goes for the nearest building.',
  },
  slinger: {
    name: 'Slinger', housing: 1, hp: 34, dmg: 12, interval: 0.9, range: 4.2, speed: 1.45, cost: 40, time: 8,
    unlock: 2, pref: 'any', flying: false, desc: 'Fragile, but shoots from a distance.',
  },
  sapper: {
    name: 'Sapper', housing: 2, hp: 30, dmg: 40, interval: 1, range: 0.6, speed: 1.9, cost: 80, time: 12,
    unlock: 3, pref: 'wall', flying: false, blast: 1.2, wallMul: 12, desc: 'Runs at walls and blows a hole in them.',
  },
  brute: {
    name: 'Brute', housing: 5, hp: 420, dmg: 28, interval: 1.8, range: 0.9, speed: 0.9, cost: 280, time: 30,
    unlock: 4, pref: 'defense', flying: false, desc: 'Slow tank. Smashes defences first.',
  },
  glider: {
    name: 'Glider', housing: 3, hp: 110, dmg: 22, interval: 1.1, range: 0.8, speed: 2.1, cost: 140, time: 18,
    unlock: 5, pref: 'resource', flying: true, desc: 'Flies over walls. Raids mines and vaults.',
  },
};
export const TROOP_ORDER = ['squire', 'slinger', 'sapper', 'brute', 'glider'];
export const TROOP_MAX = 6;

export const OBSTACLES = {
  rock: { name: 'Boulder', size: 2, cost: 150, time: 20, pearls: 4 },
  tree: { name: 'Old Tree', size: 2, cost: 80, time: 12, pearls: 3 },
  stump: { name: 'Stump', size: 1, cost: 30, time: 6, pearls: 1 },
};

export const LEAGUES = [
  { name: 'Bronze', min: 0, color: '#c98a52' },
  { name: 'Silver', min: 200, color: '#c5ced6' },
  { name: 'Gold', min: 500, color: '#f4c542' },
  { name: 'Crystal', min: 1000, color: '#6fd8ff' },
  { name: 'Master', min: 2000, color: '#d78bff' },
];

export function leagueOf(trophies) {
  let l = LEAGUES[0];
  for (const x of LEAGUES) if (trophies >= x.min) l = x;
  return l;
}

// ---------- level curves ----------

export function maxLevelAllowed(type, keepLvl) {
  if (type === 'keep') return KEEP_MAX;
  return Math.min(BUILDINGS[type].max, keepLvl + 1);
}

export function countAllowed(type, keepLvl) {
  return BUILDINGS[type].counts[Math.min(keepLvl, KEEP_MAX) - 1];
}

export function buildCost(type, lvl) {
  const d = BUILDINGS[type];
  const amt = d.costs ? d.costs[lvl - 1] : nice(d.c0 * d.cg ** (lvl - 1));
  return { res: d.res, amt };
}

export function buildTime(type, lvl) {
  const d = BUILDINGS[type];
  if (d.instant) return 0;
  if (d.times) return d.times[lvl - 1];
  return Math.round(d.t0 * d.tg ** (lvl - 1));
}

export function buildingHp(type, lvl) {
  const d = BUILDINGS[type];
  return Math.round(d.hp0 * d.hpG ** (lvl - 1));
}

export function prodPerHour(type, lvl) {
  const p = BUILDINGS[type].prod;
  return Math.round(p.p0 * p.g ** (lvl - 1));
}

export function prodCapacity(type, lvl) {
  return prodPerHour(type, lvl) * 6; // six hours of output
}

export function storeCapacity(type, lvl) {
  const s = BUILDINGS[type].store;
  return nice(s.c0 * s.g ** (lvl - 1));
}

export function housingOf(lvl) {
  const h = BUILDINGS.camp.housing;
  return h.h0 + h.step * (lvl - 1);
}

export function defenseStats(type, lvl) {
  const a = BUILDINGS[type].atk;
  const m = a.dmgG ** (lvl - 1);
  return { ...a, dmg: a.dmg * m, dps: (a.dmg * m) / (a.interval || 1) };
}

export function trapStats(lvl) {
  const a = BUILDINGS.bomb.atk;
  return { ...a, dmg: a.dmg * a.dmgG ** (lvl - 1) };
}

export function troopMul(lvl) {
  return 1 + 0.22 * (lvl - 1);
}

export function troopStats(troop, lvl) {
  const t = TROOPS[troop];
  const m = troopMul(lvl);
  return { ...t, hp: t.hp * m, dmg: t.dmg * m, dps: (t.dmg * m) / t.interval };
}

// Forge cost and time to bring a troop up to `lvl` (lvl >= 2).
export function forgeCost(troop, lvl) {
  return nice(TROOPS[troop].cost * 12 * 2.1 ** (lvl - 2));
}

export function forgeTime(troop, lvl) {
  return Math.round(40 * 2.6 ** (lvl - 2) * (1 + TROOPS[troop].housing * 0.15));
}

export function troopMaxLevel(forgeLvl) {
  return Math.min(TROOP_MAX, forgeLvl + 1);
}

// Pearls needed to finish something instantly.
export function pearlsForTime(seconds) {
  if (seconds <= 0) return 0;
  return Math.max(1, Math.ceil((seconds / 60) ** 0.8));
}

export function pearlsForResource(amt) {
  return Math.max(1, Math.ceil(amt / 250));
}

export const BUILDER_PRICES = [0, 0, 0, 150, 500]; // pearls for builder #3, #4 (index = number you will own)
export const MAX_BUILDERS = 4;

// ---------- quests ----------
// kind: have (type, goal) | keep | wins | stars | destroyed | trained | collected | upgrades | forge | builders
export const QUESTS = [
  { id: 'build_mine', text: 'Build a second Gold Mine', kind: 'have', type: 'gmine', goal: 2, reward: 15 },
  { id: 'build_well', text: 'Build a second Crystal Well', kind: 'have', type: 'cwell', goal: 2, reward: 15 },
  { id: 'win1', text: 'Win your first raid', kind: 'wins', goal: 1, reward: 20 },
  { id: 'train20', text: 'Train 20 troops', kind: 'trained', goal: 20, reward: 15 },
  { id: 'cannons3', text: 'Own 3 Cannons', kind: 'have', type: 'cannon', goal: 3, reward: 20 },
  { id: 'keep2', text: 'Upgrade the Keep to level 2', kind: 'keep', goal: 2, reward: 30 },
  { id: 'destroy50', text: 'Destroy 50 buildings in raids', kind: 'destroyed', goal: 50, reward: 25 },
  { id: 'wins5', text: 'Win 5 raids', kind: 'wins', goal: 5, reward: 30 },
  { id: 'walls20', text: 'Place 20 Walls', kind: 'have', type: 'wall', goal: 20, reward: 25 },
  { id: 'forge1', text: 'Upgrade a troop at the Forge', kind: 'forge', goal: 2, reward: 30 },
  { id: 'collect20k', text: 'Collect 20,000 resources', kind: 'collected', goal: 20000, reward: 30 },
  { id: 'keep3', text: 'Upgrade the Keep to level 3', kind: 'keep', goal: 3, reward: 50 },
  { id: 'stars30', text: 'Earn 30 raid stars', kind: 'stars', goal: 30, reward: 50 },
  { id: 'upg25', text: 'Finish 25 upgrades', kind: 'upgrades', goal: 25, reward: 40 },
  { id: 'keep4', text: 'Upgrade the Keep to level 4', kind: 'keep', goal: 4, reward: 80 },
  { id: 'builders3', text: 'Hire a third builder', kind: 'builders', goal: 3, reward: 30 },
  { id: 'wins25', text: 'Win 25 raids', kind: 'wins', goal: 25, reward: 80 },
  { id: 'keep6', text: 'Upgrade the Keep to level 6', kind: 'keep', goal: 6, reward: 200 },
];

export function fmt(n) {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function fmtFull(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60 ? (sec % 60) + 's' : ''}`.trim();
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60) ? Math.floor((sec % 3600) / 60) + 'm' : ''}`.trim();
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600) ? Math.floor((sec % 86400) / 3600) + 'h' : ''}`.trim();
}
