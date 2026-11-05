import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionFlow, sessionAttemptState } from '../src/game/SessionFlow.js';

const active = { eligibleAttempt:true,comboActive:true };
function overtime() {
  const flow = new SessionFlow({duration:1});
  flow.begin({ready:false});
  assert.deepEqual(flow.update(1,active).events,['overtime']);
  return flow;
}

test('READY gates movement and clock; GO consumes the transition frame and emits once', () => {
  const flow = new SessionFlow();
  assert.equal(flow.begin().allowSimulation,false);
  const ready = flow.update(.5);
  assert.equal(ready.remaining,90);
  assert.equal(ready.elapsed,0);
  const go = flow.update(10);
  assert.deepEqual(go.events,['go']);
  assert.equal(go.allowSimulation,true);
  assert.equal(go.remaining,90);
  assert.equal(flow.update(.1).remaining,89.9);
  assert.equal(flow.skipReady(),false);
});

test('ready skip emits once, practice enters immediately without a countdown', () => {
  const flow = new SessionFlow();
  flow.begin();
  assert.equal(flow.skipReady(),true);
  assert.equal(flow.skipReady(),false);
  assert.deepEqual(flow.update(0).events,['go']);
  assert.deepEqual(flow.update(0).events,[]);
  flow.begin({practice:true});
  const result = flow.update(300);
  assert.equal(result.phase,'playing');
  assert.equal(result.remaining,90);
  assert.equal(result.elapsed,300);
});

test('pause/focus suspension consumes no ready, round, or overtime time', () => {
  const flow = new SessionFlow();
  flow.begin();
  const ready = flow.snapshot();
  assert.deepEqual(flow.update(90,{paused:true}),ready);
  flow.skipReady(); flow.update(0);
  const running = flow.snapshot();
  assert.deepEqual(flow.update(90,{paused:true}),running);
  const extra = overtime();
  const before = extra.snapshot();
  assert.deepEqual(extra.update(60,{...active,paused:true}),before);
});

test('zero without an active scoring attempt finishes exactly once', () => {
  const flow = new SessionFlow(); flow.begin({ready:false});
  const result = flow.update(90);
  assert.equal(result.phase,'finished');
  assert.equal(result.finishReason,'clock');
  assert.deepEqual(result.events,['finish']);
  assert.equal(flow.acceptSettlement(),false);
  assert.deepEqual(flow.update(5).events,[]);
});

test('airborne attempt may finish at zero; accepted landing is once-only', () => {
  const flow = new SessionFlow({duration:1}); flow.begin({ready:false});
  const atZero = flow.update(1,{eligibleAttempt:true,comboActive:false});
  assert.equal(atZero.phase,'overtime');
  assert.equal(atZero.allowSimulation,true);
  assert.equal(atZero.allowNewCombo,false);
  assert.equal(flow.acceptSettlement(),true);
  assert.equal(flow.acceptSettlement(),false);
  const done = flow.update(.01,active);
  assert.equal(done.finishReason,'landed');
  assert.deepEqual(done.events,['finish']);
  assert.equal(flow.acceptSettlement(),false);
});

test('bail crossing zero forfeits pending result, endless grinds/manuals end after six seconds', () => {
  const bailed = overtime();
  assert.equal(bailed.update(.1,{...active,bailed:true}).finishReason,'bail');
  assert.equal(bailed.acceptSettlement(),false);
  for (const kind of ['grind','manual']) {
    const flow = overtime();
    assert.equal(flow.update(5.99,active).phase,'overtime',kind);
    const done = flow.update(.02,active);
    assert.equal(done.finishReason,'grace-expired',kind);
    assert.equal(done.elapsed,7);
    assert.equal(flow.acceptSettlement(),false);
  }
});

test('frame overflow cannot gain extra grace; restart discards pending settlement state', () => {
  const flow = new SessionFlow({duration:1}); flow.begin({ready:false});
  const extra = flow.update(1.5,active);
  assert.equal(extra.overtimeRemaining,5.5);
  assert.equal(extra.elapsed,1.5);
  flow.acceptSettlement();
  const restarted = flow.begin();
  assert.equal(restarted.phase,'ready');
  assert.equal(restarted.remaining,1);
  assert.equal(flow.acceptSettlement(),false);
});

test('attempt evidence excludes a grounded charge or bail, includes air/rail/pending combo', () => {
  const ground = {grounded:true,tricks:{combo:[]},bailTime:0};
  assert.equal(sessionAttemptState({...ground,ollieCharge:1}).eligibleAttempt,false);
  assert.equal(sessionAttemptState({...ground,grounded:false}).eligibleAttempt,true);
  assert.equal(sessionAttemptState({...ground,grind:{}}).eligibleAttempt,true);
  assert.equal(sessionAttemptState({...ground,tricks:{combo:[{}]}}).eligibleAttempt,true);
  assert.equal(sessionAttemptState({...ground,grounded:false,bailTime:1}).eligibleAttempt,false);
});
