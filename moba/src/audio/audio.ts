/** Procedural sound effects and music using WebAudio. No audio files. */

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private volume = 0.7;
  private listener = { x: 0, z: 0 };
  /** 0..1, raised by fights, decays. Drives the music energy. */
  intensity = 0;
  private musicOn = false;
  private nextNote = 0;
  private step = 0;
  private timer = 0;
  private lastHit = 0;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.28;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  getVolume(): number {
    return this.volume;
  }

  setListener(x: number, z: number) {
    this.listener.x = x;
    this.listener.z = z;
  }

  /** Distance based loudness. */
  private vol(x?: number, z?: number): number {
    if (x === undefined || z === undefined) return 1;
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    return Math.max(0, 1 - d / 75) ** 1.5;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, o: { slide?: number; delay?: number; bus?: GainNode; attack?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || gain <= 0.001) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(o.bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, gain: number, f0: number, f1: number, o: { delay?: number; q?: number; type?: BiquadFilterType } = {}) {
    const ctx = this.ctx;
    if (!ctx || gain <= 0.001) return;
    const t = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'lowpass';
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- effects

  attack(kind: 'melee' | 'bow' | 'magic' | 'minion' | 'tower', x?: number, z?: number) {
    const v = this.vol(x, z);
    if (v <= 0) return;
    this.intensity = Math.min(1, this.intensity + 0.02);
    switch (kind) {
      case 'melee':
        this.noise(0.12, 0.35 * v, 3500, 700, { type: 'bandpass' });
        this.tone(140, 0.09, 'triangle', 0.25 * v, { slide: 70 });
        break;
      case 'bow':
        this.tone(900, 0.07, 'triangle', 0.18 * v, { slide: 300 });
        this.noise(0.06, 0.15 * v, 5000, 1500, { type: 'highpass' });
        break;
      case 'magic':
        this.tone(520, 0.14, 'sine', 0.2 * v, { slide: 900 });
        break;
      case 'minion':
        this.tone(220, 0.05, 'square', 0.05 * v, { slide: 160 });
        break;
      case 'tower':
        this.tone(330, 0.22, 'sawtooth', 0.14 * v, { slide: 90 });
        this.noise(0.16, 0.15 * v, 2500, 400);
        break;
    }
  }

  hit(kind: 'physical' | 'magic' | 'true', big: boolean, x?: number, z?: number) {
    const v = this.vol(x, z);
    if (v <= 0.02) return;
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastHit < 0.025) return;
    this.lastHit = now;
    if (kind === 'magic') {
      this.tone(big ? 300 : 440, 0.15, 'sine', 0.2 * v, { slide: 120 });
      this.noise(0.1, 0.12 * v, 4000, 800);
    } else {
      this.noise(big ? 0.18 : 0.09, (big ? 0.4 : 0.26) * v, 2800, 400);
      this.tone(big ? 90 : 130, 0.1, 'triangle', (big ? 0.35 : 0.2) * v, { slide: 55 });
    }
  }

  cast(color: number, x?: number, z?: number) {
    const v = this.vol(x, z);
    if (v <= 0.02) return;
    const base = 300 + ((color >> 8) & 0xff);
    this.tone(base, 0.28, 'sawtooth', 0.12 * v, { slide: base * 2.2 });
    this.tone(base * 1.5, 0.3, 'sine', 0.12 * v, { slide: base * 0.8, delay: 0.02 });
    this.noise(0.22, 0.1 * v, 6000, 900, { type: 'bandpass' });
  }

  explosion(size: number, x?: number, z?: number) {
    const v = this.vol(x, z);
    if (v <= 0.02) return;
    this.noise(0.5 + size * 0.4, 0.8 * v, 2500, 80, { q: 0.5 });
    this.tone(90, 0.5 + size * 0.3, 'sine', 0.7 * v, { slide: 30 });
  }

  structureDown(big: boolean, x?: number, z?: number) {
    this.explosion(big ? 3 : 1.5, x, z);
    this.tone(180, 1.2, 'sawtooth', 0.15, { slide: 40, delay: 0.1 });
  }

  levelUp() {
    [72, 76, 79, 84].forEach((n, i) => this.tone(NOTE(n), 0.35, 'triangle', 0.18, { delay: i * 0.07 }));
  }

  gold() {
    this.tone(1760, 0.08, 'sine', 0.1);
    this.tone(2349, 0.1, 'sine', 0.09, { delay: 0.05 });
  }

  buy() {
    this.tone(880, 0.07, 'square', 0.1);
    this.tone(1320, 0.12, 'triangle', 0.12, { delay: 0.06 });
  }

  sell() {
    this.tone(700, 0.1, 'triangle', 0.1, { slide: 400 });
  }

  error() {
    this.tone(160, 0.14, 'square', 0.12, { slide: 110 });
  }

  click() {
    this.tone(660, 0.04, 'square', 0.05);
  }

  kill(own: boolean) {
    const n = own ? [67, 72, 76, 79] : [64, 60, 57];
    n.forEach((x, i) => this.tone(NOTE(x), 0.3, 'sawtooth', 0.12, { delay: i * 0.09 }));
  }

  death() {
    this.tone(220, 0.8, 'sawtooth', 0.2, { slide: 55 });
    this.noise(0.6, 0.3, 1200, 120);
  }

  respawn() {
    [60, 64, 67, 72].forEach((n, i) => this.tone(NOTE(n), 0.4, 'sine', 0.14, { delay: i * 0.08 }));
  }

  recallStart() {
    this.tone(300, 1.6, 'sine', 0.08, { slide: 900, attack: 0.3 });
  }

  recallCancel() {
    this.tone(500, 0.2, 'triangle', 0.1, { slide: 200 });
  }

  announce(kind: 'ally' | 'enemy' | 'inhib' | 'win' | 'lose') {
    const seq = kind === 'win' ? [60, 64, 67, 72, 76] : kind === 'lose' ? [67, 63, 60, 55, 48] : kind === 'enemy' ? [64, 60, 57] : kind === 'inhib' ? [55, 59, 62, 67] : [60, 67, 72];
    seq.forEach((n, i) => this.tone(NOTE(n), 0.45, 'sawtooth', 0.13, { delay: i * 0.11 }));
  }

  stun(x?: number, z?: number) {
    const v = this.vol(x, z);
    this.tone(1200, 0.14, 'square', 0.07 * v, { slide: 600 });
  }

  // ---------------------------------------------------------------- music

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextNote = this.ctx.currentTime + 0.2;
    this.step = 0;
  }

  stopMusic() {
    this.musicOn = false;
  }

  /** Call every frame. */
  update(dt: number) {
    this.intensity = Math.max(0, this.intensity - dt * 0.05);
    if (!this.ctx || !this.musicOn) return;
    this.timer += dt;
    const ctx = this.ctx;
    const bpm = 84 + this.intensity * 30;
    const stepLen = 60 / bpm / 2;
    // schedule ahead
    while (this.nextNote < ctx.currentTime + 0.4) {
      this.scheduleStep(this.step, this.nextNote - ctx.currentTime);
      this.step++;
      this.nextNote += stepLen;
    }
  }

  private scheduleStep(step: number, delay: number) {
    const chords = [
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
      [52, 55, 59],
    ];
    const bar = Math.floor(step / 16) % chords.length;
    const chord = chords[bar];
    const s = step % 16;
    const inten = this.intensity;
    if (s === 0) {
      for (const n of chord) this.tone(NOTE(n - 12), 2.4, 'sine', 0.1, { delay, bus: this.musicBus, attack: 0.5 });
    }
    if (s % 2 === 0) {
      const n = chord[(s / 2) % 3] + 12 * (s % 8 === 4 ? 1 : 0);
      this.tone(NOTE(n), 0.4, 'triangle', 0.07 + inten * 0.04, { delay, bus: this.musicBus });
    }
    if (inten > 0.25 && s % 4 === 0) this.noise(0.08, 0.04 * inten, 7000, 3000, { delay, type: 'highpass' });
    if (inten > 0.5 && s % 4 === 2) this.tone(NOTE(chord[0] - 24), 0.25, 'sawtooth', 0.08, { delay, bus: this.musicBus, slide: NOTE(chord[0] - 26) });
  }
}
