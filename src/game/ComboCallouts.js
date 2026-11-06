/**
 * Combo callouts (2026-11 enhancement pass): a big hype word when a landed
 * combo reaches a milestone, drawn with the game's own graffiti letters over
 * a spray-paint cloud, with a colour flash and a synthesised stinger.
 * CHIMPTASTIC adds rainbow letters and a chimp pant-hoot. Presentation only;
 * scoring is untouched. The existing crowd reactions keep playing alongside.
 */
import { gameAssetUrl } from './AssetPaths.js';
import { prepareGraffitiHudGlyphs } from './GraffitiLettering.js';

const RAINBOW = Object.freeze(['fire', 'gold', 'green', 'cyan-purple', 'red']);

export const CALLOUT_TIERS = Object.freeze([
  Object.freeze({ min: 7000, label: 'CHIMPTASTIC!', tone: 'legend', level: 4, letters: RAINBOW, digits: 'gold' }),
  Object.freeze({ min: 5000, label: 'INSANE!', tone: 'fire', level: 3, letters: 'fire', digits: 'gold' }),
  Object.freeze({ min: 3000, label: 'SICK!', tone: 'gold', level: 2, letters: 'gold', digits: 'cyan-purple' }),
]);

/** The tier a landed combo earns, or null below the first milestone. */
export function calloutTier(points) {
  const value = Number(points);
  if (!Number.isFinite(value)) return null;
  return CALLOUT_TIERS.find(tier => value >= tier.min) || null;
}

const escape = value => String(value).replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const toneAt = (palette, index) => Array.isArray(palette) ? palette[index % palette.length] : palette;

/** Graffiti letter images, one palette or a palette per letter (rainbow). */
export function calloutLettering(text, palette) {
  let index = 0;
  return [...String(text).toUpperCase()].map(ch => {
    const i = index++;
    if (/^[A-Z0-9]$/.test(ch)) {
      return `<img src="${gameAssetUrl('/assets/graffiti/')}${toneAt(palette, i)}/${ch}.webp" alt="" draggable="false" style="--i:${i}">`;
    }
    return `<span class="callout-punct" style="--i:${i}">${escape(ch)}</span>`;
  }).join('');
}

