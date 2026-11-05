import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RailNetwork } from '../src/game/RailNetwork.js';
import { resolveGrindCapture, resolveMagneticGrindCapture, resolveStrictGrindCapture } from '../src/game/core/GrindCaptureController.js';
import { buildImportedWarehouseCollision } from '../src/park/ImportedWarehouseCollision.js';

test('map4: two transverse copings do not hide the reachable flat handrail', () => {
  const net = new RailNetwork([
    { name: 'Front transverse coping', points: [[-2,.8,1.09], [2,.8,1.09]] },
    { name: 'Rear transverse coping', points: [[-2,.8,1.71], [2,.8,1.71]] },
    { name: 'Reachable flat handrail', points: [[.20,.8,-4], [.20,.8,4]] },
  ]);
  const ctx = {
    position: new THREE.Vector3(0,1.02,1.4),
    forward: new THREE.Vector3(0,0,-1),
    velocity: new THREE.Vector3(.8,-.4,-6),
    railNetwork: net, trick: { name:'50-50' },
  };
  for (const offset of [-.31,.31]) {
    const contact = ctx.position.clone().addScaledVector(ctx.forward, offset);
    assert.match(net.nearest(contact, .45).rail.name, /transverse coping/);
    assert.equal(net.nearby(contact, .45).length, 2);
  }
  for (const found of [resolveStrictGrindCapture(ctx), resolveMagneticGrindCapture(ctx), resolveGrindCapture(ctx)]) {
    assert.ok(found, 'valid handrail must remain reachable');
    assert.equal(found.rail.name, 'Reachable flat handrail');
  }
});

test('map4: nearby() keeps one closest segment per rail', () => {
  const net = new RailNetwork([
    { name:'kinked', points:[[0,.8,3],[0,.8,0],[.2,.8,-3]] },
    { name:'parallel', points:[[.35,.8,3],[.35,.8,-3]] },
  ]);
  const hits = net.nearby(new THREE.Vector3(.04,.9,.5),.7);
  assert.deepEqual(hits.map(h=>h.rail.name), ['kinked','parallel']);
  assert.ok(hits[0].distance <= hits[1].distance);
  assert.equal(net.nearby(new THREE.Vector3(10,1,10),.5).length,0);
});

test('map4: Blender stair tread/landing and riser have distinct collision roles', () => {
  const scene = new THREE.Group();
  for (const [name,x] of [
    ['Stair_Tread_07',-4], ['Stair_Riser_07',-2],
    ['Stairs_Landing',0], ['Quarter_Side_Wood_Core',2], ['Side_Edge_Band',6],
  ]) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(1.2,.25,1.2));
    o.userData.name='04_FLOW_LAB / '+name;
    o.position.set(x,1,0); scene.add(o);
  }
  const positions=[];
  for(let ring=0;ring<2;ring++)
    for(let j=0;j<10;j++){
      const a=2*Math.PI*j/10;
      positions.push(4+Math.cos(a)*.055,1+Math.sin(a)*.055,ring*2-1);
    }
  const tube=new THREE.BufferGeometry();
  tube.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  tube.setIndex(Array.from({length:10},(_,j)=>[
    j,(j+1)%10,10+j,(j+1)%10,10+(j+1)%10,10+j,
  ]).flat());
  const rail=new THREE.Mesh(tube,new THREE.MeshBasicMaterial());
  rail.userData.name='04_FLOW_LAB / Synthetic flat rail___tube';
  scene.add(rail);
  const imported=buildImportedWarehouseCollision(scene);
  assert.equal(imported.rails.length,1);
  const labels=imported.surfaces.join(';');
  assert.match(labels,/Stair_Tread_07/);
  assert.match(labels,/Stairs_Landing/);
  assert.doesNotMatch(labels,/Stair_Riser_07/);
  assert.doesNotMatch(labels,/Side_Edge_Band/);
  assert.ok(imported.collision.children.some(o=>o.userData.surface==='solid'));
});
