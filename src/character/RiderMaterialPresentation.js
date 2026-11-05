// The default Heretic export omits metallicFactor on both costume materials.
// glTF therefore loads the entire painted costume/face as metal (factor 1).
// Correct known default costume materials; custom artist materials stay authored.
export function calibrateRiderMaterials(root, url) {
  const path = String(url).split('?')[0];
  const heretic = path.endsWith('/assets/rider/The_Heretic.glb');
  const tux = path.endsWith('/assets/rider/TuxR.glb');
  if (!heretic && !tux) return;
  const touched=new Set();
  root.traverse(object=>{
    if(!object.isMesh)return;
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      if(!material||touched.has(material)||!material.isMeshStandardMaterial)continue;
      touched.add(material);
      // Tux's textured body has the same omitted metallicFactor. Preserve
      // his separate authored emissive accessory and all uploaded materials.
      if (tux && material.name !== 'tripo_mat_44da3931') continue;
      material.metalness=Math.min(material.metalness, .08);
      material.roughness=Math.max(material.roughness, .72);
    }
  });
}
