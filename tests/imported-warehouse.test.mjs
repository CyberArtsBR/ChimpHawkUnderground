import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { buildImportedWarehouseCollision, warehouseObjectName } from '../src/park/ImportedWarehouseCollision.js';
import { createWarehousePark } from '../src/park/WarehousePark.js';
import { ensureGrandWarehouseSpawns } from '../src/park/GrandWarehouseSpawns.js';
import { prepareParkRuntime } from '../src/game/ParkRegistry.js';
import { compileTransitionMetadata } from '../src/game/transitions/TransitionMetadata.js';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { FollowCamera } from '../src/game/FollowCamera.js';

// The previous suite targeted an unshipped Map 4 GLB and asserted its exact
// six-spawn layout, charcoal material and 50 rails. Use the shipping Grand
// Warehouse GLB in its actual grandMode collision path instead; do not invent
// the old asset, mute failures, or modify authored scene geometry.
const scene = await loadGeometry('public/assets/warehouse/granwarehouse.glb');
scene.updateMatrixWorld(true);
const authored = new Map();
scene.traverse(mesh => {
  if (mesh.isMesh && /Skateable_Surface/.test(warehouseObjectName(mesh)))
    authored.set(mesh.uuid, mesh.matrixWorld.elements.slice());
});
const world = createWarehousePark({ textures:false });
const imported = buildImportedWarehouseCollision(scene, world.manifest.rails, { grandMode:true });
world.collision = imported.collision;
world.manifest.rails = imported.rails;
ensureGrandWarehouseSpawns(world);
const runtime = prepareParkRuntime(world);

test('Grand Warehouse collision extraction never mutates authored ramp transforms',()=>{
  let verified=0;
  scene.traverse(mesh=>{
    if(!authored.has(mesh.uuid))return;
    assert.deepEqual(mesh.matrixWorld.elements,authored.get(mesh.uuid),
      'Blender ramp was moved during collision extraction: '+warehouseObjectName(mesh));
    verified++;
  });
  assert.ok(verified>=20,'too few authored ramp meshes checked');
  assert.deepEqual(imported.repairs.movedRamps,[]);
});

test('released warehouse retains independent skateable surfaces and solid obstacles',()=>{
  assert.ok(imported.surfaces.length>=20,'missing wheel-contact ramps');
  assert.ok(imported.triangles>500,'truncated authored collision');
  const role=kind=>imported.collision.children.filter(o=>o.userData.surface===kind);
  assert.ok(role('rideable').length>0,'rideable triangles missing');
  assert.ok(role('solid').length>0,'solid obstacle triangles missing');
  assert.doesNotMatch(imported.surfaces.join(';'),/GRAFFITI|VISUAL_ONLY|Grille_Slat|Hanging_Light/);
});

test('Grand Warehouse entrance and all published spots have supported four-wheel contact',()=>{
  assert.ok(world.manifest.spots.length>=1,'no supported spawn spots');
  for(const spot of world.manifest.spots){
    const support=runtime.boardContact.snapToGround(new THREE.Vector3(...spot.position),
      spot.heading||0,.5,1);
    assert.equal(support.count,4,'missing wheel support at '+spot.id);
    assert.ok(support.normal.y>.96,'spawn is not level: '+spot.id);
    assert.ok(support.position.toArray().every(Number.isFinite),'nonfinite spawn '+spot.id);
  }
});

test('warehouse keeps intact recessed bowl and selected ramp collision metadata',()=>{
  const names=imported.surfaces.join(';');
  assert.match(names,/Skateable_Surface/);
  assert.ok(imported.repairs.movedRamps.length===0);
  assert.ok(scene.children.length>0);
  assert.ok(imported.rails.some(rail=>/Timber bowl/.test(rail.name)),
    'bowl transition rail disappeared');
});

test('coping and flat rails yield finite, continuous grind contact paths',()=>{
  assert.ok(imported.rails.length>=25,'authored grind rails missing');
  const seen=new Set();
  for(const rail of runtime.railNetwork.rails){
    assert.ok(!seen.has(rail.name),'duplicate authoritative rail '+rail.name);
    seen.add(rail.name);
    assert.ok(rail.length>.1,'zero-length rail '+rail.name);
    assert.ok(rail.radius>.01&&rail.radius<.4,'invalid rail radius '+rail.name);
    for(const fraction of [.1,.5,.9]){
      const sample=runtime.railNetwork.sample(rail,rail.length*fraction);
      assert.ok(sample.point.toArray().every(Number.isFinite),'nonfinite rail sample '+rail.name);
      assert.ok(runtime.railNetwork.nearest(sample.point,rail.radius+.02),
        'disconnected rail path '+rail.name);
    }
  }
});

test('warehouse coping survives transition compilation without duplicate names',()=>{
  const transitions=compileTransitionMetadata(imported.rails);
  assert.ok(Array.isArray(transitions));
  assert.ok(transitions.length>0,'authored coping transition metadata missing');
  assert.ok(imported.rails.some(rail=>/West transfer quarter/.test(rail.name)));
});

test('shipping physics controller can attach to each Grand Warehouse grind rail',()=>{
  const rider=new StatefulSkillStreetPhysics({
    collision:imported.collision,spawn:world.manifest.spawn,
    rails:imported.rails,playableRegions:world.manifest.playableRegions,
  });
  for(const rail of rider.railNetwork.rails){
    const sample=rider.railNetwork.sample(rail,rail.length*.5);
    rider.reset(new THREE.Vector3(...world.manifest.spawn),0);
    rider.position.copy(sample.point).add(new THREE.Vector3(0,.12,0));
    rider.heading=Math.atan2(-sample.tangent.x,-sample.tangent.z);
    rider.airHeading=rider.heading;
    rider.airDirection();rider.grounded=false;
    rider.velocity.copy(sample.tangent).multiplyScalar(5);rider.velocity.y=-.5;
    assert.equal(rider.enterGrind({name:'50-50',points:100}),true,rail.name);
  }
});

test('third-person camera poses remain finite around supported Grand Warehouse spawns',()=>{
  let checked=0;
  for(const spot of world.manifest.spots){
    const forward=new THREE.Vector3(0,0,-1);
    const skater={
      position:new THREE.Vector3(...spot.position),
      forward,velocity:forward.clone().multiplyScalar(8),
      grounded:true,surface:runtime.surface,
    };
    const camera=new FollowCamera(new THREE.PerspectiveCamera());
    camera.snap(skater);
    assert.ok(camera.camera.position.toArray().every(Number.isFinite),'nonfinite camera at '+spot.id);
    const anchor=skater.position.clone().add(new THREE.Vector3(0,1.15,0));
    assert.ok(camera.camera.position.distanceTo(anchor)>1,'camera collapsed into rider at '+spot.id);
    checked++;
  }
  assert.ok(checked>0);
});
