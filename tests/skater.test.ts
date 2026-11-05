// Deterministic feel tests: the real skater on the real park with real Rapier
// collision, stepped at 120 Hz. If a tuning change breaks a core move, these fail.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld } from '../src/physics/PhysicsWorld';
import { buildTestPark, type ParkDefinition } from '../src/park/TestPark';
import { Skater, type SkaterEvent } from '../src/skater/Skater';
import { SKATER } from '../src/skater/config';
import { emptyFrame, type InputFrame } from '../src/input/Input';

let world: PhysicsWorld;
let park: ParkDefinition;

beforeAll(async () => {
  park = buildTestPark();
  world = await PhysicsWorld.create();
  for (const piece of park.pieces) world.addGeometry(piece.geometry);
  world.finalize();
});

const frame = (o: Partial<InputFrame> = {}): InputFrame => ({ ...emptyFrame(), ...o });

function run(skater: Skater, seconds: number, input: (t: number) => Partial<InputFrame> = () => ({}), events: SkaterEvent[] = []) {
  const steps = Math.round(seconds / SKATER.step);
  for (let i = 0; i < steps; i++) {
    skater.step(frame(input(i * SKATER.step)));
    events.push(...skater.events.splice(0));
  }
  return events;
}

/** Hold Space for the full charge, then release on one step. */
function ollieAt(startTime: number, t: number): Partial<InputFrame> {
  if (t >= startTime && t < startTime + SKATER.chargeTime) return { ollieHeld: true };
  if (Math.abs(t - (startTime + SKATER.chargeTime)) < SKATER.step / 2) return { ollieReleased: true };
  return {};
}

const spotSkater = (x: number, z: number, heading = 0) => {
  const s = new Skater(world, park.rails, park.spawn);
  s.respawn(new THREE.Vector3(x, 0.02, z), heading);
  return s;
};

describe('ground', () => {
  it('auto-pushes up to the v1 cruise speed on flat ground', () => {
    const s = spotSkater(-55, 45, -Math.PI / 2); // open floor, rolling west
    run(s, 1);
    expect(s.state).toBe('ground');
    expect(s.speed).toBeGreaterThan(8);
    run(s, 2.5);
    expect(s.speed).toBeGreaterThan(16);
    expect(s.speed).toBeLessThanOrEqual(SKATER.autoPushTarget + 0.01);
    expect(s.position.y).toBeCloseTo(0, 2);
  });

  it('brakes to a stop', () => {
    const s = spotSkater(-55, 45, -Math.PI / 2);
    run(s, 2);
    run(s, 2.5, () => ({ brake: true }));
    expect(s.speed).toBeLessThan(0.5);
  });

  it('stops at a wall instead of passing through it', () => {
    const s = spotSkater(30, 26, 0); // wallride wall is at z = 30, facing it from the south? heading 0 = -Z
    s.respawn(new THREE.Vector3(30, 0.02, 34), 0); // north side of wall, rolling -Z into it
    run(s, 3);
    expect(s.position.z).toBeGreaterThan(30.2);
  });
});

describe('ollie and flips', () => {
  it('does not turn fakie while standing still on flat ground', () => {
    for (const [x, z, h] of [[4, 34, 0], [-55, 45, -Math.PI / 2], [12, 40, 1.1], [-30, 50, 2.3]] as const) {
      const s = spotSkater(x, z, h);
      run(s, 0.5, () => ({ brake: true }));
      expect(s.fakie).toBe(false);
    }
  });

  it('a quick tap ollie with an instant kickflip still lands', () => {
    const s = spotSkater(-55, 45, -Math.PI / 2);
    run(s, 1.5);
    const events: SkaterEvent[] = [];
    skaterStep(s, { ollieHeld: true }, events);
    skaterStep(s, { ollieReleased: true }, events);
    skaterStep(s, { flipPressed: true }, events);
    run(s, 1.5, () => ({}), events);
    expect(events.some(e => e.type === 'bail')).toBe(false);
    expect(events.find(e => e.type === 'bank')).toMatchObject({ label: 'Kickflip' });
  });

  it('pops, lands back on the ground and banks an Ollie', () => {
    const s = spotSkater(-55, 45, -Math.PI / 2);
    run(s, 1.5);
    let maxHeight = 0;
    const events: SkaterEvent[] = [];
    for (let i = 0; i < 300; i++) {
      skaterStep(s, ollieAt(0, i * SKATER.step), events);
      maxHeight = Math.max(maxHeight, s.position.y);
    }
    expect(maxHeight).toBeGreaterThan(1.0);
    expect(maxHeight).toBeLessThan(2.0);
    expect(s.state).toBe('ground');
    const bank = events.find(e => e.type === 'bank');
    expect(bank).toMatchObject({ type: 'bank', label: 'Ollie', points: 50 });
  });

  it('lands a kickflip and scores it', () => {
    const s = spotSkater(-55, 45, -Math.PI / 2);
    run(s, 1.5);
    const events: SkaterEvent[] = [];
    for (let i = 0; i < 300; i++) {
      const t = i * SKATER.step;
      skaterStep(s, { ...ollieAt(0, t), flipPressed: Math.abs(t - 0.3) < SKATER.step / 2 }, events);
    }
    expect(events.some(e => e.type === 'bail')).toBe(false);
    expect(events.find(e => e.type === 'bank')).toMatchObject({ label: 'Kickflip' });
  });

  it('bails when landing sideways', () => {
    const s = spotSkater(-55, 45, -Math.PI / 2);
    run(s, 1.5);
    const events: SkaterEvent[] = [];
    // Spin a quarter turn (≈90°) and stop: board ends up across the direction of travel.
    for (let i = 0; i < 300; i++) {
      const t = i * SKATER.step;
      const spinning = t > SKATER.chargeTime && t < SKATER.chargeTime + (Math.PI / 2) / SKATER.airTurnRate;
      skaterStep(s, { ...ollieAt(0, t), spin: spinning ? 1 : 0 }, events);
    }
    expect(events.find(e => e.type === 'bail')).toMatchObject({ reason: 'Landed sideways' });
  });

  it('a 180 lands fakie and scores the spin', () => {
    const s = spotSkater(-55, 45, -Math.PI / 2);
    run(s, 1.5);
    const events: SkaterEvent[] = [];
    for (let i = 0; i < 300; i++) {
      const t = i * SKATER.step;
      const spinning = t > SKATER.chargeTime && t < SKATER.chargeTime + Math.PI / SKATER.airTurnRate;
      skaterStep(s, { ...ollieAt(0, t), spin: spinning ? 1 : 0 }, events);
    }
    expect(events.some(e => e.type === 'bail')).toBe(false);
    expect(s.fakie).toBe(true);
    expect(events.find(e => e.type === 'bank')).toMatchObject({ label: '180 Ollie', points: 125 });
  });
});

