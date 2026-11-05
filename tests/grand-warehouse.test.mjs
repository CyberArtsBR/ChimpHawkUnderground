import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { PARK_DEFINITIONS } from '../src/park/ParkRegistry.js';
import { PARK_REGISTRY, prepareParkRuntime } from '../src/game/ParkRegistry.js';
import { createWarehousePark } from '../src/park/WarehousePark.js';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { buildImportedWarehouseCollision, warehouseObjectName } from '../src/park/ImportedWarehouseCollision.js';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { ensureGrandWarehouseSpawns } from '../src/park/GrandWarehouseSpawns.js';
import { excludeGrandWarehouseMisplacedSixStair, isGrandWarehouseMisplacedSixStair } from '../src/park/GrandWarehouseSceneFilter.js';
import { batchWarehouseVisuals } from '../src/park/WarehouseVariants.js';

const file = 'public/assets/warehouse/granwarehouse.glb';
const expectedHash = '759af97a43197371f68704e7f93092f5b416e7b282355a8b5554125a6c318c38';


test('Map 3 is distinct and preserves ORBIT as Map 2', () => {
  const ids = PARK_DEFINITIONS.filter(p => p.selectable).map(p => p.id);
  assert.deepEqual(ids, ['skate-paradise','orbit','grand-warehouse']);
  assert.equal(PARK_DEFINITIONS.find(p => p.id === 'orbit').number, 2);
  assert.equal(PARK_REGISTRY.orbit.name, 'ORBIT');
  assert.equal(PARK_DEFINITIONS.find(p => p.id === 'grand-warehouse').number, 3);
  assert.equal(typeof PARK_REGISTRY['grand-warehouse'].create, 'function');
});

test('original map geometry is embedded in an immutable, separately versioned Map 3 GLB', () => {
  const bytes = readFileSync(file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash,
    'Upload the exact Grand Warehouse GLB from ChatGPT; do not overwrite Map 2');
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+length).toString('utf8'));
  assert.equal(json.meshes.length,1412,'SKATEWAREHOUSE revised GLB mesh count changed');
  assert.equal(json.nodes.length,1457,'SKATEWAREHOUSE revised scene hierarchy changed');
  assert.equal(json.materials.length,134,'SKATEWAREHOUSE material slots changed');
  assert.equal(json.images.length,6,'SKATEWAREHOUSE embedded textures missing');
  assert.equal(json.nodes.filter(n=>/^(?:Cube__0(?:\.001)?|Plane_SkateLite_base_color\.002_0)$/.test(n.name||'')).length,0,
    'the artist removed the two low obstacles and SkateLite ramp in this revision');
  assert.equal(json.nodes.filter(n=>(n.name||'').includes('___tube')).length,17,
    'all 17 original authored metal rail tubes must remain');
  const movedBands = [
    ['04_FLOW_LAB / Flow launch ramp / Side_Edge_Band 001', 33.72187042236328],
    ['04_FLOW_LAB / Flow launch ramp / Side_Edge_Band 001.001', 33.64250183105469],
  ];
  for (const [name,z] of movedBands) {
    const node=json.nodes.find(n=>n.name===name);
    assert.ok(node,'edited decorative edge band missing: '+name);
    assert.ok(Math.abs(node.translation[2]-z)<0.00002,
      'the updated artist edge-band placement was not preserved: '+name);
  }
  assert.ok(json.nodes.some(n=>/Ground_Floor/.test(n.name||'')));
  assert.ok(json.nodes.some(n=>/Brick_North_South_Wall/.test(n.name||'')));
  assert.ok(json.nodes.some(n=>/^02_TIMBER_BOWL/.test(n.name||'')));
  assert.ok(json.nodes.some(n=>/^03_VERT_HALL/.test(n.name||'')));
  assert.ok(json.nodes.some(n=>/___tube/.test(n.name||'')));
  for (const image of json.images||[]) assert.ok(image.bufferView!==undefined,'GLB uses external texture file');
});

const root = await loadGeometry(file);
const removed = excludeGrandWarehouseMisplacedSixStair(root);
const baseline = createWarehousePark({ textures: false });
const before = new Map();
root.updateMatrixWorld(true);
root.traverse(node => {
  if (!node.isMesh || !/Skateable_Surface/.test(warehouseObjectName(node))) return;
  before.set(node.uuid, node.matrixWorld.elements.slice());
});
const imported = buildImportedWarehouseCollision(root, baseline.manifest.rails, { grandMode: true });
baseline.collision = imported.collision;
baseline.manifest.rails = imported.rails;
ensureGrandWarehouseSpawns(baseline);
const runtime = prepareParkRuntime(baseline);
const objectNames = imported.surfaces.join(';');

