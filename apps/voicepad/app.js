import { load, save } from '../shared/storage.js';
import { wireShareButtons, toast } from '../shared/share.js';
import { registerOffline } from '../shared/pwa.js';
import { tidy, toBullets, toTodos, makeTitle, wordCount } from './clean.js';

const KEY = 'voicepad:v1';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const LANGS = [
  ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['en-AU', 'English (Australia)'], ['en-IN', 'English (India)'],
  ['de-DE', 'Deutsch'], ['es-ES', 'Español (España)'], ['es-MX', 'Español (México)'], ['fr-FR', 'Français'],
  ['it-IT', 'Italiano'], ['pt-BR', 'Português (Brasil)'], ['nl-NL', 'Nederlands'], ['pl-PL', 'Polski'],
  ['tr-TR', 'Türkçe'], ['ja-JP', '日本語'], ['ko-KR', '한국어'], ['hi-IN', 'हिन्दी'],
];

const state = { notes: [], lang: '', commands: true, auto: true, draft: { id: null, text: '' }, ...load(KEY, {}) };
const persist = () => save(KEY, state);
if (!state.lang) {
  const nav = (navigator.language || 'en-US').toLowerCase();
  state.lang = (LANGS.find(([c]) => c.toLowerCase() === nav) || LANGS.find(([c]) => c.slice(0, 2) === nav.slice(0, 2)) || LANGS[0])[0];
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const isEnglish = () => state.lang.startsWith('en');
const tidyOpts = () => ({ commands: state.commands, english: isEnglish() });
const ta = $('text');
let undoStack = [];
let currentId = state.draft.id;

// ---- editor ----------------------------------------------------------------------------------

function refresh() {
  $('count').textContent = `${wordCount(ta.value)} words`;
  $('undo').disabled = undoStack.length === 0;
  state.draft = { id: currentId, text: ta.value };
  persist();
}

function setText(text, { undoable = true } = {}) {
  if (undoable && text !== ta.value) undoStack.push(ta.value);
  if (undoStack.length > 30) undoStack.shift();
  ta.value = text;
  refresh();
}

ta.addEventListener('input', refresh);
$('tidy').addEventListener('click', () => {
  if (!ta.value.trim()) return toast('Nothing to tidy yet');
  setText(tidy(ta.value, tidyOpts()));
});
$('bullets').addEventListener('click', () => {
  if (!ta.value.trim()) return toast('Nothing to turn into bullets');
  setText(toBullets(ta.value));
});
$('todos').addEventListener('click', () => {
  if (!isEnglish()) return toast('To-do detection works in English only');
  const out = toTodos(ta.value);
  if (!out) return toast('No to-dos found. Say things like "I need to call Sam"');
  setText(out);
});
$('undo').addEventListener('click', () => {
  if (!undoStack.length) return;
  ta.value = undoStack.pop();
  refresh();
});
$('auto').addEventListener('change', (e) => { state.auto = e.target.checked; persist(); });
$('commands').addEventListener('change', (e) => { state.commands = e.target.checked; persist(); });
$('lang').addEventListener('change', (e) => {
  state.lang = e.target.value;
  persist();
  if (listening) { stopListening(); setTimeout(startListening, 250); }
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(ta.value);
    toast('Copied');
  } catch {
    ta.select();
    toast('Select and copy it by hand');
  }
});
$('download').addEventListener('click', () => {
  if (!ta.value.trim()) return toast('Nothing to download');
  const blob = new Blob([ta.value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (makeTitle(ta.value).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'note') + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('new').addEventListener('click', () => {
  if (ta.value.trim() && !state.notes.some((n) => n.id === currentId && n.text === ta.value) && !confirm('Start a new note? The current text is not saved.')) return;
  stopListening();
  currentId = null;
  undoStack = [];
  setText('', { undoable: false });
  renderNotes();
});

// ---- notes -----------------------------------------------------------------------------------

$('save').addEventListener('click', () => {
  const text = ta.value.trim();
  if (!text) return toast('Nothing to save yet');
  stopListening();
  const title = makeTitle(text);
  const existing = state.notes.find((n) => n.id === currentId);
  if (existing) Object.assign(existing, { title, text, ts: Date.now() });
  else {
    currentId = Math.random().toString(36).slice(2, 10);
    state.notes.unshift({ id: currentId, title, text, ts: Date.now() });
  }
  state.notes.sort((a, b) => b.ts - a.ts);
  refresh();
  renderNotes();
  toast('Saved');
});

function renderNotes() {
  $('notes-section').classList.toggle('hidden', state.notes.length === 0);
  $('notes').innerHTML = state.notes.map((n) => `
    <div class="note-item" role="button" tabindex="0" data-open="${n.id}">
      <div class="grow"><div class="t">${esc(n.title)}</div><div class="p">${esc(n.text)}</div>
      <div class="m">${new Date(n.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} &middot; ${wordCount(n.text)} words</div></div>
      <button class="note-del" data-del="${n.id}" aria-label="Delete ${esc(n.title)}">&times;</button>
    </div>`).join('');
}

function openNote(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n) return;
  stopListening();
  currentId = n.id;
  undoStack = [];
  setText(n.text, { undoable: false });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('notes').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    if (!confirm('Delete this note?')) return;
    state.notes = state.notes.filter((n) => n.id !== del.dataset.del);
    if (currentId === del.dataset.del) currentId = null;
    refresh();
    renderNotes();
    return;
  }
  const open = e.target.closest('[data-open]');
  if (open) openNote(open.dataset.open);
});
$('notes').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const open = e.target.closest('[data-open]');
  if (open && e.target === open) { e.preventDefault(); openNote(open.dataset.open); }
});

