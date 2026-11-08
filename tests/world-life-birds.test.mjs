import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldLife, WORLD_LIFE } from '../src/graphics/WorldLife.js';
import { WorldReactions } from '../src/graphics/life/WorldReactions.js';

// Flat ground everywhere at y = 0.
const surface = {
  ground(position) { return { point: new THREE.Vector3(position.x, 0, position.z), normal: new THREE.Vector3(0, 1, 0) }; },
};
const rider = (x = 0, z = 0, speed = 0, vx = 0, vz = 0) => ({
  position: new THREE.Vector3(x, 0, z), velocity: new THREE.Vector3(vx, 0, vz),
  forward: new THREE.Vector3(0, 0, -1), speed, grounded: true, surface,
});
const lamp = (x, z) => ({ position: new THREE.Vector3(x, 17.6, z), height: 6.6 });

function rig({ world = 'skate-paradise', lamps = [], reducedMotion = false } = {}) {
  const plays = [];
  const reactions = new WorldReactions();
  const ctx = {
    reactions, reducedMotion, density: 1, scan: null, surface,
    anchors: { poles: [], lamps, strings: [] },
    audio: { play(kind, position, opts) { plays.push({ kind, position: position.clone(), opts }); return true; }, stop() {} },
  };
  const life = new WorldLife();
  life.setLifeContext(ctx);
  life.setWorld({ id: world, park: new THREE.Group() });
  life.surface = surface;
  return { life, ctx, reactions, plays };
}
/** Place n birds on the floor around `center` (deterministic positions). */
function flock(life, center, n = 4, spacing = .5) {
  const birds = life.birds.filter(b => !b.roost).slice(0, n);
  birds.forEach((bird, i) => bird.spawn(center.clone().add(new THREE.Vector3((i - (n - 1) / 2) * spacing, 0, 0)), 0));
  return birds;
}
const emit = (reactions, kind, fields) => {
  const payload = reactions.payloads[kind];
  for (const [key, value] of Object.entries(fields)) {
    if (value?.isVector3) payload[key].copy(value); else payload[key] = value;
  }
  reactions.emit(kind);
};
const flying = life => life.birds.filter(b => b.state === 'alert' || b.state === 'flee');
const perched = life => life.birds.filter(b => b.state === 'perch');

test('a slow approach makes pigeons hop aside instead of flying', () => {
  const { life } = rig();
  const birds = flock(life, new THREE.Vector3(0, 0, -6), 4, .45);
  const s = rider(0, 0, 1, 0, -1);
  const start = birds.map(b => b.root.position.clone());
  let hopped = false, minClearance = Infinity;
  // Roll toward the flock at 1 m/s until the rider is 2 m short of it.
  for (let i = 0; i < 120; i++) {
    s.position.z -= 1 / 30;
    life.update(1 / 30, s);
    if (birds.some(b => b.action === 'hop')) hopped = true;
    for (const b of birds) if (b.state !== 'hidden') minClearance = Math.min(minClearance, b.root.position.distanceTo(s.position));
  }
  assert.ok(hopped, 'at least one bird hopped');
  assert.equal(flying(life).length, 0, 'nobody took off');
  assert.ok(minClearance >= 1.2, `birds stay >= 1.2 m from the rider (${minClearance.toFixed(2)})`);
  const moved = birds.map((b, i) => b.root.position.distanceTo(start[i]));
  assert.ok(moved.some(d => d > .5), 'the hop carried a bird at least 0.5 m');
  for (const b of birds) if (b.action !== 'hop') assert.ok(Math.abs(b.root.position.y) < 1e-6, 'birds land back on the ground');
  life.dispose();
});

