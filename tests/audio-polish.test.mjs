import test from 'node:test';
import assert from 'node:assert/strict';
import { SkateAudio } from '../src/game/SkateAudio.js';
import { recordedVoiceGain, seamlessFoleyLoop, SKATE_SCRAPE_WINDOWS } from '../src/game/SkateFoley.js';

function audioFixture() {
  const sources = [], gains = [];
  const parameter = () => ({ value: 1, events: [],
    setValueAtTime(value, time) { this.events.push(['set', value, time]); },
    exponentialRampToValueAtTime(value, time) { this.events.push(['exp', value, time]); },
    linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); },
    cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }, setTargetAtTime() {},
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const audio = new SkateAudio();
  audio.context = { currentTime: 1, state: 'running',
    createGain() { const gain = { ...node(), gain: parameter() }; gains.push(gain); return gain; },
    createBiquadFilter: () => ({ ...node(), frequency: parameter(), Q: parameter() }),
    createBufferSource() { const source = { ...node(), playbackRate: parameter(), starts: [], stops: [],
      start(time) { this.starts.push(time); }, stop(time) { this.stops.push(time); } }; sources.push(source); return source; },
  };
  audio.master = node(); audio.characterVoice = node(); audio.crowd = node(); audio.announcer = node();
  const layer = () => ({ source: { ...node(), stop() {} }, gain: { ...node(), gain: parameter() }, filter: { ...node(), frequency: parameter() } });
  audio.roll = layer(); audio.grind = layer(); audio.wind = layer(); audio.ambience = layer();
  const player = { grounded: false, bailTime: 0, respawnSerial: 1,
    velocity: { length: () => 10, dot: () => -8 }, normal: {}, presentation: {}, rider: { ragdoll: { groundImpact: null } } };
  return { audio, sources, gains, player };
}

test('recorded cues deduplicate within a physics tick, with separate cue identities', () => {
  const { audio, sources } = audioFixture();
  audio.banks['cue:go'] = [{ duration: .5 }]; audio.banks['cue:ready'] = [{ duration: .1 }];
  audio.cue('go'); audio.cue('go'); audio.cue('ready');
  assert.equal(sources.length, 2);
  audio.context.currentTime += .08; audio.cue('go'); assert.equal(sources.length, 3);
});

test('slower recorded impacts retain their complete source-time tail', () => {
  const { audio, sources, gains } = audioFixture(), random = Math.random;
  audio.banks.landing = [{ duration: .5 }];
  Math.random = () => 0;
  try { audio.impact(.8); } finally { Math.random = random; }
  assert.equal(sources[0].playbackRate.value, .98);
  const end = 1 + .5 / .98;
  assert.ok(Math.abs(sources[0].stops[0] - end - .01) < 1e-10);
  assert.ok(Math.abs(gains[0].gain.events.at(-1)[2] - end) < 1e-10);
});

test('same-frame body contact plays pain immediately without starting an effort voice', () => {
  const { audio, sources, player } = audioFixture();
  audio.impact = () => {}; audio.banks.voiceEffort = [{ duration: .25 }]; audio.banks.voicePain = [{ duration: .2 }];
  audio.update(player, true); audio.context.currentTime = 1.1;
  player.bailTime = 1; player.rider.ragdoll.groundImpact = { speed: 8 };
  assert.equal(audio.update(player, true), true);
  assert.equal(sources.length, 1); assert.equal(sources[0].buffer, audio.banks.voicePain[0]);
  assert.equal(sources[0].starts[0], 1.1); assert.equal(audio.reactions.lastEffort, -Infinity);
  audio.update(player, true); assert.equal(sources.length, 1, 'same contact object never replays');
});

