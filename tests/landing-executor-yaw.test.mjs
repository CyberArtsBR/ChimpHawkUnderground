import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyAcceptedLanding } from '../src/game/core/LandingExecutor.js';

function fakeController() {
  return {
    position: new THREE.Vector3(0, 1, 0),
    normal: new THREE.Vector3(0, 1, 0),
    velocity: new THREE.Vector3(0, -1, -5),
    heading: 0.42,
    airSpin: 0,
    stance: 1,
    flipState: null,
    grabState: null,
    transitionAir: {},
    wallRide: null,
    coyote: 0.1,
    justLanded: false,
    lastWheelSupport: null,
    transitionLandingGrace: 0,
    stableGroundTime: 1,
    movementState: 'AIR',
    groundDirectionCalls: 0,
    tricks: [],
    groundDirection() { this.groundDirectionCalls += 1; },
    recordTrick(name, points) { this.tricks.push({ name, points }); },
    setMovementState(state) { this.movementState = state; },
  };
}

test('accepted landing preserves heading even when projected board vector is diagonal', () => {
  const controller = fakeController();
  const beforeHeading = controller.heading;
  const support = {
    position: new THREE.Vector3(0.1, 0.2, -0.1),
    normal: new THREE.Vector3(0.55, 0.62, 0.56).normalize(),
  };
  const landing = {
    accepted: true,
    partialTouchdown: false,
    boardForward: new THREE.Vector3(0.72, 0, -0.69).normalize(),
    planarVelocity: new THREE.Vector3(0.3, -0.2, -4.5),
    planarSpeed: 4.515,
  };

  assert.equal(applyAcceptedLanding(controller, support, landing), true);
  assert.equal(controller.heading, beforeHeading,
    'support/contact geometry must never become horizontal yaw');
  assert.equal(controller.groundDirectionCalls, 1,
    'pitch/roll basis should still rebuild on the new support normal');
});