test('a hop is short, arcs and lands 0.6-1.2 m away; reduced motion halves its speed and height', () => {
  for (const reducedMotion of [false, true]) {
    const { life } = rig({ reducedMotion });
    const [bird] = flock(life, new THREE.Vector3(0, 0, -3), 1);
    const s = rider(0, 0, 1, 0, -1);
    const from = bird.root.position.clone();
    life.update(1 / 60, s);
    assert.equal(bird.action, 'hop');
    const length = bird.hopLength;
    if (reducedMotion) assert.ok(length >= .5 && length <= .7, `reduced hop ${length}`);
    else assert.ok(length >= .25 && length <= .35, `hop ${length}`);
    let peak = 0;
    s.speed = 0; s.velocity.set(0, 0, 0); s.position.set(0, 0, 20);
    for (let t = 0; t < length + .1 && bird.action === 'hop'; t += 1 / 60) { life.update(1 / 60, s); peak = Math.max(peak, bird.root.position.y); }
    assert.notEqual(bird.action, 'hop', 'the hop ends on time');
    const distance = Math.hypot(bird.root.position.x - from.x, bird.root.position.z - from.z);
    assert.ok(distance >= .6 - 1e-6 && distance <= 1.2 + 1e-6, `hop distance ${distance}`);
    assert.ok(peak > .02, 'the hop leaves the ground');
    assert.ok(peak <= (reducedMotion ? .08 : .16), `hop height ${peak}`);
    assert.equal(bird.state, 'idle');
    life.dispose();
  }
});

test('fast passes and close landings still send them flying', () => {
  const { life } = rig();
  const birds = flock(life, new THREE.Vector3(0, 0, -3), 3);
  life.update(1 / 30, rider(0, -1, 8, 0, -8));
  assert.ok(flying(life).length > 0, 'fast pass scares them');
  assert.ok(birds.every(b => b.action !== 'hop'));
  life.dispose();
});

test('grind start within 10 m: alert flinch, then flee only within 6 m', () => {
  const { life, reactions } = rig();
  const near = flock(life, new THREE.Vector3(4, 0, 0), 2, .4);
  const mid = life.birds.filter(b => !b.roost && b.state === 'hidden').slice(0, 1);
  mid[0].spawn(new THREE.Vector3(8, 0, 0), 0);
  const far = life.birds.filter(b => !b.roost && b.state === 'hidden').slice(0, 1);
  far[0].spawn(new THREE.Vector3(14, 0, 0), 0);
  const s = rider(0, 0, 0);
  life.update(1 / 30, s);
  emit(reactions, 'grindStart', { point: new THREE.Vector3(0, 0, 0), material: 'metal' });
  for (const b of [...near, ...mid]) assert.ok(b.flinchTime > 0, 'birds within 10 m flinch');
  assert.equal(far[0].flinchTime || 0, 0, 'birds beyond 10 m ignore it');
  for (let t = 0; t < .3; t += 1 / 30) life.update(1 / 30, s);
  assert.equal(flying(life).length, 0, 'nobody leaves during the flinch');
  for (let t = 0; t < .2; t += 1 / 30) life.update(1 / 30, s);
  for (const b of near) assert.ok(b.state === 'alert' || b.state === 'flee', 'birds within 6 m flee');
  assert.equal(mid[0].state, 'idle', '6-10 m: flinch only');
  assert.equal(far[0].state, 'idle');
  life.dispose();
});

test('a bail nearby makes them flinch and flee too', () => {
  const { life, reactions } = rig();
  const birds = flock(life, new THREE.Vector3(3, 0, 0), 2, .4);
  const s = rider(0, 0, 0);
  life.update(1 / 30, s);
  emit(reactions, 'bail', { point: new THREE.Vector3(0, 0, 0), speed: 6 });
  assert.ok(birds.every(b => b.flinchTime > 0));
  for (let t = 0; t < .5; t += 1 / 30) life.update(1 / 30, s);
  assert.ok(birds.every(b => b.state === 'alert' || b.state === 'flee'));
  life.dispose();
});

