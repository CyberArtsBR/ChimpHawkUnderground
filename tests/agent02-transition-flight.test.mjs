import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TransitionController } from '../src/game/transitions/TransitionController.js';
import { VERT_RETURN } from '../src/game/transitions/VertReturnFlight.js';

const UP = new THREE.Vector3(0, 1, 0);
const makeRail = (id, z = 0, type = 'QUARTER') => ({
  name: id, points: [[-3, 2, z], [3, 2, z]],
  transition: { id, type, axisMode: 'LINEAR', supportsVert: true,
    supportsTransfer: true, supportsPump: true },
});
function setup({ normalY = 0.45, speed = 7, rise = 4.4,
  boost = 2.8, z = 0, type = 'QUARTER', inwardSign = 1 } = {}) {
  const controller = new TransitionController({ rails: [makeRail(type, z, type)] });
  const inward = new THREE.Vector3(0, 0, inwardSign);
  const position = new THREE.Vector3(0, 1.9, z + 0.18 * inwardSign);
  const normal = new THREE.Vector3(0, normalY,
    Math.sqrt(1 - normalY ** 2) * inwardSign);
  const velocity = new THREE.Vector3(0, rise, -speed * inwardSign);
  const candidate = controller.launchAt(position, normal, velocity);
  assert.ok(candidate, type + ' must detect coping');
  const before = velocity.clone();
  const air = controller.begin(position, velocity, candidate,
    { launchBoost: boost, boardForward: inward.clone().negate() });
  return { controller, position, velocity, before, air, candidate };
}
function simulate(sim, dt, duration, input = () => ({})) {
  const frames = Math.round(duration / dt);
  let peak = sim.position.y, descendingLip = null, grounded = false;
  for (let i = 0; i < frames; i++) {
    sim.velocity.y -= 20 * dt;
    sim.controller.advance(sim.air, sim.position, sim.velocity, input(i, sim), dt);
    sim.position.addScaledVector(sim.velocity, dt);
    peak = Math.max(peak, sim.position.y);
    if (sim.air.apexPassed && sim.velocity.y < 0
      && sim.position.y <= sim.air.frame.lipPoint.y - 0.1) {
      descendingLip = sim.position.clone();
      grounded = true; // Simplified re-entry plane; NOT a runtime wheel solver.
      break;
    }
  }
  return { ...sim, peak, descendingLip, grounded };
}

test('small and large quarter: launch height follows actual transition slope', () => {
  const small = setup({ normalY: 0.80 });
  const large = setup({ normalY: 0.20 });
  assert.ok(large.air.launchVertical > small.air.launchVertical + 1.5);
  for (const state of [small, large]) {
    // The shipped coping-boost tuning (ffd6b07) converts 82% of the
    // requested impulse. Keep the energy assertion, using that contract.
    const budget = state.before.lengthSq() + (2.8 * 0.82) ** 2;
    assert.ok(state.velocity.lengthSq() <= budget + 1e-7,
      'transition may not create kinetic energy beyond explicit boost');
    assert.ok(state.air.launchHorizontal.dot(state.candidate.rampInward) < 1e-9);
  }
});

test('halfpipe opposing walls and bowl pocket frames retain local inward directions', () => {
  const east = setup({ type: 'VERT', z: 12, normalY: 0.2, inwardSign: -1 });
  const west = setup({ type: 'MINI', z: 0, normalY: 0.6, inwardSign: 1 });
  assert.ok(east.air.frame.rampInward.dot(new THREE.Vector3(0, 0, -1)) > 0.99);
  assert.ok(west.air.frame.rampInward.dot(new THREE.Vector3(0, 0, 1)) > 0.99);
  assert.ok(east.air.frame.rampInward.dot(west.air.frame.rampInward) < -0.99);
  const bowl = setup({ type: 'BOWL', normalY: 0.25, speed: 7.8 });
  const flight = simulate(bowl, 1 / 120, 1.6);
  assert.equal(flight.grounded, true, 'ballistic bowl descent crosses the ramp-side re-entry plane');
  assert.ok(flight.descendingLip.z > -0.35, 'return stays near the bowl side of coping');
});

test('no forward-lock: return correction is bounded and preserves gravity', () => {
  const sim = setup();
  const previousY = sim.velocity.y - 20 / 120;
  sim.velocity.y = previousY;
  sim.controller.advance(sim.air, sim.position, sim.velocity, { drive: 1 }, 1 / 120);
  assert.equal(sim.velocity.y, previousY);
  const radial = sim.velocity.dot(sim.air.frame.rampInward);
  assert.ok(Math.abs(radial) <= VERT_RETURN.maxRadialSpeed + 1e-9);
  assert.equal(sim.air.transferring, false);
  assert.ok(sim.position.distanceTo(new THREE.Vector3(0, 1.9, 0.18)) < 1e-10,
    'controller must not teleport position');
});

test('controlled apex transfer respects scanned deck speed and stays finite', () => {
  const sim = setup();
  sim.controller.advance(sim.air, sim.position, sim.velocity, { vertExit: true }, 1 / 120);
  assert.equal(sim.air.transferring, false);
  sim.air.exitControl = { geometryAware: true, abortToReturn: false, horizontalSpeed: 1.6 };
  sim.velocity.y = -0.2;
  sim.controller.advance(sim.air, sim.position, sim.velocity, {}, 1 / 120);
  assert.equal(sim.air.mode, 'transfer');
  assert.ok(Number.isFinite(sim.velocity.length()));
  assert.ok(sim.velocity.clone().setY(0).length() < 0.3,
    'one apex frame must not inject the full deck velocity');
});

test('120Hz vs 60Hz transition integration has similar position and velocity', () => {
  const fast = simulate(setup(), 1 / 120, 0.42);
  const slow = simulate(setup(), 1 / 60, 0.42);
  assert.ok(fast.position.distanceTo(slow.position) < 0.18,
    'rate-dependent return drift exceeds tolerance');
  assert.ok(fast.velocity.distanceTo(slow.velocity) < 0.20,
    'rate-dependent return velocity exceeds tolerance');
});
