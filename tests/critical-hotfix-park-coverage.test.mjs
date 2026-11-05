import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { auditParkSurfaceCoverage } from '../src/game/collision/ParkCoverageAudit.js';
const REGION=[{minX:-2,maxX:2,minZ:-2,maxZ:2}];
function ground(y=0){
  const r=new THREE.Group();
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  plane.rotation.x=-Math.PI/2;plane.position.y=y;r.add(plane);
  return r;
}
test('read-only map audit confirms matching visual and physical ground',()=>{
  const visual=ground(),collision=new ParkCollision(ground());
  const sample=auditParkSurfaceCoverage({visualRoot:visual,collision,playableRegions:REGION,samplesPerAxis:3});
  assert.equal(sample.visualSamples,9);
  assert.equal(sample.matching,9);
  assert.equal(sample.unsupported,0);
  assert.equal(sample.coverageRatio,1);
});
test('coverage audit returns concrete positions when collision floor is missing',()=>{
  const visual=ground(),collision=new ParkCollision(new THREE.Group());
  const sample=collision.auditCoverage(visual,REGION,{samplesPerAxis:3});
  assert.equal(sample.visualSamples,9);
  assert.equal(sample.unsupported,9);
  assert.equal(sample.findings[0].kind,'noSupport');
  assert.ok(Number.isFinite(sample.findings[0].x));
});
test('coverage audit does not count an offset collision surface as the same floor',()=>{
  const visual=ground(0),collision=new ParkCollision(ground(-1));
  const sample=collision.auditCoverage(visual,REGION,{samplesPerAxis:3,tolerance:0.2});
  assert.equal(sample.unsupported,9);
});
