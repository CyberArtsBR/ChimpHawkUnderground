import * as THREE from 'three';
import { loadGeometry } from './load-geometry.mjs';
import { buildImportedWarehouseCollision, warehouseObjectName } from '../src/park/ImportedWarehouseCollision.js';
import { createWarehousePark } from '../src/park/WarehousePark.js';
import { prepareParkRuntime } from '../src/game/ParkRegistry.js';
import { FollowCamera } from '../src/game/FollowCamera.js';
const scene = await loadGeometry('public/assets/warehouse/urban-warehouse.glb');
const world = createWarehousePark({textures:false});
const imported = buildImportedWarehouseCollision(scene,world.manifest.rails);
world.collision = imported.collision; world.manifest.rails = imported.rails;
const runtime = prepareParkRuntime(world);
let worst = Infinity, failures=[];
scene.traverse(mesh=>{
 if (!mesh.isMesh || !/Step_\d|Upper_Stair_Platform/.test(warehouseObjectName(mesh))) return;
 const b = new THREE.Box3().setFromObject(mesh), p = b.getCenter(new THREE.Vector3()); p.y=b.max.y+.015;
 for(let yaw=0;yaw<Math.PI*2;yaw+=Math.PI/4){
  const player = {position:p, velocity:new THREE.Vector3(Math.sin(yaw)*17,0,Math.cos(yaw)*17),forward:new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw)),grounded:true,surface:runtime.surface};
  const c=new FollowCamera(new THREE.PerspectiveCamera()); c.snap(player);
  const d=c.camera.position.distanceTo(p.clone().add(new THREE.Vector3(0,1.15,0)));
  worst=Math.min(worst,d); if(d<2.35) failures.push({name:warehouseObjectName(mesh),p:p.toArray(),yaw,d});
 }
});
console.log(JSON.stringify({worst,failures},null,2));


