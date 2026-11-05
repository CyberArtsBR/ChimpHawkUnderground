import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Decorative rooftop support only; never contributes to skate collision.
// Merge the four identical-material walls to save three draw calls without
// placing any new surface across the recessed pool.
export function createRooftopCity() {
  const base = new THREE.Group();
  base.name = 'Rooftop base';
  const structure = new THREE.MeshStandardMaterial({ color: '#77777b', roughness: 0.85 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(113, 0.65, 153), structure);
  slab.position.set(0, -4.55, -8);
  slab.userData.castShadow = false;
  base.add(slab);

  const fasciaGeometries = [];
  for (const x of [-56, 56]) {
    fasciaGeometries.push(new THREE.BoxGeometry(1, 4.2, 153).translate(x, -2.1, -8));
  }
  for (const z of [-84, 68]) {
    fasciaGeometries.push(new THREE.BoxGeometry(113, 4.2, 1).translate(0, -2.1, z));
  }
  const fascia = new THREE.Mesh(mergeGeometries(fasciaGeometries), structure);
  fascia.name = 'Rooftop / batched fascia';
  fascia.receiveShadow = true;
  fascia.castShadow = true;
  base.add(fascia);
  for (const geometry of fasciaGeometries) geometry.dispose();
  return base;
}
