// Turns raw speech-to-text into readable notes using plain rules. No AI, no network: it all runs on the device.

const cap = (s) => s.replace(/^(\W*)([a-z])/, (_, a, b) => a + b.toUpperCase());

// Spoken punctuation. Order matters: longer phrases first.
const COMMANDS = [
  [/\bnew paragraph\b/gi, '\n\n'],
  [/\b(?:new line|next line)\b/gi, '\n'],
  [/\bbullet point\b/gi, '\n- '],
  [/\bquestion mark\b/gi, '?'],
  [/\bexclamation (?:mark|point)\b/gi, '!'],
  [/\bfull stop\b/gi, '.'],
  [/\bsemicolon\b/gi, ';'],
  [/\bcolon\b/gi, ':'],
  [/\bcomma\b/gi, ','],
  // "period" is also a common noun ("a period of time"), so it only counts as punctuation when it is not
  // sitting in a noun phrase.
  [/(?<!\b(?:the|a|an|this|that|his|her|their|my|our|one|same|long|short|first|last|next|each|every|trial|grace)\s)\bperiod\b(?!\s+(?:of|in|when|during|between|for|from|that|was|is|to)\b)/gi, '.'],
];

const FILLERS = /(?:^|\s)(?:u+m+|u+h+m*|e+r+m*|h+m+|mm+-?h+m+)(?=[\s,.!?]|$)[,.]?/gi;

// Short repeats are stutters ("I I think"); these legitimate doubles are left alone.
const KEEP_DOUBLE = new Set(['had', 'no', 'so', 'bye']);

export function removeFillers(text) {
  let t = text;
  t = t.replace(FILLERS, ' ');
  t = t.replace(/,\s*(?:you know|like|i mean),\s*/gi, ' ');
  t = t.replace(/(^|[.!?]\s+|\n)(?:you know|i mean|so yeah|well),\s*/gi, '$1');
  t = t.replace(/\b([a-z']{1,3})(?:\s+\1\b)+/gi, (m, w) => (KEEP_DOUBLE.has(w.toLowerCase()) ? m : w));
  return t;
}

export function applyCommands(text) {
  let t = text;
  for (const [re, out] of COMMANDS) t = t.replace(re, out);
  t = t.replace(/[ \t]+([.,!?;:])/g, '$1'); // "hello ." -> "hello."
  t = t.replace(/([.,!?;:])(?=[A-Za-z])/g, '$1 '); // "hello,world" -> "hello, world"
  return t;
}

const BREAK_BEFORE = /^(and then|also|anyway|next|but)\b/i;

// Chrome often returns one long unpunctuated stream. Break very long runs where a new thought starts.
export function splitRunOn(sentence) {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= 22 || /[.!?;:]/.test(sentence)) return sentence;
  const out = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    const rest = words.slice(i, i + 2).join(' ');
    if (cur.length >= 10 && words.length - i >= 4 && BREAK_BEFORE.test(rest)) {
      out.push(cur.join(' ') + '.');
      cur = [];
    }
    cur.push(words[i]);
  }
  out.push(cur.join(' '));
  return out.join(' ');
}

const DAYS_MONTHS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|august|september|october|november|december)\b/g;

function polishLine(line, english) {
  let l = line.replace(/\s+/g, ' ').trim();
  if (!l) return '';
  const bullet = /^-\s+/.test(l);
  if (bullet) l = l.replace(/^-\s+/, '');
  if (english) {
    l = splitRunOn(l);
    l = l.replace(/\bi(?=\s|$|'(?:m|ll|ve|d)\b)/g, 'I');
    l = l.replace(DAYS_MONTHS, (w) => w[0].toUpperCase() + w.slice(1));
  }
  l = cap(l);
  l = l.replace(/([.!?])\s+([a-z])/g, (_, p, c) => `${p} ${c.toUpperCase()}`);
  if (!/[.!?:]$/.test(l) && !bullet) l += '.';
  return bullet ? '- ' + l : l;
}

// english: false keeps to capitals and full stops. The filler and command rules are English words, and in
// other languages they could eat real ones (German "er" means "he").
export function tidy(text, { commands = true, english = true } = {}) {
  let t = String(text || '');
  if (english && commands) t = applyCommands(t);
  if (english) t = removeFillers(t);
  const lines = t.split('\n').map((l) => polishLine(l, english));
  // keep single blank lines between paragraphs, drop runs of them
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function sentences(text) {
  return String(text || '')
    .split(/\n+|(?<=[.!?])\s+/)
    .flatMap((s) => s.split(/,?\s+and then\s+/i))
    .map((s) => s.replace(/^-\s*/, '').replace(/[.!?]+$/, '').trim())
    .filter(Boolean);
}

export function toBullets(text) {
  return sentences(tidy(text)).map((s) => '- ' + cap(s)).join('\n');
}

const ACTION = /\b(need to|needs to|have to|has to|got to|must|should|remember to|don't forget|do not forget|remind me to|call|email|text|buy|send|book|schedule|pick up|order|pay|finish|fix|ask|check|follow up)\b/i;
const LEAD = /^(?:(?:i|we)\s+)?(?:(?:still\s+)?(?:need to|have to|got to|should|must|remember to|don't forget to|do not forget to|remind me to)\s+|(?:i'll|i will|we'll|we will)\s+)/i;

// Pulls out the lines that sound like things to do. Returns '' when there are none.
export function toTodos(text) {
  const items = sentences(tidy(text))
    .filter((s) => ACTION.test(s))
    .map((s) => s.replace(LEAD, '').trim())
    .filter(Boolean)
    .map((s) => '- [ ] ' + cap(s));
  return items.join('\n');
}

export function wordCount(text) {
  const m = String(text || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function makeTitle(text) {
  let first = sentences(tidy(text))[0] || '';
  first = first.replace(/^(?:(?:so|ok|okay|yeah|well|right|alright|and)\b[,\s]*)+/i, '');
  const words = first.split(/\s+/).filter(Boolean);
  if (!words.length) return 'Untitled note';
  const t = cap(words.slice(0, 6).join(' ').replace(/[,;:]+$/, ''));
  return words.length > 6 ? t + '...' : t;
}
