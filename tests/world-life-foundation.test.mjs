import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldReactions } from '../src/graphics/life/WorldReactions.js';
import { LifeAudio, LIFE_AUDIO } from '../src/graphics/life/LifeAudio.js';
import { LifeDirector } from '../src/graphics/life/LifeDirector.js';
import { nearestFree, keepClearOfRider } from '../src/graphics/life/lifeAnchors.js';
import { MapDressing } from '../src/graphics/MapDressing.js';

// ---------------------------------------------------------------- fakes

const fakeSkater = () => ({
  position: new THREE.Vector3(),
  grounded: true, grind: null, bailTime: 0, respawnSerial: 0,
  presentation: { popTime: 0, landingSeverity: 0 },
  rider: { ragdoll: { groundImpact: null } },
  audioSurfaceTag: 'concrete',
  surface: { name: 'park collision' },
});

function record(reactions) {
  const events = [];
  for (const kind of ['landing', 'pop', 'grindStart', 'grindEnd', 'bail'])
    reactions.on(kind, payload => events.push({ kind, ...payload, point: payload.point.clone() }));
  return events;
}

class FakeParam {
  constructor(value = 0) { this.value = value; this.calls = []; }
  setValueAtTime(v, t) { this.calls.push(['set', v, t]); this.value = v; return this; }
  linearRampToValueAtTime(v, t) { this.calls.push(['ramp', v, t]); return this; }
  cancelScheduledValues(t) { this.calls.push(['cancel', t]); return this; }
}
class FakeNode {
  constructor(type) { this.type = type; this.outputs = []; }
  connect(target) { this.outputs.push(target); return target; }
  disconnect() { this.outputs.length = 0; }
}
function fakeAudioContext() {
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 8000,
    created: { buffers: 0, sources: [], panners: [] },
    listener: {
      positionX: new FakeParam(), positionY: new FakeParam(), positionZ: new FakeParam(),
      forwardX: new FakeParam(), forwardY: new FakeParam(), forwardZ: new FakeParam(-1),
      upX: new FakeParam(), upY: new FakeParam(1), upZ: new FakeParam(),
    },
    createBuffer(channels, length, sampleRate) {
      ctx.created.buffers++;
      const data = new Float32Array(length);
      return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
    },
    createBufferSource() {
      const node = new FakeNode('source');
      node.playbackRate = new FakeParam(1); node.started = null; node.stopped = null;
      node.start = t => { node.started = t; }; node.stop = t => { node.stopped = t ?? 0; };
      ctx.created.sources.push(node);
      return node;
    },
    createGain() { const node = new FakeNode('gain'); node.gain = new FakeParam(1); return node; },
    createPanner() {
      const node = new FakeNode('panner');
      node.positionX = new FakeParam(); node.positionY = new FakeParam(); node.positionZ = new FakeParam();
      ctx.created.panners.push(node);
      return node;
    },
  };
  return ctx;
}
function fakeSkateAudio() {
  const context = fakeAudioContext();
  return { context, enabled: true, master: new FakeNode('master'), extras: new FakeNode('extras') };
}
/** Follow the first output of every node from a source down to the end of its chain. */
function chainOf(node) {
  const chain = [node];
  while (chain.at(-1).outputs?.length) chain.push(chain.at(-1).outputs[0]);
  return chain;
}

// ---------------------------------------------------------------- reactions

test('landing fires once on a grounded false→true edge with severity from the presentation', () => {
  const reactions = new WorldReactions(), events = record(reactions), s = fakeSkater();
  reactions.update(s);
  s.grounded = false; s.position.set(0, 1, 0);
  reactions.update(s); reactions.update(s);
  s.grounded = true; s.position.set(.5, 0, 0); s.presentation.landingSeverity = .7;
  reactions.update(s);
  reactions.update(s); reactions.update(s);
  const landings = events.filter(e => e.kind === 'landing');
  assert.equal(landings.length, 1);
  assert.equal(landings[0].severity, .7);
  assert.equal(landings[0].surface, 'concrete');
  assert.ok(landings[0].point.equals(new THREE.Vector3(.5, 0, 0)));
});

