import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import {
  RAMP_WALL_SAFETY,
  controlledTransferOutwardSpeed,
  controlledTransferProfile,
  isControlledDeckExitTouchdown,
  wallRecoveryContextAllows,
} from '../src/game/RampWallSafetySkillStreetPhysics.js';
import {
  DECK_AWARE_EXIT,
  deckAwareLaunchSpeed,
  scanDeckTransferTarget,
  supportMatchesDeckTarget,
} from '../src/game/DeckAwareRampExitSkillStreetPhysics.js';
import { MOVEMENT_STATE, PHYSICS } from '../src/game/StreetPhysics.js';

function flatWallWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.1, 12),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  floor.position.y = -0.05;
  root.add(floor);

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(5, 2.4, 0.10),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  wall.position.set(0, 1.2, -0.34);
  wall.userData.surface = 'solid';
  root.add(wall);
  root.updateMatrixWorld(true);
  return root;
}

function narrowDeckWorld(depth = 0.82, includeLowerFloor = true) {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, depth), material);
  deck.position.set(0, 0.94, -depth * 0.5);
  root.add(deck);
  if (includeLowerFloor) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.1, 12), material.clone());
    floor.position.y = -0.05;
    root.add(floor);
  }
  root.updateMatrixWorld(true);
  return root;
}

function physics(root = flatWallWorld()) {
  return new StatefulSkillStreetPhysics({
    collision: root,
    spawn: [0, 0.5, 1.5],
    rails: [],
  });
}

function exitFrame() {
  return {
    lipPoint: new THREE.Vector3(0, 1, 0),
    deckOutward: new THREE.Vector3(0, 0, -1),
    rampInward: new THREE.Vector3(0, 0, 1),
    copingTangent: new THREE.Vector3(1, 0, 0),
    returnTarget: new THREE.Vector3(0, 0.96, 0.28),
  };
}

test('steep ramp context remains excluded from legacy wall classification', () => {
  assert.equal(wallRecoveryContextAllows({
    groundNormalY: 0.72,
    verticalSpeed: 5.4,
    hitNormalY: 0.01,
  }), false);
  assert.equal(wallRecoveryContextAllows({
    groundNormalY: 0.98,
    verticalSpeed: 2.1,
    hitNormalY: 0.01,
  }), false);
});

test('real wall has zero automatic yaw authority in final gameplay physics', () => {
  const p = physics();
  p.position.set(0, 0.015, 0);
  p.normal.set(0, 1, 0);
  p.heading = 0.37;
  p.groundDirection();
  p.setMovementState(MOVEMENT_STATE.GROUND);
  p.velocity.copy(p.forward).multiplyScalar(8);
  p.rollingSign = 1;
  p.wallImpactCooldown = 0;

  const heading = p.heading;
  assert.equal(p.detectGroundWallImpact(1 / 120), null,
    'final runtime must not request an automatic wall turn');
  assert.equal(p.applyWallRecovery({
    point: new THREE.Vector3(0, 0.3, -0.3),
    normal: new THREE.Vector3(0, 0, 1),
    speed: 8,
    broadWall: true,
  }), false);
  assert.equal(p.heading, heading, 'wall contact must preserve player yaw');
});

test('high-speed bowl exit is range bounded instead of 12.8 m/s cannon', () => {
  const profile = controlledTransferProfile(20, 12.5);
  assert.ok(profile.horizontalSpeed <= 6.4, `horizontal exit too fast: ${profile.horizontalSpeed}`);
  assert.ok(profile.verticalSpeed <= 7.2, `vertical exit too strong: ${profile.verticalSpeed}`);
  assert.ok(profile.targetDistance <= 2.55, `deck target too far: ${profile.targetDistance}`);
  assert.ok(profile.targetDistance >= 1.15);
});

test('controlled transfer decelerates after apex instead of accelerating toward void', () => {
  const profile = controlledTransferProfile(20, 12.5);
  const beforeApex = controlledTransferOutwardSpeed({
    apexPassed: false,
    outwardDistance: 1,
    targetDistance: profile.targetDistance,
    initialSpeed: profile.horizontalSpeed,
    age: 0.2,
  });
  const afterTarget = controlledTransferOutwardSpeed({
    apexPassed: true,
    outwardDistance: profile.targetDistance + 0.8,
    targetDistance: profile.targetDistance,
    initialSpeed: profile.horizontalSpeed,
    age: 0.6,
  });
  assert.ok(beforeApex > afterTarget,
    `transfer should slow after apex: ${beforeApex} -> ${afterTarget}`);
  assert.ok(afterTarget <= RAMP_WALL_SAFETY.exitLandingMaxSpeed);
});