test('reaction music holds follow the selected take and only successful eligible playback requests a duck', () => {
  const { audio, player } = audioFixture(), requests = [];
  audio.onMusicDuck = request => requests.push(request);
  audio.impact = () => {}; audio.banks.voicePain = [{ duration: .1757 }];
  audio.update(player, true); player.bailTime = 1; player.rider.ragdoll.groundImpact = { speed: 8 };
  audio.update(player, true);
  assert.deepEqual(requests, [{ durationMs: 96, amount: .7, releaseMs: 80 }]);
  audio.update(player, true); assert.equal(requests.length, 1, 'one physical contact requests one duck');
  audio.banks.crowdExceptional = [{ duration: 4.0092 }];
  audio.context.currentTime = 12; audio.onComboSettled({ id: 'long', points: 4000 });
  assert.deepEqual(requests[1], { durationMs: 3310, amount: .65, releaseMs: 200 });
  audio.context.currentTime = 24; audio.crowdVolume = 0; audio.onComboSettled({ id: 'mute', points: 4000 });
  audio.context.currentTime = 36; audio.crowdVolume = .3; audio.banks.crowdExceptional = []; audio.onComboSettled({ id: 'missing', points: 4000 });
  audio.context.currentTime = 48; audio.banks.crowdSubdued = [{ duration: 4 }]; audio.onComboSettled({ id: 'ordinary', points: 400 });
  assert.equal(requests.length, 2, 'muted, missing and ordinary crowd banks do not move music');
});

test('physical contact fades an active effort voice while pain starts on the contact frame', () => {
  const { audio, sources, gains, player } = audioFixture();
  audio.impact = () => {}; audio.banks.voiceEffort = [{ duration: .25 }]; audio.banks.voicePain = [{ duration: .2 }];
  audio.update(player, true); player.bailTime = 1; audio.update(player, true);
  assert.equal(sources.length, 1);
  audio.context.currentTime = 1.07; player.rider.ragdoll.groundImpact = { speed: 8 };
  assert.equal(audio.update(player, true), true);
  assert.equal(sources[1].starts[0], 1.07); assert.equal(sources[0].stops.at(-1), 1.1);
  assert.deepEqual(gains[0].gain.events.at(-2), ['hold', 1.07]);
  assert.deepEqual(gains[0].gain.events.at(-1), ['linear', .0001, 1.095]);
  assert.equal(audio.playBank('voiceEffort', audio.characterVoice), false, 'pain cannot be masked by another effort voice');
  audio.context.currentTime = 1.2; player.rider.ragdoll.groundImpact = { speed: 9 };
  audio.update(player, true); assert.equal(sources.length, 2, 'contact cooldown still prevents repeated pain');
  audio.silence(); assert.equal(audio.characterReactions.size, 0);
});

test('silencing reactions releases their music hold and clears cancellation handles', () => {
  const { audio, sources } = audioFixture(); let cancelled = 0;
  audio.onMusicDuck = () => () => { cancelled++; };
  audio.banks.crowdExceptional = [{ duration: 4.0092 }];
  audio.onComboSettled({ id: 'applause', points: 4000 });
  assert.equal(audio.reactionDucks.size, 1);
  audio.silence(); assert.equal(cancelled, 1); assert.equal(audio.reactionDucks.size, 0);
  audio.silence(); assert.equal(cancelled, 1, 'repeated pause does not cancel twice');
  sources[0].onended(); assert.equal(audio.reactionDucks.size, 0);
});

test('muting one reaction channel cancels only its music hold', () => {
  const { audio } = audioFixture(), cancelled = [];
  audio.crowd.gain = audio.characterVoice.gain = { setTargetAtTime() {} };
  audio.onMusicDuck = request => () => cancelled.push(request.amount);
  audio.banks.crowdExceptional = [{ duration: 4.0092 }]; audio.banks.voicePain = [{ duration: .25 }];
  audio.onComboSettled({ id: 'applause', points: 4000 });
  audio.playBank('voicePain', audio.characterVoice, .38, { musicDuck: { amount: .7, releaseMs: 80 } });
  audio.setCrowdVolume(0); assert.deepEqual(cancelled, [.65]); assert.equal(audio.reactionDucks.size, 1);
  audio.setVoiceVolume(0); assert.deepEqual(cancelled, [.65, .7]); assert.equal(audio.reactionDucks.size, 0);
});

