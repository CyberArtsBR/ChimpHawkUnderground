import {test}from'node:test';import assert from'node:assert/strict';import * as THREE from'three';
import{freezeStaticParkTransforms}from'../src/graphics/StaticParkTransforms.js';
test('static local matrix freeze preserves world matrices, reparenting and visibility',()=>{
 const root=new THREE.Group(),parent=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 root.position.set(2,1,3);mesh.position.set(4,0,1);root.add(mesh);root.updateMatrixWorld(true);const before=mesh.matrixWorld.clone();
 assert.equal(freezeStaticParkTransforms(root),2);root.updateMatrixWorld(true);assert.deepEqual(mesh.matrixWorld.elements,before.elements);
 parent.position.x=8;parent.add(root);parent.updateMatrixWorld(true);assert.equal(mesh.matrixWorld.elements[12],14);
 mesh.visible=false;assert.equal(mesh.visible,false);assert.equal(freezeStaticParkTransforms(root),0);
});
test('dynamic branches and actors keep local updates',()=>{
 const root=new THREE.Group(),dynamic=new THREE.Group(),child=new THREE.Object3D(),bone=new THREE.Bone();
 dynamic.userData.dynamicTransform=true;dynamic.add(child);root.add(dynamic,bone,new THREE.PointLight());freezeStaticParkTransforms(root);
 assert.equal(dynamic.matrixAutoUpdate,true);assert.equal(child.matrixAutoUpdate,true);assert.equal(bone.matrixAutoUpdate,true);assert.equal(root.children[2].matrixAutoUpdate,true);
 child.position.x=5;root.updateMatrixWorld(true);assert.equal(child.matrixWorld.elements[12],5);
});
