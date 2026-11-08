import test from 'node:test';
import assert from 'node:assert/strict';
import { SkateAudio } from '../src/game/SkateAudio.js';
import { ReactiveMusic, REACTIVE_MUSIC, limiterMakeupTrim } from '../src/game/ReactiveMusic.js';

const param = () => { const p = { value: 1, events: [] };
  for (const k of ['cancelAndHoldAtTime', 'cancelScheduledValues', 'setValueAtTime', 'linearRampToValueAtTime', 'setTargetAtTime'])
    p[k] = (...a) => { p.events.push([k, ...a]); return p; };
  return p; };
const gainNode = () => ({ gain: param(), connect() {}, disconnect() { this.disconnected = true; } });
const voice = () => ({ stops: [], stop(t) { this.stops.push(t); } });

function audio() {
  const a = Object.create(SkateAudio.prototype);
  Object.assign(a, { voices: new Set(), voiceGains: new Map(), menuVoices: new Set(), replayVoices: new Set(), replayLastImpacts: new Map(),
    characterReactions: new Map(), reactionDucks: new Map(), previous: {}, replayGrind: null,
    context: { currentTime: 10, createGain: gainNode }, master: gainNode() });
  a.extras = gainNode(); a.cancelMusicDucks = () => {};
  return a;
}

test('silence fades every game voice over 20 ms instead of cutting it', () => {
  const a = audio(), v = voice(), g = gainNode();
  a.voices.add(v); a.voiceGains.set(v, g);
  a.silence();
  assert.deepEqual(g.gain.events.map(e => e[0]), ['cancelAndHoldAtTime', 'linearRampToValueAtTime']);
  assert.equal(g.gain.events[1][1], 0); assert.ok(Math.abs(g.gain.events[1][2] - 10.02) < 1e-9);
  assert.ok(Math.abs(v.stops[0] - 10.03) < 1e-9, 'stops after the fade');
});

test('menu confirm/back cues survive the silence that follows them', () => {
  const a = audio(), cueVoice = voice(); a.voices.add(cueVoice); a.menuVoices.add(cueVoice);
  a.silence();
  assert.equal(cueVoice.stops.length, 0);
});

test('scheduled-ahead extras (stingers, world sounds) are faded and replaced', () => {
  const a = audio(), old = a.extras;
  a.silence();
  assert.notEqual(a.extras, old, 'future sounds use a fresh bus');
  assert.equal(old.gain.events.at(-1)[0], 'linearRampToValueAtTime');
  assert.equal(old.gain.events.at(-1)[1], 0);
});

test('music limiter trim cancels the automatic makeup exactly for a hard knee', () => {
  const t = limiterMakeupTrim(-1, 20), fullScaleDb = -1 + 1 / 20;
  assert.ok(Math.abs(20 * Math.log10(t) - 0.6 * fullScaleDb) < 1e-12);
  assert.ok(t < 1 && t > .9);
  assert.ok(REACTIVE_MUSIC.limiterThreshold < 0);
});

test('reactive music clears the bail muffle and settles when play stops', () => {
  const r = new ReactiveMusic(); r.connect = () => true; r.apply = () => {};
  const skater = { bailTime: 1, tricks: { combo: [1], comboBase: 4000, comboMultiplier: 2 } };
  r.update(1 / 60, { skater, active: true });
  assert.ok(r.bail > 0 && r.level > 0);
  r.update(1 / 60, { skater, active: false });
  assert.equal(r.bail, 0, 'pause/results never keep the muffle');
  for (let i = 0; i < 600; i++) r.update(1 / 60, { skater, active: false });
  assert.ok(r.level < .01, 'combo lift returns to rest');
});
