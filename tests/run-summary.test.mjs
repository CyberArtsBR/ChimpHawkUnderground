import test from 'node:test';
import assert from 'node:assert/strict';
import { RunSummary } from '../src/game/RunSummary.js';
import { SkateTricks } from '../src/game/SkateTricks.js';

function skater(extra = {}) {
  return { speed: 5, distance: 0, position: { x: 0, y: 0, z: 0 }, grounded: true,
    bailTime: 0, grind: null, manual: null, wallRide: null, respawnSerial: 0, ...extra };
}

function bank(summary, scorer, timing = {}) {
  const entries = scorer.combo.map(entry => ({ ...entry }));
  const durationSeconds = scorer.comboDuration();
  const result = scorer.settle();
  return summary.recordCombo({ ...result, entries, durationSeconds, ...timing });
}

test('run summary reports only banked tricks and keeps repeat penalties factual', () => {
  const run = new RunSummary();
  const scorer = new SkateTricks();
  scorer.record('Kickflip', 100);
  scorer.tick(0.2);
  scorer.record('Kickflip', 100);
  scorer.addDuration(10, scorer.combo[1]);
  const moment = bank(run, scorer, { startTime: 3, endTime: 5 });
  assert.equal(moment.points, 366); // (100 + 75 + rounded 7.5 duration) × 2
  assert.deepEqual([moment.startTime, moment.endTime], [3, 5]);
  scorer.record('Impossible', 1000);
  scorer.cancelCombo(); // a lost combo must contribute no tricks or points
  const result = run.finish();
  assert.equal(result.totalScore, 366);
  assert.equal(result.landedCombos, 1);
  assert.equal(result.tricksLanded, 2);
  assert.deepEqual(result.uniqueTricks, ['Kickflip']);
  assert.deepEqual(result.runTopTricks.map(trick => trick.points), [200, 165]);
  assert.equal(result.scoreBreakdown.subtotal, 366);
  assert.equal(result.scoreBreakdown.multiplierPercent, 105);
  assert.equal(result.finalScore, 384);
});

test('only the three highest accepted combos become highlight candidates', () => {
  const run = new RunSummary();
  for (const points of [50, 800, 200, 1600, 400]) {
    run.recordCombo({ points, names: `Trick ${points}`, entries: [{ name: `Trick ${points}`, points }], endTime: 8, startTime: 6 });
  }
  assert.equal(run.recordCombo(null), null);
  assert.equal(run.recordCombo({ points: 0, names: 'Lost' }), null);
  const result = run.finish();
  assert.deepEqual(result.highlights.map(moment => moment.points), [1600, 800, 400]);
  assert.equal(result.bestCombo.label, 'Trick 1600');
  assert.equal(result.totalScore, 3050);
  assert.equal(result.scoreBreakdown.comboBonus, 0);
  assert.equal(result.scoreBreakdown.trickBonus, 0);
  assert.equal(result.finalScore, 3813);
});

test('distance uses actual physics path and excludes bails, resets and teleports', () => {
  const rider = skater();
  const run = new RunSummary().begin({}, rider);
  rider.distance = 2;
  rider.position.x = 100; // presented location does not override the path counter
  run.update(rider, 0.2);
  rider.bailTime = 1;
  run.update(rider, 0.2);
  run.update(rider, 0.2);
  rider.bailTime = 0;
  rider.respawnSerial = 1;
  rider.distance = 0;
  run.update(rider, 0.2);
  rider.distance = 1;
  run.update(rider, 0.2);
  rider.distance = 500;
  run.update(rider, 0.2);
  rider.distance = 501;
  run.update(rider, 0.2);
  rider.bailTime = 1;
  run.update(rider, 0.2);
  const result = run.finish();
  assert.equal(result.distanceMeters, 4);
  assert.equal(result.bails, 2);
  assert.equal(result.scoreBreakdown.bailPenalty, 500);
  assert.equal(result.finalScore, 0);
});

test('air, manual, grind and speed achievements observe active skating only', () => {
  const rider = skater();
  const run = new RunSummary().begin({ practice: true, mapName: 'ORBIT' }, rider);
  rider.grounded = false;
  run.update(rider, 0.5);
  run.update(rider, 0.5);
  rider.grind = { speed: 5 };
  rider.distance = 2;
  run.update(rider, 0.5);
  rider.grind = null;
  rider.grounded = true;
  rider.manual = 'manual';
  run.update(rider, 0.5);
  run.update(rider, 0.5);
  rider.manual = null;
  rider.speed = 10;
  run.update(rider, 0.5);
  rider.bailTime = 1;
  rider.speed = 100;
  run.update(rider, 0.5);
  const result = run.finish();
  assert.equal(result.airTime, 1);
  assert.equal(result.maxAirTime, 1);
  assert.equal(result.manualSeconds, 1);
  assert.equal(result.longestManualSeconds, 1);
  assert.equal(result.grindDistanceMeters, 2);
  assert.equal(result.topSpeedKmh, 36);
  assert.equal(result.durationSeconds, 3.5);
  assert.equal(result.practice, true);
  assert.ok(result.achievements.find(item => item.kind === 'air'));
  assert.ok(result.achievements.find(item => item.kind === 'manual'));
  assert.ok(result.achievements.find(item => item.kind === 'grind'));
});

test('final summary uses authoritative score, freezes details and stops recording', () => {
  const run = new RunSummary().begin({ riderName: 'Tuxr', deckName: 'First deck', mapName: 'Warehouse' });
  run.recordCombo({ points: 400, names: 'Kickflip', entries: [{ name: 'Kickflip', points: 400 }] });
  const result = run.finish({ totalScore: 600, durationSeconds: 90 });
  assert.equal(result.durationSeconds, 90);
  assert.equal(result.riderName, 'Tuxr');
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.bestCombo));
  assert.ok(Object.isFrozen(result.highlights[0]));
  assert.equal(result.totalScore, 600);
  assert.equal(result.scoreBreakdown.bankedScore, 600);
  assert.equal(result.finalScore, 630);
  assert.ok(Object.isFrozen(result.scoreBreakdown));
  assert.throws(() => { result.scoreBreakdown.finalScore = 1; }, TypeError);
  assert.throws(() => { result.highlights[0].points = 1; }, TypeError);
  run.update(skater(), 20);
  assert.equal(run.recordCombo({ points: 800 }), null);
  assert.equal(run.finish({ totalScore: 999 }), result);
  run.begin({ practice: true });
  assert.equal(run.finish().totalScore, 0);
});

test('empty and malformed runs report zero metrics without invented achievements', () => {
  const run = new RunSummary();
  run.update(null, 1);
  run.update(skater(), NaN);
  run.update(skater(), -1);
  assert.equal(run.recordCombo({ points: NaN }), null);
  const result = run.finish({ totalScore: NaN });
  assert.equal(result.durationSeconds, 0);
  assert.equal(result.totalScore, 0);
  assert.equal(result.finalScore, 0);
  assert.equal(result.scoreBreakdown.bailPenalty, 0);
  assert.equal(result.bestCombo, null);
  assert.deepEqual(result.achievements, []);
  assert.deepEqual(result.highlights, []);
});
