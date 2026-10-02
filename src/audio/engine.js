// Procedural audio. No samples anywhere: every sound effect, engine note and music track
// is synthesised with the Web Audio API, and the music is composed as pattern data.

import { clamp } from '../util/math.js';
import { settings } from '../game/settings.js';
import { STYLES } from './music.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class EngineVoice {
  constructor(audio, bus, baseHz) {
    const ctx = audio.ctx;
    this.ctx = ctx;
    this.base = baseHz;
    this.a = ctx.createOscillator();
    this.a.type = 'sawtooth';
    this.b = ctx.createOscillator();
    this.b.type = 'square';
    this.bGain = ctx.createGain();
    this.bGain.gain.value = 0.35;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 2.2;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.a.connect(this.filter);
    this.b.connect(this.bGain);
    this.bGain.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.pan);
    this.pan.connect(bus);
    this.a.start();
    this.b.start();
  }

  set(freq, cutoff, vol, pan) {
    const t = this.ctx.currentTime;
    this.a.frequency.setTargetAtTime(freq, t, 0.06);
    this.b.frequency.setTargetAtTime(freq * 0.503, t, 0.06);
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.08);
    this.gain.gain.setTargetAtTime(vol, t, 0.08);
    this.pan.pan.setTargetAtTime(pan, t, 0.1);
  }

  stop() {
    try {
      this.a.stop();
      this.b.stop();
    } catch {
      /* already stopped */
    }
    this.pan.disconnect();
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.music = { style: null, timer: null, step: 0, next: 0, tempoMult: 1, playing: false };
    this.voices = [];
    this.loops = null;
    this.paused = false;
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { once: false, passive: true });
  }

  unlock() {
    if (this.unlocked) {
      if (this.ctx && this.ctx.state === 'suspended' && !this.paused) this.ctx.resume();
      return;
    }
    let ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    this._init(ctx);
  }

  /** Build the mixer graph on a context. Also used with an OfflineAudioContext by the audio test. */
  _init(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.2;
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.engineBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.engineBus.connect(this.sfxBus);
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // one shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.unlocked = true;
    this.applyVolumes();
    if (ctx.state === 'suspended') ctx.resume?.().catch?.(() => {});
    if (this.pendingMusic) this.startMusic(this.pendingMusic);
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(settings.music * 0.55, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(settings.sfx * 0.9, t, 0.03);
  }

  pause(on) {
    this.paused = on;
    if (!this.ctx) return;
    if (on) this.ctx.suspend();
    else this.ctx.resume();
  }

  // ------------------------------------------------------------------ primitives

  _tone(type, f0, t, dur, { gain = 0.2, attack = 0.005, release = 0.08, f1, dest, pan = 0, detune = 0, lp } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.01);
    let node = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    let out = g;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(dest || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(t, dur, { gain = 0.2, type = 'bandpass', f0 = 1000, f1, q = 1, attack = 0.005, dest, pan = 0 } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    let out = g;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      out = p;
    }
    out.connect(dest || this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ sound effects

  sfx(name, { gain = 1, pan = 0, rate = 1 } = {}) {
    if (!this.ctx || this.paused) return;
    const t = this.ctx.currentTime + 0.005;
    const G = (v) => v * gain;
    switch (name) {
      case 'hover':
      case 'move':
        this._tone('sine', 880, t, 0.07, { gain: G(0.13), release: 0.04, pan });
        break;
      case 'click':
        this._tone('square', 520, t, 0.05, { gain: G(0.09) });
        this._tone('square', 780, t + 0.05, 0.08, { gain: G(0.09) });
        break;
      case 'back':
        this._tone('square', 600, t, 0.05, { gain: G(0.08) });
        this._tone('square', 380, t + 0.05, 0.09, { gain: G(0.08) });
        break;
      case 'count':
        this._tone('square', 440, t, 0.22, { gain: G(0.18), release: 0.1 });
        break;
      case 'go':
        for (const [i, f] of [660, 880, 1320].entries()) this._tone('square', f, t, 0.6, { gain: G(0.12), release: 0.4, detune: i * 4 });
        break;
      case 'driftStart':
        this._noise(t, 0.3, { gain: G(0.9), f0: 2400, f1: 1500, q: 2.5, pan });
        break;
      case 'driftLevel':
        this._tone('sine', 880 * rate, t, 0.1, { gain: G(0.14) });
        this._tone('sine', 1320 * rate, t + 0.05, 0.14, { gain: G(0.12) });
        break;
      case 'miniTurbo':
        this._noise(t, 0.5, { gain: G(0.22), type: 'highpass', f0: 500, f1: 3500, q: 0.8 });
        this._tone('sawtooth', 160, t, 0.45, { gain: G(0.14), f1: 520, lp: 2400 });
        break;
      case 'boostItem':
        this._noise(t, 0.8, { gain: G(0.26), type: 'highpass', f0: 400, f1: 4200, q: 0.8, pan });
        this._tone('sawtooth', 120, t, 0.7, { gain: G(0.16), f1: 700, lp: 2600, pan });
        break;
      case 'boost':
        this._noise(t, 0.4, { gain: G(0.14), type: 'highpass', f0: 600, f1: 3000, pan });
        break;
      case 'pad':
        this._tone('square', 300, t, 0.25, { gain: G(0.14), f1: 1400 });
        this._noise(t, 0.3, { gain: G(0.12), type: 'highpass', f0: 1000, f1: 5000 });
        break;
      case 'bump':
        this._tone('sine', 140, t, 0.16, { gain: G(0.28), f1: 50, pan });
        this._noise(t, 0.12, { gain: G(0.14), type: 'lowpass', f0: 900, f1: 200, pan });
        break;
      case 'hit':
        this._noise(t, 0.55, { gain: G(0.3), f0: 1800, f1: 300, q: 0.9, pan });
        this._tone('sawtooth', 420, t, 0.7, { gain: G(0.2), f1: 55, lp: 1800, pan });
        this._tone('square', 200, t + 0.05, 0.5, { gain: G(0.1), f1: 70, pan });
        break;
      case 'shield':
        for (const [i, f] of [600, 900, 1350].entries()) this._tone('sine', f, t + i * 0.05, 0.5, { gain: G(0.1), f1: f * 1.4 });
        break;
      case 'shieldBreak':
        this._noise(t, 0.4, { gain: G(0.22), type: 'highpass', f0: 4000, f1: 1200, pan });
        this._tone('triangle', 1800, t, 0.3, { gain: G(0.12), f1: 300, pan });
        break;
      case 'itemGet':
        [0, 4, 7, 12].forEach((s, i) => this._tone('square', mtof(72 + s), t + i * 0.055, 0.12, { gain: G(0.1) }));
        break;
      case 'itemReady':
        this._tone('triangle', 880, t, 0.14, { gain: G(0.2) });
        this._tone('triangle', 1320, t + 0.1, 0.24, { gain: G(0.2) });
        break;
      case 'boxBreak':
        this._tone('sine', 700, t, 0.12, { gain: G(0.18), f1: 1500, pan });
        this._noise(t, 0.22, { gain: G(0.14), type: 'highpass', f0: 3000, pan });
        break;
      case 'throw':
        this._noise(t, 0.28, { gain: G(0.22), f0: 1400, f1: 400, q: 1.4, pan });
        this._tone('sine', 300, t, 0.15, { gain: G(0.12), f1: 140, pan });
        break;
      case 'oil':
        this._noise(t, 0.3, { gain: G(0.22), type: 'lowpass', f0: 900, f1: 200, pan });
        this._tone('sine', 220, t, 0.25, { gain: G(0.2), f1: 70, pan });
        break;
      case 'comet':
        this._noise(t, 1.1, { gain: G(0.26), type: 'highpass', f0: 300, f1: 5000, q: 0.7, pan });
        this._tone('sawtooth', 90, t, 1.1, { gain: G(0.2), f1: 900, lp: 3000, pan });
        [0, 7, 12, 19].forEach((s, i) => this._tone('square', mtof(64 + s), t + 0.15 + i * 0.12, 0.3, { gain: G(0.07), pan }));
        break;
      case 'pulse':
        this._tone('sine', 90, t, 0.7, { gain: G(0.4), f1: 35, pan });
        this._noise(t, 0.6, { gain: G(0.3), f0: 2400, f1: 150, q: 0.7, pan });
        this._tone('sawtooth', 1300, t, 0.5, { gain: G(0.1), f1: 200, lp: 2200, pan });
        break;
      case 'lap':
        [0, 4, 7].forEach((s, i) => this._tone('square', mtof(76 + s), t + i * 0.09, 0.18, { gain: G(0.1) }));
        break;
      case 'finalLap':
        [0, 0, 7, 12, 7, 12].forEach((s, i) => this._tone('square', mtof(72 + s), t + i * 0.1, 0.16, { gain: G(0.11) }));
        break;
      case 'finish':
        [0, 4, 7, 12, 16, 19].forEach((s, i) => this._tone('square', mtof(67 + s), t + i * 0.1, i === 5 ? 0.9 : 0.2, { gain: G(0.12), release: 0.3 }));
        [0, 7, 12].forEach((s) => this._tone('triangle', mtof(55 + s), t + 0.55, 1.0, { gain: G(0.12), release: 0.5 }));
        break;
      case 'respawn':
        [0, 7, 12].forEach((s, i) => this._tone('sine', mtof(84 + s), t + i * 0.05, 0.2, { gain: G(0.1) }));
        break;
      case 'winJingle':
        [0, 4, 7, 12, 7, 12, 16, 19, 24].forEach((s, i) => this._tone('square', mtof(60 + s), t + i * 0.13, i === 8 ? 1.0 : 0.18, { gain: G(0.11), release: 0.3 }));
        [0, 7, 12].forEach((s, i) => this._tone('triangle', mtof(48 + s), t + 1.0 + i * 0.01, 1.2, { gain: G(0.12), release: 0.6 }));
        break;
      case 'loseJingle':
        [7, 5, 3, 0].forEach((s, i) => this._tone('triangle', mtof(60 + s), t + i * 0.2, i === 3 ? 0.9 : 0.25, { gain: G(0.14), release: 0.3 }));
        break;
      case 'wrongWay':
        this._tone('square', 330, t, 0.12, { gain: G(0.12) });
        this._tone('square', 330, t + 0.2, 0.12, { gain: G(0.12) });
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ engines

  startEngines(karts, playerIndex) {
    this.stopEngines();
    if (!this.ctx) return;
    this.engineKarts = karts;
    this.voices = karts.map((k) => {
      const base = 0.92 + (k.stats.mass - 0.8) * -0.12 + (k.index % 3) * 0.02;
      return new EngineVoice(this, this.engineBus, base);
    });
    this.playerIndex = playerIndex;
    // looping noise layers for the player: tyre screech, off-road rumble, wind
    const ctx = this.ctx;
    const mk = (type, freq, q) => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(f);
      f.connect(g);
      g.connect(this.engineBus);
      s.start();
      return { s, g, f };
    };
    this.loops = { screech: mk('bandpass', 2300, 7), rumble: mk('lowpass', 260, 0.7), wind: mk('highpass', 1800, 0.5) };
  }

  updateEngines(player, race) {
    if (!this.ctx || !this.voices.length || this.paused) return;
    const t = this.ctx.currentTime;
    race.karts.forEach((k, i) => {
      const v = this.voices[i];
      if (!v) return;
      const sn = clamp(Math.abs(k.speed) / k.stats.vmax, 0, 1.5);
      const gear = (sn * 4) % 1;
      const thr = k.controls.throttle > 0 ? 1 : 0;
      let freq = v.base * (64 + sn * 150 + gear * 16 + thr * 10 + (k.boostTimer > 0 ? 40 : 0));
      let cutoff = 380 + sn * 1900 + thr * 400;
      let vol;
      let pan = 0;
      if (k === player) {
        vol = race.state === 'racing' || race.state === 'finished' || race.state === 'countdown' ? 0.085 + sn * 0.05 + thr * 0.03 : 0.04;
        if (k.frozen) {
          freq = v.base * (60 + thr * 80);
          vol = 0.05 + thr * 0.05;
        }
      } else {
        const dx = k.x - player.x;
        const dz = k.z - player.z;
        const dist = Math.hypot(dx, dz);
        const att = clamp(1 - dist / 55, 0, 1);
        vol = att * att * 0.1;
        const rx = -Math.cos(player.h);
        const rz = Math.sin(player.h);
        pan = clamp((dx * rx + dz * rz) / 25, -1, 1);
        // doppler-ish: approaching karts sound higher
        const rel = ((player.vx - k.vx) * dx + (player.vz - k.vz) * dz) / (dist + 1);
        freq *= 1 + clamp(rel / 340, -0.06, 0.06);
        cutoff *= 0.8;
      }
      v.set(freq, cutoff, vol, pan);
    });
    const L = this.loops;
    if (L) {
      const drift = player.drifting || (player.speed > 12 && Math.abs(player.steer) > 0.85 && player.surface === 'road' && false);
      L.screech.g.gain.setTargetAtTime(drift ? 0.05 + (player.driftLevel || 0) * 0.015 : 0, t, 0.05);
      L.rumble.g.gain.setTargetAtTime(player.surface !== 'road' && player.speed > 4 ? 0.12 : 0, t, 0.08);
      L.wind.g.gain.setTargetAtTime(clamp((Math.abs(player.speed) / player.stats.vmax - 0.6) * 0.09, 0, 0.09) + (player.boostTimer > 0 ? 0.07 : 0), t, 0.1);
    }
  }

  stopEngines() {
    for (const v of this.voices) v.stop();
    this.voices = [];
    if (this.loops) {
      for (const l of Object.values(this.loops)) {
        try {
          l.s.stop();
        } catch {
          /* already stopped */
        }
        l.g.disconnect();
      }
      this.loops = null;
    }
  }

  // ------------------------------------------------------------------ music

  startMusic(styleId) {
    if (!this.ctx) {
      this.pendingMusic = styleId;
      return;
    }
    const m = this.music;
    if (m.playing && m.style === styleId) return;
    this.stopMusic(0.15);
    const style = STYLES[styleId];
    if (!style) return;
    m.style = styleId;
    m.step = 0;
    m.next = this.ctx.currentTime + 0.12;
    m.tempoMult = 1;
    m.playing = true;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(settings.music * 0.55, this.ctx.currentTime + 0.4);
    m.timer = setInterval(() => this._tickMusic(), 30);
  }

  stopMusic(fade = 0.5) {
    const m = this.music;
    this.pendingMusic = null;
    if (m.timer) clearInterval(m.timer);
    m.timer = null;
    m.playing = false;
    m.style = null;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(0.0001, t + fade);
    }
  }

  setMusicTempo(mult) {
    this.music.tempoMult = mult;
  }

  _tickMusic() {
    const m = this.music;
    if (!m.playing || !this.ctx || this.paused) return;
    const style = STYLES[m.style];
    while (m.next < this.ctx.currentTime + 0.18) {
      this._scheduleStep(style, m.step, m.next);
      const stepDur = 60 / (style.bpm * m.tempoMult) / 4;
      m.next += stepDur;
      m.step++;
    }
  }

  _degToMidi(style, deg) {
    const sc = style.scale;
    const oct = Math.floor(deg / sc.length);
    const idx = ((deg % sc.length) + sc.length) % sc.length;
    return style.root + sc[idx] + oct * 12;
  }

  _scheduleStep(style, step, t) {
    const bars = style.chords.length;
    const bar = Math.floor(step / 16) % bars;
    const s = step % 16;
    const stepDur = 60 / (style.bpm * this.music.tempoMult) / 4;
    const chord = style.chords[bar];
    const dest = this.musicBus;
    const V = style.voices;
    const deg = (d) => this._degToMidi(style, d);

    // lead melody
    const lead = style.lead?.[bar % style.lead.length]?.[s];
    if (lead !== null && lead !== undefined) {
      const note = deg(lead) + (style.leadOct ?? 0) * 12;
      this._tone(V.lead.type, mtof(note), t, stepDur * (V.lead.len ?? 2), {
        gain: V.lead.gain, attack: V.lead.atk ?? 0.01, release: V.lead.rel ?? 0.1, dest, lp: V.lead.lp, detune: V.lead.detune,
      });
      if (V.lead.double) this._tone(V.lead.type, mtof(note), t, stepDur * (V.lead.len ?? 2), { gain: V.lead.gain * 0.7, detune: V.lead.double, dest, lp: V.lead.lp, attack: V.lead.atk ?? 0.01, release: V.lead.rel ?? 0.1 });
    }
    // arpeggio
    if (style.arp) {
      const idx = style.arp[s];
      if (idx !== null && idx !== undefined) {
        const tone = chord[idx % chord.length] + Math.floor(idx / chord.length) * style.scale.length;
        this._tone(V.arp.type, mtof(deg(tone) + (style.arpOct ?? 0) * 12), t, stepDur * (V.arp.len ?? 1.4), {
          gain: V.arp.gain, attack: 0.004, release: 0.06, dest, lp: V.arp.lp,
        });
      }
    }
    // bass
    const bp = style.bass?.[s];
    if (bp && bp !== '.') {
      const r = chord[0] + (style.bassOct ?? -14);
      const d = bp === 'r' ? r : bp === 'f' ? r + 4 : bp === 'o' ? r + style.scale.length : bp === 'b' ? r + 6 : r;
      this._tone(V.bass.type, mtof(deg(d)), t, stepDur * (V.bass.len ?? 2.2), { gain: V.bass.gain, attack: 0.006, release: 0.07, dest, lp: V.bass.lp });
    }
    // sustained pad
    if (style.pad && s === 0) {
      for (const [i, c] of chord.entries()) {
        this._tone(V.pad.type, mtof(deg(c + (style.padOff ?? 0))), t, stepDur * 16, { gain: V.pad.gain / (1 + i * 0.1), attack: V.pad.atk ?? 0.4, release: V.pad.rel ?? 0.5, dest, lp: V.pad.lp, detune: (i - 1) * 6 });
      }
    }
    // chord stabs
    if (style.stabs?.includes(s)) {
      for (const c of chord) this._tone(V.stab.type, mtof(deg(c + 7)), t, stepDur * 1.5, { gain: V.stab.gain, attack: 0.004, release: 0.08, dest, lp: V.stab.lp });
    }
    // drums
    const D = style.drums;
    if (D) {
      const ch = (lane) => D[lane]?.[s];
      if (ch('kick') === 'x') {
        this._tone('sine', 150, t, 0.16, { gain: 0.5 * (D.vol ?? 1), f1: 42, release: 0.1, dest });
        this._noise(t, 0.02, { gain: 0.06, type: 'highpass', f0: 3000, dest });
      }
      if (ch('snare') === 'x') {
        this._noise(t, 0.16, { gain: 0.22 * (D.vol ?? 1), type: 'bandpass', f0: 2000, q: 0.8, dest });
        this._tone('triangle', 190, t, 0.1, { gain: 0.14, f1: 120, dest });
      }
      if (ch('clap') === 'x') {
        for (let k = 0; k < 3; k++) this._noise(t + k * 0.012, 0.09, { gain: 0.16 * (D.vol ?? 1), type: 'bandpass', f0: 1500, q: 1.2, dest });
      }
      const h = ch('hat');
      if (h === 'x' || h === 'o') this._noise(t, h === 'o' ? 0.16 : 0.04, { gain: h === 'o' ? 0.07 : 0.055, type: 'highpass', f0: 7500, dest });
      if (h === 'g') this._noise(t, 0.03, { gain: 0.025, type: 'highpass', f0: 7500, dest });
      const p = ch('perc');
      if (p === 'd') {
        this._tone('sine', 150, t, 0.2, { gain: 0.4, f1: 70, release: 0.12, dest });
      } else if (p === 't') {
        this._noise(t, 0.05, { gain: 0.16, f0: 3200, q: 2, dest });
        this._tone('sine', 520, t, 0.05, { gain: 0.07, f1: 380, dest });
      } else if (p === 'k') {
        this._noise(t, 0.03, { gain: 0.08, f0: 4200, q: 3, dest });
      }
    }
  }
}