test('wing claps play through the spatial life audio at the bird', () => {
  const { life, plays } = rig();
  const birds = flock(life, new THREE.Vector3(0, 0, -3), 4);
  life.update(1 / 30, rider(0, -1.5, 8, 0, -8));
  for (let t = 0; t < .6; t += 1 / 30) life.update(1 / 30, rider(0, 20, 0));
  const flaps = plays.filter(p => p.kind === 'flap');
  assert.ok(flaps.length >= 1 && flaps.length <= 3, `1-3 claps per scatter (${flaps.length})`);
  for (const flap of flaps) assert.ok(birds.some(b => b.root.position.distanceTo(flap.position) < 3), 'played near a bird');
  // Without life audio the old synthesised path is used (and is silent without a context).
  const plain = new WorldLife();
  plain.surface = surface;
  flock(plain, new THREE.Vector3(0, 0, -3), 3);
  assert.doesNotThrow(() => plain.update(1 / 30, rider(0, -1.5, 8, 0, -8)));
  plain.dispose(); life.dispose();
});

test('the rafter roost: 3 perched birds only on grand-warehouse', () => {
  const lamps = [lamp(0, 0), lamp(22, 0), lamp(0, 22), lamp(22, 22)];
  for (const id of ['skate-paradise', 'orbit', 'grand-warehouse']) {
    const { life } = rig({ world: id, lamps });
    const s = rider(5, 5, 0);
    for (let i = 0; i < 90; i++) life.update(1 / 30, s);
    const roost = perched(life);
    assert.equal(roost.length, id === 'grand-warehouse' ? 3 : 0, id);
    // The Warehouse has no roof: each bird stands on a rod's static top anchor, one per rod.
    for (const bird of roost) {
      const p = bird.root.position;
      const anchor = lamps.find(l => Math.hypot(l.position.x - p.x, l.position.z - p.z) < .2);
      assert.ok(anchor, 'perched on a lamp rod');
      assert.ok(Math.abs(p.y - anchor.position.y) < 1e-6, 'feet on the rod top');
      assert.equal(bird.perchAnchor, anchor);
    }
    assert.equal(new Set(roost.map(b => b.perchAnchor)).size, roost.length, 'one bird per rod while rods are free');
    life.dispose();
  }
});

test('without lamp anchors the roost birds stay on the floor, then fly up when anchors appear', () => {
  const lamps = [];
  const { life, ctx } = rig({ world: 'grand-warehouse', lamps });
  const s = rider(0, 0, 0);
  for (let i = 0; i < 200 && !life.birds.some(b => b.state === 'idle'); i++) life.update(1 / 30, s);
  assert.equal(perched(life).length, 0);
  const floorRoosters = life.birds.filter(b => b.roost && b.state === 'idle');
  assert.ok(floorRoosters.length > 0, 'roost birds join the floor flock meanwhile');
  ctx.anchors = { poles: [], lamps: [lamp(10, 10), lamp(32, 10)], strings: [] };
  for (let t = 0; t < 8; t += 1 / 30) life.update(1 / 30, s);
  assert.equal(perched(life).length, 3, 'all three end up on perches');
  life.dispose();
});

