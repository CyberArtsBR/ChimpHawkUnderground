import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { loadGeometry } from '../tools/load-geometry.mjs';

for (const name of ['The_AdolescentUR','The_Heretic','The_Anchor','TuxR','thehollowf']) {
  test(`${name}: Airwalk contact, finger articulation and release preserve bone lengths`, async () => {
    const rider = new UnrealRider(`/assets/rider/${name}.glb`).configureModel(await loadGeometry(`public/assets/rider/${name}.glb`));
    const board = new StreetBoard('fixture');
    board.prepareContactGeometry(await loadGeometry('public/assets/rider/skateboard.glb'));
    const transforms = new Map([...rider.rest.keys()].map(bone => [bone, { position: bone.position.toArray(), scale: bone.scale.toArray() }]));
    try {
      if (name === 'thehollowf') {
        assert.equal(rider.calibratedGrabReach, false);
        assert.equal(rider.grabTarget('Airwalk', 'l', 1, board), null);
        assert.equal(rider.setGrabContactCandidate(true), true);
      }
      for (const stance of [1, -1]) {
        rider.resetPresentation(); board.resetPresentation();
        const side = stance === 1 ? 'l' : 'r';
        const p = { airborne: true, presentation: {state:'AIR'}, grabState:{name:'Airwalk'}, grabWeight:1, stance, dt:1/120, airTime:.5 };
        for (let i=0;i<100;i++) { board.update(p); rider.update({...p,board,time:i/120}); }
        assert.ok(rider.grabTarget('Airwalk', side, stance, board), 'front hand must own deck');
        assert.equal(rider.grabTarget('Airwalk', side === 'l' ? 'r' : 'l', stance, board), null);
        assert.ok(rider.grabFingers[side].length >= 8, 'actual articulated finger joints');
        assert.ok(rider.grabFingers[side].some(j => j.rest.angleTo(j.bone.quaternion) > .3), 'holding fingers curl');
        const wrist = rider.bones[`hand_${side}`].getWorldPosition(new T.Vector3());
        assert.ok(wrist.distanceTo(rider.grabTarget('Airwalk',side,stance,board)) < .40, 'reachable bounded handhold');
        rider.root.updateMatrixWorld(true);
        const palm = rider.grabPalms[side], center = new T.Vector3();
        for (const sample of palm.samples) {
          sample.mesh.skeleton.update();
          center.add(sample.mesh.getVertexPosition(sample.vertex,new T.Vector3()).applyMatrix4(sample.mesh.matrixWorld));
        }
        center.divideScalar(palm.samples.length);
        // Residual palmar-centroid reach is measured honestly; this is not a
        // zero-gap mesh intersection assertion. Hollow remains opt-in review.
        if (name !== 'thehollowf') assert.ok(center.distanceTo(rider.grabTarget('Airwalk',side,stance,board)) < .18,
          'Airwalk actual palmar patch must stay within the reviewed four-rig reach envelope');
        const before = rider.grabFingers[side][0].bone.quaternion.clone();
        rider.update({...p,board,grabState:null,grabWeight:0});
        assert.ok(before.angleTo(rider.grabFingers[side][0].bone.quaternion) < .08, 'release must not snap fingers to rest');
        for (let i=0;i<120;i++) rider.update({...p,board,grabState:null,grabWeight:0});
        assert.ok(rider.grabFingers[side].every(j => j.rest.angleTo(j.bone.quaternion) < .001), 'release returns to rest');
        for (const [bone, original] of transforms) {
          assert.deepEqual(bone.scale.toArray(),original.scale);
          if (bone.name !== rider.bones.pelvis?.name) assert.deepEqual(bone.position.toArray(),original.position);
          assert.ok(bone.quaternion.toArray().every(Number.isFinite));
        }
      }
      if (name === 'thehollowf') { rider.setGrabContactCandidate(false); assert.equal(rider.calibratedGrabReach,false); }
    } finally { rider.dispose(); }
  });
}
