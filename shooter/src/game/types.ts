import type * as THREE from 'three';
import type { Player } from './player';
import type { Level } from './level/builder';
import type { FX } from './fx/fx';
import type { Enemy } from './enemies/enemy';
import type { EnemyType } from './enemies/rig';

export interface GameCtx {
  time: number;
  difficulty: 0 | 1 | 2;
  player: Player;
  level: Level;
  fx: FX;
  enemies: Enemy[];
  pathBudget: number;
  damagePlayer(amount: number, from: THREE.Vector3): void;
  throwGrenade(from: THREE.Vector3, target: THREE.Vector3): void;
  alertNear(pos: THREE.Vector3, radius: number, delay: number): void;
  spawnEnemy(type: EnemyType, x: number, z: number, zone: number, alerted?: boolean): Enemy;
  enemyKilled(e: Enemy, head: boolean): void;
  panFor(pos: THREE.Vector3): number;
  suppress(amount: number): void;
  bossEvent(name: string): void;
  hasLOS(a: THREE.Vector3, b: THREE.Vector3): boolean;
}
