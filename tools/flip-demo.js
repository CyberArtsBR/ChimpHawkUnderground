// Development-only recording studio. The shipping menu loads video files, not another WebGL renderer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { ALL_FLIP_LESSONS as FLIP_LESSONS,FLIP_LESSON_TIMING,flipLessonFrame } from '../src/game/FlipLessons.js';

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(960,540);renderer.setPixelRatio(1);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#17262f');
scene.fog=new THREE.Fog('#17262f',9,22);
const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(room,.06).texture;room.dispose();pmrem.dispose();
const camera=new THREE.PerspectiveCamera(36,16/9,.1,40);
camera.position.set(3.1,2.15,-4.6);camera.lookAt(0,1.1,0);
scene.add(new THREE.HemisphereLight('#d5faff','#827768',2.3));
const sun=new THREE.DirectionalLight('#fff0d9',3.4);sun.position.set(2.5,6,-3);
sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-4,right:4,top:4,bottom:-4,near:.1,far:15});
sun.shadow.normalBias=.025;scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#304851',roughness:.94}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(30,30,'#597477','#3c555d');grid.position.y=.002;scene.add(grid);
const stage=new THREE.Mesh(new THREE.CircleGeometry(1.7,80),new THREE.MeshStandardMaterial({color:'#527070',roughness:.85}));
stage.rotation.x=-Math.PI/2;stage.position.y=.003;stage.receiveShadow=true;scene.add(stage);
const ring=new THREE.Mesh(new THREE.RingGeometry(1.70,1.73,80),new THREE.MeshBasicMaterial({color:'#c9f46b',side:THREE.DoubleSide}));
ring.rotation.x=-Math.PI/2;ring.position.y=.004;scene.add(ring);
const [board,rider]=await Promise.all([
  new StreetBoard('/assets/rider/skateboard.glb').load({persist:false}),
  new UnrealRider('/assets/rider/The_AdolescentUR.glb').load(),
]);
board.setFinish(6,{persist:false});rider.deckHeight=board.deckHeight;
const actor=new THREE.Group();actor.add(board.root,rider.root);scene.add(actor);
actor.traverse(mesh=>{if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
let current=FLIP_LESSONS[0],previous=0;
function pose(time,dt=1/60){
  const frame=flipLessonFrame(current,time),k=FLIP_LESSON_TIMING;
  const air=frame.airProgress;
  actor.position.y=frame.airborne?Math.sin(Math.PI*air)*.72:0;
  const popProgress=Math.min(1,Math.max(0,(time-k.pop)/.20));
  const state=frame.airborne?(popProgress<1?'OLLIE_POP':'AIR'):frame.landing?'LAND':frame.crouch>0?'CROUCH':'COAST';
  const params={presentation:{state,popProgress},crouch:frame.crouch,airborne:frame.airborne,
    flipState:frame.flipState,landingSeverity:frame.landing ? .6 : 0,
    verticalVelocity:frame.airborne?Math.cos(Math.PI*air)*.72*Math.PI/(k.land-k.pop):0,
    airTime:frame.airborne?time-k.pop:0,time,dt,speedRatio:.25,steer:0};
  board.update(params);rider.update({...params,board});
  renderer.render(scene,camera);previous=time;
}
function reset(id){current=FLIP_LESSONS.find(l=>l.id===id)||FLIP_LESSONS[0];board.resetPresentation();rider.resetPresentation();
  for(let i=0;i<45;i++)pose(0);previous=0;}
window.demoPose=(id,time)=>{reset(id);for(let t=0;t<time;t+=1/60)pose(t);pose(time);};
window.recordLesson=async id=>{
  reset(id);
  const poster=renderer.domElement.toDataURL('image/jpeg',.9);
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(type=>MediaRecorder.isTypeSupported(type));
  if(!mime)throw new Error('WebM recording is unavailable');
  const stream=renderer.domElement.captureStream(30),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2400000});
  const stopped=new Promise(resolve=>recorder.onstop=resolve);
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  recorder.start();const start=performance.now();
  await new Promise(resolve=>{
    function tick(now){const t=(now-start)/1000;pose(Math.min(t,FLIP_LESSON_TIMING.duration),Math.min(.05,Math.max(0,t-previous)));
      if(t>=FLIP_LESSON_TIMING.duration)resolve();else requestAnimationFrame(tick);}
    requestAnimationFrame(tick);
  });
  recorder.stop();await stopped;stream.getTracks().forEach(track=>track.stop());
  const blob=new Blob(chunks,{type:mime});
  const video=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
  return {video,poster,bytes:blob.size};
};
reset(current.id);window.demoReady=true;
