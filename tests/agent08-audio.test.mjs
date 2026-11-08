import test from 'node:test';
import assert from 'node:assert/strict';
import { MusicPlayer, TRACKS } from '../src/game/MusicPlayer.js';
import { SkateAudio } from '../src/game/SkateAudio.js';
import { createSkateImpact } from '../src/game/SkateSoundSynthesis.js';

function fakeMusicEnvironment() {
  const oldAudio = globalThis.Audio;
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const oldStorage = globalThis.localStorage;
  const events = new Map();
  class FakeAudio {
    constructor() {
      this.src = ''; this.volume = 1; this.paused = true; this.ended = false;
      this.listeners = new Map();
    }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    removeEventListener(name) { this.listeners.delete(name); }
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() {}
    trigger(name) { this.listeners.get(name)?.(); }
  }
  globalThis.Audio = FakeAudio;
  globalThis.window = { addEventListener(name, fn) { events.set('win:' + name, fn); },
    removeEventListener(name) { events.delete('win:' + name); } };
  globalThis.document = { hidden: false,
    addEventListener(name, fn) { events.set('doc:' + name, fn); },
    removeEventListener(name) { events.delete('doc:' + name); } };
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value) };
  return { storage, FakeAudio, restore() {
    globalThis.Audio = oldAudio; globalThis.window = oldWindow;
    globalThis.document = oldDocument; globalThis.localStorage = oldStorage;
  } };
}

test('music shuffle never repeats adjacent tracks and honors volume persistence', async () => {
  const env = fakeMusicEnvironment();
  try {
    const m = new MusicPlayer();
    const sequence = [m.current];
    for (let i = 0; i < TRACKS.length * 3; i++) {
      m.next();
      sequence.push(m.current);
    }
    for (let i = 1; i < sequence.length; i++)
      assert.notEqual(sequence[i], sequence[i - 1], 'adjacent song repeat');
    m.setMusicVolume(0.3);
    assert.equal(env.storage.get('streetskate.musicVolume'), '0.3');
    assert.equal(m.audio.volume, 0.3);
    m.dispose();
    assert.equal(m.disposed, true);
    assert.equal(m.audio.listeners.size, 0);
    await Promise.resolve();
  } finally { env.restore(); }
});

test('music and effects have independent louder defaults, mute and persisted levels', () => {
  const env = fakeMusicEnvironment();
  try {
    env.storage.set('streetskate.masterVolume', '0.5');
    const music = new MusicPlayer(), fx = new SkateAudio();
    assert.equal(music.audio.volume, 0.2);
    assert.equal(fx.effectsVolume, 0.45);
    music.setMusicVolume(0);
    assert.equal(fx.effectsVolume, 0.45, 'music mute must preserve effects');
    fx.setEffectsVolume(0.4);
    assert.equal(music.audio.volume, 0, 'effects change must preserve music mute');
    const restoredMusic = new MusicPlayer(), restoredFx = new SkateAudio();
    assert.equal(restoredMusic.musicVolume, 0);
    assert.equal(restoredFx.effectsVolume, 0.4);
    music.dispose(); restoredMusic.dispose();
  } finally { env.restore(); }
});

test('skate events follow intentional pop, truck contact and rail/bail state, without phantom hits', () => {
  const fx = new SkateAudio(), hits = [];
  fx.impact = (strength, metal, kind = 'landing') => hits.push(metal ? 'grind' : kind);
  const layer = () => ({ gain: { gain: { setTargetAtTime() {} } },
    filter: { frequency: { setTargetAtTime() {} } } });
  fx.roll = layer(); fx.grind = layer(); fx.wind = layer();
  fx.context = { state: 'running', currentTime: 0 };
  const player = { grounded: true, velocity: { length: () => 6, dot: () => -3 },
    normal: {}, presentation: {}, respawnSerial: 1 };
  const step = (changes = {}, active = true) => {
    Object.assign(player, changes); fx.context.currentTime += 0.1; fx.update(player, active);
  };
  step();
  step({ grounded: false });
  assert.deepEqual(hits, [], 'rolling over a ledge does not make an ollie pop');
  step({ grounded: true });
  step({ grounded: false, presentation: { popTime: 0.12 } });
  step();
  step({ presentation: { popTime: 0, flipPhase: 'CATCH' } });
  step({ grounded: true });
  step({ grind: {}, grounded: false });
  step({ bailTime: 1, grounded: true });
  assert.deepEqual(hits, ['landing','pop','catch','landing','grind','loss'], 'loss of control is not the body impact');
  step({ rider: { ragdoll: { groundImpact: { speed: 5 } } } });
  step();
  assert.deepEqual(hits, ['landing','pop','catch','landing','grind','loss','bail'], 'one heavy hit at actual contact');
  hits.length = 0;
  step({ respawnSerial: 2, bailTime: 0, grind: null });
  step({ grounded: false, presentation: { popTime: 0.12 } }, false);
  step({ grounded: true });
  assert.deepEqual(hits, [], 'respawn and resume do not replay old contacts');
  fx.enabled = false;
  step({ grounded: false, presentation: { popTime: 0.12 } });
  assert.deepEqual(hits, [], 'sound toggle gates one-shots');
});

