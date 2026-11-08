import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TransitionController } from '../src/game/transitions/TransitionController.js';
import { HANDPLANT, HandplantSkillStreetPhysics } from '../src/game/HandplantSkillStreetPhysics.js';
import { handplantFor, HANDPLANT_TRICKS } from '../src/game/TrickCatalog.js';

const DT = 1 / 120;

/** A light stand-in skater at a synthetic vert coping (no map or renderer). */
function rider({ normalY = .2, exitRequested = false, direction = 'none' } = {}) {
  const controller = new TransitionController({ rails: [{
    name: 'synthetic-vert', points: [[-4, 2, 0], [4, 2, 0]],
    transition: { id: 'vert', type: 'VERT', axisMode: 'LINEAR', supportsVert: true, supportsTransfer: true, supportsPump: true },
  }] });
  const position = new THREE.Vector3(0, 1.88, .16);
  const normal = new THREE.Vector3(0, normalY, Math.sqrt(1 - normalY ** 2));
  const velocity = new THREE.Vector3(0, 6, -7);
  const edge = controller.launchAt(position, normal, velocity);
  assert.ok(edge, 'synthetic coping must launch');
  edge.exitRequested = exitRequested;
  const air = controller.begin(position, velocity, edge, {});
  air.frame.takeoffFacing = new THREE.Vector3(0, 0, -1);
  const s = Object.create(HandplantSkillStreetPhysics.prototype);
  const log = { tricks: [], events: [], bails: [], duration: 0 };
  Object.assign(s, {
    position, velocity, transitionAir: air, grounded: false, airTime: 0, heading: 0, airHeading: 0, airSpin: 0,
    airTakeoffFacing: new THREE.Vector3(0, 0, -1), airTakeoffHeading: 0, stance: 1,
    feedbackTime: 0, respawnTimer: 0, bailTime: 0, plantDirection: direction, handplant: null, handplantRejoin: 0,
    tricks: { time: 0, pendingAirGrab: { x: 1 }, pendingAirFlip: null, clearAirQueue() {}, addDuration(points) { log.duration += points; } },
    recordTrick(name, points) { const entry = { name, points }; log.tricks.push(entry); return entry; },
    emitGameplayEvent(type) { log.events.push(type); },
    setMovementState(state) { this.movementState = state; },
    airDirection() {},
  });
  // Bail without the full physics stack.
  s.bail = function (message) { this.handplant = null; this.handplantRejoin = 0; log.bails.push(message); this.bailTime = 1; };
  return { s, log, air, edge };
}
const hold = (s, seconds, input = () => ({ grabHeld: true })) => {
  for (let t = 0; t < seconds && s.handplant; t += DT) s.stepHandplant(DT, input(s));
};
const balanced = s => ({ grabHeld: true, drive: -Math.sign(s.handplant?.balance || 0) * Math.min(1, Math.abs(s.handplant?.balance || 0) * 6) });

test('hand plants only start at a vert coping, not on transfers or shallow lips', () => {
  assert.equal(rider().s.handplantEligible(), true);
  assert.equal(rider({ exitRequested: true }).s.handplantEligible(), false, 'deck transfer is not a plant');
  const shallow = rider({ normalY: .82 }).s;
  shallow.transitionAir.frame.surfaceNormal.set(0, .82, .57);
  assert.equal(shallow.handplantEligible(), false, 'kicker lips are not plantable');
  const flipping = rider().s; flipping.flipState = { name: 'Kickflip' };
  assert.equal(flipping.handplantEligible(), false);
});

test('stick direction picks the variant and the plant scores immediately', () => {
  assert.equal(handplantFor('none').name, 'Invert');
  assert.equal(handplantFor('upRight').name, 'Eggplant');
  assert.equal(handplantFor('downLeft').name, 'Andrecht');
  assert.equal(handplantFor('right').name, 'Sad Plant');
  for (const trick of Object.values(HANDPLANT_TRICKS)) assert.ok(trick.points > 0 && trick.holdRate > 0 && trick.grab);
  const { s, log } = rider({ direction: 'up' });
  s.beginHandplant();
  assert.equal(log.tricks[0].name, 'Eggplant');
  assert.deepEqual(s.velocity.toArray(), [0, 0, 0], 'the rider is held at the coping');
  assert.equal(s.tricks.pendingAirGrab, null, 'a buffered Grab must not also start a grab');
  assert.ok(log.events.includes('handplant'));
});

test('holding swings upside down, shows the balance meter and earns hold points', () => {
  const { s, log } = rider();
  s.beginHandplant();
  hold(s, HANDPLANT.plantTime + .5, balanced);
  assert.equal(s.handplant.phase, 'hold');
  assert.ok(Math.abs(s.handplant.angle - HANDPLANT.bodyAngle) < .35, `angle ${s.handplant.angle}`);
  assert.equal(s.balanceMode(), 'HANDPLANT');
  assert.ok(log.duration > 0, 'hold time adds points');
  assert.deepEqual(s.position.toArray(), s.handplant.origin.toArray(), 'anchored while planted');
});

test('ignoring the balance bails; correcting it keeps the plant for seconds', () => {
  const lazy = rider();
  lazy.s.beginHandplant();
  hold(lazy.s, HANDPLANT.maxHold);
  assert.equal(lazy.log.bails.length, 1, 'no correction must eventually fall');
  assert.match(lazy.log.bails[0], /coping|ramp/);
  const good = rider();
  good.s.beginHandplant();
  hold(good.s, 3, balanced);
  assert.ok(good.s.handplant && good.log.bails.length === 0, 'steady correction holds a 3 s plant');
});

test('falling past the coping lands on the deck side; falling back drops into the ramp', () => {
  for (const [sign, side] of [[1, 'deck'], [-1, 'ramp']]) {
    const { s, log } = rider();
    s.beginHandplant();
    s.handplant.balance = sign * 1;
    s.failHandplant();
    const outward = s.velocity.dot(s.transitionAir?.frame?.deckOutward || new THREE.Vector3(0, 0, -1));
    assert.ok(side === 'deck' ? /coping/.test(log.bails[0]) : /ramp/.test(log.bails[0]), log.bails[0]);
    assert.ok(side === 'deck' ? outward > 0 : outward < 0, `${side} fall direction`);
  }
});

test('releasing Grab pushes off with a 180 into a guided return flight', () => {
  const { s, air, log } = rider();
  s.beginHandplant();
  hold(s, .6, balanced);
  hold(s, HANDPLANT.releaseTime + DT * 2, () => ({ grabHeld: false }));
  assert.equal(s.handplant, null);
  assert.equal(s.transitionAir, air, 'return flight keeps the original vert frame');
  assert.equal(s.movementState, 'VERT_AIR');
  assert.ok(s.velocity.y > 0 && s.velocity.dot(air.frame.rampInward) > 0, 'pops up and back into the ramp');
  assert.ok(s.airTakeoffFacing.z > 0, 'facing turned 180 so the rider comes back in forward');
  assert.equal(s.airSpin, 0, 'the built-in 180 is not scored as a spin');
  assert.ok(Math.abs(Math.abs(s.heading) - Math.PI) < 1e-6);
  assert.ok(s.handplantRejoin > 0, 'feet are still finding the board');
  assert.ok(log.events.includes('handplantRelease'));
});

test('touching down before the feet are back on the board bails', () => {
  const { s, log } = rider();
  s.handplantRejoin = .1;
  assert.equal(s.land({}), true);
  assert.equal(log.bails.length, 1);
});
