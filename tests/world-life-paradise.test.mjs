import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LifeDirector } from '../src/graphics/life/LifeDirector.js';
import { ParadiseLife } from '../src/graphics/life/ParadiseLife.js';

// A flat park with two flag poles, two string-light spans (4 string poles) and
// wall-edge spots for props. Ground is flat everywhere except a slope patch.
const SPAWN = [0, 0, 0];
const SLOPE = { minX: 30, maxX: 40 }; // x in this band is a ramp (not flat)
const pole = (x, z, h = 3.4) => ({ position: new THREE.Vector3(x, h, z), height: h });
function makeAnchors() {
  return {
    poles: [pole(20, 0), pole(-20, 10)],
    lamps: [],
    strings: [pole(0, 40, 4.4), pole(12, 40, 4.4), pole(-30, -20, 4.4), pole(-30, -32, 4.4)],
  };
}
function makeScan() {
  const edges = [];
  for (let i = 0; i < 30; i++) edges.push({ point: new THREE.Vector3(-14 + i * 1.6, 0, -10), facing: new THREE.Vector3(0, 0, 1) });
  edges.push({ point: new THREE.Vector3(1, 0, 1), facing: new THREE.Vector3(0, 0, 1) }); // too close to spawn
  for (let i = 0; i < 4; i++) edges.push({ point: new THREE.Vector3(32 + i * 2, 0, 5), facing: new THREE.Vector3(0, 0, 1) }); // on the slope
  return { edges, walls: [], floor: [] };
}
const ground = point => {
  if (point.x > SLOPE.minX && point.x < SLOPE.maxX) return { point: new THREE.Vector3(point.x, 0, point.z), normal: new THREE.Vector3(.5, .866, 0) };
  return { point: new THREE.Vector3(point.x, 0, point.z), normal: new THREE.Vector3(0, 1, 0) };
};
const fakeSkater = () => ({
  position: new THREE.Vector3(200, 0, 200), velocity: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1),
  speed: 0, grounded: true, grind: null, bailTime: 0, respawnSerial: 0,
  presentation: { popTime: 0, landingSeverity: 0 }, rider: { ragdoll: { groundImpact: null } },
  audioSurfaceTag: 'concrete', surface: { ground },
});

