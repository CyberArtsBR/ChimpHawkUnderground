import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SkateTricks } from '../src/game/SkateTricks.js';
import { SkillStreetPhysics } from '../src/game/SkillStreetPhysics.js';
import { createBalanceState, stepBalance } from '../src/game/SkateSystems.js';

const idle = (overrides = {}) => ({
  directionTaps: [], steer: 0, drive: 0, flipPressed: false,
  grabPressed: false, grindPressed: false, grabHeld: false, ...overrides,
});
const airborne = (overrides = {}) => ({
  grounded: false, grinding: false, manual: null,
  wallRiding: false, speed: 6, ...overrides,
});

function flatWorld() {
  const group = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(40, 0.1, 40),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  floor.position.y = -0.05;
  group.add(floor);
  group.updateMatrixWorld(true);
  return group;
}

test('agent03: manual to Ollie preserves the pending combo while changing movement mode', () => {
  const physics = new SkillStreetPhysics({
    collision: flatWorld(), spawn: [0, 0.5, 0], rails: [],
  });
  assert.equal(physics.grounded, true);
  physics.handleEvents({ manual: 'manual' });
  assert.equal(physics.manual, 'manual');
  assert.equal(physics.tricks.combo.at(-1).name, 'Manual');
  physics.takeoff(6);
  assert.equal(physics.manual, null);
  assert.equal(physics.grounded, false);
  assert.ok(physics.tricks.combo.some(entry => entry.name === 'Manual'));
  assert.equal(physics.score, 0, 'combo must bank on landing, not on takeoff');
});

test('agent03: grind to airborne manual landing bridges one continuous combo', () => {
  const tricks = new SkateTricks();
  tricks.record('50-50', 150);
  tricks.tick(0.2);
  tricks.record('Ollie Out', 75);
  tricks.resolve(idle({ directionTaps: ['up'] }), airborne());
  tricks.tick(0.08);
  tricks.resolve(idle({ directionTaps: ['down'] }), airborne());
  assert.equal(tricks.manualBridgePending(), true);
  tricks.tick(0.06);
  const landing = tricks.resolve(idle(), airborne({ grounded: true }));
  assert.equal(landing.manual, 'manual');
  tricks.record('Manual', 100);
  assert.deepEqual(tricks.combo.map(entry => entry.name), ['50-50', 'Ollie Out', 'Manual']);
  const result = tricks.settle();
  assert.ok(result.points >= 3 * (150 + 75 + 100));
});

test('agent03: ignored rail balance eventually fails without correction', () => {
  const state = createBalanceState(1.18);
  let failed = false;
  for (let i = 0; i < 12 * 120; i++) {
    const r = stepBalance(state, {
      dt: 1 / 120, duration: i / 120, speed: 7,
      correction: 0, difficulty: 1.2, rail: true,
    });
    if (r.failed) { failed = true; break; }
  }
  assert.equal(failed, true);
});

test('agent03: duplicate simultaneous score events cannot inflate a combo', () => {
  const tricks = new SkateTricks();
  const first = tricks.record('Kickflip', 100);
  const duplicate = tricks.record('Kickflip', 100);
  assert.equal(duplicate, first);
  assert.equal(tricks.combo.length, 1);
  assert.equal(tricks.comboMultiplier, 1);
  tricks.tick(0.2);
  tricks.record('Kickflip', 100);
  assert.equal(tricks.combo.length, 2, 'legitimate later repeat still counts');
  assert.equal(tricks.combo.at(-1).repeatFactor, 0.75);
});

test('agent03: score banking is one-shot, duration is included only once', () => {
  const tricks = new SkateTricks();
  tricks.record('50-50', 150);
  tricks.addDuration(12.75);
  tricks.tick(0.5);
  tricks.record('Manual', 100);
  tricks.addDuration(10.25);
  const expectedBase = tricks.comboBase + Math.round(tricks.durationFraction);
  const expectedMultiplier = tricks.comboMultiplier;
  const result = tricks.settle();
  assert.equal(result.points, expectedBase * expectedMultiplier);
  assert.equal(tricks.settle(), null);
  assert.equal(tricks.combo.length, 0);
});

test('agent03: failed balance (bail) discards combo and awards no score', () => {
  const tricks = new SkateTricks();
  tricks.record('50-50', 150);
  tricks.addDuration(25);
  tricks.cancelCombo();
  assert.equal(tricks.combo.length, 0);
  assert.equal(tricks.settle(), null);
});

test('agent03: manual entry state resets cleanly on release', () => {
  const physics = new SkillStreetPhysics({
    collision: flatWorld(), spawn: [0, 0.5, 0], rails: [],
  });
  physics.handleEvents({ manual: 'noseManual' });
  assert.equal(physics.movementState, 'MANUAL');
  physics.endManual();
  assert.equal(physics.manual, null);
  assert.equal(physics.movementState, 'GROUND');
  assert.equal(physics.grounded, true);
});