test('the imported West/Flow quarter faces by the horseshoe rail have real wheel support', () => {
  // Sample the actual artist GLB, not a procedural replacement quarter or a
  // flat proxy that would incorrectly cap the bowl. The wheel ray must meet
  // the visible ramp skin at the same height.
  const surface = new ParkCollision(imported.collision);
  const candidates = [];
  root.updateMatrixWorld(true);
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.grandWarehouseExcluded) return;
    const name = warehouseObjectName(mesh);
    if (!/(?:West transfer quarter|Flow launch ramp)/.test(name)
      || !/Skateable_Surface/.test(name)) return;
    if (/Plywood_Edges|Stainless_Coping|Grind_Rail/.test(mesh.material?.name || '')) return;
    const p = mesh.geometry?.attributes?.position, idx = mesh.geometry?.index;
    if (!p) return;
    for (let i = 0; i + 2 < (idx?.count || p.count); i += 3) {
      const tri = [0,1,2].map(n => new THREE.Vector3().fromBufferAttribute(
        p, idx ? idx.getX(i + n) : i + n).applyMatrix4(mesh.matrixWorld));
      const normal = new THREE.Triangle(...tri).getNormal(new THREE.Vector3());
      if (normal.y < .12 || normal.y > .98) continue;
      const centre = tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1/3);
      if (Number.isFinite(centre.y)) candidates.push({ centre, name });
    }
  });
  const down = new THREE.Vector3(0,-1,0), point = new THREE.Vector3(), normal = new THREE.Vector3();
  const failures = []; let sampled = 0;
  for (let i = 0; i < candidates.length; i += Math.max(1, Math.ceil(candidates.length/48))) {
    const {centre,name} = candidates[i];
    const origin = centre.clone().addScaledVector(new THREE.Vector3(0,1,0), .35);
    const hit = surface.rayRideable(origin, down, .75, point, normal);
    sampled++;
    if (!hit || Math.abs(point.y-centre.y) > .11) failures.push({
      name, x:+centre.x.toFixed(2), y:+centre.y.toFixed(2), z:+centre.z.toFixed(2),
      hitY:hit ? +point.y.toFixed(2) : null,
    });
  }
  console.log('GRAND_QUARTER_CONTACTS ' + JSON.stringify({
    eligibleTriangles:candidates.length, checked:sampled, failures:failures.slice(0,8),
  }));
  assert.ok(sampled >= 6, 'not enough authored quarter triangles tested');
  assert.equal(failures.length, 0, 'visible imported quarter ramp has missing wheel support');
});



test('Map 3 preserves every artist-authored ramp location and original floor finish', () => {
  assert.deepEqual(imported.repairs.movedRamps,[],'must never move Blender ramps behind the artist');
  for (const [uuid,oldMatrix] of before) {
    let found = null;
    root.traverse(node=>{if(node.uuid===uuid)found=node;});
    assert.ok(found);
    assert.deepEqual(found.matrixWorld.elements,oldMatrix);
  }
  let floor;
  root.traverse(node=>{if(node.isMesh && /Ground_Floor/.test(warehouseObjectName(node))) floor ||= node;});
  assert.ok(floor);
  assert.doesNotMatch(floor.material.name,/charcoal/i,'Grand Warehouse uses its own edited materials');
});

test('every named skateable ramp skin has physics, and wood/trim/roof art is not wheel collision', () => {
  assert.ok(imported.surfaces.length >= 20,'missing skateable ramps');
  assert.match(objectNames,/Skateable_Surface/);
  assert.doesNotMatch(objectNames,/GRAFFITI|VISUAL_ONLY|Grille_Slat|Hanging_Light/);
  assert.ok(imported.collision.children.some(m=>m.userData.surface==='rideable'));
  assert.ok(imported.collision.children.some(m=>m.userData.surface==='solid'));
  assert.ok(imported.triangles > 500,'collision mesh is incomplete');
  assert.ok(!imported.surfaces.some(s=>/^Cube__0|SkateLite/.test(s)),
    'deleted Blender obstacles must not leave invisible wheel-collision geometry');
  assert.ok(imported.repairs.movedRamps.length===0,'Grand must retain artist positions');
});

