import { U } from './constants.ts';
import { Rng } from './math.ts';

export type WeaponClass = 'pistol' | 'smg' | 'rifle' | 'sniper' | 'shotgun' | 'knife';
export type GrenadeKind = 'flash' | 'smoke' | 'he' | 'fire';
export type TeamAccess = 0 | 1 | 2; // 2 = both

export interface WeaponDef {
  id: string;
  name: string;
  cls: WeaponClass;
  slot: 'primary' | 'secondary' | 'knife';
  team: TeamAccess;
  price: number;
  killReward: number;
  damage: number;
  /** Fraction of damage that goes to health when the target wears armor. */
  armorPen: number;
  /** Damage multiplier per 12.7 m of travel. */
  rangeMod: number;
  rpm: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reload: number;
  draw: number;
  /** Max run speed with this weapon, in m/s. */
  speed: number;
  pellets: number;
  /** Spread model in degrees. */
  spread: { still: number; move: number; air: number; fire: number; fireMax: number; recover: number; crouch: number };
  /** Cumulative spray pattern shape. */
  recoil: { pitch: number; tau: number; yaw: number; yawFreq: number; seed: number; reset: number };
  /** Zoom field of view multipliers per scope level. Empty means no scope. */
  scope: number[];
  /** 0 none, 1 wood and thin metal, 2 more. */
  penetration: number;
  blurb: string;
}

const W = (d: Partial<WeaponDef> & Pick<WeaponDef, 'id' | 'name' | 'cls' | 'slot' | 'team' | 'price' | 'killReward' | 'damage' | 'armorPen' | 'rpm' | 'mag' | 'reserve' | 'reload' | 'speed'>): WeaponDef => ({
  rangeMod: 0.98, auto: true, draw: 0.8, pellets: 1,
  spread: { still: 0.05, move: 5, air: 9, fire: 0.2, fireMax: 1.2, recover: 2.5, crouch: 0.75 },
  recoil: { pitch: 11, tau: 6, yaw: 1.2, yawFreq: 0.6, seed: 1, reset: 0.45 },
  scope: [], penetration: 1, blurb: '', ...d,
});

export const WEAPONS: Record<string, WeaponDef> = {};
const add = (d: WeaponDef) => { WEAPONS[d.id] = d; };

add(W({
  id: 'marshal', name: 'Marshal .45', cls: 'pistol', slot: 'secondary', team: 0, price: 0, killReward: 300, damage: 35, armorPen: 0.505, rpm: 352, auto: false,
  mag: 12, reserve: 24, reload: 2.2, speed: 240 * U, rangeMod: 0.91, draw: 0.5,
  spread: { still: 0.08, move: 3.8, air: 6.5, fire: 0.9, fireMax: 3.2, recover: 5, crouch: 0.8 },
  recoil: { pitch: 2.4, tau: 2, yaw: 0.3, yawFreq: 0.8, seed: 11, reset: 0.3 }, blurb: 'Accurate starter pistol',
}));
add(W({
  id: 'viper', name: 'Viper 18', cls: 'pistol', slot: 'secondary', team: 1, price: 0, killReward: 300, damage: 30, armorPen: 0.47, rpm: 400, auto: false,
  mag: 20, reserve: 60, reload: 2.2, speed: 240 * U, rangeMod: 0.9, draw: 0.5,
  spread: { still: 0.1, move: 4.2, air: 7, fire: 0.8, fireMax: 3.4, recover: 5, crouch: 0.8 },
  recoil: { pitch: 2.1, tau: 2, yaw: 0.35, yawFreq: 0.9, seed: 12, reset: 0.3 }, blurb: 'High capacity starter pistol',
}));
add(W({
  id: 'cobra', name: 'Cobra', cls: 'pistol', slot: 'secondary', team: 2, price: 700, killReward: 300, damage: 63, armorPen: 0.932, rpm: 267, auto: false,
  mag: 7, reserve: 35, reload: 2.2, speed: 230 * U, rangeMod: 0.93, draw: 0.6,
  spread: { still: 0.12, move: 5, air: 8, fire: 1.6, fireMax: 5, recover: 3.4, crouch: 0.8 },
  recoil: { pitch: 4.6, tau: 2, yaw: 0.5, yawFreq: 0.7, seed: 13, reset: 0.4 }, penetration: 2, blurb: 'Hand cannon, one tap to the head',
}));

