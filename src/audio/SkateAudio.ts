// Web Audio mix: real CC0 skate recordings (see public/audio/foley/CREDITS.md).
// Rolling and grinding are continuous loops whose level, pitch and filter
// follow speed; impacts are one-shots with random variant + pitch so repeats
// don't sound robotic. Music streams one track at a time on its own bus.
import type { Skater, SkaterEvent } from '../skater/Skater';

const BASE = import.meta.env.BASE_URL + 'audio/';
const FOLEY = {
  pop: ['pop.wav', 'pop-skate-1.wav', 'pop-skate-2.wav'],
  land: ['land.wav', 'land-skate-1.wav', 'land-skate-2.wav'],
  catch: ['catch-skate-1.wav', 'catch-skate-2.wav'],
  bail: ['bail.ogg'],
  pain: ['voice-pain-1.mp3', 'voice-pain-2.mp3', 'voice-pain-3.mp3'],
  bank: ['cue-confirm.ogg'],
  claps: ['crowd-claps.ogg'],
  roll: ['roll.wav'],
  grindMetal: ['scrape-skate-metal.mp3'],
  grindConcrete: ['scrape-skate-concrete.mp3'],
  ambience: ['ambience-paradise.wav'],
} as const;
type Bank = keyof typeof FOLEY;

export const TRACKS: readonly [string, string][] = [
  ['Chimpion Slide', 'chimpion-slide.mp3'], ['Chimpion Drip', 'chimpion-drip.mp3'], ['West Park', 'west-park.mp3'],
  ['Old School Flip', 'old-school-flip.mp3'], ['Aerial Flute', 'aerial-flute.mp3'], ['Skate Vibe', 'skate-vibe.mp3'], ['808 Bas', '808-bas.mp3'],
];

interface Loop { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode }

