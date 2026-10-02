// Unit tests for the pure logic behind the /apps/ folder. Run: npm run test:apps
import test from 'node:test';
import assert from 'node:assert/strict';
import { RepCounter, SENSITIVITY } from '../apps/pushwake/counter.js';
import { nextRing, parseTime, formatCountdown, updateStreak, liveStreak, dateKey, dayBefore } from '../apps/pushwake/alarm.js';

// ---- Pushwake: rep counter -------------------------------------------------------------------

// Brightness for one pushup cycle: top (bright), lowering, bottom (dark), rising.
function repLuma(phase, hi = 0.6, lo = 0.12) {
  if (phase < 0.3) return hi;
  if (phase < 0.45) return hi + (lo - hi) * ((phase - 0.3) / 0.15);
  if (phase < 0.7) return lo;
  if (phase < 0.85) return lo + (hi - lo) * ((phase - 0.7) / 0.15);
  return hi;
}

// `lead` is the time the person spends settling in before the first rep, as in real use.
function run(counter, { reps, cycleMs = 1800, fps = 15, hi = 0.6, lo = 0.12, noise = 0, startMs = 0, seed = 1, lead = 1500 }) {
  let rnd = seed;
  const rand = () => ((rnd = (rnd * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5) * 2;
  const noisy = (v) => Math.min(1, Math.max(0, v + rand() * noise));
  const step = 1000 / fps;
  let t = startMs;
  for (; t < startMs + lead; t += step) counter.push(noisy(hi), t);
  const repsStart = t;
  const end = repsStart + reps * cycleMs;
  for (; t < end; t += step) counter.push(noisy(repLuma(((t - repsStart) % cycleMs) / cycleMs, hi, lo)), t);
  return t;
}

test('counts ten clean reps', () => {
  const c = new RepCounter();
  run(c, { reps: 10 });
  assert.equal(c.reps, 10);
});

test('counts reps with sensor noise', () => {
  const c = new RepCounter();
  run(c, { reps: 12, noise: 0.03, seed: 7 });
  assert.equal(c.reps, 12);
});

test('a dim room still counts, a pitch black one does not', () => {
  const dim = new RepCounter();
  run(dim, { reps: 8, hi: 0.2, lo: 0.04 });
  assert.equal(dim.reps, 8);
  const dark = new RepCounter();
  run(dark, { reps: 8, hi: 0.02, lo: 0.005, noise: 0.004 });
  assert.equal(dark.reps, 0);
  assert.equal(dark.snapshot(false).tooDark, true);
});

test('slow and fast reps both count', () => {
  const slow = new RepCounter();
  run(slow, { reps: 5, cycleMs: 4000 });
  assert.equal(slow.reps, 5);
  const fast = new RepCounter();
  run(fast, { reps: 8, cycleMs: 1000 });
  assert.equal(fast.reps, 8);
});

test('flicker faster than a human can do pushups is ignored', () => {
  const c = new RepCounter();
  run(c, { reps: 30, cycleMs: 300, fps: 30 });
  assert.equal(c.reps, 0);
});

test('starting with the lens covered does not count a phantom rep', () => {
  const c = new RepCounter();
  let t = 0;
  for (; t < 1500; t += 66) c.push(0.05, t); // covered
  for (; t < 3000; t += 66) c.push(0.6, t); // uncovered
  assert.equal(c.reps, 0);
  run(c, { reps: 3, startMs: t });
  assert.equal(c.reps, 3);
});

test('a slow lighting change is not a rep', () => {
  const c = new RepCounter();
  let t = 0;
  for (; t < 60000; t += 66) c.push(0.6 - 0.4 * (t / 60000), t); // dims over a minute
  assert.equal(c.reps, 0);
});

test('lights switched off while down re-learns instead of hanging', () => {
  const c = new RepCounter();
  let t = run(c, { reps: 2 });
  for (let end = t + 15000; t < end; t += 66) c.push(0.05, t); // stays dark for 15s
  const before = c.reps;
  run(c, { reps: 4, hi: 0.2, lo: 0.04, startMs: t });
  assert.equal(c.reps - before, 4, 'counting resumes at the new light level');
});

test('sensitivity presets are ordered and sane', () => {
  for (const p of Object.values(SENSITIVITY)) assert.ok(p.dropRatio < p.riseRatio);
  assert.ok(SENSITIVITY.low.dropRatio < SENSITIVITY.normal.dropRatio);
  assert.ok(SENSITIVITY.normal.dropRatio < SENSITIVITY.high.dropRatio);
});

test('a hand wave over the lens is not a rep', () => {
  const c = new RepCounter();
  let t = 0;
  for (; t < 2000; t += 33) c.push(0.6, t);
  for (let end = t + 120; t < end; t += 33) c.push(0.1, t); // 120 ms cover
  for (let end = t + 2000; t < end; t += 33) c.push(0.6, t);
  assert.equal(c.reps, 0);
});

// ---- Pushwake: alarm maths -------------------------------------------------------------------

test('parseTime accepts good times and rejects bad ones', () => {
  assert.deepEqual(parseTime('07:30'), { h: 7, m: 30 });
  assert.deepEqual(parseTime('7:05'), { h: 7, m: 5 });
  for (const bad of ['', '24:00', '12:60', 'abc', null, '7']) assert.equal(parseTime(bad), null);
});

test('nextRing picks today when the time is still ahead, tomorrow when it has passed', () => {
  const now = new Date(2026, 9, 2, 6, 0, 0); // Fri 2 Oct 2026 06:00
  const a = nextRing({ time: '07:00', days: [] }, now);
  assert.equal(dateKey(a), '2026-10-02');
  const b = nextRing({ time: '05:00', days: [] }, now);
  assert.equal(dateKey(b), '2026-10-03');
  const exact = nextRing({ time: '06:00', days: [] }, now);
  assert.equal(dateKey(exact), '2026-10-03', 'the current minute has already rung');
});

test('nextRing honours selected weekdays', () => {
  const fri = new Date(2026, 9, 2, 8, 0, 0); // a Friday
  const weekdays = [false, true, true, true, true, true, false];
  assert.equal(dateKey(nextRing({ time: '07:00', days: weekdays }, fri)), '2026-10-05', 'skips the weekend to Monday');
  const monOnly = [false, true, false, false, false, false, false];
  assert.equal(nextRing({ time: '07:00', days: monOnly }, fri).getDay(), 1);
  const today = [false, false, false, false, false, true, false]; // Friday only
  assert.equal(dateKey(nextRing({ time: '09:00', days: today }, fri)), '2026-10-02');
  assert.equal(dateKey(nextRing({ time: '07:00', days: today }, fri)), '2026-10-09', 'a week later');
});

test('nextRing copes with the clocks changing', () => {
  const now = new Date(2026, 2, 28, 12, 0, 0); // day before EU spring forward
  const r = nextRing({ time: '07:00', days: [] }, now);
  assert.equal(r.getHours(), 7);
});

test('countdown formatting', () => {
  assert.equal(formatCountdown(45 * 1000), '45s');
  assert.equal(formatCountdown(125 * 1000), '2m 05s');
  assert.equal(formatCountdown((7 * 3600 + 32 * 60) * 1000), '7h 32m');
  assert.equal(formatCountdown(-5), '0s');
});

test('streaks grow on consecutive days and reset after a gap', () => {
  let s = updateStreak(null, '2026-10-01');
  assert.deepEqual(s, { count: 1, last: '2026-10-01' });
  s = updateStreak(s, '2026-10-02');
  assert.equal(s.count, 2);
  s = updateStreak(s, '2026-10-02');
  assert.equal(s.count, 2, 'same day twice counts once');
  s = updateStreak(s, '2026-10-05');
  assert.equal(s.count, 1, 'a gap resets');
  assert.equal(dayBefore('2026-03-01'), '2026-02-28');
  assert.equal(dayBefore('2027-01-01'), '2026-12-31');
});

test('liveStreak shows zero once a day has been missed', () => {
  const s = { count: 4, last: '2026-10-01' };
  assert.equal(liveStreak(s, '2026-10-01'), 4);
  assert.equal(liveStreak(s, '2026-10-02'), 4);
  assert.equal(liveStreak(s, '2026-10-03'), 0);
  assert.equal(liveStreak(null, '2026-10-03'), 0);
});

// ---- BiteLog -----------------------------------------------------------------------------------

import { bmr, targets, scaleFood, sumEntries, searchFoods, streakDays, addDays, lastNDays, validateProfile, parseOpenFoodFacts, lbToKg, kgToLb, ftInToCm, cmToFtIn } from '../apps/bitelog/calc.js';
import { FOODS } from '../apps/bitelog/foods.js';

test('bmr matches the published Mifflin-St Jeor examples', () => {
  // 30 year old man, 80 kg, 180 cm: 10*80 + 6.25*180 - 5*30 + 5 = 1780
  assert.equal(bmr({ sex: 'm', age: 30, heightCm: 180, weightKg: 80 }), 1780);
  // 30 year old woman, 60 kg, 165 cm: 600 + 1031.25 - 150 - 161 = 1320.25
  assert.equal(bmr({ sex: 'f', age: 30, heightCm: 165, weightKg: 60 }), 1320.25);
});

test('targets: goals move calories the right way and macros add up', () => {
  const base = { sex: 'm', age: 30, heightCm: 180, weightKg: 80, activity: 'moderate' };
  const keep = targets({ ...base, goal: 'maintain' });
  const lose = targets({ ...base, goal: 'lose' });
  const gain = targets({ ...base, goal: 'gain' });
  assert.equal(keep.tdee, Math.round(1780 * 1.55));
  assert.ok(lose.kcal < keep.kcal && keep.kcal < gain.kcal);
  assert.ok(lose.protein > keep.protein, 'more protein when cutting');
  for (const t of [keep, lose, gain]) {
    const kcalFromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
    assert.ok(Math.abs(kcalFromMacros - t.kcal) <= 12, `macros ${kcalFromMacros} vs ${t.kcal}`);
  }
});

test('targets never go below a safe floor for adults', () => {
  const small = targets({ sex: 'f', age: 60, heightCm: 150, weightKg: 45, activity: 'sedentary', goal: 'lose' });
  assert.equal(small.kcal, 1200);
  assert.equal(small.floored, true);
});

test('targets never set a deficit for under 18s', () => {
  const teen = targets({ sex: 'f', age: 15, heightCm: 165, weightKg: 55, activity: 'light', goal: 'lose' });
  assert.equal(teen.goal, 'maintain');
  assert.equal(teen.minorForced, true);
  const adult = targets({ sex: 'f', age: 25, heightCm: 165, weightKg: 55, activity: 'light', goal: 'lose' });
  assert.equal(adult.minorForced, false);
});

test('profile validation catches typos', () => {
  const good = { age: 30, heightCm: 175, weightKg: 70 };
  assert.equal(validateProfile(good), null);
  assert.ok(validateProfile({ ...good, age: 3 }));
  assert.ok(validateProfile({ ...good, heightCm: 17 }));
  assert.ok(validateProfile({ ...good, weightKg: 7 }));
  assert.ok(validateProfile(null));
});

test('unit conversions round trip', () => {
  assert.ok(Math.abs(lbToKg(kgToLb(70)) - 70) < 1e-9);
  assert.equal(Math.round(ftInToCm(5, 9)), 175);
  assert.deepEqual(cmToFtIn(175.26), { ft: 5, inch: 9 });
});

test('scaleFood by servings and by grams', () => {
  const rice = FOODS.find((f) => f.name === 'White rice, cooked');
  const two = scaleFood(rice, 2);
  assert.equal(two.kcal, rice.kcal * 2);
  assert.equal(two.label, '2 x 1 cup');
  const grams = scaleFood(rice, 79, 'g'); // half of 158 g
  assert.equal(grams.kcal, Math.round(rice.kcal / 2));
  assert.equal(grams.label, '79 g');
});

test('sumEntries adds calories and macros', () => {
  const t = sumEntries([{ kcal: 100, p: 1.1, c: 2.2, f: 3.3 }, { kcal: 250, p: 10, c: 20, f: 5 }]);
  assert.deepEqual(t, { kcal: 350, p: 11.1, c: 22.2, f: 8.3 });
  assert.deepEqual(sumEntries(undefined), { kcal: 0, p: 0, c: 0, f: 0 });
});

test('search finds foods by word prefixes in any order', () => {
  const names = (q) => searchFoods(q, FOODS).map((f) => f.name);
  assert.equal(names('banana')[0], 'Banana');
  assert.ok(names('chick br').includes('Chicken breast, cooked'));
  assert.ok(names('breast chicken').includes('Chicken breast, cooked'));
  assert.ok(names('EGG').some((n) => n.startsWith('Egg')));
  assert.deepEqual(names('zzzzqq'), []);
  assert.deepEqual(names('   '), []);
  assert.ok(names('pizza').length >= 2);
});

test('every food has sane numbers and calories that match the macros', () => {
  assert.ok(FOODS.length >= 130);
  const seen = new Set();
  const noCalorieMath = new Set(['Beer, regular', 'Wine, red', 'Coffee, black']); // alcohol and rounding make these differ
  for (const f of FOODS) {
    assert.ok(!seen.has(f.name), `duplicate ${f.name}`);
    seen.add(f.name);
    for (const k of ['g', 'kcal', 'p', 'c', 'f']) assert.ok(Number.isFinite(f[k]) && f[k] >= 0, `${f.name} ${k}`);
    assert.ok(f.g > 0 && f.name && f.serving, f.name);
    if (noCalorieMath.has(f.name)) continue;
    const est = f.p * 4 + f.c * 4 + f.f * 9;
    const tol = Math.max(14, f.kcal * 0.2); // fibre, rounding and sugar alcohols explain the gap
    assert.ok(Math.abs(est - f.kcal) <= tol, `${f.name}: ${f.kcal} kcal listed but macros give ${Math.round(est)}`);
  }
});

test('streak counts days in a row, and today can still be empty', () => {
  const log = { '2026-10-01': [{}], '2026-09-30': [{}], '2026-09-29': [{}], '2026-09-27': [{}] };
  assert.equal(streakDays(log, '2026-10-01'), 3);
  assert.equal(streakDays(log, '2026-10-02'), 3, 'yesterday still counts while today is empty');
  assert.equal(streakDays(log, '2026-10-03'), 0);
  assert.equal(streakDays({}, '2026-10-01'), 0);
});

test('date helpers handle month and year ends', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.deepEqual(lastNDays('2026-10-02', 3), ['2026-09-30', '2026-10-01', '2026-10-02']);
});

test('Open Food Facts: serving size when known, per 100 g otherwise', () => {
  const withServing = parseOpenFoodFacts({
    status: 1,
    product: {
      product_name: 'Crunchy Granola',
      brands: 'Acme, Other',
      serving_size: '45 g',
      serving_quantity: 45,
      nutriments: { 'energy-kcal_100g': 400, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 15 },
    },
  });
  assert.equal(withServing.name, 'Acme Crunchy Granola');
  assert.equal(withServing.g, 45);
  assert.equal(withServing.kcal, 180);
  assert.equal(withServing.p, 4.5);
  const per100 = parseOpenFoodFacts({ status: 1, product: { product_name: 'Soup', nutriments: { energy_100g: 418.4, proteins_100g: 2 } } });
  assert.equal(per100.serving, '100 g');
  assert.equal(per100.kcal, 100, 'kJ converted to kcal');
  assert.equal(parseOpenFoodFacts({ status: 0 }), null);
  assert.equal(parseOpenFoodFacts({ status: 1, product: { product_name: 'No data', nutriments: {} } }), null);
  assert.equal(parseOpenFoodFacts(null), null);
});

// ---- Voicepad ----------------------------------------------------------------------------------

import { tidy, toBullets, toTodos, makeTitle, wordCount, removeFillers, applyCommands, splitRunOn } from '../apps/voicepad/clean.js';

test('tidy removes fillers and capitalises', () => {
  assert.equal(tidy('um so i think we should uh go to the shop'), 'So I think we should go to the shop.');
  assert.equal(tidy('hmm, that is, you know, a good idea'), 'That is a good idea.');
  assert.equal(tidy('i mean, it works'), 'It works.');
});

test('tidy fixes stutters but keeps legitimate doubles', () => {
  assert.equal(tidy('i i think the the plan is fine'), 'I think the plan is fine.');
  assert.equal(tidy('he said that that was fine'), 'He said that that was fine.');
  assert.equal(tidy('she had had enough'), 'She had had enough.');
  assert.equal(tidy('no no no'), 'No no no.');
});

test('tidy keeps real words that contain filler letters', () => {
  assert.equal(tidy('the human umbrella was her best friend'), 'The human umbrella was her best friend.');
  assert.equal(tidy('errands before lunch'), 'Errands before lunch.');
  assert.equal(tidy('summer is here'), 'Summer is here.');
});

test('spoken punctuation works and can be switched off', () => {
  assert.equal(tidy('hello comma how are you question mark'), 'Hello, how are you?');
  assert.equal(tidy('first thing new paragraph second thing'), 'First thing.\n\nSecond thing.');
  assert.equal(tidy('buy milk full stop call mum full stop'), 'Buy milk. Call mum.');
  assert.equal(tidy('bullet point milk bullet point eggs'), '- Milk\n- Eggs');
  assert.equal(tidy('the colon is part of the body', { commands: false }), 'The colon is part of the body.');
  assert.equal(applyCommands('wow exclamation mark'), 'wow!');
});

test('standalone i becomes I, including contractions', () => {
  assert.equal(tidy("i'm sure i'll go and i've seen it, i'd say yes"), "I'm sure I'll go and I've seen it, I'd say yes.");
  assert.equal(tidy('a bit of ice'), 'A bit of ice.');
});

test('long unpunctuated speech is broken into sentences', () => {
  const long = 'we went to the market this morning and bought a lot of vegetables for the week and then we walked back home and made a big soup with all of it';
  const out = tidy(long);
  assert.ok(out.includes('. And then'), out);
  assert.ok(out.endsWith('.'));
  const short = 'we went to the market and then home';
  assert.equal(splitRunOn(short), short);
  assert.equal(splitRunOn('one two three four five six seven eight nine ten eleven twelve. and then thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three'), 'one two three four five six seven eight nine ten eleven twelve. and then thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three', 'already punctuated text is left alone');
});

test('bullets split sentences and "and then"', () => {
  assert.equal(toBullets('we met the team. they liked the demo and then asked for pricing'), '- We met the team\n- They liked the demo\n- Asked for pricing');
  assert.equal(toBullets(''), '');
});

test('to-dos pick out action lines and strip the lead-in', () => {
  const t = "i went for a walk. i need to call the dentist. don't forget to buy milk. the weather was great. remind me to send the invoice";
  assert.equal(toTodos(t), '- [ ] Call the dentist\n- [ ] Buy milk\n- [ ] Send the invoice');
  assert.equal(toTodos('the sky was blue and the grass was green'), '');
});

test('titles are short and sensible', () => {
  assert.equal(makeTitle('um buy milk and eggs and bread for the weekend'), 'Buy milk and eggs and bread...');
  assert.equal(makeTitle('quick idea'), 'Quick idea');
  assert.equal(makeTitle('   '), 'Untitled note');
  assert.equal(makeTitle(''), 'Untitled note');
});

test('word count and filler helpers handle empty input', () => {
  assert.equal(wordCount('  one two  three '), 3);
  assert.equal(wordCount(''), 0);
  assert.equal(tidy(''), '');
  assert.equal(tidy(null), '');
  assert.equal(removeFillers('uh'), ' ');
});

test('the word "period" is only punctuation when it is not part of a phrase', () => {
  assert.equal(tidy('the period of time was long'), 'The period of time was long.');
  assert.equal(tidy('it was a long period'), 'It was a long period.');
  assert.equal(tidy('we had a trial period for three weeks'), 'We had a trial period for three weeks.');
  assert.equal(tidy('buy milk period call mum period'), 'Buy milk. Call mum.');
});

test('weekdays and months are capitalised, ambiguous ones are left alone', () => {
  assert.equal(tidy('see you on thursday in october'), 'See you on Thursday in October.');
  assert.equal(tidy('i may go in march'), 'I may go in march.');
});

test('titles skip leading filler and fix the I', () => {
  assert.equal(makeTitle('so um yeah i was thinking that we should move the meeting'), 'I was thinking that we should...');
  assert.equal(makeTitle('okay buy flowers'), 'Buy flowers');
});

test('other languages only get capitals and full stops', () => {
  assert.equal(tidy('er hat gesagt dass er morgen kommt', { english: false }), 'Er hat gesagt dass er morgen kommt.');
  assert.equal(tidy('hello comma um world', { english: false }), 'Hello comma um world.');
});

test('tidy is idempotent, so running it twice changes nothing', () => {
  const samples = [
    'um so i i think we should uh go on thursday and then buy milk',
    'bullet point milk bullet point eggs',
    'first thing new paragraph second thing',
    'Hello. This is already punctuated! Right?',
  ];
  for (const s of samples) assert.equal(tidy(tidy(s)), tidy(s), s);
  const todos = toTodos('i need to call the dentist. remind me to send the invoice');
  assert.equal(tidy(todos), todos, 'to-do lines survive a second tidy');
  const bullets = toBullets('we met the team. they liked the demo');
  assert.equal(tidy(bullets), bullets, 'bullet lines survive a second tidy');
});