add(W({
  id: 'hornet', name: 'Hornet', cls: 'smg', slot: 'primary', team: 0, price: 1250, killReward: 600, damage: 26, armorPen: 0.6, rpm: 857, mag: 30, reserve: 120, reload: 2.1, speed: 240 * U, rangeMod: 0.87,
  spread: { still: 0.2, move: 3.6, air: 6, fire: 0.3, fireMax: 1.8, recover: 3, crouch: 0.75 },
  recoil: { pitch: 6.5, tau: 7, yaw: 1.4, yawFreq: 0.75, seed: 21, reset: 0.35 }, penetration: 0, blurb: 'Fast and cheap, great on eco rounds',
}));
add(W({
  id: 'wasp', name: 'Wasp', cls: 'smg', slot: 'primary', team: 1, price: 1050, killReward: 600, damage: 29, armorPen: 0.57, rpm: 800, mag: 30, reserve: 100, reload: 2.2, speed: 240 * U, rangeMod: 0.82,
  spread: { still: 0.25, move: 3.8, air: 6, fire: 0.32, fireMax: 2, recover: 3, crouch: 0.75 },
  recoil: { pitch: 7, tau: 7, yaw: 1.6, yawFreq: 0.8, seed: 22, reset: 0.35 }, penetration: 0, blurb: 'Cheap close range spray',
}));
add(W({
  id: 'mantis', name: 'Mantis', cls: 'smg', slot: 'primary', team: 2, price: 2350, killReward: 300, damage: 26, armorPen: 0.745, rpm: 857, mag: 50, reserve: 100, reload: 3.3, speed: 230 * U, rangeMod: 0.86,
  spread: { still: 0.15, move: 3.3, air: 6, fire: 0.24, fireMax: 1.5, recover: 3, crouch: 0.75 },
  recoil: { pitch: 8, tau: 9, yaw: 1.6, yawFreq: 0.5, seed: 23, reset: 0.35 }, blurb: 'Big magazine, strong armor penetration',
}));

add(W({
  id: 'vk47', name: 'VK-47', cls: 'rifle', slot: 'primary', team: 1, price: 2700, killReward: 300, damage: 36, armorPen: 0.775, rpm: 600, mag: 30, reserve: 90, reload: 2.45, speed: 215 * U, rangeMod: 0.98,
  spread: { still: 0.04, move: 5.5, air: 9, fire: 0.24, fireMax: 1.3, recover: 2.5, crouch: 0.75 },
  recoil: { pitch: 12.5, tau: 6.5, yaw: 1.5, yawFreq: 0.62, seed: 31, reset: 0.45 }, penetration: 2, blurb: 'Hard hitting rifle, one tap at range',
}));
add(W({
  id: 'carbine', name: 'Carbine A4', cls: 'rifle', slot: 'primary', team: 0, price: 3100, killReward: 300, damage: 33, armorPen: 0.7, rpm: 666, mag: 30, reserve: 90, reload: 3.1, speed: 225 * U, rangeMod: 0.97,
  spread: { still: 0.03, move: 5, air: 9, fire: 0.2, fireMax: 1.1, recover: 2.6, crouch: 0.72 },
  recoil: { pitch: 9.5, tau: 6, yaw: 0.9, yawFreq: 0.55, seed: 32, reset: 0.45 }, penetration: 2, blurb: 'Smooth spray, easy to control',
}));
add(W({
  id: 'reaper', name: 'Reaper', cls: 'rifle', slot: 'primary', team: 1, price: 1800, killReward: 300, damage: 30, armorPen: 0.7, rpm: 666, mag: 35, reserve: 90, reload: 2.9, speed: 215 * U, rangeMod: 0.98,
  spread: { still: 0.05, move: 5.5, air: 9, fire: 0.22, fireMax: 1.3, recover: 2.5, crouch: 0.75 },
  recoil: { pitch: 10, tau: 6, yaw: 1.2, yawFreq: 0.6, seed: 33, reset: 0.45 }, penetration: 1, blurb: 'Budget rifle for force buys',
}));
add(W({
  id: 'ranger', name: 'Ranger', cls: 'rifle', slot: 'primary', team: 0, price: 2050, killReward: 300, damage: 30, armorPen: 0.7, rpm: 666, mag: 25, reserve: 90, reload: 3.3, speed: 220 * U, rangeMod: 0.98,
  spread: { still: 0.05, move: 5.2, air: 9, fire: 0.22, fireMax: 1.3, recover: 2.5, crouch: 0.75 },
  recoil: { pitch: 9, tau: 6, yaw: 1, yawFreq: 0.6, seed: 34, reset: 0.45 }, penetration: 1, blurb: 'Budget rifle for force buys',
}));

