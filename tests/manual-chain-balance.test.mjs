import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';

function runtime() {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4000, .1, 4000),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  floor.position.y = -.05;
  floor.updateMatrixWorld(true);
  const rider = new StatefulSkillStreetPhysics({ collision: floor, spawn: [0, .2, 0], rails: [],
    playableRegions: [{ minX: -1000, maxX: 1000, minZ: -1000, maxZ: 1000 }] });
  rider.speed = 6;
  rider.velocity.set(0, 0, -6);
  return rider;
}

function tap(rider, direction) {
  rider.tricks.tick(.02);
  const events = rider.tricks.resolve({ directionTaps: [direction], steer: 0, drive: 0 }, {
    grounded: rider.grounded, grinding: Boolean(rider.grind), manual: rider.manual,
    speed: Math.abs(rider.speed), flatland: rider.flatland, bailing: rider.bailTime > 0,
  });
  rider.handleEvents(events);
  return events;
}

function sequence(rider, kind) {
  const directions = kind === 'manual' ? ['up', 'down'] : ['down', 'up'];
  assert.equal(tap(rider, directions[0]).manual, undefined);
  return tap(rider, directions[1]);
}

for (const first of ['manual', 'noseManual']) {
  const second = first === 'manual' ? 'noseManual' : 'manual';
  test(`${first} to ${second}: real direction sequence preserves continuous difficulty and score attribution`, () => {
    const rider = runtime();
    assert.equal(sequence(rider, first).manual, first);
    const previousEntry = rider.manualScoreEntry;
    rider.manualTime = 8;
    rider.manualBalance = .63;
    rider.manualInstability = .8;
    Object.assign(rider.manualBalanceState, { value: .63, velocity: .6, disturbance: .7 });
    const state = rider.manualBalanceState;
    const snapshot = { ...state };
    rider.lastFlatlandAt = rider.tricks.time;
    const cooldown = rider.lastFlatlandAt;

    assert.equal(sequence(rider, second).manual, second);

    assert.equal(rider.manual, second, 'the pose/support kind changes immediately');
    assert.equal(rider.manualTime, 8, 'challenge time must not be an animation/trick timestamp');
    assert.equal(rider.manualBalance, .63);
    assert.equal(rider.manualInstability, .8);
    assert.equal(rider.manualBalanceState, state);
    assert.deepEqual(rider.manualBalanceState, snapshot);
    assert.equal(rider.lastFlatlandAt, cooldown);
    assert.notEqual(rider.manualScoreEntry, previousEntry);
    assert.equal(rider.manualScoreEntry.name, second === 'manual' ? 'Manual' : 'Nose Manual');
    assert.ok(rider.manualScoreEntry.recordedAt > previousEntry.recordedAt,
      'new trick timestamps remain independent of accumulated balance time');
    const previousDuration = previousEntry.durationPoints;
    assert.equal(rider.updateManualBalance(.01, {}, 6), true);
    assert.equal(previousEntry.durationPoints, previousDuration);
    assert.ok(rider.manualScoreEntry.durationPoints > 0, 'held points belong to the new manual entry');
  });

  test(`${first}: a real exit/reentry restores original initial assistance and seed`, () => {
    const rider = runtime();
    sequence(rider, first);
    rider.manualTime = 7;
    rider.manualBalance = .7;
    rider.manualInstability = .9;
    Object.assign(rider.manualBalanceState, { value: .7, velocity: .5, disturbance: .8 });
    rider.endManual();

    assert.equal(sequence(rider, second).manual, second);
    assert.equal(rider.manualTime, 0);
    assert.equal(rider.manualBalance, 0);
    assert.equal(rider.manualInstability, 0);
    assert.equal(rider.manualBalanceState.value, 0);
    assert.equal(rider.manualBalanceState.velocity, 0);
    assert.equal(rider.manualBalanceState.disturbance, 0);
    assert.equal(rider.manualBalanceState.phase, second === 'noseManual' ? 2.05 : .72);
    assert.equal(rider.lastFlatlandAt, -Infinity);
  });
}