test('hard landings and bails within 14 m make the roost flutter and resettle', () => {
  const lamps = [lamp(0, 0), lamp(22, 0)];
  const { life, reactions, plays } = rig({ world: 'grand-warehouse', lamps });
  const s = rider(3, 3, 0);
  for (let i = 0; i < 30; i++) life.update(1 / 30, s);
  assert.equal(perched(life).length, 3);
  const home = new Map(perched(life).map(b => [b, b.root.position.clone()]));
  const first = perched(life)[0].root.position;
  const near = new THREE.Vector3(first.x + 4, 0, first.z + 4);
  emit(reactions, 'landing', { point: near, severity: .3, surface: 'concrete' });
  assert.equal(perched(life).length, 3, 'a soft landing does not disturb them');
  emit(reactions, 'landing', { point: new THREE.Vector3(200, 0, 200), severity: 1, surface: 'concrete' });
  assert.equal(perched(life).length, 3, 'too far away');
  const feathersBefore = life.feathers.filter(f => f.life > 0).length;
  emit(reactions, 'landing', { point: near, severity: .7, surface: 'concrete' });
  const disturbed = life.birds.filter(b => b.state === 'roost');
  assert.ok(disturbed.length >= 1, 'the roost flutters');
  const dropped = life.feathers.filter(f => f.life > 0).length - feathersBefore;
  assert.ok(dropped >= 1 && dropped <= 2, `1-2 feathers (${dropped})`);
  let maxRise = 0;
  for (let t = 0; t < 2.5; t += 1 / 30) { life.update(1 / 30, s); maxRise = Math.max(maxRise, ...disturbed.map(b => b.root.position.distanceTo(home.get(b)))); }
  assert.ok(maxRise > 1, 'they actually fly a loop');
  assert.ok(disturbed.every(b => b.state === 'roost'), 'still flying at 2.5 s');
  for (let t = 0; t < 3; t += 1 / 30) life.update(1 / 30, s);
  assert.equal(perched(life).length, 3, 'resettled after 3-5 s');
  assert.ok(plays.some(p => p.kind === 'flap'), 'wing claps');
  const now = perched(life)[0].root.position;
  emit(reactions, 'bail', { point: new THREE.Vector3(now.x + 3, 0, now.z), speed: 5 });
  assert.ok(life.birds.some(b => b.state === 'roost'), 'a bail also sets them off');
  life.dispose();
});

test('switching parks twice clears every bird and keeps the scene graph the same size', () => {
  const lamps = [lamp(0, 0), lamp(22, 0)];
  const { life, reactions } = rig({ world: 'grand-warehouse', lamps });
  const s = rider(3, 3, 0);
  for (let i = 0; i < 90; i++) life.update(1 / 30, s);
  emit(reactions, 'bail', { point: new THREE.Vector3(1, 0, 1), speed: 5 });
  life.update(1 / 30, s);
  const count = () => { let n = 0; life.root.traverse(() => n++); return n; };
  const before = count();
  life.setWorld({ id: 'orbit', park: new THREE.Group() });
  life.setWorld({ id: 'skate-paradise', park: new THREE.Group() });
  assert.equal(count(), before);
  assert.ok(life.birds.every(b => b.state === 'hidden' && !b.root.visible));
  assert.ok(life.feathers.every(f => !f.mesh.visible));
  for (let i = 0; i < 10; i++) life.update(1 / 30, s);
  assert.equal(perched(life).length, 0, 'no roost outside the warehouse');
  life.dispose();
});

test('motes part around a fast rider and never come within 0.8 m', () => {
  const { life } = rig();
  const s = rider(0, 0, 12, 0, -12);
  const center = new THREE.Vector3();
  const a = life.motes.geometry.attributes.position.array;
  // Seed the drift field densely along the rider's line.
  const base = life.moteBase;
  for (let i = 0; i < WORLD_LIFE.moteCount; i++) {
    base[i * 3] = (Math.random() - .5) * 3;
    base[i * 3 + 1] = Math.random() * 2;
    base[i * 3 + 2] = -Math.random() * 14;
  }
  life.moteCenter.set(0, 0, -6);
  let closest = Infinity, maxStep = 0;
  const previous = new Float32Array(a.length);
  for (let frame = 0; frame < 30; frame++) {
    previous.set(a);
    s.position.z -= 12 / 30;
    life.updateMotes(1 / 30, center.copy(s.position), s);
    const rx = s.position.x, ry = s.position.y + WORLD_LIFE.moteRiderHeight, rz = s.position.z;
    for (let i = 0; i < WORLD_LIFE.moteCount; i++) {
      closest = Math.min(closest, Math.hypot(a[i * 3] - rx, a[i * 3 + 1] - ry, a[i * 3 + 2] - rz));
      if (frame > 0) maxStep = Math.max(maxStep, Math.hypot(a[i * 3] - previous[i * 3], a[i * 3 + 1] - previous[i * 3 + 1], a[i * 3 + 2] - previous[i * 3 + 2]));
    }
  }
  assert.ok(closest >= .8 - 1e-4, `closest mote ${closest.toFixed(3)} m`);
  assert.ok(maxStep < .5, `eased, no pop (max step ${maxStep.toFixed(3)} m/frame)`);
  // Slow down: they drift back to their own paths.
  s.speed = 1; s.velocity.set(0, 0, -1);
  for (let frame = 0; frame < 120; frame++) life.updateMotes(1 / 30, center.copy(s.position), s);
  let offset = 0;
  for (let i = 0; i < life.moteOffset.length; i++) offset = Math.max(offset, Math.abs(life.moteOffset[i]));
  assert.ok(offset < .05, `offsets relax (${offset.toFixed(3)})`);
  life.dispose();
});

