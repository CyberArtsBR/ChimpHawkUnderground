import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {StreetBoard} from '../src/skateboard/StreetBoard.js';
import {FLIP_TRICKS,DOUBLE_FLIP_TRICKS} from '../src/game/TrickCatalog.js';
import {flipTurns} from '../src/character/TrickMotion.js';

const up = new THREE.Vector3(0,1,0);
const tricks = [FLIP_TRICKS.upRight, DOUBLE_FLIP_TRICKS['Inward Heelflip']];

test('inward and varial heels rotate in opposite shove directions',()=>{
  for(const trick of tricks) assert.equal(flipTurns({...trick,progress:1}).yaw,.5);
  assert.equal(flipTurns({...FLIP_TRICKS.downRight,progress:1}).yaw,-.5);
  assert.equal(flipTurns({...DOUBLE_FLIP_TRICKS['Varial Heelflip'],progress:1}).yaw,-1);
  assert.ok(flipTurns({...FLIP_TRICKS.upRight,progress:.5}).yaw>0);
  assert.ok(flipTurns({...FLIP_TRICKS.downRight,progress:.5}).yaw<0);
});

test('inward heelflips return deck-up at catch and remain upright when the state clears',()=>{
  for(const trick of tricks){
    const board=new StreetBoard('test');board.deckHeight=.12;
    board.update({airborne:true,flipState:{...trick,progress:.5},dt:1/60});
    assert.ok(Math.abs(flipTurns({...trick,progress:.5}).pitch)>.05,`${trick.name} keeps its pitch accent`);
    board.update({airborne:true,flipState:{...trick,progress:1},dt:1/60});
    const caught=board.root.quaternion.clone();
    assert.ok(up.clone().applyQuaternion(caught).y>.999,`${trick.name} must catch deck-up`);
    board.update({airborne:false,dt:1/60});
    assert.ok(Math.abs(caught.dot(board.root.quaternion))>.9999,`${trick.name} must not snap on state clear`);
  }
});

test('upgrading an inward heelflip preserves the current board pose and ends deck-up',()=>{
  const first=FLIP_TRICKS.upRight, upgraded=DOUBLE_FLIP_TRICKS['Inward Heelflip'];
  const start=.4,rotationFrom=flipTurns({...first,progress:start});
  const atUpgrade=flipTurns({...upgraded,progress:start,rotationStartProgress:start,rotationFrom});
  for(const axis of ['pitch','yaw','roll']) assert.ok(Math.abs(atUpgrade[axis]-rotationFrom[axis])<1e-9,axis);
  const complete=flipTurns({...upgraded,progress:1,rotationStartProgress:start,rotationFrom});
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(complete.pitch*Math.PI*2,complete.yaw*Math.PI*2,complete.roll*Math.PI*2));
  assert.ok(up.clone().applyQuaternion(q).y>.999);
});
