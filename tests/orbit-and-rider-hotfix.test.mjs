import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { splitOrbitScene, addChimpionsOrbitSign } from '../src/park/OrbitPark.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { neutralArmIKTargets, safeArmGoal } from '../src/character/AnimationDynamics.js';

test('ORBIT pink ring remains decorative and grindable without blocking bowl entry', async () => {
  const manifest=JSON.parse(readFileSync('public/assets/spacepark/orbit-manifest.json','utf8'));
  const world=splitOrbitScene(await loadGeometry(new URL('../public/assets/spacepark/orbit.glb',import.meta.url)),manifest.rails);
  assert.ok(world.rails.some(r=>r.name==='Orbit bowl coping'),'lost bowl grind rail');
  assert.ok(!world.collision.children.some(m=>m.userData.surface==='solid'&&/Orbit bowl coping/.test(m.name)), 'pink coping remains a solid invisible barrier');
  assert.ok(world.collision.children.some(m=>/orbital bowl transition/.test(m.name)&&m.userData.surface==='rideable'));
  const surface=new ParkCollision(world.collision),down=new THREE.Vector3(0,-1,0),point=new THREE.Vector3(),normal=new THREE.Vector3();
  const centre=new THREE.Vector3(-38.18,5,-18.38);
  assert.ok(surface.rayRideable(centre,down,15,point,normal), 'centre bowl is not rideable');
  assert.ok(point.y<-2.9,'flat collision sheet still caps the recessed bowl');
  let checked=0;
  for(const radius of [0,3,6,8,10,11.4]){
    for(const theta of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
      const origin=new THREE.Vector3(-38.18+radius*Math.cos(theta),5,-18.38+radius*Math.sin(theta));
      const hit=surface.rayRideable(origin,down,15,point,normal);
      assert.ok(hit, 'bowl transition gap radius='+radius+' theta='+theta);
      assert.ok(point.y<0.12,'incorrect floor cap inside bowl at radius='+radius+' height='+point.y);
      checked++;
    }
  }
  assert.equal(checked,24);
  assert.ok(world.brandingAnchor&&world.brandingAnchor.width>7,'authored sign was not found');
  const paint=world.park.children.map(mesh=>mesh.material).find(material=>material?.name==='Paint / crew graffiti');
  assert.ok(paint,'imported ramp graffiti material missing');
  assert.equal(paint.transparent,false,'graffiti overlay still has ghost transparency');
  assert.equal(paint.depthWrite,true);
  assert.ok(paint.alphaTest>=.4,'paint does not discard clear texels');
});

test('ORBIT sign replaces just the old logotype using the authored sign position',async()=>{
  const manifest=JSON.parse(readFileSync('public/assets/spacepark/orbit-manifest.json','utf8'));
  const world=splitOrbitScene(await loadGeometry(new URL('../public/assets/spacepark/orbit.glb',import.meta.url)),manifest.rails);
  assert.ok(!world.park.children.some(o=>/ORBIT logotype/.test(o.name)), 'old word remains in the rendered batch');
  const rendered=[];
  const canvasFactory=()=>({width:1,height:1,getContext(){return {
    clearRect(){},strokeText:(text)=>rendered.push(text),fillText:(text)=>rendered.push(text),
  };}});
  const lettering=addChimpionsOrbitSign(world.park,world.brandingAnchor,canvasFactory);
  assert.equal(lettering.name,'Halo / CHIMPIONS logotype');
  assert.deepEqual(rendered,['CHIMPIONS','CHIMPIONS']);
  assert.ok(lettering.position.z>world.brandingAnchor.z);
  assert.equal(lettering.userData.skateCollisionSurface,'decorative');
  assert.equal(lettering.material.depthWrite,false);
});

test('A-pose stays extended and modestly curved inward, and wrist goals avoid head during blending',()=>{
 const shoulder=new THREE.Vector3(-.2,1.2,0),side=new THREE.Vector3(-1,0,0),head=new THREE.Vector3(0,1.65,0);
 const pose=neutralArmIKTargets(shoulder,side,new THREE.Vector3(0,0,1),.55);
 const a=pose.wrist.clone().sub(shoulder);
 assert.ok(a.normalize().dot(side)>.4,'arms collapse against torso');
 assert.ok(pose.elbow.clone().sub(shoulder.clone().lerp(pose.wrist,.5)).length()<.05,'pole makes obvious elbow hump');
 const safe=safeArmGoal(shoulder,head.clone(),side,head,.55);
 assert.ok(safe.distanceTo(head)>.1,'interpolated wrist still enters face');
 const relaxed=safeArmGoal(shoulder,pose.wrist,side,head,.55,{neutral:true});
 assert.ok(relaxed.distanceTo(shoulder)>.54,'neutral arm was shortened enough to bend outward');
});

test('real rider GLBs keep an open A-pose clear of the head during jumps and transitions',async()=>{
 for(const name of ['The_Heretic','The_Anchor','The_AdolescentUR','TheanchoURi','TuxR']){
  const rider=new UnrealRider(name).configureModel(await loadGeometry(new URL('../public/assets/rider/'+name+'.glb',import.meta.url)));
  const board=new StreetBoard('/unused');
  board.deckHeight=.12;
  board.contactRig={deckTopY:.14,deckWidth:.42,deckLength:1.1};
  board.update({dt:0});
  const states=[
   {state:'IDLE'}, {state:'COAST',speedRatio:.8},{state:'OLLIE_POP',crouch:.55},
   {state:'AIR',speedRatio:.8},{state:'VERT_AIR',vert:true,verticalVelocity:3},
   {state:'LAND',landingSeverity:.8},{state:'BAIL',bail:true,bailProgress:.4},
   {state:'AIR',grabState:{name:'Indy'},grabWeight:.8},
  ];
  for(const scenario of states){
   rider.resetPresentation();
   for(let f=0;f<28;f++)rider.update({board,presentation:{state:scenario.state},...scenario,dt:1/60,time:f/60});
   rider.root.updateWorldMatrix(true,true);
   const head=rider.bones.head?.getWorldPosition(new THREE.Vector3());
   for(const side of ['l','r']){
    const shoulder=rider.bones['upperarm_'+side].getWorldPosition(new THREE.Vector3());
    const elbow=rider.bones['lowerarm_'+side].getWorldPosition(new THREE.Vector3());
    const wrist=rider.bones['hand_'+side].getWorldPosition(new THREE.Vector3());
    const upper=shoulder.distanceTo(elbow),lower=elbow.distanceTo(wrist),arm=upper+lower;
    const flex=Math.PI-shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow));
    assert.ok(Number.isFinite(flex)&&flex<2.13,name+'/'+scenario.state+'/'+side+' elbow over-flex '+flex);
    if(head){
      assert.ok(wrist.distanceTo(head)>.08,name+'/'+scenario.state+'/'+side+' wrist clips head');
      assert.ok(elbow.distanceTo(head)>.08,name+'/'+scenario.state+'/'+side+' elbow clips head');
    }
    if(!scenario.grabState && ['IDLE','COAST','OLLIE_POP','AIR','VERT_AIR'].includes(scenario.state)){
      const outward=rider.armOutward[side].clone().applyQuaternion(rider.root.getWorldQuaternion(new THREE.Quaternion())).normalize();
      assert.ok(wrist.clone().sub(shoulder).dot(outward)>arm*.42,name+'/'+scenario.state+'/'+side+' arms close against torso');
      assert.ok(flex<.5,name+'/'+scenario.state+'/'+side+' non-grab A-pose elbow too bent: '+flex.toFixed(3));
    }
   }
  }
  rider.dispose();
 }
});
