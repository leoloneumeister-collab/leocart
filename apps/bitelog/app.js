import { load, save } from '../shared/storage.js';
import { wireShareButtons, toast } from '../shared/share.js';
import { registerOffline } from '../shared/pwa.js';
import {
  ACTIVITY, MEALS, targets, validateProfile, scaleFood, sumEntries, searchFoods, dateKey, addDays, lastNDays, streakDays,
  lbToKg, kgToLb, ftInToCm, cmToFtIn, parseOpenFoodFacts,
} from './calc.js';
import { FOODS } from './foods.js';

const KEY = 'bitelog:v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (s) => Number(String(s).trim().replace(',', '.'));
const fmt = (n) => Math.round(n).toLocaleString();

const state = { profile: null, log: {}, weights: {}, custom: [], ...load(KEY, {}) };
const persist = () => save(KEY, state);
const ui = { tab: 'today', key: dateKey(), units: 'metric', sex: 'f', goal: 'maintain' };
if (state.profile) Object.assign(ui, { units: state.profile.units || 'metric', sex: state.profile.sex, goal: state.profile.goal });

const uid = () => Math.random().toString(36).slice(2, 10);

function currentGoal() {
  if (state.profile && !validateProfile(state.profile)) return { ...targets(state.profile), isDefault: false };
  return { kcal: 2000, protein: 100, carbs: 250, fat: 65, isDefault: true };
}

// ---- tabs ------------------------------------------------------------------------------------

function setTab(tab) {
  ui.tab = tab;
  for (const t of ['today', 'progress', 'profile']) $('tab-' + t).classList.toggle('hidden', t !== tab);
  document.querySelectorAll('.tab').forEach((b) => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (tab === 'today') renderToday();
  if (tab === 'progress') renderProgress();
  if (tab === 'profile') renderProfile();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
$('go-profile').addEventListener('click', (e) => { e.preventDefault(); setTab('profile'); });

// ---- today -----------------------------------------------------------------------------------

function dayLabel(key) {
  const today = dateKey();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function renderToday() {
  const goal = currentGoal();
  const entries = state.log[ui.key] || [];
  const tot = sumEntries(entries);
  $('date-label').textContent = dayLabel(ui.key);
  $('next').disabled = ui.key >= dateKey();
  $('default-goal').classList.toggle('hidden', !goal.isDefault);

  const left = goal.kcal - tot.kcal;
  $('left-n').textContent = fmt(Math.abs(left));
  $('left-l').textContent = left >= 0 ? 'kcal left' : 'kcal over';
  $('eaten').textContent = fmt(tot.kcal) + ' kcal';
  $('goal').textContent = fmt(goal.kcal) + ' kcal';
  const C = 326.7;
  const fg = $('ring-fg');
  fg.style.strokeDashoffset = String(C * (1 - Math.min(1, tot.kcal / goal.kcal)));
  fg.classList.toggle('over', left < 0);
  for (const [k, t, g] of [['p', tot.p, goal.protein], ['c', tot.c, goal.carbs], ['f', tot.f, goal.fat]]) {
    $('bar-' + k).style.width = Math.min(100, (t / g) * 100) + '%';
    $('val-' + k).textContent = `${Math.round(t)} / ${g} g`;
  }

  $('meals').innerHTML = MEALS.map((meal) => {
    const list = entries.filter((e) => e.meal === meal);
    const mt = sumEntries(list);
    return `<div class="card meal">
      <div class="meal-head"><h3>${meal}</h3><div class="row"><span class="kcal">${fmt(mt.kcal)} kcal</span><button class="btn small" data-add="${meal}" aria-label="Add food to ${meal}">+ Add</button></div></div>
      ${list.map((e) => `<div class="entry"><div class="grow"><div class="name">${esc(e.name)}</div><div class="sub">${esc(e.label)} &middot; P ${e.p} C ${e.c} F ${e.f}</div></div><div class="k">${fmt(e.kcal)}</div><button data-del="${e.id}" aria-label="Remove ${esc(e.name)}">&times;</button></div>`).join('')}
    </div>`;
  }).join('');

  const s = streakDays(state.log, dateKey());
  $('streak').hidden = s === 0;
  $('streak-n').textContent = s;
}

$('prev').addEventListener('click', () => { ui.key = addDays(ui.key, -1); renderToday(); });
$('next').addEventListener('click', () => { if (ui.key < dateKey()) { ui.key = addDays(ui.key, 1); renderToday(); } });
$('date-label').addEventListener('click', () => { ui.key = dateKey(); renderToday(); });
$('meals').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) return openAdd(add.dataset.add);
  const del = e.target.closest('[data-del]');
  if (del) {
    const list = state.log[ui.key] || [];
    state.log[ui.key] = list.filter((x) => x.id !== del.dataset.del);
    if (!state.log[ui.key].length) delete state.log[ui.key];
    persist();
    renderToday();
  }
});

