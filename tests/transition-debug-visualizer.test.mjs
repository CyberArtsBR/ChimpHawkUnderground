import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TransitionController } from '../src/game/transitions/TransitionController.js';
import {
  TransitionDebugVisualizer,
  transitionDebugSummary,
} from '../src/game/transitions/TransitionDebugVisualizer.js';

function controller() {
  return new TransitionController({
    rails: [{
      name: '02 / western vert wall coping',
      radius: 0.05,
      points: [
        [-2, 3, 0],
        [2, 3, 0],
      ],
    }],
  });
}

test('transition debug summary exposes canonical authored identity', () => {
  const transitions = controller();
  assert.deepEqual(transitionDebugSummary(transitions), {
    count: 1,
    ids: ['western-vert'],
    vertIds: ['western-vert'],
  });
});

test('debug visualizer builds authored lip and bounds without mutating metadata', () => {
  const transitions = controller();
  const before = transitions.transitions[0].lipPath.map(point => point.toArray());
  const debug = new TransitionDebugVisualizer(transitions);

  assert.equal(debug.staticGroup.children.length, 2);
  assert.equal(debug.staticGroup.children[0].userData.transitionId, 'western-vert');
  assert.equal(debug.staticGroup.children[1].userData.transitionId, 'western-vert');
  assert.deepEqual(
    transitions.transitions[0].lipPath.map(point => point.toArray()),
    before,
    'debug construction must never mutate authored geometry',
  );

  debug.dispose();
});

test('active debug frame visualizes coping basis and return target read-only', () => {
  const transitions = controller();
  const debug = new TransitionDebugVisualizer(transitions);
  const frame = {
    lipPoint: new THREE.Vector3(0, 3, 0),
    copingTangent: new THREE.Vector3(1, 0, 0),
    rampInward: new THREE.Vector3(0, 0, 1),
    deckOutward: new THREE.Vector3(0, 0, -1),
    surfaceNormal: new THREE.Vector3(0, 0.7, 0.714).normalize(),
    returnTarget: new THREE.Vector3(0, 2.965, 0.3),
  };
  const snapshot = Object.fromEntries(
    Object.entries(frame).map(([key, value]) => [key, value.toArray()]),
  );

  debug.update({ transitionAir: { frame } });

  assert.equal(debug.activeGroup.visible, true);
  assert.deepEqual(debug._lipMarker.position.toArray(), frame.lipPoint.toArray());
  assert.equal(debug._returnMarker.visible, true);
  assert.deepEqual(debug._returnMarker.position.toArray(), frame.returnTarget.toArray());
  assert.equal(Object.values(debug._arrows).every(arrow => arrow.visible), true);
  assert.deepEqual(
    Object.fromEntries(Object.entries(frame).map(([key, value]) => [key, value.toArray()])),
    snapshot,
    'debug update must remain presentation-only',
  );

  debug.update({ transitionAir: null, pendingBoardTransition: null });
  assert.equal(debug.activeGroup.visible, false);
  debug.dispose();
});