test('pop fires on the pop edge', () => {
  const reactions = new WorldReactions(), events = record(reactions), s = fakeSkater();
  reactions.update(s);
  s.presentation.popTime = .2; s.grounded = false;
  reactions.update(s);
  s.presentation.popTime = .1;
  reactions.update(s);
  assert.deepEqual(events.map(e => e.kind), ['pop']);
});

test('no events fire on the frame respawnSerial changes, or on the first update', () => {
  const reactions = new WorldReactions(), events = record(reactions), s = fakeSkater();
  s.grounded = false;
  reactions.update(s);
  s.grounded = true; s.presentation.popTime = .2; s.grind = { rail: { audioSurfaceTag: 'metal' } };
  s.rider.ragdoll.groundImpact = { point: new THREE.Vector3(), speed: 6 };
  // First frame primes only: nothing yet.
  const fresh = new WorldReactions(), freshEvents = record(fresh);
  fresh.update(s);
  assert.equal(freshEvents.length, 0);
  // Same edges together with a respawn: suppressed.
  s.respawnSerial++;
  reactions.update(s);
  assert.equal(events.length, 0);
  // A later frame does not replay those edges either.
  reactions.update(s);
  assert.equal(events.length, 0);
});

test('a teleport between frames suppresses events like a respawn', () => {
  const reactions = new WorldReactions(), events = record(reactions), s = fakeSkater();
  s.grounded = false;
  reactions.update(s);
  s.grounded = true; s.position.set(30, 0, 0);
  reactions.update(s);
  assert.equal(events.length, 0);
});

test('bail fires once per new ragdoll ground impact, and suppresses other edges while bailing', () => {
  const reactions = new WorldReactions(), events = record(reactions), s = fakeSkater();
  reactions.update(s);
  s.grounded = false; s.bailTime = 1.5;
  reactions.update(s);
  const impact = { point: new THREE.Vector3(1, 0, 2), normal: new THREE.Vector3(0, 1, 0), speed: 6.5 };
  s.rider.ragdoll.groundImpact = impact; s.grounded = true;
  reactions.update(s); reactions.update(s); reactions.update(s);
  let bails = events.filter(e => e.kind === 'bail');
  assert.equal(bails.length, 1);
  assert.equal(bails[0].speed, 6.5);
  assert.ok(bails[0].point.equals(impact.point));
  assert.equal(events.filter(e => e.kind === 'landing').length, 0, 'no landing while bailTime > 0');
  s.rider.ragdoll.groundImpact = { point: new THREE.Vector3(3, 0, 2), speed: 2 };
  reactions.update(s);
  bails = events.filter(e => e.kind === 'bail');
  assert.equal(bails.length, 2);
});

test('grindStart/grindEnd fire on the grind edges with the rail material', () => {
  const reactions = new WorldReactions(), events = record(reactions), s = fakeSkater();
  reactions.update(s);
  s.grind = { rail: { audioSurfaceTag: 'metal' } }; s.grounded = false;
  reactions.update(s); reactions.update(s);
  s.grind = null;
  reactions.update(s);
  assert.deepEqual(events.map(e => e.kind), ['grindStart', 'grindEnd']);
  assert.equal(events[0].material, 'metal');
});

test('on() returns an unsubscribe; reset() re-primes without emitting', () => {
  const reactions = new WorldReactions(), s = fakeSkater();
  let pops = 0;
  const off = reactions.on('pop', () => pops++);
  reactions.update(s);
  s.presentation.popTime = .2; reactions.update(s);
  off();
  s.presentation.popTime = 0; reactions.update(s);
  s.presentation.popTime = .2; reactions.update(s);
  assert.equal(pops, 1);
  const events = record(reactions);
  s.grounded = false; reactions.update(s);
  reactions.reset();
  s.grounded = true; reactions.update(s);
  assert.equal(events.length, 0);
  assert.throws(() => reactions.on('explosion', () => {}));
});

