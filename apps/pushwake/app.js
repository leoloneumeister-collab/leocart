import { load, save } from '../shared/storage.js';
import { wireShareButtons, toast } from '../shared/share.js';
import { registerOffline } from '../shared/pwa.js';
import { RepCounter, SENSITIVITY } from './counter.js';
import { nextRing, formatCountdown, updateStreak, liveStreak, dateKey } from './alarm.js';
import { AlarmSound } from './sound.js';

const KEY = 'pushwake:v1';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const GIVE_UP_MS = 5000;

const saved = load(KEY, {});
const state = {
  time: '07:00',
  days: [false, true, true, true, true, true, false],
  reps: 10,
  mode: 'camera',
  sens: 'normal',
  streak: { count: 0, last: null },
  ...saved,
};
if (!Array.isArray(state.days) || state.days.length !== 7) state.days = [false, true, true, true, true, true, false];
if (!SENSITIVITY[state.sens]) state.sens = 'normal';

const $ = (id) => document.getElementById(id);
const sound = new AlarmSound();
const persist = () => save(KEY, state);

let armed = null; // { target: Date, test: boolean }
let armTimer = null;
let session = null; // the ringing or practising round
let wake = null;

// ---- views ---------------------------------------------------------------------------------

function show(name) {
  for (const v of ['home', 'armed', 'ring', 'done']) $('view-' + v).classList.toggle('hidden', v !== name);
  window.scrollTo(0, 0);
}

function fmtClock(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function describeTarget(d) {
  const today = dateKey(new Date());
  const tomorrow = dateKey(new Date(Date.now() + 86400000));
  const k = dateKey(d);
  const day = k === today ? 'today' : k === tomorrow ? 'tomorrow' : DAY_NAMES[d.getDay()];
  return `${day} at ${fmtClock(d)}`;
}

// ---- home ----------------------------------------------------------------------------------

function renderHome() {
  $('time').value = state.time;
  $('reps-out').textContent = state.reps;
  document.querySelectorAll('#days .chip').forEach((chip, i) => chip.setAttribute('aria-pressed', String(state.days[i])));
  document.querySelectorAll('#mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  document.querySelectorAll('#sens button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sens === state.sens)));
  $('sens-field').classList.toggle('hidden', state.mode !== 'camera');
  const live = liveStreak(state.streak, dateKey());
  $('streak').hidden = live === 0;
  $('streak-n').textContent = live;
}

function buildDays() {
  const box = $('days');
  DAY_LETTERS.forEach((letter, i) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = letter;
    b.setAttribute('aria-label', DAY_NAMES[i]);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      state.days[i] = !state.days[i];
      persist();
      renderHome();
    });
    box.appendChild(b);
  });
}

function tickClock() {
  $('now').textContent = fmtClock(new Date());
}

$('time').addEventListener('change', (e) => { state.time = e.target.value || state.time; persist(); });
$('reps-minus').addEventListener('click', () => { state.reps = Math.max(3, state.reps - 1); persist(); renderHome(); });
$('reps-plus').addEventListener('click', () => { state.reps = Math.min(50, state.reps + 1); persist(); renderHome(); });
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const p = b.dataset.preset;
  state.days = p === 'weekdays' ? [false, true, true, true, true, true, false] : p === 'every' ? Array(7).fill(true) : Array(7).fill(false);
  persist();
  renderHome();
}));
document.querySelectorAll('#mode button').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; persist(); renderHome(); }));
document.querySelectorAll('#sens button').forEach((b) => b.addEventListener('click', () => { state.sens = b.dataset.sens; persist(); renderHome(); }));

function notice(msg) {
  $('notice').textContent = msg || '';
  $('notice').classList.toggle('hidden', !msg);
}

// ---- camera --------------------------------------------------------------------------------

async function openStream() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no-api'), { name: 'NoApi' });
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }, audio: false });
}

// Ask for permission now, while the person is awake and watching, not at 6am.
async function checkCamera() {
  try {
    const s = await openStream();
    s.getTracks().forEach((t) => t.stop());
    return null;
  } catch (e) {
    if (e.name === 'NoApi') return 'This browser will not let the page use the camera. Open it over https, or use Tap mode.';
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'The camera is blocked. Allow it for this site in your browser settings, or switch to Tap mode.';
    return 'No camera found. Use Tap mode instead.';
  }
}

function lumaOf(ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4) / 255;
}