add(W({
  id: 'scout', name: 'Longshot', cls: 'sniper', slot: 'primary', team: 2, price: 1700, killReward: 300, damage: 88, armorPen: 0.85, rpm: 48, auto: false, mag: 10, reserve: 90, reload: 2.6, speed: 230 * U, rangeMod: 0.99,
  spread: { still: 4.8, move: 7, air: 14, fire: 0, fireMax: 0, recover: 4, crouch: 0.8 }, scope: [0.4], draw: 1,
  recoil: { pitch: 2.5, tau: 1, yaw: 0, yawFreq: 0, seed: 41, reset: 0.5 }, penetration: 2, blurb: 'Cheap bolt rifle, one shot to the head',
}));
add(W({
  id: 'bolt50', name: 'Bolt 50', cls: 'sniper', slot: 'primary', team: 2, price: 4750, killReward: 100, damage: 115, armorPen: 0.975, rpm: 41, auto: false, mag: 10, reserve: 30, reload: 3.7, speed: 200 * U, rangeMod: 0.99,
  spread: { still: 6, move: 9, air: 16, fire: 0, fireMax: 0, recover: 4, crouch: 0.8 }, scope: [0.4, 0.15], draw: 1.2,
  recoil: { pitch: 3, tau: 1, yaw: 0, yawFreq: 0, seed: 42, reset: 0.5 }, penetration: 2, blurb: 'Heavy sniper, one shot to the body',
}));

add(W({
  id: 'pump12', name: 'Pump 12', cls: 'shotgun', slot: 'primary', team: 2, price: 1050, killReward: 900, damage: 26, armorPen: 0.5, rpm: 70, auto: false, mag: 8, reserve: 32, reload: 0.5, speed: 220 * U, rangeMod: 0.7, pellets: 9,
  spread: { still: 2.8, move: 3.4, air: 4.5, fire: 0, fireMax: 0, recover: 4, crouch: 0.85 },
  recoil: { pitch: 4, tau: 1, yaw: 0.4, yawFreq: 0.5, seed: 51, reset: 0.5 }, penetration: 0, blurb: 'Brutal at close range',
}));

add(W({
  id: 'knife', name: 'Knife', cls: 'knife', slot: 'knife', team: 2, price: 0, killReward: 1500, damage: 40, armorPen: 0.85, rpm: 120, auto: true, mag: 0, reserve: 0, reload: 0, speed: 250 * U, draw: 0.5, penetration: 0,
  spread: { still: 0, move: 0, air: 0, fire: 0, fireMax: 0, recover: 1, crouch: 1 }, recoil: { pitch: 0, tau: 1, yaw: 0, yawFreq: 0, seed: 0, reset: 0.1 },
}));

export const KNIFE_RANGE = 1.9;

export interface GrenadeDef { id: GrenadeKind; name: string; price: number; max: number }
export const GRENADES: Record<GrenadeKind, GrenadeDef> = {
  flash: { id: 'flash', name: 'Flashbang', price: 200, max: 2 },
  smoke: { id: 'smoke', name: 'Smoke', price: 300, max: 1 },
  he: { id: 'he', name: 'HE Grenade', price: 300, max: 1 },
  fire: { id: 'fire', name: 'Fire Grenade', price: 400, max: 1 },
};
export const GRENADE_ORDER: GrenadeKind[] = ['flash', 'smoke', 'he', 'fire'];

export const cycleTime = (d: WeaponDef) => 60 / d.rpm;

export const PATTERN_LEN = 40;

const patternCache = new Map<string, Array<[number, number]>>();

/** Cumulative [pitch, yaw] punch in degrees for bullet n (0 based). Bullet 0 is always pin accurate. Deterministic per weapon. */
export function sprayPattern(d: WeaponDef): Array<[number, number]> {
  const hit = patternCache.get(d.id);
  if (hit) return hit;
  const rng = new Rng(d.recoil.seed * 977 + 13);
  const out: Array<[number, number]> = [];
  let walk = 0;
  const phase = rng.range(0, Math.PI * 2);
  for (let n = 0; n < PATTERN_LEN; n++) {
    const r = d.recoil;
    const pitch = r.pitch * (1 - Math.exp(-n / r.tau)) + (n > r.tau * 2 ? Math.min(2, (n - r.tau * 2) * 0.03) : 0);
    walk += rng.range(-0.35, 0.35) * r.yaw * Math.min(1, n / 8);
    const sway = Math.sin(n * r.yawFreq + phase) * r.yaw * Math.min(1, Math.max(0, (n - 3) / 8));
    out.push([pitch, sway + walk]);
  }
  patternCache.set(d.id, out);
  return out;
}

export function weaponsFor(team: 0 | 1, slot?: 'primary' | 'secondary'): WeaponDef[] {
  return Object.values(WEAPONS).filter((w) => w.slot !== 'knife' && (w.team === 2 || w.team === team) && (!slot || w.slot === slot));
}

/** Damage after distance falloff. */
export function falloff(d: WeaponDef, dist: number) {
  return Math.pow(d.rangeMod, dist / 12.7);
}