// ---- listening -------------------------------------------------------------------------------

let rec = null;
let listening = false; // what the person asked for
let running = false; // what the browser is actually doing
let failed = false; // the last attempt ended in an error we have already shown
const isAndroid = /android/i.test(navigator.userAgent);

function setStatus(msg, err = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('err', err);
}

function appendFinal(text) {
  const t = text.trim();
  if (!t) return;
  const sep = ta.value && !/\s$/.test(ta.value) ? ' ' : '';
  setText(ta.value + sep + t, { undoable: false });
  ta.scrollTop = ta.scrollHeight;
}

function buildRecognizer() {
  const r = new SR();
  r.lang = state.lang;
  r.interimResults = true;
  r.continuous = !isAndroid; // Android Chrome repeats phrases in continuous mode, so restart per phrase instead
  r.onstart = () => { running = true; setStatus('Listening... tap to stop'); };
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      if (res.isFinal) appendFinal(res[0].transcript);
      else interim += res[0].transcript;
    }
    $('interim').textContent = interim;
  };
  r.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return; // normal, onend restarts
    listening = false;
    failed = true;
    const msg = {
      'not-allowed': 'Microphone blocked. Allow it for this site in your browser settings.',
      'service-not-allowed': 'Speech is turned off on this device. Check your browser or phone settings.',
      'audio-capture': 'No microphone found.',
      network: 'Speech needs an internet connection. Check it and try again.',
      'language-not-supported': 'This language is not supported by your browser.',
    }[e.error] || 'Could not listen (' + e.error + ').';
    setStatus(msg, true);
  };
  r.onend = () => {
    running = false;
    $('interim').textContent = '';
    if (listening) {
      setTimeout(() => { if (listening && !running) startRecognizer(); }, 150); // browsers stop on silence, keep going
    } else {
      finishSession();
    }
  };
  return r;
}

function startRecognizer() {
  try {
    rec = buildRecognizer();
    rec.start();
  } catch {
    listening = false;
    setStatus('Could not start the microphone. Tap to try again.', true);
    syncMic();
  }
}

function syncMic() {
  $('mic').setAttribute('aria-pressed', String(listening));
  $('mic').setAttribute('aria-label', listening ? 'Stop talking' : 'Start talking');
}

function startListening() {
  if (!SR || listening) return;
  listening = true;
  failed = false;
  setStatus('Starting...');
  syncMic();
  startRecognizer();
}

function stopListening() {
  if (!listening && !running) return;
  listening = false;
  syncMic();
  try { rec?.stop(); } catch { /* already stopped */ }
}

let hadSession = false;
function finishSession() {
  syncMic();
  if (failed) return; // keep the error message on screen
  setStatus(ta.value.trim() ? 'Done. Tidy up, or save it.' : 'Tap and start talking');
  if (hadSession && state.auto && ta.value.trim()) setText(tidy(ta.value, tidyOpts()));
  hadSession = false;
}

$('mic').addEventListener('click', () => {
  if (listening) stopListening();
  else { hadSession = true; startListening(); }
});

// ---- boot ------------------------------------------------------------------------------------

$('lang').innerHTML = LANGS.map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
$('lang').value = state.lang;
$('auto').checked = state.auto;
$('commands').checked = state.commands;
if (!SR) {
  $('no-speech').classList.remove('hidden');
  $('mic').disabled = true;
  setStatus('Typing works. Listening needs Chrome, Edge or Safari.');
}
ta.value = state.draft.text || '';
refresh();
renderNotes();
wireShareButtons({ title: 'Voicepad', text: 'Talk and get tidy notes. Free, no sign-up:' });
registerOffline();
