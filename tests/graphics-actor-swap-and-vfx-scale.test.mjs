import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GraphicsPipeline } from '../src/graphics/GraphicsPipeline.js';
import { SkateEffects } from '../src/graphics/SkateEffects.js';

test('same-count nested rider swaps immediately refresh bloom occlusion without retaining disposed meshes', () => {
  const scene = new THREE.Scene(), visual = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({
    emissive: 0x3388ff, emissiveIntensity: 1,
  }));
  const makeRider = () => {
    const root = new THREE.Group();
    const skin = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    root.add(skin);
    return { root, skin, material: skin.material };
  };
  const old = makeRider();
  scene.add(visual); visual.add(board, old.root);
  const pipeline = Object.create(GraphicsPipeline.prototype);
  Object.assign(pipeline, {
    scene, glowRoot: visual, world: null,
    renderer: { shadowMap: { autoUpdate: true } },
    blackoutMaterial: new THREE.MeshBasicMaterial({ color: 0 }),
    bloom: { renderTargetsHorizontal: [{ texture: {} }] },
    bloomComposite: { uniforms: { bloomTexture: { value: null } } },
  });
  let live = old, walks = 0;
  const traverse = scene.traverse.bind(scene);
  scene.traverse = visitor => { walks++; traverse(visitor); };
  pipeline.bloomComposer = { render() {
    assert.equal(live.skin.material, pipeline.blackoutMaterial, 'ordinary new costume must stay out of bloom on its first frame');
  } };
  pipeline.renderSelectiveBloom();
  pipeline.renderSelectiveBloom();
  assert.equal(walks, 1, 'unchanged actor reuses the scene cache');
  const replacement = makeRider();
  old.root.removeFromParent(); visual.add(replacement.root);
  old.material.dispose(); old.skin.geometry.dispose();
  live = replacement;
  // Scene-child count, active board and emissive-mesh count are identical.
  pipeline.renderSelectiveBloom();
  assert.equal(walks, 2, 'actor identity invalidates immediately, without a 120-frame wait');
  assert.equal(replacement.skin.material, replacement.material, 'visible material is restored');
  assert.ok(!pipeline.bloomSceneMeshes.includes(old.skin), 'disposed mesh is no longer retained');
  assert.ok(!pipeline.bloomGlowChildren?.includes(old.root), 'disposed actor root is no longer retained');
  pipeline.renderSelectiveBloom();
  assert.equal(walks, 2, 'no new scene walk on ordinary frames');
  for (const mesh of [board, replacement.skin]) { mesh.geometry.dispose(); mesh.material.dispose(); }
  pipeline.blackoutMaterial.dispose();
});

test('particle footprints keep the same CSS size at sub-native render scale and high native DPR', () => {
  const effects = new SkateEffects();
  try {
    const height = 900, size = .11, viewDepth = 10;
    const cssPointSize = size * height / viewDepth;
    for (const ratio of [.6, .75, 1, 1.25, 2, 2.5, 4, 5]) {
      effects.setSize(height, ratio);
      for (const pool of [effects.dust, effects.glints]) {
        const viewport = pool.points.material.uniforms.viewportHeight.value;
        const actualCssSize = (size * viewport / viewDepth) / ratio;
        assert.ok(Math.abs(actualCssSize - cssPointSize) < 1e-10, `render ratio ${ratio}: ${actualCssSize} vs ${cssPointSize}`);
      }
    }
    for (const ratio of [NaN, Infinity, 0, -1]) {
      effects.setSize(height, ratio);
      assert.equal(effects.dust.points.material.uniforms.viewportHeight.value, height);
    }
  } finally { effects.dispose(); }
});
