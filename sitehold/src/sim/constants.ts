/** All tunables in one place. Units are metres and seconds (Source units x 0.0254). */
export const U = 0.0254;
export const TICK_RATE = 64;
export const DT = 1 / TICK_RATE;

export const TEAM_SENTINEL = 0; // defend, counter terrorist role
export const TEAM_BREACHER = 1; // attack, terrorist role
export type Team = 0 | 1;

export const TEAM_NAMES = ['Sentinels', 'Breachers'] as const;

export const MOVE = {
  maxSpeed: 250 * U,
  accel: 5.5,
  friction: 5.2,
  stopSpeed: 80 * U,
  airAccel: 12,
  airCap: 30 * U,
  gravity: 800 * U,
  jump: 301.99 * U,
  terminal: 25,
  walkFrac: 0.52,
  crouchFrac: 0.34,
  radius: 0.4,
  heightStand: 1.83,
  heightCrouch: 1.37,
  eyeStand: 1.63,
  eyeCrouch: 1.17,
  step: 0.46,
  landingSlow: 0.88,
  fallSafe: 11.9,
  fallDamage: 8,
  /** speed above which footsteps are audible (CS: running, not walking) */
  stepNoiseSpeed: 135 * U,
  stepInterval: 0.38,
} as const;

export const ROUND = {
  freeze: 12,
  time: 115,
  bomb: 40,
  plant: 3.2,
  defuse: 10,
  defuseKit: 5,
  end: 5,
  winsNeeded: 8,
  maxRounds: 14,
  swapAfter: 7,
  startMoney: 800,
  maxMoney: 16000,
  suddenDeathMoney: 10000,
  useRange: 1.9,
  halftime: 6,
} as const;

export const ECON = {
  winElim: 3250,
  winBomb: 3500,
  lossBonus: [1400, 1900, 2400, 2900, 3400],
  plantTeam: 800,
  plantPlayer: 300,
  defusePlayer: 300,
  kevlar: 650,
  helmet: 1000,
  kit: 400,
} as const;

export const HITBOX_MUL = { head: 4, chest: 1, stomach: 1.25, arm: 1, leg: 0.75 } as const;
export type HitGroup = keyof typeof HITBOX_MUL;

export const GRENADE = {
  gravity: 20.3,
  bounce: 0.42,
  friction: 0.7,
  fuse: 1.6,
  radius: 0.09,
  throwSpeed: 17,
  smokeRadius: 3.7,
  smokeTime: 18,
  smokeBloom: 0.9,
  flashRange: 40,
  heRadius: 9.5,
  heDamage: 98,
  fireRadius: 2.9,
  fireTime: 7,
  fireDps: 32,
  maxCarry: 4,
} as const;

export const BOT_LEVELS = [
  { name: 'Easy', reaction: 0.42, aimErr: 4.2, turn: 260, sprayControl: 0.15, headBias: 0.2, stopDisc: 0.55, util: 0.25, hearing: 0.6, blindFire: 0.5 },
  { name: 'Normal', reaction: 0.3, aimErr: 2.6, turn: 420, sprayControl: 0.5, headBias: 0.45, stopDisc: 0.8, util: 0.6, hearing: 0.85, blindFire: 0.4 },
  { name: 'Hard', reaction: 0.23, aimErr: 1.5, turn: 650, sprayControl: 0.8, headBias: 0.65, stopDisc: 0.95, util: 0.9, hearing: 1, blindFire: 0.3 },
  { name: 'Expert', reaction: 0.18, aimErr: 0.8, turn: 900, sprayControl: 0.95, headBias: 0.85, stopDisc: 1, util: 1, hearing: 1.1, blindFire: 0.2 },
] as const;
