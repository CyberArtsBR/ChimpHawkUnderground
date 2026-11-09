import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LifeDirector } from '../src/graphics/life/LifeDirector.js';
import { OrbitLife, ORBIT_LIFE } from '../src/graphics/life/OrbitLife.js';
import { MapAmbience, AMBIENCE } from '../src/graphics/MapAmbience.js';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { WorldReactions } from '../src/graphics/life/WorldReactions.js';

// A flat Orbit-like deck at y = 0 sampled every 3 m (MapScan lattice), with a
// raised ramp deck (y = 2) in the RAMP box and a few sky-dome hits far below.
const RAMP = { minX: 20, maxX: 35, minZ: -10, maxZ: 10 };
const inRamp = (x, z, margin = 0) => x > RAMP.minX - margin && x < RAMP.maxX + margin && z > RAMP.minZ - margin && z < RAMP.maxZ + margin;
function makeScan() {
  const floor = [];
  for (let x = -58.5; x < 60; x += 3) for (let z = -58.5; z < 60; z += 3) {
    floor.push({ point: new THREE.Vector3(x, inRamp(x, z) ? 2 : 0, z), normal: new THREE.Vector3(0, 1, 0) });
  }
  for (let i = 0; i < 5; i++) floor.push({ point: new THREE.Vector3(80 + i * 3, -894.6, 80), normal: new THREE.Vector3(0, 1, 0) });
  return { walls: [], edges: [], floor, bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 } };
}
const ground = point => inRamp(point.x, point.z)
  ? { point: new THREE.Vector3(point.x, 2, point.z), normal: new THREE.Vector3(0, 1, 0) }
  : { point: new THREE.Vector3(point.x, 0, point.z), normal: new THREE.Vector3(0, 1, 0) };
const fakeSkater = () => ({
  position: new THREE.Vector3(-50, 0, 50), velocity: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1),
  normal: new THREE.Vector3(0, 1, 0), speed: 0, grounded: true, grind: null, wallRide: null, bailTime: 0, respawnSerial: 0,
  presentation: { popTime: 0, landingSeverity: 0 }, rider: { ragdoll: { groundImpact: null } },
  audioSurfaceTag: 'concrete', surface: { ground },
});

function rig({ settings = { name: 'high', vfxScale: 1 }, scan = makeScan(), world = 'orbit' } = {}) {
  const plays = [], stops = [];
  const dressing = { anchors: { poles: [], lamps: [], strings: [] }, scan };
  const director = new LifeDirector(null, { mapDressing: dressing });
  let time = 0;
  director.audio.play = (kind, position, opts) => { plays.push({ kind, position: position.clone(), opts, time }); return true; };
  const stop = director.audio.stop.bind(director.audio);
  director.audio.stop = kind => { stops.push(kind); stop(kind); };
  director.setQuality(settings);
  const life = new OrbitLife();
  director.register(life);
  const skater = fakeSkater();
  director.setWorld({ id: world, manifest: { spawn: [10, .15, 36] } }, skater);
  const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 500);
  // Follow camera: 9 m behind the travel heading, 4.5 m up, looking at the rider.
  const cam = { yaw: 0 };
  const place = () => {
    const p = skater.position;
    camera.position.set(p.x - Math.sin(cam.yaw) * 9, p.y + 4.5, p.z - Math.cos(cam.yaw) * 9);
    camera.lookAt(p.x, p.y + 1, p.z);
    camera.updateMatrixWorld();
  };
  place();
  const step = (dt = 1 / 60) => { time += dt; director.update(dt, skater, camera); };
  const run = (seconds, dt = 1 / 60, each = null) => { for (let t = 0; t < seconds - 1e-9; t += dt) { each?.(dt); step(dt); } };
  return { director, life, plays, stops, skater, step, run, camera, cam, place, dressing, get time() { return time; } };
}
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const liveBots = life => life.bots.filter(b => b.state !== 'hidden');
const tileTranslations = life => {
  const out = [], m = new THREE.Matrix4(), p = new THREE.Vector3();
  for (let i = 0; i < life.tileMesh.count; i++) { life.tileMesh.getMatrixAt(i, m); out.push(p.setFromMatrixPosition(m).clone()); }
  return out;
};
function segmentDistance(p, a, b) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

