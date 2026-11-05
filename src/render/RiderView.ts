// Rider presentation. Starts with a built-in placeholder (horned-helmet
// chimp from the title art) and swaps in real GLB models when they load:
// the original skateboard and any rigged humanoid, posed by RigRider IK.
import * as THREE from 'three';
import type { Skater } from '../skater/Skater';
import type { RigRider } from './RigRider';

/** Board length in metres (v1 used ~1.5 m; real decks are ~0.8 m). */
const BOARD_LENGTH = 1.0;

export class RiderView {
  readonly root = new THREE.Group();
  private board = new THREE.Group();
  private boardSpin = new THREE.Group();
  private body = new THREE.Group();
  private basis = new THREE.Matrix4();
  private side = new THREE.Vector3();
  private up = new THREE.Vector3();
  private nose = new THREE.Vector3();
  private targetQuat = new THREE.Quaternion();
  private xAxis = new THREE.Vector3();
  private zAxis = new THREE.Vector3();
  private bailSpin = 0;
  private placeholderBoard: THREE.Object3D[] = [];
  private rig: RigRider | null = null;
  private deckTop = 0.0975;

  constructor() {
    this.root.name = 'Rider';
    const black = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.8 });
    const white = new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.55 });
    const red = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 1.4 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.95 });
    const deckSide = new THREE.MeshStandardMaterial({ color: 0xff3d8b, roughness: 0.6 });
    const wheel = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.4 });
    const truck = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.8, roughness: 0.35 });

    // Board: nose along local -Z (matches skater forward), up +Y.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.025, 0.8), [deckSide, deckSide, grip, deckSide, deckSide, deckSide]);
    deck.position.y = 0.085;
    deck.castShadow = true;
    this.boardSpin.add(deck);
    for (const z of [-0.27, 0.27]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.04), truck);
      t.position.set(0, 0.06, z);
      this.boardSpin.add(t);
      for (const x of [-0.09, 0.09]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12), wheel);
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.028, z);
        this.boardSpin.add(w);
      }
    }
    this.placeholderBoard = [...this.boardSpin.children];
    // Flips rotate around the board's centre, not its wheels.
    this.boardSpin.position.y = 0;
    this.board.add(this.boardSpin);
    this.root.add(this.board);

    // Body (stands sideways on the board like a real skater).
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 6, 12), black);
    torso.position.y = 0.78;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), white);
    head.position.y = 1.2;
    head.castShadow = true;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.185, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), black);
    helmet.position.y = 1.22;
    for (const x of [-0.1, 0.1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.13, 10), black);
      horn.position.set(x, 1.4, 0);
      horn.rotation.z = -Math.sign(x) * 0.5;
      this.body.add(horn);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), red);
      eye.position.set(x * 0.6, 1.2, -0.15);
      this.body.add(eye);
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), black);
      ear.position.set(Math.sign(x) * 0.18, 1.19, 0.02);
      this.body.add(ear);
    }
    for (const z of [-0.17, 0.17]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), black);
      leg.position.set(0, 0.36, z);
      leg.castShadow = true;
      this.body.add(leg);
    }
    this.body.add(torso, head, helmet);
    // Face points to the rider's front (heel side), board nose stays -Z.
    this.body.rotation.y = Math.PI / 2;
    this.root.add(this.body);
  }

  /** Replace the placeholder board with a real board model (any axis, any scale). */
  setBoardModel(model: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    // Long axis becomes the board's Z (nose -Z).
    if (size.x > size.z) model.rotation.y = Math.PI / 2;
    model.scale.multiplyScalar(BOARD_LENGTH / Math.max(size.x, size.z));
    model.updateMatrixWorld(true);
    const placed = new THREE.Box3().setFromObject(model);
    const center = placed.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -placed.min.y, -center.z);
    model.updateMatrixWorld(true);
    model.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Deck top: cast down at the board centre onto the model itself.
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(model, true)[0];
    this.deckTop = hit ? hit.point.y : (placed.max.y - placed.min.y) * 0.7;
    for (const part of this.placeholderBoard) part.visible = false;
    this.boardSpin.add(model);
  }

  /** Replace the placeholder body with a rigged rider (or pass null to restore it). */
  setRider(rig: RigRider | null): void {
    if (this.rig) this.root.remove(this.rig.model);
    this.rig = rig;
    this.body.visible = !rig;
    if (rig) this.root.add(rig.model);
  }

  /** Copy the skater's pose. `position` is the interpolated render position. */
  update(skater: Skater, position: THREE.Vector3, dt: number): void {
    this.root.position.copy(position);

    // Orientation from board nose + board up.
    this.up.copy(skater.boardUp).normalize();
    this.nose.copy(skater.nose);
    this.nose.addScaledVector(this.up, -this.nose.dot(this.up));
    if (this.nose.lengthSq() < 1e-6) this.nose.set(0, 0, -1);
    this.nose.normalize();
    this.side.crossVectors(this.up, this.nose).normalize();
    // Local axes: +X = side, +Y = up, -Z = nose.
    this.basis.makeBasis(this.xAxis.copy(this.side).negate(), this.up, this.zAxis.copy(this.nose).negate());
    this.targetQuat.setFromRotationMatrix(this.basis);
    const sharpness = skater.state === 'ground' || skater.state === 'manual' ? 30 : 18;
    this.root.quaternion.slerp(this.targetQuat, 1 - Math.exp(-sharpness * dt));

    // Board flip animation.
    const flip = skater.air?.flip;
    if (flip) {
      const p = Math.min(1, flip.t / flip.trick.duration);
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      this.boardSpin.position.y = Math.sin(p * Math.PI) * 0.22;
      this.boardSpin.rotation.set(flip.trick.pitch * Math.PI * 2 * e, flip.trick.yaw * Math.PI * 2 * e, flip.trick.roll * Math.PI * 2 * e);
    } else {
      this.boardSpin.position.y = THREE.MathUtils.damp(this.boardSpin.position.y, 0, 20, dt);
      this.boardSpin.rotation.set(0, 0, 0);
    }

    // Body: crouch while charging, tuck for grabs, lean on balance, tumble when bailing.
    const grab = !!skater.air?.grab;
    const crouch = skater.crouch * 0.18 + (grab ? 0.3 : 0) + (skater.state === 'air' ? 0.08 : 0);
    this.body.position.y = THREE.MathUtils.damp(this.body.position.y, -crouch, 14, dt);
    this.board.position.y = THREE.MathUtils.damp(this.board.position.y, grab ? 0.22 : 0, 14, dt);
    const lean = skater.balance ?? 0;
    const manualPitch = skater.manual ? (skater.manual.kind === 'manual' ? -0.28 : 0.28) : 0;
    this.board.rotation.x = THREE.MathUtils.damp(this.board.rotation.x, manualPitch, 12, dt);
    if (skater.state === 'bail') {
      this.bailSpin += dt * 7;
      this.body.rotation.set(0, Math.PI / 2, Math.min(Math.PI / 2, this.bailSpin));
      this.body.position.y = -0.5;
    } else {
      this.bailSpin = 0;
      const tilt = skater.state === 'grind' ? lean * 0.6 : -skater.speed * 0.004;
      this.body.rotation.set(skater.manual ? lean * 0.4 : 0, Math.PI / 2, skater.grind ? 0 : tilt);
      if (skater.grind) this.body.rotation.x = lean * 0.6;
    }
    if (this.rig) {
      this.rig.pose(this.root, this.deckTop + this.board.position.y, {
        crouch: skater.crouch + (skater.state === 'air' ? 0.35 : 0) + (skater.state === 'grind' ? 0.25 : 0),
        grab, lean, air: skater.state === 'air',
        bail: skater.state === 'bail' ? Math.min(1, this.bailSpin / 1.5) : 0,
        switchStance: skater.switchStance,
      });
    }
  }
}