test('generated board impacts are finite, audible and distinguish pop from two-truck landing', () => {
  const context = { sampleRate: 24000, createBuffer(channels, length, sampleRate) {
    const samples = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => samples };
  } };
  const pop = createSkateImpact(context, 'pop'), landing = createSkateImpact(context, 'landing');
  assert.ok(landing.duration > pop.duration * 1.5, 'landing must have a heavier decay');
  for (const kind of ['pop','landing','grind','bail','catch','push']) {
    const samples = createSkateImpact(context, kind).getChannelData(0);
    assert.ok(samples.every(Number.isFinite));
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    assert.ok(rms > 0.04 && rms < 0.5, `${kind}: signal strength ${rms}`);
    assert.ok(samples.every(value => Math.abs(value) < 1), `${kind}: unclipped waveform`);
  }
});

test('rapid skip ignores a rejected stale play promise and successfully plays the new track', async () => {
  const env = fakeMusicEnvironment();
  try {
    const pending = [];
    env.FakeAudio.prototype.play = function() {
      this.paused = false;
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    };
    const notes = [];
    const m = new MusicPlayer((title, note) => notes.push({ title, note }));
    assert.equal(pending.length, 1);
    m.next();
    assert.equal(pending.length, 2);
    const expected = m.title;
    pending[0].reject(Object.assign(new Error('interrupted'), { name: 'AbortError' }));
    await Promise.resolve();
    assert.equal(m.title, expected);
    pending[1].resolve();
    await Promise.resolve();
    assert.equal(m.unlocked, true);
    assert.equal(notes.at(-1).note, '');
    m.dispose();
  } finally { env.restore(); }
});

test('missing music track skips to the next available track without endless retry', async () => {
  const env = fakeMusicEnvironment();
  try {
    const m = new MusicPlayer();
    const failed = m.current;
    m.audio.trigger('error');
    assert.equal(m.failed.has(failed), true);
    assert.notEqual(m.current, failed);
    m.dispose();
  } finally { env.restore(); }
});

test('skate SFX honors stored toggle and survives repeated pause/silence calls', async () => {
  const env = fakeMusicEnvironment();
  try {
    const fx = new SkateAudio();
    assert.equal(fx.enabled, true);
    assert.equal(fx.toggle(), false);
    assert.equal(env.storage.get('streetskate.sound'), 'off');
    assert.equal(fx.toggle(), true);
    fx.silence(); fx.silence();
    fx.setMasterVolume(0.2);
    assert.equal(fx.masterVolume, 0.2);
    await fx.dispose();
    assert.equal(fx.disposed, true);
    assert.equal(fx.toggle(), false);
  } finally { env.restore(); }
});

test('SFX impact cooldown prevents multiple effects in one physics tick', () => {
  const fx = new SkateAudio();
  let impacts = 0;
  const node = () => ({ connect() {}, disconnect() {}, type: '',
    frequency: { value: 0 }, gain: {
      setValueAtTime() {}, exponentialRampToValueAtTime() {},
    } });
  fx.context = {
    state: 'running', currentTime: 1,
    createBufferSource() {
      impacts++;
      return { ...node(), start() {}, stop() {}, onended: null };
    },
    createBiquadFilter: node, createGain: node,
  };
  fx.master = node(); fx.buffer = {};
  fx.impact(0.4); fx.impact(0.4);
  assert.equal(impacts, 1);
  fx.context.currentTime = 1.1;
  fx.impact(0.4);
  assert.equal(impacts, 2);
});

test('trusted input retries an autoplay attempt that is still pending', async () => {
  const env = fakeMusicEnvironment();
  try {
    const pending = [];
    env.FakeAudio.prototype.play = function() {
      return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    };
    const m = new MusicPlayer();
    assert.equal(pending.length, 1, 'initial music starts automatically when browser permits');
    m.unlock();
    assert.equal(pending.length, 2, 'first user gesture must not be lost to pending autoplay');
    pending[0].reject(Object.assign(new Error('autoplay blocked'), { name: 'NotAllowedError' }));
    await Promise.resolve();
    pending[1].resolve();
    await Promise.resolve();
    assert.equal(m.unlocked, true);
    m.dispose();
  } finally { env.restore(); }
});

