import * as THREE from 'three';

const STATIC_LIP_COLOR = 0x35f2ff;
const STATIC_BOUNDS_COLOR = 0xffb52e;
const ACTIVE_LIP_COLOR = 0xffffff;
const TANGENT_COLOR = 0xffd65a;
const INWARD_COLOR = 0x59ff7d;
const OUTWARD_COLOR = 0xff5b7f;
const NORMAL_COLOR = 0x6fa8ff;
const RETURN_COLOR = 0xf368ff;
const EPS = 1e-8;

function finiteVector(value) {
  return Boolean(value
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z));
}

function disposeObject(object) {
  object?.geometry?.dispose?.();
  const materials = Array.isArray(object?.material) ? object.material : [object?.material];
  for (const material of materials) material?.dispose?.();
}

function lineFromPoints(points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 1000;
  return line;
}

function paddedBounds(bounds) {
  if (!finiteVector(bounds?.min) || !finiteVector(bounds?.max)) return null;
  const box = new THREE.Box3(bounds.min.clone(), bounds.max.clone());
  // Coping paths are often flat in Y. Give the helper a small visible thickness.
  if (Math.abs(box.max.y - box.min.y) < 0.04) {
    box.min.y -= 0.02;
    box.max.y += 0.02;
  }
  return box;
}

function safeDirection(value) {
  if (!finiteVector(value) || value.lengthSq() < EPS) return null;
  return value.clone().normalize();
}

/** Read-only summary used by QA/tests and exposed through window.streetSkate. */
export function transitionDebugSummary(controller) {
  const transitions = controller?.transitions || [];
  return {
    count: transitions.length,
    ids: transitions.map(transition => transition.id),
    vertIds: transitions.filter(transition => transition.supportsVert).map(transition => transition.id),
  };
}

/**
 * World-space transition authoring overlay for ?debug=1.
 *
 * Static:
 *  - cyan authored lip paths
 *  - amber authored bounds
 *
 * Active candidate / transitionAir frame:
 *  - white lip marker
 *  - yellow coping tangent
 *  - green ramp inward
 *  - red deck outward
 *  - blue surface normal
 *  - magenta return target
 *
 * This class is presentation/debug only and never repairs or mutates gameplay.
 */
export class TransitionDebugVisualizer {
  constructor(controller) {
    this.controller = controller;
    this.group = new THREE.Group();
    this.group.name = 'transition-debug-overlay';
    this.staticGroup = new THREE.Group();
    this.staticGroup.name = 'transition-debug-static';
    this.activeGroup = new THREE.Group();
    this.activeGroup.name = 'transition-debug-active';
    this.group.add(this.staticGroup, this.activeGroup);

    this._markerGeometry = new THREE.SphereGeometry(0.075, 10, 8);
    this._lipMarker = new THREE.Mesh(
      this._markerGeometry,
      new THREE.MeshBasicMaterial({ color: ACTIVE_LIP_COLOR, depthTest: false }),
    );
    this._returnMarker = new THREE.Mesh(
      this._markerGeometry,
      new THREE.MeshBasicMaterial({ color: RETURN_COLOR, depthTest: false }),
    );
    this._lipMarker.renderOrder = 1002;
    this._returnMarker.renderOrder = 1002;

    this._arrows = {
      tangent: new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1.15, TANGENT_COLOR, 0.18, 0.09),
      inward: new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1.15, INWARD_COLOR, 0.18, 0.09),
      outward: new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), 1.15, OUTWARD_COLOR, 0.18, 0.09),
      normal: new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.05, NORMAL_COLOR, 0.18, 0.09),
    };
    for (const arrow of Object.values(this._arrows)) {
      arrow.line.material.depthTest = false;
      arrow.cone.material.depthTest = false;
      arrow.renderOrder = 1001;
      this.activeGroup.add(arrow);
    }
    this.activeGroup.add(this._lipMarker, this._returnMarker);
    this.activeGroup.visible = false;

    this.buildStatic();
  }

  buildStatic() {
    while (this.staticGroup.children.length) {
      const child = this.staticGroup.children.pop();
      disposeObject(child);
    }

    for (const transition of this.controller?.transitions || []) {
      const lipPath = (transition.lipPath || []).filter(finiteVector).map(point => point.clone());
      if (lipPath.length >= 2) {
        const lip = lineFromPoints(lipPath, STATIC_LIP_COLOR, transition.supportsVert ? 0.95 : 0.45);
        lip.name = `transition-lip:${transition.id}`;
        lip.userData.transitionId = transition.id;
        lip.userData.transitionType = transition.type;
        this.staticGroup.add(lip);
      }

      const bounds = paddedBounds(transition.bounds);
      if (bounds) {
        const helper = new THREE.Box3Helper(bounds, STATIC_BOUNDS_COLOR);
        helper.name = `transition-bounds:${transition.id}`;
        helper.userData.transitionId = transition.id;
        helper.material.depthTest = false;
        helper.material.transparent = true;
        helper.material.opacity = transition.supportsVert ? 0.6 : 0.28;
        helper.renderOrder = 999;
        this.staticGroup.add(helper);
      }
    }
  }

  update(skater) {
    const candidate = skater?.transitionAir?.frame
      || skater?.pendingBoardTransition
      || null;
    if (!candidate || !finiteVector(candidate.lipPoint)) {
      this.activeGroup.visible = false;
      return;
    }

    this.activeGroup.visible = true;
    const origin = candidate.lipPoint;
    this._lipMarker.position.copy(origin);

    const returnTarget = candidate.returnTarget;
    this._returnMarker.visible = finiteVector(returnTarget);
    if (this._returnMarker.visible) this._returnMarker.position.copy(returnTarget);

    const entries = [
      ['tangent', candidate.copingTangent],
      ['inward', candidate.rampInward],
      ['outward', candidate.deckOutward],
      ['normal', candidate.surfaceNormal],
    ];
    for (const [key, value] of entries) {
      const direction = safeDirection(value);
      const arrow = this._arrows[key];
      arrow.visible = Boolean(direction);
      if (!direction) continue;
      arrow.position.copy(origin);
      arrow.setDirection(direction);
    }
  }

  dispose() {
    this.staticGroup.traverse(disposeObject);
    this._lipMarker.material.dispose();
    this._returnMarker.material.dispose();
    this._markerGeometry.dispose();
    for (const arrow of Object.values(this._arrows)) {
      arrow.line.geometry.dispose();
      arrow.line.material.dispose();
      arrow.cone.geometry.dispose();
      arrow.cone.material.dispose();
    }
    this.group.removeFromParent();
  }
}
