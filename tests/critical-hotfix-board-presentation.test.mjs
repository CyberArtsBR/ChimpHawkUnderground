import test from 'node:test';
import assert from 'node:assert/strict';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';

function board() { const b=new StreetBoard('/unused.glb'); b.deckHeight=0.14; return b; }

test('Pop Shove-it preserves completed board yaw after flip state clears', () => {
  const b=board();
  b.update({ flipState:{ name:'Pop Shove-it',yaw:0.5,roll:0,pitch:0,progress:1 },dt:1/60 });
  const finished=b.root.quaternion.clone();
  b.update({ flipState:null,dt:1/60 });
  assert.ok(finished.angleTo(b.root.quaternion)<0.001,'board must not spin backwards on landing');
  b.update({dt:1/60});
  assert.ok(finished.angleTo(b.root.quaternion)<0.001,'board keeps equivalent visual yaw');
  b.resetPresentation();
  b.update({dt:1/60});
  assert.ok(b.root.quaternion.angleTo(finished)>1,'reset clears presentation offset');
});

test('Manual and Nose Manual provide visible opposite board pitch', () => {
  const b=board();
  b.update({manual:'manual',dt:1/60});
  assert.ok(b.root.rotation.x < -0.21);
  b.update({manual:'noseManual',dt:1});
  assert.ok(b.root.rotation.x > 0.21);
});
