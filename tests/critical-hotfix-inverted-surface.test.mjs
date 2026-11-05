import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ParkCollision } from '../src/game/ParkCollision.js';

test('rideable floor triangles exported backwards still support downward probes', () => {
  const scene=new THREE.Group();
  const inverted=new THREE.Mesh(new THREE.PlaneGeometry(5,5),
    new THREE.MeshBasicMaterial({color:0xffffff}));
  inverted.rotation.x=Math.PI/2; // Plane local +Z becomes world -Y.
  inverted.userData.surface='skateable';
  scene.add(inverted);
  const collision=new ParkCollision(scene);
  const result=collision.ground(new THREE.Vector3(0,0.12,0),0.15,0.4);
  assert.ok(result,'inverted winding must not create a floor hole');
  assert.ok(result.normal.y>0.95,'floor support normal points upward');
});
test('upward rays cannot mistake the underside for a rideable top', () => {
  const root=new THREE.Group();
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshBasicMaterial());
  floor.rotation.x=Math.PI/2;
  root.add(floor);
  const collision=new ParkCollision(root);
  const point=new THREE.Vector3(),normal=new THREE.Vector3();
  const underside=collision.rayRideable(new THREE.Vector3(0,-1,0),
    new THREE.Vector3(0,1,0),2,point,normal);
  assert.equal(underside,null);
});
