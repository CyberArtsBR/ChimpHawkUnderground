import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WheelContactShadows } from '../src/graphics/WheelContactShadows.js';
import { refineMapSurfaces } from '../src/graphics/SurfaceFinish.js';
import { GraphicsPipeline } from '../src/graphics/GraphicsPipeline.js';
import { calibrateRiderMaterials } from '../src/character/RiderMaterialPresentation.js';
import { UnrealRider } from '../src/character/UnrealRider.js';
import { StreetBoard } from '../src/skateboard/StreetBoard.js';
import { loadGeometry } from '../tools/load-geometry.mjs';

test('contact patches follow measured ramp normals without editing wheel state', () => {
  const shading = new WheelContactShadows();
  const normal = new THREE.Vector3(0, .8, .6);
  const wheel = { valid: true, point: new THREE.Vector3(.1, 0, .2), normal };
  const original = JSON.stringify(wheel);
  const skater = { grounded: true, position: new THREE.Vector3(), boardContact: { state: { contacts: [wheel] } } };
  shading.update(skater);
  assert.equal(shading.mesh.count, 1);
  const matrix = new THREE.Matrix4();
  shading.mesh.getMatrixAt(0, matrix);
  assert.ok(new THREE.Vector3(0, 0, 1).transformDirection(matrix).distanceTo(normal) < 1e-6);
  assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(wheel.point.clone().addScaledVector(normal, .003)) < 1e-6);
  assert.equal(JSON.stringify(wheel), original);
  shading.dispose();
});

test('contact patches clear during jumps, bails, grinds, replay and world resets', () => {
  const shading = new WheelContactShadows();
  const skater = { grounded: true, position: new THREE.Vector3(), boardContact: { state: { contacts: [
    { valid: true, point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0) },
  ] } } };
  for (const override of [{ grounded: false }, { bailTime: 1 }, { grind: {} }, { wallRide: {} },
    { position: new THREE.Vector3(50, 0, 50) }]) {
    shading.update(skater);
    assert.equal(shading.mesh.visible, true);
    shading.update({ ...skater, ...override });
    assert.equal(shading.mesh.count, 0);
    assert.equal(shading.mesh.visible, false);
  }
  shading.update(null);
  assert.equal(shading.mesh.visible, false);
  const scene = new THREE.Scene(); scene.add(shading.mesh);
  let geometries = 0, materials = 0, instances = 0;
  shading.mesh.geometry.addEventListener('dispose', () => geometries++);
  shading.mesh.material.addEventListener('dispose', () => materials++);
  shading.mesh.addEventListener('dispose', () => instances++);
  shading.dispose();
  assert.equal(scene.children.length, 0);
  assert.deepEqual([geometries, materials, instances], [1, 1, 1]);
});

test('surface finishes preserve source maps, geometry and shader hooks across repeated preparation', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry(), map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ name: 'Concrete', map, metalness: 1 });
  let priorCalls = 0;
  material.onBeforeCompile = shader => { shader.uniforms.priorHook = { value: 1 }; priorCalls++; };
  const mesh = new THREE.Mesh(geometry, material); root.add(mesh);
  const positions = [...geometry.attributes.position.array];
  refineMapSurfaces(root, 'rooftop');
  const compile = material.onBeforeCompile;
  refineMapSurfaces(root, 'rooftop');
  assert.equal(material.onBeforeCompile, compile);
  assert.equal(material.map, map);
  assert.equal(mesh.geometry, geometry);
  assert.deepEqual([...geometry.attributes.position.array], positions);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  compile.call(material, shader, {});
  assert.equal(priorCalls, 1);
  assert.equal(shader.uniforms.priorHook.value, 1);
  assert.equal(material.metalness, 0);
  geometry.dispose(); material.dispose(); map.dispose();
});

test('warehouse shadow budget excludes roofs and responds reversibly to quality changes', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  for (let i = 0; i < 20; i++) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name: 'Foundry_Plywood.' + i }));
    mesh.userData.cameraRoof = i === 0;
    root.add(mesh);
  }
  refineMapSurfaces(root, 'grand-warehouse');
  assert.equal(root.children.filter(m => m.castShadow).length, 12);
  assert.equal(root.children[0].castShadow, false);
  const pipeline = Object.create(GraphicsPipeline.prototype);
  Object.assign(pipeline, { world: root, settings: { name: 'performance', anisotropy: 2 } });
  pipeline.updateMaterials();
  assert.equal(root.children.filter(m => m.castShadow).length, 0);
  pipeline.settings.name = 'high'; pipeline.updateMaterials();
  assert.equal(root.children.filter(m => m.castShadow).length, 12);
  geometry.dispose(); root.children.forEach(m => m.material.dispose());
});

test('Tux body gains diffuse response while his authored light and custom riders stay intact', () => {
  const root = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const fabric = new THREE.MeshStandardMaterial({ name: 'tripo_mat_44da3931', metalness: 1 });
  const light = new THREE.MeshStandardMaterial({ name: 'Material.002', emissive: 'white', emissiveIntensity: 9.1, metalness: 1 });
  root.add(new THREE.Mesh(geometry, [fabric, light]));
  calibrateRiderMaterials(root, 'blob:uploaded-model');
  assert.equal(fabric.metalness, 1);
  calibrateRiderMaterials(root, '/assets/rider/TuxR.glb');
  assert.ok(fabric.metalness < .15);
  assert.equal(light.emissiveIntensity, 9.1);
  assert.equal(light.metalness, 1);
  geometry.dispose(); fabric.dispose(); light.dispose();
});

test('calibrated Tux crouch preserves foot targets and deep knee bend in both stances', async () => {
  const rider = new UnrealRider('/assets/rider/TuxR.glb').configureModel(
    await loadGeometry('public/assets/rider/TuxR.glb'));
  const board = new StreetBoard('/unused'); board.deckHeight = .12;
  board.contactRig = { deckTopY: .14, deckWidth: .42, deckLength: 1.1 };
  board.update({ dt: 0 });
  for (const stance of [-1, 1]) {
    rider.resetPresentation();
    for (let i = 0; i < 40; i++) rider.update({ board, stance, presentation: { state: 'CROUCH' }, crouch: 1, dt: 1 / 60 });
    const pelvis = board.root.worldToLocal(rider.bones.pelvis.getWorldPosition(new THREE.Vector3()));
    assert.ok(pelvis.y - .02 >= .349);
    for (const side of ['l', 'r']) {
      const hip = rider.bones['thigh_' + side].getWorldPosition(new THREE.Vector3());
      const knee = rider.bones['calf_' + side].getWorldPosition(new THREE.Vector3());
      const ankle = rider.bones['foot_' + side].getWorldPosition(new THREE.Vector3());
      assert.ok(Math.PI - hip.sub(knee).angleTo(ankle.clone().sub(knee)) > 1.8);
      assert.ok(ankle.distanceTo(rider.root.localToWorld(rider.ft[side].clone())) < .012);
    }
  }
  rider.dispose();
});