// ----------------------------------------------------------- glowing tiles
test('the tile pitch matches the Orbit floor finish grid (4 m cells on world multiples of 4)', async () => {
  const fs = await import('node:fs');
  const finish = fs.readFileSync(new URL('../src/graphics/FloorFinish.js', import.meta.url), 'utf8');
  assert.match(finish, /vec2 cell = vFinishWorld\.xz \/ 4\.;/, 'orbit-floor seams are every 4 m from the world origin');
  assert.equal(ORBIT_LIFE.tileSize, 4);
});

test('tiles: riding the floor lights the grid cell under the trucks once per entry, aligned to the grid', () => {
  const r = rig();
  const lit = [];
  const light = r.life.lightCell.bind(r.life);
  r.life.lightCell = (ix, iz) => { lit.push(`${ix},${iz}`); return light(ix, iz); };
  r.skater.position.set(1, 0, 1);
  r.skater.velocity.set(0, 0, -8); r.skater.speed = 8;
  r.run(3, 1 / 60, dt => { r.skater.position.z -= 8 * dt; });
  assert.deepEqual(lit, ['0,0', '0,-1', '0,-2', '0,-3', '0,-4', '0,-5', '0,-6']);
  const tiles = tileTranslations(r.life);
  assert.ok(tiles.length >= 1 && tiles.length <= 7);
  for (const p of tiles) {
    assert.ok(Math.abs(((p.x - 2) / 4) - Math.round((p.x - 2) / 4)) < 1e-6, `x ${p.x} is a cell centre`);
    assert.ok(Math.abs(((p.z - 2) / 4) - Math.round((p.z - 2) / 4)) < 1e-6, `z ${p.z} is a cell centre`);
    assert.ok(Math.abs(p.y - ORBIT_LIFE.tileLift) < 1e-6, 'lifted 1 cm above the floor');
  }
  assert.ok(tiles.some(p => p.x === 2 && p.z === -22), 'the current cell is lit');
});

test('tiles: nothing lights in the air, on a slope, grinding, wall-riding or above the floor level; re-entry lights again', () => {
  const r = rig();
  let lights = 0;
  const light = r.life.lightCell.bind(r.life);
  r.life.lightCell = (ix, iz) => { lights++; return light(ix, iz); };
  r.skater.position.set(-10, 0, -10);
  const drive = () => r.run(1, 1 / 60, dt => { r.skater.position.x += 6 * dt; });
  r.skater.grounded = false; drive();
  r.skater.grounded = true; r.skater.normal.set(.5, .866, 0); drive();
  r.skater.normal.set(0, 1, 0); r.skater.grind = {}; drive();
  r.skater.grind = null; r.skater.wallRide = {}; drive();
  r.skater.wallRide = null; r.skater.position.y = 2; drive();
  assert.equal(lights, 0);
  r.skater.position.set(-10, 0, -10);
  r.step();
  assert.equal(lights, 1, 'entering a cell lights it');
  r.skater.grounded = false; r.run(.2);
  r.skater.grounded = true; r.step();
  assert.equal(lights, 2, 'landing back in the same cell is a new entry');
});

test('tiles: the pool is capped at 48 (24 at half density), recycles the oldest, and fades out over 0.8 s', () => {
  for (const [settings, cap] of [[{ name: 'high', vfxScale: 1 }, 48], [{ name: 'high', vfxScale: .5 }, 24]]) {
    const r = rig({ settings });
    assert.equal(r.life.tileMesh.instanceMatrix.count, ORBIT_LIFE.tileMax, 'one fixed pool');
    let max = 0;
    for (let i = 0; i < 100; i++) { // 100 distinct cells in 0.42 s, rows of 26
      r.skater.position.set(-58 + (i % 26) * 4.5, 0, 1 + 4 * Math.floor(i / 26));
      r.step(1 / 240);
      max = Math.max(max, r.life.tileMesh.count);
      assert.ok(r.life.tileMesh.count <= cap);
    }
    assert.equal(max, cap, 'fills the pool, then recycles');
    const p = r.skater.position;
    const cell = new THREE.Vector3(Math.floor(p.x / 4) * 4 + 2, ORBIT_LIFE.tileLift, Math.floor(p.z / 4) * 4 + 2);
    assert.ok(tileTranslations(r.life).some(p => p.distanceTo(cell) < 1e-6), 'the newest cell is live');
    r.skater.grounded = false;
    r.run(.85);
    assert.equal(r.life.tileMesh.count, 0, 'all faded');
  }
});

