import * as THREE from 'three';
import { warehouseObjectName } from './ImportedWarehouseCollision.js';

// The uploaded Skatewarehouse.glb has THREE duplicated, multi-material
// "Six stair ... Hubba_Solid_-1 001" assemblies. One rogue copy is next to
// the Flow Volcano (centre ~42,-7 in X/Z), where the user's screenshot shows
// an unwanted giant stair/bank. The Nine stair complex at ~10,31 is correctly
// placed according to the Blender reference and MUST remain skateable.
const misplacedSixStairName = /^01_STREET_DISTRICT \/ Six stair kinked down rail \/ Hubba_Solid_-1 001(?:_\d+)?$/;

export function isGrandWarehouseMisplacedSixStair(name, position = null) {
  if (!misplacedSixStairName.test(name || '')) return false;
  if (!position) return true;
  return position.x > 30 && position.x < 55 && position.z > -18 && position.z < 5;
}

export function excludeGrandWarehouseMisplacedSixStair(root) {
  root.updateMatrixWorld(true);
  let count = 0;
  root.traverse(object => {
    if (!object.isMesh) return;
    const name = warehouseObjectName(object);
    if (!misplacedSixStairName.test(name)) return;
    const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    if (!isGrandWarehouseMisplacedSixStair(name, center)) return;
    object.userData.grandWarehouseExcluded = true;
    count++;
  });
  return count;
}
