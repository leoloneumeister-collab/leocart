export type Team = 0 | 1;
export type TeamOrNeutral = 0 | 1 | 2;
export const BLUE: Team = 0;
export const RED: Team = 1;
export const NEUTRAL = 2;

export type Lane = 'top' | 'mid' | 'bot';
export type DmgType = 'physical' | 'magic' | 'true';
export type UnitKind = 'champion' | 'minion' | 'monster' | 'tower' | 'inhibitor' | 'nexus';
export type MinionType = 'melee' | 'caster' | 'cannon' | 'super';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type Role = 'fighter' | 'mage' | 'marksman' | 'tank' | 'assassin';

export interface Stats {
  maxHp: number;
  maxMana: number;
  ad: number;
  ap: number;
  armor: number;
  mr: number;
  /** Attacks per second. */
  as: number;
  ms: number;
  range: number;
  hpRegen: number;
  manaRegen: number;
  haste: number;
  lifesteal: number;
}

export type StatusType = 'stun' | 'slow' | 'shield' | 'buff' | 'root' | 'silence';

export interface Status {
  type: StatusType;
  until: number;
  /** slow: fraction 0..1. shield: remaining amount. buff: amount, interpretation by `stat`. */
  amount: number;
  stat?: 'ms' | 'as' | 'ad' | 'ap' | 'armor' | 'mr' | 'hpRegen';
  /** For buffs expressed as a fraction of the base stat rather than flat. */
  pct?: boolean;
  source: number;
  tag?: string;
}

export type Order =
  | { t: 'idle' }
  | { t: 'move'; x: number; z: number }
  | { t: 'attackMove'; x: number; z: number }
  | { t: 'attack'; target: number }
  | { t: 'cast'; slot: number; x: number; z: number; target: number }
  | { t: 'recall'; left: number };

export interface Dash {
  tx: number;
  tz: number;
  speed: number;
  /** Ability slot that dashed, so the arrival effect knows which ability to resolve. */
  slot: number;
  /** If set, the dash homes onto this unit. */
  targetId: number;
  rank: number;
}

export interface ChampState {
  defId: string;
  level: number;
  xp: number;
  skillPoints: number;
  ranks: [number, number, number, number];
  cooldowns: [number, number, number, number];
  gold: number;
  totalGold: number;
  items: (string | null)[];
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damageDealt: number;
  damageTaken: number;
  respawnAt: number;
  isPlayer: boolean;
  isBot: boolean;
  lane: Lane;
  slot: number;
  /** Time until the next passive gold tick contribution. */
  lastDamagedAt: number;
  /** Last time this champion hit an enemy champion (for tower aggro and minion aggro). */
  lastAttackedChampAt: number;
  lastAttackedChampId: number;
  /** champion id -> time of last damage taken from that champion (assists). */
  damagedBy: Map<number, number>;
  /** Passive state (stacks etc.). */
  stacks: number;
  stackUntil: number;
  /** Streak counters for bounty and announcements. */
  streak: number;
  inShop: boolean;
  /** Bots set this to stop auto-attacking while they wait to last hit. */
  holdFire: boolean;
}

export interface MinionState {
  type: MinionType;
  lane: Lane;
  wp: number;
  lateral: number;
  /** Goldx value granted on last hit (already scaled for time). */
  gold: number;
  xp: number;
  dmgScale: number;
}

export interface StructState {
  lane: Lane | 'base';
  tier: number; // 1..3 for lane towers, 4 for nexus towers, 0 for inhibitor and nexus
  /** ids of structures that must be destroyed before this one can be hit. */
  requires: number[];
  /** Number of structures from `requires` that must be down (default all). */
  requiresAny: boolean;
  respawnAt: number;
  destroyed: boolean;
  maxHpBase: number;
  /** For inhibitors, the lane whose super minions this opens. */
  superFor?: Lane;
}

export interface MonsterState {
  campId: number;
  homeX: number;
  homeZ: number;
  leash: number;
  aggro: number;
  gold: number;
  xp: number;
  /** Seconds a damaged monster takes to forget its attacker. */
  lastDamagedAt: number;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  team: TeamOrNeutral;
  /** Definition id (champion id, minion type, structure id). */
  defId: string;
  name: string;
  x: number;
  z: number;
  px: number;
  pz: number;
  facing: number;
  radius: number;
  height: number;
  hp: number;
  mana: number;
  /** Base stats with level applied but before items and statuses. */
  baseStats: Stats;
  /** Final stats this tick. */
  s: Stats;
  alive: boolean;
  /** Set when a unit is removed from the world. */
  removed: boolean;
  order: Order;
  path: { x: number; z: number }[];
  pathAge: number;
  attackCd: number;
  /** Current target for auto attacks (0 if none). */
  target: number;
  targetCheck: number;
  /** For melee attack animation timing. */
  statuses: Status[];
  dash: Dash | null;
  /** Projectile attack data (undefined for melee). */
  projectileSpeed: number;
  /** Damage this unit deals with a basic attack, before target mitigation. */
  attackDmgType: DmgType;
  moved: number;
  champ?: ChampState;
  minion?: MinionState;
  struct?: StructState;
  monster?: MonsterState;
  /** Tick time of death. */
  diedAt: number;
  /** Visibility timers per team (seconds the unit stays revealed after being seen). */
  revealedUntil: [number, number];
  /** Damage tracking for tower aggro rules etc. */
  lastDamagedBy: number;
  lastDamagedByTime: number;
  /** If > time, this unit is out of reach (e.g. spawn protection). */
  invulnUntil: number;
  /** Used by melee AI to remember lane approach side. */
  tag: number;
}

