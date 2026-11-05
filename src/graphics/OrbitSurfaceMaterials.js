// One polished finish contract across import, detail and scene presentation.
export const ORBIT_POLISHED_FLOOR = Object.freeze({roughness:.18,metalness:.28,envMapIntensity:1.85,normalScale:.045});
export function isOrbitFloorMaterial(material) {
  return String(material?.name||'').replace(/\.\d+$/,'') === 'Ceramic / silver riding concrete';
}
export function applyOrbitFloorFinish(material) {
  if(!isOrbitFloorMaterial(material))return false;
  material.roughness=ORBIT_POLISHED_FLOOR.roughness;
  material.metalness=ORBIT_POLISHED_FLOOR.metalness;
  material.envMapIntensity=ORBIT_POLISHED_FLOOR.envMapIntensity;
  material.normalScale?.set(ORBIT_POLISHED_FLOOR.normalScale,ORBIT_POLISHED_FLOOR.normalScale);
  return true;
}
