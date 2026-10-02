// Tiny synthesized sound effects (Web Audio). No audio files. Starts on the first tap because
// browsers block sound until then.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.master = null;
    this.last = {};
    this.noise = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  ok(name, gap) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return false;
    const t = performance.now();
    if (this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  }

  tone(freq, dur, type = 'sine', vol = 0.3, slide = 0, delay = 0) {
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  burst(dur, vol, lo = 200, hi = 4000, delay = 0) {
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(hi, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, lo), t0 + dur);
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t0);
    s.stop(t0 + dur + 0.02);
  }

  play(name) {
    switch (name) {
      case 'tap': if (this.ok(name, 40)) this.tone(520, 0.06, 'triangle', 0.18); break;
      case 'ui': if (this.ok(name, 40)) { this.tone(660, 0.07, 'triangle', 0.2); this.tone(880, 0.08, 'triangle', 0.15, 0, 0.05); } break;
      case 'error': if (this.ok(name, 150)) { this.tone(180, 0.16, 'square', 0.12, -40); } break;
      case 'coin': if (this.ok(name, 60)) { this.tone(1200, 0.08, 'square', 0.1); this.tone(1700, 0.14, 'square', 0.1, 0, 0.06); } break;
      case 'place': if (this.ok(name, 80)) { this.burst(0.12, 0.35, 120, 900); this.tone(140, 0.12, 'sine', 0.3, -60); } break;
      case 'done': if (this.ok(name, 200)) { [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.2, 0, i * 0.08)); } break;
      case 'cannon': if (this.ok(name, 110)) { this.burst(0.14, 0.22, 100, 1400); this.tone(110, 0.12, 'sine', 0.22, -50); } break;
      case 'bolt': if (this.ok(name, 90)) this.tone(900, 0.1, 'sawtooth', 0.06, -500); break;
      case 'shell': if (this.ok(name, 200)) { this.burst(0.25, 0.3, 80, 700); this.tone(90, 0.25, 'sine', 0.3, -40); } break;
      case 'sling': if (this.ok(name, 80)) this.tone(700, 0.06, 'triangle', 0.05, -250); break;
      case 'boom': if (this.ok(name, 90)) { this.burst(0.5, 0.55, 40, 1800); this.tone(70, 0.4, 'sine', 0.5, -30); } break;
      case 'crumble': if (this.ok(name, 120)) { this.burst(0.7, 0.5, 50, 1200); this.tone(55, 0.5, 'sine', 0.45, -20); } break;
      case 'deploy': if (this.ok(name, 45)) this.tone(440 + Math.random() * 160, 0.07, 'triangle', 0.14, 120); break;
      case 'swing': if (this.ok(name, 140)) this.burst(0.06, 0.07, 800, 3000); break;
      case 'die': if (this.ok(name, 70)) this.tone(320, 0.12, 'triangle', 0.1, -200); break;
      case 'star': if (this.ok(name, 100)) { this.tone(880, 0.15, 'triangle', 0.25); this.tone(1320, 0.3, 'triangle', 0.22, 0, 0.1); } break;
      case 'win': if (this.ok(name, 500)) { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.25, 0, i * 0.12)); } break;
      case 'lose': if (this.ok(name, 500)) { [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, 0, i * 0.16)); } break;
      case 'beacon': if (this.ok(name, 200)) { this.tone(500, 0.2, 'sine', 0.22, 400); } break;
      default:
    }
  }
}
