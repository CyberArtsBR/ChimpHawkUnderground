import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LifeDirector } from '../src/graphics/life/LifeDirector.js';
import { WarehouseLife, WAREHOUSE_LIFE, findWindowPanes } from '../src/graphics/life/WarehouseLife.js';
import { MapDressing, findPendantPerches } from '../src/graphics/MapDressing.js';
import { visualMeshes } from '../src/graphics/MapScan.js';

// A hall 60 x 40 m: west wall x = -30, east wall x = +30. High windows (glass)
// on both long walls at y 8-11; the sun sits west, so only the west ones shaft.
const SPAWN = [0, 0, 15];
const glassMaterial = () => new THREE.MeshStandardMaterial({ name: 'Foundry_Industrial_Glass' });
function makePark({ windows = true } = {}) {
  const park = new THREE.Group();
  if (windows) for (const x of [-29.9, 29.9]) for (const z of [-15, -5, 5, 15]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(6, 3).rotateY(Math.PI / 2), glassMaterial());
    pane.position.set(x, 9.5, z);
    park.add(pane);
  }
  park.updateMatrixWorld(true);
  return park;
}
const RAIL = { points: [[10, .5, -5], [10, .5, 5]] };
function makeScan() {
  const edges = [];
  // Along the north wall (z = -19.1, facing +z) and the south wall.
  for (let i = 0; i < 30; i++) edges.push({ point: new THREE.Vector3(-26 + i * 1.8, 0, -19.1), facing: new THREE.Vector3(0, 0, 1) });
  for (let i = 0; i < 6; i++) edges.push({ point: new THREE.Vector3(-1 + i * .5, 0, 18), facing: new THREE.Vector3(0, 0, -1) }); // by the spawn
  for (let i = 0; i < 4; i++) edges.push({ point: new THREE.Vector3(-20 + i * 2, 21.5, 0), facing: new THREE.Vector3(0, 0, 1) }); // roof
  return { edges, walls: [], floor: [] };
}
function makeAnchors() {
  return {
    poles: [], lamps: [], strings: [],
    props: [{ position: new THREE.Vector3(-20, 0, -19.4), radius: .9, kind: 'crates', facing: new THREE.Vector3(0, 0, 1) }, { position: new THREE.Vector3(8, 0, -19.4), radius: 1.1, kind: 'bench', facing: new THREE.Vector3(0, 0, 1) }],
  };
}
const ground = point => ({ point: new THREE.Vector3(point.x, 0, point.z), normal: new THREE.Vector3(0, 1, 0) });
const fakeSkater = () => ({
  position: new THREE.Vector3(0, 0, 15), velocity: new THREE.Vector3(), forward: new THREE.Vector3(0, 0, -1),
  speed: 0, grounded: true, grind: null, bailTime: 0, respawnSerial: 0, wallRide: null,
  presentation: { popTime: 0, landingSeverity: 0 }, rider: { ragdoll: { groundImpact: null } },
  audioSurfaceTag: 'concrete', surface: { ground },
});

function rig({ settings = { name: 'high', vfxScale: 1 }, park = makePark(), anchors = makeAnchors(), scan = makeScan(), world = 'grand-warehouse', sun = true } = {}) {
  const scene = new THREE.Scene();
  if (sun) {
    const light = new THREE.DirectionalLight('#fff', 2);
    light.castShadow = true;
    light.position.set(-35, 42, 16);
    scene.add(light, light.target);
  }
  const plays = [];
  const dressing = { anchors, scan };
  const director = new LifeDirector(scene, { mapDressing: dressing });
  director.audio.play = (kind, position, opts) => { plays.push({ kind, position: position.clone(), opts }); return true; };
  director.audio.stop = () => {};
  director.setQuality(settings);
  const life = new WarehouseLife();
  director.register(life);
  const skater = fakeSkater();
  director.setWorld({ id: world, park, manifest: { spawn: SPAWN, rails: [RAIL] } }, skater);
  const camera = new THREE.PerspectiveCamera(60, 1.6, .1, 500);
  const look = (from, to) => { camera.position.copy(from); camera.lookAt(to); camera.updateMatrixWorld(); };
  look(new THREE.Vector3(0, 3, 22), new THREE.Vector3(0, 1, 15));
  const step = (dt = 1 / 30) => director.update(dt, skater, camera);
  const run = (seconds, dt = 1 / 30, each = null) => { for (let t = 0; t < seconds; t += dt) { step(dt); each?.(); } };
  const ride = velocity => { skater.velocity.copy(velocity); skater.speed = velocity.length(); };
  return { director, life, plays, skater, step, run, ride, camera, look, scene };
}
const dustPoint = (life, i) => new THREE.Vector3().fromArray(life.dustPositions, i * 3);
const riderCenter = skater => skater.position.clone().setY(skater.position.y + .9);
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const shaftCenter = (life, i) => new THREE.Vector3(.5, .5, .5).applyMatrix4(life.shafts[i].matrix);