function addEntry(meal, item) {
  (state.log[ui.key] ||= []).push({ id: uid(), meal, name: item.name, label: item.label, kcal: item.kcal, p: item.p, c: item.c, f: item.f });
  persist();
  renderToday();
}

// ---- add dialog ------------------------------------------------------------------------------

const add = { meal: 'breakfast', panel: 'search', picked: null, unit: 'serving', results: [], recent: [] };
const dlg = $('add-dlg');
const allFoods = () => [...state.custom.map((f) => ({ ...f, custom: true })), ...FOODS];

function showPanel(p) {
  add.panel = p;
  for (const id of ['search', 'barcode', 'quick', 'amount']) $('p-' + id).classList.toggle('hidden', id !== p);
  $('add-tabs').classList.toggle('hidden', p === 'amount');
  document.querySelectorAll('#add-tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === p)));
  if (p !== 'barcode') stopScan();
}

function recentEntries() {
  const seen = new Set();
  const out = [];
  for (const key of Object.keys(state.log).sort().reverse()) {
    for (const e of [...state.log[key]].reverse()) {
      const k = e.name + '|' + e.label;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      if (out.length >= 8) return out;
    }
  }
  return out;
}

function openAdd(meal) {
  add.meal = meal;
  add.picked = null;
  $('add-title').textContent = 'Add to ' + meal;
  $('q').value = '';
  $('barcode').value = '';
  $('barcode-status').textContent = '';
  $('qa-error').classList.add('hidden');
  ['qa-name', 'qa-kcal', 'qa-p', 'qa-c', 'qa-f'].forEach((id) => ($(id).value = ''));
  $('qa-save').checked = false;
  $('barcode-scan').classList.toggle('hidden', !('BarcodeDetector' in window));
  showPanel('search');
  renderResults();
  if (!dlg.open) dlg.showModal();
  setTimeout(() => $('q').focus(), 50);
}

function foodLine(f, i) {
  return `<button class="result" data-i="${i}"><span>${esc(f.name)}${f.custom ? ' ★' : ''}<small>${esc(f.serving)}</small></span><span class="k">${fmt(f.kcal)}</span></button>`;
}

function renderResults() {
  const q = $('q').value.trim();
  const box = $('results');
  if (!q) {
    add.recent = recentEntries();
    add.results = [];
    const mine = state.custom.slice(0, 20);
    add.results = mine.map((f) => ({ ...f, custom: true }));
    box.innerHTML =
      (add.recent.length
        ? `<h4>Recent (tap to add again)</h4>${add.recent.map((e, i) => `<button class="result" data-recent="${i}"><span>${esc(e.name)}<small>${esc(e.label)}</small></span><span class="k">${fmt(e.kcal)}</span></button>`).join('')}`
        : '') +
      (mine.length ? `<h4>My foods</h4>${add.results.map(foodLine).join('')}` : '') +
      (!add.recent.length && !mine.length ? '<p class="muted small" style="padding:8px 6px">Start typing to search 130+ common foods, or use Barcode and Quick add.</p>' : '');
    return;
  }
  add.results = searchFoods(q, allFoods(), 40);
  box.innerHTML = add.results.length
    ? add.results.map(foodLine).join('')
    : '<p class="muted small" style="padding:8px 6px">Nothing found. Try another word, scan the barcode, or use Quick add.</p>';
}

$('q').addEventListener('input', renderResults);
$('results').addEventListener('click', (e) => {
  const rec = e.target.closest('[data-recent]');
  if (rec) {
    const entry = add.recent[Number(rec.dataset.recent)];
    addEntry(add.meal, entry);
    dlg.close();
    toast('Added again');
    return;
  }
  const btn = e.target.closest('[data-i]');
  if (btn) pickFood(add.results[Number(btn.dataset.i)]);
});

function pickFood(food) {
  add.picked = food;
  add.unit = 'serving';
  $('am-name').textContent = food.name;
  $('am-serving').textContent = `Per serving: ${food.serving}${food.g ? ' (' + food.g + ' g)' : ''}`;
  $('am-qty').value = '1';
  setUnit('serving');
  renderPresets();
  updatePreview();
  showPanel('amount');
  $('am-qty').select();
}

function setUnit(u) {
  add.unit = u;
  document.querySelectorAll('#am-unit button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === u)));
  renderPresets();
}

function renderPresets() {
  const vals = add.unit === 'g' ? [50, 100, 150, 200] : [0.5, 1, 1.5, 2];
  $('am-presets').innerHTML = vals.map((v) => `<button class="chip" data-v="${v}">${v}${add.unit === 'g' ? ' g' : ''}</button>`).join('');
}

function currentScaled() {
  const q = num($('am-qty').value);
  if (!add.picked || !(q > 0) || q > 5000) return null;
  return scaleFood(add.picked, q, add.unit);
}

function updatePreview() {
  const s = currentScaled();
  $('am-kcal').textContent = s ? fmt(s.kcal) : '0';
  $('am-macros').textContent = s ? `P ${s.p} g · C ${s.c} g · F ${s.f} g` : 'Enter an amount';
  $('am-add').disabled = !s;
}
$('am-qty').addEventListener('input', updatePreview);
$('am-unit').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const f = add.picked;
  // keep the same real quantity when switching unit
  const q = num($('am-qty').value) || 1;
  if (b.dataset.v === 'g' && add.unit === 'serving' && f.g) $('am-qty').value = String(Math.round(q * f.g));
  if (b.dataset.v === 'serving' && add.unit === 'g' && f.g) $('am-qty').value = String(Math.round((q / f.g) * 100) / 100);
  setUnit(b.dataset.v);
  updatePreview();
});
$('am-presets').addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  $('am-qty').value = b.dataset.v;
  updatePreview();
});
$('am-back').addEventListener('click', () => showPanel('search'));
$('am-add').addEventListener('click', () => {
  const s = currentScaled();
  if (!s) return;
  addEntry(add.meal, s);
  dlg.close();
  toast('Added to ' + add.meal);
});

