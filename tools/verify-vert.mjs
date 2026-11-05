import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TransitionGuide } from '../src/game/TransitionGuide.js';
import { ParkCollision } from '../src/game/ParkCollision.js';
import { SkateTricks } from '../src/game/SkateTricks.js';
import { PHYSICS } from '../src/game/StreetPhysics.js';

const DT = 1 / 120;
// TransitionGuide component checks use the shipping gravity; runtime integration is tested separately.
const GRAVITY = PHYSICS.gravity;
const UP = new THREE.Vector3(0, 1, 0);
const QUARTER_NAME = '04 / eastern quarter coping';
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function quarterGuide() {
  return new TransitionGuide([{ name: QUARTER_NAME, points: [[-3, 2, 0], [3, 2, 0]] }]);
}

function quarterSetup(speed = 8, boost = 0) {
  const guide = quarterGuide();
  const position = new THREE.Vector3(0, 1.9, 0.18);
  const normal = new THREE.Vector3(0, 0.08, 1).normalize();
  const velocity = new THREE.Vector3(0, speed * 0.92, -speed * 0.38);
  const edge = guide.launchAt(position, normal, velocity);
  assert(edge, 'quarter coping should be captured');
  const air = guide.begin(position, velocity, edge, {
    boardForward: new THREE.Vector3(0, 0, -1),
    launchBoost: boost,
  });
  return { guide, position, velocity, air, edge };
}

function stepAir(sim, input = {}) {
  sim.velocity.y -= GRAVITY * DT;
  sim.guide.advance(sim.air, sim.position, sim.velocity, input, DT);
  sim.position.addScaledVector(sim.velocity, DT);
}

function simulateQuarter({ speed = 8, boost = 0, inputForStep = () => ({}), duration = 2.2 } = {}) {
  const sim = quarterSetup(speed, boost);
  const start = sim.position.clone();
  let maxDeckOutward = sim.position.clone().sub(sim.air.frame.lipPoint).dot(sim.air.frame.deckOutward);
  let descendingLip = null;
  const steps = Math.ceil(duration / DT);
  for (let i = 0; i < steps; i++) {
    stepAir(sim, inputForStep(i, sim));
    const deckDistance = sim.position.clone().sub(sim.air.frame.lipPoint).dot(sim.air.frame.deckOutward);
    maxDeckOutward = Math.max(maxDeckOutward, deckDistance);
    if (sim.air.apexPassed && sim.velocity.y < 0 && sim.position.y <= sim.air.frame.lipPoint.y && sim.air.age > 0.25) {
      descendingLip = sim.position.clone();
      break;
    }
  }
  return { ...sim, start, maxDeckOutward, descendingLip };
}

function circleRail(radius = 5, y = 2, segments = 32) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
  }
  return [{ name: 'Bowl coping loop', points }];
}

function bowlLaunchAt(angle) {
  const guide = new TransitionGuide(circleRail());
  const lip = new THREE.Vector3(Math.cos(angle) * 5, 2, Math.sin(angle) * 5);
  const rampInward = lip.clone().setY(0).normalize().negate();
  const deckOutward = rampInward.clone().negate();
  const position = lip.clone().addScaledVector(rampInward, 0.18).add(new THREE.Vector3(0, -0.1, 0));
  const normal = rampInward.clone().multiplyScalar(0.995).addScaledVector(UP, 0.1).normalize();
  const velocity = deckOutward.clone().multiplyScalar(3.2).addScaledVector(UP, 6.2);
  const edge = guide.launchAt(position, normal, velocity);
  assert(edge, `bowl launch should capture at angle ${angle}`);
  const air = guide.begin(position, velocity, edge, { boardForward: deckOutward, launchBoost: 0 });
  return { guide, position, velocity, air, edge, rampInward, deckOutward };
}

function makeFlatCollision() {
  const root = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial());
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  root.updateMatrixWorld(true);
  return new ParkCollision(root);
}

function fixedRenderSimulation(frameDt) {
  const sim = quarterSetup(9, 3.5);
  let accumulator = 0;
  const duration = 1.5;
  const frames = Math.round(duration / frameDt);
  for (let frame = 0; frame < frames; frame++) {
    accumulator += frameDt;
    while (accumulator + 1e-9 >= DT) {
      stepAir(sim, {});
      accumulator -= DT;
    }
  }
  return { position: sim.position.clone(), velocity: sim.velocity.clone() };
}

test('1 normal quarter-pipe approach', () => {
  const guide = quarterGuide();
  const candidate = guide.approachAt(
    new THREE.Vector3(0, 1.2, 0.65),
    new THREE.Vector3(0, 0.25, 1).normalize(),
    new THREE.Vector3(0, 5.5, -3),
  );
  assert(candidate);
  assert.equal(candidate.name, QUARTER_NAME);
});

