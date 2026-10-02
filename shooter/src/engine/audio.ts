export type GunSound = 'rifle' | 'smg' | 'shotgun' | 'dmr' | 'enemy' | 'boss' | 'knife';

interface GunParams {
  noiseDur: number; lpStart: number; lpEnd: number; noiseGain: number;
  thumpFrom: number; thumpTo: number; thumpDur: number; thumpGain: number;
  crack: number; wet: number;
}

const GUNS: Record<GunSound, GunParams> = {
  rifle:   { noiseDur: 0.14, lpStart: 6000, lpEnd: 900,  noiseGain: 0.55, thumpFrom: 170, thumpTo: 50, thumpDur: 0.11, thumpGain: 0.7,  crack: 0.35, wet: 0.25 },
  smg:     { noiseDur: 0.08, lpStart: 7000, lpEnd: 1400, noiseGain: 0.4,  thumpFrom: 240, thumpTo: 90, thumpDur: 0.07, thumpGain: 0.5,  crack: 0.3,  wet: 0.18 },
  shotgun: { noiseDur: 0.38, lpStart: 4500, lpEnd: 350,  noiseGain: 0.9,  thumpFrom: 120, thumpTo: 32, thumpDur: 0.26, thumpGain: 1.0,  crack: 0.45, wet: 0.35 },
  dmr:     { noiseDur: 0.26, lpStart: 5200, lpEnd: 500,  noiseGain: 0.75, thumpFrom: 100, thumpTo: 36, thumpDur: 0.2,  thumpGain: 0.9,  crack: 0.6,  wet: 0.5 },
  enemy:   { noiseDur: 0.12, lpStart: 4200, lpEnd: 700,  noiseGain: 0.45, thumpFrom: 150, thumpTo: 55, thumpDur: 0.09, thumpGain: 0.5,  crack: 0.25, wet: 0.35 },
  boss:    { noiseDur: 0.3,  lpStart: 3800, lpEnd: 300,  noiseGain: 0.8,  thumpFrom: 110, thumpTo: 30, thumpDur: 0.24, thumpGain: 0.9,  crack: 0.3,  wet: 0.4 },
  knife:   { noiseDur: 0.09, lpStart: 9000, lpEnd: 3000, noiseGain: 0.25, thumpFrom: 0,   thumpTo: 0,  thumpDur: 0,    thumpGain: 0,    crack: 0,    wet: 0.05 },
};

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;
  private musicVol = 0.5;
  private sfxVol = 0.8;
  // music state
  private musicOn = false;
  private nextTime = 0;
  private seqStep = 0;
  private timer = 0;
  intensity = 0;
  private smoothIntensity = 0;
  private chordIdx = 0;
  private delay!: DelayNode;
  private heart = 0;

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
    this.master = ctx.createGain(); this.master.gain.value = 1.7;
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol;
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol * 0.5;
    this.sfx.connect(this.master); this.music.connect(this.master);
    this.master.connect(comp); comp.connect(limiter); limiter.connect(ctx.destination);

    // noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // reverb IR
    this.reverb = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.8);
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.5;
    this.reverbSend.connect(this.reverb); this.reverb.connect(this.sfx);

    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.375;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    this.delay.connect(fb); fb.connect(this.delay);
    this.delay.connect(this.music);
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.music.gain.value = music * 0.5;
    this.sfx.gain.value = sfx;
  }

  private t() { return this.ctx!.currentTime; }

  private noiseSrc(dur: number, start = this.t()) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.start(start, Math.random() * 1.5, dur + 0.05);
    return src;
  }

  private out(pan: number, wet: number, vol: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.gain.value = vol;
    let node: AudioNode = g;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p); node = p;
    }
    node.connect(this.sfx);
    if (wet > 0) { const w = ctx.createGain(); w.gain.value = wet; node.connect(w); w.connect(this.reverbSend); }
    return g;
  }

  gun(kind: GunSound, pan = 0, vol = 1, dist = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, p = GUNS[kind], t = this.t();
    const far = Math.min(1, dist / 60);
    const o = this.out(pan, p.wet * (1 + far), vol * 1.8 * (1 - far * 0.5));
    // body noise
    const n = this.noiseSrc(p.noiseDur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(p.lpStart * (1 - far * 0.6), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, p.lpEnd), t + p.noiseDur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(p.noiseGain, t); ng.gain.exponentialRampToValueAtTime(0.001, t + p.noiseDur);
    n.connect(lp); lp.connect(ng); ng.connect(o);
    // crack
    if (p.crack > 0) {
      const c = this.noiseSrc(0.03);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const cg = ctx.createGain(); cg.gain.setValueAtTime(p.crack, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      c.connect(hp); hp.connect(cg); cg.connect(o);
    }
    // thump
    if (p.thumpGain > 0) {
      const os = ctx.createOscillator(); os.type = 'sine';
      os.frequency.setValueAtTime(p.thumpFrom, t); os.frequency.exponentialRampToValueAtTime(p.thumpTo, t + p.thumpDur);
      const og = ctx.createGain(); og.gain.setValueAtTime(p.thumpGain, t); og.gain.exponentialRampToValueAtTime(0.001, t + p.thumpDur + 0.04);
      os.connect(og); og.connect(o); os.start(t); os.stop(t + p.thumpDur + 0.08);
    }
  }

  click(freq = 1800, dur = 0.04, gain = 0.3, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out(pan, 0.05, gain * 2.4);
    const n = this.noiseSrc(dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(bp); bp.connect(g); g.connect(o);
    const os = ctx.createOscillator(); os.type = 'square'; os.frequency.value = freq * 0.5;
    const og = ctx.createGain(); og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
    os.connect(og); og.connect(o); os.start(t); os.stop(t + dur);
  }

  reload(stage: 'out' | 'in' | 'bolt' | 'pump' | 'shell') {
    switch (stage) {
      case 'out': this.click(900, 0.07, 0.5); break;
      case 'in': this.click(1400, 0.06, 0.6); setTimeout(() => this.click(2200, 0.03, 0.3), 70); break;
      case 'bolt': this.click(700, 0.08, 0.6); setTimeout(() => this.click(1600, 0.05, 0.5), 110); break;
      case 'pump': this.click(500, 0.1, 0.7); setTimeout(() => this.click(1100, 0.07, 0.6), 170); break;
      case 'shell': this.click(2000, 0.04, 0.4); break;
    }
  }
  dry() { this.click(2600, 0.02, 0.35); }

  tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.3, when = 0, slideTo?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t() + when;
    const o = this.out(0, 0.1, gain);
    const os = ctx.createOscillator(); os.type = type; os.frequency.setValueAtTime(freq, t);
    if (slideTo) os.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(g); g.connect(o); os.start(t); os.stop(t + dur + 0.02);
  }

  hitMarker() { this.tone(2100, 0.04, 'square', 0.18); }
  headshot() { this.tone(2100, 0.04, 'square', 0.2); this.tone(3200, 0.12, 'triangle', 0.22, 0.03); }
  kill() { this.tone(160, 0.2, 'sawtooth', 0.22, 0, 60); this.tone(2600, 0.05, 'square', 0.15); }
  uiClick() { this.tone(900, 0.05, 'triangle', 0.18); }
  uiHover() { this.tone(1400, 0.025, 'sine', 0.08); }
  pickup() { this.tone(660, 0.1, 'triangle', 0.25); this.tone(990, 0.16, 'triangle', 0.25, 0.08); }
  objective() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.22, i * 0.11)); }
  fail() { [392, 311, 233].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.14, i * 0.25)); }
  beep() { this.tone(1500, 0.06, 'square', 0.12); }

  hurt(pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out(pan, 0.1, 0.8);
    const n = this.noiseSrc(0.18);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(lp); lp.connect(g); g.connect(o);
    this.tone(90, 0.2, 'sine', 0.5, 0, 45);
  }

  heartbeat(rate: number) {
    // called each frame with low health factor 0..1
    if (!this.ctx) return;
    this.heart -= rate;
    if (this.heart <= 0) {
      this.heart = 1;
      this.tone(60, 0.14, 'sine', 0.55, 0, 40);
      this.tone(55, 0.14, 'sine', 0.4, 0.17, 38);
    }
  }

  explosion(vol = 1, dist = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const far = Math.min(1, dist / 80);
    const o = this.out(0, 0.5, vol * (1 - far * 0.6));
    const n = this.noiseSrc(1.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(80, t + 1.3);
    const g = ctx.createGain(); g.gain.setValueAtTime(1.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    n.connect(lp); lp.connect(g); g.connect(o);
    const os = ctx.createOscillator(); os.type = 'sine';
    os.frequency.setValueAtTime(90, t); os.frequency.exponentialRampToValueAtTime(24, t + 0.8);
    const og = ctx.createGain(); og.gain.setValueAtTime(1.2, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    os.connect(og); og.connect(o); os.start(t); os.stop(t + 1);
  }

  step(surface: 'hard' | 'soft' = 'hard', vol = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out((Math.random() - 0.5) * 0.2, 0.1, vol);
    const n = this.noiseSrc(0.09);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = surface === 'hard' ? 900 : 420;
    const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(lp); lp.connect(g); g.connect(o);
  }

  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.t();
    const o = this.out(0, 0.1, 0.5);
    const n = this.noiseSrc(0.25);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(2200, t + 0.12); bp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    n.connect(bp); bp.connect(g); g.connect(o);
  }

  /** Radio chatter: squelch + voice-like blips, returns approximate duration in seconds. */
  radio(text: string) {
    if (!this.ctx) return 0;
    const ctx = this.ctx, t0 = this.t();
    const out = this.out(0, 0, 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.9;
    bp.connect(out);
    // squelch in
    const sq = this.noiseSrc(0.12, t0);
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.6, t0); sg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    sq.connect(bp); sg.connect(bp); sq.connect(sg);
    const words = text.split(/\s+/);
    let t = t0 + 0.15;
    let seed = text.length;
    for (const w of words) {
      const syll = Math.max(1, Math.round(w.length / 3));
      for (let i = 0; i < syll; i++) {
        seed = (seed * 9301 + 49297) % 233280;
        const f = 110 + (seed / 233280) * 90;
        const os = ctx.createOscillator(); os.type = 'sawtooth';
        os.frequency.setValueAtTime(f, t); os.frequency.linearRampToValueAtTime(f * (0.85 + (seed % 7) / 20), t + 0.09);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 500 + (seed % 900); f1.Q.value = 4;
        os.connect(f1); f1.connect(g); g.connect(bp);
        os.start(t); os.stop(t + 0.12);
        t += 0.085;
      }
      t += 0.06;
    }
    // squelch out
    const eq = this.noiseSrc(0.1, t);
    const eg = ctx.createGain(); eg.gain.setValueAtTime(0.5, t); eg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    eq.connect(eg); eg.connect(bp);
    return t - t0 + 0.1;
  }

  // ---------------- music ----------------
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextTime = this.t() + 0.1;
    this.seqStep = 0;
    this.timer = window.setInterval(() => this.tick(), 90);
  }
  stopMusic() {
    this.musicOn = false;
    clearInterval(this.timer);
  }

  private tick() {
    if (!this.ctx || !this.musicOn) return;
    this.smoothIntensity += (this.intensity - this.smoothIntensity) * 0.08;
    const stepDur = 60 / 98 / 4;
    while (this.nextTime < this.t() + 0.35) {
      this.scheduleStep(this.seqStep, this.nextTime);
      this.nextTime += stepDur;
      this.seqStep++;
    }
  }

  private mTone(f: number, t: number, dur: number, type: OscillatorType, gain: number, lpf = 2000, send = 0) {
    const ctx = this.ctx!;
    const os = ctx.createOscillator(); os.type = type; os.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    os.connect(lp); lp.connect(g); g.connect(this.music);
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(this.delay); }
    os.start(t); os.stop(t + dur + 0.05);
  }

  private scheduleStep(step: number, t: number) {
    const I = this.smoothIntensity;
    const s16 = step % 16;
    const bar = Math.floor(step / 16);
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 55, 59]]; // Am F C Em
    const roots = [33, 29, 36, 40];
    const ci = Math.floor(bar / 2) % 4;
    const chord = chords[ci];
    // pad on chord change
    if (step % 32 === 0) {
      const dur = (60 / 98) * 8 + 0.8;
      for (const n of chord) {
        this.mTone(NOTE(n), t, dur, 'sawtooth', 0.05, 700 + I * 800);
        this.mTone(NOTE(n) * 1.004, t, dur, 'triangle', 0.05, 900);
      }
    }
    // bass pulse
    const bassPat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    if (bassPat[s16]) this.mTone(NOTE(roots[ci] + (s16 === 14 ? 7 : 0)), t, 0.22, 'sawtooth', 0.12 + I * 0.1, 260 + I * 500);
    // sparse arp (calm cinematic)
    const pent = [69, 72, 74, 76, 79, 81];
    if (s16 % 4 === 2 && Math.random() < 0.55 - I * 0.2) {
      this.mTone(NOTE(pent[Math.floor(Math.random() * pent.length)]), t, 0.5, 'triangle', 0.045, 3000, 0.5);
    }
    // percussion
    if (I > 0.25) {
      if (s16 % 4 === 0) this.kick(t, 0.5 + I * 0.4);
      if (I > 0.5 && s16 % 2 === 0) this.hat(t, 0.08 + I * 0.05);
      if (I > 0.7 && (s16 === 4 || s16 === 12)) this.snare(t, 0.25);
      if (I > 0.85 && (s16 === 7 || s16 === 15)) this.kick(t, 0.35);
    } else if (s16 === 0 && bar % 2 === 0) {
      this.kick(t, 0.25);
    }
  }

  private kick(t: number, gain: number) {
    const ctx = this.ctx!;
    const os = ctx.createOscillator(); os.type = 'sine';
    os.frequency.setValueAtTime(130, t); os.frequency.exponentialRampToValueAtTime(38, t + 0.16);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    os.connect(g); g.connect(this.music); os.start(t); os.stop(t + 0.22);
  }
  private hat(t: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.start(t, Math.random(), 0.05);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7500;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(hp); hp.connect(g); g.connect(this.music);
  }
  private snare(t: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.start(t, Math.random(), 0.15);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(bp); bp.connect(g); g.connect(this.music);
  }
}

export const audio = new AudioEngine();
