import test from 'node:test';
import assert from 'node:assert/strict';
import { ScoreRecords, SCORE_RECORDS_KEY } from '../src/game/ScoreRecords.js';
import { RUN_SCORE_RULES } from '../src/game/RunFinalScore.js';
function storage(data={}) {return {getItem:k=>data[k],setItem:(k,v)=>data[k]=v};}
const run = (score,extra={})=>({finalScore:score,scoreBreakdown:{ruleVersion:RUN_SCORE_RULES.version},...extra});

test('per-park records survive reload and return truthful delta/new-best state',()=>{
  const saved=storage(),records=new ScoreRecords(saved);
  const first=records.record('warehouse',run(100,{bestCombo:{points:80}}));
  assert.equal(first.firstRun,true);assert.equal(first.delta,null);assert.equal(first.isNewBest,true);
  const next=records.record('warehouse',run(90));
  assert.equal(next.delta,-10);assert.equal(next.isNewBest,false);assert.equal(next.score,100);
  assert.equal(next.bestCombo,80);
  assert.equal(records.record('orbit',run(10)).previousBest,null);
  const reload=new ScoreRecords(saved);
  assert.equal(reload.get('warehouse').score,100);
  assert.equal(reload.record('warehouse',run(125)).delta,25);
  assert.equal(reload.get('orbit').score,10);
});

test('different score rules are retained independently and never compared silently',()=>{
  const records=new ScoreRecords(storage({[SCORE_RECORDS_KEY]:JSON.stringify({schema:2,parks:{warehouse:{'achievement-score-v1':{score:9000}}}})}));
  assert.equal(records.get('warehouse'),null);
  assert.equal(records.get('warehouse','achievement-score-v1').score,9000);
  const result=records.record('warehouse',run(100));
  assert.equal(result.previousBest,null);
  assert.equal(result.delta,null);
  assert.equal(records.record('warehouse',run(800,{scoreBreakdown:{ruleVersion:'achievement-score-v1'}})),null);
});

test('practice, invalid results and corrupt storage cannot replace a timed PB',()=>{
  const records=new ScoreRecords(storage({[SCORE_RECORDS_KEY]:'broken'}));
  assert.equal(records.record('warehouse',run(100,{practice:true})),null);
  assert.equal(records.record('warehouse',run(NaN)),null);
  assert.equal(records.record('',run(100)),null);
  assert.equal(records.get('warehouse'),null);
  const blocked=new ScoreRecords({getItem(){throw Error('blocked');},setItem(){throw Error('quota');}});
  assert.equal(blocked.record('warehouse',run(100)).score,100);
  assert.equal(blocked.get('warehouse').score,100);
});
