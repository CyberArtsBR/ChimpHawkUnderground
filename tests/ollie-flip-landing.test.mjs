import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { flipPhaseFor } from '../src/character/PresentationState.js';

function flatWorld() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(30, 0.1, 30),
    new THREE.MeshBasicMaterial(),
  );
  floor.position.y = -0.05;
  root.add(floor);
  root.updateMatrixWorld(true);
  return root;
}

function frame(physics, input = {}, dt = 1 / 60) {
  physics.advance(dt, {
    drive: 0,
    steer: 0,
    spin: 0,
    ollieHeld: false,
    olliePressed: false,
    ollieReleased: false,
    flipPressed: false,
    grabPressed: false,
    grabHeld: false,
    grindPressed: false,
    grindHeld: false,
    brake: false,
    vertExit: false,
    directionTaps: [],
    ...input,
  });
}

test('low and high ollies land in regular and switch without changing global physics',()=>{
 for(const stance of [1,-1]){
  const heights=[];
  for(const chargeFrames of [2,40]){
   const physics=new StatefulSkillStreetPhysics({collision:flatWorld(),spawn:[0,.5,0],rails:[]});
   physics.stance=stance;
   for(let i=0;i<chargeFrames;i++)frame(physics,{ollieHeld:true});
   frame(physics,{ollieReleased:true});assert.equal(physics.grounded,false);
   let peak=physics.position.y;
   for(let i=0;i<240&&!physics.grounded&&!physics.bailTime;i++){frame(physics);peak=Math.max(peak,physics.position.y);}
   assert.equal(physics.bailTime,0,`stance ${stance}, charge ${chargeFrames}`);
   assert.equal(physics.grounded,true);heights.push(peak);
  }
  assert.ok(heights[1]>heights[0]+.3,`stance ${stance}: charge must create useful height difference`);
 }
});

test('stationary ollie lands instead of falling through the floor', () => {
  const physics = new StatefulSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });

  for (let i = 0; i < 12; i++) frame(physics, { ollieHeld: true });
  frame(physics, { ollieReleased: true });
  assert.equal(physics.grounded, false, 'ollie should enter air');
  assert.ok(physics.velocity.y > 0, `expected upward ollie velocity, got ${physics.velocity.y}`);

  let minY = physics.position.y;
  for (let i = 0; i < 120 && !physics.grounded; i++) {
    frame(physics);
    minY = Math.min(minY, physics.position.y);
  }

  assert.equal(physics.bailTime > 0, false, 'plain ollie must not bail');
  assert.equal(physics.grounded, true, 'stationary ollie must reconnect to floor');
  assert.ok(minY > -0.08, `rider fell through floor to y=${minY}`);
});

test('ollie then kickflip exposes visible flip progression and lands', () => {
  const physics = new StatefulSkillStreetPhysics({
    collision: flatWorld(),
    spawn: [0, 0.5, 0],
    rails: [],
  });

  for (let i = 0; i < 18; i++) frame(physics, { ollieHeld: true });
  frame(physics, { ollieReleased: true });
  frame(physics, { flipPressed: true });

  assert.ok(physics.flipState, 'flip input should create flipState in air');
  const initialName = physics.flipState.name;
  let sawRotation = false;
  let sawCatch = false;
  let maxProgress = physics.flipState.progress;

  for (let i = 0; i < 120 && !physics.grounded && !physics.bailTime; i++) {
    frame(physics);
    if (physics.flipState) {
      maxProgress = Math.max(maxProgress, physics.flipState.progress);
      const phase = flipPhaseFor(physics.flipState);
      if (phase === 'ROTATION') sawRotation = true;
      if (phase === 'CATCH') sawCatch = true;
    }
  }

  assert.equal(initialName, 'Kickflip');
  assert.ok(maxProgress > 0.55, `flip animation barely progressed: ${maxProgress}`);
  assert.equal(sawRotation, true, 'flip must reach ROTATION presentation phase');
  assert.equal(sawCatch, true, 'flip must reach CATCH presentation phase');
  assert.equal(physics.bailTime > 0, false, 'completed kickflip should not bail on flat landing');
  assert.equal(physics.grounded, true, 'kickflip ollie should land back on floor');
});

test('StreetBoard uses eased prepare-to-rotation timing for a flip state', () => {
  const board = new StreetBoard('/unused.glb');
  board.update({
    airborne: true,
    flipState: { name: 'Kickflip', progress: 0.25, roll: 1, pitch: 0, yaw: 0 },
  });
  const earlyRoll = Math.abs(board.root.rotation.z);
  assert.ok(earlyRoll > 0.4 && earlyRoll < 1,
    `prepare phase should show controlled early roll, got ${earlyRoll}`);

  board.update({
    airborne: true,
    flipState: { name: 'Kickflip', progress: 0.55, roll: 1, pitch: 0, yaw: 0 },
  });
  const rotationRoll = Math.abs(board.root.rotation.z);
  assert.ok(rotationRoll > 1.8,
    `rotation phase should clearly rotate the deck, got ${rotationRoll}`);
  assert.ok(rotationRoll > earlyRoll * 2.5,
    'flip rotation should accelerate after the preparation phase');
});