$('add-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) showPanel(b.dataset.p);
});
$('add-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', stopScan);
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

// Quick add
$('qa-add').addEventListener('click', () => {
  const kcal = num($('qa-kcal').value);
  const err = $('qa-error');
  if (!(kcal >= 0 && kcal <= 10000) || $('qa-kcal').value.trim() === '') {
    err.textContent = 'Enter the calories, a number from 0 to 10,000.';
    err.classList.remove('hidden');
    return;
  }
  const opt = (id) => {
    const v = num($(id).value || '0');
    return v >= 0 && v < 2000 ? Math.round(v * 10) / 10 : 0;
  };
  const item = { name: $('qa-name').value.trim() || 'Quick add', label: 'quick add', kcal: Math.round(kcal), p: opt('qa-p'), c: opt('qa-c'), f: opt('qa-f') };
  if ($('qa-save').checked) {
    state.custom.unshift({ name: item.name, serving: '1 serving', g: 100, kcal: item.kcal, p: item.p, c: item.c, f: item.f });
    state.custom = state.custom.slice(0, 100);
  }
  addEntry(add.meal, item);
  dlg.close();
  toast('Added to ' + add.meal);
});

// Barcode lookup
async function lookupBarcode(code) {
  const status = $('barcode-status');
  if (!/^\d{8,14}$/.test(code)) {
    status.textContent = 'A barcode is 8 to 14 digits.';
    return;
  }
  status.textContent = 'Looking up...';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity`, { signal: ctl.signal });
    const food = parseOpenFoodFacts(await res.json());
    if (!food) {
      status.textContent = 'Not found, or it has no calorie data. Try Quick add.';
      return;
    }
    status.textContent = '';
    pickFood(food);
  } catch {
    status.textContent = 'Could not reach the food database. Check your connection, or use Quick add.';
  } finally {
    clearTimeout(timer);
  }
}
$('barcode-go').addEventListener('click', () => lookupBarcode($('barcode').value.trim()));
$('barcode').addEventListener('keydown', (e) => { if (e.key === 'Enter') lookupBarcode($('barcode').value.trim()); });

let scan = null;
async function startScan() {
  try {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    const v = $('scan-video');
    v.srcObject = stream;
    v.classList.remove('hidden');
    await v.play();
    $('barcode-status').textContent = 'Point the camera at a barcode.';
    scan = { stream, timer: setInterval(async () => {
      try {
        const found = await detector.detect(v);
        if (found.length) {
          const code = found[0].rawValue;
          stopScan();
          $('barcode').value = code;
          lookupBarcode(code);
        }
      } catch { /* keep trying */ }
    }, 350) };
  } catch {
    $('barcode-status').textContent = 'Could not open the camera. Type the number instead.';
  }
}
function stopScan() {
  if (!scan) return;
  clearInterval(scan.timer);
  scan.stream.getTracks().forEach((t) => t.stop());
  scan = null;
  $('scan-video').classList.add('hidden');
}
$('barcode-scan').addEventListener('click', startScan);

// ---- progress --------------------------------------------------------------------------------

function barChart(days, goalKcal) {
  const vals = days.map((k) => sumEntries(state.log[k] || []).kcal);
  const max = Math.max(goalKcal * 1.25, ...vals, 1);
  const W = 336, H = 150, pad = 18, bw = W / days.length;
  const y = (v) => H - pad - (v / max) * (H - pad - 6);
  const bars = days.map((k, i) => {
    const v = vals[i];
    const x = i * bw + bw * 0.18;
    const h = Math.max(0, H - pad - y(v));
    const cls = v > goalKcal * 1.05 ? '#fbbf24' : '#34d399';
    const d = new Date(k + 'T00:00:00');
    return `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${v ? cls : 'none'}"/>` +
      `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${d.toLocaleDateString([], { weekday: 'narrow' })}</text>`;
  }).join('');
  return `<svg class="svg-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories for the last ${days.length} days">${bars}<line x1="0" x2="${W}" y1="${y(goalKcal).toFixed(1)}" y2="${y(goalKcal).toFixed(1)}" stroke="#9aa4cf" stroke-width="1" stroke-dasharray="4 3"/></svg>`;
}

