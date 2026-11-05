import * as THREE from 'three';

const PLANE_NORMAL = new THREE.Vector3(0, 0, 1);
const finite = vector => vector && Number.isFinite(vector.x) &&
  Number.isFinite(vector.y) && Number.isFinite(vector.z);

/** Four soft contact patches, one draw call, no textures or new ground probes.
 * Each patch follows its measured wheel normal, including banks and bowls.
 * Live physics contacts are intentionally hidden during visual-only replay.
 */
export class WheelContactShadows {
  constructor() {
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
      name: 'Wheel contact shading', transparent: true, depthWrite: false,
      depthTest: true, polygonOffset: true, polygonOffsetFactor: -1,
      polygonOffsetUnits: -1, toneMapped: false,
      vertexShader: `
        varying vec2 vContactUv;
        void main() {
          vContactUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec2 vContactUv;
        void main() {
          float radius = length(vContactUv);
          float contact = 1.0 - smoothstep(0.05, 1.0, radius);
          gl_FragColor = vec4(0.025, 0.035, 0.055, contact * contact * 0.30);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, 4);
    this.mesh.name = 'Wheel contact shadows';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.count = 0;
    this.mesh.userData.contactShadow = true;
    this.transform = new THREE.Object3D();
  }

  update(skater) {
    this.mesh.count = 0;
    this.mesh.visible = false;
    if (!skater?.grounded || skater.bailTime > 0 || skater.grind || skater.wallRide) return;
    for (const wheel of skater.boardContact?.state?.contacts || []) {
      if (this.mesh.count === 4) break;
      if (!wheel.valid || !finite(wheel.point) || !finite(wheel.normal) ||
          wheel.normal.lengthSq() < .9) continue;
      // Reject stale contacts after a reset/location change. Physics owns the
      // contact vectors; the presentation only reads them.
      if (!finite(skater.position) || wheel.point.distanceToSquared(skater.position) > 1.5) continue;
      this.transform.position.copy(wheel.point).addScaledVector(wheel.normal, .003);
      this.transform.quaternion.setFromUnitVectors(PLANE_NORMAL, wheel.normal);
      this.transform.scale.set(.29, .29, 1);
      this.transform.updateMatrix();
      this.mesh.setMatrixAt(this.mesh.count++, this.transform.matrix);
    }
    this.mesh.visible = this.mesh.count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
