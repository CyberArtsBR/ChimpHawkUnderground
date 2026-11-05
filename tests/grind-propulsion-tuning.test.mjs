import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceGrindSpeed,projectedGrindSpeed} from '../src/game/SkateSystems.js';
test('rail entry retains low/zero/high speed and neutral traction builds speed',()=>{
 for(const speed of [0,.03,.21,9,26])assert.equal(projectedGrindSpeed(speed),speed);
 assert.ok(advanceGrindSpeed(0,0,1/120)>0);
 assert.equal(advanceGrindSpeed(26,0,1/120),26);
 assert.ok(advanceGrindSpeed(3,0,.1)-3>advanceGrindSpeed(19,0,.1)-19);
 assert.ok(advanceGrindSpeed(18,0,.1)>18);
 assert.equal(advanceGrindSpeed(.1,0,1,true),0);
});
