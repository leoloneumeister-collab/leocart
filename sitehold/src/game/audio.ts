import type { Vec3 } from '../sim/math.ts';
import type { WeaponClass } from '../sim/weapons.ts';

interface GunParams { dur: number; lp0: number; lp1: number; gain: number; thump: [number, number]; thumpDur: number; thumpGain: number; crack: number; wet: number }

const GUNS: Record<WeaponClass, GunParams> = {
  rifle: { dur: 0.16, lp0: 6500, lp1: 800, gain: 0.6, thump: [170, 48], thumpDur: 0.12, thumpGain: 0.75, crack: 0.4, wet: 0.3 },
  smg: { dur: 0.09, lp0: 7500, lp1: 1400, gain: 0.42, thump: [250, 90], thumpDur: 0.07, thumpGain: 0.5, crack: 0.3, wet: 0.2 },
  pistol: { dur: 0.1, lp0: 6000, lp1: 1500, gain: 0.45, thump: [210, 80], thumpDur: 0.08, thumpGain: 0.45, crack: 0.45, wet: 0.2 },
  sniper: { dur: 0.32, lp0: 5200, lp1: 450, gain: 0.8, thump: [100, 34], thumpDur: 0.22, thumpGain: 1, crack: 0.65, wet: 0.55 },
  shotgun: { dur: 0.36, lp0: 4800, lp1: 380, gain: 0.95, thump: [125, 32], thumpDur: 0.26, thumpGain: 1, crack: 0.5, wet: 0.4 },
  knife: { dur: 0.09, lp0: 9000, lp1: 3000, gain: 0.2, thump: [0, 0], thumpDur: 0, thumpGain: 0, crack: 0, wet: 0.05 },
};

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private vol = 0.7;
  private musicVol = 0.4;
  private muted = false;
  private ring: { gain: GainNode; osc: OscillatorNode } | null = null;
  // music
  private musicOn = false;
  private nextTime = 0;
  private mstep = 0;
  private timer = 0;

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = 1.5 * this.vol;
    this.sfx = ctx.createGain(); this.music = ctx.createGain(); this.music.gain.value = this.musicVol * 0.5;
    this.sfx.connect(this.master); this.music.connect(this.master); this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const rev = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 1.4);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6); }
    rev.buffer = ir;
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(rev); rev.connect(this.sfx);
  }

  setVolumes(vol: number, music: number) {
    this.vol = vol; this.musicVol = music;
    if (!this.ctx) return;
    this.master.gain.value = this.muted ? 0 : 1.5 * vol;
    this.music.gain.value = music * 0.5;
  }

  toggleMute() { this.muted = !this.muted; if (this.ctx) this.master.gain.value = this.muted ? 0 : 1.5 * this.vol; return this.muted; }

  setListener(p: Vec3, yaw: number) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = -Math.sin(yaw); l.forwardY.value = 0; l.forwardZ.value = -Math.cos(yaw);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z); l.setOrientation(-Math.sin(yaw), 0, -Math.cos(yaw), 0, 1, 0);
    }
  }

  private t() { return this.ctx!.currentTime; }

  private noiseSrc(dur: number, start = this.t()) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.start(start, Math.random() * 1.5, dur + 0.05);
    return src;
  }

  /** Returns an input gain wired to the master through a panner when a position is given. */
  private out(pos: Vec3 | null, vol: number, wet = 0.1, listenerDist = 0): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.gain.value = vol;
    let node: AudioNode = g;
    if (pos) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = Math.max(1400, 18000 / (1 + listenerDist / 14));
      g.connect(lp); node = lp;
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.maxDistance = 300; p.rolloffFactor = 1.15;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      node.connect(p); node = p;
    }
    node.connect(this.sfx);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(this.reverbSend); }
    return g;
  }

  gun(cls: WeaponClass, pos: Vec3 | null, dist: number, pitch = 1, vol = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, p = GUNS[cls], t = this.t();
    const far = Math.min(1, dist / 70);
    const o = this.out(pos, vol * 1.5, p.wet * (1 + far), dist);
    const n = this.noiseSrc(p.dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(p.lp0 * pitch, t); lp.frequency.exponentialRampToValueAtTime(Math.max(120, p.lp1 * pitch), t + p.dur);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(p.gain, t); ng.gain.exponentialRampToValueAtTime(0.001, t + p.dur);
    n.connect(lp); lp.connect(ng); ng.connect(o);
    if (p.crack > 0) {
      const c = this.noiseSrc(0.03);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400 * pitch;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(p.crack, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      c.connect(hp); hp.connect(cg); cg.connect(o);
    }
    if (p.thumpGain > 0) {
      const os = ctx.createOscillator(); os.type = 'sine';
      os.frequency.setValueAtTime(p.thump[0] * pitch, t); os.frequency.exponentialRampToValueAtTime(p.thump[1] * pitch, t + p.thumpDur);
      const og = ctx.createGain(); og.gain.setValueAtTime(p.thumpGain, t); og.gain.exponentialRampToValueAtTime(0.001, t + p.thumpDur + 0.04);
      os.connect(og); og.connect(o); os.start(t); os.stop(t + p.thumpDur + 0.08);
    }
  }

  click(freq = 1800, dur = 0.04, gain = 0.3, pos: Vec3 | null = null, dist = 0, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t() + delay;
    const o = this.out(pos, gain * 2.4, 0.05, dist);
    const n = this.noiseSrc(dur, t);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(o);
    const os = ctx.createOscillator(); os.type = 'square'; os.frequency.value = freq * 0.5;
    const og = ctx.createGain(); og.gain.setValueAtTime(0.2, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
    os.connect(og); og.connect(o); os.start(t); os.stop(t + dur);
  }

  reload(cls: WeaponClass, pos: Vec3 | null, dist: number) {
    if (!this.ctx) return;
    if (cls === 'shotgun') { this.click(1100, 0.05, 0.4, pos, dist); this.click(700, 0.06, 0.3, pos, dist, 0.2); return; }
    this.click(900, 0.07, 0.45, pos, dist);
    this.click(1500, 0.06, 0.55, pos, dist, cls === 'pistol' ? 0.9 : 1.4);
    this.click(700, 0.08, 0.5, pos, dist, cls === 'pistol' ? 1.4 : 2.0);
  }
  dryfire(pos: Vec3 | null, dist: number) { this.click(2600, 0.02, 0.35, pos, dist); }
  draw(pos: Vec3 | null, dist: number) { this.click(1300, 0.05, 0.3, pos, dist); this.click(2000, 0.03, 0.25, pos, dist, 0.08); }

  tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.3, when = 0, slideTo?: number, pos: Vec3 | null = null, dist = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t() + when;
    const o = this.out(pos, gain, 0.08, dist);
    const os = ctx.createOscillator(); os.type = type; os.frequency.setValueAtTime(freq, t);
    if (slideTo) os.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(g); g.connect(o); os.start(t); os.stop(t + dur + 0.02);
  }

  hitMarker() { this.tone(2200, 0.045, 'square', 0.16); }
  headshot() { this.tone(2200, 0.045, 'square', 0.18); this.tone(3300, 0.12, 'triangle', 0.2, 0.03); }
  kill() { this.tone(170, 0.2, 'sawtooth', 0.18, 0, 60); this.tone(2700, 0.05, 'square', 0.14); }
  uiClick() { this.tone(900, 0.05, 'triangle', 0.16); }
  uiHover() { this.tone(1500, 0.02, 'sine', 0.06); }
  buy() { this.tone(1200, 0.06, 'square', 0.12); this.tone(1800, 0.1, 'triangle', 0.16, 0.05); }
  deny() { this.tone(180, 0.15, 'sawtooth', 0.12, 0, 120); }
  pickup() { this.tone(660, 0.08, 'triangle', 0.2); this.tone(990, 0.12, 'triangle', 0.2, 0.06); }
  roundStart() { this.tone(660, 0.18, 'triangle', 0.25); this.tone(880, 0.3, 'triangle', 0.25, 0.14); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.2, i * 0.11)); }
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.45, 'sawtooth', 0.12, i * 0.2)); }
  tick() { this.tone(1100, 0.03, 'square', 0.06); }

  hurt(pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out(null, 0.9, 0.1);
    void pan;
    const n = this.noiseSrc(0.18);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(lp); lp.connect(g); g.connect(o);
    this.tone(95, 0.2, 'sine', 0.5, 0, 45);
  }

  step(surface: string, pos: Vec3 | null, dist: number, vol = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out(pos, vol * 1.2, 0.08, dist);
    const n = this.noiseSrc(0.09);
    const f = surface === 'sand' ? 380 : surface === 'wood' ? 650 : surface === 'metal' ? 1500 : 900;
    const lp = ctx.createBiquadFilter(); lp.type = surface === 'metal' ? 'bandpass' : 'lowpass'; lp.frequency.value = f; lp.Q.value = surface === 'metal' ? 5 : 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(lp); lp.connect(g); g.connect(o);
  }

  land(pos: Vec3 | null, dist: number, hard: number) { this.step('stone', pos, dist, 0.6 + Math.min(0.6, hard * 0.05)); this.tone(70, 0.12, 'sine', 0.3, 0, 40, pos, dist); }

  impact(surface: string, pos: Vec3, dist: number) {
    if (!this.ctx || dist > 45) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out(pos, surface === 'flesh' || surface === 'head' ? 0.5 : 0.35, 0.1, dist);
    const n = this.noiseSrc(0.07);
    const f = surface === 'metal' ? 2400 : surface === 'wood' ? 700 : surface === 'sand' ? 450 : surface === 'flesh' || surface === 'head' ? 300 : 1400;
    const bp = ctx.createBiquadFilter(); bp.type = surface === 'metal' ? 'bandpass' : 'lowpass'; bp.frequency.value = f; bp.Q.value = surface === 'metal' ? 8 : 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + (surface === 'metal' ? 0.16 : 0.07));
    n.connect(bp); bp.connect(g); g.connect(o);
    if (surface === 'metal') this.tone(1800 + Math.random() * 600, 0.1, 'triangle', 0.08, 0, 900, pos, dist);
  }

  whoosh(pos: Vec3 | null = null, dist = 0, gain = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out(pos, gain, 0.1, dist);
    const n = this.noiseSrc(0.25);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.12); bp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    n.connect(bp); bp.connect(g); g.connect(o);
  }

  stab(pos: Vec3 | null, dist: number, hit: boolean) { if (hit) { this.tone(110, 0.1, 'sine', 0.4, 0, 60, pos, dist); this.click(1200, 0.05, 0.3, pos, dist); } else this.whoosh(pos, dist, 0.35); }

  explosion(pos: Vec3 | null, dist: number, big = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const far = Math.min(1, dist / 90);
    const o = this.out(pos, (big ? 2.4 : 1.4) * (1 - far * 0.5), 0.55, dist);
    const dur = big ? 2.4 : 1.3;
    const n = this.noiseSrc(dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(70, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(lp); lp.connect(g); g.connect(o);
    const os = ctx.createOscillator(); os.type = 'sine';
    os.frequency.setValueAtTime(90, t); os.frequency.exponentialRampToValueAtTime(22, t + dur * 0.7);
    const og = ctx.createGain(); og.gain.setValueAtTime(1.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
    os.connect(og); og.connect(o); os.start(t); os.stop(t + dur);
  }

  flashBang(pos: Vec3 | null, dist: number) {
    if (!this.ctx) return;
    const t = this.t();
    const o = this.out(pos, 1.2, 0.4, dist);
    const n = this.noiseSrc(0.3);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 800;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(1.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(hp); hp.connect(g); g.connect(o);
  }

  smokePop(pos: Vec3 | null, dist: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out(pos, 0.8, 0.2, dist);
    const n = this.noiseSrc(1.2);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    n.connect(bp); bp.connect(g); g.connect(o);
    this.tone(120, 0.15, 'sine', 0.5, 0, 60, pos, dist);
  }

  /** Ear ringing while flashed. intensity 0..1, dur seconds. */
  flashRing(dur: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    if (this.ring) { try { this.ring.osc.stop(); } catch { /* done */ } }
    const os = ctx.createOscillator(); os.type = 'sine'; os.frequency.value = 4100;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.03); g.gain.setValueAtTime(0.18, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(g); g.connect(this.sfx); os.start(t); os.stop(t + dur + 0.1);
    this.ring = { gain: g, osc: os };
    // duck the rest of the mix while flashed
    this.sfx.gain.cancelScheduledValues(t);
    this.sfx.gain.setValueAtTime(this.sfx.gain.value, t);
    this.sfx.gain.linearRampToValueAtTime(0.35, t + 0.05);
    this.sfx.gain.setValueAtTime(0.35, t + dur * 0.5);
    this.sfx.gain.linearRampToValueAtTime(1, t + dur);
  }

  bombBeep(pos: Vec3 | null, dist: number, fast: boolean) { this.tone(fast ? 2000 : 1500, 0.07, 'square', 0.3, 0, undefined, pos, dist); }
  plantTone(pos: Vec3 | null, dist: number) { [900, 1200, 1500].forEach((f, i) => this.tone(f, 0.1, 'square', 0.2, i * 0.12, undefined, pos, dist)); }
  defuseTick(pos: Vec3 | null, dist: number) { this.tone(1000 + Math.random() * 200, 0.04, 'square', 0.1, 0, undefined, pos, dist); }
  defused() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.25, i * 0.12)); }

  radio(text: string) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = this.t();
    const out = this.out(null, 0.35, 0);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9; bp.connect(out);
    const sq = this.noiseSrc(0.1, t0);
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.5, t0); sg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    sq.connect(sg); sg.connect(bp);
    let t = t0 + 0.12, seed = text.length;
    const words = text.split(/\s+/).slice(0, 6);
    for (const w of words) {
      const syll = Math.max(1, Math.round(w.length / 3));
      for (let i = 0; i < syll; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        const f = 120 + (seed / 233280) * 90;
        const os = ctx.createOscillator(); os.type = 'sawtooth';
        os.frequency.setValueAtTime(f, t); os.frequency.linearRampToValueAtTime(f * (0.85 + (seed % 7) / 20), t + 0.08);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 500 + (seed % 900); f1.Q.value = 4;
        os.connect(f1); f1.connect(g); g.connect(bp);
        os.start(t); os.stop(t + 0.11);
        t += 0.075;
      }
      t += 0.05;
    }
    const eq = this.noiseSrc(0.08, t);
    const eg = ctx.createGain(); eg.gain.setValueAtTime(0.4, t); eg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    eq.connect(eg); eg.connect(bp);
  }

  // ---------------------------------------------------------------- menu music, desert flavoured

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.t() + 0.1;
    this.mstep = 0;
    this.timer = window.setInterval(() => this.tickMusic(), 90);
  }
  stopMusic() { this.musicOn = false; clearInterval(this.timer); }

  private tickMusic() {
    if (!this.ctx || !this.musicOn) return;
    const stepDur = 60 / 92 / 4;
    while (this.nextTime < this.t() + 0.35) { this.schedule(this.mstep, this.nextTime); this.nextTime += stepDur; this.mstep++; }
  }

  private m(f: number, t: number, dur: number, type: OscillatorType, gain: number, lpf = 2000) {
    const ctx = this.ctx!;
    const os = ctx.createOscillator(); os.type = type; os.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpf;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(lp); lp.connect(g); g.connect(this.music);
    os.start(t); os.stop(t + dur + 0.05);
  }

  private schedule(step: number, t: number) {
    const s16 = step % 16, bar = Math.floor(step / 16);
    // D phrygian dominant flavour: D Eb F# G A Bb C
    const roots = [38, 38, 39, 38];
    const root = roots[bar % 4];
    if (step % 32 === 0) {
      const dur = (60 / 92) * 8 + 0.6;
      for (const n of [root + 12, root + 16, root + 19]) { this.m(NOTE(n), t, dur, 'sawtooth', 0.04, 800); this.m(NOTE(n) * 1.005, t, dur, 'triangle', 0.05, 900); }
    }
    const bass = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
    if (bass[s16]) this.m(NOTE(root), t, 0.2, 'sawtooth', 0.11, 340);
    const scale = [62, 63, 66, 67, 69, 70, 72, 74];
    if (s16 % 2 === 0 && Math.random() < 0.6) this.m(NOTE(scale[(step * 3 + bar) % scale.length]), t, 0.28, 'triangle', 0.045, 2600);
    if (s16 % 4 === 0) {
      const os = this.ctx!.createOscillator(); os.type = 'sine';
      os.frequency.setValueAtTime(120, t); os.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      const g = this.ctx!.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      os.connect(g); g.connect(this.music); os.start(t); os.stop(t + 0.2);
    }
  }
}

export const audio = new GameAudio();
