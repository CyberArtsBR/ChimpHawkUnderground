import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../../src/game/StatefulSkillStreetPhysics.js';
import { PHYSICS } from '../../src/game/StreetPhysics.js';

export const FEEL_STEP = PHYSICS.step;
export const FEEL_INPUT = Object.freeze({steer:0,drive:0,spin:0,directionTaps:[],ollieHeld:false,olliePressed:false,ollieReleased:false,grindHeld:false,grindPressed:false,brake:false});
const material = () => new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
function box(root,x,y,z,w,h,d) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material());
  mesh.position.set(x,y,z);root.add(mesh);return mesh;
}
function quarter(root) {
  const positions=[],indices=[],segments=48;
  for (let side=0;side<2;side++) for (let i=0;i<=segments;i++) {
    const t=i/segments*Math.PI/2;
    positions.push(side?4:-4,2*(1-Math.cos(t)),-3*Math.sin(t));
  }
  for(let i=0;i<segments;i++){const a=i,b=i+1,c=segments+2+i,d=segments+1+i;indices.push(a,b,c,a,c,d);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  root.add(new THREE.Mesh(geometry,material()));
  box(root,0,1.95,-5,8,.1,4);
}
export function createFeelFixture(kind='flat',{speed=10}={}) {
  const root=new THREE.Group();
  box(root,0,-.05,-20,40,.1,100);
  const rails=[];let spawn=[0,.5,0];
  if(kind==='low-ledge')box(root,0,.175,-8,5,.35,6);
  if(kind==='stairs') {
    box(root,0,.55,0,8,1.1,8);
    for(let i=0;i<5;i++)box(root,0,(.9-i*.18)/2,-4.4-i*.8,8,.9-i*.18,.8);
    spawn=[0,1.6,0];
  }
  if(kind==='rail')rails.push({name:'Feel fixture rail',points:[[0,.8,2.5],[0,.8,-30]],radius:.055});
  if(kind==='bowl-return'||kind==='transfer') {
    quarter(root);rails.push({name:'04 / eastern quarter coping',points:[[-4,2,-3],[4,2,-3]]});
    spawn=[0,.5,.5];
  }
  root.updateMatrixWorld(true);
  const controller=new StatefulSkillStreetPhysics({collision:root,spawn,rails,playableRegions:[{minX:-19,maxX:19,minZ:-65,maxZ:25}]});
  controller.velocity.set(0,0,-speed);controller.speed=speed;
  controller.syncTravelDirection({preserveIfSlow:false});
  if(kind==='rail') {
    controller.position.set(.18,1.02,1.25);controller.velocity.set(-.35,-.55,-speed);
    controller.setMovementState('AIR');controller.airTime=.22;controller.airHeading=0;
    controller.airTakeoffFacing.set(0,0,-1);controller.airTakeoffHeading=0;controller.airDirection();
    controller.syncTravelDirection({preserveIfSlow:false});
  }
  return {kind,controller,root,dispose(){root.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});}};
}

/** Real controller/geometry at 120Hz. Reports failed/no-launch fixtures explicitly. */
export function measureFeelFixture(kind,{speed=10,chargeFrames=29,seconds=3}={}) {
  const fixture=createFeelFixture(kind,{speed}),p=fixture.controller,start=p.position.clone();
  let peak=start.y,launched=kind==='rail',landed=null,firstGrind=null,bailCount=0,wasBail=false,launchAt=null,launchHeight=start.y,airFrames=0;
  const states=[];
  for(let i=0;i<Math.ceil(seconds/FEEL_STEP);i++) {
    let input={...FEEL_INPUT};
    if(['flat','low-ledge','stairs'].includes(kind)) {
      input.ollieHeld=i<chargeFrames;input.olliePressed=i===0;input.ollieReleased=i===chargeFrames;
    }
    if(kind==='rail') {input.grindHeld=true;input.grindPressed=i===0;input.steer=THREE.MathUtils.clamp(-(p.grindBalance||0)*3-(p.grind?.balanceState?.velocity||0)*.8,-1,1);}
    if(kind==='transfer')input.vertExit=!!p.transitionAir?.apexPassed;
    const wasGround=p.grounded;
    p.advance(FEEL_STEP,input);
    if(wasGround&&!p.grounded&&!p.grind&&!p.bailTime&&!launched) {launched=true;launchAt=(i+1)*FEEL_STEP;launchHeight=p.position.y;}
    peak=Math.max(peak,p.position.y);
    if(!p.grounded&&!p.grind&&!p.bailTime)airFrames++;
    if(launched&&!landed&&p.grounded&&!p.bailTime)landed={time:(i+1)*FEEL_STEP,position:p.position.toArray(),normal:p.normal.toArray()};
    if(p.grind&&firstGrind===null)firstGrind={time:(i+1)*FEEL_STEP,speed:p.speed};
    if(p.bailTime&&!wasBail)bailCount++;
    wasBail=p.bailTime>0;
    if(i%12===0)states.push({time:(i+1)*FEEL_STEP,position:p.position.toArray(),grounded:p.grounded,grind:!!p.grind,bail:!!p.bailTime});
  }
  const result={kind,speed,chargeFrames,launched,launchAt,peakRise:peak-start.y,launchHeight,
    airtime:airFrames*FEEL_STEP,landed,firstGrind,bailCount,travelMeters:start.distanceTo(p.position),finalPosition:p.position.toArray(),states};
  fixture.dispose();return result;
}

export function measureBraking(speed=18) {
  const fixture=createFeelFixture('flat',{speed}),p=fixture.controller,start=p.position.clone();
  let frames=0;
  for(;frames<600;frames++){p.advance(FEEL_STEP,{...FEEL_INPUT,brake:true});if(Math.abs(p.speed)<.02)break;}
  const result={speed,seconds:(frames+1)*FEEL_STEP,distanceMeters:start.distanceTo(p.position),finalSpeed:p.speed};
  fixture.dispose();return result;
}