// ---------------------------------------------------------------- audio

test('LifeAudio.play routes a spatial voice into the extras bus looked up at play time', () => {
  const skateAudio = fakeSkateAudio(), audio = new LifeAudio(skateAudio);
  assert.equal(audio.play('clink', new THREE.Vector3(3, 1, -2)), true);
  const source = skateAudio.context.created.sources[0];
  const chain = chainOf(source);
  assert.equal(chain.at(-1), skateAudio.extras, 'ends in extras');
  const panner = chain.find(n => n.type === 'panner');
  assert.ok(panner, 'spatialised');
  assert.equal(panner.panningModel, 'equalpower');
  assert.equal(panner.distanceModel, 'inverse');
  assert.equal(panner.refDistance, 4);
  assert.equal(panner.maxDistance, 60);
  assert.deepEqual([panner.positionX.value, panner.positionY.value, panner.positionZ.value], [3, 1, -2]);
  assert.notEqual(source.started, null);
  // SkateAudio.silence() replaces the extras node: the next voice must use the new one.
  const replaced = new FakeNode('extras-2');
  skateAudio.extras = replaced;
  assert.equal(audio.play('beep', new THREE.Vector3()), true);
  assert.equal(chainOf(skateAudio.context.created.sources[1]).at(-1), replaced);
});

test('LifeAudio refuses a 9th simultaneous voice and frees slots once voices end', () => {
  const skateAudio = fakeSkateAudio(), audio = new LifeAudio(skateAudio), at = new THREE.Vector3();
  for (let i = 0; i < LIFE_AUDIO.maxVoices; i++) assert.equal(audio.play('thud', at), true, `voice ${i + 1}`);
  assert.equal(LIFE_AUDIO.maxVoices, 8);
  assert.equal(audio.play('thud', at), false, '9th voice refused');
  skateAudio.context.currentTime = 5;
  assert.equal(audio.play('thud', at), true, 'finished voices free their slots');
});

test('LifeAudio is a no-op without a running context, when sound is off, or for unknown kinds', () => {
  const at = new THREE.Vector3();
  assert.equal(new LifeAudio(null).play('chirp', at), false);
  assert.equal(new LifeAudio({ context: null, extras: null }).play('chirp', at), false);
  const suspended = fakeSkateAudio(); suspended.context.state = 'suspended';
  assert.equal(new LifeAudio(suspended).play('chirp', at), false);
  const off = fakeSkateAudio(); off.enabled = false;
  assert.equal(new LifeAudio(off).play('chirp', at), false);
  const ok = fakeSkateAudio();
  assert.equal(new LifeAudio(ok).play('kazoo', at), false);
  assert.doesNotThrow(() => new LifeAudio(null).setListener(new THREE.PerspectiveCamera()));
});

test('all eleven kinds synthesise once, short and finite', () => {
  const skateAudio = fakeSkateAudio(), audio = new LifeAudio(skateAudio), at = new THREE.Vector3();
  assert.deepEqual([...LIFE_AUDIO.kinds],
    ['flap', 'chirp', 'clink', 'thud', 'creak', 'rattle', 'beep', 'hum', 'ring', 'clatter', 'whoosh']);
  for (const kind of LIFE_AUDIO.kinds) {
    skateAudio.context.currentTime += 10;
    assert.equal(audio.play(kind, at, { gain: .5, rate: 1.1 }), true, kind);
    const buffer = skateAudio.context.created.sources.at(-1).buffer;
    if (kind !== 'hum') assert.ok(buffer.duration <= .8, `${kind} ≤ 0.8 s`);
    else assert.ok(buffer.duration <= 1.5, 'hum is a short loop');
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (const v of data) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
    assert.ok(peak > .05 && peak <= 1, `${kind} audible and unclipped`);
  }
  const buffers = skateAudio.context.created.buffers;
  skateAudio.context.currentTime += 10;
  audio.play('ring', at);
  assert.equal(skateAudio.context.created.buffers, buffers, 'cached');
});

