import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WorldLife, WORLD_LIFE } from '../src/graphics/WorldLife.js';

// Flat ground everywhere at y = 0, plus a ramp region (x > 50) that birds must avoid.
const surface = {
  ground(position) {
    if (position.x > 50) return { point: new THREE.Vector3(position.x, 1, position.z), normal: new THREE.Vector3(0, .7, .7).normalize() };
    return { point: new THREE.Vector3(position.x, 0, position.z), normal: new THREE.Vector3(0, 1, 0) };
  },
};
const skater = (x = 0, z = 0, speed = 0) => ({
  position: new THREE.Vector3(x, 0, z), forward: new THREE.Vector3(0, 0, -1), speed, grounded: true, surface,
});
const idle = life => life.birds.filter(b => b.state === 'idle');

test('a flock settles on flat ground near the rider', () => {
  const life = new WorldLife();
  const s = skater();
  for (let i = 0; i < 200 && !idle(life).length; i++) life.update(1 / 30, s);
  const birds = idle(life);
  assert.ok(birds.length >= 3, 'flock spawned');
  for (const bird of birds) {
    assert.equal(bird.group.position.y, 0);
    const d = bird.group.position.distanceTo(s.position);
    assert.ok(d > WORLD_LIFE.spawnDistance[0] - 3 && d < WORLD_LIFE.spawnDistance[1] + 3);
  }
  life.dispose();
});

test('birds scatter when the rider rolls through or lands nearby', () => {
  const life = new WorldLife();
  const s = skater();
  for (let i = 0; i < 200 && !idle(life).length; i++) life.update(1 / 30, s);
  const target = idle(life)[0].group.position.clone();
  const rider = skater(target.x + .5, target.z, 8);
  life.update(1 / 30, rider);
  assert.ok(life.birds.some(b => b.state === 'flee'));

  const life2 = new WorldLife();
  for (let i = 0; i < 200 && !idle(life2).length; i++) life2.update(1 / 30, s);
  const spot = idle(life2)[0].group.position.clone();
  const jumper = skater(spot.x + 6, spot.z, 0);
  jumper.grounded = false;
  for (let i = 0; i < 20; i++) life2.update(1 / 30, jumper);
  jumper.grounded = true;
  life2.update(1 / 30, jumper);
  assert.ok(life2.birds.some(b => b.state === 'flee'), 'landing within range scares them');
  life.dispose(); life2.dispose();
});

test('neon flicker always restores the exact brightness', () => {
  const life = new WorldLife();
  const material = new THREE.MeshStandardMaterial({ name: 'LED / neon sign', emissive: 0xff3399, emissiveIntensity: 2.4 });
  const park = new THREE.Group();
  park.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  life.setWorld({ id: 'orbit', park });
  assert.equal(life.flicker.length, 1);
  life.flickerTimer = 0;
  for (let i = 0; i < 60; i++) life.updateFlicker(1 / 30);
  assert.equal(material.emissiveIntensity, 2.4);
  life.flickerTimer = 0; life.updateFlicker(1 / 30); life.updateFlicker(1 / 30);
  life.setWorld({ id: 'orbit', park });
  assert.equal(material.emissiveIntensity, 2.4, 'switching maps mid-flicker restores it');
  life.dispose();
});

test('performance preset turns world life off', () => {
  const life = new WorldLife();
  life.setQuality({ name: 'performance' });
  life.update(1 / 30, skater());
  assert.equal(life.root.visible, false);
  assert.equal(idle(life).length, 0);
  life.dispose();
});
