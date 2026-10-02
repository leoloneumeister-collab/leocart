// Original music, written as pattern data. Each style is an 8-bar loop on a 16-step grid.
//
// Notes are scale degrees (0 = the style's root, negative goes below), '.' is a rest.
// The engine turns them into notes using the style's scale, so every melody stays in key.
// Bass patterns: r = root, f = fifth, o = octave. Drum lanes: x = hit (hats also g = ghost, o = open).

const p = (s) => s.trim().split(/\s+/).map((t) => (t === '.' ? null : Number(t)));
const bars = (...rows) => rows.map(p);

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN_DOMINANT = [0, 1, 4, 5, 7, 8, 10];

export const STYLES = {
  // Meadow Run: bright, bouncy C major.
  sunny: {
    bpm: 132,
    root: 60,
    scale: MAJOR,
    leadOct: 1,
    bassOct: -14,
    chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7], [0, 2, 4], [4, 6, 8], [3, 5, 7], [4, 6, 8]],
    lead: bars(
      '2 . 2 . 3 2 0 . 4 . 2 . 0 . . .',
      '1 . 1 . 2 1 -1 . 4 . 1 . -1 . . .',
      '2 . 2 . 3 2 -2 . 7 . 2 . -2 . . .',
      '3 . 3 . 4 3 0 . 5 . 3 . 0 . 4 5',
      '4 . 4 . 5 4 2 . 7 . 4 . 2 . . .',
      '6 . 6 . 7 6 4 . 8 . 6 . 4 . . .',
      '5 . 5 . 7 5 3 . 5 . 3 . 5 . 7 .',
      '6 . 4 . 6 . 8 . 9 . 8 . 6 . . .',
    ),
    bass: [...'r..r..f.r..r..f.'],
    stabs: [2, 6, 10, 14],
    drums: {
      kick: [...'x...x...x...x...'],
      snare: [...'....x.......x...'],
      hat: [...'g.x.g.x.g.x.gxo.'],
    },
    voices: {
      lead: { type: 'square', gain: 0.07, atk: 0.008, rel: 0.08, len: 2, lp: 3600, double: 9 },
      bass: { type: 'triangle', gain: 0.24, lp: 700, len: 2.2 },
      stab: { type: 'square', gain: 0.03, lp: 2200 },
    },
  },

  // Dune Canyon: slow, hypnotic phrygian-dominant with darbuka percussion.
  desert: {
    bpm: 104,
    root: 62,
    scale: PHRYGIAN_DOMINANT,
    leadOct: 0,
    bassOct: -14,
    padOff: -7,
    pad: true,
    chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [1, 3, 5], [0, 2, 4], [6, 8, 10], [1, 3, 5], [0, 2, 4]],
    lead: bars(
      '4 . 5 . 4 . 2 . 1 . 2 . 0 . . .',
      '5 . 7 . 5 . 4 . 3 . 4 . 1 . . .',
      '4 . 5 . 7 . 8 . 9 . 8 . 7 . 5 .',
      '7 . 5 . 4 . 2 . 1 . 2 . 4 . . .',
      '4 . 5 . 4 . 2 . 1 . 2 . 0 . . .',
      '6 . 7 . 8 . 7 . 6 . 4 . 5 . . .',
      '5 . 4 . 3 . 4 . 5 . 7 . 8 . 7 .',
      '9 . . . 7 . . . 4 . 2 . 0 . . .',
    ),
    bass: [...'r.r.r.o.r.r.r.r.'],
    drums: {
      vol: 0.8,
      kick: [...'x.......x.......'],
      perc: [...'d.t.kt.kd.d.t.k.'],
      hat: [...'g.g.g.g.g.g.g.g.'],
    },
    voices: {
      lead: { type: 'sawtooth', gain: 0.06, atk: 0.02, rel: 0.14, len: 2.6, lp: 2400, double: 6 },
      bass: { type: 'sawtooth', gain: 0.17, lp: 440, len: 2 },
      pad: { type: 'sawtooth', gain: 0.045, atk: 0.5, rel: 0.6, lp: 800 },
    },
  },

  // Neon District: night-drive synthwave, A minor.
  night: {
    bpm: 122,
    root: 57,
    scale: MINOR,
    leadOct: 1,
    arpOct: 1,
    bassOct: -7,
    pad: true,
    chords: [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10], [0, 2, 4], [5, 7, 9], [6, 8, 10], [4, 6, 8]],
    arp: p('0 1 2 4 2 1 2 1 0 1 2 4 2 1 5 4'),
    lead: bars(
      '7 . . . 6 . 4 . 7 . . . 4 . . .',
      '5 . . . 7 . 9 . 7 . . . 5 . . .',
      '9 . . . 8 . 6 . 4 . . . 2 . . .',
      '6 . 8 . 10 . . . 8 . 6 . 4 . . .',
      '7 . . . 9 . 11 . 9 . . . 7 . . .',
      '10 . . . 9 . 7 . 5 . . . 7 . . .',
      '8 . 10 . 11 . 10 . 8 . 6 . 8 . . .',
      '9 . . . . . . . 8 . . . . . . .',
    ),
    bass: [...'r.rr.rr.r.rr.rr.'],
    drums: {
      kick: [...'x...x...x...x...'],
      clap: [...'....x.......x...'],
      hat: [...'x.x.x.x.x.x.x.xo'],
    },
    voices: {
      lead: { type: 'square', gain: 0.055, atk: 0.01, rel: 0.2, len: 3, lp: 3200, double: 12 },
      arp: { type: 'sawtooth', gain: 0.045, lp: 2600, len: 1.3 },
      bass: { type: 'sawtooth', gain: 0.18, lp: 520, len: 1.6 },
      pad: { type: 'sawtooth', gain: 0.04, atk: 0.35, rel: 0.5, lp: 1100 },
    },
  },

  // Menus: slow and mellow.
  menu: {
    bpm: 92,
    root: 53,
    scale: MAJOR,
    leadOct: 1,
    bassOct: -7,
    pad: true,
    chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
    lead: bars(
      '4 . . . 2 . . . 0 . . . 2 . . .',
      '5 . . . 4 . . . 2 . . . 4 . . .',
      '3 . . . 5 . . . 7 . . . 5 . . .',
      '6 . . . 4 . . . 2 . . . . . . .',
    ),
    bass: [...'r.......r.....f.'],
    drums: {
      vol: 0.5,
      kick: [...'x.......x.......'],
      snare: [...'........x.......'],
      hat: [...'..g...g...g...g.'],
    },
    voices: {
      lead: { type: 'sine', gain: 0.09, atk: 0.01, rel: 0.5, len: 4, double: 5 },
      bass: { type: 'triangle', gain: 0.22, lp: 500, len: 3 },
      pad: { type: 'triangle', gain: 0.06, atk: 0.6, rel: 0.8, lp: 900 },
    },
  },
};
