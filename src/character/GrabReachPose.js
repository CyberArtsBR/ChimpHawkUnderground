import * as THREE from 'three';

const deckSurfaces = new WeakMap();

/** Optional loadout warmup: build mesh triangles and all authored grab sample
 * points before the rider enters gameplay. No pose or physical state changes. */
export function warmGrabDeckSurface(board) {
  if (!board?.model) return;
  const width = (board.contactRig?.deckWidth || .42) / .42;
  const length = (board.contactRig?.deckLength || 1.1) / 1.1;
  const rail = (board.contactRig?.deckWidth || .42) * .5;
  const end = (board.contactRig?.deckLength || 1.1) * .5;
  for (const sign of [-1, 1]) {
    for (const z of [0, -.04, .04, -.08, .08, -.16, .16])
      grabDeckSurface(board, rail * sign, z * length);
    for (const x of [0, -.08, .08, -.09, .09]) grabDeckSurface(board, x * width, end * sign);
    for (const z of [-.35, .35]) grabDeckSurface(board, .08 * sign * width, z * length);
  }
}

/** Cache the actual deck triangles in board coordinates, independently of its
 * current presentation pose. The closest point lies on the supplied mesh. */
export function grabDeckSurface(board, x, z) {
  if (!board?.model) return null;
  let surface = deckSurfaces.get(board.model);
  if (!surface) {
    board.root.updateWorldMatrix(true, true);
    board.model.updateWorldMatrix(true, true);
    const inverse = board.model.parent === board.root ? board.root.matrixWorld.clone().invert() : new THREE.Matrix4();
    const triangles = [];
    board.model.traverse(mesh => {
      if (!mesh.isMesh || !/^Board1/i.test(mesh.name)) return;
      const positions = mesh.geometry.attributes.position, indices = mesh.geometry.index;
      const transform = inverse.clone().multiply(mesh.matrixWorld);
      for (let i = 0; i < (indices?.count || positions.count); i += 3) {
        const points = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j).applyMatrix4(transform));
        triangles.push(new THREE.Triangle(...points));
      }
    });
    surface = { triangles, points: new Map() };
    deckSurfaces.set(board.model, surface);
  }
  const key = `${x}/${z}`;
  if (surface.points.has(key)) return surface.points.get(key).clone();
  const desired = new THREE.Vector3(x, (board.contactRig.deckTopY - board.deckHeight) + .003, z);
  let closest = null, minimum = Infinity;
  for (const triangle of surface.triangles) {
    const point = triangle.closestPointToPoint(desired, new THREE.Vector3());
    const distance = point.distanceToSquared(desired);
    if (distance < minimum) { closest = point; minimum = distance; }
  }
  if (closest) surface.points.set(key, closest);
  return closest?.clone() || null;
}

/** A bounded upper-body gather for a named airborne deck reach. The pelvis
 * hinge runs before leg IK; the spine curl lowers the shoulder without moving
 * either planted ankle or changing a bone length. */
export function grabReachPose(weight, reachingSides, enabled = true, { direction = 1, compact = 0, endGrab = false } = {}) {
  const amount = enabled && reachingSides.length
    ? THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1) : 0;
  return {
    pelvisHinge: ((endGrab ? .25 : .45) + .15 * compact) * amount * direction,
    spineCurl: ((endGrab ? .30 : .45) + .15 * compact) * amount * direction,
    shoulderBend: ((endGrab ? .75 : .35) + .15 * compact) * amount,
    weight: amount,
  };
}

/** Keep elbow slack proportional to the loaded arm. The former fixed 3.5 cm
 * reserve consumed 8–10% of compact rigs' entire reach. This still leaves a
 * real bend and never relocates the requested rail to manufacture contact. */
export function grabReachMargin(armLength) {
  return THREE.MathUtils.clamp(armLength * .035, .01, .025);
}

/** Locate a palmar surface patch in the supplied mesh, in its own hand frame.
 * Finger bases define its axes; skin weights exclude cuffs, forearms and tips.
 * Unsupported hands keep the existing wrist reach instead of a guessed offset. */
