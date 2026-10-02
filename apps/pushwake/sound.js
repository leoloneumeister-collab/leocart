// Alarm sound made with Web Audio, so there are no audio files to download or host.
export class AlarmSound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.osc = null;
    this.timer = null;
    this.scale = 1;
  }

  // Must be called from a tap. Browsers refuse to make sound until the person has touched the page.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  start() {
    if (!this.unlock() || this.osc) return;
    const { ctx } = this;
    const now = ctx.currentTime;
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.linearRampToValueAtTime(0.5 * this.scale, now + 1.5); // wakes you up in stages
    this.master.gain.linearRampToValueAtTime(0.9 * this.scale, now + 40);
    this.master.connect(ctx.destination);
    this.osc = ctx.createOscillator();
    this.osc.type = 'square';
    this.osc.frequency.value = 880;
    const lp = ctx.createBiquadFilter(); // takes the worst of the harshness off the square wave
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    this.osc.connect(lp).connect(this.master);
    this.osc.start();
    let high = false;
    this.timer = setInterval(() => {
      high = !high;
      this.osc.frequency.setTargetAtTime(high ? 1175 : 880, ctx.currentTime, 0.01);
    }, 260);
  }

  // Quieter as the reps pile up: 1 = full, 0.25 = nearly done.
  setScale(x) {
    this.scale = x;
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.9 * x, now, 0.15);
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.osc) {
      try { this.osc.stop(); } catch { /* already stopped */ }
      this.osc.disconnect();
      this.osc = null;
    }
    if (this.master) {
      this.master.disconnect();
      this.master = null;
    }
    this.scale = 1;
  }

  blip(freq = 660, dur = 0.09, gain = 0.25) {
    if (!this.unlock()) return;
    const { ctx } = this;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  success() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 0.3), i * 120));
  }
}
