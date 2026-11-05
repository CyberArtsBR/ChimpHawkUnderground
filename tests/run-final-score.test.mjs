import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRunFinalScore, RUN_SCORE_RULES } from '../src/game/RunFinalScore.js';
import { SkateTricks } from '../src/game/SkateTricks.js';
import { RunSummary } from '../src/game/RunSummary.js';

function line(groups, bails = 0) {
  const run = new RunSummary(), tricks = new SkateTricks();
  for (const group of groups) {
    for (const [name, points = 50] of group) {
      tricks.record(name, points);
      tricks.tick(.25);
    }
    const entries = tricks.combo.map(entry => ({ ...entry }));
    run.recordCombo({ ...tricks.settle(), entries });
  }
  run.bails = bails;
  return run.finish();
}

test('empty and bail-only runs remain zero', () => {
  assert.equal(calculateRunFinalScore().finalScore, 0);
  const result = calculateRunFinalScore({ bails: 3 });
  assert.equal(result.finalScore, 0);
  assert.equal(result.bailPenalty, 750);
});

test('v2 rewards accepted score and variety without per-bank or per-entry inflation', () => {
  const result = calculateRunFinalScore({ bankedScore:1000, landedCombos:2,
    tricksLanded:6, uniqueTricks:['Kickflip','Heelflip','Kickflip','Manual'], bails:1 });
  assert.equal(result.comboBonus, 0);
  assert.equal(result.trickBonus, 0);
  assert.equal(result.subtotal, 1000);
  assert.equal(result.uniqueTrickCount, 3);
  assert.equal(result.varietyBonusPercent, 15);
  assert.equal(result.multiplierPercent, 115);
  assert.equal(result.multiplier, 1.15);
  assert.equal(result.weightedScore, 1150);
  assert.equal(result.bailPenalty, 250);
  assert.equal(result.finalScore, 900);
  assert.equal(result.ruleVersion, 'line-score-v3');
});

test('comparison matrix: linked repetitions beat isolated banks; varied line beats repetitions', () => {
  const isolated = line([[['Ollie']], [['Ollie']], [['Ollie']]]);
  const linked = line([[['Ollie'], ['Ollie'], ['Ollie']]]);
  const varied = line([[['Ollie'], ['Kickflip',100], ['Heelflip',100]]]);
  assert.equal(isolated.finalScore, 158);
  assert.equal(linked.finalScore, 237);
  assert.equal(varied.finalScore, 863);
  assert.ok(linked.finalScore > isolated.finalScore);
  assert.ok(varied.finalScore > linked.finalScore);
  const linkedBail = line([[['Ollie'], ['Kickflip',100], ['Heelflip',100]]], 1);
  assert.equal(linkedBail.finalScore, varied.finalScore - 250);
});

test('splitting accepted score or adding zero-value repeated trick entries creates no bonus', () => {
  const baseline = { bankedScore:1000, landedCombos:1, tricksLanded:1, uniqueTricks:1 };
  const score = calculateRunFinalScore(baseline).finalScore;
  assert.equal(calculateRunFinalScore({ ...baseline, landedCombos:20, tricksLanded:200 }).finalScore, score);
  assert.ok(calculateRunFinalScore({ ...baseline, uniqueTricks:2 }).finalScore > score);
});

test('actual repeat decay and multiplier cap remain authoritative for tricks and obstacles', () => {
  const five = line([[...Array.from({length:5}, () => ['50-50',150])]]);
  const many = line([[...Array.from({length:20}, () => ['50-50',150])]]);
  assert.equal(many.finalScore, five.finalScore, 'zero-value repeats cannot farm result bonuses');
  const tricks = new SkateTricks();
  for (let i=0;i<20;i++) { tricks.record(`Unique ${i}`,100); tricks.tick(.2); }
  assert.equal(tricks.comboMultiplier, 12);
  const before = tricks.comboBase;
  tricks.cancelCombo();
  assert.ok(before > 0);
  assert.equal(tricks.settle(), null, 'bails cannot bank pending score');
});

test('idle balance has no score without an accepted trick entry and upgrades remain one entry', () => {
  const tricks = new SkateTricks();
  assert.equal(tricks.addDuration(100), 0);
  assert.equal(tricks.settle(), null);
  const entry = tricks.record('Kickflip',100);
  assert.equal(tricks.upgrade(entry,'Double Kickflip',250),true);
  assert.equal(tricks.combo.length,1);
  assert.equal(tricks.settle().points,250);
});

test('bail penalties apply after variety and never produce a negative score', () => {
  const run = { bankedScore:1000, uniqueTricks:20 };
  assert.equal(calculateRunFinalScore(run).finalScore,2000);
  assert.equal(calculateRunFinalScore({ ...run,bails:1 }).finalScore,1750);
  assert.equal(calculateRunFinalScore({ ...run,bails:9 }).finalScore,0);
});

test('variety keeps the 2.00 cap and rounds once', () => {
  assert.equal(calculateRunFinalScore({ uniqueTricks:19 }).multiplierPercent,195);
  assert.equal(calculateRunFinalScore({ uniqueTricks:100 }).multiplierPercent,200);
  assert.equal(calculateRunFinalScore({ bankedScore:10,uniqueTricks:1 }).weightedScore,11);
  assert.equal(calculateRunFinalScore({ bankedScore:11,uniqueTricks:1 }).weightedScore,12);
});

test('invalid counts cannot invent bonuses or bail credits; accepted facts stay immutable', () => {
  const malformed = calculateRunFinalScore({ bankedScore:NaN,landedCombos:-2,tricksLanded:Infinity,uniqueTricks:'20',bails:-1 });
  assert.equal(malformed.finalScore,0);
  assert.equal(malformed.uniqueTrickCount,0);
  assert.equal(malformed.bailPenalty,0);
  const facts = Object.freeze({ bankedScore:800,landedCombos:2,tricksLanded:4,
    uniqueTricks:Object.freeze(['Kickflip','Manual']),bails:1 });
  assert.deepEqual(calculateRunFinalScore(facts),calculateRunFinalScore(facts));
  assert.ok(Object.isFrozen(RUN_SCORE_RULES));
});
