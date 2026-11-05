import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TransitionController } from '../src/game/transitions/TransitionController.js';
import { evaluatePumpEligibility } from '../src/game/PumpSystem.js';
import { VERT_RETURN, resolveVertReturnVelocity } from '../src/game/transitions/VertReturnFlight.js';
import { resolveTransferFlightStep } from '../src/game/core/TransferFlightResult.js';
import { supportMatchesOriginalTransition } from '../src/game/core/TransitionReentryResult.js';
import { resolveTransferLaunchResult } from '../src/game/core/TransferLaunchResult.js';
import { RAMP_WALL_SAFETY } from '../src/game/RampWallSafetySkillStreetPhysics.js';
import { DECK_AWARE_EXIT } from '../src/game/DeckAwareRampExitSkillStreetPhysics.js';
import { SAFE_COPING_EXIT, SafeCopingExitSkillStreetPhysics } from '../src/game/SafeCopingExitSkillStreetPhysics.js';

const DT = 1 / 120;
const GRAVITY = 20;
function scene({ normalY = .24, side = 0, speed = 7, rise = 4.5,
  requestedExit = false, supportsTransfer = true, inward = 1 } = {}) {
  const rail = {
    name: 'synthetic-halfpipe',
    points: [[-4, 2, 0], [4, 2, 0]],
    transition: { id: 'halfpipe', type: 'VERT', axisMode: 'LINEAR',
      supportsVert: true, supportsTransfer, supportsPump: true },
  };
  const controller = new TransitionController({ rails: [rail] });
  const position = new THREE.Vector3(0, 1.88, .16 * inward);
  const normal = new THREE.Vector3(0, normalY,
    Math.sqrt(1 - normalY ** 2) * inward);
  const velocity = new THREE.Vector3(side, rise, -speed * inward);
  const before = velocity.clone();
  const edge = controller.launchAt(position, normal, velocity);
  assert.ok(edge, 'explicitly authored launch not detected');
  edge.exitRequested = requestedExit;
  const air = controller.begin(position, velocity, edge, { launchBoost: 3.0 });
  return { controller, position, velocity, before, edge, air };
}
function sample(state, steps, dt) {
  const snapshots = [];
  for (let i = 0; i < steps; i++) {
    state.velocity.y -= GRAVITY * dt;
    state.controller.advance(state.air, state.position, state.velocity, {}, dt);
    state.position.addScaledVector(state.velocity, dt);
    if (i % 12 === 0) snapshots.push({
      x: state.position.x, y: state.position.y, z: state.position.z,
      vx: state.velocity.x, vy: state.velocity.y, vz: state.velocity.z,
    });
  }
  return snapshots;
}

test('diagonal coping launch keeps true along-lip momentum, with one finite energy budget', () => {
  const s = scene({ side: 5.2, speed: 7.2, normalY: .2 });
  const lateral = s.velocity.dot(s.edge.copingTangent);
  assert.ok(lateral > 5, 'diagonal launch was incorrectly clamped to 1.1 m/s');
  assert.ok(s.velocity.dot(s.edge.deckOutward) > 1.0, 'steep coping zeroed all outward inertia');
  assert.ok(s.velocity.lengthSq() <= s.before.lengthSq() + (3 * .82) ** 2 + 1e-8);
  assert.equal(s.air.mode, 'return');
  assert.equal(s.air.frame.incomingSpeed, s.before.length());
});

test('low-lateral steep approach keeps near-zero horizontal drift without ejecting onto deck', () => {
  const s = scene({ side: 0, speed: 7, normalY: .2, inward: -1 });
  assert.ok(s.velocity.dot(s.edge.deckOutward) > 0);
  assert.ok(s.velocity.dot(s.edge.deckOutward) <= 1.65 + 1e-9);
  const path = sample(s, 90, DT);
  assert.ok(path.every(point => Object.values(point).every(Number.isFinite)));
  assert.ok(s.velocity.y < 0, 'gravity must pass the apex on repeated halfpipe return');
  assert.ok(Math.abs(s.position.z) < VERT_RETURN.maxPlaneError + 1);
});

test('shallow lip and flat seam cannot invent a radial transfer launch', () => {
  const s = scene({ normalY: .82, side: .65 });
  assert.ok(Math.abs(s.air.launchHorizontal.dot(s.edge.rampInward)) < 1e-9);
  assert.ok(s.air.launchHorizontal.dot(s.edge.copingTangent) > .6);
  assert.equal(s.controller.launchAt(s.position, new THREE.Vector3(0, 1, 0),
    s.before), null);
});

test('straight and diagonal returns remain stable across 60 Hz and 120 Hz', () => {
  for (const side of [0, 3.8, -4.1]) {
    const fast = scene({ side }), slow = scene({ side });
    sample(fast, 96, 1 / 120);
    sample(slow, 48, 1 / 60);
    assert.ok(fast.position.distanceTo(slow.position) < .20,
      'frame rate changed trajectory beyond fixed-step tolerance');
    assert.ok(fast.velocity.distanceTo(slow.velocity) < .25);
    assert.ok(fast.velocity.x * (side || 1) >= -1e-6,
      'return steering reversed lateral momentum before reaching corridor');
  }
});

test('held forward is not transfer; unsupported lip never accepts Up exit', () => {
  const s = scene({ supportsTransfer: false, requestedExit: true });
  assert.equal(s.air.transferring, false);
  s.velocity.y = -.1;
  s.controller.advance(s.air, s.position, s.velocity, { vertExit: true, drive: 1 }, DT);
  assert.equal(s.air.transferring, false);
});