// ---------------------------------------------------------------- dressing
test('findPendantPerches: one perch on top of each Foundry_Warm_Lights pendant, height 0', () => {
  const park = new THREE.Group();
  const spots = [[-19, 21], [19, -21], [57, 0]];
  for (const [x, z] of spots) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.5, .5, .02, 16), new THREE.MeshStandardMaterial({ name: 'Foundry_Warm_Lights' }));
    disc.position.set(x, 16.37, z);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .1, 16), new THREE.MeshStandardMaterial({ name: 'Foundry_Stainless_Coping.016' }));
    shade.position.set(x, 16.45, z);
    park.add(disc, shade);
  }
  park.add(new THREE.Mesh(new THREE.BoxGeometry(60, .2, 60), new THREE.MeshStandardMaterial({ name: 'Foundry_Concrete' })));
  park.updateMatrixWorld(true);
  const perches = findPendantPerches(park, visualMeshes(park));
  assert.equal(perches.length, 3);
  for (const [x, z] of spots) {
    const p = perches.find(q => Math.hypot(q.position.x - x, q.position.z - z) < 1);
    assert.ok(p, `perch for pendant at ${x},${z}`);
    assert.equal(p.height, 0);
    assert.ok(Math.abs(p.position.y - 16.5) < .02, `on the shade top: ${p.position.y}`);
    assert.ok(Math.hypot(p.position.x - x, p.position.z - z) > .15, 'beside the rod, not on it');
    // On the side facing the middle of the pendants (19, 0).
    assert.ok(Math.hypot(p.position.x - 19, p.position.z) < Math.hypot(x - 19, z), 'faces the hall');
  }
  assert.deepEqual(findPendantPerches(new THREE.Group(), []), []);
});

test('MapDressing: no lamp grid on the Warehouse; anchors (pendant perches, props) repopulate after setWorld', async () => {
  const savedDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  try {
    const park = new THREE.Group();
    const add = (geometry, x, y, z, name = 'Foundry_Concrete') => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name }));
      mesh.position.set(x, y, z); park.add(mesh); return mesh;
    };
    add(new THREE.BoxGeometry(60, .2, 40), 0, -.1, 0);
    add(new THREE.BoxGeometry(30, .2, 40), 15, 20, 0); // half roof: the floor scan sees its top
    for (const x of [-30, 30]) add(new THREE.BoxGeometry(.4, 20, 40), x, 10, 0);
    for (const z of [-20, 20]) add(new THREE.BoxGeometry(60, 20, .4), 0, 10, z);
    for (const x of [-10, 10]) add(new THREE.CylinderGeometry(.5, .5, .02, 12), x, 16.4, 0, 'Foundry_Warm_Lights');
    park.updateMatrixWorld(true);
    const world = { id: 'grand-warehouse', park, collision: new THREE.Group(), manifest: { spawn: [0, 0, 10], rails: [] } };
    const dressing = new MapDressing(null);
    for (let pass = 0; pass < 2; pass++) {
      dressing.setWorld(world);
      assert.equal(dressing.anchors.lamps.length, 0, 'cleared with the park');
      await dressing.build(world);
      assert.equal(dressing.anchors.lamps.length, 2, 'one perch per model pendant');
      for (const lamp of dressing.anchors.lamps) assert.ok(lamp.position.y > 16.3 && lamp.position.y < 17, 'perch up at the pendant');
      assert.equal(dressing.root.children.filter(c => /^Lamp /.test(c.name)).length, 0, 'no dressing lamp meshes');
      assert.ok(Array.isArray(dressing.anchors.props));
    }
    dressing.clear();
    assert.equal(dressing.anchors.lamps.length, 0);
  } finally {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  }
});

