import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { PRODUCTION_BOARD_CONTACT_RIG } from '../src/game/SkateboardContactRig.js';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { buildImportedWarehouseCollision } from '../src/park/ImportedWarehouseCollision.js';
import { excludeGrandWarehouseMisplacedSixStair } from '../src/park/GrandWarehouseSceneFilter.js';
import { createWarehousePark } from '../src/park/WarehousePark.js';
import { shouldReleaseRampLip } from '../src/game/StableBoardContactSkillStreetPhysics.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetSkater } from '../src/game/StreetSkater.js';

test('board finish is solid, emissive and double-sided even when original GLB has BLEND',()=>{
 const board=new StreetBoard('/unused');
 board.model=new THREE.Group();
 const deck=new THREE.Mesh(new THREE.BoxGeometry(1.1,.06,.3),
  new THREE.MeshStandardMaterial({color:0xffc3c3,transparent:true,opacity:.13,side:THREE.FrontSide,depthWrite:false}));
 deck.name='Board1_StingrayPBS1_0';
 board.model.add(deck);board.root.add(board.model);
 board.setFinish(6,{persist:false});
 const material=deck.material;
 assert.equal(material.transparent,false);
 assert.equal(material.opacity,1);
 assert.equal(material.depthWrite,true);
 assert.equal(material.side,THREE.DoubleSide);
 assert.equal(material.alphaTest,0);
 assert.equal(material.alphaMap,null);
 assert.ok(material.emissiveIntensity>=.35);
 assert.ok(material.emissive.getHex()>0);
 board.setFinish(2,{persist:false});
 assert.equal(material.transparent,false,'finish swap reintroduces transparency');
 assert.ok(material.emissive.getHex()>0);
});

test('respawn transparency is rider-only, never the skateboard deck',()=>{
 const skater=Object.create(StreetSkater.prototype);
 const riderMaterial=new THREE.MeshStandardMaterial({opacity:.9,transparent:true,depthWrite:false});
 const boardMaterial=new THREE.MeshStandardMaterial({opacity:1,transparent:false,depthWrite:true});
 skater.visual=new THREE.Group();
 skater.rider={root:new THREE.Group()};
 skater.board={root:new THREE.Group()};
 skater.rider.root.add(new THREE.Mesh(new THREE.BoxGeometry(),[riderMaterial,riderMaterial]));
 skater.board.root.add(new THREE.Mesh(new THREE.BoxGeometry(),boardMaterial));
 skater.visual.add(skater.board.root,skater.rider.root);
 skater.flashMaterials=[{material:boardMaterial}];

 skater.captureRiderFlashMaterials();

 assert.deepEqual(skater.flashMaterials,[{material:riderMaterial,opacity:.9,transparent:true,depthWrite:false}],
  'capture must replace stale entries, deduplicate rider materials and retain their original render state');
 for(const saved of skater.flashMaterials){
  saved.material.opacity=.22;saved.material.transparent=true;saved.material.depthWrite=false;
 }
 assert.equal(boardMaterial.opacity,1,'respawn ghosting must leave the deck opaque');
 assert.equal(boardMaterial.transparent,false);
 assert.equal(boardMaterial.depthWrite,true);
 for(const root of [skater.rider.root,skater.board.root])root.traverse(mesh=>mesh.geometry?.dispose());
 riderMaterial.dispose();boardMaterial.dispose();
});