// ---------------------------------------------------------- landing ripple
function land(r, severity, at = new THREE.Vector3(-10, 0, -10)) {
  r.skater.position.copy(at);
  r.skater.grounded = false; r.step();
  r.skater.presentation.landingSeverity = severity;
  r.skater.grounded = true; r.step();
}
test('landing ripple: one ring per floor landing expands to 4 m x severity over 0.7 s; at most 4 live', () => {
  const r = rig();
  r.run(.2);
  land(r, .6);
  assert.equal(r.life.rippleMesh.count, 1);
  let maxRadius = 0, alive = 0;
  r.run(.8, 1 / 60, () => { if (r.life.rippleMesh.count) { alive += 1 / 60; maxRadius = Math.max(maxRadius, r.life.ripples[0].radius); } });
  assert.ok(maxRadius <= 4 * .6 + 1e-6 && maxRadius > 2, `radius ${maxRadius}`);
  assert.ok(alive > .6 && alive < .75, `lived ${alive}`);
  assert.equal(r.life.rippleMesh.count, 0);
  for (let i = 0; i < 6; i++) { land(r, 1, new THREE.Vector3(-10 + i * 5, 0, -10)); assert.ok(r.life.rippleMesh.count <= ORBIT_LIFE.rippleMax); }
  assert.equal(r.life.rippleMesh.count, 4);
  assert.equal(r.life.rippleMesh.instanceMatrix.count, 4);
});

test('landing ripple: none on a slope or off the floor; reduced motion halves its size and speed', () => {
  const r = rig();
  r.skater.normal.set(.5, .866, 0); land(r, .8);
  r.skater.normal.set(0, 1, 0); land(r, .8, new THREE.Vector3(25, 2, 0));
  assert.equal(r.life.rippleMesh.count, 0);
  const reduced = rig();
  reduced.director.reducedMotion = true;
  land(reduced, 1);
  let maxRadius = 0, alive = 0;
  reduced.run(1.6, 1 / 60, () => { if (reduced.life.rippleMesh.count) { alive += 1 / 60; maxRadius = Math.max(maxRadius, reduced.life.ripples[0].radius); } });
  assert.ok(maxRadius <= 2 + 1e-6, `radius ${maxRadius}`);
  assert.ok(alive > 1.3, `lived ${alive}`);
});

// --------------------------------------------------------------- hover bots
test('hover bots: at most 4 (2 at half density), over open floor at 1.2-2.2 m, wandering lazily', () => {
  for (const [settings, cap] of [[{ name: 'high', vfxScale: 1 }, 4], [{ name: 'high', vfxScale: .5 }, 2]]) {
    const r = rig({ settings });
    r.run(.5);
    const bots = liveBots(r.life);
    assert.ok(bots.length >= 1 && bots.length <= cap, `bots ${bots.length}`);
    const start = bots.map(b => b.position.clone());
    let moved = 0;
    r.run(20, 1 / 30, () => {
      for (const b of liveBots(r.life)) {
        assert.ok(b.position.y >= 1.2 - 1e-6 && b.position.y <= 2.2 + 1e-6, `height ${b.position.y}`);
        assert.ok(!inRamp(b.position.x, b.position.z, 1), `over the ramp at ${b.position.x},${b.position.z}`);
      }
      bots.forEach((b, i) => { moved = Math.max(moved, horizontal(b.position, start[i])); });
    });
    assert.ok(moved > 1, 'they wander');
  }
});