test('setListener follows the camera', () => {
  const skateAudio = fakeSkateAudio(), audio = new LifeAudio(skateAudio);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(4, 2, 9); camera.lookAt(4, 2, 0); camera.updateMatrixWorld(true);
  audio.setListener(camera);
  const l = skateAudio.context.listener;
  assert.deepEqual([l.positionX.value, l.positionY.value, l.positionZ.value], [4, 2, 9]);
  assert.ok(Math.abs(l.forwardZ.value + 1) < 1e-6);
  assert.ok(Math.abs(l.upY.value - 1) < 1e-6);
  // Legacy listener API fallback.
  const legacy = fakeSkateAudio(), calls = [];
  legacy.context.listener = { setPosition: (...a) => calls.push(['p', ...a]), setOrientation: (...a) => calls.push(['o', ...a]) };
  new LifeAudio(legacy).setListener(camera);
  assert.deepEqual(calls[0], ['p', 4, 2, 9]);
  assert.equal(calls[1][0], 'o');
});

test('stop() fades and stops every live voice', () => {
  const skateAudio = fakeSkateAudio(), audio = new LifeAudio(skateAudio), at = new THREE.Vector3();
  audio.play('hum', at); audio.play('ring', at);
  audio.stop();
  for (const source of skateAudio.context.created.sources) assert.ok(source.stopped <= .05);
  for (let i = 0; i < 8; i++) assert.equal(audio.play('beep', at), true, 'slots freed');
});

// ---------------------------------------------------------------- director

function fakeModule(parks) {
  const module = {
    parks, root: new THREE.Group(), calls: [], ctxSeen: [],
    setWorld(world, ctx) { module.calls.push(['setWorld', world?.id]); module.ctxSeen.push(ctx); },
    setQuality(settings) { module.calls.push(['setQuality', settings?.name]); },
    update(dt, skater, camera, ctx) { module.calls.push(['update']); module.ctxSeen.push(ctx); module.lastAnchors = ctx.anchors; },
    reset() { module.calls.push(['reset']); },
    dispose() { module.calls.push(['dispose']); },
  };
  module.count = name => module.calls.filter(c => c[0] === name).length;
  return module;
}

test('director activates only modules whose parks match the world', () => {
  const scene = new THREE.Scene(), mapDressing = { anchors: { poles: [], lamps: [], strings: [] }, scan: null };
  const director = new LifeDirector(scene, { skateAudio: fakeSkateAudio(), mapDressing });
  assert.equal(director.root.parent, scene);
  const orbit = fakeModule(['orbit']), paradise = fakeModule(['skate-paradise']), everywhere = fakeModule('*');
  for (const m of [orbit, paradise, everywhere]) director.register(m);
  const s = fakeSkater();
  director.setWorld({ id: 'orbit' }, s);
  director.update(1 / 60, s, new THREE.PerspectiveCamera());
  assert.equal(orbit.count('setWorld'), 1);
  assert.equal(everywhere.count('setWorld'), 1);
  assert.equal(paradise.count('setWorld'), 0);
  assert.equal(orbit.count('update'), 1);
  assert.equal(paradise.count('update'), 0);
  assert.deepEqual(director.root.children, [orbit.root, everywhere.root]);
  const ctx = orbit.ctxSeen.at(-1);
  assert.equal(ctx.reactions, director.reactions);
  assert.equal(ctx.audio, director.audio);
  assert.equal(ctx.anchors, mapDressing.anchors);
  assert.equal(ctx.surface, s.surface);
  assert.equal(ctx.density, 1);
  assert.equal(ctx.reducedMotion, false);
  assert.equal(director.reducedMotion, false);

  // Switch park: the orbit-only module is reset and leaves the tree.
  director.setWorld({ id: 'skate-paradise' }, s);
  assert.equal(orbit.count('reset'), 1);
  assert.deepEqual(director.root.children, [paradise.root, everywhere.root]);
  director.update(1 / 60, s, null);
  assert.equal(orbit.count('update'), 1);
  assert.equal(paradise.count('update'), 1);
});