// ---------------------------------------------------------------- shafts and dust
test('windows: glass triangles cluster into panes', () => {
  const panes = findWindowPanes(makePark());
  assert.equal(panes.length, 8);
  for (const p of panes) assert.ok(p.max.y - p.min.y > 2.9 && p.max.y - p.min.y < 3.1);
});

test('shafts: only sun-facing high windows, spread apart, slanting down into the hall', () => {
  const r = rig();
  r.step();
  const n = r.life.shaftCount;
  assert.ok(n >= 1 && n <= WAREHOUSE_LIFE.shaftMax, `shafts ${n}`);
  for (let i = 0; i < n; i++) {
    const c = shaftCenter(r.life, i);
    assert.ok(c.x < 0, 'west (sun-facing) windows only');
    const start = new THREE.Vector3(.5, .5, 0).applyMatrix4(r.life.shafts[i].matrix);
    const end = new THREE.Vector3(.5, .5, 1).applyMatrix4(r.life.shafts[i].matrix);
    assert.ok(end.y < start.y - 5 && end.x > start.x + 3, 'down and into the hall');
    assert.ok(Math.abs(end.y) < .3, 'reaches the floor');
    for (let j = 0; j < i; j++) assert.ok(c.distanceTo(shaftCenter(r.life, j)) >= WAREHOUSE_LIFE.shaftGap - .01);
  }
  assert.equal(r.life.shaftMesh.count, n);
});

test('shafts: none without window glass (and no dust)', () => {
  const r = rig({ park: makePark({ windows: false }) });
  r.run(1);
  assert.equal(r.life.shaftCount, 0);
  assert.equal(r.life.dustCount, 0);
});

test('shafts fade out as the camera gets inside or close; full from afar', () => {
  const r = rig();
  r.step();
  const c = shaftCenter(r.life, 0);
  r.look(new THREE.Vector3(10, 3, 20), c);
  r.step();
  assert.ok(r.life.shafts[0].fade > .99, `far fade ${r.life.shafts[0].fade}`);
  r.look(c.clone(), c.clone().add(new THREE.Vector3(1, 0, 0)));
  r.step();
  assert.equal(r.life.shafts[0].fade, 0, 'camera inside: invisible');
  const color = new THREE.Color();
  r.life.shaftMesh.getColorAt(0, color);
  assert.equal(color.r, 0);
});

test('dust: at most 120 (60 at half density), inside its shaft', () => {
  for (const [settings, cap] of [[{ name: 'high', vfxScale: 1 }, 120], [{ name: 'balanced', vfxScale: .7 }, 60]]) {
    const r = rig({ settings });
    r.run(2);
    assert.ok(r.life.dustCount > 0 && r.life.dustCount <= cap, `dust ${r.life.dustCount}`);
    assert.equal(r.life.dust.geometry.drawRange.count, r.life.dustCount);
    for (let i = 0; i < r.life.dustCount; i++) {
      const l = dustPoint(r.life, i).applyMatrix4(r.life.shafts[r.life.dustShaft[i]].inverse);
      for (const v of [l.x, l.y, l.z]) assert.ok(v > -.05 && v < 1.05, `dust ${i} outside its shaft`);
    }
  }
});

test('dust swirls round a rider passing through a shaft, never within 1.2 m; half as much with reduced motion', () => {
  const swirl = reduced => {
    const r = rig();
    r.step();
    // Put the rider in the lower part of shaft 0 and ride through.
    const foot = new THREE.Vector3(.5, .5, .9).applyMatrix4(r.life.shafts[0].matrix).setY(0);
    r.skater.position.copy(foot);
    r.director.reducedMotion = reduced;
    r.step();
    // Gather the shaft's dust round the rider so the swirl has something to move.
    for (let i = 0; i < r.life.dustCount; i++) if (r.life.dustShaft[i] === 0) {
      const a = i * 1.7;
      r.life.dustPositions.set([foot.x + Math.cos(a) * 2, .9 + Math.sin(i) * .4, foot.z + Math.sin(a) * 2], i * 3);
    }
    r.ride(new THREE.Vector3(0, 0, 8));
    let speed = 0, min = Infinity;
    r.run(.5, 1 / 30, () => {
      assert.ok(r.life.shafts[0].riderInside, 'rider inside the shaft');
      for (let i = 0; i < r.life.dustCount; i++) {
        min = Math.min(min, dustPoint(r.life, i).distanceTo(riderCenter(r.skater)));
        if (r.life.dustShaft[i] === 0) speed = Math.max(speed, Math.hypot(r.life.dustVelocity[i * 3], r.life.dustVelocity[i * 3 + 2]));
      }
    });
    assert.ok(min >= WAREHOUSE_LIFE.riderClear - 1e-6, `dust ${min.toFixed(2)} m from the rider`);
    return speed;
  };
  const full = swirl(false), reduced = swirl(true);
  assert.ok(full > .3, `swirl speed ${full}`);
  assert.ok(reduced < full * .75 && reduced > 0, `reduced ${reduced} vs ${full}`);
});