test('low-energy requested transfer aborts without manufacturing upward or outward speed', () => {
  const s = scene({ speed: 1.4, rise: .6, requestedExit: true });
  assert.equal(s.air.transferring, false);
  const result = resolveTransferLaunchResult({
    frame: s.air.frame, incomingSpeed: 2.2, launchVertical: 1.0,
    lateralVelocity: 0, deck: null, gravity: GRAVITY,
    transferConfig: RAMP_WALL_SAFETY,
    deckConfig: DECK_AWARE_EXIT,
    copingConfig: SAFE_COPING_EXIT,
  });
  assert.equal(result.active, true);
  assert.equal(result.transferring, false);
  assert.equal(result.exitControl.abortToReturn, true);
  assert.equal(result.exitControl.insufficientEnergy, true);
  assert.ok(result.velocity.y <= 1);
  assert.ok(result.velocity.clone().setY(0).length() <= .35);
});

test('deck-target transfer uses acceleration-limited air correction and never edits ballistic Y', () => {
  const s = scene();
  const air = {
    ...s.air, age: .25, apexPassed: true,
    exitControl: { geometryAware: true, abortToReturn: false,
      horizontalSpeed: 2.0, targetPoint: new THREE.Vector3(0, 2, -1.1) },
  };
  const position = new THREE.Vector3(.2, 2.6, -.4);
  const velocity = new THREE.Vector3(3.5, -1.8, -2);
  const original = velocity.clone();
  const result = resolveTransferFlightStep({ air, position, velocity, dt: DT,
    config: RAMP_WALL_SAFETY });
  assert.equal(result.branch, 'deck-target');
  assert.ok(result.velocity.clone().setY(0).distanceTo(original.clone().setY(0))
    <= 9 * DT + 1e-9, 'air control injected excessive horizontal impulse');
  assert.equal(result.velocity.y, original.y);
  assert.deepEqual(velocity.toArray(), original.toArray(), 'pure solver mutated input');
});

test('guided return responds with bounded acceleration, not instantaneous lateral clip', () => {
  const s = scene({ side: 5 });
  const start = new THREE.Vector3(5, -1.4, -.4);
  const result = resolveVertReturnVelocity(s.air,
    new THREE.Vector3(0, 2.2, .3), start, DT);
  assert.ok(result.guided);
  assert.ok(result.velocity.clone().setY(0).distanceTo(start.clone().setY(0))
    <= VERT_RETURN.acceleration * DT + 1e-8);
  assert.ok(result.velocity.x > 4.8, 'legacy 1.4 m/s clip destroyed diagonal momentum');
});

test('verified deck transfer cannot be stolen by original-wall emergency sweep', () => {
  const physics = Object.create(SafeCopingExitSkillStreetPhysics.prototype);
  physics.ensureBoardContact = () => { throw Error('must not sweep return wall'); };
  const transferred = { transferring: true, exitControl: {
    geometryAware: true, abortToReturn: false } };
  assert.equal(physics.tryContinuousTransitionReentry(transferred,
    new THREE.Vector3()), false);
});

test('pump detects continuous bowl compression but rejects a hard stair seam', () => {
  const baseline = { contactCount: 4, normalY: Math.cos(Math.PI / 4),
    tangentSpeed: 7, ridingAlignment: 1, normalDelta: .08, contactSpread: .10 };
  assert.equal(evaluatePumpEligibility(baseline).eligible, true);
  assert.equal(evaluatePumpEligibility({ ...baseline,
    normalDelta: .72, contactSpread: .70 }).eligible, false);
  assert.equal(evaluatePumpEligibility({ ...baseline, contactCount: 2 }).eligible, false);
});

test('nearby perpendicular rails cannot hijack a genuine quarter coping', () => {
  const rails = [
    { name: 'quarter', points: [[-4, 2, 0], [4, 2, 0]],
      transition: { id: 'quarter', type: 'QUARTER', supportsVert: true } },
    { name: 'crossing', points: [[.03, 2, -4], [.03, 2, 4]],
      transition: { id: 'crossing', type: 'QUARTER', supportsVert: true } },
  ];
  const controller = new TransitionController({ rails });
  const normal = new THREE.Vector3(0, .4, Math.sqrt(1 - .4 ** 2));
  const edge = controller.launchAt(new THREE.Vector3(0, 1.9, .15),
    normal, new THREE.Vector3(0, 4, -7));
  assert.equal(edge?.transitionId, 'quarter');
});

test('diagonal bowl/halfpipe return can reconnect along real coping, not only at takeoff', () => {
  const s = scene({ side: 5.2, normalY: .2 });
  const normal = new THREE.Vector3(0, .7, Math.sqrt(1 - .7 ** 2));
  const support = { position: new THREE.Vector3(3.5, 1.3, .55),
    normal, supported: true, count: 4 };
  assert.ok(s.air.frame.lipPath?.length >= 2);
  assert.equal(supportMatchesOriginalTransition(support, s.air,
    SAFE_COPING_EXIT), true, 'skater 3.5 m along real coping should be eligible');
  assert.equal(supportMatchesOriginalTransition({
    ...support, position: new THREE.Vector3(6.1, 1.3, .55),
  }, s.air, SAFE_COPING_EXIT), false,
  'support far past authored rail endpoint must not hijack landing');
});
