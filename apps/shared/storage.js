// localStorage that never throws. Private windows and blocked storage fall back to memory.
const memory = new Map();

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch {
    /* blocked or corrupt, fall through */
  }
  return memory.has(key) ? structuredClone(memory.get(key)) : fallback;
}

export function save(key, value) {
  memory.set(key, structuredClone(value));
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
