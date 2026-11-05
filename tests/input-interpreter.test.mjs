import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OLLIE_COMMAND,
  interpretOllieRelease,
} from '../src/input/InputInterpreter.js';

test('no release emits no semantic command', () => {
  assert.equal(interpretOllieRelease({ grounded: true }), OLLIE_COMMAND.NONE);
});

test('grind release has highest priority and becomes Ollie Out', () => {
  assert.equal(interpretOllieRelease({
    ollieReleased: true,
    grinding: true,
    grounded: true,
    nearCoping: true,
    pumpEligible: true,
    pumpHoldTime: 1,
  }), OLLIE_COMMAND.GRIND_OLLIE_OUT);
});

test('authored coping release wins over pump and becomes vert ollie', () => {
  assert.equal(interpretOllieRelease({
    ollieReleased: true,
    grounded: true,
    nearCoping: true,
    pumpEligible: true,
    pumpHoldTime: 0.5,
  }), OLLIE_COMMAND.VERT_OLLIE);
});

test('eligible charged release becomes pump', () => {
  assert.equal(interpretOllieRelease({
    ollieReleased: true,
    grounded: true,
    pumpEligible: true,
    pumpHoldTime: 0.12,
    pumpCooldown: 0,
    pumpMinHold: 0.075,
  }), OLLIE_COMMAND.PUMP);
});

test('pump cooldown consumes the release without converting it into ollie', () => {
  assert.equal(interpretOllieRelease({
    ollieReleased: true,
    grounded: true,
    pumpEligible: true,
    pumpHoldTime: 0.12,
    pumpCooldown: 0.1,
    pumpMinHold: 0.075,
  }), OLLIE_COMMAND.PUMP_BLOCKED);
});

test('short or ineligible grounded release remains a normal ollie', () => {
  assert.equal(interpretOllieRelease({
    ollieReleased: true,
    grounded: true,
    pumpEligible: true,
    pumpHoldTime: 0.02,
  }), OLLIE_COMMAND.OLLIE);
  assert.equal(interpretOllieRelease({
    ollieReleased: true,
    grounded: true,
    pumpEligible: false,
    pumpHoldTime: 0.5,
  }), OLLIE_COMMAND.OLLIE);
});

test('airborne release is classified but does not invent a ground action', () => {
  assert.equal(interpretOllieRelease({
    ollieReleased: true,
    grounded: false,
  }), OLLIE_COMMAND.AIR_RELEASE);
});
