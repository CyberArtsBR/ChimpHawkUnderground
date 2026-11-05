import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBloomOccluderMaterial } from '../src/graphics/BloomOccluderMaterial.js';

test('imported ramp skins block the neon mask from both sides',()=>{
  const material=createBloomOccluderMaterial();
  const skin=new THREE.Mesh(new THREE.PlaneGeometry(4,4),material);
  skin.updateMatrixWorld(true);
  for(const side of [-1,1]) {
    const ray=new THREE.Raycaster(new THREE.Vector3(0,0,side*2),new THREE.Vector3(0,0,-side),0,3);
    assert.ok(ray.intersectObject(skin).length,`ramp must occlude from side ${side}`);
  }
  assert.equal(material.depthWrite,true);assert.equal(material.depthTest,true);
  assert.equal(material.color.getHex(),0);assert.equal(material.transparent,false);
  skin.geometry.dispose();material.dispose();
});
