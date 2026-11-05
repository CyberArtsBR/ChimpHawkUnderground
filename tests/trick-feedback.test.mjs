import test from 'node:test';
import assert from 'node:assert/strict';
import {StreetPhysics} from '../src/game/StreetPhysics.js';
import {SkateTricks} from '../src/game/SkateTricks.js';
test('settled combo retains trick names and final points without a bank notification',()=>{
 const rider={tricks:new SkateTricks(),score:10};
 rider.tricks.record('Kickflip',100);
 StreetPhysics.prototype.settleCombo.call(rider);
 assert.equal(rider.score,110);
 assert.equal(rider.feedback,'Kickflip · +100');
 assert.ok(rider.feedbackTime>=3);
 StreetPhysics.prototype.settleCombo.call(rider);
 assert.equal(rider.score,110);
});
