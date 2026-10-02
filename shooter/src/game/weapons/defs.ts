import type { GunSound } from '../../engine/audio';

export type WeaponId = 'vk7' | 'hornet' | 'breaker' | 'longbow';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  role: string;
  desc: string;
  damage: number;
  headMult: number;
  rpm: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reloadTime: number;
  shellReload: boolean;
  pellets: number;
  hipSpread: number;
  adsSpread: number;
  recoilPitch: number; // radians per shot
  recoilYaw: number;
  kick: number; // viewmodel kick strength
  adsFov: number; // fov multiplier when aimed
  adsTime: number;
  moveMult: number;
  range: number;
  falloffStart: number;
  falloffEnd: number;
  sound: GunSound;
  scope: boolean;
  tracer: number;
  // display bars 0..1
  stats: { power: number; speed: number; range: number; control: number };
}

const d = (deg: number) => (deg * Math.PI) / 180;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  vk7: {
    id: 'vk7', name: 'VK-7', role: 'ASSAULT RIFLE', desc: 'Reliable all-rounder. Controllable bursts at any range.',
    damage: 24, headMult: 2.0, rpm: 650, auto: true, mag: 30, reserve: 150, reloadTime: 2.1, shellReload: false, pellets: 1,
    hipSpread: 0.026, adsSpread: 0.0035, recoilPitch: d(0.62), recoilYaw: d(0.22), kick: 1, adsFov: 0.74, adsTime: 0.16,
    moveMult: 1, range: 160, falloffStart: 40, falloffEnd: 110, sound: 'rifle', scope: false, tracer: 0xffd9a0,
    stats: { power: 0.5, speed: 0.6, range: 0.7, control: 0.7 },
  },
  hornet: {
    id: 'hornet', name: 'HORNET', role: 'SUBMACHINE GUN', desc: 'Fast firing and nimble. Melts targets up close.',
    damage: 17, headMult: 1.7, rpm: 900, auto: true, mag: 35, reserve: 175, reloadTime: 1.7, shellReload: false, pellets: 1,
    hipSpread: 0.032, adsSpread: 0.007, recoilPitch: d(0.36), recoilYaw: d(0.3), kick: 0.7, adsFov: 0.82, adsTime: 0.11,
    moveMult: 1.07, range: 90, falloffStart: 15, falloffEnd: 50, sound: 'smg', scope: false, tracer: 0xffe0b0,
    stats: { power: 0.35, speed: 0.95, range: 0.35, control: 0.8 },
  },
  breaker: {
    id: 'breaker', name: 'BREAKER', role: 'PUMP SHOTGUN', desc: 'One shot can end a fight. Slow to reload, brutal in close quarters.',
    damage: 13, headMult: 1.5, rpm: 72, auto: false, mag: 6, reserve: 36, reloadTime: 0.55, shellReload: true, pellets: 10,
    hipSpread: 0.055, adsSpread: 0.032, recoilPitch: d(3.4), recoilYaw: d(0.8), kick: 2.4, adsFov: 0.86, adsTime: 0.14,
    moveMult: 1, range: 45, falloffStart: 8, falloffEnd: 28, sound: 'shotgun', scope: false, tracer: 0xffc080,
    stats: { power: 0.95, speed: 0.25, range: 0.2, control: 0.4 },
  },
  longbow: {
    id: 'longbow', name: 'LONGBOW', role: 'MARKSMAN RIFLE', desc: 'Scoped, accurate, hits hard. Two body shots drop most targets.',
    damage: 82, headMult: 2.6, rpm: 150, auto: false, mag: 10, reserve: 60, reloadTime: 2.7, shellReload: false, pellets: 1,
    hipSpread: 0.02, adsSpread: 0.0004, recoilPitch: d(2.0), recoilYaw: d(0.35), kick: 2, adsFov: 0.3, adsTime: 0.22,
    moveMult: 0.94, range: 400, falloffStart: 400, falloffEnd: 401, sound: 'dmr', scope: true, tracer: 0xbfe3ff,
    stats: { power: 0.85, speed: 0.3, range: 1, control: 0.55 },
  },
};

export const WEAPON_ORDER: WeaponId[] = ['vk7', 'hornet', 'breaker', 'longbow'];
