// Turns loosely structured CV data (usually extracted by an LLM) into the exact
// shape the renderer needs. Pure, no DOM, no dependencies, so it runs in the
// MCP server, in the widget iframe and in the website demo.
//
// Time is a fractional year: 2021.0 is 1 Jan 2021, 2021.5 is 1 Jul 2021.
// Starts snap to the start of a month, ends to the end of it, so a role that
// runs "2021-03" to "2021-03" still has a visible one month length.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LOOKUP = Object.fromEntries(MONTHS.map((m, i) => [m.toLowerCase(), i + 1]));
const ONGOING = /^(present|now|current|currently|ongoing|today|to date|heute)$/i;

const MAX_WORK = 20;
const MAX_EDU = 8;
const MAX_SKILLS_PER_ROLE = 12;
const MAX_EXTRA_SKILLS = 40;

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Parse one date string. Returns { year, month|null } or 'ongoing' or null.
 * Accepts 2021-03, 2021/03, 03/2021, Mar 2021, March 2021, 2021 and "present".
 */
export function parseDate(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (ONGOING.test(s)) return 'ongoing';
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return validMonth(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return validMonth(+m[2], +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (m) {
    const month = MONTH_LOOKUP[m[1].slice(0, 3).toLowerCase()];
    return month ? validMonth(+m[2], month) : null;
  }
  m = s.match(/^(\d{4})$/);
  if (m) return validYear(+m[1]);
  return null;
}

function validYear(year) {
  return year >= 1950 && year <= 2100 ? { year, month: null } : null;
}

function validMonth(year, month) {
  return year >= 1950 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
}

const startOf = (d) => d.year + ((d.month ?? 1) - 1) / 12;
const endOf = (d) => (d.month ? d.year + d.month / 12 : d.year + 1);

function label(d) {
  return d.month ? `${MONTHS[d.month - 1]} ${d.year}` : String(d.year);
}

function nowAsYear(now) {
  return now.getUTCFullYear() + (now.getUTCMonth() + 1) / 12;
}

/** Length of the union of [start, end] intervals, so overlapping jobs are not double counted. */
export function unionLength(intervals) {
  const sorted = intervals.map(([a, b]) => [a, b]).sort((p, q) => p[0] - q[0]);
  let total = 0;
  let curStart = null;
  let curEnd = null;
  for (const [a, b] of sorted) {
    if (curEnd === null || a > curEnd) {
      if (curEnd !== null) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else if (b > curEnd) {
      curEnd = b;
    }
  }
  if (curEnd !== null) total += curEnd - curStart;
  return total;
}

function readEntry(raw, kind, now, warnings) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clean(raw.title, 90);
  const org = clean(raw.organization ?? raw.org ?? raw.company ?? raw.school, 90);
  const name = title || org || 'Untitled';
  if (!title && !org) {
    warnings.push(`Skipped a ${kind} entry with no title or organization.`);
    return null;
  }
  const startRaw = parseDate(raw.start);
  if (!startRaw || startRaw === 'ongoing') {
    warnings.push(`Skipped "${name}": could not read its start date (${JSON.stringify(raw.start ?? null)}). Use YYYY-MM or YYYY.`);
    return null;
  }
  const endRaw = parseDate(raw.end);
  const hasEnd = endRaw && endRaw !== 'ongoing';
  if (raw.end && !endRaw) {
    warnings.push(`"${name}": end date ${JSON.stringify(raw.end)} not understood, treated as ongoing.`);
  }
  const start = startOf(startRaw);
  const ongoing = !hasEnd;
  const end = ongoing ? Math.max(nowAsYear(now), start + 1 / 12) : endOf(endRaw);
  if (end < start) {
    warnings.push(`Skipped "${name}": it ends before it starts.`);
    return null;
  }
  const skills = [];
  if (Array.isArray(raw.skills)) {
    for (const s of raw.skills.slice(0, MAX_SKILLS_PER_ROLE)) {
      const skill = clean(s, 40);
      if (skill) skills.push(skill);
    }
  }
  return {
    kind,
    title,
    org,
    start,
    end,
    ongoing,
    startLabel: label(startRaw),
    endLabel: ongoing ? 'Present' : label(endRaw),
    years: end - start,
    skills,
  };
}

function byNewest(a, b) {
  return b.start - a.start || b.end - a.end;
}

function axisFor(entries) {
  if (!entries.length) return { min: 0, max: 1, ticks: [] };
  const min = Math.floor(Math.min(...entries.map((e) => e.start)));
  let max = Math.ceil(Math.max(...entries.map((e) => e.end)));
  if (max <= min) max = min + 1;
  return { min, max, ticks: tickYears(min, max) };
}

export function tickYears(min, max) {
  const span = max - min;
  const step = span <= 8 ? 1 : span <= 16 ? 2 : span <= 40 ? 5 : 10;
  const ticks = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push(y);
  return ticks.length >= 2 ? ticks : [min, max];
}

// `work` is newest first, so when the same skill is spelled differently across
// roles ("Go", "GO"), the spelling from the most recent role is the one shown.
function collectSkills(work, extras) {
  const byKey = new Map();
  const keyOf = (s) => s.toLowerCase();
  for (const job of work) {
    for (const skill of job.skills) {
      const key = keyOf(skill);
      if (!byKey.has(key)) byKey.set(key, { name: skill, intervals: [], roles: 0 });
      const rec = byKey.get(key);
      rec.intervals.push([job.start, job.end]);
      rec.roles += 1;
    }
  }
  const used = [...byKey.values()]
    .map((r) => ({ name: r.name, years: unionLength(r.intervals), roles: r.roles }))
    .sort((a, b) => b.years - a.years || a.name.localeCompare(b.name));
  const seen = new Set(byKey.keys());
  const extra = [];
  for (const s of extras) {
    const skill = clean(s, 40);
    if (skill && !seen.has(keyOf(skill))) {
      seen.add(keyOf(skill));
      extra.push(skill);
    }
  }
  return { skills: used, extraSkills: extra };
}

/**
 * @param {object} input  { name, headline?, experience[], education[], skills[] }
 * @param {{ now?: Date }} [options]
 * @returns the normalized CV, ready for renderCvSvg / renderCvTable
 */
export function normalizeCv(input, options = {}) {
  const now = options.now ?? new Date();
  const warnings = [];
  const raw = input && typeof input === 'object' ? input : {};

  const work = (Array.isArray(raw.experience) ? raw.experience : [])
    .slice(0, MAX_WORK)
    .map((e) => readEntry(e, 'work', now, warnings))
    .filter(Boolean)
    .sort(byNewest);
  const edu = (Array.isArray(raw.education) ? raw.education : [])
    .slice(0, MAX_EDU)
    .map((e) => readEntry(e, 'edu', now, warnings))
    .filter(Boolean)
    .sort(byNewest);

  const { skills, extraSkills } = collectSkills(work, Array.isArray(raw.skills) ? raw.skills.slice(0, MAX_EXTRA_SKILLS) : []);
  const orgs = new Set(work.map((w) => w.org.toLowerCase()).filter(Boolean));

  return {
    name: clean(raw.name, 80) || 'Unnamed',
    headline: clean(raw.headline, 120),
    work,
    edu,
    skills,
    extraSkills,
    axis: axisFor([...work, ...edu]),
    stats: {
      yearsExperience: unionLength(work.map((w) => [w.start, w.end])),
      employers: orgs.size,
      roles: work.length,
    },
    warnings,
  };
}

export function formatDuration(years) {
  const months = Math.max(1, Math.round(years * 12));
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m}m`;
  return m ? `${y}y ${m}m` : `${y}y`;
}

/** One decimal under 10 years, whole numbers above. */
export function formatYears(years) {
  const rounded = years < 10 ? Math.round(years * 10) / 10 : Math.round(years);
  return String(rounded);
}
