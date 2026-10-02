/** Minion, structure and jungle monster definitions. */
import type { DmgType, MinionType } from '../sim/types.ts';

export interface MinionDef {
  type: MinionType;
  name: string;
  hp: number;
  ad: number;
  armor: number;
  mr: number;
  /** Attacks per second. */
  as: number;
  ms: number;
  range: number;
  radius: number;
  height: number;
  projectileSpeed: number;
  dmgType: DmgType;
  gold: number;
  xp: number;
  aggro: number;
}

export const MINIONS: Record<MinionType, MinionDef> = {
  melee: { type: 'melee', name: 'Vanguard', hp: 480, ad: 14, armor: 0, mr: 0, as: 1.0, ms: 6, range: 1.4, radius: 0.95, height: 2.5, projectileSpeed: 0, dmgType: 'physical', gold: 21, xp: 62, aggro: 8 },
  caster: { type: 'caster', name: 'Spellbinder', hp: 300, ad: 22, armor: 0, mr: 0, as: 0.9, ms: 6, range: 8, radius: 0.85, height: 2.4, projectileSpeed: 24, dmgType: 'magic', gold: 14, xp: 32, aggro: 9 },
  cannon: { type: 'cannon', name: 'Siege Golem', hp: 900, ad: 38, armor: 8, mr: 8, as: 0.8, ms: 5.6, range: 9, radius: 1.35, height: 3.2, projectileSpeed: 20, dmgType: 'physical', gold: 42, xp: 92, aggro: 9 },
  super: { type: 'super', name: 'Colossus', hp: 1700, ad: 52, armor: 25, mr: 12, as: 0.85, ms: 6.2, range: 1.8, radius: 1.7, height: 4.4, projectileSpeed: 0, dmgType: 'physical', gold: 55, xp: 110, aggro: 9 },
};

export interface StructureDef {
  id: string;
  name: string;
  hp: number;
  armor: number;
  mr: number;
  ad: number;
  /** Seconds between shots. */
  attackInterval: number;
  range: number;
  radius: number;
  height: number;
  /** Damage multiplier against minions. */
  vsMinion: number;
  projectileSpeed: number;
  /** Gold the whole team receives when destroyed (plus the last hitter bonus). */
  gold: number;
  hpRegen: number;
}

export const STRUCTURES: Record<string, StructureDef> = {
  tower1: { id: 'tower1', name: 'Outer Tower', hp: 2500, armor: 36, mr: 36, ad: 150, attackInterval: 0.9, range: 16, radius: 2.5, height: 9, vsMinion: 1.25, projectileSpeed: 45, gold: 250, hpRegen: 0 },
  tower2: { id: 'tower2', name: 'Inner Tower', hp: 2800, armor: 46, mr: 46, ad: 170, attackInterval: 0.9, range: 16, radius: 2.5, height: 9.5, vsMinion: 1.25, projectileSpeed: 45, gold: 250, hpRegen: 0 },
  tower3: { id: 'tower3', name: 'Inhibitor Tower', hp: 3000, armor: 54, mr: 54, ad: 190, attackInterval: 0.9, range: 16, radius: 2.6, height: 10, vsMinion: 1.25, projectileSpeed: 45, gold: 250, hpRegen: 0 },
  nexustower: { id: 'nexustower', name: 'Nexus Tower', hp: 2800, armor: 54, mr: 54, ad: 190, attackInterval: 0.9, range: 16, radius: 2.5, height: 10, vsMinion: 1.25, projectileSpeed: 45, gold: 200, hpRegen: 0 },
  inhibitor: { id: 'inhibitor', name: 'Inhibitor', hp: 3000, armor: 20, mr: 0, ad: 0, attackInterval: 0, range: 0, radius: 3.2, height: 6, vsMinion: 0, projectileSpeed: 0, gold: 50, hpRegen: 3 },
  nexus: { id: 'nexus', name: 'Nexus', hp: 4200, armor: 0, mr: 0, ad: 0, attackInterval: 0, range: 0, radius: 5.5, height: 12, vsMinion: 0, projectileSpeed: 0, gold: 0, hpRegen: 6 },
};

export interface MonsterDef {
  id: 'brutes' | 'thorns' | 'golem';
  name: string;
  /** One entry per monster in the camp. */
  members: { name: string; hp: number; ad: number; armor: number; mr: number; as: number; range: number; radius: number; height: number; gold: number; xp: number; ms: number; dx: number; dz: number; big: boolean }[];
  respawn: number;
  firstSpawn: number;
}

export const MONSTER_CAMPS: Record<MonsterDef['id'], MonsterDef> = {
  brutes: {
    id: 'brutes',
    name: 'Moss Brutes',
    respawn: 100,
    firstSpawn: 75,
    members: [
      { name: 'Moss Brute', hp: 1050, ad: 30, armor: 10, mr: 10, as: 0.75, range: 1.8, radius: 1.6, height: 3.8, gold: 70, xp: 120, ms: 5.5, dx: 0, dz: 0, big: true },
      { name: 'Moss Pup', hp: 340, ad: 13, armor: 3, mr: 0, as: 0.9, range: 1.2, radius: 1.0, height: 2.2, gold: 22, xp: 40, ms: 6, dx: 3, dz: 2, big: false },
      { name: 'Moss Pup', hp: 340, ad: 13, armor: 3, mr: 0, as: 0.9, range: 1.2, radius: 1.0, height: 2.2, gold: 22, xp: 40, ms: 6, dx: -3, dz: 2, big: false },
    ],
  },
  thorns: {
    id: 'thorns',
    name: 'Thorn Pack',
    respawn: 90,
    firstSpawn: 70,
    members: [
      { name: 'Thornback', hp: 720, ad: 26, armor: 6, mr: 8, as: 0.8, range: 1.6, radius: 1.3, height: 3, gold: 52, xp: 90, ms: 6, dx: 0, dz: 0, big: true },
      { name: 'Thorn Sprite', hp: 250, ad: 12, armor: 0, mr: 0, as: 1, range: 1.0, radius: 0.9, height: 2, gold: 20, xp: 34, ms: 6.4, dx: 2.4, dz: 2.4, big: false },
      { name: 'Thorn Sprite', hp: 250, ad: 12, armor: 0, mr: 0, as: 1, range: 1.0, radius: 0.9, height: 2, gold: 20, xp: 34, ms: 6.4, dx: -2.4, dz: 2.4, big: false },
    ],
  },
  golem: {
    id: 'golem',
    name: 'Crystal Golem',
    respawn: 130,
    firstSpawn: 90,
    members: [
      { name: 'Crystal Golem', hp: 1900, ad: 40, armor: 18, mr: 24, as: 0.7, range: 2.0, radius: 2.0, height: 4.6, gold: 120, xp: 200, ms: 5.2, dx: 0, dz: 0, big: true },
    ],
  },
};
