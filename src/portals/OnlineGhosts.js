import * as THREE from 'three';
import { UnrealRider } from '../character/UnrealRider.js';
import { StreetBoard } from '../skateboard/StreetBoard.js';
import { gameAssetUrl } from '../game/AssetPaths.js';

const allowedStates=new Set(['IDLE','PUSH','COAST','BRAKE','CROUCH','PUMP','OLLIE_POP','AIR','VERT_AIR','LAND','MANUAL','NOSE_MANUAL','GRIND','WALLRIDE','FLATLAND','BAIL']);
const vec=a=>Array.isArray(a)&&a.length===3&&a.every(n=>Number.isFinite(n)&&Math.abs(n)<10000);
const quat=a=>Array.isArray(a)&&a.length===4&&a.every(n=>Number.isFinite(n)&&Math.abs(n)<=1.001);
const capped=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
export function validatePose(p){
 return p&&p.kind==='online:pose'&&p.v===1&&vec(p.p)&&quat(p.q)&&
  (typeof p.map==='string')&&allowedStates.has(p.state)&&typeof p.hero==='string';
}
export class OnlineGhosts {
 constructor({scene,camera,heroUrl}){
  this.scene=scene;this.camera=camera;this.heroUrl=heroUrl;this.peers=new Map();
  this.names=document.createElement('div');this.names.className='online-nameplates';document.body.append(this.names);
  this.tmp=new THREE.Vector3();
 }
 async ensure(id,pose){
  if(this.peers.has(id))return this.peers.get(id);
  const root=new THREE.Group();
  const item={id,root,pose,previous:null,received:performance.now(),hero:pose.hero,
    board:null,rider:null,name:'Skater',speaking:false,loading:true};
  this.peers.set(id,item);this.scene.add(root);
  const label=document.createElement('div');label.className='online-nameplate';label.textContent='Skater';
  this.names.append(label);item.label=label;
  try{
   const url=this.heroUrl(item.hero);
   const [board,rider]=await Promise.all([
    new StreetBoard(gameAssetUrl('/assets/rider/skateboard.glb')).load({persist:false}),
    new UnrealRider(url).load(),
   ]);
   if(this.peers.get(id)!==item){rider.dispose();return null}
   item.board=board;item.rider=rider;rider.deckHeight=board.deckHeight;
   root.add(board.root,rider.root);item.loading=false;
   board.setFinish(capped(pose.board,0,7),{persist:false});
  }catch(error){console.warn('[Online] Failed to load remote skater',error);this.remove(id)}
  return item;
 }
 receive(id,pose,map){
  if(!validatePose(pose)||pose.map!==map)return;
  let item=this.peers.get(id);
  if(!item){void this.ensure(id,pose);return}
  if(item.hero!==pose.hero){this.remove(id);void this.ensure(id,pose);return}
  item.previous=item.pose;item.pose=pose;item.received=performance.now();
 }
 setRoster(players,names={},speakers=[]){
  const ids=new Set(players.map(p=>p.id));
  for(const id of this.peers.keys())if(!ids.has(id))this.remove(id);
  for(const p of players){const item=this.peers.get(p.id);if(item){
   item.name=String(names[p.id]||p.displayName||'Guest').slice(0,24);
   item.speaking=speakers.includes(p.id);
  }}
 }
 update(dt,map){
  const t=performance.now();
  for(const item of this.peers.values()){
   const p=item.pose;
   if(p.map!==map){item.root.visible=false;item.label.hidden=true;continue}
   const age=t-item.received;
   if(age>2200){item.root.visible=false;item.label.hidden=true;continue}
   item.root.visible=true;
   const from=item.previous&&item.previous.map===p.map?item.previous:p;
   const alpha=capped((t-item.received+120)/220,0,1);
   const start=new THREE.Vector3(...from.p),end=new THREE.Vector3(...p.p);
   // Limited extrapolation handles short packet gaps without crossing entire obstacles.
   const beyond=capped(age-120,0,110)/1000;
   if(beyond&&vec(p.vel))end.addScaledVector(new THREE.Vector3(...p.vel),beyond);
   item.root.position.lerpVectors(start,end,alpha);
   const a=new THREE.Quaternion(...from.q),b=new THREE.Quaternion(...p.q);
   item.root.quaternion.copy(a).slerp(b,alpha);
   if(item.board&&item.rider){
    const flip=p.flip&&Number.isFinite(p.flip.progress)?p.flip:null;
    const common={presentation:{state:p.state,popProgress:1},flipState:flip,
     grabState:p.grab?{name:p.grab}:null,grabWeight:p.grab?1:0,
     manual:p.manual||null,grind:p.grind?{trick:{name:'50-50'}}:null,
     grindType:p.grind?'50-50':null,airborne:p.air===true,bail:p.bail===true,
     speedRatio:capped(p.speed/18,0,1),time:t/1000,dt:Math.max(0,Math.min(dt,.05))};
    item.board.update(common);item.rider.update({...common,board:item.board,stance:p.stance||1});
   }
   this.tmp.set(item.root.position.x,item.root.position.y+2.2,item.root.position.z).project(this.camera);
   const inside=Math.abs(this.tmp.x)<=1&&Math.abs(this.tmp.y)<=1&&this.tmp.z<1;
   item.label.hidden=!inside;
   if(inside){
    item.label.textContent=(item.speaking?'◉ ':'')+item.name;
    item.label.style.left=((this.tmp.x+1)*50)+'%';
    item.label.style.top=((1-this.tmp.y)*50)+'%';
   }
  }
 }
 remove(id){
  const item=this.peers.get(id);if(!item)return;this.peers.delete(id);
  item.label?.remove();item.root.removeFromParent();item.rider?.dispose();
 }
 dispose(){for(const id of [...this.peers.keys()])this.remove(id);this.names.remove()}
}
