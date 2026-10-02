import * as THREE from 'three';
import type { Level } from '../level/builder';
import type { Game } from '../game';
import type { Relay } from '../objects';
import type { Enemy } from '../enemies/enemy';
import type { MissionText } from '../../story/story';

export interface LevelSetup {
  level: Level;
  fogColor: number;
  fogDensity: number;
  exposure: number;
  sunDir: THREE.Vector3;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  envIntensity: number;
  sky: THREE.Object3D;
  weather: 'rain' | 'ash';
  tintShadow: [number, number, number];
  tintHigh: [number, number, number];
  lampIntensity: number;
  extra?: THREE.Object3D[];
}

export interface Start { x: number; z: number; yaw: number }

export interface Mission {
  text: MissionText;
  checkpoints: number;
  musicIntensity: number;
  buildLevel(): LevelSetup;
  startFor(cp: number): Start;
  start(game: Game, cp: number): void;
  update(dt: number, game: Game): void;
  onRelayDestroyed?(r: Relay, game: Game): void;
  onEnemyKilled?(e: Enemy, game: Game): void;
  onBossEvent?(name: string, game: Game): void;
  onAlert?(game: Game): void;
}

export interface Spawn { type: 'grunt' | 'rusher' | 'heavy' | 'boss'; x: number; z: number; zone: number; yaw?: number; patrol?: [number, number][] }
