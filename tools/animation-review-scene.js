// Rendered review of the shipping presentation classes and actual supplied GLBs.
// This stage isolates pose/contact readability; it does not certify park physics.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {UnrealRider} from '../src/character/UnrealRider.js';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';
import {ALL_FLIP_LESSONS,FLIP_LESSON_TIMING as T,flipLessonFrame} from '../src/game/FlipLessons.js';
import {grindProfile} from '../src/game/SkateSystems.js';
import {ParkCollision} from '../src/game/ParkCollision.js';

const W=340,H=300,renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(W,H);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#263640');
const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(room,.06).texture;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#e7f5ff','#756956',2));
const key=new THREE.DirectionalLight('#fff0df',3.1);key.position.set(3,6,-3);scene.add(key);
const rim=new THREE.DirectionalLight('#b8dfff',1.5);rim.position.set(-3,4,2);scene.add(rim);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.MeshStandardMaterial({color:'#3d5059',roughness:.9}));floor.rotation.x=-Math.PI/2;floor.userData.surface='rideable';scene.add(floor);
const grid=new THREE.GridHelper(20,40,'#72828b','#4e626d');grid.position.y=.002;scene.add(grid);
const surface=new ParkCollision(floor),camera=new THREE.PerspectiveCamera(43,W/H,.05,40);
const actors=[];
for(const stance of [1,-1]){
 const [board,rider]=await Promise.all([new StreetBoard('/assets/rider/skateboard.glb').load({persist:false}),new UnrealRider('/assets/rider/The_AdolescentUR.glb').load()]);
 board.setFinish(6,{persist:false});rider.deckHeight=board.deckHeight;
 const root=new THREE.Group();root.add(board.root,rider.root);scene.add(root);actors.push({stance,board,rider,root});
}
const views=[['SIDE',[3.7,1.65,0]],['FRONT / NOSE',[0,1.65,-3.7]],['REAR / TAIL',[0,1.65,3.7]]];
const canvas=(cols,rows,title)=>{const c=document.createElement('canvas');c.width=W*cols;c.height=H*rows+52;const g=c.getContext('2d');g.fillStyle='#14242e';g.fillRect(0,0,c.width,c.height);g.fillStyle='#f3edce';g.font='bold 22px Arial';g.fillText(title,12,32);return {canvas:c,g};};
// Fixture-only input timeline. Match StreetSkater's 28/s grab envelope without
// changing gameplay timing; normal/slow recordings run the same 120 Hz steps.
const grabTimeline=Object.freeze({engage:.35,release:1.5,duration:2.2,response:28});
function grabTransitionFrame(time){
 const {engage,release,response}=grabTimeline,active=time>=engage&&time<release;
 const held=1-Math.exp(-response*(release-engage));
 const weight=time<engage?0:active?1-Math.exp(-response*(time-engage)):held*Math.exp(-response*(time-release));
 return {weight,retained:active||weight>=.005,phase:time<engage?'AIR':active?(weight<.99?'REACH':'HOLD'):(weight>=.005?'RELEASE':'AIR')};
}
function reset(actor){actor.board.resetPresentation();actor.rider.resetPresentation();actor.root.position.set(0,0,0);for(let i=0;i<45;i++)pose(actor,{kind:'idle'},0,1/60);}
function pose(actor,spec,time,dt=1/60){
 const {board,rider,root,stance}=actor;let params={stance,time,dt,speedRatio:0,airborne:false,presentation:{state:'IDLE'}};root.position.y=0;
 if(spec.kind==='flip'){
  const lesson=ALL_FLIP_LESSONS.find(l=>l.id===spec.id),f=flipLessonFrame(lesson,time),height=spec.pop??.72;
  root.position.y=f.airborne?Math.sin(Math.PI*f.airProgress)*height:0;
  const popProgress=THREE.MathUtils.clamp((time-T.pop)/.2,0,1);
  params={...params,presentation:{state:f.airborne?(popProgress<1?'OLLIE_POP':'AIR'):f.landing?'LAND':f.crouch?'CROUCH':'COAST',popProgress},airborne:f.airborne,flipState:f.flipState,crouch:f.crouch,landingSeverity:f.landing?.65:0,verticalVelocity:f.airborne?Math.cos(Math.PI*f.airProgress)*height*Math.PI/(T.land-T.pop):0,airTime:f.airborne?time-T.pop:0};
 }else if(spec.kind==='grab'){
  root.position.y=.7;params={...params,presentation:{state:'AIR'},airborne:true,grabState:{name:spec.name},grabWeight:1,airTime:.5,verticalVelocity:0};
 }else if(spec.kind==='grabTransition'){
  const frame=grabTransitionFrame(time);root.position.y=.7;
  params={...params,presentation:{state:'AIR'},airborne:true,grabState:frame.retained?{name:spec.name}:null,grabWeight:frame.weight,airTime:.5+time,verticalVelocity:0};
 }else if(spec.kind==='grind'){
  const balance=spec.balance??.65;params={...params,presentation:{state:'GRIND'},grind:{profile:grindProfile(spec.name)},grindType:spec.name,grindBalance:balance};
 }else if(spec.kind==='manual')params={...params,presentation:{state:spec.name==='noseManual'?'NOSE_MANUAL':'MANUAL'},manual:spec.name,manualBalance:spec.balance??.6};
 else if(spec.kind==='balanceFlow'){
  const flatland=time>.7&&time<2?'Handstand':null;
  params={...params,manual:spec.manual||'noseManual',flatland,presentation:{state:flatland?'FLATLAND':spec.manual==='manual'?'MANUAL':'NOSE_MANUAL'}};
 }
 else if(spec.kind==='bail')params={...params,presentation:{state:'BAIL'},bail:true,bailProgress:time/3,bailPhysics:{surface,anchor:root.position,velocity:new THREE.Vector3(4,-1,-1),severity:.7}};
 board.update(params);const supportBounds=rider.footSupportBounds;if(spec.clearance===false)rider.footSupportBounds=[];
 rider.update({...params,board});rider.footSupportBounds=supportBounds;root.updateMatrixWorld(true);
}
function advance(actor,spec,time){reset(actor);for(let t=0;t<time;t+=1/120)pose(actor,spec,t,1/120);pose(actor,spec,time,1/120);}
function draw(g,actor,x,y,label){
 for(const a of actors)a.root.visible=a===actor;
 for(let view=0;view<views.length;view++){
  const [name,offset]=views[view],lift=actor.root.position.y*.7,fallen=actor.rider.ragdoll.active?actor.rider.ragdoll.nodes.get('pelvis').p:null;
  const centre=fallen?fallen.clone().add(new THREE.Vector3(0,.25,0)):new THREE.Vector3(0,.86+lift,0);
  camera.position.set(offset[0],offset[1]-.86,offset[2]).add(centre);camera.lookAt(centre);renderer.render(scene,camera);
  g.drawImage(renderer.domElement,x+view*W,y);g.fillStyle='#10202de8';g.fillRect(x+view*W,y,W,40);g.fillStyle='#f4eccc';g.font='bold 13px Arial';g.fillText(`${label} · ${name}`,x+view*W+9,y+17);
 }
}
window.reviewSheet=spec=>{
 const {canvas:c,g}=canvas(6,spec.rows.length,spec.title);
 spec.rows.forEach((row,i)=>{for(let a=0;a<actors.length;a++){advance(actors[a],row.spec,row.time);draw(g,actors[a],a*W*3,52+i*H,`${actors[a].stance>0?'REGULAR':'SWITCH'} · ${row.label}`);}});
 return c.toDataURL('image/png');
};
window.reviewFocus=({spec,time,stance=1})=>{const {canvas:c,g}=canvas(3,1,`${spec.id||spec.name||spec.kind} @ ${time.toFixed(3)}s`),actor=actors.find(a=>a.stance===stance);advance(actor,spec,time);draw(g,actor,0,52,stance>0?'REGULAR':'SWITCH');return c.toDataURL('image/png');};
window.reviewRecord=async({id,stance=1,pop=.72})=>{
 const actor=actors.find(a=>a.stance===stance),spec={kind:'flip',id,pop},{canvas:c,g}=canvas(3,1,`${id} · ${stance>0?'regular':'switch'} · normal then 0.45×`);
 const stream=c.captureStream(30),chunks=[],mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(x=>MediaRecorder.isTypeSupported(x));
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2100000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
 for(const rate of [1,.45]){reset(actor);let previous=0;const start=performance.now();await new Promise(resolve=>{const tick=now=>{const time=Math.min(T.duration,(now-start)/1000*rate);pose(actor,spec,time,Math.min(.05,time-previous));previous=time;draw(g,actor,0,52,`${rate===1?'NORMAL':'0.45× SLOW'} · ${time.toFixed(2)}s`);if(time>=T.duration)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);});}
 recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mime});return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
};
window.reviewGrabTimeline=grabTimeline;
window.reviewGrabRecord=async({name='Indy',stance=1}={})=>{
 const actor=actors.find(a=>a.stance===stance);
 if(!actor)throw new RangeError('Grab recording stance must be 1 or -1');
 const spec={kind:'grabTransition',name},{canvas:c,g}=canvas(3,1,`${name} · ${stance>0?'regular':'switch'} · reach / hold / release · normal then 0.45×`);
 const stream=c.captureStream(30),chunks=[],mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(x=>MediaRecorder.isTypeSupported(x));
 const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2100000});
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
 for(const rate of [1,.45]){
  reset(actor);let step=0;pose(actor,spec,0,1/120);const start=performance.now();
  await new Promise(resolve=>{
   const tick=now=>{
    const elapsed=Math.min(grabTimeline.duration,(now-start)/1000*rate),wanted=Math.floor(elapsed*120+1e-6);
    while(step<wanted){step++;pose(actor,spec,step/120,1/120);}
    const time=step/120,frame=grabTransitionFrame(time);
    draw(g,actor,0,52,`${rate===1?'NORMAL':'0.45× SLOW'} · ${frame.phase} · w=${frame.weight.toFixed(2)} · ${time.toFixed(2)}s`);
    if(elapsed>=grabTimeline.duration)resolve();else requestAnimationFrame(tick);
   };requestAnimationFrame(tick);
  });
 }
 recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());
 const blob=new Blob(chunks,{type:mime});return await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
};
window.reviewSwapRider=async name=>{for(const actor of actors){actor.rider.dispose();actor.rider=await new UnrealRider(`/assets/rider/${name}.glb`).load();actor.rider.deckHeight=actor.board.deckHeight;actor.root.add(actor.rider.root);reset(actor);}return true;};
window.reviewGrabContactCandidate=enabled=>{for(const actor of actors){actor.rider.setGrabContactCandidate(enabled);reset(actor);}return true;};
window.reviewReady=true;