test('simulated bowl exit stays inside a short deck landing corridor', () => {
  const p = physics();
  p.position.set(0, 0.1, 0);
  const profile = controlledTransferProfile(20, 12.5);
  p.velocity.set(0, profile.verticalSpeed, -profile.horizontalSpeed);
  p.transitionAir = {
    mode: 'transfer',
    transferring: true,
    apexPassed: false,
    age: 0,
    lateralVelocity: 0,
    launchVertical: profile.verticalSpeed,
    exitControl: profile,
    frame: {
      lipPoint: new THREE.Vector3(0, 0, 0),
      deckOutward: new THREE.Vector3(0, 0, -1),
      copingTangent: new THREE.Vector3(1, 0, 0),
    },
  };

  const dt = 1 / 120;
  for (let i = 0; i < 120; i++) {
    p.velocity.y -= PHYSICS.gravity * dt;
    p.advanceControlledTransfer(p.transitionAir, dt);
    p.position.addScaledVector(p.velocity, dt);
  }
  const outward = -p.position.z;
  assert.ok(outward > 1.0, `exit did not clear coping: ${outward}`);
  assert.ok(outward < 4.3, `exit still overshot deck corridor: ${outward}`);
});

test('one-wheel flat deck touchdown is only bridged during controlled coping exit', () => {
  const support = {
    count: 1,
    frontSupported: 1,
    rearSupported: 0,
    normal: new THREE.Vector3(0, 1, 0),
  };
  assert.equal(isControlledDeckExitTouchdown(support, {
    transferring: true,
  }), true);
  assert.equal(isControlledDeckExitTouchdown(support, null), false,
    'ordinary flat-air landing must keep the stricter rule');
  assert.equal(isControlledDeckExitTouchdown({ ...support, count: 0 }, {
    transferring: true,
  }), false);
});

test('latest video: narrow quarter deck chooses a landing INSIDE its real width', () => {
  const p = physics(narrowDeckWorld(0.82));
  const target = scanDeckTransferTarget(p.surface, exitFrame());
  assert.ok(target, 'narrow deck should be detected behind coping');
  assert.ok(target.endDistance < 0.9,
    `scanner incorrectly believes narrow deck continues: ${target.endDistance}`);
  assert.ok(target.targetDistance >= 0.25 && target.targetDistance <= 0.78,
    `landing target must stay inside 0.82m deck, got ${target.targetDistance}`);
  assert.ok(target.usableWidth < 1.0,
    `narrow quarter should not inherit old 1.15m minimum transfer, width=${target.usableWidth}`);
});

test('latest video: narrow deck automatically receives a slower horizontal exit', () => {
  const speed = deckAwareLaunchSpeed(0.54, 5.2);
  assert.ok(speed >= DECK_AWARE_EXIT.launchHorizontalMin);
  assert.ok(speed < 2.0,
    `0.54m deck target should not use old multi-metre cannon speed, got ${speed}`);
});

test('latest video: lower floor below platform cannot become a late deck landing', () => {
  const air = {
    transferring: true,
    frame: exitFrame(),
    exitControl: {
      geometryAware: true,
      abortToReturn: false,
      startDistance: 0.22,
      endDistance: 0.70,
      targetPoint: new THREE.Vector3(0, 1, -0.46),
    },
  };
  const correctDeck = {
    position: new THREE.Vector3(0, 1, -0.50),
    normal: new THREE.Vector3(0, 1, 0),
  };
  const lowerVoidFloor = {
    position: new THREE.Vector3(0, 0, -0.50),
    normal: new THREE.Vector3(0, 1, 0),
  };
  assert.equal(supportMatchesDeckTarget(correctDeck, air), true);
  assert.equal(supportMatchesDeckTarget(lowerVoidFloor, air), false,
    'floor under the quarter must never produce the delayed align-board bail from the video');
});

test('latest video: missing deck behind coping returns null instead of inventing transfer distance', () => {
  const p = physics(narrowDeckWorld(0.82, true));
  const frame = exitFrame();
  frame.lipPoint.set(0, 2.2, 0);
  const target = scanDeckTransferTarget(p.surface, frame);
  assert.equal(target, null, 'no real deck must mean no outward transfer target');
});
