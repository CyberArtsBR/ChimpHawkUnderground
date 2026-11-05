import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionWarning, countdownCrossing } from '../src/game/SessionCountdown.js';
test('session countdown thresholds are deterministic', () => {
  for (const t of [Infinity,90,15,10.001]) assert.equal(sessionWarning(t),'none');
  for (const t of [10,9.9,5.001]) assert.equal(sessionWarning(t),'warning');
  for (const t of [5,4.9,0]) assert.equal(sessionWarning(t),'critical');
  for (const t of [0,5,10]) assert.equal(sessionWarning(t,true),'none');
});

test('crossing 10 or 5 seconds emits exactly one prioritized cue', () => {
  assert.equal(countdownCrossing(10.1,10),10);
  assert.equal(countdownCrossing(10,9.7),0);
  assert.equal(countdownCrossing(5.1,5),5);
  assert.equal(countdownCrossing(11,4),5);
  assert.equal(countdownCrossing(4.9,4.5),0);
  assert.equal(countdownCrossing(11,9,true),0);
  assert.equal(countdownCrossing(Infinity,0),0);
});
