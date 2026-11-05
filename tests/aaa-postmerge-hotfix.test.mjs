import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GRAPHICS_PRESETS, resolveGraphicsSettings } from '../src/graphics/GraphicsSettings.js';
import { FollowCamera } from '../src/game/FollowCamera.js';

test('Ultra/Cinematic preserve high-tier shading without SSR geometry ghosting', () => {
  for (const tier of ['ultra', 'cinematic']) {
    const profile = resolveGraphicsSettings(tier, {
      devicePixelRatio: 2.5, maxAnisotropy: 16, maxSamples: 4,
    });
    assert.equal(profile.ssr, false);
    assert.equal(profile.ssrTargetLimit, 0);
    assert.equal(profile.shadowResolution, 1024);
    assert.equal(profile.bloomStrength, GRAPHICS_PRESETS.high.bloomStrength);
    assert.ok(profile.pixelRatio > 1.5);
  }
});

test('graffiti trick feedback has no solid rectangular backing', () => {
  const css = readFileSync(new URL('../src/game-hud.css', import.meta.url), 'utf8');
  const selector = css.match(/#trick-feedback:not\(:empty\)\{([^}]+)\}/);
  assert.ok(selector, 'hotfix HUD style is missing');
  assert.match(selector[1], /background:none/);
  assert.match(selector[1], /border:0/);
  assert.match(selector[1], /box-shadow:none/);
  assert.match(selector[1], /backdrop-filter:none/);
});

test('clear line of sight damps small alternating wheel-contact height changes', () => {
  const camera = new THREE.PerspectiveCamera(58, 16/9, .08, 1000);
  const rig = new FollowCamera(camera);
  const skater = {
    position: new THREE.Vector3(0,1,0),
    velocity: new THREE.Vector3(0,0,-8),
    forward: new THREE.Vector3(0,0,-1),
    travelDirection: new THREE.Vector3(0,0,-1),
    normal: new THREE.Vector3(0,1,0),
    grounded: true, fakie: false, wallRide: null,
    visual: { visible: true }, surface: null,
  };
  rig.snap(skater);
  let largestEyeStep = 0;
  for (let i=0;i<100;i++) {
    skater.position.y = 1 + (i%2 ? -.055 : .055);
    const previous = camera.position.clone();
    rig.update(skater, 1/60, {});
    largestEyeStep = Math.max(largestEyeStep, camera.position.distanceTo(previous));
    assert.ok(Number.isFinite(camera.position.x + camera.position.y + camera.position.z));
  }
  assert.ok(largestEyeStep < .16, 'camera snaps with contact-height noise: '+largestEyeStep);
});
