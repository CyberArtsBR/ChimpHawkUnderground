import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { TransitionController, VERT_LAUNCH_ENVELOPE } from '../src/game/transitions/TransitionController.js';
import { VERT_RETURN, resolveVertReturnVelocity } from '../src/game/transitions/VertReturnFlight.js';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { StableBoardContactSkillStreetPhysics } from '../src/game/StableBoardContactSkillStreetPhysics.js';
import { buildImportedWarehouseCollision, warehouseObjectName } from '../src/park/ImportedWarehouseCollision.js';
import { loadGeometry } from '../tools/load-geometry.mjs';

function floor() {
  const scene = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.BoxGeometry(40, .1, 40), new THREE.MeshBasicMaterial());
  ground.position.y = -.05;
  scene.add(ground);
  return scene;
}
function lipEdge() {
  return {
    lipPoint: new THREE.Vector3(0, 3, 0),
    copingTangent: new THREE.Vector3(1, 0, 0),
    rampInward: new THREE.Vector3(0, 0, 1),
    deckOutward: new THREE.Vector3(0, 0, -1),
    surfaceNormal: new THREE.Vector3(0, .24, .970772).normalize(),
    name: 'Map4 quarter coping',
  };
}

test('vert launch remains bounded even at maximal ramp speed and boost', () => {
  const controller = new TransitionController({ rails: [] });
  const velocity = new THREE.Vector3(0, 9, -16);
  const air = controller.begin(new THREE.Vector3(0,2.8,.18), velocity, lipEdge(), { launchBoost: 8.5 });
  assert.equal(air.transferring, false);
  assert.ok(velocity.y <= VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed + 1e-8);
  assert.ok(velocity.y > 0);
  // The shipped 17 m/s cap gives a 7.225 metre ceiling at gravity=20. Fast
  // ramp air needs more than the former 2.81 m ceiling to fit multiple tricks.
  assert.ok(velocity.y ** 2 / 40 <= 7.225 + 1e-8);
});

test('generic quarter lip retains a strong jump but never compounds vertical velocity into a roof launch', () => {
  const p = new StatefulSkillStreetPhysics({ collision: floor(), spawn: [0,.5,0], rails: [] });
  p.position.set(0, 1.6, 0);
  p.normal.set(0,.3,.953939).normalize();
  p.velocity.set(0, 11, -5);
  p.grounded = true;
  p.rampLaunchMemory = 6.1;
  p.rampLaunchMemoryTime = .25;
  p.takeoff(0, null);
  assert.equal(p.transitionAir, null);
  assert.ok(p.velocity.y <= VERT_LAUNCH_ENVELOPE.maximumPassiveVerticalSpeed + 1e-8);
  assert.ok(p.velocity.y >= 5, 'arcade air height was deleted');
});

test('explicit jump preserves extra headroom without creating a high-altitude exploit', () => {
  const p = new StatefulSkillStreetPhysics({ collision: floor(), spawn: [0,.5,0], rails: [] });
  p.normal.set(0,.5,.866025).normalize();
  p.velocity.set(0, 9, -5);
  p.grounded = true;
  p.rampLaunchMemory=6;
  p.rampLaunchMemoryTime=.2;
  p.takeoff(7.6);
  assert.ok(p.velocity.y <= VERT_LAUNCH_ENVELOPE.maximumVerticalSpeed + 1e-8);
  assert.ok(p.velocity.y > VERT_LAUNCH_ENVELOPE.maximumPassiveVerticalSpeed);
});

test('return steering remains bounded and engaged through moderate lateral drift', () => {
  const air = { frame: {
    lipPoint: new THREE.Vector3(0,3,0),
    returnTarget: new THREE.Vector3(0,3,.3),
    rampInward: new THREE.Vector3(0,0,1),
    copingTangent: new THREE.Vector3(1,0,0),
  }};
  const position = new THREE.Vector3(.5,4.5,-2.0);
  const velocity = new THREE.Vector3(.1,-2.4,-.2);
  const step = resolveVertReturnVelocity(air,position,velocity,1/120);
  assert.equal(step.guided,true);
  assert.equal(step.velocity.y, velocity.y, 'return must not create upward energy');
  assert.ok(step.velocity.clone().sub(velocity).length() <= VERT_RETURN.acceleration/120+.01);
  assert.ok(step.velocity.z > velocity.z, 'return should correct toward the original wall');
  const far = resolveVertReturnVelocity(air, new THREE.Vector3(0,5,-15),velocity,1/120);
  assert.equal(far.guided,false, 'unrelated far-away geometry must not magnetize the rider');
});

test('continuing a real near-vertical ramp uses the saved normal; flat wall approach does not', () => {
  const scene = new THREE.Group();
  const ramp = new THREE.Mesh(new THREE.PlaneGeometry(5,5),new THREE.MeshBasicMaterial());
  ramp.rotation.order = 'YXZ';
  ramp.rotation.x = -0.018;
  ramp.rotation.y = Math.PI/2; // rideable steep facet retains a small upward normal
  ramp.userData.surface='rideable';
  scene.add(ramp);
  const surface=new ParkCollision(scene);
  const point=new THREE.Vector3(), normal=new THREE.Vector3();
  const supported=surface.probeRideable(
    new THREE.Vector3(0.03,0,0), new THREE.Vector3(.99996,.009,0).normalize(),
    .12,.12,point,normal,
  );
  assert.ok(supported, 'last supported ramp facet should remain rideable before the lip');
  const fromFlat=surface.probeRideable(
    new THREE.Vector3(0.03,0,0), new THREE.Vector3(0,1,0),
    .12,.12,point,normal,
  );
  assert.equal(fromFlat,null, 'a player on the flat cannot ride straight up a wall');
});

test('released Grand Warehouse side cores are solid, not wheel-support surfaces', async () => {
  const scene=await loadGeometry('public/assets/warehouse/granwarehouse.glb');
  const imported=buildImportedWarehouseCollision(scene,[],{grandMode:true});
  const names=imported.surfaces.join(';');
  assert.ok(imported.rails.length>=25,'preserves extracted authored grind/coping geometry');
  assert.doesNotMatch(names,/Side_Wood_Core|Back_Panel|Concrete_or_wood_support/);
  assert.match(names,/Skateable_Surface/);
  assert.ok(imported.collision.children.some(m=>m.userData.surface==='solid'));
});

test('one-frame last-wheel release keeps authored coping identity for a return', () => {
  const edge=lipEdge();
  const calls=[];
  const runtime={
    grounded:true,
    position:new THREE.Vector3(0,2.9,.25),
    normal:new THREE.Vector3(0,.2,.9799).normalize(),
    velocity:new THREE.Vector3(0,4,-7),
    transitions:{approachAt(){return edge;}},
    takeoff(impulse,transition){calls.push({impulse,transition});},
  };
  StableBoardContactSkillStreetPhysics.prototype.releaseRisingRamp.call(runtime);
  assert.equal(calls.length,1);
  assert.equal(calls[0].transition,edge);
  runtime.velocity.y=-2;
  StableBoardContactSkillStreetPhysics.prototype.releaseRisingRamp.call(runtime);
  assert.equal(calls[1].transition,null,'falling beside a wall must not be captured');
  runtime.velocity.y=4;
  runtime.normal.set(0,1,0);
  StableBoardContactSkillStreetPhysics.prototype.releaseRisingRamp.call(runtime);
  assert.equal(calls[2].transition,null,'flat seams cannot become vert launches');
});