export class SkateAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer | null>>();
  private loops: Partial<Record<'roll' | 'grindMetal' | 'grindConcrete' | 'ambience', Loop>> = {};
  private lastVariant = new Map<Bank, number>();
  private music = new Audio();
  private trackOrder: number[] = [];
  onTrackChange: ((title: string) => void) | null = null;
  sfxVolume = 0.9;
  musicVolume = 0.45;

  constructor() {
    try {
      this.sfxVolume = Number(localStorage.getItem('chimphawk.sfxVolume') ?? 0.9);
      this.musicVolume = Number(localStorage.getItem('chimphawk.musicVolume') ?? 0.45);
    } catch { /* ignore */ }
    this.music.preload = 'none';
    this.music.addEventListener('ended', () => this.nextTrack());
  }

  /** Must run inside a user gesture (click / key). Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.master.connect(comp).connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxVolume;
      this.sfx.connect(this.master);
      // Warm up every bank in the background; the first sounds may be silent while loading.
      for (const bank of Object.keys(FOLEY) as Bank[]) for (const file of FOLEY[bank]) void this.load(file);
      void this.startLoops();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.music.paused && this.musicVolume > 0) this.nextTrack();
  }

  setSfxVolume(v: number): void { this.sfxVolume = v; if (this.sfx) this.sfx.gain.value = v; try { localStorage.setItem('chimphawk.sfxVolume', String(v)); } catch { /* ignore */ } }
  setMusicVolume(v: number): void {
    this.musicVolume = v; this.music.volume = v;
    try { localStorage.setItem('chimphawk.musicVolume', String(v)); } catch { /* ignore */ }
    if (v === 0) this.music.pause(); else if (this.music.paused && this.ctx) void this.music.play().catch(() => {});
  }

  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    if (paused) { void this.ctx.suspend(); this.music.volume = this.musicVolume * 0.35; }
    else { void this.ctx.resume(); this.music.volume = this.musicVolume; }
  }

  nextTrack(): void {
    if (!this.trackOrder.length) this.trackOrder = TRACKS.map((_, i) => i).sort(() => Math.random() - 0.5);
    const index = this.trackOrder.shift()!;
    const [title, file] = TRACKS[index];
    this.music.src = BASE + 'music/' + file;
    this.music.volume = this.musicVolume;
    if (this.musicVolume > 0) void this.music.play().catch(() => {});
    this.onTrackChange?.(title);
  }

  private load(file: string): Promise<AudioBuffer | null> {
    const cached = this.loading.get(file);
    if (cached) return cached;
    const promise = fetch(BASE + 'foley/' + file)
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(file))))
      .then(data => this.ctx!.decodeAudioData(data))
      .then(buffer => { this.buffers.set(file, buffer); return buffer; })
      .catch(() => null);
    this.loading.set(file, promise);
    return promise;
  }

  private async startLoops(): Promise<void> {
    const ctx = this.ctx!;
    for (const [name, file, type, freq] of [
      ['roll', FOLEY.roll[0], 'lowpass', 1800],
      ['grindMetal', FOLEY.grindMetal[0], 'bandpass', 2600],
      ['grindConcrete', FOLEY.grindConcrete[0], 'lowpass', 2200],
      ['ambience', FOLEY.ambience[0], 'lowpass', 4000],
    ] as const) {
      const buffer = await this.load(file);
      if (!buffer) continue;
      const source = ctx.createBufferSource();
      source.buffer = buffer; source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type; filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = name === 'ambience' ? 0.18 : 0;
      source.connect(filter).connect(gain).connect(this.sfx);
      source.start(0, Math.random() * buffer.duration);
      this.loops[name] = { source, gain, filter };
    }
  }

  private play(bank: Bank, { volume = 1, rate = 1, jitter = 0.06 } = {}): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const files = FOLEY[bank];
    let pick = Math.floor(Math.random() * files.length);
    if (files.length > 1 && pick === this.lastVariant.get(bank)) pick = (pick + 1) % files.length;
    this.lastVariant.set(bank, pick);
    const buffer = this.buffers.get(files[pick]);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.sfx);
    source.start();
  }

  handle(event: SkaterEvent): void {
    switch (event.type) {
      case 'pop': this.play('pop', { volume: 0.9 }); break;
      case 'land': this.play('land', { volume: Math.min(1.2, 0.45 + event.impact * 0.09), rate: 1 - Math.min(0.15, event.impact * 0.01) }); break;
      case 'trick': if (/flip|Shove|Impossible/i.test(event.name)) setTimeout(() => this.play('catch', { volume: 0.6 }), 280); break;
      case 'bail': this.play('bail', { volume: 1.1 }); this.play('pain', { volume: 0.55, jitter: 0.04 }); break;
      case 'bank':
        this.play('bank', { volume: 0.5, rate: event.multiplier > 3 ? 1.25 : 1 });
        if (event.points >= 2500) this.play('claps', { volume: Math.min(0.8, 0.3 + event.points / 20000) });
        break;
      case 'grind': this.play('land', { volume: 0.5, rate: 1.3 }); break;
      default: break;
    }
  }

  /** Continuous layers: call every rendered frame. */
  update(skater: Skater): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const rolling = skater.state === 'ground' || skater.state === 'manual';
    const speed = skater.state === 'grind' ? skater.grind!.speed : skater.speed;
    const roll = this.loops.roll;
    if (roll) {
      const level = rolling ? Math.min(0.9, 0.08 + speed / 22) : 0;
      roll.gain.gain.setTargetAtTime(level, t, rolling ? 0.03 : 0.015);
      roll.source.playbackRate.setTargetAtTime(0.75 + Math.min(0.6, speed / 30), t, 0.05);
      roll.filter.frequency.setTargetAtTime(700 + speed * 120, t, 0.05);
    }
    const metalRail = skater.grind && skater.grind.rail.type !== 'ledge';
    const concreteRail = skater.grind && skater.grind.rail.type === 'ledge';
    for (const [loop, on] of [[this.loops.grindMetal, metalRail], [this.loops.grindConcrete, concreteRail]] as const) {
      if (!loop) continue;
      loop.gain.gain.setTargetAtTime(on ? Math.min(1, 0.45 + speed / 18) : 0, t, on ? 0.02 : 0.04);
      loop.source.playbackRate.setTargetAtTime(0.85 + Math.min(0.4, speed / 25), t, 0.05);
    }
  }
}
