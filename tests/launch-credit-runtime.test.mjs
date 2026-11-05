import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StatefulSkillStreetPhysics } from '../src/game/StatefulSkillStreetPhysics.js';
import { PHYSICS } from '../src/game/StreetPhysics.js';
import { loadRuntimeBoardRig } from '../tools/quality-board-rig.mjs';

const dt = 1 / 120;
const rig = await loadRuntimeBoardRig();
function make() {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshBasicMaterial());
  floor.rotation.x = -Math.PI / 2; floor.updateMatrixWorld(true);
  const s = new StatefulSkillStreetPhysics({ collision: floor, spawn: [0, .1, 0], rails: [],
    playableRegions: [{ minX: -500, maxX: 500, minZ: -500, maxZ: 500 }] });
  s.setBoardContactRig(rig); s.reset();
  return s;
}

test('shipping runtime flat charge remains monotonic and each release owns one departure credit', () => {
  const peaks = [];
  for (const hold of [0, .08, .16, .24, .5]) {
    const s = make(); s.velocity.copy(s.forward).multiplyScalar(10);
    for (let i = 0; i < Math.round(hold / dt); i++) s.advance(dt, { ollieHeld: true });
    const origin = s.position.y;
    s.advance(dt, { ollieReleased: true });
    let peak = s.position.y;
    for (let i = 0; i < 360 && !s.grounded; i++) {
      s.advance(dt, {}); peak = Math.max(peak, s.position.y);
    }
    assert.ok(s.grounded);
    peaks.push(peak - origin);
    const telemetry = s.getLaunchTelemetry();
    assert.equal(telemetry.history.filter(e => e.type === 'credit').length, 1);
    assert.equal(telemetry.lastFlight.outcome, 'grounded');
    assert.ok(telemetry.lastFlight.departureTime >= telemetry.release.time);
    telemetry.release.owner = 'corrupted-consumer';
    assert.notEqual(s.getLaunchTelemetry().release.owner, 'corrupted-consumer');
  }
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] + 1e-8 >= peaks[i - 1]);
  assert.ok(Math.abs(peaks.at(-1) - peaks.at(-2)) < 1e-8, 'holding beyond full charge must not add lift');
  assert.ok(Math.abs(peaks[3] - 1.453) < .005, 'accepted full-charge trajectory changed');
  assert.equal(PHYSICS.gravity, 21);
});

test('late ramp credit is one-shot even when another release arrives in the same flight', () => {
  const s = make();
  Object.assign(s, { grounded: false, coyote: 0, airTakeoffFromRamp: true,
    takeoffOllieRequested: false, airTime: .05, charge: 1 });
  s.position.y = 10; s.velocity.set(0, 5, -10);
  s.advance(dt, { ollieReleased: true });
  const first = s.velocity.y;
  assert.ok(first > 5, 'late held charge should be honored');
  s.charge = 1;
  s.advance(dt, { ollieReleased: true });
  assert.ok(s.velocity.y < first, 'second release must not create a double jump');
  assert.equal(s.getLaunchTelemetry().history.filter(e => e.type === 'credit').length, 1);
  const events = s.drainLaunchTelemetry();
  assert.ok(events.length > 0);
  assert.deepEqual(s.drainLaunchTelemetry(), []);
  s.reset(); assert.equal(s.getLaunchTelemetry().history.length, 0);
});
