/**
 * Champion definitions. All characters, names and ability names are original to LANEFALL.
 * Ability numbers are arrays indexed by rank (rank 1 is index 0).
 */
import type { HitEffect, Role, Stats } from '../sim/types.ts';

export type AbilityKind = 'skillshot' | 'target' | 'ground' | 'self' | 'nova' | 'dash' | 'blink';
export type Targeting = 'point' | 'unit' | 'self';

export interface AbilityDef {
  name: string;
  desc: string;
  icon: string;
  kind: AbilityKind;
  targeting: Targeting;
  cooldown: number[];
  mana: number[];
  /** Cast range. For skillshots this is the travel distance, for dashes the max distance. */
  range: number;
  /** Skillshot projectile speed. */
  speed?: number;
  /** Skillshot half width (collision radius). */
  width?: number;
  pierce?: boolean;
  /** Radius of ground / nova / dash-arrival areas. */
  radius?: number;
  /** Delay before a ground zone triggers. */
  delay?: number;
  dashSpeed?: number;
  /** Dash damages enemies along its path instead of at the end. */
  pathHit?: boolean;
  /** Effects applied to enemies hit. */
  effects: HitEffect[];
  /** Effects applied to the caster when the ability is used. */
  selfEffects?: HitEffect[];
  color: number;
  /** Extra tooltip line describing the damage. */
  tip?: string;
}

export type PassiveDef =
  | { type: 'stackOnHit'; name: string; desc: string; stat: 'armor' | 'as' | 'ad' | 'mr'; perStack: number; pct: boolean; max: number; duration: number }
  | { type: 'onCastBuff'; name: string; desc: string; stat: 'ms'; amount: number; duration: number }
  | { type: 'damageReduction'; name: string; desc: string; amount: number }
  | { type: 'lowHpBonus'; name: string; desc: string; below: number; mult: number };

export interface ChampionDef {
  id: string;
  name: string;
  title: string;
  role: Role;
  blurb: string;
  melee: boolean;
  radius: number;
  height: number;
  projectileSpeed: number;
  base: Stats;
  /** Per level growth, added (level - 1) times. */
  growth: Partial<Stats>;
  /** Attack speed growth is a fraction of base per level. */
  asGrowthPct: number;
  passive: PassiveDef;
  abilities: [AbilityDef, AbilityDef, AbilityDef, AbilityDef];
  look: { primary: number; secondary: number; accent: number; build: 'brute' | 'robe' | 'archer' | 'golem' | 'rogue' };
  /** Preferred lane for bots. */
  laneHint: 'top' | 'mid' | 'bot' | 'roam';
  /** Bot item build in order. */
  build: string[];
  /** Order in which a bot levels abilities (slot indexes, ult handled separately). */
  levelOrder: number[];
}

const stats = (s: Partial<Stats>): Stats => ({
  maxHp: 600,
  maxMana: 300,
  ad: 60,
  ap: 0,
  armor: 30,
  mr: 32,
  as: 0.65,
  ms: 6.6,
  range: 3.5,
  hpRegen: 1.7,
  manaRegen: 1.7,
  haste: 0,
  lifesteal: 0,
  ...s,
});

const R3 = (a: number, b: number, c: number) => [a, b, c];
const R5 = (a: number, b: number, c: number, d: number, e: number) => [a, b, c, d, e];

