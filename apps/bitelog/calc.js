// Calorie and macro maths for BiteLog. Pure functions, no DOM, tested in Node.

export const ACTIVITY = [
  { id: 'sedentary', label: 'Mostly sitting', factor: 1.2 },
  { id: 'light', label: 'Light (1 to 3 workouts a week)', factor: 1.375 },
  { id: 'moderate', label: 'Moderate (3 to 5 a week)', factor: 1.55 },
  { id: 'high', label: 'Very active (6 to 7 a week)', factor: 1.725 },
];

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];

export const lbToKg = (lb) => lb * 0.45359237;
export const kgToLb = (kg) => kg / 0.45359237;
export const ftInToCm = (ft, inch) => (ft * 12 + inch) * 2.54;
export function cmToFtIn(cm) {
  const total = Math.round(cm / 2.54);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

// Mifflin-St Jeor, the standard resting energy estimate for adults.
export function bmr({ sex, age, heightCm, weightKg }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161);
}

export function validateProfile(p) {
  if (!p) return 'Fill in your details first.';
  if (!(p.age >= 10 && p.age <= 100)) return 'Age should be between 10 and 100.';
  if (!(p.heightCm >= 100 && p.heightCm <= 250)) return 'Height looks off. Check the number.';
  if (!(p.weightKg >= 25 && p.weightKg <= 300)) return 'Weight looks off. Check the number.';
  return null;
}

// Daily targets. Not medical advice: it is a starting point you adjust from what the scale does.
export function targets(profile) {
  const act = ACTIVITY.find((a) => a.id === profile.activity) || ACTIVITY[1];
  const base = bmr(profile);
  const tdee = base * act.factor;
  const adult = profile.age >= 18;
  const goal = adult ? profile.goal : 'maintain'; // never set a deficit for someone still growing
  let kcal = goal === 'lose' ? tdee * 0.8 : goal === 'gain' ? tdee * 1.1 : tdee;
  const floor = profile.sex === 'm' ? 1500 : 1200;
  let floored = false;
  if (adult && kcal < floor) {
    kcal = floor;
    floored = true;
  }
  kcal = Math.round(kcal / 10) * 10;
  let protein = Math.round(profile.weightKg * (goal === 'lose' ? 2 : goal === 'gain' ? 1.8 : 1.6));
  protein = Math.min(protein, Math.round((kcal * 0.4) / 4));
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, bmr: Math.round(base), tdee: Math.round(tdee), goal, floored, minorForced: !adult && profile.goal === 'lose' };
}

const r1 = (n) => Math.round(n * 10) / 10;

// Scale a food (values are for one serving of `food.g` grams) to an amount in servings or grams.
export function scaleFood(food, amount, unit = 'serving') {
  const factor = unit === 'g' ? amount / food.g : amount;
  const label = unit === 'g' ? `${r1(amount)} g` : `${r1(amount)} x ${food.serving}`;
  return {
    name: food.name,
    label,
    kcal: Math.round(food.kcal * factor),
    p: r1(food.p * factor),
    c: r1(food.c * factor),
    f: r1(food.f * factor),
  };
}

export function sumEntries(entries) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const e of entries || []) {
    t.kcal += e.kcal;
    t.p += e.p;
    t.c += e.c;
    t.f += e.f;
  }
  return { kcal: Math.round(t.kcal), p: r1(t.p), c: r1(t.c), f: r1(t.f) };
}

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + n));
}

export function lastNDays(endKey, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i));
  return out;
}

// Days in a row with something logged, counting back from today (or from yesterday if today is still empty).
export function streakDays(log, todayKey) {
  const has = (k) => Array.isArray(log[k]) && log[k].length > 0;
  let day = has(todayKey) ? todayKey : addDays(todayKey, -1);
  let n = 0;
  while (has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

// ---- searching -----------------------------------------------------------------------------

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Every word the person typed must start a word in the food name. "chick br" finds "Chicken breast".
export function searchFoods(query, foods, limit = 30) {
  const tokens = norm(query).split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored = [];
  for (const food of foods) {
    const name = norm(food.name);
    const words = name.split(/[\s,()/-]+/).filter(Boolean);
    if (!tokens.every((t) => words.some((w) => w.startsWith(t)))) continue;
    let score = name.length;
    if (name.startsWith(tokens[0])) score -= 40;
    if (words[0] === tokens[0]) score -= 20;
    scored.push({ food, score });
  }
  scored.sort((a, b) => a.score - b.score || a.food.name.localeCompare(b.food.name));
  return scored.slice(0, limit).map((s) => s.food);
}

// ---- Open Food Facts -----------------------------------------------------------------------

// Turns an Open Food Facts product response into one of our food records, or null if it has no calories.
export function parseOpenFoodFacts(json) {
  const prod = json && json.status === 1 && json.product;
  if (!prod) return null;
  const n = prod.nutriments || {};
  let kcal100 = Number(n['energy-kcal_100g']);
  if (!Number.isFinite(kcal100)) {
    const kj = Number(n['energy_100g']);
    kcal100 = Number.isFinite(kj) ? kj / 4.184 : NaN;
  }
  if (!Number.isFinite(kcal100)) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const per100 = { kcal: kcal100, p: num(n.proteins_100g), c: num(n.carbohydrates_100g), f: num(n.fat_100g) };
  const name = [prod.brands && String(prod.brands).split(',')[0].trim(), prod.product_name].filter(Boolean).join(' ').trim() || 'Scanned product';
  const sq = Number(prod.serving_quantity);
  if (Number.isFinite(sq) && sq > 0) {
    const k = sq / 100;
    return {
      name,
      serving: prod.serving_size ? String(prod.serving_size) : `${sq} g`,
      g: sq,
      kcal: Math.round(per100.kcal * k),
      p: r1(per100.p * k),
      c: r1(per100.c * k),
      f: r1(per100.f * k),
    };
  }
  return { name, serving: '100 g', g: 100, kcal: Math.round(per100.kcal), p: r1(per100.p), c: r1(per100.c), f: r1(per100.f) };
}