test('hover bots: a rider within 4 m makes one dart 3-5 m away with a beep, at most one beep per 2 s per bot', () => {
  const r = rig();
  r.run(.5);
  const bot = liveBots(r.life)[0];
  const start = bot.position.clone();
  r.skater.position.set(start.x + 3.5, 0, start.z);
  r.step();
  assert.equal(bot.state, 'dart');
  const beep = r.plays.find(p => p.kind === 'beep');
  assert.ok(beep && beep.position.distanceTo(start) < .5, 'beeps at the bot');
  r.run(.8);
  const moved = horizontal(bot.position, start);
  assert.ok(moved >= 2.9 && moved <= 5.2, `darted ${moved}`);
  assert.ok(horizontal(bot.position, r.skater.position) > 4, 'away from the rider');
  // Chase it for 6 s: it keeps darting, but each bot's beeps stay >= 2 s apart.
  const beeps = new Map(), darts = new Map();
  const dart = r.life.dart.bind(r.life);
  r.life.dart = (b, skater) => {
    const before = r.plays.length;
    dart(b, skater);
    darts.set(b.index, (darts.get(b.index) || 0) + 1);
    if (r.plays.length > before) beeps.set(b.index, [...(beeps.get(b.index) || []), r.time]);
  };
  r.run(6, 1 / 60, () => {
    const away = bot.position.clone().sub(r.skater.position).setY(0);
    if (away.lengthSq() < 1e-6) away.set(1, 0, 0);
    r.skater.position.copy(bot.position).setY(0).addScaledVector(away.normalize(), -2.5);
  });
  assert.ok(darts.get(bot.index) >= 4, `darts ${darts.get(bot.index)}`);
  const mine = beeps.get(bot.index) || [];
  assert.ok(mine.length >= 2 && mine.length <= 3, `beeps ${mine}`);
  for (const times of beeps.values()) for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 2 - 1e-6, `rate limited ${times}`);
});

test('hover bots: never within 1.2 m of the rider while riding straight through and circling them', () => {
  const r = rig();
  r.run(.5);
  let min = Infinity;
  const check = () => { for (const b of liveBots(r.life)) min = Math.min(min, horizontal(b.position, r.skater.position)); };
  for (const bot of liveBots(r.life)) {
    const target = bot.position.clone().setY(0);
    r.skater.position.copy(target).add(new THREE.Vector3(-12, 0, .3));
    r.skater.velocity.set(10, 0, 0); r.skater.speed = 10;
    r.run(2.4, 1 / 60, dt => { r.skater.position.x += 10 * dt; check(); });
    const c = bot.position.clone().setY(0);
    r.skater.velocity.set(0, 0, 0); r.skater.speed = 4;
    r.run(4, 1 / 60, () => { const a = r.time * 2; r.skater.position.set(c.x + Math.cos(a) * 1.5, 0, c.z + Math.sin(a) * 1.5); check(); });
  }
  assert.ok(min >= ORBIT_LIFE.riderClear - 1e-6, `min ${min}`);
});

test('hover bots: with no open floor at dart range the dart is shortened or skipped, never an unchecked path', () => {
  const setup = openRadius => {
    const r = rig();
    r.run(.5);
    const bot = liveBots(r.life)[0];
    const start = bot.position.clone();
    // Only a disc of `openRadius` round the bot counts as open floor.
    r.life.isOpen = (x, z) => Math.hypot(x - start.x, z - start.z) <= openRadius;
    const results = [];
    const dart = r.life.dart.bind(r.life);
    r.life.dart = (b, skater) => { const ok = dart(b, skater); if (b === bot) results.push(ok); return ok; };
    r.skater.position.set(start.x + 3.5, 0, start.z);
    return { r, bot, start, results };
  };
  // Nothing open beyond the bot's own spot: it stays (the rider clamp still holds), no beep.
  const none = setup(.3);
  let maxDart = 0;
  none.r.run(2, 1 / 60, () => { if (none.bot.state === 'dart') maxDart = 1; });
  assert.ok(none.results.length >= 2 && none.results.every(ok => !ok), `darts ${none.results}`);
  assert.equal(maxDart, 0, 'never darted');
  assert.equal(none.r.plays.filter(p => p.kind === 'beep').length, 0);
  // Open only within 2.6 m: the dart is cut to half its 3-5 m and stays on open floor.
  const half = setup(2.6);
  half.r.step();
  assert.deepEqual(half.results, [true]);
  half.r.run(.75);
  const moved = horizontal(half.bot.position, half.start);
  assert.ok(moved >= 1.4 && moved <= 2.6, `half dart ${moved}`);
});