test('switching nose/tail cannot erase a flatland cooldown or its balance disturbance', () => {
  const rider = runtime();
  sequence(rider, 'manual');
  rider.handleEvents({ flatland: { name: 'Handstand', points: 300, instability: .48 } });
  const cooldown = rider.lastFlatlandAt;
  sequence(rider, 'noseManual');
  const count = rider.tricks.combo.length;
  rider.handleEvents({ flatland: { name: 'Casper', points: 250, instability: .4 } });
  assert.equal(rider.lastFlatlandAt, cooldown);
  assert.equal(rider.manualInstability, .48);
  assert.equal(rider.manualBalanceState.disturbance, .48);
  assert.equal(rider.tricks.combo.length, count, 'existing cooldown still rejects the premature flatland');
});

test('an airborne manual bridge remains queued and begins a fresh challenge at touchdown', () => {
  const rider = runtime();
  sequence(rider, 'manual');
  rider.manualTime = 6;
  rider.manualBalance = .6;
  rider.takeoff(3);
  assert.equal(rider.manual, null);
  assert.equal(sequence(rider, 'noseManual').manual, undefined);
  assert.equal(rider.tricks.pendingManual.kind, 'noseManual');
  // Exercise the actual queued-input resolution at the ground-contact seam.
  rider.setMovementState('GROUND');
  const events = tap(rider, undefined);
  assert.equal(events.manual, 'noseManual');
  assert.equal(rider.manual, 'noseManual');
  assert.equal(rider.manualTime, 0);
  assert.equal(rider.manualBalance, 0);
  assert.equal(rider.manualBalanceState.phase, 2.05);
  assert.equal(rider.tricks.pendingManual, null);
});

for (const hz of [30, 60, 120, 144]) {
  test(`${hz} Hz: repeated real manual sequences cannot refresh the balance challenge indefinitely`, () => {
    const rider = runtime();
    for (const direction of ['up', 'down']) rider.advance(1 / hz, { directionTaps: [direction] });
    const every = Math.round(hz * .4);
    let target = 'noseManual', switches = 0, maximumTime = rider.manualTime;
    for (let frame = 0; frame < hz * 12 && rider.manual; frame++) {
      const phase = frame % every;
      let directionTaps = [];
      if (phase === 0) {
        target = rider.manual === 'manual' ? 'noseManual' : 'manual';
        directionTaps = [target === 'manual' ? 'up' : 'down'];
      } else if (phase === 1) directionTaps = [target === 'manual' ? 'down' : 'up'];
      const previous = rider.manual, previousTime = rider.manualTime;
      rider.advance(1 / hz, { directionTaps });
      if (rider.manual) {
        assert.ok(rider.manualTime >= previousTime, 'continuous challenge time cannot decrease');
        maximumTime = Math.max(maximumTime, rider.manualTime);
        if (rider.manual !== previous) switches++;
      }
    }
    assert.ok(switches >= 10, `expected a repeated-switch stress case, got ${switches}`);
    assert.ok(maximumTime > 5, `difficulty never accumulated: ${maximumTime}`);
    assert.equal(rider.manual, null, 'neutral input must still lose balance despite repeated switching');
  });

  test(`${hz} Hz: opposite input still recovers both manual types after a switch`, () => {
    for (const kind of ['manual', 'noseManual']) for (const initial of [-.45, .45]) {
      const results = [];
      for (const direction of [-Math.sign(initial), Math.sign(initial)]) {
        const rider = runtime();
        sequence(rider, kind === 'manual' ? 'noseManual' : 'manual');
        rider.manualTime = 3;
        sequence(rider, kind);
        Object.assign(rider.manualBalanceState, { value: initial, velocity: 0, bias: 0, disturbance: 0 });
        rider.manualBalance = initial;
        for (let frame = 0; frame < Math.ceil(hz * .3); frame++) rider.advance(1 / hz, { drive: direction });
        assert.equal(rider.manual, kind, 'a brief correction must keep the manual active');
        assert.ok(rider.manualTime >= 3, 'correction does not refresh initial assistance');
        results.push(Math.abs(rider.manualBalance));
      }
      assert.ok(results[0] < Math.abs(initial), `${kind}/${initial}: opposite direction must recover`);
      assert.ok(results[1] > Math.abs(initial), `${kind}/${initial}: same direction must worsen`);
    }
  });
}