test('slow riders leave the motes alone', () => {
  const { life } = rig();
  const s = rider(0, 0, 4, 0, -4);
  for (let i = 0; i < WORLD_LIFE.moteCount; i++) life.moteBase.set([0, .9, -.3 - i * .001], i * 3);
  life.updateMotes(1 / 30, s.position, s);
  assert.ok(life.moteOffset.every(v => v === 0));
  life.dispose();
});

test('performance preset hides everything and reactions do nothing', () => {
  const lamps = [lamp(0, 0)];
  const { life, reactions } = rig({ world: 'grand-warehouse', lamps });
  life.setQuality({ name: 'performance' });
  emit(reactions, 'bail', { point: new THREE.Vector3(), speed: 5 });
  life.update(1 / 30, rider());
  assert.equal(life.root.visible, false);
  assert.ok(life.birds.every(b => b.state === 'hidden'));
  life.setQuality({ name: 'high' });
  for (let i = 0; i < 10; i++) life.update(1 / 30, rider());
  assert.equal(perched(life).length, 3, 'restored');
  life.dispose();
});

test('dispose unsubscribes from reactions', () => {
  const { life, reactions } = rig();
  life.dispose();
  assert.doesNotThrow(() => emit(reactions, 'bail', { point: new THREE.Vector3(), speed: 5 }));
  assert.equal(reactions.listeners.get('bail').length, 0);
});

test('a bail beside a standing rider: birds freeze for the flinch (no hop), then flee', () => {
  const { life, reactions } = rig();
  const birds = flock(life, new THREE.Vector3(0, 0, -2.6), 3, .45);
  const s = rider(0, 0, 0);
  emit(reactions, 'bail', { point: new THREE.Vector3(0, 0, 0), speed: 5 });
  assert.ok(birds.every(b => b.flinchTime > 0), 'all flinch');
  const start = birds.map(b => b.root.position.clone());
  for (let t = 0; t < .35; t += 1 / 60) {
    life.update(1 / 60, s);
    assert.ok(birds.every(b => b.action !== 'hop'), 'no hop during the flinch');
    assert.equal(flying(life).length, 0, 'no take-off during the flinch');
  }
  birds.forEach((b, i) => assert.ok(b.root.position.distanceTo(start[i]) < .01, 'frozen in place'));
  for (let t = 0; t < .15; t += 1 / 60) life.update(1 / 60, s);
  assert.ok(birds.every(b => b.state === 'alert' || b.state === 'flee'), 'then they flee (within 6 m)');
  life.dispose();
});

