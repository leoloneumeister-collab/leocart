export interface CrosshairSettings {
  style: 'cross' | 'dot' | 'circle' | 'tcross';
  size: number;
  gap: number;
  thickness: number;
  color: string;
  dot: boolean;
  outline: boolean;
  opacity: number;
  dynamic: boolean;
}

export type KeyAction =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'crouch' | 'walk' | 'use' | 'reload'
  | 'primary' | 'secondary' | 'knife' | 'grenade' | 'bomb' | 'last' | 'drop' | 'buy' | 'scoreboard' | 'mute' | 'radio';

export const ACTION_LABELS: Record<KeyAction, string> = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', jump: 'Jump', crouch: 'Crouch', walk: 'Walk (quiet)',
  use: 'Use (plant, defuse, pick up)', reload: 'Reload', primary: 'Primary weapon', secondary: 'Pistol', knife: 'Knife', grenade: 'Grenades (press again to cycle)',
  bomb: 'Bomb', last: 'Last weapon', drop: 'Drop weapon', buy: 'Buy menu', scoreboard: 'Scoreboard', mute: 'Mute', radio: 'Ask for a drop',
};

export const DEFAULT_KEYS: Record<KeyAction, string[]> = {
  forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'], jump: ['Space'], crouch: ['ControlLeft', 'KeyC'], walk: ['ShiftLeft'],
  use: ['KeyE'], reload: ['KeyR'], primary: ['Digit1'], secondary: ['Digit2'], knife: ['Digit3'], grenade: ['Digit4'], bomb: ['Digit5'],
  last: ['KeyQ'], drop: ['KeyG'], buy: ['KeyB'], scoreboard: ['Tab'], mute: ['KeyM'], radio: ['KeyX'],
};

export interface Settings {
  sens: number;
  /** vertical field of view in degrees. 73.7 equals CS's 90 degrees on a 4:3 screen, 106 horizontal at 16:9 */
  fov: number;
  invertY: boolean;
  wheel: 'weapon' | 'jump';
  volume: number;
  music: number;
  quality: 'low' | 'medium' | 'high';
  difficulty: 0 | 1 | 2 | 3;
  mode: 'comp' | 'dm';
  side: -1 | 0 | 1;
  showFps: boolean;
  crosshair: CrosshairSettings;
  keys: Record<KeyAction, string[]>;
  stats: { matches: number; wins: number; kills: number; deaths: number; headshots: number; rounds: number };
}

const KEY = 'sitehold-save-v1';

export const defaultSettings = (): Settings => ({
  sens: 1.4,
  fov: 73.7,
  invertY: false,
  wheel: 'weapon',
  volume: 0.7,
  music: 0.4,
  quality: 'medium',
  difficulty: 1,
  mode: 'comp',
  side: -1,
  showFps: false,
  crosshair: { style: 'cross', size: 6, gap: 3, thickness: 2, color: '#36ff7a', dot: false, outline: true, opacity: 1, dynamic: true },
  keys: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
  stats: { matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, rounds: 0 },
});

export function loadSettings(): Settings {
  const def = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const d = JSON.parse(raw);
    return {
      ...def, ...d,
      crosshair: { ...def.crosshair, ...(d.crosshair ?? {}) },
      keys: { ...def.keys, ...(d.keys ?? {}) },
      stats: { ...def.stats, ...(d.stats ?? {}) },
    };
  } catch { return def; }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export const keyName = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', '').replace('Control', 'Ctrl').replace('Space', 'Space');