test('voice level correction attenuates loud takes and limits quiet/noise boosts without mutating samples', () => {
  const sample = amplitude => { const data = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i * .1) * amplitude);
    return { numberOfChannels: 1, getChannelData: () => data }; };
  const loud = sample(.9), quiet = sample(.1), noise = sample(.001), original = loud.getChannelData().slice();
  assert.ok(recordedVoiceGain(loud) < .2);
  assert.ok(recordedVoiceGain(quiet) <= 1.35); assert.equal(recordedVoiceGain(noise), 1);
  assert.deepEqual(loud.getChannelData(), original);
  const { audio, gains } = audioFixture(); loud.duration = .25; audio.banks.voicePain = [loud];
  audio.playBank('voicePain', audio.characterVoice, .4);
  assert.ok(gains[0].gain.events[1][1] < .08, 'runtime applies the bounded correction');
});

test('exceptional applause retains the recorded decay and local ORBIT suppresses missing event locations', () => {
  const { audio, sources, gains } = audioFixture(); audio.banks.crowdExceptional = [{ duration: 4.0092 }];
  assert.equal(audio.onComboSettled({ id: 1, points: 4000 }), true);
  assert.ok(Math.abs(sources[0].stops[0] - 5.0192) < 1e-10);
  assert.deepEqual(gains[0].gain.events[1], ['exp', .5, 1.035]);
  assert.ok(Math.abs(gains[0].gain.events[2][2] - 4.3092) < 1e-10);
  audio.location = 'orbit'; audio.context.currentTime = 20;
  assert.equal(audio.onComboSettled({ id: 2, points: 4000 }), false);
  audio.location = 'grand-warehouse'; audio.context.currentTime = 40;
  assert.equal(audio.onComboSettled({ id: 2, points: 4000 }), false, 'suppressed IDs stay consumed');
});

test('map ambience crossfades independent sources and rapidly changed loops are cleaned up', async () => {
  const { audio, sources, gains } = audioFixture();
  audio.banks.ambienceWarehouse = [{ duration: 12 }]; audio.banks.ambienceParadise = [{ duration: 16 }];
  audio.setLocation('grand-warehouse'); audio.context.currentTime = 2; audio.setLocation('skate-paradise');
  assert.equal(sources.length, 2); assert.equal(sources[0].stops[0], 2.36);
  assert.deepEqual(gains[0].gain.events.at(-2), ['hold', 2]);
  assert.deepEqual(gains[0].gain.events.at(-1), ['linear', 0, 2.35]);
  assert.deepEqual(gains[1].gain.events, [['set', 0, 2], ['linear', 1, 2.35]]);
  assert.equal(audio.ambienceTails.size, 1); sources[0].onended(); assert.equal(audio.ambienceTails.size, 0);
  audio.setLocation('skate-paradise'); assert.equal(sources.length, 2, 'same recording is reused');
  audio.context.currentTime = 2.1; audio.setLocation('grand-warehouse');
  assert.equal(audio.ambienceTails.size, 1); await audio.dispose(); assert.equal(audio.ambienceTails.size, 0);
});

test('sustained scrape loops exclude unrelated entry contacts and silent gaps from the field take', () => {
  const sampleRate = 1000, data = new Float32Array(24000);
  data[500] = 1; data[3350] = 1; // Unrelated mounting/landing transients.
  for (let i = 19700; i < 21750; i++) data[i] = Math.sin(i * .17) * .1;
  const input = { sampleRate, length: data.length, numberOfChannels: 1, getChannelData: () => data };
  const context = { createBuffer(_channels, length, sampleRate) {
    const samples = new Float32Array(length); return { length, sampleRate, getChannelData: () => samples };
  } };
  const loop = seamlessFoleyLoop(context, input, SKATE_SCRAPE_WINDOWS.scrapeConcrete).getChannelData(0);
  assert.equal(loop.length, 1970); assert.ok(loop.every(value => Number.isFinite(value) && Math.abs(value) <= .101));
  for (let i = 0; i < loop.length - 50; i += 50) {
    assert.ok(loop.slice(i, i + 50).reduce((energy, value) => energy + value * value, 0) > .05, 'no silent field-take gap');
  }
  const metal = SKATE_SCRAPE_WINDOWS.scrapeMetal;
  assert.ok(metal.end - metal.start - metal.crossfade > 1.3, 'retain the longest sustained metal pass');
  assert.equal(data[500], 1, 'source bytes/samples remain unchanged');
});