// ---------------------------------------------------------------- REC drone
test('REC drone: opposite the camera 5-7 m out and 3-4 m up, blinking red ~1 Hz, never within 1.5 m of the camera-rider segment', () => {
  const r = rig();
  const drone = r.life.drone;
  let heading = 0, minSegment = Infinity, minRider = Infinity, blinks = 0, wasOn = null;
  const settle = [];
  // A scripted lap: straight runs, a long carve, a 180 reversal, a camera
  // orbit all the way round, a sudden camera flip and an ollie to 3 m.
  const script = t => {
    if (t < 4) return { turn: 0 };
    if (t < 8) return { turn: .6 };
    if (t < 9) return { turn: 3.1 };
    if (t < 12) return { turn: 0, orbit: 2.1 };
    if (t < 12.05) return { turn: 0, flip: true };
    if (t < 16) return { turn: -.4, air: Math.max(0, Math.sin((t - 12.05) / 1.2 * Math.PI)) * 3 };
    return { turn: 0 };
  };
  let flipped = false;
  for (let t = 0; t < 20; t += 1 / 60) {
    const s = script(t), dt = 1 / 60;
    heading += s.turn * dt;
    r.skater.velocity.set(Math.sin(heading) * 7, 0, Math.cos(heading) * 7); r.skater.speed = 7;
    r.skater.position.x = THREE.MathUtils.clamp(r.skater.position.x + r.skater.velocity.x * dt, -55, 55);
    r.skater.position.z = THREE.MathUtils.clamp(r.skater.position.z + r.skater.velocity.z * dt, -55, 55);
    r.skater.position.y = s.air || 0;
    if (s.orbit) r.cam.yaw += s.orbit * dt;
    else if (s.flip && !flipped) { r.cam.yaw += Math.PI; flipped = true; }
    else r.cam.yaw += Math.atan2(Math.sin(heading - r.cam.yaw), Math.cos(heading - r.cam.yaw)) * Math.min(1, dt * 2.5);
    r.place();
    r.step(dt);
    if (!drone.root.visible) continue;
    const p = drone.root.position, rider = r.skater.position;
    const centre = rider.clone().setY(rider.y + .9);
    minSegment = Math.min(minSegment, segmentDistance(p, r.camera.position, centre), segmentDistance(p, r.camera.position, rider));
    minRider = Math.min(minRider, p.distanceTo(centre));
    if (t > 2 && t < 4) settle.push({ horizontal: horizontal(p, rider), up: p.y - rider.y, far: p.clone().sub(rider).setY(0).dot(rider.clone().sub(r.camera.position).setY(0)) });
    const on = drone.lightOn;
    if (wasOn === false && on) blinks++;
    wasOn = on;
  }
  assert.ok(minSegment >= ORBIT_LIFE.droneSegmentClear, `segment clearance ${minSegment}`);
  assert.ok(minRider >= ORBIT_LIFE.riderClear, `rider clearance ${minRider}`);
  assert.ok(settle.length > 50);
  for (const s of settle) {
    assert.ok(s.horizontal >= 5 - .25 && s.horizontal <= 7 + .25, `distance ${s.horizontal}`);
    assert.ok(s.up >= 3 - .05 && s.up <= 4 + .05, `height ${s.up}`);
    assert.ok(s.far > 0, 'beyond the rider, seen from the camera');
  }
  assert.ok(blinks >= 18 && blinks <= 22, `blinks in 20 s: ${blinks}`);
});

test('REC drone is silent (the re-triggered hum was dropped: audible seams)', () => {
  const r = rig();
  r.run(6);
  r.skater.velocity.set(8, 0, 0); r.skater.speed = 8;
  r.run(4, 1 / 60, dt => { r.skater.position.x += 8 * dt; r.place(); });
  assert.equal(r.plays.filter(p => p.kind === 'hum').length, 0);
});