test('remove ONLY the duplicated near-volcano Six stair and preserve original Nine stair', () => {
  assert.ok(removed >= 7, `expected seven multi-material slices of misplaced stair; excluded ${removed}`);
  let excluded=0, visible=0, preservedNine=0, preservedOtherSix=0;
  root.traverse(object => {
    if (!object.isMesh) return;
    const name=warehouseObjectName(object);
    if (object.userData.grandWarehouseExcluded) {
      assert.match(name,/Six stair kinked down rail \/ Hubba_Solid_-1 001/);
      excluded++;
    } else {
      visible++;
      if (/^01_STREET_DISTRICT \/ Nine stair(?: \/| )/.test(name)) preservedNine++;
      if (/Six stair kinked down rail \/ Hubba_Solid_-1 001\.00[12]/.test(name)) preservedOtherSix++;
    }
  });
  assert.equal(excluded,removed);
  assert.ok(preservedNine >= 35,'correct Blender-reference Nine stair must remain');
  assert.ok(preservedOtherSix >= 2,'other positioned Six stair copies must remain');
  assert.ok(imported.rails.some(rail=>/Nine stair/.test(rail.name)),
    'correct Nine stair handrails must remain grindable');
  assert.ok(!imported.surfaces.some(name=>/^01_STREET_DISTRICT \/ Six stair kinked down rail \/ Hubba_Solid_-1 001$/.test(name)),
    'misplaced near-volcano stair still produces rideable contact');

  // Visual batching must share EXACTLY the same exclusions as collision.
  const scene = new THREE.Group();
  const keep = new THREE.Mesh(new THREE.BoxGeometry(2,1,2),new THREE.MeshBasicMaterial());
  keep.name='01_STREET_DISTRICT / Nine stair / Step_00 001'; keep.position.set(10,1,31);
  scene.add(keep);
  const stray=keep.clone();
  stray.name='01_STREET_DISTRICT / Six stair kinked down rail / Hubba_Solid_-1 001';
  stray.position.set(42,1,-7); scene.add(stray);
  const other=keep.clone();
  other.name='01_STREET_DISTRICT / Six stair kinked down rail / Hubba_Solid_-1 001.001';
  other.position.set(-21,1,17);scene.add(other);
  assert.equal(excludeGrandWarehouseMisplacedSixStair(scene),1);
  const batches=batchWarehouseVisuals(scene,'Grand Warehouse spatial filter QA');
  assert.equal(batches.sourceMeshes,2);
  assert.equal(batches.visualTriangles,24);
  assert.ok(visible>1200,'unexpectedly removed most of the imported scene');
});

test('Grand Warehouse extracts actual joined metal coping tubes, not their wooden support meshes', () => {
  assert.ok(imported.rails.length>=25,`only ${imported.rails.length} grind paths in revised Blender GLB`);
  assert.ok(imported.rails.some(r=>/West transfer quarter/.test(r.name)),
    'West quarter copings embedded in the wood mesh must be grindable');
  assert.ok(imported.rails.some(r=>/Nine stair/.test(r.name)),'correct Nine stair grind path missing');
  assert.ok(imported.rails.some(r=>/Timber bowl/.test(r.name)),'bowl coping missing');
  const names=new Set();
  for(const rail of imported.rails){
    assert.ok(!names.has(rail.name),`duplicate rail: ${rail.name}`);names.add(rail.name);
    assert.ok(rail.radius>.01&&rail.radius<.4,rail.name);
    assert.ok(rail.points.length>=2,rail.name);
    for(const p of rail.points)assert.ok(p.every(Number.isFinite),rail.name);
  }
});

test('entrance and named respawns have complete four-wheel support', () => {
  for(const spot of baseline.manifest.spots){
    const support=runtime.boardContact.snapToGround(new THREE.Vector3(...spot.position),
      spot.heading || 0,.5,1);
    assert.equal(support.count,4,`unsupported ${spot.id}`);
    assert.ok(support.normal.y>.96,`nonflat ${spot.id}`);
  }
});

test('skater can capture each reconstructed metal grind path without being blocked by artwork', () => {
  const skater=new StatefulSkillStreetPhysics({
    collision:imported.collision,spawn:baseline.manifest.spawn,
    rails:imported.rails,playableRegions:baseline.manifest.playableRegions,
  });
  for(const rail of skater.railNetwork.rails){
    const hit=skater.railNetwork.sample(rail,rail.length*.5);
    const tangent=hit.tangent.clone();
    skater.reset(new THREE.Vector3(...baseline.manifest.spawn),0);
    skater.position.copy(hit.point).add(new THREE.Vector3(0,.12,0));
    skater.heading=Math.atan2(-tangent.x,-tangent.z);
    skater.airHeading=skater.heading;
    skater.airDirection();skater.grounded=false;
    skater.velocity.copy(tangent).multiplyScalar(5);skater.velocity.y=-.5;
    assert.equal(skater.enterGrind({name:'50-50',points:100}),true,rail.name);
  }
});