test('director setWorld twice leaves root children equal (round trip)', () => {
  const director = new LifeDirector(null, { mapDressing: { anchors: { poles: [], lamps: [], strings: [] } } });
  const a = fakeModule(['orbit', 'grand-warehouse']), b = fakeModule('*');
  director.register(a); director.register(b);
  director.setWorld({ id: 'orbit' });
  const first = director.root.children.slice();
  director.setWorld({ id: 'orbit' });
  assert.deepEqual(director.root.children, first);
  director.setWorld({ id: 'skate-paradise' }); director.setWorld({ id: 'orbit' });
  assert.deepEqual(director.root.children, first);
  let count = 0; director.root.traverse(() => count++);
  assert.equal(count, 3);
});

test('modules registered after setWorld join the current park', () => {
  const director = new LifeDirector(null, {});
  director.setWorld({ id: 'orbit' });
  const late = fakeModule(['orbit']);
  director.register(late);
  assert.equal(late.count('setWorld'), 1);
  assert.deepEqual(director.root.children, [late.root]);
});

test('performance preset hides the director and stops all work; switching back restores it', () => {
  const skateAudio = fakeSkateAudio();
  const director = new LifeDirector(null, { skateAudio, mapDressing: {} });
  const m = fakeModule('*');
  director.register(m);
  director.setWorld({ id: 'orbit' });
  const s = fakeSkater();
  director.audio.play('hum', new THREE.Vector3());
  director.setQuality({ name: 'performance', vfxScale: .65 });
  assert.equal(director.root.visible, false);
  assert.equal(m.calls.at(-1)[0], 'reset');
  assert.ok(m.calls.some(c => c[0] === 'setQuality' && c[1] === 'performance'));
  assert.ok(skateAudio.context.created.sources[0].stopped <= .05, 'sound stopped');
  director.update(1 / 60, s, null);
  assert.equal(m.count('update'), 0);
  director.setQuality({ name: 'balanced', vfxScale: .82 });
  assert.equal(director.root.visible, true);
  director.update(1 / 60, s, null);
  assert.equal(m.count('update'), 1);
  assert.equal(m.ctxSeen.at(-1).density, .5);
  director.setQuality({ name: 'cinematic', vfxScale: 1.25 });
  director.update(1 / 60, s, null);
  assert.equal(m.ctxSeen.at(-1).density, 1);
});

test('director hands modules the anchors and scan current at each update', () => {
  const mapDressing = { anchors: { poles: [], lamps: [], strings: [] }, scan: null };
  const director = new LifeDirector(null, { mapDressing });
  const m = fakeModule('*');
  director.register(m);
  director.setWorld({ id: 'grand-warehouse' });
  // MapDressing finishes building after setWorld.
  const built = { poles: [{ position: new THREE.Vector3(1, 3, 1), height: 3.4 }], lamps: [], strings: [] };
  mapDressing.anchors = built; mapDressing.scan = { walls: [], edges: [] };
  director.update(1 / 60, fakeSkater(), null);
  assert.equal(m.lastAnchors, built);
  assert.equal(m.ctxSeen.at(-1).scan, mapDressing.scan);
});

