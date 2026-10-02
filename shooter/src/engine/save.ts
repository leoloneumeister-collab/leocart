export interface Settings {
  sens: number;
  fov: number;
  music: number;
  sfx: number;
  quality: 'low' | 'medium' | 'high';
  difficulty: 0 | 1 | 2;
  invertY: boolean;
}

export interface MissionRecord { bestTime: number; bestScore: number; bestGrade: string; completed: boolean }

export interface SaveData {
  settings: Settings;
  records: Record<string, MissionRecord>;
  unlocked: number;
}

const KEY = 'shadow-protocol-save-v1';

export const defaultSave = (): SaveData => ({
  settings: { sens: 1, fov: 80, music: 0.5, sfx: 0.8, quality: 'medium', difficulty: 1, invertY: false },
  records: {},
  unlocked: 2,
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const def = defaultSave();
      const out = { ...def, ...d, settings: { ...def.settings, ...(d.settings ?? {}) } };
      out.unlocked = Math.max(2, out.unlocked ?? 2);
      return out;
    }
  } catch { /* storage unavailable */ }
  return defaultSave();
}

export function writeSave(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