function skaterStep(s: Skater, o: Partial<InputFrame>, events: SkaterEvent[]) {
  s.step(frame(o));
  events.push(...s.events.splice(0));
}

describe('transitions', () => {
  it('rides up the quarter pipe, airs vert and comes back down to the flat', () => {
    const s = spotSkater(4, 34, 0);
    let wentVert = false, peak = 0;
    const events: SkaterEvent[] = [];
    for (let i = 0; i < 120 * 9; i++) {
      skaterStep(s, {}, events);
      if (s.state === 'air' && s.air?.vertNormal) wentVert = true;
      peak = Math.max(peak, s.position.y);
    }
    expect(wentVert).toBe(true);
    expect(peak).toBeGreaterThan(3.85); // above the 3.85 m lip
    expect(events.some(e => e.type === 'bail')).toBe(false);
    expect(s.state).toBe('ground');
  });
});

describe('world safety', () => {
  it('never leaves the park in a long hands-off session (walls, bails, respawns)', () => {
    const s = spotSkater(4, 34, 0);
    let minY = Infinity;
    const half = park.size / 2;
    for (let i = 0; i < 120 * 30; i++) {
      skaterStep(s, {}, []);
      minY = Math.min(minY, s.position.y);
      expect(Math.abs(s.position.x)).toBeLessThan(half);
      expect(Math.abs(s.position.z)).toBeLessThan(half);
    }
    expect(minY).toBeGreaterThan(-0.5);
  });

  it('a head-on wall bail stops at the wall', () => {
    const s = spotSkater(-40, 50, Math.PI); // facing +Z toward the south boundary wall
    const events: SkaterEvent[] = [];
    run(s, 4, () => ({}), events);
    expect(events.some(e => e.type === 'bail')).toBe(true);
    expect(s.position.z).toBeLessThan(park.size / 2 - 0.4);
  });
});

describe('grind and manual', () => {
  it('captures the flat rail when holding grind above it', () => {
    const rail = park.rails.find(r => r.name === 'Flat rail')!;
    const s = spotSkater(-40, 40);
    // Drop the rider just above the rail, moving along it.
    s.state = 'air';
    s.position.copy(rail.points[0]).add(new THREE.Vector3(1, 0.35, 0));
    s.velocity.set(6, -0.5, 0);
    s.forward.set(1, 0, 0);
    s.air = { up: new THREE.Vector3(0, 1, 0), vertNormal: null, apexPassed: true, released: false, spin: 0, time: 0.5, flip: null, grab: null, wall: null };
    const events: SkaterEvent[] = [];
    skaterStep(s, { grindHeld: true }, events);
    expect(s.state).toBe('grind');
    expect(events.find(e => e.type === 'trick')).toMatchObject({ name: '50-50' });
    run(s, 0.4, () => ({ grindHeld: true }), events);
    expect(['grind', 'air', 'ground']).toContain(s.state);
  });

  it('enters a manual from W then S taps', () => {
    const s = spotSkater(-55, 45, -Math.PI / 2);
    run(s, 1);
    const events: SkaterEvent[] = [];
    skaterStep(s, { directionTaps: ['up'] }, events);
    skaterStep(s, { directionTaps: ['down'] }, events);
    skaterStep(s, {}, events);
    expect(s.state).toBe('manual');
    expect(events.find(e => e.type === 'trick')).toMatchObject({ name: 'Manual' });
  });
});
