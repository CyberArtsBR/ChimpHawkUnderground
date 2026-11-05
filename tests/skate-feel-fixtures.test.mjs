import test from 'node:test';
import assert from 'node:assert/strict';
import { measureFeelFixture,measureBraking } from '../tools/fixtures/SkateFeelFixtures.mjs';
import * as THREE from 'three';
import { supportMatchesDeckTarget } from '../src/game/DeckAwareRampExitSkillStreetPhysics.js';

test('real-controller pop measurements distinguish low/high charge without tuning changes',()=>{
  const low=measureFeelFixture('flat',{chargeFrames:1}),high=measureFeelFixture('flat',{chargeFrames:29});
  for(const sample of [low,high]){assert.equal(sample.launched,true);assert.ok(sample.landed);assert.equal(sample.bailCount,0);}
  assert.ok(low.peakRise>.7&&low.peakRise<.85);
  assert.ok(high.peakRise>1.35&&high.peakRise<1.55);
  assert.ok(high.airtime>low.airtime+.15);
});

test('authored lowledge/stairs fixtures clear obstacles and land on measured support',()=>{
  const ledge=measureFeelFixture('low-ledge'),stairs=measureFeelFixture('stairs');
  for(const sample of [ledge,stairs]){assert.equal(sample.launched,true);assert.ok(sample.landed);assert.equal(sample.bailCount,0);}
  assert.ok(ledge.landed.position[1]>.34&&ledge.landed.position[1]<.4);
  assert.ok(stairs.landed.position[2]<-8,'stairs must be cleared, not just grounded');
  assert.ok(stairs.landed.position[1]<.05);
});

test('rail fixture captures at entry speed and stays until the actual end with correction',()=>{
  const rail=measureFeelFixture('rail');assert.ok(rail.firstGrind);assert.equal(rail.firstGrind.speed,10);
  assert.equal(rail.bailCount,0);
  const captured=rail.states.filter(state=>state.grind);assert.ok(captured.length>10);
  const firstGroundAfter=rail.states.find(state=>state.grounded&&state.time>rail.firstGrind.time);
  assert.ok(firstGroundAfter.position[2]<-30,'must not detach and land halfway along rail');
});

test('neutral quarter fixture launches then lands back on ramp side with slope support',()=>{
  const ramp=measureFeelFixture('bowl-return');assert.equal(ramp.launched,true);assert.ok(ramp.landed);
  assert.equal(ramp.bailCount,0);assert.ok(ramp.landed.position[2]>-3);
  assert.ok(ramp.landed.normal[1]<.8,'flat lip contact cannot masquerade as a return');
});

test('apex exit completes on the scanned deck and continues past the coping at varied entry speeds',()=>{
  for(const speed of [8,10,14,18]){
    const transfer=measureFeelFixture('transfer',{speed});
    assert.equal(transfer.launched,true);assert.ok(transfer.landed);assert.equal(transfer.bailCount,0);
    assert.ok(transfer.landed.normal[1]>.985,'blended ramp/deck contact must not settle an exit');
    assert.ok(Math.abs(transfer.landed.position[1]-2.015)<.02,'must land on deck height');
    assert.ok(transfer.landed.position[2]<-3,'must cross the lip');
    assert.ok(transfer.finalPosition[2]<-10,'must keep rolling instead of freezing on coping');
  }
});

test('verified exit rejects mixed lip normals but permits authored sloped decks',()=>{
  const deckNormal=new THREE.Vector3(0,1,0);
  const air={transferring:true,frame:{lipPoint:new THREE.Vector3(0,2,-3),deckOutward:new THREE.Vector3(0,0,-1)},
    exitControl:{geometryAware:true,abortToReturn:false,targetPoint:new THREE.Vector3(0,2,-4),targetNormal:deckNormal,
      startDistance:.22,endDistance:3}};
  const support={position:new THREE.Vector3(0,2,-3.4),normal:new THREE.Vector3(0,.934,.357).normalize()};
  assert.equal(supportMatchesDeckTarget(support,air),false);
  support.normal.copy(deckNormal);assert.equal(supportMatchesDeckTarget(support,air),true);
  const slopedNormal=new THREE.Vector3(0,.95,.312).normalize();
  support.normal.copy(slopedNormal);air.exitControl.targetNormal=slopedNormal;
  assert.equal(supportMatchesDeckTarget(support,air),true,'support must match its scanned deck, not world UP');
});

test('braking distance grows with speed and remains finite and stopped at120Hz',()=>{
  const samples=[6,12,18].map(measureBraking);
  assert.ok(samples[1].distanceMeters>samples[0].distanceMeters*3);
  assert.ok(samples[2].distanceMeters>9&&samples[2].distanceMeters<11);
  for(const sample of samples){assert.equal(sample.finalSpeed,0);assert.ok(sample.seconds<1.3);}
});