function renderProgress() {
  const goal = currentGoal();
  const days = lastNDays(dateKey(), 14);
  $('chart').innerHTML = barChart(days, goal.kcal);
  const logged = days.filter((k) => (state.log[k] || []).length);
  const avg = logged.length ? Math.round(logged.reduce((a, k) => a + sumEntries(state.log[k]).kcal, 0) / logged.length) : 0;
  $('avg-line').textContent = logged.length ? `Avg ${fmt(avg)} kcal on ${logged.length} logged days` : 'Nothing logged yet';

  const imperial = ui.units === 'imperial';
  $('weight-unit').textContent = imperial ? 'lb' : 'kg';
  const keys = Object.keys(state.weights).sort().slice(-30);
  const show = (kg) => (imperial ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 10) / 10);
  if (keys.length >= 2) {
    const vs = keys.map((k) => state.weights[k]);
    const min = Math.min(...vs), max = Math.max(...vs), span = Math.max(max - min, 0.5);
    const W = 336, H = 90;
    const pts = vs.map((v, i) => `${((i / (vs.length - 1)) * (W - 16) + 8).toFixed(1)},${(H - 14 - ((v - min) / span) * (H - 28)).toFixed(1)}`);
    $('weight-chart').innerHTML = `<svg class="svg-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over time"><polyline points="${pts.join(' ')}" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${pts.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="#22d3ee"/>`).join('')}</svg>`;
    const diff = show(vs[vs.length - 1]) - show(vs[0]);
    $('weight-note').textContent = `${show(vs[vs.length - 1])} ${imperial ? 'lb' : 'kg'} now, ${diff > 0 ? '+' : ''}${Math.round(diff * 10) / 10} since ${keys[0]}`;
  } else {
    $('weight-chart').innerHTML = '';
    $('weight-note').textContent = keys.length ? `${show(state.weights[keys[0]])} ${imperial ? 'lb' : 'kg'} logged. Add another day to see a trend.` : 'Weigh in now and then to see a trend. Weekly averages tell you more than single days.';
  }
}

$('weight-save').addEventListener('click', () => {
  const v = num($('weight-in').value);
  const kg = ui.units === 'imperial' ? lbToKg(v) : v;
  if (!(kg >= 25 && kg <= 300)) return toast('That weight looks off');
  state.weights[dateKey()] = Math.round(kg * 100) / 100;
  $('weight-in').value = '';
  persist();
  renderProgress();
  toast('Weight saved');
});

// ---- profile ---------------------------------------------------------------------------------

function segSet(id, value) {
  document.querySelectorAll(`#${id} button`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === value)));
}

function applyUnitsToForm() {
  const imp = ui.units === 'imperial';
  segSet('units', ui.units);
  $('height-metric').classList.toggle('hidden', imp);
  $('height-imperial').classList.toggle('hidden', !imp);
  $('weight-label').textContent = imp ? 'Weight (lb)' : 'Weight (kg)';
}

function renderProfile() {
  $('activity').innerHTML = ACTIVITY.map((a) => `<option value="${a.id}">${esc(a.label)}</option>`).join('');
  const p = state.profile;
  $('welcome').classList.toggle('hidden', !!p);
  $('target-card').classList.toggle('hidden', !p);
  if (p) {
    const imp = ui.units === 'imperial';
    $('age').value = p.age;
    $('weight').value = imp ? Math.round(kgToLb(p.weightKg) * 10) / 10 : p.weightKg;
    $('height-cm').value = Math.round(p.heightCm);
    const f = cmToFtIn(p.heightCm);
    $('height-ft').value = f.ft;
    $('height-in').value = f.inch;
    $('activity').value = p.activity;
    showTargets();
  }
  applyUnitsToForm();
  segSet('sex', ui.sex);
  segSet('goal-seg', ui.goal);
}

