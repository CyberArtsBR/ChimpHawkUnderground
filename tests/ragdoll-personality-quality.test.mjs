import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadGeometry} from '../tools/load-geometry.mjs';
import {UnrealRider} from '../src/character/UnrealRider.js';
import {SkateRagdoll} from '../src/character/SkateRagdoll.js';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';
import {ParkCollision} from '../src/game/ParkCollision.js';

const rider=new UnrealRider('The_Heretic').configureModel(await loadGeometry('public/assets/rider/The_Heretic.glb'));
const board=new StreetBoard('fixture');board.deckHeight=.12;board.contactRig={deckTopY:.14,deckWidth:.42,deckLength:1.1};board.update({dt:0});
const floor=new THREE.Mesh(new THREE.BoxGeometry(80,.1,80),new THREE.MeshBasicMaterial());floor.position.y=-.05;floor.userData.surface='rideable';
const surface=new ParkCollision(floor),anchor=new THREE.Vector3();
function settle(time=0){rider.resetPresentation();for(let i=0;i<60;i++)rider.update({board,presentation:{state:'IDLE'},time,dt:1/60});}

test('ragdoll scratch is private to each body and interleaved falls preserve deterministic constraints',()=>{
 settle();const a=new SkateRagdoll(),b=new SkateRagdoll();
 for(const body of [a,b])assert.equal(body.start(rider,{velocity:new THREE.Vector3(8,-3,1),severity:.8}),true);
 assert.notEqual(a.scratch.axis,b.scratch.axis);
 for(let i=0;i<360;i++){a.update(1/120,{surface,anchor});b.update(1/120,{surface,anchor});}
 for(const [name,node]of a.nodes){assert.deepEqual(node.p.toArray(),b.nodes.get(name).p.toArray());assert.deepEqual(node.velocity.toArray(),b.nodes.get(name).velocity.toArray());}
});

test('actual GLB fall retains bounded contact, finite solved bones and immediate recovery',()=>{
 settle();rider.root.position.y=2;
 const bailPhysics={surface,anchor,velocity:new THREE.Vector3(9,-4,1),severity:1};let impact;
 for(let i=0;i<360;i++){
  rider.update({board,bail:true,bailPhysics,dt:1/120});
  assert.ok([...rider.rest.keys()].every(bone=>bone.quaternion.toArray().every(Number.isFinite)));
  const pelvis=rider.ragdoll.nodes.get('pelvis').p;assert.ok(Math.hypot(pelvis.x,pelvis.z)<=3.000001);
  if(impact)assert.equal(rider.ragdoll.groundImpact,impact);else impact=rider.ragdoll.groundImpact;
 }
 assert.ok(impact?.speed>.8,'one falling torso/head contact must be recorded');
 rider.update({board,presentation:{state:'IDLE'},dt:1/60});assert.equal(rider.ragdoll.active,false);assert.equal(rider.ragdoll.groundImpact,null);
});

test('existing secondary idle breathing moves wrists subtly while the feet remain planted',()=>{
 const pose=time=>{settle(time);return Object.fromEntries(['hand_l','hand_r','foot_l','foot_r'].map(name=>[name,rider.bones[name].getWorldPosition(new THREE.Vector3())]));};
 const a=pose(0),b=pose(1);
 for(const name of ['foot_l','foot_r'])assert.ok(a[name].distanceTo(b[name])<1e-5,'idle personality cannot disturb board contact');
 const movement=Math.max(a.hand_l.distanceTo(b.hand_l),a.hand_r.distanceTo(b.hand_r));
 assert.ok(movement>1e-6&&movement<.01,`existing breathing must remain subtle: ${movement}`);
 rider.dispose();
});
