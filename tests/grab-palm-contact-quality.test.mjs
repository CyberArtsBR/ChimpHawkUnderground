import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { loadGeometry } from '../tools/load-geometry.mjs';
import { GRAB_QUALITY_NAMES, grabTransitionParams } from '../tools/grab-quality-fixtures.mjs';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { plantedFootWorldPoint } from '../src/character/FootOrientation.js';
import { warmGrabDeckSurface } from '../src/character/GrabReachPose.js';

const v = () => new THREE.Vector3();
// Actual deformed palm-patch distances to actual deck triangles at 66fcd65,
// not the old wrist diagnostic. Both pose modules are snapshotted by the tool.
const baseline = {
  The_AdolescentUR: { mean: .14433022, japan: [.16481999, .20530198] },
  The_Heretic: { mean: .26982206, japan: [.30423290, .34334231] },
  The_Anchor: { mean: .21334815, japan: [.27180088, .26986842] },
  TuxR: { mean: .16733073, japan: [.15501757, .13970778] },
};

async function fixture(avatar) {
  const rider = new UnrealRider(`/assets/rider/${avatar}.glb`)
    .configureModel(await loadGeometry(`public/assets/rider/${avatar}.glb`));
  const board = new StreetBoard('fixture');
  board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
  warmGrabDeckSurface(board);
  return { rider, board };
}

function palmPatchCenter(palm) {
  const center = v();
  for (const { mesh, vertex } of palm.samples) {
    mesh.skeleton.update();
    center.add(mesh.getVertexPosition(vertex, v()).applyMatrix4(mesh.matrixWorld));
  }
  return center.divideScalar(palm.samples.length);
}

for (const [avatar, prior] of Object.entries(baseline)) {
  test(`${avatar}: real palmar mesh improves both Japan stances and overall reach without resized chains`, async () => {
    const { rider, board } = await fixture(avatar);
    const lengths = Object.fromEntries(['l', 'r'].map(side => [side, [
      rider.bones[`upperarm_${side}`].getWorldPosition(v()).distanceTo(rider.bones[`lowerarm_${side}`].getWorldPosition(v())),
      rider.bones[`lowerarm_${side}`].getWorldPosition(v()).distanceTo(rider.bones[`hand_${side}`].getWorldPosition(v())),
    ]]));
    const scales = new Map([...rider.rest.keys()].map(bone => [bone, bone.scale.toArray()]));
    const gaps = [];
    try {
      for (const [stanceIndex, stance] of [1, -1].entries()) {
        for (const name of GRAB_QUALITY_NAMES) {
          rider.resetPresentation(); board.resetPresentation();
          const params = { airborne: true, presentation: { state: 'AIR' },
            grabState: { name }, grabWeight: 1, stance, dt: 1 / 120, airTime: .5 };
          for (let frame = 0; frame < 90; frame++) {
            board.update(params); rider.update({ ...params, board, time: frame / 120 });
          }
          // Refresh attached bind inverses as the renderer does before sampling.
          rider.root.updateMatrixWorld(true);
          for (const side of ['l', 'r']) {
            const label = `${avatar}/${name}/${stance}/${side}`;
            const upper = rider.bones[`upperarm_${side}`], lower = rider.bones[`lowerarm_${side}`], hand = rider.bones[`hand_${side}`];
            assert.ok(Math.abs(upper.getWorldPosition(v()).distanceTo(lower.getWorldPosition(v())) - lengths[side][0]) < 1e-5, label);
            assert.ok(Math.abs(lower.getWorldPosition(v()).distanceTo(hand.getWorldPosition(v())) - lengths[side][1]) < 1e-5, label);
            const target = rider.grabTarget(name, side, stance, board);
            if (target) {
              const palm = rider.grabPalms[side];
              assert.ok(palm.samples.length >= 2, `${label}: actual palmar mesh samples required`);
              const gap = palmPatchCenter(palm).distanceTo(target);
              gaps.push(gap);
              if (name === 'Japan') assert.ok(gap < prior.japan[stanceIndex] * .65,
                `${label}: deformed palm gap ${gap} must improve by at least 35%`);
              assert.ok(rider.rest.get(hand).angleTo(hand.quaternion) <= .95001, `${label}: wrist bend exceeds authored bound`);
            }
            // The released Japan ankle retains its authored target as well;
            // only its knee may fold more. Ordinary feet stay on the deck.
            const targetFoot = rider.root.localToWorld(rider.ft[side].clone());
            assert.ok(rider.bones[`foot_${side}`].getWorldPosition(v()).distanceTo(targetFoot) < .015, `${label}: ankle target lost`);
            if (name === 'Japan' && side === (stance > 0 ? 'r' : 'l')) continue;
            const rig = board.contactRig, anchor = rider.feet[side].point;
            const x = THREE.MathUtils.clamp(anchor.x, -Math.max(.15, rig.deckWidth * .43), Math.max(.15, rig.deckWidth * .43));
            const z = THREE.MathUtils.clamp(anchor.z, -Math.max(.35, rig.deckLength * .39), Math.max(.35, rig.deckLength * .39));
            const expected = plantedFootWorldPoint(board, x, rig.deckTopY - board.deckHeight + rider.soleOffsets[side], z, v());
            assert.ok(rider.bones[`foot_${side}`].getWorldPosition(v()).distanceTo(expected) < .015, label);
          }
          for (const [bone, scale] of scales) {
            assert.deepEqual(bone.scale.toArray(), scale);
            assert.ok(bone.quaternion.toArray().every(Number.isFinite));
          }
        }
      }
      assert.ok(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length < prior.mean * .60,
        `${avatar}: mean real palm gap must improve by at least 40%`);
    } finally { rider.dispose(); }
  });
}