test('gold/red graffiti combo keeps numbers in the viewport without duplicated cropped glyphs',()=>{
 const css=readFileSync('src/game-hud.css','utf8');
 assert.match(css,/#trick-feedback::after\s*\{\s*content:none!important\s*\}/);
 assert.match(css,/#trick-feedback:not\(:empty\)\{[^}]*position:fixed;/);
 assert.match(css,/#trick-feedback:not\(:empty\)\{[^}]*left:50%;/);
 assert.match(css,/#trick-feedback \.graffiti-art\{[^}]*flex-wrap:wrap;/);
 assert.match(css,/#trick-feedback \.graffiti-word img\{[^}]*max-width:/);
});

test('steep quarter skins do not become full-body blockers but real walls still block',()=>{
 function plane(surface,transitionSkin){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([
    -2,0,0,2,0,0,-2,2,0, 2,0,0,2,2,0,-2,2,0,
  ],3));
  g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  mesh.userData.surface=surface;mesh.userData.transitionSkin=transitionSkin;
  const root=new THREE.Group();root.add(mesh);
  return new ParkCollision(root);
 }
 const from=new THREE.Vector3(0,0,-.75), to=new THREE.Vector3(0,0,.75);
 const run=surface=>surface.move(from,to,new THREE.Vector3(0,0,6),{grounded:false,fromUp:new THREE.Vector3(0,1,0),toUp:new THREE.Vector3(0,1,0)});
 const ramp=run(plane('rideable',true));
 assert.equal(ramp.contacts.length,0,'riding skin creates phantom wall at lip');
 const wall=run(plane('solid',false));
 assert.ok(wall.contacts.length>0,'actual structural wall must remain collidable');
});

test('steep diagonal 3-wheel quarter exit is allowed, but flat/slow/side fall does not pop',()=>{
 const climbing={normalY:.42,verticalSpeed:5.0,speed:10,contactCount:3,frontSupported:1,rearSupported:2,travelSign:1};
 assert.equal(shouldReleaseRampLip(climbing),true);
 assert.equal(shouldReleaseRampLip({...climbing,normalY:.94}),false);
 assert.equal(shouldReleaseRampLip({...climbing,verticalSpeed:.1}),false);
 assert.equal(shouldReleaseRampLip({...climbing,speed:2.3}),false);
 assert.equal(shouldReleaseRampLip({...climbing,frontSupported:2,rearSupported:1}),false);
 assert.equal(shouldReleaseRampLip({...climbing,contactCount:4}),false);
 assert.equal(shouldReleaseRampLip({...climbing,travelSign:-1}),false);
});

test('authored Grand Warehouse ramps stay intact, skin separated from structural sides',async()=>{
 const root=await loadGeometry(new URL('../public/assets/warehouse/granwarehouse.glb',import.meta.url));
 excludeGrandWarehouseMisplacedSixStair(root);
 const base=createWarehousePark({textures:false});
 const imported=buildImportedWarehouseCollision(root,base.manifest.rails,{grandMode:true});
 const riding=imported.collision.children.filter(m=>m.userData.surface==='rideable');
 const skins=riding.filter(m=>m.userData.transitionSkin);
 const solids=imported.collision.children.filter(m=>m.userData.surface==='solid');
 assert.ok(skins.length>0,'authored transition skins not tagged');
 assert.ok(solids.length>0,'structural walls were incorrectly removed');
 assert.ok(imported.rails.some(r=>/West transfer quarter/.test(r.name)),'coping missing');
 const surface=new ParkCollision(imported.collision);
 assert.ok(surface.ridingMeshes.length>0);
 const points=skins.reduce((sum,m)=>sum+m.geometry.attributes.position.count,0);
 assert.ok(points>200,'not enough real quarter ramp support geometry');
 assert.ok(PRODUCTION_BOARD_CONTACT_RIG.deckTopY > PRODUCTION_BOARD_CONTACT_RIG.wheelContactY);
});

test('all five rider GLBs limit sole clearance without changing bone or board scale',async()=>{
 for(const name of ['The_Heretic','The_Anchor','The_AdolescentUR','TheanchoURi','TuxR']){
  const root=await loadGeometry(new URL('../public/assets/rider/'+name+'.glb',import.meta.url));
  const rider=new UnrealRider('/assets/rider/'+name+'.glb').configureModel(root);
  for(const s of ['l','r']){
   assert.ok(rider.soleOffsets[s]>=.025 && rider.soleOffsets[s]<=.11,
    name+'/'+s+' foot sits too high above the board');
  }
  const board=new StreetBoard('/unused');board.deckHeight=.12;
  board.contactRig={deckTopY:.14,deckWidth:.42,deckLength:1.1};
  board.update({dt:0});
  rider.update({board,presentation:{state:'IDLE'},dt:1/60});
  rider.resetPresentation();
  for(let frame=0;frame<20;frame++)
    rider.update({board,presentation:{state:'CROUCH'},crouch:1,dt:1/60});
  rider.root.updateWorldMatrix(true,true);
  board.root.updateWorldMatrix(true,true);
  const pelvis=board.root.worldToLocal(rider.bones.pelvis.getWorldPosition(new THREE.Vector3()));
  const deckTop=board.contactRig.deckTopY-board.deckHeight;
  assert.ok(pelvis.y-deckTop>0.34,
    name+' pelvis intersects the board when crouched: '+(pelvis.y-deckTop));
  for(const side of ['l','r']){
   const foot=rider.bones['foot_'+side];
   const ankle=foot.getWorldPosition(new THREE.Vector3());
   assert.ok(Number.isFinite(ankle.y));
  }
  rider.dispose();
 }
});