test('music duck ramps, prioritizes overlaps and restores the latest volume without unmuting', async () => {
  const env = fakeMusicEnvironment(), originalNow = Date.now, originalSet = globalThis.setInterval, originalClear = globalThis.clearInterval;
  let now = 0, step;
  Date.now = () => now; globalThis.setInterval = fn => { step = fn; return 1; }; globalThis.clearInterval = () => {};
  const advance = milliseconds => { for (let i=0;i<milliseconds;i+=16) { now += 16; step?.(); } };
  try {
    const music = new MusicPlayer();
    music.setMusicVolume(.6); music.duck(500,.5);
    assert.equal(music.audio.volume,.6,'attack starts at current volume');
    advance(80); assert.ok(music.audio.volume > .3 && music.audio.volume < .34,'smooth attack approaches target');
    music.setMusicVolume(.2); assert.ok(music.audio.volume < .12,'edits preserve current attenuation');
    music.duck(160,.25); advance(80); assert.ok(music.audio.volume < .06,'stronger reaction takes priority');
    music.duck(500,.8); advance(32); assert.ok(music.audio.volume < .06,'weaker cue cannot overwrite active strong reaction');
    advance(180); assert.ok(music.audio.volume < .13,'return retains longer held cue');
    advance(1200); assert.equal(music.audio.volume,.2,'release restores latest saved volume');
    music.duck(80,.5); music.setMusicVolume(0); advance(1200);
    assert.equal(music.audio.volume,0,'mute survives recovery');
    music.dispose(); assert.equal(music.duckTimer,null);
  } finally { Date.now = originalNow; globalThis.setInterval = originalSet; globalThis.clearInterval = originalClear; env.restore(); }
});

test('source-length crowd and contact ducks retain independent release envelopes', () => {
  const env = fakeMusicEnvironment(), originalNow = Date.now, originalSet = globalThis.setInterval, originalClear = globalThis.clearInterval;
  let now = 0, step;
  Date.now = () => now; globalThis.setInterval = fn => { step = fn; return 1; }; globalThis.clearInterval = () => { step = null; };
  const advance = milliseconds => { const end = now + milliseconds; while (now < end) { now += 16; step?.(); } };
  try {
    const music = new MusicPlayer();
    music.duck(3310, .65, 200); advance(1000);
    assert.ok(Math.abs(music.duckAmount - .65) < .002, 'long applause keeps music held after the old 900ms timer');
    music.duck(96, .7, 80); advance(600);
    assert.ok(Math.abs(music.duckAmount - .65) < .002, 'brief contact cannot release the longer applause hold');
    advance(1800); assert.ok(music.duckAmount > .65 && music.duckAmount < .85, 'music rises with the applause decay');
    advance(1400); assert.equal(music.duckAmount, 1); assert.equal(music.duckTimer, null);
    music.duck(96, .7, 80); advance(600);
    assert.equal(music.duckAmount, 1, 'short authored pain does not leave a 650ms hold behind');
    const cancelCrowd = music.duck(3310, .65, 200); advance(80);
    music.duck(500, .5); cancelCrowd(); advance(300);
    assert.ok(music.duckAmount < .51, 'cancelling applause preserves an independent session cue');
    advance(1000); assert.equal(music.duckAmount, 1);
    music.dispose();
  } finally { Date.now = originalNow; globalThis.setInterval = originalSet; globalThis.clearInterval = originalClear; env.restore(); }
});

test('background music preference pauses hidden playback, resumes deliberately and persists', async () => {
  const env = fakeMusicEnvironment();
  try {
    const music = new MusicPlayer();await Promise.resolve();
    document.hidden=true;music._visibility();
    assert.equal(music.audio.paused,true);
    music.next();music.unlock();
    assert.equal(music.audio.paused,true,'skip and unlock cannot bypass hidden default');
    music.setBackgroundAudio(true);await Promise.resolve();
    assert.equal(music.audio.paused,false);
    assert.equal(env.storage.get('streetskate.backgroundAudio'),'on');
    const restored = new MusicPlayer();
    assert.equal(restored.backgroundAudio,true);
    music.setBackgroundAudio(false);
    assert.equal(music.audio.paused,true);
    document.hidden=false;music._visibility();await Promise.resolve();
    assert.equal(music.audio.paused,false);
    music.dispose();restored.dispose();
  } finally {env.restore();}
});

test('hidden sound cues are suppressed and announcer mute is independent from skating effects', () => {
  const env=fakeMusicEnvironment();
  try {
    const audio=new SkateAudio();let voices=0;
    const param={setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}};
    audio.master={gain:param};audio.announcer={gain:param};
    audio.context={state:'running',currentTime:1,
      createOscillator(){voices++;return{frequency:param,connect(){},start(){},stop(){}};},
      createGain:()=>({gain:param,connect(){}})};
    audio.setAnnouncerVolume(0);assert.equal(audio.effectsVolume,.45);
    audio.setEffectsVolume(.7);assert.equal(audio.announcerVolume,0);
    document.hidden=true;audio.cue('go');assert.equal(voices,0);
    audio.setBackgroundAudio(true);audio.cue('go');assert.equal(voices,1);
    audio.setBackgroundAudio(false);audio.cue('ready');assert.equal(voices,1);
  } finally {env.restore();}
});