test('The Hollow retains supplied reach, hold and release joint poses in both stances', async () => {
  const reference = JSON.parse(await readFile(new URL('./fixtures/hollow-grab-motion-66fcd65.json', import.meta.url)));
  const { rider, board } = await fixture('thehollowf');
  try {
    for (const stance of [1, -1]) for (const name of GRAB_QUALITY_NAMES) {
      rider.resetPresentation(); board.resetPresentation();
      const expected = reference.rows.filter(row => row.name === name && row.stance === stance);
      for (let frame = 0; frame <= 192; frame++) {
        const params = grabTransitionParams(name, stance, frame / 120);
        board.update(params); rider.update({ ...params, board });
        const row = expected.find(sample => sample.frame === frame);
        if (!row) continue;
        reference.bones.forEach((name, index) => {
          const bone = rider.bones[name], sample = row.joints[index];
          assert.ok(bone.getWorldPosition(v()).distanceTo(v().fromArray(sample)) < 2e-7,
            `${name}/${stance}/${frame}: supplied motion position changed`);
          const expectedQ = new THREE.Quaternion().fromArray(sample, 3);
          assert.ok(1 - Math.abs(expectedQ.dot(bone.quaternion)) < 2e-7,
            `${name}/${stance}/${frame}: supplied motion rotation changed`);
        });
      }
    }
  } finally { rider.dispose(); }
});

test('Heretic Japan and Anchor Stalefish gather smoothly through engage and release in both stances', async () => {
  // The unsmoothed calibration jumped 10.7/11.9 cm at 120 Hz respectively.
  for (const [avatar, name] of [['The_Heretic', 'Japan'], ['The_Anchor', 'Stalefish']]) {
    const { rider, board } = await fixture(avatar);
    try {
      for (const stance of [1, -1]) {
        rider.resetPresentation(); board.resetPresentation();
        let prior = null;
        for (let frame = 0; frame < 264; frame++) {
          const params = grabTransitionParams(name, stance, frame / 120);
          board.update(params); rider.update({ ...params, board });
          const head = rider.bones.head.getWorldPosition(v());
          if (frame > 35 && prior) assert.ok(head.distanceTo(prior) < .08,
            `${avatar}/${name}/${stance}/${frame}: upper-body travel must stay below 8 cm per 120 Hz step`);
          prior = head;
        }
        rider.resetPresentation();
        assert.equal(rider.scalar.grabGather.value, 0);
        assert.equal(rider.scalar.grabGather.velocity, 0);
        assert.equal(rider.grabReachName, null);
      }
    } finally { rider.dispose(); }
  }
});
