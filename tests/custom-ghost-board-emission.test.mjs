import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { deckEmissionForGlow, DECK_BASE_EMISSION, DECK_MAX_EMISSION } from '../src/skateboard/BoardGlow.js';
import { applyGhostRiderPresentation, isCustomRiderUpload, isTeddyUploadFilename, isTaggedGhostRider, shouldApplyGhostRiderPresentation } from '../src/character/GhostRiderMaterials.js';

test('shape goes from 0.75 to 0.95 with smoothed speed boost and clamps safely',()=>{
 assert.equal(DECK_BASE_EMISSION,0.75);
 assert.equal(DECK_MAX_EMISSION,0.95);
 assert.equal(deckEmissionForGlow(0),0.75);
 assert.equal(deckEmissionForGlow(1),0.95);
 assert.ok(Math.abs(deckEmissionForGlow(0.5)-0.85)<1e-9);
 assert.equal(deckEmissionForGlow(-2),0.75);
 assert.equal(deckEmissionForGlow(5),0.95);
});
test('only uploaded blob GLBs receive the ghost look, not default rider assets',()=>{
 assert.equal(isCustomRiderUpload('blob:https://portals.to/uuid'),true);
 assert.equal(isCustomRiderUpload('/assets/rider/TuxR.glb'),false);
 assert.equal(isCustomRiderUpload('https://example.com/The_Heretic.glb'),false);
});
test('only Teddy.glb uploaded through the game gets the spectral shader',()=>{
 assert.equal(isTeddyUploadFilename('Teddy.glb'),true);
 assert.equal(isTeddyUploadFilename('teddy.GLB'),true);
 assert.equal(isTeddyUploadFilename('Teddy_Ghost.glb'),true);
 assert.equal(isTeddyUploadFilename('The_Heretic.glb'),false);
 assert.equal(shouldApplyGhostRiderPresentation('blob:https://streetskate.onrender.com/123','Teddy.glb'),true);
 assert.equal(shouldApplyGhostRiderPresentation('blob:https://streetskate.onrender.com/123','Other.glb'),false);
 assert.equal(shouldApplyGhostRiderPresentation('/assets/rider/Teddy.glb','Teddy.glb'),false);
 assert.equal(shouldApplyGhostRiderPresentation('https://example.org/rider.glb','Teddy.glb'),false);
});
test('Teddy_Ghost tagged mesh activates its bloom in custom portrait GLB previews too',()=>{
 const root = new THREE.Group();
 const mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());
 root.add(mesh);
 assert.equal(isTaggedGhostRider(root),false);
 assert.equal(shouldApplyGhostRiderPresentation('blob:https://portals.to/id','',root),false);
 mesh.userData.streetskateGhost = true;
 assert.equal(isTaggedGhostRider(root),true);
 assert.equal(shouldApplyGhostRiderPresentation('blob:https://portals.to/id','',root),true);
 assert.equal(shouldApplyGhostRiderPresentation('/assets/rider/The_Heretic.glb','',root),false);
 mesh.geometry.dispose(); mesh.material.dispose();
});
test('ghost material copies textures and keeps rigged mesh geometry without creating a fake silhouette mesh',()=>{
 const root=new THREE.Group();
 const geometry=new THREE.BoxGeometry(1,1,1);
 const map=new THREE.Texture();
 const original=new THREE.MeshStandardMaterial({color:0x723a21,map,roughness:0.3});
 const mesh=new THREE.Mesh(geometry,original);
 root.add(mesh);
 const count=applyGhostRiderPresentation(root);
 assert.equal(count,1);
 assert.equal(root.children.length,1);
 assert.equal(mesh.geometry,geometry);
 assert.equal(mesh.material.map,map);
 assert.notEqual(mesh.material,original);
 assert.equal(mesh.material.transparent,true);
 assert.equal(mesh.material.depthWrite,false);
 // The green spectral finish introduced in 9c90797 preserves more of the
 // authored silhouette at 90% opacity, while retaining source transparency.
 assert.equal(mesh.material.opacity,0.90);
 assert.ok(mesh.material.emissiveIntensity>0);
 assert.ok(mesh.material.emissive.getHex()>0);
 assert.equal(mesh.userData.ghostRiderGlow,true);
 assert.equal(mesh.castShadow,false);
 const shader={fragmentShader:'#include <emissivemap_fragment>',uniforms:{}};
 mesh.material.onBeforeCompile(shader);
 assert.match(shader.fragmentShader,/streetGhostRim/);
 assert.match(shader.fragmentShader,/totalEmissiveRadiance/);
 mesh.material.dispose();geometry.dispose();map.dispose();
});
test('shared imported materials are cloned once and reused for matching skinned meshes',()=>{
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();
 const a=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);
 const b=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);
 root.add(a,b);
 assert.equal(applyGhostRiderPresentation(root),1);
 assert.equal(a.material,b.material);
 a.geometry.dispose();b.geometry.dispose();a.material.dispose();
});

test('custom upload identity passes from the validated file name into avatar load', async()=>{
 const fs=await import('node:fs/promises');
 const shell=await fs.readFile(new URL('../src/game/GameShell.js',import.meta.url),'utf8');
 const game=await fs.readFile(new URL('../src/game-main.js',import.meta.url),'utf8');
 const skater=await fs.readFile(new URL('../src/game/StreetSkater.js',import.meta.url),'utf8');
 const rider=await fs.readFile(new URL('../src/character/UnrealRider.js',import.meta.url),'utf8');
 assert.match(shell,/uploadFilename:file\.name/);
 assert.match(game,/uploadFilename: hero\.id === 'custom' \? hero\.uploadFilename : ''/);
 assert.match(skater,/new UnrealRider\(url, \{ uploadFilename \}\)/);
 assert.match(rider,/this\.ghostRider = shouldApplyGhostRiderPresentation\(url, uploadFilename\)/);
});