// ---------------------------------------------------------------- lifecycle
test('only Orbit: setWorld twice keeps the same children; other parks get nothing', () => {
  const r = rig();
  assert.deepEqual(r.life.parks, ['orbit']);
  const children = () => { let n = 0; r.life.root.traverse(() => n++); return n; };
  const before = children();
  r.skater.position.set(-10, 0, -10);
  r.run(1, 1 / 60, dt => { r.skater.position.x += 6 * dt; });
  land(r, .7);
  assert.ok(r.life.tileMesh.count > 0 && r.life.rippleMesh.count > 0 && liveBots(r.life).length > 0 && r.life.drone.root.visible);
  r.director.setWorld({ id: 'skate-paradise', manifest: { spawn: [0, 0, 0] } });
  assert.equal(r.life.root.parent, null);
  assert.equal(r.life.tileMesh.count + r.life.rippleMesh.count, 0);
  assert.equal(liveBots(r.life).length, 0);
  assert.equal(r.life.drone.root.visible, false);
  assert.ok(r.stops.some(kind => kind == null), 'the director silenced every life voice');
  assert.ok(!r.stops.includes('beep'), "reset leaves other modules' beeps alone");
  r.run(1);
  assert.equal(r.life.tileMesh.count, 0, 'no update off Orbit');
  r.director.setWorld({ id: 'grand-warehouse', manifest: { spawn: [0, 0, 0] } });
  assert.equal(r.life.root.parent, null);
  r.director.setWorld({ id: 'orbit', manifest: { spawn: [10, .15, 36] } });
  r.director.setWorld({ id: 'orbit', manifest: { spawn: [10, .15, 36] } });
  r.skater.position.set(-50, 0, 50);
  r.run(1);
  assert.equal(children(), before, 'same scene-graph size');
  assert.ok(liveBots(r.life).length > 0 && r.life.drone.root.visible);
});

test('performance preset hides everything and does no work; switching back restores', () => {
  const r = rig();
  r.run(1);
  r.director.setQuality({ name: 'performance' });
  assert.equal(r.life.root.visible, false);
  assert.equal(liveBots(r.life).length, 0);
  assert.equal(r.life.drone.root.visible, false);
  r.plays.length = 0;
  r.skater.position.set(-10, 0, -10);
  r.life.update(1 / 60, r.skater, r.camera, r.director.refreshContext(r.skater));
  land(r, .8);
  assert.equal(r.life.tileMesh.count + r.life.rippleMesh.count, 0);
  assert.equal(r.plays.length, 0);
  r.director.setQuality({ name: 'high', vfxScale: 1 });
  r.skater.position.set(-50, 0, 50);
  r.run(1);
  assert.equal(r.life.root.visible, true);
  assert.ok(liveBots(r.life).length > 0 && r.life.drone.root.visible);
});

test('bots wait for the async scan, and nothing appears within 1.2 m of the rider', () => {
  const r = rig({ scan: null });
  r.run(1);
  assert.equal(liveBots(r.life).length, 0);
  assert.equal(r.life.tileMesh.count, 0, 'no floor level known yet');
  const bot0 = makeScan().floor.find(f => f.point.y === 0);
  r.skater.position.set(bot0.point.x, 0, bot0.point.z);
  r.dressing.scan = makeScan();
  r.step();
  for (const b of liveBots(r.life)) assert.ok(horizontal(b.position, r.skater.position) >= 6, 'placed away from the rider');
});

test('materials and meshes exist from construction (shader warm-up); dispose unsubscribes', () => {
  const life = new OrbitLife();
  const materials = new Set();
  life.root.traverse(o => { if (o.material) materials.add(o.material); });
  assert.ok(materials.size >= 5, `materials ${materials.size}`);
  for (const mesh of [life.tileMesh, life.rippleMesh, life.botMesh]) {
    assert.ok(mesh.isInstancedMesh && mesh.instanceColor, `${mesh.name} has per-instance colour`);
    assert.equal(mesh.count, 0);
  }
  assert.equal(life.tileMesh.material.depthWrite, false);
  assert.equal(life.tileMesh.material.blending, THREE.AdditiveBlending);
  assert.equal(life.tileMesh.material.polygonOffset, true);
  const r = rig();
  r.life.dispose();
  land(r, .9);
  assert.equal(r.life.ripples.filter(x => x.alive).length, 0);
});

// ------------------------------------------------------------- MapAmbience
const ambienceSkater = (x = 0, z = 0) => ({ position: new THREE.Vector3(x, 0, z), velocity: new THREE.Vector3(), speed: 0, grounded: true });