// ---- arming --------------------------------------------------------------------------------

async function holdScreen() {
  try {
    wake = (await navigator.wakeLock?.request('screen')) || null;
  } catch {
    wake = null;
  }
}
function releaseScreen() {
  try { wake?.release(); } catch { /* ignore */ }
  wake = null;
}

function guardClose(e) {
  e.preventDefault();
  e.returnValue = '';
}

async function beginArming(target, test) {
  notice('');
  sound.unlock(); // this tap is what lets the alarm make noise later
  if (state.mode === 'camera') {
    $('arm').disabled = true;
    const problem = await checkCamera();
    $('arm').disabled = false;
    if (problem) {
      notice(problem);
      return;
    }
  }
  armed = { target, test };
  $('armed-title').textContent = test ? 'Test ring' : 'Alarm set for ' + describeTarget(target);
  $('armed-sub').textContent = `${state.reps} pushups to stop it, counted by ${state.mode === 'camera' ? 'the camera' : 'tapping'}`;
  show('armed');
  holdScreen();
  window.addEventListener('beforeunload', guardClose);
  clearInterval(armTimer);
  armTimer = setInterval(armTick, 500);
  armTick();
}

function armTick() {
  if (!armed) return;
  const ms = armed.target.getTime() - Date.now();
  if (ms <= 0) {
    startRound({ practice: false });
    return;
  }
  $('countdown').textContent = formatCountdown(ms);
}

function disarm() {
  armed = null;
  clearInterval(armTimer);
  window.removeEventListener('beforeunload', guardClose);
  releaseScreen();
}

$('arm').addEventListener('click', () => {
  const target = nextRing({ time: state.time, days: state.days });
  if (!target) {
    notice('Pick a valid time first.');
    return;
  }
  beginArming(target, false);
});
$('test-ring').addEventListener('click', () => beginArming(new Date(Date.now() + 10000), true));
$('disarm').addEventListener('click', () => {
  disarm();
  show('home');
  renderHome();
});

// ---- the round: ringing or practising ------------------------------------------------------

async function startRound({ practice }) {
  const wasTest = armed?.test;
  disarm();
  holdScreen();
  window.addEventListener('beforeunload', guardClose);
  const total = state.reps;
  const s = {
    practice,
    wasTest: !!wasTest,
    total,
    done: 0,
    counter: new RepCounter(SENSITIVITY[state.sens]),
    stream: null,
    sampler: null,
    vibrator: null,
    lastTap: 0,
    canvas: document.createElement('canvas'),
  };
  s.canvas.width = 24;
  s.canvas.height = 18;
  s.ctx = s.canvas.getContext('2d', { willReadFrequently: true });
  session = s;

  const ring = $('view-ring');
  ring.classList.toggle('practice', practice);
  $('ring-title').textContent = practice ? 'PRACTISE' : 'WAKE UP';
  $('ring-sub').textContent = practice ? 'Phone face up on the floor. Pushups over the screen.' : `Do ${total} pushups to stop the alarm.`;
  $('rep-total').textContent = total;
  $('stop-practice').classList.toggle('hidden', !practice);
  $('giveup').classList.toggle('hidden', practice);
  updateRound();
  show('ring');

  if (!practice) {
    sound.start();
    if (navigator.vibrate) {
      navigator.vibrate([500, 250, 500]);
      s.vibrator = setInterval(() => navigator.vibrate([500, 250, 500]), 1500);
    }
  }

  const tapOnly = state.mode === 'tap';
  $('tap-rep').classList.toggle('hidden', !tapOnly);
  $('cam').classList.toggle('off', tapOnly);
  $('meter').parentElement.classList.toggle('hidden', tapOnly);
  $('ring-hint').textContent = tapOnly ? 'Tap the button after each pushup.' : 'Starting the camera...';
  if (!tapOnly) {
    try {
      s.stream = await openStream();
      if (session !== s) { s.stream.getTracks().forEach((t) => t.stop()); return; }
      $('cam').srcObject = s.stream;
      $('cam').play().catch(() => {});
      $('ring-hint').textContent = 'Lower your chest over the screen.';
      s.sampler = setInterval(() => sample(s), 66);
    } catch {
      $('ring-hint').textContent = 'Camera unavailable, so tap after each pushup.';
      $('tap-rep').classList.remove('hidden');
      $('cam').classList.add('off');
      $('meter').parentElement.classList.add('hidden');
    }
  }
}