export function calibrateGrabPalms(model, hands) {
  // SkinnedMesh.updateMatrixWorld also refreshes its attached bind inverse;
  // updateWorldMatrix alone leaves deformed vertex queries in the old frame.
  model.updateMatrixWorld(true);
  const palms = {};
  for (const side of ['l', 'r']) {
    const hand = hands[side];
    if (!hand) continue;
    const finger = prefix => hand.children.find(child => child.name.toLowerCase().startsWith(prefix)
      || child.name.toLowerCase().endsWith(`hand${prefix.split('_')[0]}1`));
    const middle = finger('middle_01'), index = finger('index_01'), pinky = finger('pinky_01');
    if (!middle || !index || !pinky) continue;
    const forward = middle.position.clone().normalize();
    const across = index.position.clone().sub(pinky.position).projectOnPlane(forward).normalize();
    const normal = forward.clone().cross(across).normalize().multiplyScalar(side === 'l' ? 1 : -1);
    const length = middle.position.length();
    const candidates = [];
    model.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const skin = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
      if (!skin || !weights) return;
      mesh.skeleton.update();
      for (let vertex = 0; vertex < weights.count; vertex++) {
        let weight = 0;
        for (let component = 0; component < 4; component++)
          if (mesh.skeleton.bones[skin.getComponent(vertex, component)] === hand)
            weight += weights.getComponent(vertex, component);
        if (weight < .60) continue;
        const point = hand.worldToLocal(mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
        const along = point.dot(forward);
        if (along > length * .18 && along < length * .82)
          candidates.push({ mesh, vertex, point, depth: point.dot(normal) });
      }
    });
    candidates.sort((a, b) => b.depth - a.depth);
    const patch = candidates.slice(0, Math.max(1, Math.ceil(candidates.length * .30)));
    if (patch.length < 2) continue;
    const point = patch.reduce((sum, sample) => sum.add(sample.point), new THREE.Vector3()).divideScalar(patch.length);
    palms[side] = { point, forward, normal, samples: patch.map(({ mesh, vertex }) => ({ mesh, vertex })) };
  }
  return palms;
}

/** Face the real palm pad into the deck edge, with fingers pointing down it.
 * This returns a hand rotation, never a relocated board/contact target. */
export function grabPalmOrientation(palm, outward, deckUp) {
  const normal = outward.clone().projectOnPlane(deckUp).negate().normalize();
  if (!palm || normal.lengthSq() < .5) return null;
  const forward = deckUp.clone().negate().normalize();
  const localSide = palm.forward.clone().cross(palm.normal).normalize();
  const worldSide = forward.clone().cross(normal).normalize();
  const local = new THREE.Matrix4().makeBasis(palm.forward, palm.normal, localSide);
  const world = new THREE.Matrix4().makeBasis(forward, normal, worldSide);
  return new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.invert())).normalize();
}

/** Derive flexion from the supplied phalanges, not assumed exporter axes.
 * Only articulated fingers are authored; missing chains remain untouched. */
export function calibrateGrabFingers(hand, palm) {
  if (!hand || !palm) return [];
  hand.updateWorldMatrix(true, true);
  const normal = palm.normal.clone().applyQuaternion(hand.getWorldQuaternion(new THREE.Quaternion()));
  const joints = [];
  for (const root of hand.children) {
    if (!root.isBone || !/(index|middle|ring|pinky)/i.test(root.name)) continue;
    let bone = root;
    for (let depth = 0; depth < 3 && bone; depth++) {
      const child = bone.children.find(node => node.isBone);
      if (!child) break;
      const direction = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
      const axis = direction.cross(normal);
      if (axis.lengthSq() > .01) {
        axis.normalize().applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
        joints.push({ bone, rest: bone.quaternion.clone(), flex: new THREE.Quaternion().setFromAxisAngle(axis, [.48, .68, .42][depth]) });
      }
      bone = child;
    }
  }
  return joints;
}

const fingerBlend = new THREE.Quaternion();
export function applyGrabFingers(joints, weight) {
  const amount = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
  for (const joint of joints || []) {
    fingerBlend.identity().slerp(joint.flex, amount);
    joint.bone.quaternion.copy(joint.rest).multiply(fingerBlend);
  }
}
