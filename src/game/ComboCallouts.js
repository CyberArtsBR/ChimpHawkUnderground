/**
 * Combo callouts (2026-11 enhancement pass): a big hype word when a landed
 * combo reaches a milestone, with a colour flash and a synthesised stinger.
 * Presentation only; scoring is untouched. The existing crowd reactions in
 * SkateAudio keep playing alongside.
 */
export const CALLOUT_TIERS = Object.freeze([
  Object.freeze({ min: 25000, label: 'CHIMPTASTIC!', tone: 'legend', level: 4 }),
  Object.freeze({ min: 12000, label: 'INSANE!', tone: 'fire', level: 3 }),
  Object.freeze({ min: 6000, label: 'SICK!', tone: 'gold', level: 2 }),
  Object.freeze({ min: 3000, label: 'NICE!', tone: 'cyan', level: 1 }),
]);

/** The tier a landed combo earns, or null below the first milestone. */
export function calloutTier(points) {
  const value = Number(points);
  if (!Number.isFinite(value)) return null;
  return CALLOUT_TIERS.find(tier => value >= tier.min) || null;
}

export class ComboCallouts {
  constructor({ parent = globalThis.document?.body, audio = null } = {}) {
    this.audio = audio;
    this.root = null;
    this.timer = null;
    if (!parent || typeof document === 'undefined') return;
    this.root = document.createElement('div');
    this.root.id = 'combo-callout';
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = '<div class="callout-flash"></div><div class="callout-word"><b></b><span></span></div>';
    parent.append(this.root);
  }

  /** Show the callout for a landed combo. Returns the tier shown, or null. */
  show(points) {
    const tier = calloutTier(points);
    if (!tier || !this.root) return tier;
    const word = this.root.querySelector('.callout-word');
    word.querySelector('b').textContent = tier.label;
    word.querySelector('span').textContent = `+${Math.round(points).toLocaleString()}`;
    this.root.dataset.tone = tier.tone;
    this.root.dataset.level = String(tier.level);
    this.root.classList.remove('show');
    void this.root.offsetWidth;
    this.root.classList.add('show');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.root?.classList.remove('show'), 1900);
    this.stinger(tier.level);
    return tier;
  }

  /** Rising whoosh + bass hit; higher tiers add a bright chord. */
  stinger(level) {
    const ctx = this.audio?.context;
    if (!ctx || ctx.state !== 'running' || !this.audio.master || this.audio.enabled === false) return;
    const out = this.audio.master;
    const t = ctx.currentTime;
    // Whoosh: filtered noise sweeping up.
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .6), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (i / data.length);
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.Q.value = 1.4;
    band.frequency.setValueAtTime(400, t);
    band.frequency.exponentialRampToValueAtTime(3200 + level * 600, t + .45);
    const wGain = ctx.createGain();
    wGain.gain.setValueAtTime(0, t);
    wGain.gain.linearRampToValueAtTime(.07 + level * .02, t + .4);
    wGain.gain.linearRampToValueAtTime(0, t + .55);
    whoosh.connect(band).connect(wGain).connect(out);
    whoosh.start(t);
    // Bass hit as the word lands.
    const hitAt = t + .42;
    const bass = ctx.createOscillator();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(110, hitAt);
    bass.frequency.exponentialRampToValueAtTime(45, hitAt + .35);
    const bGain = ctx.createGain();
    bGain.gain.setValueAtTime(0, hitAt);
    bGain.gain.linearRampToValueAtTime(.22 + level * .04, hitAt + .01);
    bGain.gain.exponentialRampToValueAtTime(.001, hitAt + .5);
    bass.connect(bGain).connect(out);
    bass.start(hitAt); bass.stop(hitAt + .55);
    // Bright chord for SICK and above.
    if (level >= 2) {
      const notes = level >= 4 ? [523.25, 659.25, 783.99, 1046.5] : level >= 3 ? [440, 554.37, 659.25] : [392, 493.88];
      for (const frequency of notes) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = frequency;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, hitAt);
        g.gain.linearRampToValueAtTime(.035, hitAt + .02);
        g.gain.exponentialRampToValueAtTime(.001, hitAt + .9 + level * .1);
        osc.connect(g).connect(out);
        osc.start(hitAt); osc.stop(hitAt + 1.2 + level * .1);
      }
    }
  }

  dispose() {
    clearTimeout(this.timer);
    this.root?.remove();
    this.root = null;
  }
}
