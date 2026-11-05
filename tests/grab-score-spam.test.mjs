import {test} from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SkateTricks} from '../src/game/SkateTricks.js';
import {StreetPhysics} from '../src/game/StreetPhysics.js';

test('releasing and spamming grabs cannot add base score or multipliers in one flight',()=>{
 const p=new StreetPhysics({collision:new THREE.Group(),spawn:[0,10,0]});
 for(let i=0;i<20;i++){
  p.tricks.tick(.16);p.grabState=null;
  p.handleEvents({grab:{name:'Indy',points:200}});
 }
 assert.equal(p.tricks.combo.length,1);assert.equal(p.tricks.comboMultiplier,1);assert.equal(p.tricks.comboBase,200);
});
test('double-tap grab upgrades once, while duration rewards actual held time',()=>{
 const t=new SkateTricks();const entry=t.recordAirGrab('Indy',200);
 t.addDuration(20,entry);t.tick(.2);
 assert.equal(t.recordAirGrab('Stalefish',350),entry);
 for(let i=0;i<10;i++){t.tick(.2);t.recordAirGrab(i%2?'Indy':'Stalefish',i%2?200:350);}
 assert.equal(t.combo.length,1);assert.equal(t.comboMultiplier,1);assert.equal(entry.name,'Stalefish');
 assert.equal(entry.durationPoints,20);assert.equal(t.comboBase,370);
});
test('distinct grab families and a new takeoff remain scoreable; pausing does not reset the flight guard',()=>{
 const t=new SkateTricks();t.recordAirGrab('Indy',200);t.recordAirGrab('Nosegrab',250);assert.equal(t.combo.length,2);
 t.clearPendingInput();t.tick(.3);t.recordAirGrab('Indy',200);assert.equal(t.combo.length,2);
 t.resolve({}, {grounded:true});t.tick(.3);t.recordAirGrab('Indy',200);assert.equal(t.combo.length,3);
});
