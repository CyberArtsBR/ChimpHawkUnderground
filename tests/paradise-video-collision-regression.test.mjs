import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { assembleTestMap } from '../src/game/TestMapLoader.js';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { MOVEMENT_STATE } from '../src/game/StreetPhysics.js';
import { ParkCollision } from '../src/game/ParkCollision.js';

// Captured 2026-10-25 11:26:57: L2 at 00:14–00:59/01:57, south bank at
// 01:11, raised rim at 01:28–01:49, stair sides at 02:10/02:27/02:44.
let world, rider;
before(async () => {
  const root = await loadGeometry(process.env.PARADISE_ASSET || 'public/assets/park/skate-paradise.glb');
  root.traverse(o => {
    if (!o.userData.streetSkateMap) return;
    const m = JSON.parse(o.userData.streetSkateMap); m.presentation.environmentFromSky = false;
    o.userData.streetSkateMap = JSON.stringify(m);
  });
  world = assembleTestMap(root);
  rider = new StatefulSkillStreetPhysics({ collision: world.collision, spawn: [27, .46, -75],
    rails: world.manifest.rails, playableRegions: world.manifest.playableRegions });
});
const v = a => new THREE.Vector3(...a);
function reset(position, heading, speed = 0) {
  rider.reset(v(position), heading); rider.speed = speed; rider.groundDirection();
  rider.velocity.copy(rider.forward).multiplyScalar(speed);
}

for (const trial of [
  { name: 'middle island curved entrance', p: [45, .42, -62], heading: 0 },
  { name: 'middle island north face', p: [60, .42, -106], heading: Math.PI },
  { name: 'middle island west face', p: [25, .42, -84], heading: -Math.PI / 2 },
  { name: 'south island curved face', p: [34, .42, -47], heading: -Math.PI / 2 },
  { name: 'south island north face', p: [55, .42, -60], heading: Math.PI },
]) test(`L2 clears and lands on the real deck: ${trial.name}`, () => {
  for (const speed of [12, 17]) {
    reset(trial.p, trial.heading, speed);
    let air = null, landed = false;
    for (let i = 0; i < 360; i++) {
      rider.advance(1 / 120, { drive: 1, vertExit: true });
      if (!air && rider.transitionAir?.transferring) air = rider.transitionAir;
      assert.equal(rider.bailTime, 0, 'ordinary L2 exit must not bail');
      assert.ok(rider.position.y > .25, 'transfer passed through the plaza floor');
      if (air && rider.grounded) {
        const outward = rider.position.clone().sub(air.frame.lipPoint).dot(air.frame.deckOutward);
        assert.ok(rider.position.y >= air.exitControl.targetPoint.y - .08, 'landed below the deck');
        assert.ok(outward > .05, 'landed back on the departing ramp');
        assert.ok(rider.velocity.dot(air.frame.deckOutward) > .1, 'forward momentum was lost');
        landed = true; break;
      }
    }
    assert.ok(air, `no L2 launch at ${speed} m/s`);
    assert.ok(landed, `L2 never reached the deck at ${speed} m/s`);
  }
});

test('01:11 south entrance bank matches its visible slope and can be ridden across', () => {
  for (const p of [[47.5968, 1.64477, -6.63548], [50.5, 2.94955, -5.5], [51.5, 3.39899, -6.5]]) {
    const hit = rider.surface.ground(v(p), .08, .08);
    assert.ok(hit, `missing bank at ${p}`);
    assert.ok(Math.abs(hit.point.y - p[1]) < .025);
    assert.ok(hit.normal.y > .90 && hit.normal.y < .93);
  }
  reset([42, .42, -6], -Math.PI / 2, 10);
  let maxY = 0;
  for (let i = 0; i < 240; i++) {
    rider.advance(1 / 120, { drive: 1 }); maxY = Math.max(maxY, rider.position.y);
    assert.equal(rider.bailTime, 0);
    if (rider.position.x > 54) break;
  }
  assert.ok(maxY > 4.1 && rider.position.x > 53.1, 'bank approach stayed underneath the structure');
});

