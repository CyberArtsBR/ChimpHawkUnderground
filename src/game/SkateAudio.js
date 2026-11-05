// Real CC0 skateboard recordings with a synthesized fallback when unavailable.
import { readAudioVolume, saveAudioVolume, readBackgroundAudio, saveBackgroundAudio } from './AudioSettings.js';
import { createSkateImpact } from './SkateSoundSynthesis.js';
import { surfaceAudioFor, surfaceTagFor, validatedSurfaceTag } from './SurfaceAudio.js';
import { AudioReactions, pickNonRepeating } from './AudioReactions.js';
import { loadSkateFoley, loadSkateFoleyBanks, foleyCacheStatus, disposeFoleyCache, seamlessFoleyLoop, recordedVoiceGain, SKATE_SCRAPE_WINDOWS } from './SkateFoley.js';
export class SkateAudio {
  constructor() {
    this.enabled = true;
    try { this.enabled = localStorage.getItem('streetskate.sound') !== 'off'; } catch {}
    this.previous = null;
    this.baseGain = 0.85;
    this.effectsVolume = readAudioVolume('effects');
    this.announcerVolume = readAudioVolume('announcer');
    this.crowdVolume = readAudioVolume('crowd');
    this.voiceVolume = readAudioVolume('voice');
    this.reactions = new AudioReactions();
    this.banks = {}; this.lastSamples = new Map(); this.location = ''; this.surfaceTag = 'neutral';
    this.backgroundAudio = readBackgroundAudio();
    this.masterVolume = this.effectsVolume;
    this.lastImpactTime = -Infinity;
    this.lastImpacts = new Map();
    this.voices = new Set();
    this.replayVoices = new Set();
    this.replayGrind = null;
    this.replayLastImpacts = new Map();
    this.characterReactions = new Map(); this.voiceLevels = new WeakMap(); this.ambienceTails = new Map();
    this.reactionDucks = new Map();
    this.disposed = false;
    this.lastBailImpact = null;
    this.recordedFoley = new Set();
    this._visibility = () => { if (this.isBackgroundMuted()) this.silence(); };
    globalThis.document?.addEventListener?.('visibilitychange', this._visibility);
  }

  isBackgroundMuted() { return !this.backgroundAudio && Boolean(globalThis.document?.hidden); }

