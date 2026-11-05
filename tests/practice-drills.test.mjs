import test from 'node:test';
import assert from 'node:assert/strict';
import { PracticeDrills } from '../src/game/PracticeDrills.js';
const step=(drill,{y=0,grounded=true,...extra}={})=>drill.observe({position:{y},grounded,normal:{y:1},bailTime:0,...extra},1/120);
function jump(drill,peak,normalY=1){step(drill);step(drill,{y:.1,grounded:false});step(drill,{y:peak,grounded:false});step(drill,{normal:{y:normalY}});}

test('original four drills remain first and advance only when the trick is banked',()=>{
  const d=new PracticeDrills();
  assert.equal(d.accept([{name:'Ollie'}]),false);d.toggle();
  assert.equal(d.accept([{name:'Kickflip'}]),false);
  assert.equal(d.accept([{name:'Ollie'}]),true);
  assert.equal(d.accept([{name:'Kickflip'}]),true);
  assert.equal(d.accept([{name:'Noseslide'}]),true);
  assert.equal(d.accept([{name:'Ollie'},{name:'Kickflip'}]),false);
  assert.equal(d.accept([{name:'Ollie'},{name:'Kickflip'},{name:'50-50'}]),true);
  assert.match(d.label,/5 \/ 9.*low pop/);
  d.toggle();assert.equal(d.label,'');
});

test('Try This Trick uses selected actual name and only a clean accepted bank completes it',()=>{
  const d=new PracticeDrills();d.selectTrick('Laser Flip','laser-flip');
  assert.equal(d.completed,false);
  assert.equal(d.accept([{name:'Varial Heelflip'}]),false);
  assert.match(d.hint,/twice early/);
  step(d,{bailTime:1});
  assert.equal(d.completed,false);
  assert.equal(d.accept([{name:'Laser Flip'}]),true);
  assert.equal(d.completed,true);assert.equal(d.hint,'');
  assert.equal(d.accept([{name:'Laser Flip'}]),false,'one completion per drill');
});

test('pop goals need measured flight plus accepted Ollie, not just button/score input',()=>{
  const d=new PracticeDrills();d.selectDrill('low-pop');
  assert.equal(d.accept([{name:'Ollie'}]),false);
  jump(d,.75);assert.equal(d.accept([{name:'Ollie'}]),true);
  jump(d,.75);assert.equal(d.accept([{name:'Ollie'}]),false,'low pop cannot fulfill high pop');
  jump(d,1.45);assert.equal(d.accept([{name:'Ollie'}]),true);
  assert.match(d.label,/switch/);
});

test('switch and balance goals use stance and corrected observed rail balance',()=>{
  const d=new PracticeDrills();d.selectDrill('switch');
  assert.equal(d.accept([{name:'Kickflip',stance:1}]),false);
  assert.equal(d.accept([{name:'Kickflip',stance:-1}]),true);
  step(d,{grind:{},grindBalance:.6});step(d,{grind:{},grindBalance:.1});
  assert.equal(d.accept([{name:'50-50'}]),true);
  assert.match(d.label,/return/);
});

test('ramp-return requires a real airborne ramp sequence and slope touchdown',()=>{
  const d=new PracticeDrills();d.selectDrill('ramp-return');
  jump(d,1.5);assert.equal(d.accept([{name:'Ollie'}]),false);
  step(d,{normal:{y:.7}});step(d,{grounded:false,y:2,transitionAir:{}});
  step(d,{grounded:false,y:3,transitionAir:{}});step(d,{y:1.5,normal:{y:.6}});
  assert.equal(d.accept([{name:'Ollie'}]),true);
  assert.equal(d.label,'All drills complete!');
});

test('bail/respawn clears stale pop/balance evidence; retry keeps selected target',()=>{
  const d=new PracticeDrills();d.selectDrill('high-pop');jump(d,1.45);
  step(d,{bailTime:1});assert.equal(d.accept([{name:'Ollie'}]),false);
  d.selectTrick('Kickflip');step(d,{bailTime:1,flipState:{progress:.3}});
  assert.match(d.hint,/Pop higher/);d.retry();
  assert.equal(d.target.name,'Kickflip');assert.equal(d.hint,'');
  d.selectDrill('balance');step(d,{grind:{},grindBalance:.6});step(d,{grind:{},grindBalance:.1});
  step(d,{respawnSerial:1});assert.equal(d.accept([{name:'50-50'}]),false);
});
