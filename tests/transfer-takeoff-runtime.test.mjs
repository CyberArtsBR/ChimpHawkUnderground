import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';

function deckWorld(depth) {
  const root = new THREE.Group();
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(6, 0.10, depth),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  // Lip top is y=2.0 and deck extends directly behind it along -Z.
  deck.position.set(0, 1.95, -depth * 0.5);
  root.add(deck);
  root.updateMatrixWorld(true);
  return root;
}

function transitionEdge() {
  return {
    lipPoint: new THREE.Vector3(0, 2, 0),
    copingTangent: new THREE.Vector3(1, 0, 0),
    rampInward: new THREE.Vector3(0, 0, 1),
    deckOutward: new THREE.Vector3(0, 0, -1),
    surfaceNormal: new THREE.Vector3(0, 0.55, 0.835).normalize(),
    name: 'runtime-test-coping',
    gap: 0.05,
  };
}

function physics(depth) {
  const p = new StatefulSkillStreetPhysics({
    collision: deckWorld(depth),
    spawn: [0, 2.05, 0.30],
    rails: [],
  });
  p.position.set(0, 1.94, 0.08);
  p.normal.set(0, 0.55, 0.835).normalize();
  p.heading = 0;
  p.stance = 1;
  p.grounded = true;
  p.groundDirection();
  p.velocity.set(0, 4.2, -8.4);
  p.rampExitIntentTime = 0.20;
  p.rampLaunchMemory = 4.6;
  p.rampLaunchMemoryTime = 0.18;
  return p;
}

function performTransferTakeoff(depth) {
  const p = physics(depth);
  const headingBefore = p.heading;
  p.takeoff(0, transitionEdge());
  return { p, headingBefore };
}

test('wide real deck remains a geometry-aware transfer through the full runtime takeoff chain', () => {
  const { p, headingBefore } = performTransferTakeoff(1.90);
  const air = p.transitionAir;

  assert.ok(air, 'runtime takeoff did not create transition air');
  assert.equal(air.transferring, true);
  assert.equal(air.mode, 'transfer');
  assert.equal(air.exitControl?.geometryAware, true);
  assert.equal(air.exitControl?.abortToReturn, false);
  assert.ok(air.exitControl?.found, 'real deck scan was not propagated');
  assert.ok(air.exitControl.usableWidth > 1.4,
    `expected wide verified deck, got ${air.exitControl.usableWidth}`);
  assert.ok(air.exitControl.targetPoint.z < -0.2);
  assert.ok(p.velocity.z < 0, 'transfer launch should travel outward over the deck');
  assert.equal(p.heading, headingBefore, 'transfer takeoff must not invent yaw');
  assert.ok(Math.abs(p.airTakeoffHeading - headingBefore) < 1e-10);
});

test('narrow real deck converts to same-wall return in the full runtime takeoff chain', () => {
  const { p, headingBefore } = performTransferTakeoff(0.82);
  const air = p.transitionAir;

  assert.ok(air, 'runtime takeoff did not create transition air');
  assert.equal(air.transferring, false,
    'rejected transfer must return to the original transition, not stay in transfer flight');
  assert.equal(air.transferRejected, true);
  assert.equal(air.exitRequested, false);
  assert.equal(air.mode, 'return');
  assert.equal(air.exitControl?.geometryAware, true);
  assert.equal(air.exitControl?.abortToReturn, true);
  assert.ok(Number.isFinite(air.exitControl?.unsafeDeckWidth));
  assert.ok(air.exitControl.unsafeDeckWidth < 1.41,
    `narrow deck unexpectedly considered safe: ${air.exitControl.unsafeDeckWidth}`);
  assert.ok(p.velocity.z > 0, 'unsafe deck must redirect launch inward toward the transition');
  assert.ok(p.velocity.y >= 3.2 && p.velocity.y <= 7.2,
    `safe return vertical speed out of range: ${p.velocity.y}`);
  assert.equal(p.heading, headingBefore, 'narrow-deck abort must not invent yaw');
  assert.ok(Math.abs(p.airTakeoffHeading - headingBefore) < 1e-10);
});

test('wide and narrow takeoff outcomes are deterministic across repeated runtime construction', () => {
  for (const depth of [1.90, 0.82]) {
    const first = performTransferTakeoff(depth).p;
    const second = performTransferTakeoff(depth).p;
    const a = first.transitionAir;
    const b = second.transitionAir;

    assert.equal(a.mode, b.mode);
    assert.equal(a.exitControl.abortToReturn, b.exitControl.abortToReturn);
    assert.ok(Math.abs(first.velocity.x - second.velocity.x) < 1e-12);
    assert.ok(Math.abs(first.velocity.y - second.velocity.y) < 1e-12);
    assert.ok(Math.abs(first.velocity.z - second.velocity.z) < 1e-12);
    assert.ok(Math.abs(first.heading - second.heading) < 1e-12);
  }
});
