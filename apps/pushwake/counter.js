// Counts pushups from the average brightness of a phone camera lying face up on the floor.
// At the top of a pushup the lens sees the room, at the bottom your chest covers it. One full
// bright -> dark -> bright cycle is one rep. Brightness is 0..1, time is in milliseconds.

export const SENSITIVITY = {
  low: { dropRatio: 0.45, riseRatio: 0.7 },
  normal: { dropRatio: 0.6, riseRatio: 0.8 },
  high: { dropRatio: 0.75, riseRatio: 0.88 },
};

export class RepCounter {
  constructor(opts = {}) {
    this.dropRatio = opts.dropRatio ?? 0.6; // at or below this share of the "up" brightness = down
    this.riseRatio = opts.riseRatio ?? 0.8; // back above this share = up again, rep counted
    this.minDelta = opts.minDelta ?? 0.05; // absolute drop needed, so noise in a dim room never counts
    this.minCycleMs = opts.minCycleMs ?? 800; // no human does a pushup faster than this, so quicker flicker is noise
    this.minDownMs = opts.minDownMs ?? 300; // a hand wave over the lens is shorter than this (measured after smoothing)
    this.warmupMs = opts.warmupMs ?? 600;
    this.stuckMs = opts.stuckMs ?? 12000; // lights changed while "down": re-learn instead of hanging
    this.reset();
  }

  reset() {
    this.reps = 0;
    this.state = 'warmup';
    this.hi = 0;
    this.v = null;
    this.t0 = 0;
    this.lastT = 0;
    this.downAt = 0;
    this.lastDownAt = null;
    this.validDown = false;
  }

  // Feed one brightness sample. Returns the current snapshot, with `counted` true on the sample
  // that completed a rep.
  push(luma, t) {
    let counted = false;
    if (this.v === null) {
      this.v = this.hi = luma;
      this.t0 = this.lastT = t;
      return this.snapshot(false);
    }
    const dt = Math.max(1, t - this.lastT);
    this.lastT = t;
    this.v += (luma - this.v) * (1 - Math.exp(-dt / 90));

    if (this.state === 'warmup') {
      this.hi = Math.max(this.hi, this.v);
      if (t - this.t0 >= this.warmupMs) this.state = 'up';
    } else if (this.state === 'up') {
      if (this.v > this.hi) this.hi = this.v;
      else this.hi += (this.v - this.hi) * (1 - Math.exp(-dt / 20000)); // follow slow lighting changes
      if (this.v <= this.hi * this.dropRatio && this.hi - this.v >= this.minDelta) {
        // Compare with the previous attempt, counted or not, so steady flicker never sneaks through.
        this.validDown = this.lastDownAt === null || t - this.lastDownAt >= this.minCycleMs;
        this.lastDownAt = t;
        this.state = 'down';
        this.downAt = t;
      }
    } else {
      if (this.v > this.hi) this.hi = this.v;
      if (this.v >= this.hi * this.riseRatio) {
        this.state = 'up';
        if (this.validDown && t - this.downAt >= this.minDownMs) {
          this.reps += 1;
          counted = true;
        }
      } else if (t - this.downAt >= this.stuckMs) {
        this.state = 'up';
        this.hi = this.v;
      }
    }
    return this.snapshot(counted);
  }

  snapshot(counted) {
    const level = this.hi > 0 ? Math.min(1, Math.max(0, this.v / this.hi)) : 1;
    return { reps: this.reps, state: this.state, level, counted, tooDark: this.hi < 0.03, luma: this.v };
  }
}