test('reduced motion: the roost loop is half as wide and deep, flown in the same 3-5 s', () => {
  const lamps = [lamp(0, 0), lamp(22, 0), lamp(0, 22)];
  const reach = { false: [], true: [] };
  for (let run = 0; run < 12; run++) for (const reducedMotion of [false, true]) {
    const { life, reactions } = rig({ world: 'grand-warehouse', lamps, reducedMotion });
    const s = rider(40, 40, 0);
    life.update(1 / 30, s);
    const bird = perched(life)[0];
    const p = bird.root.position;
    emit(reactions, 'landing', { point: new THREE.Vector3(p.x + 2, 0, p.z), severity: 1, surface: 'concrete' });
    assert.equal(bird.state, 'roost');
    assert.ok(bird.pathLength - bird.flightTime <= 5 + 1e-6 && bird.pathLength >= 2.7, 'still resettles in 3-5 s');
    reach[reducedMotion].push(Math.hypot(bird.pathC1.x - bird.pathStart.x, bird.pathC1.z - bird.pathStart.z));
    reach[reducedMotion].push(bird.pathStart.y - bird.pathC1.y);
    life.dispose();
  }
  const [normal, reduced] = [reach.false, reach.true];
  // Pairs: [horizontal swing, dip]. Normal swing 4-6 m, dip 0.9 m; reduced 2-3 m, 0.45 m.
  for (let i = 0; i < normal.length; i += 2) {
    assert.ok(normal[i] >= 4 - 1e-6 && normal[i] <= 6 + 1e-6, `normal swing ${normal[i]}`);
    assert.ok(Math.abs(normal[i + 1] - .9) < 1e-6, `normal dip ${normal[i + 1]}`);
    assert.ok(reduced[i] >= 2 - 1e-6 && reduced[i] <= 3 + 1e-6, `reduced swing ${reduced[i]}`);
    assert.ok(Math.abs(reduced[i + 1] - .45) < 1e-6, `reduced dip ${reduced[i + 1]}`);
  }
});

test('reduced motion: motes part with half the push and still keep 0.8 m clear', () => {
  const maxOffset = {}, meanOffset = {};
  for (const reducedMotion of [false, true]) {
    const { life } = rig({ reducedMotion });
    const s = rider(0, 0, 12, 0, -12);
    const a = life.motes.geometry.attributes.position.array, base = life.moteBase;
    for (let i = 0; i < WORLD_LIFE.moteCount; i++) {
      base[i * 3] = (Math.random() - .5) * 2; base[i * 3 + 1] = .4 + Math.random(); base[i * 3 + 2] = -Math.random() * 14;
    }
    life.moteCenter.set(0, 0, -6);
    let closest = Infinity, biggest = 0, sum = 0, count = 0;
    for (let frame = 0; frame < 30; frame++) {
      s.position.z -= 12 / 30;
      life.updateMotes(1 / 30, s.position, s);
      for (let i = 0; i < WORLD_LIFE.moteCount; i++) {
        const o = life.moteOffset;
        const m = Math.hypot(o[i * 3], o[i * 3 + 1], o[i * 3 + 2]);
        biggest = Math.max(biggest, m);
        if (m > .05) { sum += m; count++; }
        closest = Math.min(closest, Math.hypot(a[i * 3] - s.position.x, a[i * 3 + 1] - s.position.y - WORLD_LIFE.moteRiderHeight, a[i * 3 + 2] - s.position.z));
      }
    }
    assert.ok(closest >= .8 - 1e-4, `clear of the rider (${closest.toFixed(3)})`);
    maxOffset[reducedMotion] = biggest; meanOffset[reducedMotion] = sum / count;
    life.dispose();
  }
  assert.ok(maxOffset.false > 1.2, `full push reaches ~1.6 m (${maxOffset.false.toFixed(2)})`);
  // Half of the 1.6 m push is 0.8 m (a mote whose drift carried it across the line keeps
  // going the way it was pushed, so it can need ~0.2 m more).
  assert.ok(maxOffset.true <= 1.05, `reduced push stays near half (${maxOffset.true.toFixed(2)})`);
  assert.ok(meanOffset.true <= meanOffset.false * .65, `reduced push is about half on average (${meanOffset.true.toFixed(2)} vs ${meanOffset.false.toFixed(2)})`);
});
