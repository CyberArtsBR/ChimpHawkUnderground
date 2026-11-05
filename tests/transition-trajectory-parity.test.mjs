import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { TransitionController } from '../src/game/transitions/TransitionController.js';
import { VERT_RETURN } from '../src/game/transitions/VertReturnFlight.js';
import { appendExtensionHalfpipeRails } from '../src/park/ExpandedPark.js';

const manifest = JSON.parse(fs.readFileSync(
  new URL('../public/assets/park/park-manifest.json', import.meta.url),
  'utf8',
));
appendExtensionHalfpipeRails(manifest);

const DT = 1 / 120;
const GRAVITY = 20;
const EPS = 1e-9;

function sampleForTransition(transition) {
  const a = transition.lipPath[0];
  const b = transition.lipPath[1];
  const tangent = b.clone().sub(a).setY(0).normalize();
  const rampInward = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
  const deckOutward = rampInward.clone().negate();
  const lip = a.clone().lerp(b, 0.5);
  const position = lip.clone().addScaledVector(rampInward, 0.18);
  position.y -= 0.10;
  const normal = rampInward.clone().multiplyScalar(0.57)
    .addScaledVector(new THREE.Vector3(0, 1, 0), 0.82)
    .normalize();
  const velocity = deckOutward.clone().multiplyScalar(6.2)
    .addScaledVector(tangent, 0.65)
    .add(new THREE.Vector3(0, 4.4, 0));
  return { position, normal, velocity };
}

function beginCanonical(controller, transition, launchBoost = 3.2) {
  const sample = sampleForTransition(transition);
  const edge = controller.launchAt(sample.position, sample.normal, sample.velocity);
  assert.ok(edge, `${transition.id} missing canonical launch candidate`);

  const velocity = sample.velocity.clone();
  const boardForward = sample.velocity.clone().setY(0).normalize();
  const air = controller.begin(sample.position, velocity, edge, {
    boardForward,
    launchBoost,
  });
  return {
    edge,
    air,
    velocity,
    position: sample.position.clone(),
  };
}

test('canonical begin uses one local-plane return contract on every authored vert transition', () => {
  const controller = new TransitionController({ rails: manifest.rails });
  const transitions = controller.transitions.filter(transition => transition.supportsVert);
  assert.equal(transitions.length, 9);

  for (const transition of transitions) {
    const { edge, air, velocity } = beginCanonical(controller, transition);
    assert.equal(air.transitionId, transition.id);
    assert.equal(air.transitionType, transition.type);
    assert.equal(air.mode, 'return');
    assert.equal(air.transferring, false);
    assert.equal(air.exitRequested, false);

    const radialLaunch = air.launchHorizontal.dot(edge.rampInward);
    const lateralLaunch = air.launchHorizontal.dot(edge.copingTangent);
    assert.ok(Math.abs(radialLaunch) < EPS,
      `${transition.id} invented radial takeoff drift: ${radialLaunch}`);
    assert.ok(Math.abs(lateralLaunch) <= 1.1 + EPS,
      `${transition.id} lateral takeoff exceeded bound: ${lateralLaunch}`);
    assert.ok(Math.abs(velocity.y - air.launchVertical) < EPS);

    const returnOffset = air.frame.returnTarget.clone().sub(edge.lipPoint);
    assert.ok(Math.abs(returnOffset.dot(edge.rampInward) - 0.30) < EPS,
      `${transition.id} return target is not 0.30m ramp-side`);
  }
});

test('canonical return flight stays finite, local-plane bounded, and ignores held forward', () => {
  const controller = new TransitionController({ rails: manifest.rails });
  const transition = controller.get('eastern-quarter');
  const state = beginCanonical(controller, transition);

  for (let frame = 0; frame < 120; frame++) {
    state.velocity.y -= GRAVITY * DT;
    const verticalBefore = state.velocity.y;
    controller.advance(state.air, state.position, state.velocity, { drive: 1 }, DT);

    assert.ok(Number.isFinite(state.velocity.x));
    assert.ok(Number.isFinite(state.velocity.y));
    assert.ok(Number.isFinite(state.velocity.z));
    assert.ok(Math.abs(state.velocity.y - verticalBefore) < EPS,
      'vert return guidance must preserve vertical velocity');

    if (!state.air.returnGuideLost) {
      const radial = state.velocity.dot(state.air.frame.rampInward);
      const lateral = state.velocity.dot(state.air.frame.copingTangent);
      assert.ok(Math.abs(radial) <= VERT_RETURN.maxRadialSpeed + EPS);
      assert.ok(Math.abs(lateral) <= VERT_RETURN.maxLateralSpeed + EPS);
    }
    state.position.addScaledVector(state.velocity, DT);
  }

  assert.equal(state.air.apexPassed, true);
  assert.equal(state.air.exitRequested, false,
    'holding forward must not request a transfer');
  assert.equal(state.air.transferring, false);
  assert.equal(state.air.mode, 'return');
});

test('explicit vert-exit can arm before apex but transfer begins only after apex', () => {
  const controller = new TransitionController({ rails: manifest.rails });
  const transition = controller.get('eastern-quarter');
  const state = beginCanonical(controller, transition, 2.4);

  assert.ok(state.velocity.y > 0);
  controller.advance(state.air, state.position, state.velocity, { vertExit: true }, DT);
  assert.equal(state.air.exitRequested, true);
  assert.equal(state.air.transferring, false);

  state.velocity.y = -0.1;
  controller.advance(state.air, state.position, state.velocity, {}, DT);
  assert.equal(state.air.apexPassed, true);
  assert.equal(state.air.transferring, true);
  assert.equal(state.air.mode, 'transfer');
});

test('fresh Up tap after apex requests transfer while held drive alone does not', () => {
  const controller = new TransitionController({ rails: manifest.rails });
  const transition = controller.get('eastern-quarter');
  const state = beginCanonical(controller, transition, 2.4);

  state.velocity.y = -0.1;
  controller.advance(state.air, state.position, state.velocity, { drive: 1 }, DT);
  assert.equal(state.air.apexPassed, true);
  assert.equal(state.air.exitRequested, false);
  assert.equal(state.air.transferring, false);

  controller.advance(state.air, state.position, state.velocity, {
    directionTaps: ['up'],
  }, DT);
  assert.equal(state.air.exitRequested, true);
  assert.equal(state.air.transferring, true);
  assert.equal(state.air.mode, 'transfer');
});

test('presentation normal stays finite and converges toward world up near the apex', () => {
  const controller = new TransitionController({ rails: manifest.rails });
  const transition = controller.get('eastern-quarter');
  const { air } = beginCanonical(controller, transition);

  const fast = controller.presentationNormal(air, air.launchVertical);
  const apex = controller.presentationNormal(air, 0);
  for (const normal of [fast, apex]) {
    assert.ok(Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z));
    assert.ok(Math.abs(normal.length() - 1) < 1e-9);
  }
  assert.ok(apex.y > fast.y, 'presentation normal should level toward world up near apex');
});
