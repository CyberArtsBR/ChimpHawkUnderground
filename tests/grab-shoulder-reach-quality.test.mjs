import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { plantedFootWorldPoint } from '../src/character/FootOrientation.js';
import { GRAB_POSES } from '../src/character/TrickMotion.js';
import { ALL_FLIP_LESSONS } from '../src/game/FlipLessons.js';

const names = ['Indy', 'Melon', 'Nosegrab', 'Tailgrab', 'Japan', 'Stalefish'];
// Measured shipping GLBs at base 77fbf6d, 90 held frames at 120 Hz. The wrist
// pivot is a reach diagnostic; these values do not certify palm-surface grip.
const priorWristGaps = {
  The_AdolescentUR: [[.2391, .2384, .2037, .1924, .2875, .1843], [.2345, .2446, .4453, .4321, .3314, .2420]],
  The_Heretic: [[.3997, .3852, .3498, .3274, .4168, .3325], [.3827, .3997, .5803, .5860, .4792, .3961]],
  The_Anchor: [[.3107, .3159, .2419, .2460, .3721, .2713], [.2912, .3370, .5052, .4774, .3825, .3066]],
  TuxR: [[.2188, .2665, .2268, .2192, .2724, .2216], [.2190, .2672, .4590, .4558, .2408, .2740]],
};
const v = () => new THREE.Vector3();

for (const [avatar, baseline] of Object.entries(priorWristGaps)) {
  test(`${avatar}: both stances improve held grab reach while preserving real chains and foot anchors`, async () => {
    const rider = new UnrealRider(`/assets/rider/${avatar}.glb`)
      .configureModel(await loadGeometry(`public/assets/rider/${avatar}.glb`));
    const board = new StreetBoard('fixture');
    board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
    rider.deckHeight = board.deckHeight;
    const scales = new Map([...rider.rest.keys()].map(bone => [bone, bone.scale.toArray()]));
    const lengths = Object.fromEntries(['l', 'r'].map(side => {
      const upper = rider.bones[`upperarm_${side}`].getWorldPosition(v());
      const elbow = rider.bones[`lowerarm_${side}`].getWorldPosition(v());
      const wrist = rider.bones[`hand_${side}`].getWorldPosition(v());
      return [side, [upper.distanceTo(elbow), elbow.distanceTo(wrist)]];
    }));
    try {
      for (const [stanceIndex, stance] of [1, -1].entries()) {
        for (const [nameIndex, name] of names.entries()) {
          rider.resetPresentation();
          board.resetPresentation();
          const params = { airborne: true, presentation: { state: 'AIR' },
            grabState: { name }, grabWeight: 1, stance, dt: 1 / 120, airTime: .5 };
          for (let frame = 0; frame < 90; frame++) {
            board.update(params);
            rider.update({ ...params, board, time: frame / 120 });
          }
          for (const side of ['l', 'r']) {
            const label = `${name}/${stance}/${side}`;
            const shoulder = rider.bones[`upperarm_${side}`].getWorldPosition(v());
            const elbow = rider.bones[`lowerarm_${side}`].getWorldPosition(v());
            const wrist = rider.bones[`hand_${side}`].getWorldPosition(v());
            assert.ok(Math.abs(shoulder.distanceTo(elbow) - lengths[side][0]) < .00001, `${label}: upper arm resized`);
            assert.ok(Math.abs(elbow.distanceTo(wrist) - lengths[side][1]) < .00001, `${label}: forearm resized`);
            const grabTarget = rider.grabTarget(name, side, stance, board);
            if (grabTarget) {
              const gap = wrist.distanceTo(grabTarget);
              assert.ok(gap < baseline[stanceIndex][nameIndex] * .80,
                `${label}: wrist gap ${gap} must improve the measured prior reach by at least 20%`);
              assert.ok(wrist.distanceTo(shoulder) < lengths[side][0] + lengths[side][1],
                `${label}: wrist must retain elbow slack`);
            }
            const rear = stance > 0 ? 'r' : 'l';
            if (name === 'Japan' && side === rear) continue; // Authored released foot.
            const rig = board.contactRig, anchor = rider.feet[side].point;
            const x = THREE.MathUtils.clamp(anchor.x, -Math.max(.15, rig.deckWidth * .43), Math.max(.15, rig.deckWidth * .43));
            const z = THREE.MathUtils.clamp(anchor.z, -Math.max(.35, rig.deckLength * .39), Math.max(.35, rig.deckLength * .39));
            const target = plantedFootWorldPoint(board, x, rig.deckTopY - board.deckHeight + rider.soleOffsets[side], z, v());
            assert.ok(rider.bones[`foot_${side}`].getWorldPosition(v()).distanceTo(target) < .015,
              `${label}: planted foot must retain board contact`);
          }
          for (const [bone, scale] of scales) {
            assert.deepEqual(bone.scale.toArray(), scale, `${name}/${stance}/${bone.name}: scale changed`);
            assert.ok(bone.quaternion.toArray().every(Number.isFinite));
          }
        }
      }
    } finally {
      rider.dispose();
    }
  });
}

test('all authored grab tilts retain collider metadata and both end grabs raise their requested end in switch', () => {
  const board = new StreetBoard('fixture');
  board.deckHeight = .12;
  const contact = structuredClone(board.contactRig);
  for (const name of Object.keys(GRAB_POSES)) {
    const rotations = [];
    for (const stance of [1, -1]) {
      board.resetPresentation();
      board.update({ airborne: true, grabState: { name }, grabWeight: 1, stance });
      rotations.push(board.root.quaternion.clone());
      assert.deepEqual(board.contactRig, contact, `${name}/${stance}: collision geometry changed`);
      assert.ok(board.root.quaternion.toArray().every(Number.isFinite));
      if (name === 'Nosegrab' || name === 'Tailgrab') {
        const end = (name === 'Nosegrab' ? -1 : 1) * stance;
        const raised = board.pointWorld(0, 0, end * .5, v());
        const opposite = board.pointWorld(0, 0, -end * .5, v());
        assert.ok(raised.y > opposite.y + .15, `${name}/${stance}: requested end must rise toward the hand`);
      }
    }
    if (name !== 'Nosegrab' && name !== 'Tailgrab') {
      assert.ok(rotations[0].angleTo(rotations[1]) < 1e-6, `${name}: authored tilt changed`);
    }
  }
});

test('exiting every authored grab preserves all twelve flip trajectories in both stances', () => {
  const board = new StreetBoard('fixture'), clean = new StreetBoard('fixture');
  board.deckHeight = clean.deckHeight = .12;
  for (const name of Object.keys(GRAB_POSES)) {
    for (const stance of [1, -1]) {
      for (const lesson of ALL_FLIP_LESSONS) {
        board.resetPresentation();
        board.update({ airborne: true, grabState: { name }, grabWeight: 1, stance });
        board.resetPresentation();
        clean.resetPresentation();
        for (const progress of [.14, .34, .60, .94, 1]) {
          const params = { airborne: true, stance, flipState: { ...lesson.trick, progress } };
          board.update(params);
          clean.update(params);
          assert.ok(board.root.quaternion.angleTo(clean.root.quaternion) < 1e-6, `${name}/${stance}/${lesson.id}: flip rotation changed`);
          assert.ok(board.root.position.distanceTo(clean.root.position) < 1e-8, `${name}/${stance}/${lesson.id}: flip arc changed`);
          assert.equal(board.grabLift, 0);
        }
      }
    }
  }
});