test('director feeds reactions to modules before their update, and reset() re-primes them', () => {
  const director = new LifeDirector(null, {});
  const order = [];
  const m = fakeModule('*');
  m.update = () => order.push('update');
  director.register(m);
  director.setWorld({ id: 'orbit' });
  director.reactions.on('landing', () => order.push('landing'));
  const s = fakeSkater();
  director.update(1 / 60, s, null);
  s.grounded = false; director.update(1 / 60, s, null);
  s.grounded = true; director.update(1 / 60, s, null);
  assert.deepEqual(order, ['update', 'update', 'landing', 'update']);
  s.grounded = false; director.update(1 / 60, s, null);
  director.reset();
  s.grounded = true; director.update(1 / 60, s, null);
  assert.equal(order.filter(o => o === 'landing').length, 1, 'no landing after reset');
});

// ---------------------------------------------------------------- anchors

test('nearestFree picks the nearest point at least minDistance away', () => {
  const points = [new THREE.Vector3(.5, 0, 0), new THREE.Vector3(3, 0, 0), new THREE.Vector3(-6, 0, 0)];
  assert.equal(nearestFree(points, new THREE.Vector3(), 1.2), points[1]);
  assert.equal(nearestFree(points, new THREE.Vector3(), 10), null);
  assert.equal(nearestFree([], new THREE.Vector3(), 0), null);
  const anchors = [{ position: new THREE.Vector3(9, 0, 0), height: 3 }, { position: new THREE.Vector3(4, 0, 0), height: 3 }];
  assert.equal(nearestFree(anchors, new THREE.Vector3(), 1), anchors[1].position);
});

test('keepClearOfRider pushes a point out of the rider radius', () => {
  const rider = new THREE.Vector3(1, 0, 1);
  const p = new THREE.Vector3(1.5, 0, 1);
  assert.equal(keepClearOfRider(p, rider), p);
  assert.ok(Math.abs(p.distanceTo(rider) - 1.2) < 1e-9);
  assert.ok(p.x > rider.x, 'pushed away from the rider');
  const far = new THREE.Vector3(5, 0, 5);
  keepClearOfRider(far, rider, 2);
  assert.ok(far.equals(new THREE.Vector3(5, 0, 5)));
  const same = rider.clone();
  keepClearOfRider(same, rider, 2);
  assert.ok(Math.abs(same.distanceTo(rider) - 2) < 1e-9);
});

// ---------------------------------------------------------------- MapDressing anchors

test('MapDressing records pole and string anchors and clears them with the park', () => {
  const dressing = new MapDressing();
  assert.deepEqual(dressing.anchors, { poles: [], lamps: [], strings: [], props: [] });
  const rand = () => .5;
  dressing.buildFlag({ point: new THREE.Vector3(2, 1, 3), facing: new THREE.Vector3(0, 0, 1) }, rand);
  assert.equal(dressing.anchors.poles.length, 1);
  assert.ok(dressing.anchors.poles[0].position.equals(new THREE.Vector3(2, 4.4, 3)), 'pole top');
  assert.equal(dressing.anchors.poles[0].height, 3.4);
  dressing.buildStrings([
    { point: new THREE.Vector3(0, 0, 0) }, { point: new THREE.Vector3(10, 0, 0) },
  ], rand, false);
  assert.equal(dressing.anchors.strings.length, 2);
  assert.ok(dressing.anchors.strings[1].position.equals(new THREE.Vector3(10, 4.4, 0)));
  assert.equal(dressing.anchors.strings[0].height, 4.4);
  dressing.scan = { walls: [] };
  dressing.clear();
  assert.deepEqual(dressing.anchors, { poles: [], lamps: [], strings: [], props: [] });
  assert.equal(dressing.scan, null, 'no stale scan from the previous park');
});

// ---------------------------------------------------------------- fix round 1

