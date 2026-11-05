import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SafeCopingExitSkillStreetPhysics } from '../src/game/SafeCopingExitSkillStreetPhysics.js';

function verifiedAir() {
  return {
    transferring: true,
    frame: {
      lipPoint: new THREE.Vector3(0, 1, 0),
      deckOutward: new THREE.Vector3(0, 0, -1),
    },
    exitControl: {
      geometryAware: true,
      abortToReturn: false,
      startDistance: 0.22,
      endDistance: 0.82,
      targetPoint: new THREE.Vector3(0, 1, -0.5),
    },
  };
}

function runtime({ position = new THREE.Vector3(0.1, 1.22, -0.42), velocityY = -2 } = {}) {
  let probes = 0;
  let landed = 0;
  const support = {
    supported: true,
    count: 4,
    frontSupported: 2,
    rearSupported: 2,
    position: new THREE.Vector3(0.1, 1, -0.48),
    normal: new THREE.Vector3(0, 1, 0),
  };
  return {
    position,
    velocity: new THREE.Vector3(0, velocityY, -2),
    heading: 0,
    coreController: null,
    ensureBoardContact() {
      return {
        snapToGround() {
          probes += 1;
          return support;
        },
      };
    },
    land(value) {
      assert.equal(value, support);
      landed += 1;
      return true;
    },
    counts() { return { probes, landed }; },
  };
}

test('transition safety seam preserves verified deck catch after DeckAware flattening', () => {
  const target = runtime();
  const result = SafeCopingExitSkillStreetPhysics.prototype.tryVerifiedDeckCatch.call(
    target,
    verifiedAir(),
  );
  assert.equal(result, true);
  assert.deepEqual(target.counts(), { probes: 1, landed: 1 });
});

test('deck catch window rejects lower geometry before any support probe', () => {
  const target = runtime({
    position: new THREE.Vector3(0.1, 0.1, -0.42),
    velocityY: -2,
  });
  const result = SafeCopingExitSkillStreetPhysics.prototype.tryVerifiedDeckCatch.call(
    target,
    verifiedAir(),
  );
  assert.equal(result, false);
  assert.deepEqual(target.counts(), { probes: 0, landed: 0 });
});

test('deck catch window rejects ascending transfer before any support probe', () => {
  const target = runtime({ velocityY: 1.2 });
  const result = SafeCopingExitSkillStreetPhysics.prototype.tryVerifiedDeckCatch.call(
    target,
    verifiedAir(),
  );
  assert.equal(result, false);
  assert.deepEqual(target.counts(), { probes: 0, landed: 0 });
});
