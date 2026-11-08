/**
 * Spatial one-shot sounds for World Life (2026-11). Every voice is
 * synthesised (no asset files), placed in the world with an equal-power
 * PannerNode and routed into SkateAudio's `extras` bus, so pause and
 * Sound OFF silence it within ~30 ms. At most 8 life voices play at once.
 *
 * `skateAudio.extras` is looked up at play time: SkateAudio replaces that
 * node whenever it silences, so it must never be cached here.
 */
export const LIFE_AUDIO = Object.freeze({
  kinds: Object.freeze(['flap', 'chirp', 'clink', 'thud', 'creak', 'rattle', 'beep', 'hum', 'ring', 'clatter', 'whoosh']),
  maxVoices: 8,
  refDistance: 4,
  maxDistance: 60,
  maxLoopSeconds: 30,
  // Subtle: life sounds sit well under the rider's own foley.
  level: .3,
});

const TAU = Math.PI * 2;
const noise = () => Math.random() * 2 - 1;
const lowpassCoefficient = (frequency, sampleRate) => 1 - Math.exp(-TAU * frequency / sampleRate);

/** Fill-functions for each kind: (data, sampleRate) => void. Durations in seconds. */
const SYNTHS = {
  // A few soft wingbeats: band-limited noise bursts.
  flap: { seconds: .36, fill(d, sr) {
    const lo = lowpassCoefficient(1900, sr), lo2 = lowpassCoefficient(420, sr);
    let a = 0, b = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, beat = t % .085, n = noise();
      a += lo * (n - a); b += lo2 * (n - b);
      d[i] = (a - b) * Math.exp(-beat / .024) * Math.exp(-t / .22);
    }
  } },
  // Two quick rising bird notes.
  chirp: { seconds: .22, fill(d, sr) {
    let phase = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, second = t >= .11, u = second ? (t - .11) / .09 : t / .08;
      if (u < 0 || u > 1) { d[i] = 0; continue; }
      phase += TAU * (2600 + 1200 * u + (second ? 300 : 0)) / sr;
      d[i] = Math.sin(phase) * Math.sin(Math.PI * u);
    }
  } },
  // Small metal tap: inharmonic partials.
  clink: { seconds: .45, fill(d, sr) {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = .6 * Math.sin(TAU * 2350 * t) * Math.exp(-t / .12) + .35 * Math.sin(TAU * 3720 * t) * Math.exp(-t / .08)
        + .2 * Math.sin(TAU * 5980 * t) * Math.exp(-t / .05) + (t < .002 ? noise() * .4 : 0);
    }
  } },
  // Soft low impact: falling sine plus muffled noise.
  thud: { seconds: .3, fill(d, sr) {
    const lo = lowpassCoefficient(400, sr);
    let phase = 0, n = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      phase += TAU * (45 + 50 * Math.exp(-t / .05)) / sr;
      n += lo * (noise() - n);
      d[i] = Math.sin(phase) * Math.exp(-t / .07) + n * 2.5 * Math.exp(-t / .03);
    }
  } },
  // Wood/metal creak: wobbling low sawtooth, lowpassed.
  creak: { seconds: .7, fill(d, sr) {
    const lo = lowpassCoefficient(1200, sr);
    let phase = 0, y = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, u = t / .7;
      phase = (phase + (110 + 30 * Math.sin(TAU * 1.3 * t) + noise() * 6) / sr) % 1;
      y += lo * ((phase * 2 - 1) - y);
      d[i] = y * Math.pow(Math.sin(Math.PI * u), .7) * (.6 + .4 * Math.sin(TAU * 7 * t));
    }
  } },
  // Loose rattle: a decaying burst of tiny clicks.
  rattle: { seconds: .5, fill(d, sr) {
    let click = 0, y = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      if (Math.random() < 40 / sr * Math.exp(-t / .2)) click = 1;
      click *= Math.exp(-1 / (sr * .004));
      const x = noise() * click;
      d[i] = x - y; y = x; // crude high-pass keeps it clicky
      d[i] *= Math.exp(-t / .25);
    }
  } },
  // Electronic beep.
  beep: { seconds: .14, fill(d, sr) {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, env = Math.min(1, t / .005, (.14 - t) / .02);
      d[i] = (Math.sin(TAU * 1320 * t) + .3 * Math.sin(TAU * 2640 * t)) * Math.max(0, env);
    }
  } },
  // Mains hum: whole cycles over the buffer so it loops seamlessly (no envelope).
  hum: { seconds: 1, fill(d, sr) {
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length;
      d[i] = .5 * Math.sin(TAU * 60 * t) + .3 * Math.sin(TAU * 120 * t) + .12 * Math.sin(TAU * 180 * t);
    }
  } },
  // Little bell.
  ring: { seconds: .8, fill(d, sr) {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = .6 * Math.sin(TAU * 1046 * t) * Math.exp(-t / .35) + .3 * Math.sin(TAU * 2887 * t) * Math.exp(-t / .18)
        + .15 * Math.sin(TAU * 5650 * t) * Math.exp(-t / .09);
    }
  } },
  // Something tumbling: a few uneven impacts with a metallic tail.
  clatter: { seconds: .6, fill(d, sr) {
    const hits = [[0, 1, 1700], [.07, .7, 2300], [.15, .55, 1250], [.26, .4, 2050], [.4, .25, 1500]];
    d.fill(0);
    for (const [at, amp, f] of hits) {
      for (let i = Math.floor(at * sr); i < d.length; i++) {
        const t = i / sr - at;
        if (t > .18) break;
        d[i] += amp * (noise() * Math.exp(-t / .008) + .5 * Math.sin(TAU * f * t) * Math.exp(-t / .06));
      }
    }
  } },
  // Air moving past: swept, enveloped noise.
  whoosh: { seconds: .6, fill(d, sr) {
    let y = 0;
    for (let i = 0; i < d.length; i++) {
      const u = i / d.length, shape = Math.sin(Math.PI * u);
      y += lowpassCoefficient(300 + 1900 * shape, sr) * (noise() - y);
      d[i] = y * Math.pow(shape, 1.5);
    }
  } },
};

