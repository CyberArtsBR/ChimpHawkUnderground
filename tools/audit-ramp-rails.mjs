import * as THREE from 'three';
import { loadGeometry } from './load-geometry.mjs';
import { createWarehousePark } from '../src/park/WarehousePark.js';
import { buildImportedWarehouseCollision, warehouseObjectName } from '../src/park/ImportedWarehouseCollision.js';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { RailNetwork } from '../src/game/RailNetwork.js';
import { writeFile, mkdir } from 'node:fs/promises';

const root = await loadGeometry('public/assets/warehouse/urban-warehouse.glb');
const authored = createWarehousePark({ textures: false });
const imported = buildImportedWarehouseCollision(root, authored.manifest.rails);
const surface = new ParkCollision(imported.collision);
const network = new RailNetwork(imported.rails);
const meshes = [], blocked = [], missing = [], rails = [];
root.traverse(mesh => {
  if (!mesh.isMesh) return;
  const name = warehouseObjectName(mesh);
  if (!/Skateable_Surface|Surface_Plywood|Rideable_Arc|Continuous_Rideable_Surface|Side_Wood_Core|Back_Panel|Side_Edge_Band|___tube/.test(name)) return;
  const box = new THREE.Box3().setFromObject(mesh);
  meshes.push({ name, object: mesh.name, parent: mesh.parent.name, parentData: mesh.parent.userData, min: box.min.toArray(), max: box.max.toArray() });
  const joined = mesh.parent?.userData?.name?.includes(' / ');
  if (joined && !/Foundry_Plywood(?:\.\d+)?$/.test(mesh.material?.name || '')) return;
  if (!joined && !/Skateable_Surface|Surface_Plywood|Rideable_Arc|Continuous_Rideable_Surface/.test(name)) return;
  const g = mesh.geometry, p = g.attributes.position, idx = g.index;
  for (let i = 0; i < (idx?.count || p.count); i += 3) {
    const v = [0,1,2].map(j => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(i+j) : i+j).applyMatrix4(mesh.matrixWorld));
    const n = new THREE.Triangle(...v).getNormal(new THREE.Vector3());
    if (Math.abs(n.y) < .08 || /___tube/.test(name)) continue;
    if (n.y < 0) n.negate();
    const centre = v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1/3);
    const point = new THREE.Vector3(), normal = new THREE.Vector3();
    const hit = surface.rayRideable(centre.clone().addScaledVector(n,.04), n.clone().negate(), .08, point, normal);
    if (!hit || point.distanceTo(centre) > .035) { missing.push({ name, centre:centre.toArray() }); continue; }
    const pos = centre.clone().addScaledVector(n,.015);
    const move = surface.move(pos,pos,new THREE.Vector3(),{fromUp:n,toUp:n,grounded:true});
    if (move.position.distanceTo(pos) > .08) blocked.push({name, centre:centre.toArray(), displacement:move.position.distanceTo(pos), contacts:move.contacts.length});
  }
});
for (const rail of network.rails) {
  let obstructed = 0, maxDisplacement = 0, badPoint = null;
  for (let s = .2; s < rail.length - .2; s += .3) {
    const sample = network.sample(rail,s,{clearance:.024});
    const moved = surface.move(sample.point,sample.point,new THREE.Vector3(),{ignoreRail:rail.name});
    const distance = moved.position.distanceTo(sample.point);
    if(distance > .03) { obstructed++; if(distance > maxDisplacement){maxDisplacement=distance;badPoint=sample.point.toArray();} }
  }
  rails.push({name:rail.name, length:rail.length, radius:rail.radius, obstructed,maxDisplacement,badPoint,first:rail.points[0].toArray(),last:rail.points.at(-1).toArray()});
}
await mkdir('artifacts/collision-audit',{recursive:true});
await writeFile('artifacts/collision-audit/geometry.json',JSON.stringify({meshes,missing,blocked,rails},null,2));
console.log(JSON.stringify({meshCount:meshes.length,repairs:imported.repairs,missing:missing.length,blocked:blocked.length,missingNames:[...new Set(missing.map(x=>x.name))],blockedNames:[...new Set(blocked.map(x=>x.name))],rails},null,2));
if (missing.length || blocked.length || rails.some(rail => rail.obstructed)) process.exitCode = 1;