// ---------------------------------------------------------------- boxes
test('boxes: at most 6 (3 at half density) on the hall floor, clear of spawn, props and each other, crates first', () => {
  for (const [settings, cap] of [[{ name: 'high', vfxScale: 1 }, 6], [{ name: 'balanced', vfxScale: .7 }, 3]]) {
    const r = rig({ settings });
    r.run(.5);
    const boxes = r.life.boxes;
    assert.ok(boxes.length >= 1 && boxes.length <= cap, `boxes ${boxes.length}`);
    assert.equal(r.life.boxMesh.count, boxes.length);
    const spawn = new THREE.Vector3(...SPAWN);
    for (const b of boxes) {
      assert.ok(Math.abs(b.home.y) < .01, 'on the hall floor, not the roof');
      assert.ok(b.home.z >= -19.4 - 1e-6, 'room side of the wall');
      assert.ok(horizontal(b.home, spawn) >= WAREHOUSE_LIFE.boxSpawnClear);
      for (const p of makeAnchors().props) assert.ok(horizontal(b.home, p.position) >= p.radius + WAREHOUSE_LIFE.boxPropClear - 1e-6);
      for (const o of boxes) if (o !== b) assert.ok(horizontal(b.home, o.home) >= WAREHOUSE_LIFE.boxGap - 1e-6);
    }
    const crate = new THREE.Vector3(-20, 0, -19.4);
    assert.ok(horizontal(boxes[0].home, crate) < 3.6, 'first box by the crate stack');
    assert.ok(boxes.filter(b => horizontal(b.home, crate) < 3.6).length <= 2, 'two per crate stack at most');
  }
});

test('boxes: spots by a ramp edge come after open floor', () => {
  const r = rig();
  // A ramp starts 2 m east of the crate stack: its ring is no longer open floor.
  r.skater.surface = { ground: point => (point.x > -18.5 && point.x < -14 ? { point: new THREE.Vector3(point.x, .6, point.z), normal: new THREE.Vector3(.4, .9, 0).normalize() } : ground(point)) };
  r.run(.3);
  for (const b of r.life.boxes) assert.ok(Math.abs(b.home.x - -16) > 5, `box at x ${b.home.x.toFixed(1)} too close to the ramp`);
});

test('boxes: topple and slide from a fast rider passing within 1.2 m (thud), not from a slow one; never inside the rider', () => {
  const r = rig();
  r.run(.2);
  const box = r.life.boxes[0];
  // Slow roll past: no topple.
  r.skater.position.set(box.home.x - 4, 0, box.home.z + 1.2);
  r.ride(new THREE.Vector3(2, 0, 0));
  r.run(.5);
  assert.equal(box.topples, 0);
  // Fast pass along the wall, 1 m off the box line.
  r.skater.position.set(box.home.x - 5, 0, box.home.z + 1);
  r.ride(new THREE.Vector3(8, 0, 0));
  let min = Infinity;
  r.run(1.5, 1 / 30, () => {
    // Measured against the rider position the update just saw, then the rider moves on.
    for (const b of r.life.boxes) min = Math.min(min, horizontal(b.position, r.skater.position) - Math.max(b.size[0], b.size[2]) / 2);
    r.skater.position.addScaledVector(r.skater.velocity, 1 / 30);
  });
  assert.equal(box.topples, 1);
  assert.ok(box.displaced && box.tilt > 1.4, `on its side (tilt ${box.tilt.toFixed(2)})`);
  assert.ok(horizontal(box.position, box.home) > .2, 'slid');
  assert.ok(r.plays.some(p => p.kind === 'thud'), 'thud');
  assert.ok(min >= WAREHOUSE_LIFE.riderClear - 1e-6, `box edge ${min.toFixed(2)} m from the rider`);
});