export const CHAMPIONS: Record<string, ChampionDef> = {
  ironvow: {
    id: 'ironvow',
    name: 'Ironvow',
    title: 'the Oathbreaker',
    role: 'fighter',
    blurb: 'A relentless front-line bruiser. Leaps in, shields up, and refuses to die.',
    melee: true,
    radius: 1.45,
    height: 4.6,
    projectileSpeed: 0,
    base: stats({ maxHp: 640, maxMana: 300, ad: 64, armor: 36, mr: 32, as: 0.66, ms: 6.7, range: 1.7, hpRegen: 2.1, manaRegen: 1.6 }),
    growth: { maxHp: 105, maxMana: 38, ad: 3.4, armor: 3.8, mr: 1.3, hpRegen: 0.12, manaRegen: 0.08 },
    asGrowthPct: 0.022,
    passive: { type: 'stackOnHit', name: 'Grit', desc: 'Hitting enemy champions grants stacking armor (up to 5 stacks).', stat: 'armor', perStack: 5, pct: false, max: 5, duration: 4 },
    abilities: [
      {
        name: 'Breaker’s Lunge',
        desc: 'Lunge forward and slam the ground on landing, damaging enemies.',
        icon: 'lunge',
        kind: 'dash',
        targeting: 'point',
        cooldown: R5(9, 8.5, 8, 7.5, 7),
        mana: R5(40, 42, 44, 46, 48),
        range: 9,
        dashSpeed: 42,
        radius: 4,
        effects: [{ type: 'damage', dmgType: 'physical', base: R5(70, 110, 150, 190, 230), bonusAd: 0.8 }],
        color: 0xffa040,
      },
      {
        name: 'Bulwark Oath',
        desc: 'Raise a shield and gain move speed for a short time.',
        icon: 'shield',
        kind: 'self',
        targeting: 'self',
        cooldown: R5(14, 13, 12, 11, 10),
        mana: R5(50, 50, 50, 50, 50),
        range: 0,
        effects: [],
        selfEffects: [
          { type: 'shield', base: R5(90, 130, 170, 210, 250), bonusAd: 0.6, duration: 3 },
          { type: 'buff', stat: 'ms', pct: true, amount: 0.2, duration: 2 },
        ],
        color: 0xc8d4e0,
      },
      {
        name: 'Quakeline',
        desc: 'Stomp the ground, damaging and slowing nearby enemies.',
        icon: 'quake',
        kind: 'nova',
        targeting: 'self',
        cooldown: R5(8, 7.5, 7, 6.5, 6),
        mana: R5(45, 50, 55, 60, 65),
        range: 0,
        radius: 7,
        effects: [
          { type: 'damage', dmgType: 'physical', base: R5(60, 95, 130, 165, 200), bonusAd: 0.7 },
          { type: 'slow', amount: 0.35, duration: 1.5 },
        ],
        color: 0xd08040,
      },
      {
        name: 'Iron Verdict',
        desc: 'Leap onto an enemy champion, knocking up and damaging everyone around the landing.',
        icon: 'leap',
        kind: 'dash',
        targeting: 'unit',
        cooldown: R3(100, 85, 70),
        mana: R3(100, 100, 100),
        range: 22,
        dashSpeed: 50,
        radius: 5.5,
        effects: [
          { type: 'damage', dmgType: 'physical', base: R3(200, 330, 460), bonusAd: 1.0 },
          { type: 'stun', duration: 1, tag: 'airborne' },
        ],
        color: 0xff5030,
      },
    ],
    look: { primary: 0x8a8f99, secondary: 0x5a3a28, accent: 0xff9a3c, build: 'brute' },
    laneHint: 'top',
    build: ['boots', 'warblade', 'steelvest', 'doomreaver', 'bastionheart', 'stormbow'],
    levelOrder: [0, 2, 1, 0, 2, 0, 2, 0, 2, 1, 1, 1],
  },

  ysolde: {
    id: 'ysolde',
    name: 'Ysolde',
    title: 'the Ember Scholar',
    role: 'mage',
    blurb: 'A glass-cannon archmage. Long range poke, a slowing field and a devastating meteor.',
    melee: false,
    radius: 1.2,
    height: 4.4,
    projectileSpeed: 32,
    base: stats({ maxHp: 545, maxMana: 430, ad: 52, armor: 22, mr: 30, as: 0.64, ms: 6.5, range: 10.5, hpRegen: 1.4, manaRegen: 2.2 }),
    growth: { maxHp: 86, maxMana: 52, ad: 2.7, armor: 3.0, mr: 1.3, hpRegen: 0.08, manaRegen: 0.14 },
    asGrowthPct: 0.02,
    passive: { type: 'onCastBuff', name: 'Spellweave', desc: 'Casting an ability grants a burst of move speed.', stat: 'ms', amount: 0.2, duration: 1.5 },
    abilities: [
      {
        name: 'Ember Lance',
        desc: 'Fire a bolt of flame that damages the first enemy hit.',
        icon: 'lance',
        kind: 'skillshot',
        targeting: 'point',
        cooldown: R5(6.5, 6, 5.5, 5, 4.5),
        mana: R5(55, 60, 65, 70, 75),
        range: 22,
        speed: 42,
        width: 1.5,
        effects: [{ type: 'damage', dmgType: 'magic', base: R5(70, 110, 150, 190, 230), ap: 0.75 }],
        color: 0xff6a2a,
      },
      {
        name: 'Frost Bloom',
        desc: 'Conjure a field of frost that damages and heavily slows after a short delay.',
        icon: 'bloom',
        kind: 'ground',
        targeting: 'point',
        cooldown: R5(12, 11.5, 11, 10.5, 10),
        mana: R5(70, 75, 80, 85, 90),
        range: 20,
        radius: 6,
        delay: 0.55,
        effects: [
          { type: 'damage', dmgType: 'magic', base: R5(60, 100, 140, 180, 220), ap: 0.6 },
          { type: 'slow', amount: 0.45, duration: 2 },
        ],
        color: 0x6ad0ff,
      },
      {
        name: 'Mirror Step',
        desc: 'Blink a short distance and gain a small shield.',
        icon: 'blink',
        kind: 'blink',
        targeting: 'point',
        cooldown: R5(14, 13, 12, 11, 10),
        mana: R5(50, 50, 50, 50, 50),
        range: 9,
        effects: [],
        selfEffects: [{ type: 'shield', base: R5(50, 75, 100, 125, 150), ap: 0.3, duration: 2 }],
        color: 0xc690ff,
      },
      {
        name: 'Cataclysm',
        desc: 'Call down a meteor on an area, dealing massive damage and stunning briefly.',
        icon: 'meteor',
        kind: 'ground',
        targeting: 'point',
        cooldown: R3(110, 95, 80),
        mana: R3(120, 120, 120),
        range: 28,
        radius: 9,
        delay: 1.1,
        effects: [
          { type: 'damage', dmgType: 'magic', base: R3(220, 340, 460), ap: 0.85 },
          { type: 'stun', duration: 0.6 },
        ],
        color: 0xff3a20,
      },
    ],
    look: { primary: 0x6a3fb0, secondary: 0x2a1a50, accent: 0xff7a30, build: 'robe' },
    laneHint: 'mid',
    build: ['boots', 'arcanerod', 'amptome', 'archmagecrown', 'spiritaegis', 'archmagecrown'],
    levelOrder: [0, 1, 0, 2, 0, 1, 0, 1, 1, 2, 2, 2],
  },

  kestrel: {
    id: 'kestrel',
    name: 'Kestrel',
    title: 'the Windstring',
    role: 'marksman',
    blurb: 'A fast ranged hunter that melts targets with attack speed and one very long arrow.',
    melee: false,
    radius: 1.2,
    height: 4.4,
    projectileSpeed: 38,
    base: stats({ maxHp: 565, maxMana: 285, ad: 60, armor: 26, mr: 30, as: 0.7, ms: 6.5, range: 12, hpRegen: 1.4, manaRegen: 1.5 }),
    growth: { maxHp: 88, maxMana: 35, ad: 3.0, armor: 3.4, mr: 1.25, hpRegen: 0.08, manaRegen: 0.08 },
    asGrowthPct: 0.03,
    passive: { type: 'stackOnHit', name: 'Keen Eye', desc: 'Consecutive basic attacks grant stacking attack speed.', stat: 'as', perStack: 0.07, pct: true, max: 5, duration: 3 },
    abilities: [
      {
        name: 'Rapid Volley',
        desc: 'Gain a large burst of attack speed.',
        icon: 'volley',
        kind: 'self',
        targeting: 'self',
        cooldown: R5(14, 13, 12, 11, 10),
        mana: R5(40, 40, 40, 40, 40),
        range: 0,
        effects: [],
        selfEffects: [{ type: 'buff', stat: 'as', pct: true, amounts: R5(0.5, 0.6, 0.7, 0.8, 0.9), duration: 4 }],
        color: 0x7ae070,
      },
      {
        name: 'Piercing Bolt',
        desc: 'Loose a bolt that pierces enemies, damaging and slowing them.',
        icon: 'bolt',
        kind: 'skillshot',
        targeting: 'point',
        cooldown: R5(9, 8.5, 8, 7.5, 7),
        mana: R5(60, 65, 70, 75, 80),
        range: 26,
        speed: 52,
        width: 1.4,
        pierce: true,
        effects: [
          { type: 'damage', dmgType: 'physical', base: R5(60, 100, 140, 180, 220), bonusAd: 0.9 },
          { type: 'slow', amount: 0.3, duration: 1.5 },
        ],
        color: 0xb8ff90,
      },
      {
        name: 'Backflip',
        desc: 'Dash in the aimed direction and gain move speed.',
        icon: 'flip',
        kind: 'dash',
        targeting: 'point',
        cooldown: R5(16, 15, 14, 13, 12),
        mana: R5(40, 40, 40, 40, 40),
        range: 8,
        dashSpeed: 40,
        effects: [],
        selfEffects: [{ type: 'buff', stat: 'ms', pct: true, amount: 0.25, duration: 1.5 }],
        color: 0x90e0c0,
      },
      {
        name: 'Skyfall Arrow',
        desc: 'Fire an enormous arrow across the map. Damages and slows every enemy it passes through.',
        icon: 'arrow',
        kind: 'skillshot',
        targeting: 'point',
        cooldown: R3(100, 85, 70),
        mana: R3(100, 100, 100),
        range: 70,
        speed: 55,
        width: 2.2,
        pierce: true,
        effects: [
          { type: 'damage', dmgType: 'physical', base: R3(250, 400, 550), bonusAd: 1.3 },
          { type: 'slow', amount: 0.6, duration: 2 },
        ],
        color: 0xfff08a,
      },
    ],
    look: { primary: 0x2f8f6a, secondary: 0x1c4a3a, accent: 0xe8d85a, build: 'archer' },
    laneHint: 'bot',
    build: ['boots', 'rapidgear', 'quickfireblade', 'stormbow', 'doomreaver', 'bastionheart'],
    levelOrder: [1, 0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 2],
  },

  oakhelm: {
    id: 'oakhelm',
    name: 'Oakhelm',
    title: 'the Rootwarden',
    role: 'tank',
    blurb: 'A walking fortress of bark and stone. Locks enemies down and shrugs off damage.',
    melee: true,
    radius: 1.7,
    height: 5.2,
    projectileSpeed: 0,
    base: stats({ maxHp: 690, maxMana: 285, ad: 58, armor: 40, mr: 34, as: 0.6, ms: 6.5, range: 1.8, hpRegen: 2.4, manaRegen: 1.6 }),
    growth: { maxHp: 112, maxMana: 38, ad: 3.0, armor: 4.2, mr: 1.5, hpRegen: 0.14, manaRegen: 0.08 },
    asGrowthPct: 0.018,
    passive: { type: 'damageReduction', name: 'Thick Skin', desc: 'Takes 8% less damage from all sources.', amount: 0.08 },
    abilities: [
      {
        name: 'Rootbind',
        desc: 'Hurl a tangle of roots that damages and stuns the first enemy hit.',
        icon: 'roots',
        kind: 'skillshot',
        targeting: 'point',
        cooldown: R5(12, 11.5, 11, 10.5, 10),
        mana: R5(60, 60, 60, 60, 60),
        range: 15,
        speed: 34,
        width: 1.9,
        effects: [
          { type: 'damage', dmgType: 'magic', base: R5(50, 85, 120, 155, 190), ap: 0, bonusAd: 0.6 },
          { type: 'stun', duration: 1 },
        ],
        color: 0x6aa050,
      },
      {
        name: 'Bark Armor',
        desc: 'Gain a shield and bonus armor for a few seconds.',
        icon: 'bark',
        kind: 'self',
        targeting: 'self',
        cooldown: R5(15, 14, 13, 12, 11),
        mana: R5(60, 60, 60, 60, 60),
        range: 0,
        effects: [],
        selfEffects: [
          { type: 'shield', base: R5(80, 120, 160, 200, 240), ownMaxHpPct: 0.08, duration: 4 },
          { type: 'buff', stat: 'armor', amounts: R5(20, 30, 40, 50, 60), duration: 4 },
        ],
        color: 0x8a6a3a,
      },
      {
        name: 'Stomp',
        desc: 'Slam the ground, damaging and slowing nearby enemies. Scales with your max health.',
        icon: 'stomp',
        kind: 'nova',
        targeting: 'self',
        cooldown: R5(9, 8.5, 8, 7.5, 7),
        mana: R5(50, 50, 50, 50, 50),
        range: 0,
        radius: 8,
        effects: [
          { type: 'damage', dmgType: 'magic', base: R5(50, 80, 110, 140, 170), ownMaxHpPct: 0.06 },
          { type: 'slow', amount: 0.4, duration: 2 },
        ],
        color: 0x9a8a60,
      },
      {
        name: 'Landslide',
        desc: 'Bring the earth down on a target area, knocking up all enemies caught in it.',
        icon: 'slide',
        kind: 'ground',
        targeting: 'point',
        cooldown: R3(110, 95, 80),
        mana: R3(100, 100, 100),
        range: 14,
        radius: 8.5,
        delay: 0.45,
        effects: [
          { type: 'damage', dmgType: 'magic', base: R3(150, 250, 350), ownMaxHpPct: 0.08 },
          { type: 'stun', duration: 1.4, tag: 'airborne' },
        ],
        color: 0xb09050,
      },
    ],
    look: { primary: 0x5a7a3a, secondary: 0x6b5a46, accent: 0xa6e07a, build: 'golem' },
    laneHint: 'bot',
    build: ['boots', 'steelvest', 'vitalgem', 'bastionheart', 'spiritaegis', 'titancore'],
    levelOrder: [0, 2, 1, 0, 2, 0, 2, 0, 2, 1, 1, 1],
  },

  sable: {
    id: 'sable',
    name: 'Sable',
    title: 'the Gloam Blade',
    role: 'assassin',
    blurb: 'A shadow that picks off the wounded. Dives in with huge burst, then vanishes.',
    melee: true,
    radius: 1.2,
    height: 4.3,
    projectileSpeed: 0,
    base: stats({ maxHp: 565, maxMana: 300, ad: 62, armor: 28, mr: 32, as: 0.68, ms: 7, range: 1.5, hpRegen: 1.5, manaRegen: 1.8 }),
    growth: { maxHp: 92, maxMana: 40, ad: 3.3, armor: 3.5, mr: 1.25, hpRegen: 0.1, manaRegen: 0.1 },
    asGrowthPct: 0.03,
    passive: { type: 'lowHpBonus', name: 'Opportunist', desc: 'Deals 20% more damage to enemies below 40% health.', below: 0.4, mult: 1.2 },
    abilities: [
      {
        name: 'Venom Dart',
        desc: 'Throw a dart that damages and slows the first enemy hit.',
        icon: 'dart',
        kind: 'skillshot',
        targeting: 'point',
        cooldown: R5(7, 6.5, 6, 5.5, 5),
        mana: R5(40, 42, 44, 46, 48),
        range: 18,
        speed: 46,
        width: 1.2,
        effects: [
          { type: 'damage', dmgType: 'physical', base: R5(60, 95, 130, 165, 200), bonusAd: 0.9 },
          { type: 'slow', amount: 0.3, duration: 1.5 },
        ],
        color: 0xc050c0,
      },
      {
        name: 'Shadowstep',
        desc: 'Teleport behind an enemy and strike them for damage.',
        icon: 'step',
        kind: 'dash',
        targeting: 'unit',
        cooldown: R5(10, 9.5, 9, 8.5, 8),
        mana: R5(50, 50, 50, 50, 50),
        range: 14,
        dashSpeed: 60,
        radius: 3,
        effects: [{ type: 'damage', dmgType: 'physical', base: R5(70, 110, 150, 190, 230), bonusAd: 0.8 }],
        color: 0x8030a0,
      },
      {
        name: 'Smoke Veil',
        desc: 'Dash away in a cloud of smoke and gain move speed.',
        icon: 'veil',
        kind: 'dash',
        targeting: 'point',
        cooldown: R5(16, 15, 14, 13, 12),
        mana: R5(40, 40, 40, 40, 40),
        range: 9,
        dashSpeed: 44,
        effects: [],
        selfEffects: [{ type: 'buff', stat: 'ms', pct: true, amount: 0.4, duration: 2 }],
        color: 0x606080,
      },
      {
        name: 'Death Mark',
        desc: 'Dive an enemy champion for huge damage. Executes below 30% health.',
        icon: 'mark',
        kind: 'dash',
        targeting: 'unit',
        cooldown: R3(90, 75, 60),
        mana: R3(100, 100, 100),
        range: 18,
        dashSpeed: 70,
        radius: 2.5,
        effects: [{ type: 'damage', dmgType: 'physical', base: R3(200, 320, 440), bonusAd: 1.4, executeBelow: 0.3, executeMult: 1.5 }],
        color: 0xff2060,
      },
    ],
    look: { primary: 0x25202e, secondary: 0x4a2a5a, accent: 0xff3a90, build: 'rogue' },
    laneHint: 'roam',
    build: ['boots', 'warblade', 'quickfireblade', 'doomreaver', 'bastionheart', 'stormbow'],
    levelOrder: [0, 1, 2, 0, 1, 0, 1, 0, 1, 2, 2, 2],
  },
};

export const CHAMPION_IDS = Object.keys(CHAMPIONS);
