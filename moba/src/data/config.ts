/**
 * Global tunables. Everything here can be edited without touching game logic.
 * Distances are world units (a champion is about 1.3 units wide), times are seconds.
 */
export const CONFIG = {
  tickRate: 30,
  mapHalf: 110,

  // Minion waves
  firstWaveTime: 65,
  waveInterval: 30,
  /** Seconds between each minion of a wave leaving the gate. */
  minionSpawnGap: 0.9,
  meleePerWave: 3,
  casterPerWave: 3,
  /** A cannon minion joins every Nth wave (and every wave after cannonEveryLate seconds). */
  cannonEvery: 3,
  cannonEveryLateAfter: 1500,
  /** Minion stats grow this fraction per minute of game time. */
  minionHpGrowthPerMin: 0.035,
  minionDmgGrowthPerMin: 0.02,
  minionGoldGrowthPerMin: 0.012,

  // Structures
  inhibitorRespawn: 300,
  superMinionPerInhibDown: 1,
  /** Structures cannot be hit until the one in front of them has fallen. */
  backdoorProtection: true,
  structureAssistGold: 100,

  // Economy
  startGold: 500,
  passiveGoldPerSec: 2.1,
  passiveGoldStart: 5,
  champKillGold: 300,
  champAssistGoldTotal: 150,
  xpShareRadius: 32,
  assistWindow: 10,
  maxLevel: 18,
  ultLevels: [6, 11, 16] as readonly number[],
  respawnBase: 6,
  respawnPerLevel: 2.3,
  respawnPerMinuteLate: 0.5,
  respawnMax: 55,
  startLevel: 1,

  // Recall and base
  recallTime: 8,
  fountainRadius: 19,
  fountainRegenPctPerSec: 0.12,
  shopRadius: 30,

  // Champions
  aggroMemory: 2.5,
  /** Attack speed cap and ability haste formula. */
  attackSpeedCap: 2.5,
  moveSpeedMin: 2.5,
  statusMaxSlow: 0.85,

  // Vision (fog of war)
  visionChampion: 23,
  visionMinion: 14,
  visionTower: 26,
  visionNexus: 22,
  visionInhibitor: 16,
  visionMonster: 0,
  visionWard: 0,
};

export type Config = typeof CONFIG;

/** Cumulative xp needed to *reach* each level (index = level). */
export function xpToNextLevel(level: number): number {
  return 190 + 85 * (level - 1);
}
