import { FlatlandMotion, flatlandDeckPose } from '../character/FlatlandMotion.js';
import { WHEELS, graphicTexture, normalizeBoardStyle, readBoardStyle, saveBoardStyle } from './BoardStyles.js';
import { FlipWind } from './FlipWind.js';
import { installHalfPipeFinish } from './HalfPipeFinish.js';
import * as THREE from 'three';
const IDENTITY_Q = new THREE.Quaternion();
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PRODUCTION_BOARD_CONTACT_RIG } from '../game/SkateboardContactRig.js';
import { flipTurns, impossibleMotion, popMotion, GRAB_POSES } from '../character/TrickMotion.js';
import { DEFAULT_BOARD_FINISH, SKATEBOARD_FINISHES } from './BoardFinishes.js';
import { deckEmissionForGlow } from './BoardGlow.js';

const clamp = THREE.MathUtils.clamp;

export class StreetBoard {
  constructor(url) {
    this.url = url;
    this.root = new THREE.Group();
    this.root.name = 'street-board';
    this.wind = new FlipWind(this.root);
    this.flatlandMotion = new FlatlandMotion();
    this._rotation = new THREE.Euler();
    this._poseQuaternion = new THREE.Quaternion();
    this.poseReady = false;
    // Persistent equivalent board yaw prevents a completed shove-it from unwinding.
    this._yawHold = 0;
    this._wasFlipping = false;
    this._lastFlipYaw = 0;
    this._lastFlipProgress = 0;
    this.contactRig = { ...PRODUCTION_BOARD_CONTACT_RIG };
    this.deckGlowMaterials = new Set();
    this.style = readBoardStyle();
    this.graphicTexture = null;
  }

