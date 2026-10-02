// Scheduling and streak maths for the alarm. No DOM, so it can be tested in Node.

export function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

// days is seven booleans, Sunday first. No day selected means "once": the next time the clock hits it.
export function nextRing(alarm, now = new Date()) {
  const t = parseTime(alarm.time);
  if (!t) return null;
  const days = Array.isArray(alarm.days) ? alarm.days : [];
  const repeating = days.some(Boolean);
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, t.h, t.m, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    if (!repeating || days[d.getDay()]) return d;
  }
  return null;
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayBefore(key) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d - 1));
}

// Call when a morning is completed. Two in one day count once; a gap of a day or more resets to 1.
export function updateStreak(streak, doneKey) {
  const prev = streak || { count: 0, last: null };
  if (prev.last === doneKey) return { ...prev };
  if (prev.last && dayBefore(doneKey) === prev.last) return { count: prev.count + 1, last: doneKey };
  return { count: 1, last: doneKey };
}

// A streak is still alive today if the last win was today or yesterday.
export function liveStreak(streak, todayKeyStr) {
  if (!streak || !streak.last) return 0;
  return streak.last === todayKeyStr || dayBefore(todayKeyStr) === streak.last ? streak.count : 0;
}
