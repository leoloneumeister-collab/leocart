// Persistent player settings and records. Everything is wrapped in try/catch because
// localStorage can throw in private windows or when site data is blocked.

export const DEFAULT_BINDINGS = {
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['ShiftLeft', 'Space'],
  item: ['KeyE', 'Enter'],
  lookBack: ['KeyC', 'KeyB'],
  reset: ['KeyR', 'Backspace'],
  pause: ['Escape', 'KeyP'],
};

export const ACTION_LABELS = {
  accelerate: 'Accelerate',
  brake: 'Brake / Reverse',
  left: 'Steer left',
  right: 'Steer right',
  drift: 'Drift',
  item: 'Use item',
  lookBack: 'Look back',
  reset: 'Reset to track',
  pause: 'Pause',
};

const KEY = 'leocart.v1';

const defaults = () => ({
  master: 0.8,
  music: 0.7,
  sfx: 0.9,
  shake: true,
  quality: 'high',
  speedUnit: 'kmh',
  bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
  records: {}, // trackId -> { race: seconds, lap: seconds }
  lastCharacter: 'nova',
});

function load() {
  const base = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    const merged = { ...base, ...saved };
    merged.bindings = { ...base.bindings, ...(saved.bindings || {}) };
    return merged;
  } catch {
    return base;
  }
}

export const settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

export function resetBindings() {
  settings.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
  saveSettings();
}

export function recordResult(trackId, raceTime, bestLap) {
  const r = settings.records[trackId] || {};
  let newRace = false;
  let newLap = false;
  if (isFinite(raceTime) && (!r.race || raceTime < r.race)) {
    r.race = raceTime;
    newRace = true;
  }
  if (isFinite(bestLap) && (!r.lap || bestLap < r.lap)) {
    r.lap = bestLap;
    newLap = true;
  }
  settings.records[trackId] = r;
  saveSettings();
  return { newRace, newLap };
}

export function prettyKey(code) {
  if (!code) return 'unset';
  return code
    .replace('Key', '')
    .replace('Digit', '')
    .replace('Arrow', '')
    .replace('ShiftLeft', 'L-Shift')
    .replace('ShiftRight', 'R-Shift')
    .replace('ControlLeft', 'L-Ctrl')
    .replace('ControlRight', 'R-Ctrl')
    .replace('Space', 'Space')
    .replace('Escape', 'Esc')
    .replace('Backspace', 'Backspace');
}