  /** Wheel colour and deck-top character art (see BoardStyles.js). */
  setStyle(style = {}, { persist = true } = {}) {
    this.style = normalizeBoardStyle({ ...this.style, ...style });
    if (persist) saveBoardStyle(this.style);
    if (!this.model) return;
    const wheel = WHEELS[this.style.wheels];
    if (this.graphicIndex !== this.style.graphic) {
      this.graphicTexture?.dispose();
      this.graphicTexture = graphicTexture(this.style.graphic);
      this.graphicIndex = this.style.graphic;
    }
    for (const material of this.deckGlowMaterials) {
      const u = material.userData.halfPipeFinish;
      if (!u) continue;
      u.hpGraphic.value = this.graphicTexture;
      u.hpGraphicOn.value = this.graphicTexture ? 1 : 0;
    }
    this.model.traverse(mesh => {
      if (!mesh.isMesh || !/pPipe(?:9|13)/i.test(mesh.name)) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.userData.stockColor ||= material.color.clone();
        material.color.copy(wheel.color ? new THREE.Color(wheel.color) : material.userData.stockColor);
      }
    });
  }

  deriveContactRig() {
    this.model.updateMatrixWorld(true);
    const wheelMeshes = [];
    let deckMesh = null;
    this.model.traverse(object => {
      if (!object.isMesh) return;
      if (/^Board1/i.test(object.name)) deckMesh ||= object;
      if (/pPipe(?:9|13)/i.test(object.name)) wheelMeshes.push(object);
    });
    if (!deckMesh || wheelMeshes.length < 4) return { ...PRODUCTION_BOARD_CONTACT_RIG };

    const deckBox = new THREE.Box3().setFromObject(deckMesh);
    const deckSize = deckBox.getSize(new THREE.Vector3());
    const deckCenter = deckBox.getCenter(new THREE.Vector3());
    const wheels = wheelMeshes.map(mesh => {
      const box = new THREE.Box3().setFromObject(mesh);
      return { box, center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
    }).sort((a, b) => b.size.y - a.size.y).slice(0, 4);

    const front = wheels.filter(w => w.center.z < deckCenter.z);
    const rear = wheels.filter(w => w.center.z >= deckCenter.z);
    const left = wheels.filter(w => w.center.x < deckCenter.x);
    const right = wheels.filter(w => w.center.x >= deckCenter.x);
    if (!front.length || !rear.length || !left.length || !right.length) return { ...PRODUCTION_BOARD_CONTACT_RIG };
    const average = (items, read) => items.reduce((sum, item) => sum + read(item), 0) / items.length;
    const wheelRadius = average(wheels, w => (w.size.y + w.size.z) * 0.25);
    const yOffset = this.deckHeight;
    const noseInset = Math.min(0.018, deckSize.z * 0.03);

    return {
      source: this.url,
      deckLength: deckSize.z,
      deckWidth: deckSize.x,
      center: [deckCenter.x, deckCenter.y + yOffset, deckCenter.z],
      frontTruckZ: average(front, w => w.center.z),
      rearTruckZ: average(rear, w => w.center.z),
      leftWheelX: average(left, w => w.center.x),
      rightWheelX: average(right, w => w.center.x),
      wheelRadius,
      wheelContactY: average(wheels, w => w.box.min.y + yOffset),
      deckUndersideY: deckBox.min.y + yOffset,
      deckTopY: deckBox.max.y + yOffset,
      noseZ: deckBox.min.z + noseInset,
      tailZ: deckBox.max.z - noseInset,
    };
  }

  prepareContactGeometry(model) {
    this.model = model;
    // Match Half Pipe's deck-only 18% extension: trucks/wheelbase stay intact.
    this.model.traverse(o => { if (o.isMesh && /^Board1/i.test(o.name)) o.scale.x *= 1.18; });
    const original = new THREE.Box3().setFromObject(this.model);
    // 20% larger deck with fully remeasured wheel/support geometry.
    this.model.scale.setScalar((1.26 * 1.18) / original.getSize(new THREE.Vector3()).x);
    this.model.rotation.y = Math.PI / 2;
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    this.deckHeight = -original.min.y * this.model.scale.x;
    this.model.position.set(-center.x, -box.min.y - this.deckHeight, -center.z);
    this.model.updateMatrixWorld(true);
    this.contactRig = this.deriveContactRig();
    // Cache a conservative rigid envelope once, rather than rescanning mesh
    // vertices in every manual/handstand frame. Coordinates are board-root local.
    this.supportCorners=[];
    this.model.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
      mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
        this.supportCorners.push(new THREE.Vector3(x,y,z).applyMatrix4(mesh.matrixWorld));
    });
    return this.contactRig;
  }

  async load({ persist = true } = {}) {
    this.prepareContactGeometry((await new GLTFLoader().loadAsync(this.url)).scene);
    this.root.add(this.model);
    // A board must never inherit transparent/blended faces from the imported
    // GLB. Both sides of the deck, trucks and wheels must write real depth;
    // especially important during flips and on pale warehouse ramps.
    this.model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const makeOpaque = source => {
        const m = source.clone();
        m.transparent = false; m.opacity = 1; m.alphaMap = null;
        m.alphaTest = 0; m.alphaHash = false; m.depthTest = true;
        m.depthWrite = true; m.side = THREE.DoubleSide;
        if ('transmission' in m) m.transmission = 0;
        m.needsUpdate = true;
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(makeOpaque) : makeOpaque(o.material);
    });
    this.root.userData.source = 'CyberArtsBR/Skate skateboard.glb';
    this.root.userData.contactRig = this.contactRig;
    this.wheelGlow = []; this.wheelGlowAmount = 0;
    this.model.traverse(o => {
      if (!o.isMesh || !/pPipe(?:9|13)/i.test(o.name)) return;
      const own = source => { const m = source.clone();
        if (m.emissive) this.wheelGlow.push({ material: m, base: m.emissive.clone(), intensity: m.emissiveIntensity || 0 });
        return m; };
      o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
    });
    let finish = DEFAULT_BOARD_FINISH;
    try {
      const saved = localStorage.getItem('streetskate.boardFinish');
      if (saved !== null && Number.isFinite(Number(saved))) finish = Number(saved);
    } catch {}
    this.setFinish(finish, { persist });
    this.setStyle(this.style, { persist: false });
    return this;
  }

  setFinish(index = 0, { persist = true } = {}) {
    if (!Number.isFinite(index)) index = 0;
    this.finishIndex = ((Math.trunc(index) % SKATEBOARD_FINISHES.length) + SKATEBOARD_FINISHES.length) % SKATEBOARD_FINISHES.length;
    const finish = SKATEBOARD_FINISHES[this.finishIndex];
    if (!this.model) return;
    this.deckGlowMaterials.clear();
    this.root.updateWorldMatrix(true, true);
    const inverse = this.root.matrixWorld.clone().invert();
    this.model.traverse(mesh => {
      if (!mesh.isMesh || !/^Board1/i.test(mesh.name)) return;
      if (!mesh.userData.gradientOwned) {
        mesh.geometry = mesh.geometry.clone();
        const own = material => {
          const m = material.clone();
          // GLB deck materials may use BLEND/alpha for their original graphic.
          // A new vertex-color paint is solid: retaining the source alpha made
          // the deck and grip translucent, with the trucks showing through.
          m.map = null;
          m.alphaMap = null;
          m.transparent = false;
          m.opacity = 1;
          m.alphaTest = 0;
          m.alphaHash = false;
          m.depthTest = true;
          m.depthWrite = true;
          m.side = THREE.DoubleSide;
          m.transmission = 0;
          m.vertexColors = true;
          m.color.set('#ffffff');
          m.roughness = 0.46;
          m.emissive.set('#ffffff');
          m.emissiveIntensity = 0.48;
          return m;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
        mesh.userData.gradientOwned = true;
      }
      const transform = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
      const positions = mesh.geometry.attributes.position, normals = mesh.geometry.attributes.normal;
      const colors = new Float32Array(positions.count * 3), p = new THREE.Vector3(), n = new THREE.Vector3();
      const bounds = new THREE.Box3();
      for (let i = 0; i < positions.count; i++) bounds.expandByPoint(p.fromBufferAttribute(positions, i).applyMatrix4(transform));
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        material.vertexColors = false;
        const u = material.userData.halfPipeFinish || installHalfPipeFinish(material, transform, bounds);
        u.hpTail.value.setHex(finish.stops[0]); u.hpMiddle.value.setHex(finish.stops[1]); u.hpNose.value.setHex(finish.stops[2]);
        // Keep the full-gradient deck opaque in every preset. Emission follows
        // the selected finish; its contrast remains visible even without bloom.
        material.emissive.setHex(finish.stops[1]);
        material.emissiveIntensity = deckEmissionForGlow(this.wheelGlowAmount);
        this.deckGlowMaterials.add(material);
        material.transparent = false; material.opacity = 1;
        material.depthWrite = true; material.side = THREE.DoubleSide;
        material.needsUpdate = true;
      }
    });
    if (persist) try { localStorage.setItem('streetskate.boardFinish', String(this.finishIndex)); } catch {}
    // New deck materials pick up the current deck art.
    if (this.style) this.setStyle(this.style, { persist: false });
  }

  pointWorld(x, y, z, target = new THREE.Vector3()) {
    target.set(x, y, z);
    return this.root.localToWorld(target);
  }

  resetPresentation() {
    this.wind.reset();
    this.flatlandMotion.reset();
    this.manualSupport = false;
    this.poseReady = false;
    this._yawHold = 0;
    this._wasFlipping = false;
    this._lastFlipYaw = 0;
    this._lastFlipProgress = 0;
    this._flipEntryPending = false;
    this._flipEntry?.identity();
  }

  catchFlip(flip) {
    if(!flip)return;
    this._lastFlipYaw=flipTurns({...flip,progress:1}).yaw*Math.PI*2;
    this._lastFlipProgress=1;
    this._wasFlipping=true;
  }

  update({ presentation = null, airborne = false, flipState = null, grabState = null, grabWeight = 0, manual = null, manualBalance = 0,
    grind = null, grindBalance = 0, wallRide = null, bail = false, bailProgress = 0,
    stance = 1, flatland = null, time = 0, speedRatio = 0, dt = 1 / 60, supportPlane = null }) {
    this.supportPlane=supportPlane;
    const glowTarget = bail ? 0 : THREE.MathUtils.smoothstep(clamp(speedRatio, 0, 1), .25, .85);
    this.wheelGlowAmount = (this.wheelGlowAmount || 0) + (glowTarget - (this.wheelGlowAmount || 0)) * (1 - Math.exp(-8 * Math.max(0, dt)));
    const glowColor = new THREE.Color(SKATEBOARD_FINISHES[this.finishIndex || 0].stops[1]);
    for (const entry of this.wheelGlow || []) {
      entry.material.emissive.copy(entry.base).lerp(glowColor, this.wheelGlowAmount);
      entry.material.emissiveIntensity = entry.intensity + 2.4 * this.wheelGlowAmount;
    }
    // The same smoothed speed envelope brightens the opaque deck without
    // touching the wheel effect or the board's collision representation.
    const deckGlow = deckEmissionForGlow(this.wheelGlowAmount);
    for (const material of this.deckGlowMaterials) material.emissiveIntensity = deckGlow;
    const grindPose = grind?.profile?.presentation;
    this.root.position.set(0,
      this.deckHeight + (airborne ? 0.025 : 0) + (grindPose?.visualLift || 0), 0);
    const grabPose = GRAB_POSES[grabState?.name] || [0, 0, 0];
    if (!flipState && this._wasFlipping) {
      // 180/360 yaw is physically equivalent for a symmetrical deck; keep the
      // attained visual orientation instead of visibly spinning backwards.
      if (!bail && this._lastFlipProgress >= 0.90) {
        const halfTurns = Math.round(this._lastFlipYaw / Math.PI);
        this._yawHold = THREE.MathUtils.euclideanModulo(this._yawHold + halfTurns * Math.PI, Math.PI * 2);
      }
      this._wasFlipping = false;
    }
    // Nose/Tail switch grabs reach the opposite end with the opposite hand.
    // Mirror only these end-lifting pitches; the other authored grab tilts
    // retain their rail/one-foot pose and physical contact geometry stays put.
    const switchEndGrab = airborne && stance < 0
      && (grabState?.name === 'Nosegrab' || grabState?.name === 'Tailgrab');
    let x = grabPose[0] * grabWeight * (switchEndGrab ? -1 : 1);
    let y = grabPose[1] * grabWeight + this._yawHold;
    let z = grabPose[2] * grabWeight;

    if (flipState) {
      const turns = flipTurns(flipState);
      if (!this._wasFlipping && this.poseReady && !bail) this._flipEntryPending = true;
      this._wasFlipping = true;
      this._lastFlipYaw = turns.yaw * Math.PI * 2;
      this._lastFlipProgress = flipState.progress ?? 0;
      x += turns.pitch * Math.PI * 2;
      y += turns.yaw * Math.PI * 2;
      z += turns.roll * Math.PI * 2;
    }
    // The ollie's tail-pop tilt keeps easing out when a flip starts during it.
    // Dropping it on the flip's first frame snapped the deck ~14 degrees.
    if (airborne && !grabState && !bail) x += popMotion(presentation?.popProgress ?? 1);
    // Keep the approved flatland support angle while raising the plain manual.
    const flatlandWeight = Object.values(this.flatlandMotion.weights).reduce((sum, weight) => sum + weight, 0);
    if (manual === 'manual') x -= 0.30 - 0.14 * flatlandWeight + clamp(manualBalance, -1, 1) * 0.035;
    if (manual === 'noseManual') x += 0.30 - clamp(manualBalance, -1, 1) * 0.035;
    if (grindPose) {
      x += grindPose.pitch || 0;
      y += grindPose.yaw || 0;
      z += grindPose.roll || 0;
      z += clamp(grindBalance, -1, 1) * 0.04;
    }
    if (wallRide) z += 0.12;

    this.flatlandMotion.update(bail || airborne ? null : flatland, dt);
    const flatPose = flatlandDeckPose(this.flatlandMotion);
    x += flatPose.pitch;
    y += flatPose.yaw;
    z += flatPose.roll;
    this.root.position.y += flatPose.lift;
    this.riderHeight = this.root.position.y;
    // A grab gathers the deck toward the chest. The rider keeps its body
    // reference while foot IK follows this cosmetic lift; physics is untouched.
    this.grabLift = !bail && !flipState && airborne && grabState ? .18 * clamp(grabWeight,0,1) : 0;
    this.root.position.y += this.grabLift;

    if (bail) {
      const p = clamp(bailProgress, 0, 1);
      this.root.position.x += (stance < 0 ? -1 : 1) * (0.08 + p * 0.28);
      this.root.position.y += 0.05 + p * 0.2;
      this.root.position.z += p * 0.12;
      x += p * 1.7;
      y += p * 1.1;
      z += p * 2.2;
    }

    this._rotation.set(x, y, z);
    this._poseQuaternion.setFromEuler(this._rotation);
    // Flips follow their complete rotation trajectory exactly. Ordinary pose
    // changes crossfade so manuals/grinds don't snap to a different deck angle.
    if (flipState && !bail && this.poseReady) {
      // The deck was still easing toward its ollie pose when the flip began.
      // Carry that small lag into the flip and ease it out at the same rate,
      // instead of snapping (up to ~13 degrees) on the flip's first frame.
      this._flipEntry ||= new THREE.Quaternion();
      if (this._flipEntryPending) {
        this._flipEntry.copy(this._poseQuaternion).invert().premultiply(this.root.quaternion);
        this._flipEntryPending = false;
      }
      this._flipEntry.slerp(IDENTITY_Q, 1 - Math.exp(-22 * Math.max(0, dt)));
      this.root.quaternion.copy(this._flipEntry).multiply(this._poseQuaternion);
    } else if (flipState || bail || !this.poseReady) this.root.quaternion.copy(this._poseQuaternion);
    else this.root.quaternion.slerp(this._poseQuaternion, 1 - Math.exp(-22 * Math.max(0, dt)));
    if (!flipState) this._flipEntry?.identity();
    const wrap = impossibleMotion(flipState, stance);
    if (wrap && !bail) {
      const y = (this.contactRig.deckTopY || this.deckHeight) - this.deckHeight;
      const local = new THREE.Vector3(0, y, wrap.pivotZ * Math.cos(this._yawHold));
      const rotated = local.clone().applyQuaternion(this.root.quaternion);
      // Rotate around the supported back foot instead of freely tumbling around
      // the deck centre. This offset belongs only to rendering, never collision.
      this.root.position.addScaledVector(new THREE.Vector3(0, y, wrap.pivotZ).sub(rotated), wrap.weight);
      this.root.position.y += wrap.lift * wrap.weight;
    }
    this.poseReady = true;
    if (manual) this.manualSupport = true;
    if (airborne || bail || grind || wallRide || flatland) this.manualSupport = false;
    if (this.manualSupport && !this.supportCorners?.length) {
      // Lift around the supporting truck rather than sinking the lower wheels
      // through the ground when increasing the presentation angle.
      const pitch = this.root.rotation.x;
      const supportZ = pitch < 0 ? this.contactRig.frontTruckZ : this.contactRig.rearTruckZ;
      this.root.position.y += Math.abs(Math.sin(pitch)) * Math.abs(supportZ)
        + (Math.cos(pitch) - 1) * this.deckHeight;
      // Keep support during the return to level instead of dropping the board
      // immediately while its rotation is still blending out of the manual.
      if (!manual && Math.abs(pitch) < 0.0001) this.manualSupport = false;
    }
    const flatResidual=Object.values(this.flatlandMotion.weights).some(weight=>weight>.000001);
    if(!airborne&&!bail&&!grind&&!wallRide&&!flipState&&(supportPlane||manual||flatland||flatResidual||this.manualSupport)) {
      this._supportScratch ||= new THREE.Vector3();
      const n=supportPlane?.normal||THREE.Object3D.DEFAULT_UP;
      let minimum=Infinity;
      for(const corner of this.supportCorners||[]) {
        this._supportScratch.copy(corner).applyQuaternion(this.root.quaternion).add(this.root.position);
        minimum=Math.min(minimum,this._supportScratch.dot(n)+(supportPlane?.offset||0));
      }
      if(minimum<0&&n.y>.25)this.root.position.y+=-minimum/n.y;
      if(!manual&&!flatland&&!flatResidual&&this.root.quaternion.angleTo(this._poseQuaternion)<.0001)this.manualSupport=false;
    }
    this.wind.update(flipState, airborne, bail, dt);

  }
}
