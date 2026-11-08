import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import { StreetSkater } from '../src/game/StreetSkater.js';

test('falling out of the world respawns like any other respawn (serial bumps, score kept)', () => {
  const skater = new StreetSkater({ collision: new THREE.Group(), spawn: [0, 0, 0], rails: [] });
  skater.score = 1234;
  const serial = skater.respawnSerial || 0;
  skater.position.y = -20;
  assert.equal(skater.recoverInvalidState(), true);
  assert.equal(skater.respawnSerial, serial + 1, 'camera, drills and audio see a new life');
  assert.equal(skater.score, 1234);
  skater.velocity.set(NaN, 0, 0);
  assert.equal(skater.recoverInvalidState(), true);
  assert.equal(skater.respawnSerial, serial + 2);
  assert.equal(skater.recoverInvalidState(), false, 'a valid state is left alone');
});

test('the main loop runs each frame through an exception guard', () => {
  const source = fs.readFileSync(new URL('../src/game-main.js', import.meta.url), 'utf8');
  assert.match(source, /setAnimationLoop\(\(\) => \{ try \{ gameFrame\(\); \} catch \(error\) \{ reportFrameError\(error\); \} \}\)/);
  assert.match(source, /function gameFrame\(\) \{/);
});

test('camera probe broad phase returns exactly the same eye as testing every mesh', async () => {
  const { ParkCollision } = await import('../src/game/ParkCollision.js');
  const root = new THREE.Group();
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1 + rnd() * 4, 1 + rnd() * 3, 1 + rnd() * 4), new THREE.MeshBasicMaterial());
    m.position.set(rnd() * 60 - 30, rnd() * 4, rnd() * 60 - 30); m.rotation.y = rnd() * 3; m.userData.collision = 'solid';
    root.add(m);
  }
  const col = new ParkCollision(root);
  if (!col.cameraMeshes.length) col.cameraMeshes.push(...root.children);
  let compared = 0, blocked = 0;
  for (let i = 0; i < 400; i++) {
    const from = new THREE.Vector3(rnd() * 60 - 30, 1 + rnd() * 3, rnd() * 60 - 30);
    const to = from.clone().add(new THREE.Vector3(rnd() * 16 - 8, rnd() * 5, rnd() * 16 - 8));
    col.cameraBroadphase = false; const a = col.camera(from, to, .28).clone();
    col.cameraBroadphase = true; const b = col.camera(from, to, .28).clone();
    assert.equal(a.distanceTo(b), 0); compared++; if (a.distanceTo(to) > 1e-6) blocked++;
  }
  assert.ok(compared === 400 && blocked > 20, `exercised blocked probes (${blocked})`);
  root.children[0].position.x += 100; root.updateMatrixWorld(true);
  const from = root.children[0].position.clone().add(new THREE.Vector3(0, 0, -6));
  const to = root.children[0].position.clone().add(new THREE.Vector3(0, 0, 6));
  col.cameraBroadphase = false; const a = col.camera(from, to, .28).clone();
  col.cameraBroadphase = true; const b = col.camera(from, to, .28).clone();
  assert.equal(a.distanceTo(b), 0, 'moved meshes refresh their cached bounds');
});

test('UI polish sheet loads last and keeps labels readable and scalable', () => {
  const main = fs.readFileSync(new URL('../src/game-main.js', import.meta.url), 'utf8');
  const imports = [...main.matchAll(/import '\.\/([\w-]+\.css)';/g)].map(m => m[1]);
  assert.equal(imports.at(-1), 'ui-polish.css');
  const css = fs.readFileSync(new URL('../src/ui-polish.css', import.meta.url), 'utf8');
  for (const selector of ['.charge-label', '#state-value', '.hud-total>small', '.menu-footnote', '.map-number'])
    assert.ok(css.includes(selector), selector);
  assert.match(css, /max\(10px, calc\(10px \* var\(--ui-scale, 1\)\)\)/, 'labels have a floor and follow Text size');
  assert.doesNotMatch(css, /color-mix\([^)]*var\(--skin-hot/, '--skin-hot is a gradient and cannot be colour-mixed');
});