function normalise(data, peak = .8) {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / max;
}

export class LifeAudio {
  constructor(skateAudio) {
    this.skateAudio = skateAudio || null;
    this.buffers = new Map();
    this.bufferContext = null;
    this.voiceSources = new Array(LIFE_AUDIO.maxVoices).fill(null);
    this.voiceGains = new Array(LIFE_AUDIO.maxVoices).fill(null);
    this.voiceEnds = new Float64Array(LIFE_AUDIO.maxVoices);
    this.voiceKinds = new Array(LIFE_AUDIO.maxVoices).fill(null);
  }

  /** The running AudioContext, or null when sound is off/locked/suspended. */
  context() {
    const audio = this.skateAudio, ctx = audio?.context;
    if (!ctx || ctx.state !== 'running' || audio.enabled === false || !audio.extras) return null;
    return ctx;
  }

  buffer(ctx, kind) {
    if (this.bufferContext !== ctx) { this.buffers.clear(); this.bufferContext = ctx; }
    let buffer = this.buffers.get(kind);
    if (buffer) return buffer;
    const synth = SYNTHS[kind];
    if (!synth) return null;
    buffer = ctx.createBuffer(1, Math.max(1, Math.round(synth.seconds * ctx.sampleRate)), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    synth.fill(data, ctx.sampleRate);
    normalise(data);
    this.buffers.set(kind, buffer);
    return buffer;
  }

  /** Ears go where the camera is. Call once per frame. */
  setListener(camera) {
    const ctx = this.context(), listener = ctx?.listener;
    if (!listener || !camera?.matrixWorld) return;
    const e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    let fx = -e[8], fy = -e[9], fz = -e[10];
    let ux = e[4], uy = e[5], uz = e[6];
    const fl = Math.hypot(fx, fy, fz) || 1, ul = Math.hypot(ux, uy, uz) || 1;
    fx /= fl; fy /= fl; fz /= fl; ux /= ul; uy /= ul; uz /= ul;
    if (listener.positionX) {
      listener.positionX.value = px; listener.positionY.value = py; listener.positionZ.value = pz;
      listener.forwardX.value = fx; listener.forwardY.value = fy; listener.forwardZ.value = fz;
      listener.upX.value = ux; listener.upY.value = uy; listener.upZ.value = uz;
    } else {
      listener.setPosition?.(px, py, pz);
      listener.setOrientation?.(fx, fy, fz, ux, uy, uz);
    }
  }

  /**
   * Play one synthesised kind at a world position. Returns false (and does
   * nothing) without a running context, for an unknown kind, or when all
   * 8 life voices are busy.
   * `loop: true` sustains the buffer (meant for 'hum') for `duration` seconds
   * (default 2, max 30); it holds its voice slot until then. End it early with
   * `stop(kind)`, e.g. `audio.stop('hum')`.
   */
  play(kind, position, { gain = 1, rate = 1, loop = false, duration: sustain } = {}) {
    const ctx = this.context();
    if (!ctx || !SYNTHS[kind]) return false;
    const now = ctx.currentTime;
    let slot = -1;
    for (let i = 0; i < LIFE_AUDIO.maxVoices; i++) {
      if (!this.voiceSources[i] || this.voiceEnds[i] <= now) { slot = i; break; }
    }
    if (slot < 0) return false;
    const buffer = this.buffer(ctx, kind);
    const playbackRate = Math.min(4, Math.max(.25, Number(rate) || 1));
    const duration = loop
      ? Math.min(LIFE_AUDIO.maxLoopSeconds, Math.max(.05, Number(sustain) || 2))
      : buffer.duration / playbackRate;
    const level = LIFE_AUDIO.level * Math.max(0, Number(gain) || 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    source.loop = Boolean(loop);
    const amp = ctx.createGain();
    // Tiny attack/release so no voice (e.g. the hum loop) ever clicks.
    const fade = Math.min(.012, duration / 4);
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(level, now + fade);
    amp.gain.setValueAtTime(level, now + duration - fade);
    amp.gain.linearRampToValueAtTime(0, now + duration);
    const panner = ctx.createPanner();
    panner.panningModel = 'equalpower';
    panner.distanceModel = 'inverse';
    panner.refDistance = LIFE_AUDIO.refDistance;
    panner.maxDistance = LIFE_AUDIO.maxDistance;
    panner.rolloffFactor = 1;
    const x = position?.x || 0, y = position?.y || 0, z = position?.z || 0;
    if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; }
    else panner.setPosition?.(x, y, z);

    source.connect(amp); amp.connect(panner); panner.connect(this.skateAudio.extras);
    source.onended = () => {
      try { source.disconnect(); amp.disconnect(); panner.disconnect(); } catch {}
      if (this.voiceSources[slot] === source) { this.voiceSources[slot] = null; this.voiceGains[slot] = null; this.voiceKinds[slot] = null; }
    };
    source.start(now);
    source.stop(now + duration + .02);
    this.voiceSources[slot] = source;
    this.voiceGains[slot] = amp;
    this.voiceKinds[slot] = kind;
    this.voiceEnds[slot] = now + duration + .03;
    return true;
  }

  /**
   * Fade out (20 ms) and stop live voices: every voice (quality switched off,
   * park change, reset), or only those of one kind, e.g. stop('hum').
   */
  stop(kind = null) {
    const now = this.skateAudio?.context?.currentTime ?? 0;
    for (let i = 0; i < LIFE_AUDIO.maxVoices; i++) {
      const source = this.voiceSources[i], amp = this.voiceGains[i];
      if (!source || (kind && this.voiceKinds[i] !== kind)) continue;
      try {
        amp?.gain.cancelScheduledValues?.(now);
        amp?.gain.setValueAtTime?.(amp.gain.value, now);
        amp?.gain.linearRampToValueAtTime?.(0, now + .02);
        source.stop(now + .03);
      } catch {}
      this.voiceSources[i] = null; this.voiceGains[i] = null; this.voiceEnds[i] = 0; this.voiceKinds[i] = null;
    }
  }
}
