// Placeholder Chimp Hawk rider for the greybox phase: black hoodie, white
// face, horned helmet, red eyes (from the title art), on a readable board.
// Phase 3 swaps this for the rigged Blender model; the interface stays.
import * as THREE from 'three';
import type { Skater } from '../skater/Skater';

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
  }
}
