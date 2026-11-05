import * as THREE from 'three';

// Imported skating skins can face either way. The glow mask must block light
// from both sides, just as their double-sided visible materials do.
export function createBloomOccluderMaterial() {
  return new THREE.MeshBasicMaterial({ color:0x000000, side:THREE.DoubleSide,
    depthTest:true, depthWrite:true, toneMapped:false });
}