/** 'ready' once every letter image is decoded; otherwise 'loading' or 'failed'. */
export function prepareCalloutLettering(text, palette) {
  let state = 'ready';
  [...String(text).toUpperCase()].forEach((ch, i) => {
    if (!/^[A-Z0-9]$/.test(ch)) return;
    const status = prepareGraffitiHudGlyphs(ch, toneAt(palette, i));
    if (status === 'loading') state = 'loading';
    else if (status === 'failed' && state === 'ready') state = 'failed';
  });
  return state;
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
    this.root.innerHTML = '<div class="callout-flash"></div><div class="callout-word">'
      + '<div class="callout-spray"></div><div class="callout-title"></div><div class="callout-points"></div>'
      + '<i class="callout-star s1">✦</i><i class="callout-star s2">✦</i><i class="callout-star s3">✦</i><i class="callout-star s4">✦</i></div>';
    parent.append(this.root);
    // Warm every callout's letters now so the first big combo is not plain text.
    for (const tier of CALLOUT_TIERS) {
      prepareCalloutLettering(tier.label, tier.letters);
      prepareCalloutLettering('+0123456789', tier.digits);
    }
  }

  /** Show the callout for a landed combo. Returns the tier shown, or null. */
  show(points) {
    const tier = calloutTier(points);
    if (!tier || !this.root) return tier;
    this.present(tier, `+${Math.round(points).toLocaleString('en-US')}`);
    return tier;
  }

  /** A custom callout (e.g. BANANA TIME!) in the same graffiti style. */
  showLabel(label, subText = '', { letters = 'gold', digits = 'cyan-purple', tone = 'gold', level = 3 } = {}) {
    if (!this.root) return null;
    const tier = { label, letters, digits, tone, level };
    this.present(tier, subText);
    return tier;
  }

  present(tier, pointsText) {
    const title = this.root.querySelector('.callout-title');
    const amount = this.root.querySelector('.callout-points');
    const titleArt = prepareCalloutLettering(tier.label, tier.letters) === 'ready';
    const pointsArt = prepareCalloutLettering(pointsText, tier.digits) === 'ready';
    title.className = `callout-title ${titleArt ? 'is-art' : 'is-text'}`;
    title.innerHTML = titleArt ? calloutLettering(tier.label, tier.letters) : `<b>${escape(tier.label)}</b>`;
    amount.className = `callout-points ${pointsArt ? 'is-art' : 'is-text'}`;
    amount.innerHTML = pointsArt ? calloutLettering(pointsText, tier.digits) : `<b>${escape(pointsText)}</b>`;
    this.root.setAttribute('aria-label', `${tier.label} ${pointsText}`);
    this.root.dataset.tone = tier.tone;
    this.root.dataset.level = String(tier.level);
    this.root.classList.remove('show');
    void this.root.offsetWidth;
    this.root.classList.add('show');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.root?.classList.remove('show'), 2100);
    this.stinger(tier.level);
  }

  playable() {
    const ctx = this.audio?.context;
    return Boolean(ctx && ctx.state === 'running' && this.audio.master && this.audio.enabled !== false);
  }

  /** Rising whoosh + bass hit + bright chord; CHIMPTASTIC adds chimp calls. */
  stinger(level) {
    if (!this.playable()) return;
    const ctx = this.audio.context;
    const out = this.audio.master;
    const t = ctx.currentTime;
    // Whoosh: filtered noise sweeping up.
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = this.noise(.6, true);
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
    // Bright chord, wider for higher tiers.
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
    if (level >= 4) this.chimpCalls(hitAt + .08);
  }

  /** A chimp pant-hoot: breathy hoots that speed up and climb into screams. */
  chimpCalls(start) {
    if (!this.playable()) return;
    const ctx = this.audio.context;
    const voice = ctx.createGain();
    voice.gain.value = .9;
    voice.connect(this.audio.master);
    const pitch = .92 + Math.random() * .16;
    let at = start;
    const hoots = 7;
    for (let i = 0; i < hoots; i++) {
      const inhale = i % 2 === 1;
      const base = (inhale ? 420 : 330) * pitch * (1 + i * .07);
      const length = Math.max(.07, .16 - i * .012);
      this.hoot(voice, at, base, length, inhale);
      at += length + Math.max(.025, .07 - i * .007);
    }
    this.scream(voice, at + .02, 980 * pitch, .34);
    this.scream(voice, at + .4, 1150 * pitch, .42);
  }

  hoot(out, at, frequency, length, inhale) {
    const ctx = this.audio.context;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency * .8, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * 1.45, at + length * .55);
    osc.frequency.exponentialRampToValueAtTime(frequency * 1.15, at + length);
    // "Ooh" vs "hah" mouth shape.
    const mouth = ctx.createBiquadFilter();
    mouth.type = 'bandpass';
    mouth.Q.value = 3;
    mouth.frequency.setValueAtTime(inhale ? 1100 : 650, at);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(inhale ? .1 : .15, at + .015);
    g.gain.exponentialRampToValueAtTime(.001, at + length);
    osc.connect(mouth).connect(g).connect(out);
    // Breath.
    const air = ctx.createBufferSource();
    air.buffer = this.noise(length);
    const airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass'; airBand.frequency.value = 1600; airBand.Q.value = .8;
    const ag = ctx.createGain();
    ag.gain.setValueAtTime(.035, at);
    ag.gain.exponentialRampToValueAtTime(.001, at + length);
    air.connect(airBand).connect(ag).connect(out);
    osc.start(at); osc.stop(at + length + .02);
    air.start(at);
  }

  scream(out, at, frequency, length) {
    const ctx = this.audio.context;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency * .75, at);
    osc.frequency.exponentialRampToValueAtTime(frequency * 1.3, at + length * .3);
    osc.frequency.exponentialRampToValueAtTime(frequency * .9, at + length);
    // Fast warble gives the shriek its rasp.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 26;
    const depth = ctx.createGain();
    depth.gain.value = frequency * .06;
    lfo.connect(depth).connect(osc.frequency);
    const throat = ctx.createBiquadFilter();
    throat.type = 'bandpass'; throat.frequency.value = 1900; throat.Q.value = 2.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(.075, at + .03);
    g.gain.setValueAtTime(.075, at + length * .6);
    g.gain.exponentialRampToValueAtTime(.001, at + length);
    osc.connect(throat).connect(g).connect(out);
    osc.start(at); osc.stop(at + length + .02);
    lfo.start(at); lfo.stop(at + length + .02);
  }

  noise(seconds, rising = false) {
    const ctx = this.audio.context;
    const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (rising ? i / data.length : 1);
    return buffer;
  }

  dispose() {
    clearTimeout(this.timer);
    this.root?.remove();
    this.root = null;
  }
}