export type CommandType =
  | 'move'
  | 'attackMove'
  | 'attack'
  | 'stop'
  | 'cast'
  | 'levelUp'
  | 'recall'
  | 'buy'
  | 'sell'
  | 'pause';

export interface Command {
  type: CommandType;
  unit: number;
  x?: number;
  z?: number;
  target?: number;
  slot?: number;
  item?: string;
  index?: number;
}

export interface Projectile {
  id: number;
  team: TeamOrNeutral;
  source: number;
  x: number;
  z: number;
  px: number;
  pz: number;
  vx: number;
  vz: number;
  speed: number;
  radius: number;
  /** Range left. */
  range: number;
  /** For homing projectiles (basic attacks, targeted spells). */
  homing: number;
  /** Remaining direction normalised, for skillshots. */
  pierce: boolean;
  hit: number[];
  /** Damage and effects resolved on impact. */
  dmg: number;
  dmgType: DmgType;
  /** Ability reference, if this is a spell projectile. */
  ability?: { champ: string; slot: number };
  /** Rank used when the spell was cast. */
  rank: number;
  /** Visual id. */
  visual: string;
  isAttack: boolean;
  /** Pre-resolved on-hit crowd control. */
  onHit?: HitEffect[];
  /** Attack projectile crit/passive data. */
  alive: boolean;
}

export interface Zone {
  id: number;
  team: TeamOrNeutral;
  source: number;
  x: number;
  z: number;
  radius: number;
  triggerAt: number;
  createdAt: number;
  ability: { champ: string; slot: number };
  rank: number;
  visual: string;
  alive: boolean;
}

export interface HitEffect {
  type: 'damage' | 'stun' | 'slow' | 'shield' | 'heal' | 'buff' | 'knockup' | 'root' | 'silence' | 'dashToTarget';
  dmgType?: DmgType;
  base?: number[];
  ad?: number;
  bonusAd?: number;
  ap?: number;
  maxHpPct?: number;
  /** Fraction of the caster's own max health added to the effect. */
  ownMaxHpPct?: number;
  missingHpPct?: number;
  duration?: number;
  amount?: number;
  amounts?: number[];
  stat?: Status['stat'];
  pct?: boolean;
  tag?: string;
  /** Self-targeted instead of victim-targeted. */
  self?: boolean;
  /** Execution bonus: extra damage multiplier below hp fraction. */
  executeBelow?: number;
  executeMult?: number;
}

export type SimEvent =
  | { t: 'attack'; id: number; target: number; tx: number; tz: number; ranged: boolean }
  | { t: 'cast'; id: number; slot: number; champ: string; x: number; z: number; tx: number; tz: number }
  | { t: 'projectile'; id: number }
  | { t: 'damage'; id: number; amount: number; dmgType: DmgType; x: number; z: number; crit: boolean; source: number; team: TeamOrNeutral; kind: UnitKind }
  | { t: 'heal'; id: number; amount: number; x: number; z: number }
  | { t: 'death'; id: number; killer: number; kind: UnitKind; team: TeamOrNeutral; x: number; z: number; defId: string; minionType?: MinionType }
  | { t: 'respawn'; id: number }
  | { t: 'levelUp'; id: number; level: number }
  | { t: 'gold'; id: number; amount: number; x: number; z: number }
  | { t: 'zone'; id: number; x: number; z: number; radius: number; delay: number; visual: string; team: TeamOrNeutral }
  | { t: 'zoneHit'; id: number; x: number; z: number; radius: number; visual: string; team: TeamOrNeutral }
  | { t: 'dash'; id: number; fx: number; fz: number; tx: number; tz: number }
  | { t: 'blink'; id: number; fx: number; fz: number; tx: number; tz: number }
  | { t: 'status'; id: number; status: StatusType; duration: number }
  | { t: 'structureDown'; id: number; team: TeamOrNeutral; kind: UnitKind; lane: string; x: number; z: number; killer: number }
  | { t: 'inhibRespawn'; id: number; team: TeamOrNeutral }
  | { t: 'announce'; text: string; team: TeamOrNeutral | -1 }
  | { t: 'kill'; killer: number; victim: number; assists: number[]; killerTeam: TeamOrNeutral; x: number; z: number }
  | { t: 'recallStart'; id: number }
  | { t: 'recallCancel'; id: number }
  | { t: 'recallDone'; id: number }
  | { t: 'buy'; id: number; item: string }
  | { t: 'sell'; id: number; item: string }
  | { t: 'shield'; id: number }
  | { t: 'gameOver'; winner: Team }
  | { t: 'spawn'; id: number }
  | { t: 'msg'; unit: number; text: string };