test('2 low-speed quarter approach', () => {
  const low = quarterSetup(4.2, 0);
  assert(low.air.launchVertical >= 2.5);
  assert(low.air.launchVertical < 7);
});

test('3 high-speed quarter approach', () => {
  const low = quarterSetup(5, 0).air.launchVertical;
  const high = quarterSetup(12, 0).air.launchVertical;
  assert(high > low + 3, `expected high-speed launch ${high} > low-speed ${low}`);
  assert(high <= 15.5);
});

test('4 averaged wheel normal still captures authored coping', () => {
  const guide = quarterGuide();
  const normal = new THREE.Vector3(0, 0.82, 0.57).normalize();
  const candidate = guide.launchAt(
    new THREE.Vector3(0, 1.72, 0.34),
    normal,
    new THREE.Vector3(0, 4.2, -5.4),
  );
  assert(candidate, 'real four-wheel averaged normal should not miss the coping guide');
});

test('5 ollie released before coping is buffered into lip boost', () => {
  const guide = quarterGuide();
  const approach = guide.approachAt(
    new THREE.Vector3(0, 0.75, 0.82),
    new THREE.Vector3(0, 0.32, 1).normalize(),
    new THREE.Vector3(0, 5.3, -2.2),
  );
  assert(approach, 'pre-coping approach should arm the vert ollie buffer');
  const base = quarterSetup(7, 0).air.launchVertical;
  const boosted = quarterSetup(7, 7.2).air.launchVertical;
  assert(boosted > base + 0.8, `expected buffered boost ${boosted} > ${base}`);
});

test('6 normal vert return without Up', () => {
  const result = simulateQuarter({ speed: 8 });
  assert(result.air.apexPassed);
  assert(result.descendingLip, 'should descend back through coping height');
  const inward = result.descendingLip.clone().sub(result.air.frame.lipPoint).dot(result.air.frame.rampInward);
  assert(inward > 0.02, `return should remain on ramp side, got ${inward}`);
});

test('7 flip during vert leaves trajectory controller intact', () => {
  const tricks = new SkateTricks();
  const events = tricks.resolve({ flipPressed: true, directionTaps: [], steer: 0, drive: 0 }, {
    grounded: false, grinding: false, manual: null, speed: 8, airborne: true,
  });
  assert(events.flip, 'air flip input must remain available');
  const baseline = simulateQuarter({ speed: 8 });
  const withFlipInput = simulateQuarter({ speed: 8, inputForStep: () => ({ flipPressed: true }) });
  assert(baseline.descendingLip.distanceTo(withFlipInput.descendingLip) < 1e-9);
});

test('8 grab during vert leaves trajectory controller intact', () => {
  const tricks = new SkateTricks();
  const events = tricks.resolve({ grabPressed: true, directionTaps: [], steer: 0, drive: 0 }, {
    grounded: false, grinding: false, manual: null, speed: 8, airborne: true,
  });
  assert(events.grab, 'air grab input must remain available');
  const baseline = simulateQuarter({ speed: 8 });
  const withGrabInput = simulateQuarter({ speed: 8, inputForStep: () => ({ grabPressed: true, grabHeld: true }) });
  assert(baseline.descendingLip.distanceTo(withGrabInput.descendingLip) < 1e-9);
});

test('9 180 during vert does not steer world trajectory', () => {
  const baseline = simulateQuarter({ speed: 8 });
  const spinning = simulateQuarter({ speed: 8, inputForStep: () => ({ spin: 1 }) });
  assert(baseline.descendingLip.distanceTo(spinning.descendingLip) < 1e-9);
});

test('10 360 during vert does not steer world trajectory', () => {
  const baseline = simulateQuarter({ speed: 9 });
  const spinning = simulateQuarter({ speed: 9, inputForStep: () => ({ spin: -1, steer: -1 }) });
  assert(baseline.descendingLip.distanceTo(spinning.descendingLip) < 1e-9);
});

test('11 explicit Ctrl/L2 vert exit still permits deck transfer', () => {
  const result = simulateQuarter({
    speed: 9,
    inputForStep: (_i, sim) => ({ vertExit: sim.air.age > 0.2 }),
    duration: 2.4,
  });
  assert(result.air.transferring, 'vert exit should enter transfer mode');
  assert(result.maxDeckOutward > 0.45, `expected deck travel, got ${result.maxDeckOutward}`);
});

