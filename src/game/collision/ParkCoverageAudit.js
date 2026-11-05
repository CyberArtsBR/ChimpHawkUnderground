import * as THREE from 'three';

// Read-only level-design diagnostic. Compare the authored visual rideable floor
// against the actual collision ray queries, rather than assuming a painted
// region guarantees a skatable surface.
const DECORATION = /(?:decal|logo|sticker|graffiti|letter|text|banner|poster|light|emissive)/i;
const DOWN = new THREE.Vector3(0,-1,0);
const EPS = 1e-6;

/**
 * @param {object} options
 * @param {object} options.collision - Active ParkCollision
 * @param {THREE.Object3D} options.visualRoot - Loaded actual park GLB root
 * @param {Array} options.playableRegions - Manifest playableRegions
 * @returns {object} Counts plus at most 24 concrete XYZ evidence coordinates
 */
export function auditParkSurfaceCoverage({
  collision, visualRoot, playableRegions, samplesPerAxis = 7,
  maxFindings = 24, tolerance = 0.28, originHeight = 18,
} = {}) {
  if (!collision?.rayRideable || !visualRoot?.traverse || !Array.isArray(playableRegions)) {
    throw new TypeError('A collision surface, park visual root and playable regions are required');
  }
  visualRoot.updateMatrixWorld(true);
  const meshes = [];
  const bounds = new THREE.Box3(), size = new THREE.Vector3();
  visualRoot.traverse(mesh => {
    if (!mesh.isMesh || mesh.visible === false || !mesh.geometry?.attributes?.position) return;
    if (DECORATION.test(mesh.name || '')) return;
    bounds.setFromObject(mesh);
    bounds.getSize(size);
    // A real riding surface spans a useful XZ area (exclude posts and props).
    if (size.x >= 0.6 && size.z >= 0.6) meshes.push(mesh);
  });
  const ray = new THREE.Raycaster();
  const normalMatrix = new THREE.Matrix3();
  const faceNormal = new THREE.Vector3();
  const surfacePoint = new THREE.Vector3(), supportNormal = new THREE.Vector3();
  const start = new THREE.Vector3();
  const count = Math.max(2,Math.min(20,Math.trunc(samplesPerAxis)||7));
  const issues = [];
  let sampled=0, visualSamples=0, matching=0, unsupported=0, heightMismatch=0;
  for(let regionIndex=0;regionIndex<playableRegions.length;regionIndex++){
    const region=playableRegions[regionIndex]||{};
    const { minX,maxX,minZ,maxZ }=region;
    if (![minX,maxX,minZ,maxZ].every(Number.isFinite) || maxX<=minX || maxZ<=minZ) continue;
    for(let xi=0;xi<count;xi++)for(let zi=0;zi<count;zi++){
      const x=minX+(xi+.5)*(maxX-minX)/count;
      const z=minZ+(zi+.5)*(maxZ-minZ)/count;
      sampled++;
      start.set(x,originHeight,z);
      ray.set(start,DOWN);ray.far=originHeight+30;
      const hits=ray.intersectObjects(meshes,false);
      const visual=hits.find(hit=>{
        if (!hit.face) return false;
        normalMatrix.getNormalMatrix(hit.object.matrixWorld);
        faceNormal.copy(hit.face.normal).applyNormalMatrix(normalMatrix).normalize();
        // Collision probing intentionally tolerates reversed GLB winding.
        // The read-only audit must use the same convention or silently miss
        // entire backwards-wound ramps when measuring coverage.
        return Math.abs(faceNormal.y)>=0.46 && Number.isFinite(hit.point.y);
      });
      if (!visual) continue;
      visualSamples++;
      // Restrict the support search to the *same* piece of physical flooring.
      // A floor two metres below an authored ramp does not count as covered.
      start.set(x,visual.point.y+0.16,z);
      const support=collision.rayRideable(start,DOWN,0.16+tolerance,surfacePoint,supportNormal);
      let issue=null, delta=null;
      if (!support) {unsupported++;issue='noSupport';}
      else {
        delta=Math.abs(surfacePoint.y-visual.point.y);
        if (delta>tolerance+EPS) {heightMismatch++;issue='heightMismatch';}
        else matching++;
      }
      if(issue && issues.length<maxFindings)issues.push({
        region:regionIndex,kind:issue,
        x:Math.round(x*100)/100,z:Math.round(z*100)/100,
        visualY:Math.round(visual.point.y*100)/100,
        collisionY:support?Math.round(surfacePoint.y*100)/100:null,
        gap:delta===null?null:Math.round(delta*100)/100,
      });
    }
  }
  return { sampled, visualSamples, matching, unsupported, heightMismatch,
    coverageRatio:visualSamples?Math.round(1000*matching/visualSamples)/1000:null,
    visualMeshCount:meshes.length, findings:issues };
}