function sample(s) {
  const cam = $('cam');
  if (session !== s || cam.readyState < 2) return;
  s.ctx.drawImage(cam, 0, 0, s.canvas.width, s.canvas.height);
  const snap = s.counter.push(lumaOf(s.ctx, s.canvas.width, s.canvas.height), performance.now());
  $('meter').style.width = Math.round(snap.level * 100) + '%';
  if (snap.tooDark) $('ring-hint').textContent = 'Too dark to see you. Turn a light on, or switch to Tap mode.';
  else if ($('ring-hint').textContent.startsWith('Too dark')) $('ring-hint').textContent = 'Lower your chest over the screen.';
  if (snap.counted) addRep();
}

function addRep() {
  const s = session;
  if (!s) return;
  s.done += 1;
  sound.blip(520 + 40 * Math.min(s.done, 20));
  if (!s.practice) sound.setScale(1 - 0.75 * (s.done / s.total));
  updateRound();
  if (s.done >= s.total) finishRound();
}

function updateRound() {
  $('rep-n').textContent = session ? session.done : 0;
}

$('tap-rep').addEventListener('click', () => {
  const s = session;
  if (!s || performance.now() - s.lastTap < 350) return; // no machine-gun tapping
  s.lastTap = performance.now();
  addRep();
});

function endRound() {
  const s = session;
  session = null;
  if (!s) return null;
  clearInterval(s.sampler);
  clearInterval(s.vibrator);
  navigator.vibrate?.(0);
  s.stream?.getTracks().forEach((t) => t.stop());
  $('cam').srcObject = null;
  sound.stop();
  window.removeEventListener('beforeunload', guardClose);
  releaseScreen();
  cancelGiveUp();
  return s;
}

function finishRound() {
  const s = endRound();
  if (!s) return;
  if (s.practice) {
    toast(`Nice, ${s.total} reps counted`);
    show('home');
    renderHome();
    return;
  }
  sound.success();
  if (!s.wasTest) {
    state.streak = updateStreak(state.streak, dateKey());
    persist();
  }
  const live = liveStreak(state.streak, dateKey());
  $('done-sub').textContent = s.wasTest ? 'That was only a test. Tomorrow it counts.' : `${s.total} pushups done. Your day starts now.`;
  $('done-streak').textContent = !s.wasTest && live > 0 ? `🔥 ${live} ${live === 1 ? 'morning' : 'mornings'} in a row` : '';
  const repeating = state.days.some(Boolean);
  $('done-keep').classList.toggle('hidden', !repeating || s.wasTest);
  show('done');
}

$('practice').addEventListener('click', () => { sound.unlock(); startRound({ practice: true }); });
$('stop-practice').addEventListener('click', () => { endRound(); show('home'); renderHome(); });
$('done-ok').addEventListener('click', () => { show('home'); renderHome(); });
$('done-keep').addEventListener('click', () => {
  const target = nextRing({ time: state.time, days: state.days });
  if (target) beginArming(target, false);
});

// ---- give up: hold the button for five seconds ---------------------------------------------

let giveUp = null;
function startGiveUp() {
  if (giveUp) return;
  const t0 = performance.now();
  const bar = $('giveup-bar');
  giveUp = { raf: 0 };
  const step = () => {
    const p = Math.min(1, (performance.now() - t0) / GIVE_UP_MS);
    bar.style.width = p * 100 + '%';
    if (p >= 1) {
      cancelGiveUp();
      endRound();
      show('home');
      renderHome();
      toast('Alarm stopped. Tomorrow, then.');
      return;
    }
    giveUp.raf = requestAnimationFrame(step);
  };
  giveUp.raf = requestAnimationFrame(step);
}
function cancelGiveUp() {
  if (!giveUp) return;
  cancelAnimationFrame(giveUp.raf);
  giveUp = null;
  $('giveup-bar').style.width = '0';
}
const gu = $('giveup');
['pointerdown'].forEach((ev) => gu.addEventListener(ev, startGiveUp));
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => gu.addEventListener(ev, cancelGiveUp));
gu.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- boot ----------------------------------------------------------------------------------

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (armed || session) holdScreen();
    armTick();
  }
});

wireShareButtons({ title: 'Pushwake', text: 'An alarm that only stops when you do your pushups. Try it:' });
buildDays();
renderHome();
tickClock();
setInterval(tickClock, 1000);
registerOffline();