function showTargets() {
  const t = targets(state.profile);
  $('target-card').classList.remove('hidden');
  $('t-kcal').textContent = fmt(t.kcal);
  $('t-p').textContent = t.protein;
  $('t-c').textContent = t.carbs;
  $('t-f').textContent = t.fat;
  const goalWord = { lose: 'lose weight gently', maintain: 'stay where you are', gain: 'build up slowly' }[t.goal];
  let note = `Resting burn about ${fmt(t.bmr)} kcal, with activity about ${fmt(t.tdee)} kcal a day. To ${goalWord}, aim for ${fmt(t.kcal)}. Check the scale after 2 to 3 weeks and nudge it up or down by 100 to 150 kcal.`;
  if (t.minorForced) note += ' Because you are under 18 the goal is set to maintain. Growing bodies need their fuel.';
  if (t.floored) note += ' Raised to a safe minimum.';
  $('t-note').textContent = note;
}

for (const [id, key] of [['units', 'units'], ['sex', 'sex'], ['goal-seg', 'goal']]) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (key === 'units') {
      // convert what is typed so the number keeps meaning the same thing
      const wasImp = ui.units === 'imperial';
      const nowImp = b.dataset.v === 'imperial';
      if (wasImp !== nowImp) {
        const w = num($('weight').value);
        if (w > 0) $('weight').value = nowImp ? Math.round(kgToLb(w) * 10) / 10 : Math.round(lbToKg(w) * 10) / 10;
        if (wasImp) {
          const cm = ftInToCm(num($('height-ft').value) || 0, num($('height-in').value) || 0);
          if (cm > 0) $('height-cm').value = Math.round(cm);
        } else {
          const cm = num($('height-cm').value);
          if (cm > 0) { const f = cmToFtIn(cm); $('height-ft').value = f.ft; $('height-in').value = f.inch; }
        }
      }
    }
    ui[key] = b.dataset.v;
    if (key === 'units') applyUnitsToForm();
    segSet(id, b.dataset.v);
  });
}

$('save-profile').addEventListener('click', () => {
  const imp = ui.units === 'imperial';
  const w = num($('weight').value);
  const heightCm = imp ? ftInToCm(num($('height-ft').value) || 0, num($('height-in').value) || 0) : num($('height-cm').value);
  const profile = {
    sex: ui.sex,
    age: Math.round(num($('age').value)),
    heightCm: Math.round(heightCm * 10) / 10,
    weightKg: Math.round((imp ? lbToKg(w) : w) * 10) / 10,
    activity: $('activity').value,
    goal: ui.goal,
    units: ui.units,
  };
  const err = validateProfile(profile);
  $('profile-error').textContent = err || '';
  $('profile-error').classList.toggle('hidden', !err);
  if (err) return;
  const first = !state.profile;
  state.profile = profile;
  persist();
  $('welcome').classList.add('hidden');
  showTargets();
  toast('Goal saved');
  if (first) setTab('today');
});

// ---- backup ----------------------------------------------------------------------------------

$('export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'bitelog', version: 1, ...state }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bitelog-backup-${dateKey()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'bitelog' || typeof data.log !== 'object' || data.log === null) throw new Error('shape');
    if (!confirm('Replace everything in this app with the backup?')) return;
    state.profile = data.profile || null;
    state.log = data.log;
    state.weights = data.weights && typeof data.weights === 'object' ? data.weights : {};
    state.custom = Array.isArray(data.custom) ? data.custom : [];
    persist();
    if (state.profile) Object.assign(ui, { units: state.profile.units || 'metric', sex: state.profile.sex, goal: state.profile.goal });
    toast('Backup restored');
    setTab('today');
  } catch {
    toast('That file is not a BiteLog backup');
  }
});
$('reset').addEventListener('click', () => {
  if (!confirm('Delete your goal, food log and weights from this phone? This cannot be undone.')) return;
  Object.assign(state, { profile: null, log: {}, weights: {}, custom: [] });
  persist();
  toast('Everything deleted');
  setTab('profile');
});

// ---- boot ------------------------------------------------------------------------------------

wireShareButtons({ title: 'BiteLog', text: 'A simple calorie and macro tracker. Free, no sign-up:' });
registerOffline();
setTab(state.profile ? 'today' : 'profile');
