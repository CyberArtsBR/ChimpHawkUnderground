export const SESSION_POLICY = Object.freeze({ duration: 90, readySeconds: 1.15, overtimeSeconds: 6 });

const positive = value => Number.isFinite(value) ? Math.max(0, value) : 0;

/** Score-state evidence, not a timer heuristic: charging a fresh ollie is not an attempt. */
export function sessionAttemptState(skater) {
  const comboActive = Boolean(skater?.tricks?.combo?.length);
  const bailed = Number(skater?.bailTime) > 0 || skater?.movementState === 'BAIL';
  const airborne = Boolean(skater && !skater.grounded && !skater.grind && !skater.wallRide);
  return {
    comboActive, bailed,
    eligibleAttempt: !bailed && (comboActive || airborne || Boolean(skater?.grind || skater?.manual)),
  };
}

/**
 * Owns playable-time policy, independently of DOM, rendering and wall clocks.
 * Call update before simulation with the previously observed attempt state;
 * call acceptSettlement in the actual accepted-combo callback. A pause or a
 * hidden document supplies paused:true and consumes no ready/run/grace time.
 */
export class SessionFlow {
  constructor(options = {}) {
    this.duration = positive(options.duration ?? SESSION_POLICY.duration);
    this.readySeconds = positive(options.readySeconds ?? SESSION_POLICY.readySeconds);
    this.overtimeSeconds = positive(options.overtimeSeconds ?? SESSION_POLICY.overtimeSeconds);
    this.begin({ ready: false });
  }

  begin({ practice = false, ready = true } = {}) {
    this.practice = Boolean(practice);
    this.phase = !this.practice && ready && this.readySeconds > 0 ? 'ready' : 'playing';
    this.remaining = this.duration;
    this.readyRemaining = this.phase === 'ready' ? this.readySeconds : 0;
    this.overtimeRemaining = this.overtimeSeconds;
    this.elapsed = 0;
    this.finishReason = null;
    this._settled = false;
    this._events = [];
    return this.snapshot();
  }

  snapshot(events = []) {
    return {
      phase: this.phase, remaining: this.remaining, elapsed: this.elapsed,
      readyRemaining: this.readyRemaining, overtimeRemaining: this.overtimeRemaining,
      allowSimulation: this.phase === 'playing' || this.phase === 'overtime',
      allowNewCombo: this.phase === 'playing', finishReason: this.finishReason, events,
    };
  }

  skipReady() {
    if (this.phase !== 'ready') return false;
    this.readyRemaining = 0;
    this.phase = 'playing';
    this._events.push('go');
    return true; // Caller consumes/releases the same confirm input before play.
  }

  acceptSettlement() {
    if (this.phase === 'playing') return true;
    if (this.phase !== 'overtime' || this._settled) return false;
    this._settled = true;
    return true;
  }

  finish(reason) {
    if (this.phase === 'finished') return false;
    this.phase = 'finished';
    this.finishReason = reason;
    this._events.push('finish');
    return true;
  }

  update(dt, { paused = false, eligibleAttempt = false, comboActive = false, bailed = false, settled = false } = {}) {
    if (paused) return this.snapshot([]);
    const step = positive(dt);
    if (this.phase === 'ready') {
      this.readyRemaining = Math.max(0, this.readyRemaining - step);
      if (this.readyRemaining === 0) this.skipReady();
      // No unearned run time on the ready -> GO transition frame.
      return this.snapshot(this._events.splice(0));
    }
    if (this.phase === 'playing') {
      this.elapsed += this.practice ? step : Math.min(this.remaining, step);
      if (!this.practice) {
        const overflow = Math.max(0, step - this.remaining);
        this.remaining = Math.max(0, this.remaining - step);
        if (this.remaining === 0) {
          if (!bailed && (eligibleAttempt || comboActive)) {
            this.phase = 'overtime';
            this.overtimeRemaining = Math.max(0, this.overtimeSeconds - overflow);
            this.elapsed += Math.min(overflow, this.overtimeSeconds);
            this._events.push('overtime');
            if (this.overtimeRemaining === 0) this.finish('grace-expired');
          } else this.finish(bailed ? 'bail' : 'clock');
        }
      }
    } else if (this.phase === 'overtime') {
      if (bailed) this.finish('bail');
      else if (this._settled || settled) this.finish('landed');
      else {
        const used = Math.min(step, this.overtimeRemaining);
        this.overtimeRemaining = Math.max(0, this.overtimeRemaining - step);
        this.elapsed += used;
        if (this.overtimeRemaining === 0) this.finish('grace-expired');
        else if (!comboActive && !eligibleAttempt) this.finish('attempt-ended');
      }
    }
    return this.snapshot(this._events.splice(0));
  }
}