function rig({ settings = { name: 'high', vfxScale: 1 }, anchors = makeAnchors(), scan = makeScan(), world = 'skate-paradise' } = {}) {
  const plays = [];
  const dressing = { anchors, scan };
  const director = new LifeDirector(null, { mapDressing: dressing });
  director.audio.play = (kind, position, opts) => { plays.push({ kind, position: position.clone(), opts }); return true; };
  director.setQuality(settings);
  const life = new ParadiseLife({ cones: true });
  director.register(life);
  const skater = fakeSkater();
  director.setWorld({ id: world, manifest: { spawn: SPAWN } }, skater);
  const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 500);
  const look = (from, to) => { camera.position.copy(from); camera.lookAt(to); camera.updateMatrixWorld(); };
  look(new THREE.Vector3(200, 2, 205), new THREE.Vector3(200, 1, 200));
  const step = (dt = 1 / 30) => director.update(dt, skater, camera);
  const run = (seconds, dt = 1 / 30, each = null) => { for (let t = 0; t < seconds; t += dt) { step(dt); each?.(); } };
  const ride = (velocity) => { skater.velocity.copy(velocity); skater.speed = velocity.length(); };
  return { director, life, plays, skater, step, run, ride, camera, look, dressing };
}
const riderCenter = skater => skater.position.clone().setY(skater.position.y + .9);
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const perched = life => life.gulls.filter(g => g.state === 'perch');
const flyPoints = life => {
  const out = [];
  for (const swarm of [life.fireflies, life.moths]) {
    const p = swarm.positions;
    for (let i = 0; i < swarm.count; i++) out.push(new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
  }
  return out;
};
const minDistanceToRider = (r) => {
  const c = riderCenter(r.skater), feet = r.skater.position;
  let min = Infinity;
  for (const g of r.life.gulls) if (g.state !== 'hidden') min = Math.min(min, g.root.position.distanceTo(c), g.root.position.distanceTo(feet));
  for (const p of flyPoints(r.life)) min = Math.min(min, p.distanceTo(c));
  for (const prop of r.life.props) min = Math.min(min, horizontal(prop.position, feet));
  return min;
};

test('gulls: at most 5, all perched on distinct pole tops at rest', () => {
  const r = rig();
  r.run(3);
  const visible = r.life.gulls.filter(g => g.state !== 'hidden');
  assert.ok(visible.length >= 1 && visible.length <= 5, `gulls ${visible.length}`);
  assert.equal(perched(r.life).length, visible.length, 'all perched');
  const tops = [...r.dressing.anchors.poles, ...r.dressing.anchors.strings].map(a => a.position);
  const used = new Set();
  for (const g of visible) {
    const top = tops.find(t => t.distanceTo(g.root.position) < .05);
    assert.ok(top, 'stands on a pole top');
    assert.ok(!used.has(top), 'one gull per pole');
    used.add(top);
  }
  assert.equal(r.plays.length, 0, 'no sounds at rest');
});

test('gulls: reduced density keeps at most 3', () => {
  const r = rig({ settings: { name: 'high', vfxScale: .5 } });
  r.run(1);
  assert.ok(r.life.gulls.filter(g => g.state !== 'hidden').length <= 3);
});

test('gulls: anchors arriving after setWorld are used (lazy placement)', () => {
  const anchors = { poles: [], lamps: [], strings: [] };
  const r = rig({ anchors, scan: null });
  r.run(1);
  assert.equal(r.life.gulls.filter(g => g.state !== 'hidden').length, 0);
  r.dressing.anchors = makeAnchors();
  r.dressing.scan = makeScan();
  r.run(1);
  assert.ok(perched(r.life).length >= 1);
  assert.ok(r.life.props.length >= 1);
  assert.ok(r.life.fireflies.count > 0);
});

test('gulls: take off when the rider comes within 9 m, chirp at most once per 3 s, climb to 12-20 m, return to a free perch', () => {
  const r = rig();
  r.run(1);
  const target = perched(r.life)[0];
  assert.ok(target, 'a perched gull');
  const P = target.root.position.clone();
  r.skater.position.set(P.x, 0, P.z + 10.5); // 10.5 m: not yet
  r.run(.5);
  assert.equal(target.state, 'perch');
  r.skater.position.set(P.x, 0, P.z + 8.5);
  r.run(.2);
  assert.notEqual(target.state, 'perch', 'took off');
  assert.equal(r.plays.filter(p => p.kind === 'chirp').length, 1);
  // A second gull scared within 3 s: no second chirp.
  const second = perched(r.life).find(g => horizontal(g.root.position, P) > 14);
  assert.ok(second);
  r.skater.position.set(second.root.position.x, 0, second.root.position.z + 8);
  r.run(.5);
  assert.notEqual(second.state, 'perch');
  assert.equal(r.plays.filter(p => p.kind === 'chirp').length, 1, 'chirp rate limited');
  r.skater.position.set(200, 0, 200);
  let maxAlt = 0, landed = false;
  for (let t = 0; t < 35 && !landed; t += 1 / 30) {
    r.step();
    maxAlt = Math.max(maxAlt, target.root.position.y);
    if (t > 2) landed = target.state === 'perch';
  }
  assert.ok(maxAlt >= 11 && maxAlt <= 21, `altitude ${maxAlt.toFixed(1)}`);
  assert.ok(landed, 'back on a perch');
  const others = r.life.gulls.filter(g => g !== target && g.state === 'perch');
  for (const g of others) assert.ok(g.root.position.distanceTo(target.root.position) > .05, 'free perch');
});

test('gulls: grindStart or landing within 14 m scares them; far events do not', () => {
  const r = rig();
  r.run(1);
  const reactions = r.director.reactions;
  const before = perched(r.life).length;
  reactions.payloads.grindStart.point.set(80, 0, 80);
  reactions.emit('grindStart');
  r.run(.6);
  assert.equal(perched(r.life).length, before, 'far grind ignored');
  reactions.payloads.landing.point.set(20, 0, 12);
  reactions.payloads.landing.severity = .4;
  reactions.emit('landing');
  r.run(.6);
  const pole = r.life.gulls.find(g => horizontal(g.root.position, new THREE.Vector3(20, 0, 0)) < 1 && g.state === 'perch');
  assert.ok(!pole, 'gull at (20,0) took off after a landing 12 m away');
  const r2 = rig();
  r2.run(1);
  r2.director.reactions.payloads.grindStart.point.set(-20, 0, 23);
  r2.director.reactions.emit('grindStart');
  r2.run(.6);
  assert.ok(perched(r2.life).length < perched(r.life).length + 5);
  assert.ok(!r2.life.gulls.some(g => g.state === 'perch' && horizontal(g.root.position, new THREE.Vector3(-20, 0, 10)) < .1));
});

test('fireflies and moths: at most 60 points (30 at half density), all finite', () => {
  const r = rig();
  r.run(1);
  const total = r.life.fireflies.count + r.life.moths.count;
  assert.ok(total > 0 && total <= 60, `points ${total}`);
  for (const p of flyPoints(r.life)) assert.ok(Number.isFinite(p.x + p.y + p.z));
  const half = rig({ settings: { name: 'high', vfxScale: .5 } });
  half.run(1);
  assert.ok(half.life.fireflies.count + half.life.moths.count <= 30);
});

test('fireflies scatter from a fast rider, stay 1.2 m clear, and drift back within ~3 s', () => {
  const r = rig();
  r.run(1);
  // Ride along the first string span (0,40)-(12,40) at fireflies height.
  const homes = flyPoints(r.life);
  r.skater.position.set(-6, 0, 40);
  r.ride(new THREE.Vector3(8, 0, 0));
  let min = Infinity, moved = 0;
  for (let t = 0; t < 2.5; t += 1 / 30) {
    r.skater.position.x += 8 / 30;
    r.step();
    min = Math.min(min, ...flyPoints(r.life).map(p => p.distanceTo(riderCenter(r.skater))));
  }
  const after = flyPoints(r.life);
  for (let i = 0; i < after.length; i++) moved = Math.max(moved, r.life.offsetLength(i));
  assert.ok(min >= 1.2 - 1e-6, `min ${min.toFixed(2)}`);
  assert.ok(moved > .3, 'some points were pushed');
  r.skater.position.set(200, 0, 200);
  r.ride(new THREE.Vector3());
  r.run(3.2);
  let rest = 0;
  for (let i = 0; i < homes.length; i++) rest = Math.max(rest, r.life.offsetLength(i));
  assert.ok(rest < .15, `drifted back (${rest.toFixed(2)})`);
});

test('a slow rider does not scatter fireflies', () => {
  const r = rig();
  r.run(1);
  r.skater.position.set(6, 0, 38);
  r.ride(new THREE.Vector3(2, 0, 0));
  r.run(1);
  let moved = 0;
  for (let i = 0; i < r.life.fireflies.count; i++) moved = Math.max(moved, r.life.offsetLength(i));
  assert.ok(moved < .6, `slow rider barely moves them (${moved.toFixed(2)})`);
});

test('props: deterministic, max 8 (4 at half density), flat ground, >= 2.5 m from spawn and >= 3 m apart', () => {
  const a = rig(), b = rig();
  a.run(.2); b.run(.2);
  assert.ok(a.life.props.length >= 2 && a.life.props.length <= 8, `props ${a.life.props.length}`);
  assert.deepEqual(a.life.props.map(p => [p.kind, p.home.x, p.home.z]), b.life.props.map(p => [p.kind, p.home.x, p.home.z]));
  assert.ok(a.life.props.some(p => p.kind === 'can') && a.life.props.some(p => p.kind === 'cone'));
  for (const p of a.life.props) {
    assert.ok(Math.hypot(p.home.x - SPAWN[0], p.home.z - SPAWN[2]) >= 2.5);
    assert.ok(!(p.home.x > SLOPE.minX && p.home.x < SLOPE.maxX), 'flat ground only');
    for (const q of a.life.props) if (q !== p) assert.ok(horizontal(p.home, q.home) >= 3 - 1e-6);
  }
  const half = rig({ settings: { name: 'high', vfxScale: .5 } });
  half.run(.2);
  assert.ok(half.life.props.length <= 4);
});

test('a can tumbles once per pass (clink), slides away from the rider, and goes home after 25 s unseen', () => {
  const r = rig();
  r.run(.2);
  const can = r.life.props.find(p => p.kind === 'can');
  assert.ok(can);
  const home = can.home.clone();
  // Pass 0.5 m beside it at 6 m/s along +x.
  r.skater.position.set(home.x - 8, 0, home.z + .5);
  r.ride(new THREE.Vector3(6, 0, 0));
  let min = Infinity;
  for (let t = 0; t < 3; t += 1 / 30) {
    r.skater.position.x += 6 / 30;
    r.step();
    min = Math.min(min, horizontal(can.position, r.skater.position));
  }
  assert.equal(r.plays.filter(p => p.kind === 'clink' && p.position.distanceTo(home) < .5).length, 1, 'one clink from this can');
  assert.ok(can.tumbles === 1, 'tumbled once');
  assert.ok(min >= 1.2 - 1e-6, `kept clear (${min.toFixed(2)})`);
  assert.ok(horizontal(can.position, home) > .4, 'slid off its spot');
  assert.ok(can.position.z < home.z, 'away from the rider side');
  assert.ok(can.position.z >= home.z - .7 - 1e-6, 'never through the wall behind it (edge facing +z, 0.9 m out)');
  // Rider leaves, the can rests; while watched it stays put.
  r.skater.position.set(200, 0, 200);
  r.ride(new THREE.Vector3());
  r.look(home.clone().add(new THREE.Vector3(0, 3, 8)), home);
  r.run(27, .05); // the director clamps dt to 0.05
  assert.ok(horizontal(can.position, home) > .4, 'not reset while seen');
  r.look(new THREE.Vector3(200, 2, 205), new THREE.Vector3(200, 1, 200));
  r.run(1, .05);
  assert.ok(horizontal(can.position, home) < 1e-6, 'home when unseen');
  assert.equal(can.state, 'rest');
});

test('a cone thuds; a slow approach still keeps it 1.2 m clear', () => {
  const r = rig();
  r.run(.2);
  const cone = r.life.props.find(p => p.kind === 'cone');
  assert.ok(cone);
  r.skater.position.set(cone.home.x - 4, 0, cone.home.z);
  r.ride(new THREE.Vector3(8, 0, 0));
  for (let t = 0; t < 1.5; t += 1 / 30) { r.skater.position.x += 8 / 30; r.step(); }
  assert.equal(r.plays.filter(p => p.kind === 'thud' && p.position.distanceTo(cone.home) < .5).length, 1);
  const c2 = rig();
  c2.run(.2);
  const cone2 = c2.life.props.find(p => p.kind === 'cone');
  c2.skater.position.set(cone2.home.x - 3, 0, cone2.home.z);
  c2.ride(new THREE.Vector3(1, 0, 0));
  let min = Infinity;
  for (let t = 0; t < 4; t += 1 / 30) {
    c2.skater.position.x += 1 / 30; c2.step();
    min = Math.min(min, horizontal(cone2.position, c2.skater.position));
  }
  assert.ok(min >= 1.2 - 1e-6, `slow push keeps clear (${min.toFixed(2)})`);
});

test('nothing spawns within 1.2 m of the rider and stays clear while riding around', () => {
  const r = rig();
  // Rider stands on a prop spot and right under a pole top before anything is placed.
  r.skater.position.set(-14 + 1.6 * 3, 0, -10);
  r.step();
  assert.ok(minDistanceToRider(r) >= 1.2 - 1e-6, `spawned clear (${minDistanceToRider(r).toFixed(2)})`);
  const path = t => new THREE.Vector3(Math.sin(t * .3) * 25, 0, Math.cos(t * .21) * 30);
  let t = 0, min = Infinity;
  for (let i = 0; i < 900; i++) {
    t += 1 / 30;
    const next = path(t);
    r.ride(next.clone().sub(r.skater.position).multiplyScalar(30));
    r.skater.position.copy(next);
    r.step();
    min = Math.min(min, minDistanceToRider(r));
  }
  assert.ok(min >= 1.2 - 1e-6, `min ${min.toFixed(2)}`);
});

test('setWorld twice clears agents and keeps the same children; other parks stay empty', () => {
  const r = rig();
  const children = () => { let n = 0; r.life.root.traverse(() => n++); return n; };
  const before = children();
  r.run(1);
  r.skater.position.set(20, 0, 8);
  r.run(.5);
  r.director.setWorld({ id: 'orbit', manifest: { spawn: SPAWN } });
  assert.equal(r.life.root.parent, null, 'removed on orbit');
  assert.ok(r.life.gulls.every(g => g.state === 'hidden'));
  assert.equal(r.life.props.length, 0);
  assert.equal(r.life.fireflies.count + r.life.moths.count, 0);
  r.run(1);
  assert.equal(r.life.gulls.filter(g => g.state !== 'hidden').length, 0, 'no update on orbit');
  r.director.setWorld({ id: 'grand-warehouse', manifest: { spawn: SPAWN } });
  r.run(1);
  assert.equal(r.life.props.length, 0);
  r.director.setWorld({ id: 'skate-paradise', manifest: { spawn: SPAWN } });
  r.director.setWorld({ id: 'skate-paradise', manifest: { spawn: SPAWN } });
  r.skater.position.set(200, 0, 200);
  r.run(1);
  assert.equal(children(), before, 'same scene-graph size');
  assert.ok(perched(r.life).length >= 1);
});

test('performance preset hides everything and does no work; switching back restores', () => {
  const r = rig();
  r.run(1);
  r.director.setQuality({ name: 'performance' });
  assert.equal(r.life.root.visible, false);
  assert.equal(r.director.root.visible, false);
  assert.ok(r.life.gulls.every(g => g.state === 'hidden'));
  r.skater.position.set(20, 0, 5);
  r.run(1);
  r.director.reactions.payloads.grindStart.point.set(20, 0, 2);
  r.director.reactions.emit('grindStart');
  assert.equal(r.plays.length, 0);
  assert.equal(r.life.props.length, 0);
  r.director.setQuality({ name: 'high', vfxScale: 1 });
  r.skater.position.set(200, 0, 200);
  r.run(1);
  assert.equal(r.life.root.visible, true);
  assert.ok(perched(r.life).length >= 1);
  assert.ok(r.life.props.length >= 1);
});

test('reduced motion halves the tumble slide', () => {
  const slide = reduced => {
    const r = rig();
    r.director.reducedMotion = reduced;
    r.run(.2);
    const can = r.life.props.find(p => p.kind === 'can');
    r.skater.position.set(can.home.x - 8, 0, can.home.z + .5);
    r.ride(new THREE.Vector3(6, 0, 0));
    for (let t = 0; t < 3; t += 1 / 30) { r.skater.position.x += 6 / 30; r.step(); }
    return horizontal(can.position, can.home);
  };
  const full = slide(false), half = slide(true);
  assert.ok(half < full * .75, `reduced ${half.toFixed(2)} vs ${full.toFixed(2)}`);
});

test('materials exist from construction (shader warm-up) and dispose unsubscribes', () => {
  const life = new ParadiseLife({ cones: true });
  const materials = new Set();
  life.root.traverse(o => { if (o.material) materials.add(o.material); });
  assert.ok(materials.size >= 4, `materials ${materials.size}`);
  const r = rig();
  r.life.dispose();
  r.director.reactions.payloads.grindStart.point.set(20, 0, 2);
  r.director.reactions.emit('grindStart');
  assert.equal(r.plays.length, 0);
});