function hologramRig() {
  const ambience = new MapAmbience(null);
  const reactions = new WorldReactions();
  ambience.setLifeContext({ reactions, reducedMotion: false });
  ambience.setWorld({ id: 'orbit', collision: null });
  assert.equal(ambience.holograms.length, AMBIENCE.holograms);
  for (const h of ambience.holograms) h.next = Infinity; // no random glitches
  ambience.root.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera();
  const skater = ambienceSkater(0, 0); // > 50 m from every billboard
  const h = ambience.holograms[0];
  const at = z => h.mesh.localToWorld(new THREE.Vector3(0, -6.2, z)); // z m in front of its bottom edge
  const bursts = [];
  let t = 0;
  const burst = ambience.hologramBurst.bind(ambience);
  ambience.hologramBurst = target => { const ok = burst(target); if (ok && target === h) bursts.push(+t.toFixed(3)); return ok; };
  const run = seconds => { for (let i = 0; i < Math.round(seconds * 60); i++) { t += 1 / 60; ambience.update(1 / 60, skater, camera); } };
  const land = point => { reactions.payloads.landing.point.copy(point); reactions.emit('landing'); };
  return { ambience, h, skater, at, bursts, run, land, get t() { return t; } };
}

test('hologram flicker: entering 30 m of a billboard glitches it once; staying inside does not retrigger', () => {
  const r = hologramRig();
  r.run(2);
  assert.deepEqual(r.bursts, [], 'far away: none');
  r.skater.position.copy(r.at(31.5));
  r.run(1);
  assert.deepEqual(r.bursts, [], '31.5 m: outside');
  r.skater.position.copy(r.at(20));
  r.run(.1);
  assert.equal(r.bursts.length, 1, 'entering triggers');
  assert.ok(r.h.glitch > 0 && r.h.glitch <= AMBIENCE.hologramBurst);
  r.run(.5);
  assert.ok(r.h.glitch <= 0, 'a 0.5 s burst');
  r.skater.position.copy(r.at(29.5)); // wander about inside, even near the edge
  r.run(4);
  r.skater.position.copy(r.at(30.6)); // inside the 1 m hysteresis band
  r.run(.5);
  r.skater.position.copy(r.at(25));
  r.run(4);
  assert.equal(r.bursts.length, 1, 'staying inside never retriggers');
  r.skater.position.set(0, 0, 0);
  r.run(1);
  assert.equal(r.h.mesh.position.x, r.h.baseX, 'position restored after the burst');
});

test('hologram flicker: a landing within 30 m triggers it, with a 4 s cooldown per billboard; re-entry respects it too', () => {
  const r = hologramRig();
  r.run(1);
  r.land(r.at(45));
  assert.deepEqual(r.bursts, [], 'landing 45 m away: none');
  r.land(r.at(10));
  assert.equal(r.bursts.length, 1, 'landing within 30 m');
  r.run(1);
  r.land(r.at(10));
  assert.equal(r.bursts.length, 1, 'within the 4 s cooldown: none');
  r.run(3.1);
  r.land(r.at(12));
  assert.equal(r.bursts.length, 2, 'after the cooldown');
  r.run(.5);
  r.skater.position.copy(r.at(20)); // entering during the cooldown: no burst...
  r.run(.5);
  assert.equal(r.bursts.length, 2);
  r.skater.position.set(0, 0, 0); // ...and leaving and re-entering after it does
  r.run(4);
  r.skater.position.copy(r.at(20));
  r.run(.1);
  assert.equal(r.bursts.length, 3);
  for (let i = 1; i < r.bursts.length; i++) assert.ok(r.bursts[i] - r.bursts[i - 1] >= AMBIENCE.hologramCooldown - 1e-6, `cooldown ${r.bursts}`);
  r.ambience.setQuality({ name: 'performance' });
  r.run(4.1);
  r.land(r.at(10));
  assert.equal(r.bursts.length, 3, 'off in the performance preset');
});

