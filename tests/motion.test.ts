import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { compression, flipMotion, grabFeet, GRAB_REACH, grindShift, spring } from '../src/render/RiderMotion';
import { CAMERA_MODES, highFollowFraming, smoothDirection } from '../src/camera/FollowCamera';
import { normalizeBoneName, resolveBones, checkRig } from '../src/render/RigRider';

describe('rider motion (v1 port)', () => {
  it('flip timing: feet lift and flick early, board spin completes before the catch', () => {
    expect(flipMotion(0).rotation).toBe(0);
    expect(flipMotion(0.3).flick).toBeGreaterThan(0.5);
    expect(flipMotion(0.85).rotation).toBe(1);
    expect(flipMotion(1).clearance).toBe(0);
  });

  it('compression: charging crouches, flight tucks, landing absorbs', () => {
    const standing = compression({}).value;
    expect(compression({ charge: 1 }).value).toBe(1);
    expect(compression({ air: 1, airTime: 0.4 }).value).toBeGreaterThan(0.75);
    expect(compression({ landing: 1 }).value).toBeGreaterThan(standing + 0.5);
  });

  it('grind weight goes over the nose or the tail by trick', () => {
    expect(grindShift('Nosegrind', 0).foreAft).toBeLessThan(0);
    expect(grindShift('5-0', 0).foreAft).toBeGreaterThan(0);
    expect(grindShift('50-50', 0).foreAft).toBe(0);
    expect(grindShift(null, 1)).toEqual({ foreAft: 0, lateral: 0, compression: 0 });
  });

  it('every grab in the trick catalog has a hand target', () => {
    for (const name of ['Indy', 'Melon', 'Nosegrab', 'Tailgrab', 'Japan', 'Madonna', 'Benihana', 'Airwalk',
      'Method', 'Stalefish', 'Rocket Air', 'Seatbelt', 'Mute', 'Judo', 'Crail', 'Christ Air']) {
      expect(GRAB_REACH[name], name).toBeDefined();
    }
    expect(grabFeet('Benihana').front.y).toBeGreaterThan(0.2);
    expect(grabFeet('Indy')).toEqual({ front: { x: 0, y: 0, z: 0 }, rear: { x: 0, y: 0, z: 0 } });
  });

  it('springs settle on the target', () => {
    const s = { value: 0, velocity: 0 };
    for (let i = 0; i < 120; i++) spring(s, 1, 12, 1 / 60);
    expect(s.value).toBeCloseTo(1, 3);
  });
});

describe('rig bone matching', () => {
  it('normalises Mixamo, Unreal and Rigify-style names', () => {
    expect(normalizeBoneName('mixamorig:LeftUpLeg')).toBe('leftupleg');
    expect(normalizeBoneName('thigh_l')).toBe('thighl');
    expect(normalizeBoneName('DEF-thigh.L')).toBe('thighl');
  });

  it('finds legs on an Unreal-named skeleton and reports missing bones', () => {
    const names = ['pelvis', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];
    const bones = names.map(n => Object.assign(new THREE.Bone(), { name: n }));
    expect(checkRig(resolveBones(bones)).ok).toBe(true);
    expect(checkRig(resolveBones(bones.slice(0, 4))).missing).toEqual(['thighR', 'calfR', 'footR']);
  });
});

describe('camera (v1 port)', () => {
  it('has the five v1 modes in v1 order', () => {
    expect(CAMERA_MODES).toEqual(['follow', 'follow-close', 'follow-low', 'classic', 'fixed']);
  });

  it('high follow frames wider in the air and on vert returns', () => {
    const ground = highFollowFraming({ grounded: true, returning: false, wallride: false, speed: 0 });
    const air = highFollowFraming({ grounded: false, returning: false, wallride: false, speed: 0 });
    const vert = highFollowFraming({ grounded: false, returning: true, wallride: false, speed: 0 });
    expect(ground).toEqual({ distance: 8.5, height: 4.9, lookAhead: 0.55 });
    expect(air.distance).toBeGreaterThan(ground.distance);
    expect(vert.distance).toBeGreaterThan(air.distance);
  });

  it('turns through 180° smoothly instead of flipping', () => {
    const dir = new THREE.Vector3(0, 0, -1);
    const target = new THREE.Vector3(0, 0, 1);
    smoothDirection(dir, target, 1 / 60, 4.2, 3.6);
    expect(dir.length()).toBeCloseTo(1, 6);
    expect(dir.angleTo(new THREE.Vector3(0, 0, -1))).toBeLessThanOrEqual(3.6 / 60 + 1e-6);
  });
});