test('12 holding Up exits quarter pipe forward like THPS', () => {
  const result = simulateQuarter({
    speed: 10,
    inputForStep: () => ({ drive: 1 }),
    duration: 1.6,
  });
  assert(result.air.transferring, 'Up should enter transfer mode');
  assert(result.maxDeckOutward > 0.7, `Up should travel out over deck, got ${result.maxDeckOutward}`);
});

test('13 Up buffered before coping launches outward on frame one', () => {
  const guide = quarterGuide();
  const position = new THREE.Vector3(0, 1.9, 0.18);
  const normal = new THREE.Vector3(0, 0.08, 1).normalize();
  const velocity = new THREE.Vector3(0, 9.2, -3.8);
  const edge = guide.launchAt(position, normal, velocity);
  assert(edge);
  edge.exitRequested = true;
  const air = guide.begin(position, velocity, edge, {
    boardForward: new THREE.Vector3(0, 0, -1),
  });
  const outwardSpeed = velocity.clone().setY(0).dot(edge.deckOutward);
  assert(air.transferring, 'buffered Up should begin directly in transfer');
  assert(outwardSpeed > 4.5, `buffered Up initially launched inward: ${outwardSpeed}`);
  assert(velocity.y > 3.1, `transfer should retain trick airtime: ${velocity.y}`);
});

test('14 bowl launch derives local frame at multiple coping locations', () => {
  const frames = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5].map(bowlLaunchAt);
  for (const frame of frames) {
    assert(frame.air.frame.rampInward.dot(frame.rampInward) > 0.93);
    assert(frame.air.frame.deckOutward.dot(frame.deckOutward) > 0.93);
  }
  assert(frames[0].air.frame.rampInward.distanceTo(frames[1].air.frame.rampInward) > 1);
});

test('15 vert air has natural X/Z drift instead of freeze', () => {
  const sim = quarterSetup(8, 0);
  const start = sim.position.clone();
  for (let i = 0; i < 36; i++) stepAir(sim, {});
  const horizontalDistance = sim.position.clone().sub(start).setY(0).length();
  assert(horizontalDistance > 0.05, `horizontal motion was effectively frozen: ${horizontalDistance}`);
});

test('16 normal vert never launches forward across deck without Up', () => {
  const result = simulateQuarter({ speed: 13 });
  assert(!result.air.transferring, 'neutral vert should remain a same-wall air');
  assert(result.maxDeckOutward < 0.12, `unexpected deck launch ${result.maxDeckOutward}`);
});

test('17 same-wall return targets the original local coping frame', () => {
  const result = simulateQuarter({ speed: 9 });
  assert.equal(result.air.copingName, QUARTER_NAME);
  assert(result.descendingLip);
  const error = result.descendingLip.clone().setY(0).distanceTo(result.air.frame.returnTarget.clone().setY(0));
  assert(error < 0.8, `return target miss too large: ${error}`);
});

test('18 smooth four-wheel reconnection has front and rear support', () => {
  const collision = makeFlatCollision();
  const from = new THREE.Vector3(0, 0.25, 0);
  const to = new THREE.Vector3(0, -0.1, 0);
  const support = collision.boardLanding(from, to, new THREE.Vector3(0, 0, -1));
  assert(support, 'four-wheel landing support expected');
  assert.equal(support.wheelCount, 4);
  assert.equal(support.frontSupported, 2);
  assert.equal(support.rearSupported, 2);
  const correction = support.point.clone().addScaledVector(support.normal, 0.018).distanceTo(to);
  assert(correction <= 0.22, `contact correction should stay small, got ${correction}`);
});

test('19 vert controller produces no NaNs', () => {
  const result = simulateQuarter({ speed: 20, boost: 8.5, duration: 2.5 });
  for (const value of [...result.position.toArray(), ...result.velocity.toArray(), result.air.returnError]) {
    assert(Number.isFinite(value), `non-finite vert value: ${value}`);
  }
});

test('20 fixed-step vert result is independent of render FPS', () => {
  const at30 = fixedRenderSimulation(1 / 30);
  const at144 = fixedRenderSimulation(1 / 144);
  assert(at30.position.distanceTo(at144.position) < 1e-8, `${at30.position.distanceTo(at144.position)} position delta`);
  assert(at30.velocity.distanceTo(at144.velocity) < 1e-8, `${at30.velocity.distanceTo(at144.velocity)} velocity delta`);
});

let failures = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}`);
    console.error(error?.stack || error);
  }
}

if (failures) {
  console.error(`\n${failures}/${tests.length} vert verification checks failed.`);
  process.exit(1);
}
console.log(`\nPASS ${tests.length}/${tests.length} vert verification checks.`);