test('a bail mid-grind closes the grind with exactly one grindEnd', () => {
  const reactions = new WorldReactions(), events = record(reactions), s = fakeSkater();
  reactions.update(s);
  s.grind = { rail: { audioSurfaceTag: 'metal' } }; s.grounded = false;
  reactions.update(s);
  // Bail starts while the grind state is still set, then the grind drops.
  s.bailTime = 1.5; s.position.set(.4, 0, 0);
  reactions.update(s);
  s.grind = null; reactions.update(s);
  s.rider.ragdoll.groundImpact = { point: new THREE.Vector3(1, 0, 0), speed: 5 };
  reactions.update(s); reactions.update(s);
  assert.deepEqual(events.map(e => e.kind), ['grindStart', 'grindEnd', 'bail']);
  assert.ok(events[1].point.equals(new THREE.Vector3(.4, 0, 0)));
});

test('a respawn mid-grind emits exactly one grindEnd and no landing/pop/grindStart', () => {
  const reactions = new WorldReactions(), events = record(reactions), s = fakeSkater();
  reactions.update(s);
  s.grind = { rail: { audioSurfaceTag: 'metal' } }; s.grounded = false;
  reactions.update(s);
  // R reset: teleported to spawn, grounded, grind cleared, serial bumped.
  s.respawnSerial++; s.grind = null; s.grounded = true; s.presentation.popTime = .2; s.position.set(40, 0, 0);
  reactions.update(s);
  reactions.update(s); reactions.update(s);
  assert.deepEqual(events.map(e => e.kind), ['grindStart', 'grindEnd']);
  // reset() mid-grind (director park switch / new session) also closes it once.
  const r2 = new WorldReactions(), e2 = record(r2), s2 = fakeSkater();
  r2.update(s2); s2.grind = { rail: {} }; r2.update(s2);
  r2.reset(); r2.update(s2); r2.update(s2);
  assert.deepEqual(e2.map(e => e.kind), ['grindStart', 'grindEnd']);
});

test('director setWorld resets every previously active module, including ones that stay active', () => {
  const director = new LifeDirector(null, {});
  const everywhere = fakeModule('*'), orbit = fakeModule(['orbit']), paradise = fakeModule(['skate-paradise']);
  for (const m of [everywhere, orbit, paradise]) director.register(m);
  director.setWorld({ id: 'orbit' });
  assert.equal(everywhere.count('reset'), 0, 'nothing to reset on first activation');
  director.setWorld({ id: 'skate-paradise' });
  assert.equal(everywhere.count('reset'), 1);
  assert.equal(orbit.count('reset'), 1);
  assert.equal(paradise.count('reset'), 0, 'was not active before');
  // Reset happens before the module sees the new park.
  const i = everywhere.calls.findIndex(c => c[0] === 'reset');
  assert.deepEqual(everywhere.calls[i + 1], ['setWorld', 'skate-paradise']);
});

test('LifeAudio loops a hum for a set duration and stop(kind) ends just that kind', () => {
  const skateAudio = fakeSkateAudio(), audio = new LifeAudio(skateAudio), at = new THREE.Vector3();
  assert.equal(audio.play('hum', at, { loop: true, duration: 6 }), true);
  assert.equal(audio.play('ring', at), true);
  const [hum, ring] = skateAudio.context.created.sources;
  assert.equal(hum.loop, true);
  assert.equal(ring.loop, false);
  assert.ok(Math.abs(hum.stopped - 6.02) < 1e-9, 'stops after the requested duration');
  skateAudio.context.currentTime = .5;
  // Hum and ring both still hold their slots: 6 more voices fit, not 7.
  for (let i = 0; i < 6; i++) assert.equal(audio.play('thud', at), true);
  assert.equal(audio.play('thud', at), false);
  audio.stop('hum');
  assert.ok(hum.stopped <= .55, 'hum stopped early');
  assert.ok(Math.abs(ring.stopped - (ring.buffer.duration + .02)) < 1e-9, 'other kinds untouched');
  assert.equal(audio.play('thud', at), true, 'hum slot freed');
  assert.equal(LIFE_AUDIO.maxLoopSeconds, 30);
  audio.play('hum', at, { loop: true, duration: 999 });
  assert.ok(skateAudio.context.created.sources.at(-1).stopped <= .5 + 30 + .05, 'loop length capped');
});
