import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { ExtendedTriangle, MeshBVH } from 'three-mesh-bvh';

/** Spatial candidates without duplicating long triangles into octree children.
 * Structural walls retain the Three.js contact solver; thin rails use the
 * finite distance to their triangles instead of a one-sided plane test. */
export class BlockTriangleIndex {
  constructor() {
    this.triangles = [];
    this.narrowPhase = new Octree();
    this.queryBounds = new THREE.Box3();
    this._railTriangle = new ExtendedTriangle();
    this._railSegment = new THREE.Line3();
    this._railPlane = new THREE.Plane();
    this._railPoint = new THREE.Vector3();
    this._axisPoint = new THREE.Vector3();
    this._candidates = null;
    this.callbacks = {
      intersectsBounds: box => box.intersectsBox(this.queryBounds),
      intersectsTriangle: (_triangle, index) => {
        this._candidates.push(this.triangles[index]);
        return false;
      },
    };
  }

  addTriangle(triangle) { this.triangles.push(triangle); }

  build() {
    if (!this.triangles.length) return;
    const positions = new Float32Array(this.triangles.length * 9);
    this.triangles.forEach((triangle, i) => {
      triangle.a.toArray(positions, i * 9);
      triangle.b.toArray(positions, i * 9 + 3);
      triangle.c.toArray(positions, i * 9 + 6);
    });
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.tree = new MeshBVH(this.geometry, { indirect: true });
  }

  query(candidates) {
    if (!this.tree) return;
    this._candidates = candidates;
    this.tree.shapecast(this.callbacks);
    this._candidates = null;
  }

  getCapsuleTriangles(capsule, candidates) {
    this.queryBounds.min.copy(capsule.start).min(capsule.end).addScalar(-capsule.radius);
    this.queryBounds.max.copy(capsule.start).max(capsule.end).addScalar(capsule.radius);
    this.query(candidates);
  }

  getSphereTriangles(sphere, candidates) {
    this.queryBounds.min.copy(sphere.center).addScalar(-sphere.radius);
    this.queryBounds.max.copy(sphere.center).addScalar(sphere.radius);
    this.query(candidates);
  }

  triangleCapsuleIntersect(capsule, triangle, rail = false) {
    if (rail) {
      // A long capsule can straddle both sides of a sloped bar's tiny facets.
      // The Octree plane rejection then misses it or reports a penetration
      // deeper than the entire bar. Measure the finite segment/triangle gap.
      const facet = this._railTriangle.copy(triangle);
      const segment = this._railSegment.set(capsule.start, capsule.end);
      triangle.getPlane(this._railPlane);
      let distance;
      if (this._railPlane.intersectLine(segment, this._railPoint)
        && triangle.containsPoint(this._railPoint)) {
        this._axisPoint.copy(this._railPoint);
        distance = 0;
      } else {
        distance = facet.closestPointToSegment(segment, this._railPoint, this._axisPoint);
      }
      if (distance >= capsule.radius) return false;
      const normal = distance > 1e-8
        ? this._axisPoint.clone().sub(this._railPoint).divideScalar(distance)
        : this._railPlane.normal.clone();
      return { normal, point: this._railPoint.clone(), depth: capsule.radius - distance };
    }
    return this.narrowPhase.triangleCapsuleIntersect(capsule, triangle);
  }

  triangleSphereIntersect(sphere, triangle) {
    return this.narrowPhase.triangleSphereIntersect(sphere, triangle);
  }
}
