/**
 * Music that reacts (2026-11): the soundtrack opens up as your combo grows
 * (brighter highs, fuller lows, a touch louder) and muffles for a moment when
 * you bail. The track element is routed once through a small Web Audio chain
 * on the game's own AudioContext; volume, ducking and track changes keep
 * working through the element as before.
 */
export const REACTIVE_MUSIC = Object.freeze({
  restLowpass: 9000,      // Hz with no combo: slightly mellow
  peakLowpass: 20000,     // Hz at a big combo: fully open
  bailLowpass: 520,       // Hz right after a bail: muffled
  bailSeconds: 1.1,
  restTreble: -2.5, peakTreble: 3.5,   // dB high shelf
  restBass: 0, peakBass: 3,            // dB low shelf
  restGain: .92, peakGain: 1.06,
  comboForPeak: 8000,     // combo points for the full effect
  // Brick-wall limiter at the end of the music chain. The combo lift (+gain,
  // +bass/treble shelves) pushed peaks to +1.3..+2.8 dBFS at full music
  // volume, i.e. audible clipping on big combos. Below the threshold the
  // music is unchanged: the trim cancels the compressor's automatic makeup.
  limiterThreshold: -1, limiterRatio: 20,
});

/** Linear trim that cancels Web Audio's automatic compressor makeup gain
 * (makeup = 0.6 x the full-scale gain reduction, hard knee). */
export function limiterMakeupTrim(threshold = REACTIVE_MUSIC.limiterThreshold, ratio = REACTIVE_MUSIC.limiterRatio) {
  const fullScaleDb = threshold + (0 - threshold) / ratio;
  return Math.pow(10, (0.6 * fullScaleDb) / 20);
}

const clamp01 = v => Math.max(0, Math.min(1, v));

export class ReactiveMusic {
  constructor() {
    this.chain = null;
    this.failed = false;
    this.bail = 0;
    this.level = 0;
    this.wasBailing = false;
  }

  /** Connect lazily, only once the shared AudioContext is running. */
  connect(music, audio) {
    if (this.chain || this.failed) return Boolean(this.chain);
    const ctx = audio?.context, element = music?.audio;
    if (!ctx || ctx.state !== 'running' || !element) return false;
    try {
      const source = ctx.createMediaElementSource(element);
      const bass = ctx.createBiquadFilter(); bass.type = 'lowshelf'; bass.frequency.value = 180;
      const treble = ctx.createBiquadFilter(); treble.type = 'highshelf'; treble.frequency.value = 3200;
      const lowpass = ctx.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.Q.value = .7;
      const gain = ctx.createGain();
      const R = REACTIVE_MUSIC, limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = R.limiterThreshold; limiter.knee.value = 0; limiter.ratio.value = R.limiterRatio;
      limiter.attack.value = .002; limiter.release.value = .1;
      const trim = ctx.createGain(); trim.gain.value = limiterMakeupTrim();
      source.connect(bass).connect(treble).connect(lowpass).connect(gain).connect(limiter).connect(trim).connect(ctx.destination);
      this.chain = { ctx, bass, treble, lowpass, gain, limiter, trim };
      this.apply(0, true);
      return true;
    } catch (error) {
      // A media element can only be wired once; never retry into silence.
      this.failed = true;
      console.warn('Reactive music unavailable', error);
      return false;
    }
  }

  apply(dt, instant = false) {
    const c = this.chain, R = REACTIVE_MUSIC;
    if (!c) return;
    const t = c.ctx.currentTime, k = instant ? 0 : .12;
    const lift = this.level;
    let cutoff = R.restLowpass * Math.pow(R.peakLowpass / R.restLowpass, lift);
    if (this.bail > 0) cutoff = Math.min(cutoff, R.bailLowpass + (cutoff - R.bailLowpass) * (1 - this.bail / R.bailSeconds) ** 2);
    c.lowpass.frequency.setTargetAtTime(cutoff, t, this.bail > 0 ? .03 : k || .001);
    c.treble.gain.setTargetAtTime(R.restTreble + (R.peakTreble - R.restTreble) * lift, t, k || .001);
    c.bass.gain.setTargetAtTime(R.restBass + (R.peakBass - R.restBass) * lift, t, k || .001);
    c.gain.gain.setTargetAtTime(R.restGain + (R.peakGain - R.restGain) * lift, t, k || .001);
  }

  update(dt, { music, audio, skater, active }) {
    if (!this.connect(music, audio)) return;
    const bailing = active && Number(skater?.bailTime) > 0;
    if (bailing && !this.wasBailing) this.bail = REACTIVE_MUSIC.bailSeconds;
    this.wasBailing = bailing;
    // Out of play (pause, time-up, results, menus) the muffle clears at once
    // and the combo lift settles back, instead of freezing at its last value.
    this.bail = active ? Math.max(0, this.bail - dt) : 0;
    // Combo size → 0..1 (log scale so small combos still lift the mix a bit).
    const tricks = skater?.tricks;
    const points = active && tricks?.combo?.length ? (tricks.comboBase || 0) * Math.max(1, tricks.comboMultiplier || 1) : 0;
    const target = points > 0 ? clamp01(Math.log10(1 + points) / Math.log10(1 + REACTIVE_MUSIC.comboForPeak)) : 0;
    // Rise quickly with the combo, settle back gently after it lands.
    const rate = target > this.level ? 4 : 1.2;
    this.level += (target - this.level) * Math.min(1, dt * rate);
    this.apply(dt);
  }
}