function flatCollision() {
  const collision = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial());
  plane.geometry.boundsTree = new MeshBVH(plane.geometry);
  plane.raycast = acceleratedRaycast;
  collision.add(plane);
  collision.updateMatrixWorld(true);
  return collision;
}
function wakeRig(id = 'skate-paradise') {
  const ambience = new MapAmbience(null);
  ambience.setWorld({ id, collision: flatCollision() });
  ambience.gustTimer = Infinity; // no wind gusts: only the wake
  const skater = ambienceSkater(0, 0);
  const spawned = [];
  const run = (seconds, speed) => {
    skater.velocity.set(speed, 0, 0); skater.speed = speed;
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      const before = ambience.pieces.map(p => p.alive);
      skater.position.x += speed / 60;
      ambience.update(1 / 60, skater, null);
      ambience.pieces.forEach((p, k) => { if (p.alive && !before[k]) spawned.push({ pos: p.pos.clone(), vel: p.vel.clone(), rider: skater.position.clone() }); });
    }
  };
  return { ambience, skater, spawned, run };
}

test('litter wake: above 8 m/s, 1-2 pieces per second kicked up from behind the rider, from the existing pool', () => {
  const w = wakeRig();
  w.run(3, 6);
  assert.equal(w.spawned.length, 0, 'slow: no wake');
  w.run(6, 10);
  assert.ok(w.spawned.length >= 6 && w.spawned.length <= 12, `kicked ${w.spawned.length} in 6 s`);
  for (const s of w.spawned) {
    assert.ok(s.pos.x - s.rider.x < -1, 'behind the rider');
    assert.ok(horizontal(s.pos, s.rider) >= 1.2, 'clear of the rider');
    assert.ok(s.vel.y > 0, 'kicked up');
    assert.ok(Math.abs(s.pos.y) < .1, 'from the ground');
  }
  assert.equal(w.ambience.pieces.length, AMBIENCE.litter);
  assert.equal(w.ambience.litter.instanceMatrix.count, AMBIENCE.litter);
  assert.ok(w.ambience.litter.count <= AMBIENCE.litter);
  const indoor = wakeRig('grand-warehouse');
  indoor.run(4, 10);
  assert.ok(indoor.spawned.length >= 4, 'the warehouse gets it too');
  const orbit = wakeRig('orbit');
  orbit.run(4, 10);
  assert.equal(orbit.spawned.length + orbit.ambience.litter.count, 0, 'no litter on Orbit');
});

test('litter wake never adds pieces: with the pool busy it kicks nothing', () => {
  const w = wakeRig();
  for (const p of w.ambience.pieces) { p.alive = true; p.age = 0; p.pos.set(30, 0, 5); p.ground = 0; }
  w.run(2, 12);
  assert.equal(w.spawned.length, 0);
  assert.ok(w.ambience.pieces.every(p => p.age > 1.9), 'no piece was recycled');
});

test('litter wake: nothing kicks up under a rider in the air, or where the ground probe misses', () => {
  const air = wakeRig();
  air.skater.grounded = false;
  air.skater.position.y = 1.5;
  air.run(4, 12);
  assert.equal(air.spawned.length, 0, 'airborne: no wake');
  air.skater.grounded = true;
  air.skater.position.y = 0;
  air.run(3, 12);
  assert.ok(air.spawned.length >= 2, 'back on the ground: the wake resumes');
  for (const s of air.spawned) assert.ok(Math.abs(s.pos.y) < .1, 'pieces start on the ground');
  const noGround = new MapAmbience(null);
  noGround.setWorld({ id: 'skate-paradise', collision: null }); // every probe misses
  noGround.gustTimer = Infinity;
  const skater = ambienceSkater(0, 0);
  skater.velocity.set(12, 0, 0); skater.speed = 12;
  for (let i = 0; i < 240; i++) { skater.position.x += .2; noGround.update(1 / 60, skater, null); }
  assert.equal(noGround.pieces.filter(p => p.alive).length, 0, 'no ground hit: nothing kicked');
});

test('litter wake: reduced motion halves the kick', () => {
  const kicks = reduced => {
    const w = wakeRig();
    w.ambience.setLifeContext({ reducedMotion: reduced });
    w.run(8, 10);
    return w.spawned.map(s => s.vel.y);
  };
  const full = kicks(false), half = kicks(true);
  assert.ok(full.length >= 4 && half.length >= 4);
  assert.ok(Math.max(...half) < Math.min(...full), `reduced ${Math.max(...half)} vs ${Math.min(...full)}`);
  assert.ok(Math.max(...half) <= 3.2 * .5, 'half the upward kick');
});
