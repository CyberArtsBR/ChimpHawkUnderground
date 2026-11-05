// Development-only contact sheets. Shipped game does not load this renderer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { FLIP_TRICKS, GRAB_TRICKS, DOUBLE_GRAB_TRICKS } from '../src/game/TrickCatalog.js';
import { grindProfile } from '../src/game/SkateSystems.js';
import { landingMotion } from '../src/character/TrickMotion.js';

const W=480,H=320,renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(W,H);renderer.setPixelRatio(1);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
const scene=new THREE.Scene();scene.background=new THREE.Color('#1d303a');
const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(room,.06).texture;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#d5faff','#827768',2.3));
const light=new THREE.DirectionalLight('#fff0d9',3.4);light.position.set(3,6,-4);scene.add(light);
const camera=new THREE.PerspectiveCamera(37,W/H,.1,40);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:'#3c555d',roughness:.9}));
floor.rotation.x=-Math.PI/2;scene.add(floor);
const grid=new THREE.GridHelper(14,28,'#597477','#3c555d');grid.position.y=.003;scene.add(grid);
const actor=new THREE.Group();scene.add(actor);
const board=await new StreetBoard('/assets/rider/skateboard.glb').load({persist:false});
board.setFinish(6,{persist:false});actor.add(board.root);
const sheet=document.createElement('canvas');sheet.id='sheet';sheet.width=W*4;sheet.height=(H+30)*4+40;
document.body.append(sheet);const ctx=sheet.getContext('2d');
let rider=null;
// Leave room above the tallest rider during an airborne trick; clipping the
// head prevents reviewers from judging the full pose in a contact sheet.
const view={front:[0,1.8,-5.5],side:[5.5,1.8,0],rear:[0,1.8,5.5]};
async function loadRider(name){
  rider?.root.removeFromParent();rider?.dispose();
  rider=await new UnrealRider(`/assets/rider/${name}.glb`).load();rider.deckHeight=board.deckHeight;actor.add(rider.root);
}
function pose(params){board.update(params);rider.update({...params,board});}
function reset(stance){rider.resetPresentation();board.resetPresentation();actor.position.y=0;
  for(let i=0;i<45;i++)pose({stance,dt:1/120,presentation:{state:'COAST'},time:i/120,speedRatio:.6});}
function motionState(kind,t,stance,name){
  const params={stance,dt:1/120,time:t,speedRatio:.7};
  if(kind==='impossible'){
    params.airborne=true;params.presentation={state:'AIR'};params.airTime=t*.55;
    params.flipState={...FLIP_TRICKS.up,progress:t};params.verticalVelocity=4*(1-t*2);
    actor.position.y=.75;
  }else if(kind==='landing'){
    params.presentation={state:'LAND'};params.landingSeverity=.85*landingMotion(t);actor.position.y=0;
  }else if(kind==='grind'){
    const active=t<.85;params.presentation={state:active?'GRIND':'AIR'};
    params.grind=active?{profile:grindProfile('Nosegrind')}:null;params.grindType=active?'Nosegrind':null;
    params.grindBalance=active?Math.sin(t*4)*.5:0;params.airborne=!active;actor.position.y=.3;
  }else{
    params.presentation={state:'AIR'};params.airborne=true;params.grabState={name};params.grabWeight=Math.min(1,t*5);
    params.airTime=t;actor.position.y=.65;
  }
  return params;
}
window.capturePresentationSheet=async({riderName,stance=1,angle='side',type='motion'})=>{
  if(!rider || rider.url!==`/assets/rider/${riderName}.glb`)await loadRider(riderName);
  camera.position.set(...view[angle]);camera.lookAt(0,1.25,0);
  ctx.fillStyle='#101c24';ctx.fillRect(0,0,sheet.width,sheet.height);
  ctx.font='20px sans-serif';ctx.fillStyle='#effbf5';ctx.fillText(`${riderName} / ${stance===1?'REGULAR':'SWITCH'} / ${angle} / ${type}`,18,28);
  const grabs=[...new Set([...Object.values(GRAB_TRICKS),...Object.values(DOUBLE_GRAB_TRICKS)].map(t=>t.name))];
  const cells=type==='grabs'?grabs.map(name=>({kind:'grab',name,t:.6})):[
    ...[.14,.34,.50,.94].map(t=>({kind:'impossible',t})),
    ...[0,.16,.7,.99].map(t=>({kind:'landing',t})),
    ...[0,.2,.7,1].map(t=>({kind:'grind',t})),
    ...['Indy','Nosegrab','Melon','Tailgrab'].map(name=>({kind:'grab',name,t:.6})),
  ];
  const contacts=[];
  for(let i=0;i<Math.min(cells.length,16);i++){
    const cell=cells[i];reset(stance);
    if(cell.kind==='landing')for(let n=0;n<50;n++)pose({...motionState('impossible',1,stance),flipState:null});
    for(let t=0;t<cell.t;t+=1/120)pose(motionState(cell.kind,t,stance,cell.name));
    pose(motionState(cell.kind,cell.t,stance,cell.name));renderer.render(scene,camera);
    const x=(i%4)*W,y=40+Math.floor(i/4)*(H+30);ctx.drawImage(renderer.domElement,x,y);
    ctx.fillStyle='#e6f3f3';ctx.font='18px sans-serif';ctx.fillText(`${cell.name||cell.kind} ${Math.round(cell.t*100)}%`,x+12,y+H+22);
    if(cell.name)for(const side of ['l','r']){
      const goal=rider.grabTarget(cell.name,side,stance,board);if(!goal)continue;
      const wrist=rider.bones[`hand_${side}`].getWorldPosition(new THREE.Vector3());
      contacts.push({name:cell.name,side,wristDistance:wrist.distanceTo(goal)});
    }
  }
  return {image:sheet.toDataURL('image/png'),contacts,cells:cells.length};
};
window.studioReady=true;
