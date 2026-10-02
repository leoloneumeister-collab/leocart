import type { GrenadeKind } from './weapons.ts';
import type { Vec3 } from './math.ts';

export type SimEvent =
  | { t: 'shot'; id: number; pos: Vec3; weapon: string }
  | { t: 'tracer'; id: number; from: Vec3; to: Vec3 }
  | { t: 'impact'; pos: Vec3; normal: Vec3; surface: 'stone' | 'wood' | 'metal' | 'sand' | 'flesh' | 'head' }
  | { t: 'hit'; attacker: number; victim: number; dmg: number; head: boolean; armor: boolean; pos: Vec3 }
  | { t: 'hurt'; id: number; dmg: number; from: Vec3 | null }
  | { t: 'kill'; killer: number; victim: number; weapon: string; head: boolean; wallbang: boolean; assist: number; noscope?: boolean; pos: Vec3 }
  | { t: 'step'; id: number; pos: Vec3; surface: string; loud: boolean }
  | { t: 'land'; id: number; pos: Vec3; speed: number }
  | { t: 'reload'; id: number; weapon: string }
  | { t: 'draw'; id: number; weapon: string }
  | { t: 'dryfire'; id: number }
  | { t: 'knife'; id: number; stab: boolean; hit: boolean }
  | { t: 'pin'; id: number; kind: GrenadeKind }
  | { t: 'throw'; id: number; kind: GrenadeKind; pos: Vec3 }
  | { t: 'bounce'; kind: GrenadeKind; pos: Vec3 }
  | { t: 'detonate'; kind: GrenadeKind; pos: Vec3; owner: number }
  | { t: 'flashed'; id: number; dur: number }
  | { t: 'plantStart'; id: number }
  | { t: 'plantStop'; id: number }
  | { t: 'planted'; id: number; site: 'A' | 'B'; pos: Vec3 }
  | { t: 'beep'; pos: Vec3; fast: boolean }
  | { t: 'defuseStart'; id: number; kit: boolean }
  | { t: 'defuseStop'; id: number }
  | { t: 'defused'; id: number }
  | { t: 'exploded'; pos: Vec3 }
  | { t: 'bombDrop'; pos: Vec3 }
  | { t: 'bombPickup'; id: number }
  | { t: 'pickup'; id: number; item: string }
  | { t: 'drop'; id: number; item: string }
  | { t: 'buy'; id: number; item: string }
  | { t: 'spawn'; id: number }
  | { t: 'freezeStart'; round: number }
  | { t: 'live'; round: number }
  | { t: 'roundEnd'; round: number; winner: 0 | 1; reason: RoundReason; mvp: number }
  | { t: 'halftime' }
  | { t: 'matchEnd'; winnerGrp: 0 | 1 | -1 }
  | { t: 'radio'; id: number; text: string }
  | { t: 'money'; id: number; amount: number; why: string }
  | { t: 'warn'; text: string };

export type RoundReason = 'elimination' | 'bomb' | 'defuse' | 'time';

/** Noise heard by bots. */
export interface Noise { pos: Vec3; time: number; radius: number; id: number; team: 0 | 1; kind: 'step' | 'shot' | 'plant' | 'defuse' | 'reload' | 'bomb' }