  async unlock() {
    if (!this.enabled || this.disposed) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!this.context) {
      const c = this.context = new Audio();
      this.master = c.createGain(); this.master.gain.value = this.baseGain*this.effectsVolume;
      this.announcer = c.createGain(); this.announcer.gain.value = this.baseGain*this.announcerVolume;
      // Tame overlapping truck hits while preserving the initial pop attack.
      this.compressor = c.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 10; this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004; this.compressor.release.value = 0.12;
      this.master.connect(this.compressor); this.compressor.connect(c.destination);
      this.announcer.connect(this.compressor);
      this.crowd = c.createGain(); this.crowd.gain.value = this.baseGain*this.crowdVolume; this.crowd.connect(this.compressor);
      this.characterVoice = c.createGain(); this.characterVoice.gain.value = this.baseGain*this.voiceVolume; this.characterVoice.connect(this.compressor);
      // Short, quiet Warehouse reflections. All critical contacts retain a dry path.
      if (c.createDelay) {
        this.reflection = c.createDelay(.15); this.reflection.delayTime.value = .052;
        this.roomGain = c.createGain(); this.roomGain.gain.value = this.location.includes('warehouse') ? .035 : 0;
        this.master.connect(this.reflection); this.reflection.connect(this.roomGain); this.roomGain.connect(this.compressor);
      }
      this.buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const samples = this.buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      this.roll = this.loop('lowpass', 450);
      this.texture = this.loop('bandpass', 1600);
      this.grind = this.loop('bandpass', 2100);
      this.brake = this.loop('highpass', 1400);
      this.wind = this.loop('lowpass', 700);
      this.concreteScrape = this.loop('bandpass', 1700);
      this.metalScrape = this.loop('bandpass', 2200);
      this.ambience = this.loop('lowpass', 1600);
      this.impacts = Object.fromEntries(['pop','landing','grind','bail','loss','catch','push']
        .map(kind => [kind, createSkateImpact(c, kind)]));
      // Decode in the background without blocking controls or the first frame.
      // Each clip replaces its fallback independently when it is ready.
      this.retryFoley();
      // Soft resonant steel vibration and damped, street-surface wheel noise.
      this.grind.filter.Q.value = 1.65;
      this.roll.filter.Q.value = 0.55;
      this.texture.filter.Q.value = 0.7;
    }
    if(this.getAudioStatus().failed && (this.foleyAttempts||0)<3 && Date.now()-(this.foleyLastAttempt||0)>2000)this.retryFoley();
    if (this.context.state === 'suspended' || this.context.state === 'interrupted')
      await this.context.resume().catch(() => {});
  }

  getAudioStatus() {
    const counts=this.context?foleyCacheStatus(this.context):{total:0,ready:0,failed:0,loading:0};
    return {...counts,state:this.disposed?'disposed':!this.context?'locked':counts.loading?'loading':counts.failed?'degraded':counts.ready?'ready':'loading',
      attempts:this.foleyAttempts||0,canRetry:!this.disposed&&Boolean(this.context)&&counts.failed>0};
  }

  retryFoley() {
    if(this.disposed||!this.context)return Promise.resolve(false);
    if(this.foleyPending)return this.foleyPending;
    const c=this.context;
    this.foleyAttempts=(this.foleyAttempts||0)+1;this.foleyLastAttempt=Date.now();
      this.foleyLoad = loadSkateFoley(c, (kind, buffer) => {
        if (this.disposed || this.context !== c) return;
        if (this.recordedFoley.has(kind)) return;
        if (kind === 'roll') {
          const previous = this.roll.source, source = c.createBufferSource();
          source.buffer = buffer; source.loop = true; source.connect(this.roll.filter);
          source.playbackRate.value = previous.playbackRate?.value || 1;
          source.start(); this.roll.source = source;
          try { previous.stop(); previous.disconnect(); } catch {}
        } else {
          this.impacts[kind] = buffer;
          if (kind === 'landing') this.impacts.catch = buffer;
        }
        this.recordedFoley.add(kind);
      });
      this.bankLoad = loadSkateFoleyBanks(c, (kind, buffer) => {
        if (this.disposed || this.context !== c) return;
        const bank=this.banks[kind] ||= [];
        if(bank.includes(buffer))return;
        bank.push(buffer);
        if (kind === 'voicePain') this.voiceLevels.set(buffer, recordedVoiceGain(buffer));
        if(kind.startsWith('ambience'))this.refreshAmbience();
        if (['scrapeConcrete','scrapeMetal'].includes(kind)) {
          const layer = kind === 'scrapeMetal' ? this.metalScrape : this.concreteScrape;
          if (layer.recorded) return;
          const previous = layer.source, source = c.createBufferSource();
          source.buffer = seamlessFoleyLoop(c,buffer,SKATE_SCRAPE_WINDOWS[kind]); source.loop = true; source.connect(layer.filter); source.start(); layer.source = source; layer.recorded = true;
          try { previous.stop(); previous.disconnect(); } catch {}
        }
      });
    const pending=Promise.all([this.foleyLoad,this.bankLoad]).then(()=>this.getAudioStatus());
    this.foleyPending=pending;
    pending.finally(()=>{if(this.foleyPending===pending)this.foleyPending=null;});
    return pending;
  }

  loop(type, frequency) {
    const c = this.context, source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = this.buffer; source.loop = true; filter.type = type; filter.frequency.value = frequency;
    gain.gain.value = 0; source.connect(filter); filter.connect(gain); gain.connect(this.master); source.start();
    return { source, filter, gain };
  }

  impact(strength = 0.5, metal = false, kind = 'landing', {surface=this.surfaceTag,replay=false}={}) {
    if (!this.context || !this.enabled || this.disposed || this.isBackgroundMuted() || this.context.state !== 'running') return;
    const c = this.context, now = c.currentTime;
    kind = metal ? 'grind' : kind;
    // Keep different events audible when a catch and landing share a frame.
    const impacts=replay?this.replayLastImpacts:this.lastImpacts;
    if (now - (impacts.get(kind) ?? -Infinity) < 0.075) return;
    impacts.set(kind, now);
    if(!replay)this.lastImpactTime = now;
    const power = Math.max(0.001,Math.min(1,Number(strength) || 0));
    const variant = pickNonRepeating(this.banks[kind], this.lastSamples.get(kind));
    if (variant) this.lastSamples.set(kind, variant);
    const recorded = Boolean(variant) || this.recordedFoley.has(kind === 'catch' ? 'landing' : kind);
    const pop = kind === 'pop', duration = variant?.duration || this.impacts?.[kind]?.duration || (pop ? 0.11 : metal ? 0.25 : 0.24);
    // The catch is a softer contact during flight, not another full landing.
    const sampleLength = recorded && kind === 'catch' ? Math.min(.18,duration) : duration;
    const source = c.createBufferSource();
    const filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = variant || this.impacts?.[kind] || this.buffer;
    const rate = .98 + Math.random()*.04;
    if (source.playbackRate) source.playbackRate.value = rate;
    // Buffer durations are in source time; a slower take needs its full tail.
    const length = sampleLength / rate;
    filter.type = metal ? 'bandpass' : 'lowpass';
    filter.frequency.value = recorded ? 10000 : pop ? 6500 : metal ? 2800 : kind === 'push' ? 1500 : 4200;
    if(filter.Q)filter.Q.value = metal ? 2.1 : 0.72;
    // Attack envelope avoids digital clicks; the high-frequency pop gives
    // takeoff snap, low-band impact gives board-and-wheel landing weight.
    gain.gain.setValueAtTime(0.001, now);
    const volume=power*(recorded&&kind==='catch'?.38:1)*(.95+Math.random()*.05);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001,volume),now+0.003);
    if(recorded && typeof gain.gain.setValueAtTime === 'function')
      gain.gain.setValueAtTime(Math.max(0.001,volume),now+Math.max(.004,length-.018));
    gain.gain.exponentialRampToValueAtTime(0.001, now+length);
    source.connect(filter); filter.connect(gain); gain.connect(this.master);
    this.voices.add(source);
    if(replay)this.replayVoices.add(source);
    source.start(now); source.stop(now+length+0.01);
    source.onended = () => { this.voices.delete(source); this.replayVoices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };

    if (kind === 'landing') {
      const layer = surface === 'metal' ? 'landingMetal' : surface === 'concrete' ? 'landingConcrete' : null;
      if (layer) this.playBank(layer, this.master, power*(layer === 'landingMetal' ? .08 : .045),{replay});
    }
    // A short low-frequency pitch fall gives heavier landings substance without
    // shipping samples. Guard for lightweight test/audio shims.
    if(kind === 'landing' && !this.impacts && typeof c.createOscillator === 'function'){
      const tone=c.createOscillator(), toneGain=c.createGain();
      const pitch=85+power*42;
      tone.type='triangle';
      tone.frequency.setValueAtTime(pitch,now);
      tone.frequency.exponentialRampToValueAtTime(Math.max(42,pitch*.58),now+0.11);
      toneGain.gain.setValueAtTime(0.001,now);
      toneGain.gain.exponentialRampToValueAtTime(Math.max(0.001,power*.11),now+0.01);
      toneGain.gain.exponentialRampToValueAtTime(0.001,now+0.13);
      tone.connect(toneGain);toneGain.connect(this.master);
      tone.start(now);tone.stop(now+0.14);
      tone.onended=()=>{tone.disconnect();toneGain.disconnect();};
    }
  }

  countdownCue(seconds) {
    this.cue(seconds === 5 ? 'finalFive' : 'tenSeconds');
  }

  playRecordedEvent(event) {
    if(!event)return false;
    if(event.kind==='grindEnd'){this.stopReplayGrind();return true;}
    if(!['pop','landing','bail','catch','grind'].includes(event.kind))return false;
    if(!this.enabled||this.disposed||this.isBackgroundMuted()||this.context?.state!=='running')return false;
    const surface=validatedSurfaceTag(event.surface);
    this.impact(Number(event.strength)||.4,event.kind==='grind',event.kind,{surface,replay:true});
    if(event.kind==='grind') {
      this.stopReplayGrind();
      const layer=surface==='metal'?this.metalScrape:surface==='concrete'?this.concreteScrape:null;
      if(layer?.recorded&&layer.source?.buffer) {
        const source=this.context.createBufferSource(),gain=this.context.createGain();
        source.buffer=layer.source.buffer;source.loop=true;source.connect(gain);gain.connect(this.master);
        gain.gain.value=surface==='metal'?.18:.12;
        this.replayGrind={source,gain,remaining:Math.min(8,Math.max(.1,Number(event.duration)||8))};
        this.replayVoices.add(source);this.voices.add(source);
        source.onended=()=>{this.replayVoices.delete(source);this.voices.delete(source);source.disconnect();gain.disconnect();};
        source.start();source.stop(this.context.currentTime+20);
      }
    }
    return true;
  }

  stopReplayGrind() {
    if(!this.replayGrind)return;
    const {source,gain}=this.replayGrind;this.replayGrind=null;
    try{source.stop();}catch{}
    source.disconnect();gain.disconnect();this.replayVoices.delete(source);this.voices.delete(source);
  }

  updateReplay(sourceDelta) {
    if(this.isBackgroundMuted()||!this.enabled){this.resetReplay();return;}
    if(this.replayGrind&&Number.isFinite(sourceDelta)&&sourceDelta>=0) {
      this.replayGrind.remaining-=sourceDelta;
      if(this.replayGrind.remaining<=0)this.stopReplayGrind();
    }
  }

  resetReplay() {
    this.stopReplayGrind();
    for(const source of this.replayVoices){try{source.stop();}catch{}this.voices.delete(source);}
    this.replayVoices.clear();this.replayLastImpacts.clear();
  }

  cue(kind) {
    if (!this.enabled || this.disposed || this.isBackgroundMuted() || !this.context || this.context.state !== 'running') return;
    const menu = kind === 'confirm' || kind === 'back';
    const cueBus = menu ? this.master : (this.announcer || this.master);
    const now = this.context.currentTime;
    if (now - (this.lastImpacts.get(`cue:${kind}`) ?? -Infinity) < .07) return;
    this.lastImpacts.set(`cue:${kind}`, now);
    if (this.playBank(`cue:${kind}`, cueBus, menu ? .35 : .4, { maxDuration: kind === 'roundOver' ? .7 : .4 })) return;
    const cues = {
      confirm: [580, 760, .085, .08], back: [520, 390, .085, .065],
      ready: [330, 390, .16, .10], go: [660, 990, .19, .15],
      roundOver: [520, 260, .32, .13], tenSeconds: [660, 760, .2, .18],
      finalFive: [880, 1040, .2, .18],
    };
    const spec = cues[kind];
    if (!spec) return;
    const context = this.context;
    const [from, to, duration, level] = spec;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = kind === 'finalFive' ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration * .7);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + .012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(kind === 'confirm' || kind === 'back' ? this.master : (this.announcer || this.master));
    this.voices.add(oscillator);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  }

  update(player, active) {
    if (!player) return;
    let vocalReaction = false;
    const rawSpeed = Number(player.velocity?.length?.() || 0);
    const speed = Number.isFinite(rawSpeed) ? Math.max(0,rawSpeed) : 0;
    const p = player.presentation || {};
    const impact = player.rider?.ragdoll?.groundImpact || null;
    const surface = surfaceAudioFor(player);
    this.surfaceTag = surfaceTagFor(player);
    const state = { grounded: Boolean(player.grounded), grind: Boolean(player.grind), bail: player.bailTime > 0,
      speed, pop: p.popTime > 0, flipPhase: p.flipPhase, pushPhase: p.pushPhase || 0,
      pushWeight: p.pushWeight || 0, respawn: player.respawnSerial,
      impactSpeed: Math.max(0, -(player.velocity?.dot?.(player.normal) || 0)) };
    if (this.context) {
      const now = this.context.currentTime, audible = this.enabled && active && !this.isBackgroundMuted() && this.context.state === 'running';
      const level = Math.min(1, speed / 18);
      const rolling = audible && state.grounded && !state.grind && !state.bail;
      const grinding = audible && state.grind && !state.bail;
      const rollLevel = Math.pow(level, 0.65);
      this.roll.gain.gain.setTargetAtTime(rolling ? rollLevel * 0.48 * surface.roll : 0, now, 0.035);
      this.roll.filter.frequency.setTargetAtTime(Math.min(3000,(550 + speed * 70) * surface.rollPitch), now, 0.06);
      this.roll.source?.playbackRate?.setTargetAtTime(0.7 + level * 1.8, now, 0.06);
      this.texture?.gain.gain.setTargetAtTime(rolling ? rollLevel * 0.15 * surface.texture : 0, now, 0.035);
      this.texture?.filter.frequency.setTargetAtTime(1600 * surface.rollPitch, now, .06);
      const metalGrind = grinding && this.surfaceTag === 'metal' && this.metalScrape?.recorded;
      this.metalScrape?.gain.gain.setTargetAtTime(metalGrind ? .14+level*.12 : 0,now,.025);
      this.metalScrape?.source.playbackRate?.setTargetAtTime(.8+level*.65,now,.06);
      this.ambience?.gain.gain.setTargetAtTime(audible&&this.ambience.recorded ? (this.location.includes('orbit')?.025:.055) : 0,now,.35);
      const concreteGrind = grinding && this.surfaceTag === 'concrete' && this.concreteScrape?.recorded;
      this.concreteScrape?.gain.gain.setTargetAtTime(concreteGrind ? .09 + level*.08 : 0, now, .035);
      this.concreteScrape?.source.playbackRate?.setTargetAtTime(.8 + level*.5, now, .06);
      this.grind.gain.gain.setTargetAtTime(grinding ? (0.18 + level * 0.2)*(metalGrind ? .18 : concreteGrind ? .22 : this.surfaceTag === 'wood' ? .35 : 1) : 0, now, 0.025);
      this.grind.filter.frequency.setTargetAtTime(Math.min(4400,(1650 + speed * 83) * surface.scrapePitch), now, 0.07);
      this.grind.filter.Q?.setTargetAtTime?.(surface.resonance, now, .07);
      this.wind.gain.gain.setTargetAtTime(audible && !state.grounded && !state.grind && !state.bail ? level * 0.05 : 0, now, 0.1);
      this.brake?.gain.gain.setTargetAtTime(rolling && p.state === 'BRAKE' ? level * 0.2 : 0, now, 0.04);
      if (audible && this.previous && state.respawn === this.previous.respawn) {
        const newContact = state.bail && impact && impact !== this.lastBailImpact;
        if (state.bail && !this.previous.bail) {
          this.impact(0.32, false, 'loss'); this.playBank('cloth', this.master, .12);
          // A same-frame body contact gets its immediate pain reaction alone.
          if (!newContact && this.reactions.effort(speed, now)) this.playBank('voiceEffort', this.characterVoice, .17, { maxDuration: .45 });
        }
        if (newContact) {
          const contactSpeed = Number(impact.speed) || 0;
          this.impact(.45 + Math.min(.5, contactSpeed / 14), false, 'bail');
          if (this.reactions.contact(contactSpeed, now)) vocalReaction = this.playBank('voicePain', this.characterVoice, .22 + Math.min(.2,contactSpeed/50), {
            maxDuration: .85, musicDuck: contactSpeed >= 7 ? { amount: .7, releaseMs: 80 } : null,
          }) && contactSpeed >= 7;
        }
        if (!state.bail) {
          if (state.pop && !this.previous.pop && !state.grounded && !state.grind) this.impact(0.9, false, 'pop');
          if (state.grounded && !this.previous.grounded && !state.grind) {
            const severity = Math.max(p.landingSeverity || 0, Math.min(1, this.previous.impactSpeed / 10));
            this.impact(0.5 + Math.min(0.45, severity * 0.45));
          }
          if (state.grind && !this.previous.grind) this.impact(0.65, true);
          if (state.flipPhase === 'CATCH' && this.previous.flipPhase !== 'CATCH') this.impact(0.32, false, 'catch');
          if (rolling && state.pushWeight > 0.4 && state.pushPhase >= 0.26
            && (this.previous.pushPhase < 0.26 || state.pushPhase < this.previous.pushPhase)) this.impact(0.22, false, 'push');
        }
      }
    }
    // Consume contacts while paused/muted too. Unmuting must never replay an
    // old impact, and returning from a highlight must not invent a second hit.
    this.lastBailImpact = impact;
    this.previous = active ? state : null;
    return vocalReaction;
  }

  setLocation(location) {
    this.location = String(location || '').toLowerCase();
    this.roomGain?.gain.setTargetAtTime(this.location.includes('warehouse') ? .035 : 0, this.context.currentTime, .15);
    this.refreshAmbience();
  }

  refreshAmbience() {
    if(!this.context||!this.ambience)return;
    const kind=this.location.includes('paradise')?'ambienceParadise':this.location.includes('warehouse')||this.location.includes('orbit')?'ambienceWarehouse':null;
    const buffer=this.banks[kind]?.[0],layer=this.ambience;
    const now = this.context.currentTime;
    if(!buffer){layer.gain.gain.setTargetAtTime(0,now,.12);layer.recorded=false;return;}
    if(layer.recording!==buffer) {
      const source=this.context.createBufferSource(),previous=layer.source,previousGain=layer.sourceGain,gain=this.context.createGain();
      source.buffer=seamlessFoleyLoop(this.context,buffer);source.loop=true;source.connect(gain);gain.connect(layer.filter);
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+.35);source.start(now);
      source.onended=()=>{source.disconnect();gain.disconnect();this.ambienceTails.delete(source);};
      layer.source=source;layer.sourceGain=gain;layer.recorded=true;layer.recording=buffer;
      if(previousGain) {
        this.ambienceTails.set(previous,previousGain);
        if(previousGain.gain.cancelAndHoldAtTime)previousGain.gain.cancelAndHoldAtTime(now);
        else {previousGain.gain.cancelScheduledValues?.(now);previousGain.gain.setValueAtTime(previousGain.gain.value??1,now);}
        previousGain.gain.linearRampToValueAtTime(0,now+.35);
        try{previous.stop(now+.36);}catch{}
      } else {try{previous.stop();previous.disconnect();}catch{}}
    }
    layer.recorded=true;
    layer.source.playbackRate?.setTargetAtTime(this.location.includes('orbit')?.72:1,this.context.currentTime,.2);
    layer.filter.frequency.setTargetAtTime(this.location.includes('orbit')?600:this.location.includes('paradise')?2200:1500,this.context.currentTime,.25);
  }

  // Shared bounded playback. Recordings fail independently; reactions never fall back to a fake voice.
  playBank(kind, bus, level = .3, { maxDuration = 3, pan = 0, attack = .008, release = .08, musicDuck = null, replay = false } = {}) {
    if (!this.enabled || this.disposed || this.isBackgroundMuted() || this.context?.state !== 'running' || !bus || this.voices.size >= 16) return false;
    const channel = kind.startsWith('crowd') ? this.crowdVolume : kind.startsWith('voice') ? this.voiceVolume : 1;
    if (!(channel > 0)) return false;
    const sampleKey = kind.startsWith('crowd') ? 'crowd' : kind;
    const sample = pickNonRepeating(this.banks[kind], this.lastSamples.get(sampleKey));
    if (!sample) return false;
    const c = this.context, now = c.currentTime;
    // Contact pain takes priority over a still-playing loss grunt, with no delay.
    if (kind === 'voiceEffort' && [...this.characterReactions.values()].some(voice => voice.kind === 'voicePain' && voice.end > now)) return false;
    if (kind === 'voicePain') for (const [source, voice] of this.characterReactions) {
      if (voice.kind !== 'voiceEffort' || voice.end <= now) continue;
      if (voice.gain.cancelAndHoldAtTime) voice.gain.cancelAndHoldAtTime(now);
      else { voice.gain.cancelScheduledValues?.(now); voice.gain.setValueAtTime(voice.level, now); }
      voice.gain.linearRampToValueAtTime(.0001, now+.025); source.stop(now+.03);
      voice.end = now+.03;
    }
    this.lastSamples.set(sampleKey, sample);
    const source = c.createBufferSource(), gain = c.createGain();
    source.buffer = sample;
    const rate = kind.startsWith('voice') || kind.startsWith('crowd') ? 1 : .985 + Math.random()*.03;
    const duration = Math.min(maxDuration, sample.duration) / rate;
    if (source.playbackRate) source.playbackRate.value = rate;
    if (kind === 'voicePain') {
      if (!this.voiceLevels.has(sample)) this.voiceLevels.set(sample, recordedVoiceGain(sample));
      level *= this.voiceLevels.get(sample);
    }
    const volume = Math.max(.001,level), onset = Math.min(attack,duration*.2), tail = Math.min(release,duration*.6);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now+onset);
    gain.gain.setValueAtTime(volume, now+Math.max(onset,duration-tail));
    gain.gain.exponentialRampToValueAtTime(.0001, now+duration);
    source.connect(gain);
    const panner = pan && c.createStereoPanner ? c.createStereoPanner() : null;
    if (panner) { panner.pan.value = pan; gain.connect(panner); panner.connect(bus); } else gain.connect(bus);
    this.voices.add(source);
    if(replay)this.replayVoices.add(source);
    if (kind.startsWith('voice')) this.characterReactions.set(source, { kind, gain: gain.gain, level: volume, end: now+duration });
    source.start(now); source.stop(now+duration+.01);
    source.onended = () => { this.voices.delete(source); this.characterReactions.delete(source); this.replayVoices.delete(source); this.reactionDucks.delete(source); source.disconnect(); gain.disconnect(); panner?.disconnect(); };
    // Follow the take that actually started. Fixed event timers over-duck short
    // pain takes and restore music before long applause reaches its decay.
    if (musicDuck) {
      const cancel = this.onMusicDuck?.({ durationMs: Math.ceil(Math.max(.08, duration - tail) * 1000), ...musicDuck });
      if (typeof cancel === 'function') this.reactionDucks.set(source, { kind, cancel });
    }
    return true;
  }

  onComboSettled(event) {
    const now = this.context?.currentTime ?? 0;
    // Consume IDs even while muted/paused so later unmute cannot replay applause.
    const reaction = this.reactions.combo({ ...event, location: event?.location ?? this.location }, now);
    if (!reaction) return false;
    const played = this.playBank(reaction.kind, this.crowd, reaction.level, {
      maxDuration: reaction.exceptional ? 4.1 : reaction.kind === 'crowdSubdued' ? 1 : 1.8,
      attack: .035, release: reaction.exceptional ? .7 : reaction.kind === 'crowdSubdued' ? .28 : .45,
      pan: this.location.includes('paradise') ? -.32 : .25,
      musicDuck: reaction.exceptional ? { amount: .65, releaseMs: 200 } : null,
    });
    return played && reaction.exceptional;
  }

  setCrowdVolume(value) {
    this.crowdVolume = saveAudioVolume('crowd', value);
    this.crowd?.gain.setTargetAtTime(this.baseGain*this.crowdVolume, this.context.currentTime, .045);
    if (!this.crowdVolume) this.cancelMusicDucks('crowd');
  }
  setVoiceVolume(value) {
    this.voiceVolume = saveAudioVolume('voice', value);
    this.characterVoice?.gain.setTargetAtTime(this.baseGain*this.voiceVolume, this.context.currentTime, .045);
    if (!this.voiceVolume) this.cancelMusicDucks('voice');
  }

  cancelMusicDucks(prefix = '') {
    for (const [source, duck] of this.reactionDucks) if (duck.kind.startsWith(prefix)) {
      duck.cancel(); this.reactionDucks.delete(source);
    }
  }

  silence() {
    this.resetReplay();
    this.previous = null;
    if (!this.context) return;
    for (const layer of [this.roll, this.texture, this.grind, this.brake, this.wind, this.concreteScrape, this.metalScrape, this.ambience])
      layer?.gain.gain.setTargetAtTime(0, this.context.currentTime, 0.02);
    for (const voice of this.voices) { try { voice.stop(); } catch {} }
    this.cancelMusicDucks();
    this.characterReactions.clear();
  }

  setMasterVolume(value) {
    this.setEffectsVolume(value);
  }

  setEffectsVolume(value) {
    this.effectsVolume = saveAudioVolume('effects', value);
    this.masterVolume = this.effectsVolume;
    if (this.context && this.master) this.master.gain.setTargetAtTime(
      this.baseGain*this.effectsVolume,this.context.currentTime,0.045);
  }

  setAnnouncerVolume(value) {
    this.announcerVolume = saveAudioVolume('announcer', value);
    if (this.context && this.announcer) this.announcer.gain.setTargetAtTime(
      this.baseGain*this.announcerVolume, this.context.currentTime, .045);
  }

  setBackgroundAudio(value) {
    this.backgroundAudio = saveBackgroundAudio(value);
    if (this.isBackgroundMuted()) this.silence();
  }

  toggle() {
    if (this.disposed) return this.enabled;
    this.enabled = !this.enabled;
    try { localStorage.setItem('streetskate.sound', this.enabled ? 'on' : 'off'); } catch {}
    if (!this.enabled) this.silence(); else this.unlock();
    return this.enabled;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if(this.context)disposeFoleyCache(this.context);
    this.enabled = false;
    this.silence();
    for (const layer of [this.roll, this.texture, this.grind, this.brake, this.wind, this.concreteScrape, this.metalScrape, this.ambience]) {
      if (!layer) continue;
      try { layer.source.stop(); } catch {}
      layer.source.disconnect();
      layer.filter.disconnect();
      layer.gain.disconnect();
      layer.sourceGain?.disconnect();
    }
    for (const [source,gain] of this.ambienceTails) { try { source.stop(); } catch {} source.disconnect();gain.disconnect(); }
    this.ambienceTails.clear();
    this.master?.disconnect();
    this.announcer?.disconnect();
    this.crowd?.disconnect(); this.characterVoice?.disconnect(); this.reflection?.disconnect(); this.roomGain?.disconnect();
    this.compressor?.disconnect();
    globalThis.document?.removeEventListener?.('visibilitychange', this._visibility);
    const context = this.context;
    this.context = null;
    this.previous = null;
    if (context?.state !== 'closed') await context?.close?.().catch(() => {});
  }
}