test('01:28–01:49 east coping is flush and the formerly unregistered lip launches', () => {
  for (const name of ['G-Object.022 / coping 1', 'G-Object.022 / coping 4']) {
    const rail = world.manifest.rails.find(r => r.name === name);
    assert.ok(rail.transition?.supportsVert);
    for (const p of rail.points) assert.ok(Math.abs(p[1] - 4.16977) < .025, 'coping still raised above deck');
  }
  reset([96, .42, -57], -Math.PI / 2, 17);
  let launched = false, stalled = 0, worstStall = 0;
  for (let i = 0; i < 300; i++) {
    rider.advance(1 / 120, { drive: 1 });
    if (rider.transitionAir) launched = true;
    stalled = rider.position.y > 3 && rider.velocity.length() < .3 ? stalled + 1 / 120 : 0;
    worstStall = Math.max(worstStall, stalled);
  }
  assert.ok(launched, 'unregistered/raised east rim stopped takeoff');
  assert.ok(worstStall < .3, `stuck at the coping for ${worstStall} s`);
});

test('02:10/02:27/02:44 thirty-stair sidewalls block travel from both sides', () => {
  for (const x of [116.6745, 124.419]) for (const side of [-1, 1]) {
    const from = v([x + side * 1.4, 4.15, -104]);
    const to = v([x - side * 1.4, 4.15, -104]);
    const hit = rider.surface.move(from, to, v([-side * 17, 0, 0]), { grounded: true });
    assert.ok(hit.contacts.length, 'stair side has no collision');
    assert.ok((hit.position.x - x) * side > .12, 'rider crossed the stair side');
  }
});

test('all freestanding grind paths have solid bars with a named grind exclusion', () => {
  for (const rail of world.manifest.rails.filter(r => !r.transition)) {
    const root = new THREE.Group();
    for (const mesh of world.collision.children.filter(m => m.userData.railId === rail.name)) root.add(mesh.clone());
    assert.ok(root.children.length, `missing physical rail: ${rail.name}`);
    const surface = new ParkCollision(root);
    for (let i = 1; i < rail.points.length; i++) {
      const a = v(rail.points[i - 1]), b = v(rail.points[i]), delta = b.clone().sub(a).setY(0);
      if (delta.length() < .4) continue;
      const across = new THREE.Vector3(-delta.z, 0, delta.x).normalize();
      const center = a.add(b).multiplyScalar(.5).add(v([0, -.8, 0]));
      const from = center.clone().addScaledVector(across, 1), to = center.clone().addScaledVector(across, -1);
      const velocity = across.clone().multiplyScalar(-17);
      const hit = surface.move(from, to, velocity, { grounded: true });
      assert.ok(hit.contacts.some(c => c.railId === rail.name), `missing rail collision: ${rail.name}/${i}`);
      assert.ok(hit.position.clone().sub(center).dot(across) > .1, 'capsule crossed the bar');
      const grind = surface.move(from, to, across.clone().multiplyScalar(-17), { ignoreRail: rail.name });
      assert.ok(grind.contacts.every(c => c.railId !== rail.name), 'active grind catches on its own rail');
      assert.ok(grind.position.distanceTo(to) < .001, 'grind exclusion did not clear its own geometry');
    }
  }
});

test('grounded rider cannot roll through a straight island rail', () => {
  reset([60, 4.15, -51.3], Math.PI, 12);
  for (let i = 0; i < 180; i++) rider.advance(1 / 120, { drive: 1 });
  assert.ok(rider.position.z < -50.05, 'grounded rider passed through the bar');
  assert.ok(rider.position.y > 4.1);
});

test('north island launch ramp catches a descending board on the corrected face', () => {
  reset([50.28, 8.8, -117.37], Math.PI);
  rider.position.set(50.28, 8.8, -117.37); rider.normal.set(0, 1, 0);
  rider.velocity.set(0, -5, 0); rider.airDirection(); rider.setMovementState(MOVEMENT_STATE.AIR);
  rider.airTime = .3; rider.airTakeoffHeading = Math.PI;
  let hitY = null;
  for (let i = 0; i < 100; i++) {
    rider.advance(1 / 120, {});
    if (rider.grounded || rider.bailTime > 0) { hitY = rider.position.y; break; }
  }
  assert.ok(hitY > 6.1, `board fell through the ramp to ${hitY}`);
});

test('a vert return collides with a different ramp instead of deferring to the old coping', () => {
  reset([88, .42, -43], -Math.PI / 2, 17);
  let launched = false;
  for (let i = 0; i < 480; i++) {
    rider.advance(1 / 120, { drive: 1 });
    launched ||= Boolean(rider.transitionAir);
    const hit = rider.surface.ground(rider.position, 1.3, .02);
    assert.ok(!hit || hit.point.y - rider.position.y < .16, 'return travelled inside a different ramp');
  }
  assert.ok(launched);
});
