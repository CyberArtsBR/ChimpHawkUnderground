import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretAirTurn } from '../src/input/InputInterpreter.js';
import {
  AIR_CONTROL,
  resolveAirMotion,
} from '../src/game/core/AirController.js';

test('air motion preserves heading when there is no deliberate turn input', () => {
  const result = resolveAirMotion({
    airHeading: 0.35,
    airSpin: 0,
    turnInput: 0,
    velocityY: 4,
    gravity: 20,
    dt: 1 / 120,
  });
  assert.ok(Math.abs(result.airSpin) < 1e-12);
  assert.ok(Math.abs(result.heading - 0.35) < 1e-12);
  assert.ok(Math.abs(result.velocityY - (4 - 20 / 120)) < 1e-12);
});

test('direction taps preserve heading, deliberately held directions rotate after grace', () => {
  const dt = 1 / 120;
  const turn = interpretAirTurn({ steer: 1, spin: 0 });
  let result = resolveAirMotion({ airHeading: 0.35, turnInput: turn, dt });
  assert.equal(turn, 1);
  assert.equal(result.airSpin, 0, 'a single trick-direction tap must not rotate the skater');
  for (let i = 0; i < 20; i++) {
    result = resolveAirMotion({
      airHeading: 0.35, airSpin: result.airSpin, turnInput: turn,
      turnHoldTime: result.turnHoldTime, previousTurnDirection: result.turnDirection, dt,
    });
  }
  assert.ok(result.airSpin < -0.2, 'intentional held steering must rotate in air');
  assert.ok(result.heading < 0.35);
});

test('bumper spin overrides directional tricks instead of double-counting turns', () => {
  assert.equal(interpretAirTurn({ steer: 0.6, spin: 0.7 }), 0.7);
  assert.equal(interpretAirTurn({ steer: -0.6, spin: -0.7 }), -0.7);
  assert.equal(interpretAirTurn({ steer: 0.6, spin: -0.2 }), -0.2);
  assert.equal(interpretAirTurn({ steer: 0.6, spin: 0 }), 0.6);
  assert.equal(interpretAirTurn({ steer: 0.6, spin: 99 }), 1);
});

test('direct bumper rotation is immediate and clamped independently from contact geometry', () => {
  const dt = 1 / 120;
  const result = resolveAirMotion({
    airHeading: 0, airSpin: 0, turnInput: 99, directSpinInput: 1,
    velocityY: 0, gravity: 0, dt,
  });
  assert.ok(Math.abs(result.airSpin + AIR_CONTROL.maxTurnInput * AIR_CONTROL.turnRate * dt) < 1e-12);
  assert.equal('normal' in result, false);
  assert.equal('headingFromContact' in result, false);
});
