// Static collision world. Skating is a custom kinematic controller, so Rapier
// is used for what it is best at: fast, exact ray queries against park meshes.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export interface RayHit {
  point: THREE.Vector3;
  /** Surface normal, always facing back toward the ray origin. */
  normal: THREE.Vector3;
  distance: number;
}

let rapierReady: Promise<void> | null = null;
export function initPhysics(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  }

  static async create(): Promise<PhysicsWorld> {
    await initPhysics();
    return new PhysicsWorld();
  }

  /** Add a static triangle mesh. The geometry must already be in world space. */
  addGeometry(geometry: THREE.BufferGeometry): void {
    const position = geometry.getAttribute('position');
    const vertices = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      vertices[i * 3] = position.getX(i);
      vertices[i * 3 + 1] = position.getY(i);
      vertices[i * 3 + 2] = position.getZ(i);
    }
    let indices: Uint32Array;
    if (geometry.index) indices = Uint32Array.from(geometry.index.array as ArrayLike<number>);
    else indices = Uint32Array.from({ length: position.count }, (_, i) => i);
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices));
  }

  addBox(center: THREE.Vector3, halfExtents: THREE.Vector3): void {
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setTranslation(center.x, center.y, center.z),
    );
  }

  /** Must be called once after all colliders are added so queries see them. */
  finalize(): void {
    this.world.step();
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): RayHit | null {
    this.ray.origin = { x: origin.x, y: origin.y, z: origin.z };
    this.ray.dir = { x: direction.x, y: direction.y, z: direction.z };
    const hit = this.world.castRayAndGetNormal(this.ray, maxDistance, true);
    if (!hit) return null;
    const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
    if (normal.dot(direction) > 0) normal.negate();
    return {
      point: origin.clone().addScaledVector(direction, hit.timeOfImpact),
      normal: normal.normalize(),
      distance: hit.timeOfImpact,
    };
  }

  dispose(): void {
    this.world.free();
  }
}
