import { MOVE, type Team } from './constants.ts';
import type { GrenadeKind, WeaponDef } from './weapons.ts';
import { WEAPONS } from './weapons.ts';
import { v3, type Vec3 } from './math.ts';

export type SlotName = 'primary' | 'secondary' | 'knife' | 'grenade' | 'bomb';

export interface WeaponState { def: WeaponDef; ammo: number; reserve: number }

/** One tick of input for any actor, human or bot. */
export interface Cmd {
  fwd: number; side: number;
  yaw: number; pitch: number;
  fire: boolean; alt: boolean;
  jump: boolean; crouch: boolean; walk: boolean;
  use: boolean;
  reload: boolean;
  /** Edge triggered, cleared by the sim after use. */
  select: SlotName | null;
  nextGrenade: boolean;
  drop: boolean;
  lastWeapon: boolean;
}

export const newCmd = (): Cmd => ({
  fwd: 0, side: 0, yaw: 0, pitch: 0, fire: false, alt: false, jump: false, crouch: false, walk: false, use: false,
  reload: false, select: null, nextGrenade: false, drop: false, lastWeapon: false,
});

export interface Stats { kills: number; deaths: number; assists: number; damage: number; score: number; mvps: number; headshots: number }

export interface Actor {
  id: number;
  name: string;
  team: Team;
  isBot: boolean;
  isHuman: boolean;
  /** Which of the two original squads this actor belongs to, stays fixed when sides swap. */
  grp: 0 | 1;
  alive: boolean;
  pos: Vec3;
  prev: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  prevYaw: number;
  onGround: boolean;
  crouching: boolean;
  /** 0 standing, 1 fully crouched, eased for the eye height. */
  crouchAmt: number;
  jumpHeld: boolean;
  jumpBuffer: number;
  fallSpeed: number;
  health: number;
  armor: number;
  helmet: boolean;
  kit: boolean;
  money: number;
  primary: WeaponState | null;
  secondary: WeaponState | null;
  grenades: Record<GrenadeKind, number>;
  hasBomb: boolean;
  cur: SlotName;
  last: SlotName;
  grenadeSel: GrenadeKind | null;
  // weapon timing, all in sim seconds
  nextAttack: number;
  reloadEnd: number;
  drawEnd: number;
  lastShot: number;
  shotIndex: number;
  inaccuracy: number;
  punchP: number;
  punchY: number;
  scope: number;
  scopeLatch: boolean;
  pinPulled: number; // time pin was pulled, 0 when not holding a grenade
  pinPower: number;
  fireAcc: number;
  throwCooldown: number;
  attackHeld: boolean;
  altHeld: boolean;
  // objectives
  planting: number;
  defusing: number;
  useHeld: boolean;
  // flash
  flashEnd: number;
  flashFull: number;
  // misc
  stepTimer: number;
  lastNoise: number;
  stats: Stats;
  roundDamage: number;
  roundKills: number;
  damagedBy: Map<number, number>;
  cmd: Cmd;
  spawn: number;
  /** Time of last damage taken for hit effects. */
  hurtTime: number;
  hurtDir: number;
  deathTime: number;
  killedBy: number;
  spawnProtect: number;
}

export const newStats = (): Stats => ({ kills: 0, deaths: 0, assists: 0, damage: 0, score: 0, mvps: 0, headshots: 0 });

export function newActor(id: number, name: string, team: Team, isBot: boolean, isHuman = false): Actor {
  return {
    id, name, team, isBot, isHuman, grp: team, alive: false,
    pos: v3(), prev: v3(), vel: v3(), yaw: 0, pitch: 0, prevYaw: 0,
    onGround: true, crouching: false, crouchAmt: 0, jumpHeld: false, jumpBuffer: 0, fallSpeed: 0,
    health: 100, armor: 0, helmet: false, kit: false, money: 800,
    primary: null, secondary: null, grenades: { flash: 0, smoke: 0, he: 0, fire: 0 }, hasBomb: false,
    cur: 'secondary', last: 'knife', grenadeSel: null,
    nextAttack: 0, reloadEnd: 0, drawEnd: 0, lastShot: -10, shotIndex: 0, inaccuracy: 0, punchP: 0, punchY: 0, scope: 0, scopeLatch: false,
    pinPulled: 0, pinPower: 1, fireAcc: 0, throwCooldown: 0, attackHeld: false, altHeld: false,
    planting: 0, defusing: 0, useHeld: false, flashEnd: 0, flashFull: 0, stepTimer: 0, lastNoise: 0,
    stats: newStats(), roundDamage: 0, roundKills: 0, damagedBy: new Map(), cmd: newCmd(), spawn: 0,
    hurtTime: -10, hurtDir: 0, deathTime: -10, killedBy: -1, spawnProtect: 0,
  };
}

export function mkWeapon(id: string): WeaponState {
  const def = WEAPONS[id];
  return { def, ammo: def.mag, reserve: def.reserve };
}

export function currentWeapon(a: Actor): WeaponState | null {
  switch (a.cur) {
    case 'primary': return a.primary;
    case 'secondary': return a.secondary;
    case 'knife': return { def: WEAPONS.knife, ammo: 0, reserve: 0 };
    default: return null;
  }
}

export const curDef = (a: Actor): WeaponDef | null => currentWeapon(a)?.def ?? null;

export const hullHeight = (a: Actor) => (a.crouching ? MOVE.heightCrouch : MOVE.heightStand);
export const eyeHeight = (a: Actor) => MOVE.eyeStand + (MOVE.eyeCrouch - MOVE.eyeStand) * a.crouchAmt;

export const eyePos = (a: Actor, out: Vec3 = v3()): Vec3 => {
  out.x = a.pos.x; out.y = a.pos.y + eyeHeight(a); out.z = a.pos.z;
  return out;
};

/** Max ground speed for this actor right now, in m/s. */
export function maxSpeedOf(a: Actor): number {
  let base: number;
  if (a.cur === 'grenade' || a.cur === 'bomb') base = MOVE.maxSpeed * 0.96;
  else base = curDef(a)?.speed ?? MOVE.maxSpeed;
  if (a.scope > 0) base *= 0.72;
  return base;
}

export const hasPrimary = (a: Actor) => a.primary !== null;
export const grenadeCount = (a: Actor) => a.grenades.flash + a.grenades.smoke + a.grenades.he + a.grenades.fire;
