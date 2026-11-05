// Original short board/wood/steel transients, generated once per audio context.
// Each impact has its own envelope and resonances instead of reusing white noise.
export function createSkateImpact(context, kind) {
  const duration = { pop: 0.11, landing: 0.24, grind: 0.25, bail: 0.32, loss: 0.10, catch: 0.08, push: 0.14 }[kind] ?? .14;
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 173;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return seed / 2147483648; };
  const wood = (t, pitch, decay) => t < 0 ? 0 : Math.exp(-t * decay) * (
    Math.sin(t * Math.PI * 2 * pitch) * 0.45
    + Math.sin(t * Math.PI * 2 * pitch * 2.7) * 0.28
    + Math.sin(t * Math.PI * 2 * pitch * 6.1) * 0.15);
  for (let i = 0; i < samples.length; i++) {
    const t = i / context.sampleRate, n = noise();
    let value;
    switch (kind) {
      case 'pop': value = wood(t, 245, 55) + n * Math.exp(-t * 130) * 0.9; break;
      case 'landing':
        // Front and rear trucks contact a few milliseconds apart.
        value = wood(t, 145, 30) + wood(t - 0.019, 195, 38) * 0.75
          + n * Math.exp(-t * 65) * 0.65; break;
      case 'grind': value = wood(t, 1270, 24) * 0.6 + n * Math.exp(-t * 28) * 0.65; break;
      case 'bail': value = wood(t, 90, 18) + n * Math.exp(-t * 19) * 0.65; break;
      // Brief board rattle on losing control; no low body-impact resonance.
      case 'loss': value = wood(t, 680, 65) * .3 + n * Math.exp(-t * 60) * .3; break;
      case 'catch': value = wood(t, 330, 85) + n * Math.exp(-t * 150) * 0.35; break;
      case 'push': value = n * Math.sin(Math.PI * t / duration) ** 2 * 0.65; break;
      default: value = 0;
    }
    const attack = Math.min(1, t / 0.0015);
    const release = Math.min(1, (duration - t) / 0.012);
    samples[i] = Math.tanh(value) * attack * release;
  }
  return buffer;
}