test('boxes: go home after 25 s unseen, not while seen', () => {
  const r = rig();
  r.run(.2);
  const box = r.life.boxes[0];
  r.life.topple(box, 2, 0, 6, r.skater.surface);
  r.skater.position.set(25, 0, 15);
  r.ride(new THREE.Vector3());
  r.look(new THREE.Vector3(box.home.x, 2, box.home.z + 8), box.home); // watching it
  r.run(27);
  assert.ok(box.displaced, 'stays while seen');
  r.look(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 1, 30)); // looking away
  r.run(26);
  assert.ok(!box.displaced && box.position.distanceTo(box.home) < 1e-6 && box.tilt === 0, 'home again');
});

// ---------------------------------------------------------------- rattle
test('rattle: grindStart or a wallride within 5 m of a rail, at most one per 1.5 s; none far away', () => {
  const r = rig();
  r.step();
  const emit = (x, z) => { r.director.reactions.payloads.grindStart.point.set(x, .5, z); r.director.reactions.emit('grindStart'); };
  const rattles = () => r.plays.filter(p => p.kind === 'rattle').length;
  emit(10, 0);
  assert.equal(rattles(), 1);
  assert.ok(r.plays.at(-1).position.distanceTo(new THREE.Vector3(10, .5, 0)) < .01, 'at the rail');
  emit(10, 1);
  assert.equal(rattles(), 1, 'rate limited');
  r.run(1.6);
  emit(-20, 0);
  assert.equal(rattles(), 1, 'far from any rail');
  r.skater.position.set(12, 0, 3);
  r.skater.wallRide = { normal: new THREE.Vector3(1, 0, 0) };
  r.step();
  assert.equal(rattles(), 2, 'wallride by the rail');
  r.run(2);
  assert.equal(rattles(), 2, 'once per wallride');
});

// ---------------------------------------------------------------- lifecycle
test('setWorld twice, park switch and reset: nothing stale, same children; performance hides and stops work', () => {
  const r = rig();
  r.run(.5);
  const children = r.life.root.children.length;
  assert.ok(r.life.shaftCount > 0 && r.life.boxes.length > 0);
  r.director.setWorld({ id: 'grand-warehouse', park: makePark(), manifest: { spawn: SPAWN, rails: [RAIL] } }, r.skater);
  assert.equal(r.life.shaftMesh.count, 0); assert.equal(r.life.boxMesh.count, 0); assert.equal(r.life.dustCount, 0);
  r.run(.5);
  assert.equal(r.life.root.children.length, children);
  r.director.setWorld({ id: 'orbit', park: new THREE.Group(), manifest: { spawn: [0, 0, 0] } }, r.skater);
  assert.equal(r.life.root.parent, null, 'inactive on other parks');
  assert.equal(r.life.shaftMesh.count + r.life.boxMesh.count + r.life.dustCount, 0);
  r.director.setWorld({ id: 'grand-warehouse', park: makePark(), manifest: { spawn: SPAWN, rails: [RAIL] } }, r.skater);
  r.run(.5);
  assert.ok(r.life.shaftCount > 0);
  r.director.setQuality({ name: 'performance', vfxScale: .5 });
  assert.equal(r.life.root.visible, false);
  const time = r.life.time;
  r.life.update(1 / 30, r.skater, r.camera, r.director.ctx);
  assert.equal(r.life.time, time, 'no work');
  assert.equal(r.life.shaftCount + r.life.boxes.length + r.life.dustCount, 0);
  r.director.setQuality({ name: 'high', vfxScale: 1 });
  r.run(.5);
  assert.ok(r.life.root.visible && r.life.shaftCount > 0 && r.life.boxes.length > 0, 'back on');
});

test('materials and meshes exist at construction (shader warm-up), one per kind', () => {
  const life = new WarehouseLife();
  const meshes = [];
  life.root.traverse(o => { if (o.isMesh || o.isPoints) meshes.push(o); });
  assert.equal(meshes.length, 3);
  assert.equal(new Set(meshes.map(m => m.material)).size, 3);
  life.dispose();
});
