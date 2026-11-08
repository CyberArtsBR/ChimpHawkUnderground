import { gameAssetUrl } from './AssetPaths.js';
import * as THREE from 'three';
import { HandplantSkillStreetPhysics, HANDPLANT } from './HandplantSkillStreetPhysics.js';
import { UnrealRider } from '../character/UnrealRider.js';
import { warmGrabDeckSurface } from '../character/GrabReachPose.js';
import { StreetBoard } from '../skateboard/StreetBoard.js';
import { ensureBalanceHud } from './BalanceHud.js';
import { captureGameplayState } from './core/GameplayStateSnapshot.js';
import { flipPhaseFor, physicsMovementState, resolvePresentationState } from '../character/PresentationState.js';
import { yawStableSurfaceBasis } from './core/PresentationOrientation.js';
import { landingMotion } from '../character/TrickMotion.js';
import { GROUND_MOTOR, groundControlIntent } from './core/GroundMotor.js';

const clamp = THREE.MathUtils.clamp;

export class StreetSkater extends HandplantSkillStreetPhysics {
  constructor(options) {
    super(options);
    this.root = new THREE.Group();
    this.root.name = 'TheanchoURi-skater';
    this.visual = new THREE.Group();
    this.root.add(this.visual);
    this.presentationNormal = new THREE.Vector3(0, 1, 0);
    this._forwardVisual = new THREE.Vector3();
    this._backVisual = new THREE.Vector3();
    this._rightVisual = new THREE.Vector3();
    this._presentationUp = new THREE.Vector3(0, 1, 0);
    this._basis = new THREE.Matrix4();
    this._smoothedVisualPosition = null;
    this._previousPhysicsPosition = null;
    this._renderPhysicsPosition = new THREE.Vector3();
    this._targetVisualRotation = new THREE.Quaternion();
    this._visualRotationInitialized = false;
    this._wallPoseQ = new THREE.Quaternion();
    this._wallPoseAxisX = new THREE.Vector3(1, 0, 0);
    this._wallPoseAxisZ = new THREE.Vector3(0, 0, 1);
    this._beforeVelocity = new THREE.Vector3();
    this.debugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
    this.debugElement = null;
    if (this.debugEnabled && typeof document !== 'undefined') this.initDebugViewer();
    this.presentation = {
      state: 'IDLE', previousState: 'IDLE', stateTime: 0, physicsState: 'IDLE',
      pushClock: 0, pushPhase: 0, pushWeight: 0, popTime: 0, popProgress: 1, landingTime: 0, landingDuration: 0.3,
      landingSeverity: 0, flipPhase: null, activeTrick: '', pumpState: 'OFF', vertState: 'OFF',
      grabWeight: 0, grabPose: null,
    };
  }

  initDebugViewer() {
    const panel = document.createElement('pre');
    panel.id = 'animation-debug';
    panel.setAttribute('aria-label', 'Animation debug viewer');
    Object.assign(panel.style, {
      position: 'fixed', top: '72px', right: '16px', zIndex: '9999', margin: '0', padding: '12px 14px',
      maxWidth: '480px', whiteSpace: 'pre-wrap', pointerEvents: 'none', border: '1px solid rgba(255,255,255,.22)',
      borderRadius: '8px', background: 'rgba(7,12,14,.86)', color: '#d9ff64', font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
      boxShadow: '0 10px 40px rgba(0,0,0,.28)',
    });
    document.body.appendChild(panel);
    this.debugElement = panel;
  }

  updateDebugViewer() {
    if (!this.debugElement) return;
    const d = this.getPresentationDebug();
    const s = captureGameplayState(this);
    const rig = d.rig ? `${d.rig.boneCount} bones${d.rig.missing?.length ? ` / missing: ${d.rig.missing.join(', ')}` : ' / semantic rig OK'}` : 'loading';
    const vec = value => value ? value.map(n => n == null ? '—' : n.toFixed(3)).join(', ') : '—';
    this.debugElement.textContent = [
      `PHYSICS      ${d.physicsState}`,
      `MODE         ${s.movementState}`,
      `PRESENTATION ${d.presentationState}`,
      `TRICK        ${d.activeTrick}`,
      `FLIP PHASE   ${d.flipPhase}`,
      `GRAB         ${d.grab}`,
      `GRIND        ${d.grindType}`,
      `MANUAL       ${d.manual}`,
      `HEADING      ${s.heading ?? '—'}`,
      `AIR HEADING  ${s.airHeading ?? '—'}`,
      `AIR SPIN     ${s.airSpin ?? '—'}`,
      `VELOCITY     ${vec(s.velocity)}`,
      `TRAVEL       ${vec(s.travelDirection)}`,
      `NORMAL       ${vec(s.normal)}`,
      `FAKIE        ${s.fakie ?? '—'}`,
      `ROLL SIGN    ${s.rollingSign ?? '—'}`,
      `TRANSITION   ${s.transitionId || (s.transitionActive ? 'ACTIVE' : '—')}`,
      `WHEELS       ${s.wheelSupport ? `${s.wheelSupport.count} / F${s.wheelSupport.frontSupported} R${s.wheelSupport.rearSupported}` : '—'}`,
      `GRIND BAL    ${d.grindBalance.toFixed(3)}`,
      `MANUAL BAL   ${d.manualBalance.toFixed(3)}`,
      `STANCE       ${d.stance}`,
      `PUMP         ${d.pumpState}`,
      `VERT         ${d.vertState}`,
      `RIG          ${rig}`,
    ].join('\n');
  }

  async load({riderUrl=gameAssetUrl('/assets/rider/TheanchoURi.glb')}={}) {
    [this.board, this.rider] = await Promise.all([
      new StreetBoard(gameAssetUrl('/assets/rider/skateboard.glb')).load(),
      new UnrealRider(riderUrl).load(),
    ]);
    this.visual.add(this.board.root, this.rider.root);
    warmGrabDeckSurface(this.board);
    this.captureRiderFlashMaterials();
    this.rider.deckHeight = this.board.deckHeight;
    this.setBoardContactRig(this.board.contactRig);
    this.balanceHud = ensureBalanceHud();
    this.update(0, {}, 0);
    return this;
  }

  captureRiderFlashMaterials() {
    this.flashMaterials = [];
    // Character changes must retain the same rider-only respawn effect as boot.
    // Traversing visual here would also make the skateboard translucent.
    this.rider?.root.traverse(mesh => {
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        if (material && !this.flashMaterials.some(item => item.material === material))
          this.flashMaterials.push({ material,
            opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
    });
  }

  /** Invalidate an in-flight GLB load without changing the active character. */
  cancelRiderSwap() {
    this._riderSwapGeneration = (this._riderSwapGeneration || 0) + 1;
  }

  /** Hot-swap a rigged GLB without resetting physics, collision, or the skateboard. */
  async setRiderModel(url, { uploadFilename = '' } = {}) {
    const prepared=await this.prepareRiderModel(url,{uploadFilename});
    return prepared.commit();
  }

  /** Load/validate without replacing the resumable run's current rider. */
  async prepareRiderModel(url, { uploadFilename = '' } = {}) {
    if (!url || typeof url !== 'string') throw new Error('Choose a character GLB.');
    // A slow previous GLB is never allowed to replace a newer user selection.
    const request = (this._riderSwapGeneration || 0) + 1;
    this._riderSwapGeneration = request;
    if (this.rider?.url === url) return {commit:()=>this.rider,dispose(){}};
    const candidate = await new UnrealRider(url, { uploadFilename }).load();
    if (request !== this._riderSwapGeneration) {
      candidate.dispose();
      return {commit:()=>this.rider,dispose(){}};
    }
    const required = ['pelvis','head','upperarm_l','upperarm_r','thigh_l','thigh_r','foot_l','foot_r'];
    const missing = required.filter(name => !candidate.bones[name]);
    if (missing.length) {
      candidate.dispose();
      throw new Error('GLB requires a rigged humanoid avatar; missing bones: '+missing.join(', '));
    }
    // Header validity and named hip/ankle bones aren't enough for IK. A GLB
    // without complete elbow/knee chains cannot be safely animated in-game.
    const ik = candidate.rigAudit?.ik;
    if (ik && (!ik.fullLegIK || !ik.fullArmIK)) {
      candidate.dispose();
      throw new Error('GLB avatar needs complete thigh → calf → foot and upper arm → forearm → hand joints on both sides.');
    }
    candidate.deckHeight = this.board.deckHeight;
    let consumed=false;
    return {
      root:candidate.root,
      dispose:()=>{if(!consumed){consumed=true;candidate.dispose();}},
      commit:()=>{
        if(consumed)return this.rider;
        consumed=true;
        if(request!==this._riderSwapGeneration){candidate.dispose();return this.rider;}
        const previous=this.rider;
        this.visual.add(candidate.root);this.rider=candidate;previous?.dispose();
        this.captureRiderFlashMaterials();this.resetPresentationAfterSwap();return this.rider;
      },
    };
  }

  resetPresentationAfterSwap() {
    this.rider?.resetPresentation();
    this.board?.resetPresentation();
    this._smoothedVisualPosition=null;this._visualRotationInitialized=false;
    if(this.presentation) this.presentation.stateTime=0;
    this.update(0,{},0);
  }

  reset(position, heading) {
    super.reset(position, heading);
    // The base constructor also calls reset, before presentation is allocated.
    if (!this.presentation) return;
    Object.assign(this.presentation, {
      state: 'IDLE', previousState: 'IDLE', stateTime: 0, physicsState: 'IDLE',
      pushClock: 0, pushPhase: 0, pushWeight: 0, popTime: 0, popProgress: 1,
      landingTime: 0, landingSeverity: 0, grabWeight: 0, grabPose: null,
      flipPhase: null, activeTrick: '', pumpState: 'OFF', vertState: 'OFF',
    });
    this.rider?.resetPresentation();
    this.board?.resetPresentation();
    this.presentationNormal.copy(this.bodyUp());
    this._smoothedVisualPosition=null;
    this._previousPhysicsPosition=null;
    this._renderPhysicsPosition?.copy(this.position);
    this._visualRotationInitialized=false;
  }

  step(dt, input) {
    // Save the position at the start of the final physics step in this frame.
    // Rendering can then interpolate it without altering gameplay state.
    const previous = this._previousPhysicsPosition ||= new THREE.Vector3();
    previous.copy(this.position);
    const respawn = this.respawnSerial;
    super.step(dt, input);
    if (this._previousPhysicsPosition && (respawn !== this.respawnSerial ||
        previous.distanceToSquared(this.position) > 4)) previous.copy(this.position);
  }

  updatePresentation(delta, input, before) {
    const p = this.presentation;
    const grounded = this.grounded;
    const speed = Math.abs(this.speed);
    const speedRatio = Math.min(speed / this.config.maxSpeed, 1);
    const justTookOff = before.grounded && !grounded && !this.grind && !this.wallRide;
    if (justTookOff && this.takeoffOllieRequested) p.popTime = 0.20;
    else p.popTime = Math.max(0, p.popTime - delta);
    p.popProgress = p.popTime > 0 ? 1 - p.popTime / 0.20 : 1;

    if (this.justLanded) {
      // A fast return down a transition can have a large world-Y speed while
      // touching the ramp gently. Compress for impact into the surface instead.
      const impact = Math.max(0, -before.velocity.dot(this.normal));
      const airFactor = clamp(before.airTime / 1.35, 0, 1);
      p.landingSeverity = clamp(impact / 10 + airFactor * 0.12, 0.1, 1);
      p.landingDuration = 0.32 + p.landingSeverity * 0.18;
      p.landingTime = p.landingDuration;
      // Sloppy landing (2026-11): board sideways to travel, or a very hard
      // impact, makes the rider flail for a moment. Fakie counts as clean.
      const travel = before.velocity.clone().setY(0);
      if (!this.bailTime && travel.lengthSq() > 4 && this.forward) {
        const forward = this.forward.clone().setY(0).normalize();
        const off = Math.acos(Math.min(1, Math.abs(travel.normalize().dot(forward))));
        const sloppy = Math.max(clamp((off - .26) / .5, 0, 1), clamp((p.landingSeverity - .82) * 4, 0, 1));
        this.lastLandingSloppiness = sloppy;
        if (sloppy > .2) this.rider?.gesture?.('stumble', .45 + sloppy * .55);
      } else this.lastLandingSloppiness = 0;
    } else p.landingTime = Math.max(0, p.landingTime - delta);

    const controlIntent = groundControlIntent({
      speed: this.speed, steer: this.steer, drive: input.drive || 0,
      brake: Boolean(input.brake), manual: Boolean(this.manual), normalY: this.normal.y,
    });
    const braking = grounded && speed > 0.35 && controlIntent.braking;
    const pushDemand = grounded && !this.manual && !this.grind && !this.wallRide && !this.bailTime && !braking
      && controlIntent.pushingAllowed && this.autoPushActive
      && this.normal.y >= GROUND_MOTOR.autoPushSurfaceY && this.charge < 0.05
      && speed < GROUND_MOTOR.autoPushTarget;
    // Auto acceleration remains in physics; visually both feet stay on deck.
    // Clearing the gesture also removes its footstep sound and weight shift.
    p.pushWeight = 0;
    p.pushClock = 0;
    p.pushPhase = 0;

    const pumpSource = this.pumpState ?? this.pump ?? this.pumping ?? null;
    const pumpActive = Boolean(pumpSource && pumpSource !== 'OFF' && pumpSource !== 'idle');
    p.pumpState = typeof pumpSource === 'string' ? pumpSource : pumpActive ? 'ACTIVE' : 'OFF';
    const vert = Boolean(this.transitionAir && !this.grounded);
    p.vertState = vert ? (this.velocity.y > 0.45 ? 'ASCENDING' : this.velocity.y < -0.45 ? 'DESCENDING' : 'APEX') : 'OFF';
    p.flipPhase = flipPhaseFor(this.flipState);
    p.activeTrick = this.flipState?.name || this.grabState?.name || this.grind?.trick?.name || this.flatland || '';

    const context = {
      grounded, speed, charge: this.charge, braking, pushDemand,
      popActive: p.popTime > 0, landingActive: p.landingTime > 0, pumpActive, vert,
      manual: this.manual, grind: this.grind, wallRide: this.wallRide, flatland: this.flatland, bail: this.bailTime > 0,
    };
    p.physicsState = physicsMovementState(context);
    const next = resolvePresentationState({ ...context, pushDemand: false });
    if (next !== p.state) { p.previousState = p.state; p.state = next; p.stateTime = 0; }
    else p.stateTime += delta;
    return { speedRatio, vert };
  }

  wallImpactPoseWeight() {
    const duration = Math.max(0.001, Number(this.wallImpactDuration) || 0.52);
    const remaining = clamp((Number(this.wallImpactTime) || 0) / duration, 0, 1);
    if (remaining <= 0) return 0;
    const phase = 1 - remaining;
    return Math.pow(Math.sin(Math.PI * clamp(phase, 0, 1)), 0.72);
  }

  applyWallImpactPose(weight) {
    if (!this.rider || weight <= 0.001) return;
    const rootQ = this.rider.root.getWorldQuaternion(this._wallPoseQ);
    const side = Math.sign(this.wallImpactSide || 1);

    // Hands-up impact reaction: shoulders rise quickly, elbows open and the torso
    // recoils slightly. This is presentation only; gameplay trajectory is already
    // resolved by the wall-recovery physics layer.
    this.rider.rotate('upperarm_l', this._wallPoseAxisZ, -1.18 * weight, rootQ);
    this.rider.rotate('upperarm_r', this._wallPoseAxisZ, 1.18 * weight, rootQ);
    this.rider.rotate('lowerarm_l', this._wallPoseAxisZ, -0.34 * weight, rootQ);
    this.rider.rotate('lowerarm_r', this._wallPoseAxisZ, 0.34 * weight, rootQ);
    this.rider.rotate('upperarm_l', this._wallPoseAxisX, -0.18 * weight, rootQ);
    this.rider.rotate('upperarm_r', this._wallPoseAxisX, -0.18 * weight, rootQ);
    this.rider.rotate('spine_02', this._wallPoseAxisX, 0.13 * weight, rootQ);
    this.rider.rotate('spine_03', this._wallPoseAxisZ, side * 0.08 * weight, rootQ);
    this.rider.root.updateWorldMatrix(true, true);
  }

  update(delta, input, elapsed) {
    const before = { grounded: this.grounded, velocity: this._beforeVelocity.copy(this.velocity), airTime: this.airTime };
    this.advance(delta, input);
    if(this.lastCaughtFlip){this.board?.catchFlip(this.lastCaughtFlip);this.lastCaughtFlip=null;}
    const present = this.updatePresentation(delta, input, before);

    this.root.position.copy(this.position);
    const renderPosition = this._renderPhysicsPosition;
    if (this._previousPhysicsPosition) {
      const alpha = clamp(this.accumulator / this.config.step, 0, 1);
      renderPosition.lerpVectors(this._previousPhysicsPosition, this.position, alpha);
    } else renderPosition.copy(this.position);
    // Gameplay collision stays authoritative on root. Only the rendered skater
    // receives interpolation and a tiny capped low-pass correction to hide
    // contact jitter without affecting physics or input.
    if(!this._smoothedVisualPosition)this._smoothedVisualPosition=renderPosition.clone();
    else if(delta>0){
      if(this._smoothedVisualPosition.distanceToSquared(renderPosition)>4)
        this._smoothedVisualPosition.copy(renderPosition);
      else {
        this._smoothedVisualPosition.lerp(renderPosition,1-Math.exp(-27*delta));
        const lag=this._smoothedVisualPosition.clone().sub(renderPosition);
        if(lag.lengthSq()>0.18*0.18)
          this._smoothedVisualPosition.copy(renderPosition).add(lag.setLength(0.18));
      }
    }
    this.visual.position.copy(this._smoothedVisualPosition).sub(this.position);
    const surfaceUp = this.bodyUp();
    this.presentationNormal.lerp(surfaceUp, 1 - Math.exp(-18 * Math.max(delta, 1 / 120))).normalize();
    yawStableSurfaceBasis(
      this.heading,
      this.presentationNormal,
      this._rightVisual,
      this._backVisual,
      this._presentationUp,
    );
    this._forwardVisual.copy(this._backVisual).negate();
    this._targetVisualRotation.setFromRotationMatrix(
      this._basis.makeBasis(this._rightVisual, this._presentationUp, this._backVisual),
    );
    if(!this._visualRotationInitialized||delta<=0) {
      this.visual.quaternion.copy(this._targetVisualRotation);
      this._visualRotationInitialized=true;
    }else{
      this.visual.quaternion.slerp(this._targetVisualRotation,1-Math.exp(-23*delta));
    }
    const plantVisual = this.applyHandplantVisual();

    const plantGrab = plantVisual?.grab ? this.handplant?.variant?.grab : null;
    const grabActive = Boolean((this.grabState || plantGrab) && !this.flipState && !this.grounded && this.bailTime <= 0);
    const p = this.presentation;
    if (grabActive) p.grabPose = { name: plantGrab || this.grabState.name };
    p.grabWeight = THREE.MathUtils.lerp(p.grabWeight, grabActive ? 1 : 0,
      1 - Math.exp(-28 * Math.max(0, delta)));
    if (this.bailTime > 0) p.grabWeight = 0;
    if (p.grabWeight < 0.005 && !grabActive) p.grabPose = null;
    const manualBalance = Number.isFinite(this.manualBalance) ? this.manualBalance : 0;
    this._supportPlaneNormal ||= new THREE.Vector3();
    this._supportPlaneRotation ||= new THREE.Quaternion();
    this._supportPlaneNormal.copy(this.normal).applyQuaternion(
      this.visual.getWorldQuaternion(this._supportPlaneRotation).invert());
    const supportOffset=this.normal.dot(this._smoothedVisualPosition)-this.normal.dot(this.position);
    const grindBalance = Number.isFinite(this.grind?.balance) ? this.grind.balance : Number.isFinite(this.grindBalance) ? this.grindBalance : 0;
    const bailProgress = this.bailTime > 0 ? clamp(1 - this.bailTime / this.bailDuration, 0, 1) : 0;
    const common = {
      supportPlane:{normal:this._supportPlaneNormal,offset:supportOffset},
      presentation: this.presentation,
      flipState: this.flipState,
      flipPhase: this.presentation.flipPhase,
      grabState: p.grabPose,
      grabWeight: p.grabWeight,
      manual: this.manual,
      manualBalance,
      grind: this.grind,
      grindType: this.grind?.trick?.name || null,
      grindBalance,
      wallRide: this.wallRide,
      vert: present.vert,
      verticalVelocity: this.velocity.y,
      airTime: this.airTime,
      airborne: !this.grounded && !this.grind && !this.wallRide && this.bailTime <= 0,
      bail: this.bailTime > 0,
      bailProgress,
      bailPhysics: this.bailTime > 0 ? {
        velocity: this.bailLaunchVelocity || this.bailVelocity,
        severity: this.bailSeverity || 0,
        surface: this.surface,
        anchor: this.position,
      } : null,
      stance: this.stance,
      flatland: this.flatland,
      time: elapsed,
      dt: delta,
    };
    this.board?.update({ ...common, speedRatio: present.speedRatio, airborne: !this.grounded && !this.grind });
    if (this.rider) this.rider.root.rotation.set(0, 0, 0);
    this.rider?.update({
      ...common,
      board: this.board,
      speedRatio: present.speedRatio,
      crouch: this.charge,
      steer: this.steer,
      pushWeight: 0,
      pushPhase: 0,
      landingSeverity: p.landingSeverity * landingMotion(1 - p.landingTime / p.landingDuration),
      pumpState: this.presentation.pumpState,
      plantExtend: plantVisual ? plantVisual.weight * plantVisual.weight : 0,
    });
    if (this.bailTime <= 0) this.applyWallImpactPose(this.wallImpactPoseWeight());
    if (plantVisual) this.placeHandplantArm(plantVisual);
    const flashing = this.respawnTimer > 0 && Math.floor((1.8 - this.respawnTimer) / 0.3) % 2 === 0;
    for (const saved of this.flashMaterials || []) {
      const transparent = flashing || saved.transparent;
      if (saved.material.transparent !== transparent) { saved.material.transparent = transparent; saved.material.needsUpdate = true; }
      saved.material.opacity = flashing ? 0.22 : saved.opacity;
      saved.material.depthWrite = flashing ? false : saved.depthWrite;
    }
    this.balanceHud?.update(this.balanceMode(), this.balanceValue());
    this.updateDebugViewer();
    return { speedRatio: present.speedRatio };
  }

  /**
   * Hand plant pose (2026-11): the whole skater (board and rider together)
   * turns about the coping line, so the board ends up overhead. Returns the
   * blend weight for anchoring the planted hand, or null when not planting.
   */
  applyHandplantVisual() {
    const hp = this.handplant;
    if (!hp) { this._plantVisual = null; return null; }
    let pv = this._plantVisual;
    if (!pv || pv.hp !== hp) {
      // Ideal "riding up the wall" orientation: body up into the ramp, nose up or down the wall.
      const up = hp.inward.clone(), back = new THREE.Vector3(0, -hp.noseUp, 0);
      const right = up.clone().cross(back).normalize();
      pv = this._plantVisual = {
        hp, start: this.visual.quaternion.clone(), releaseQ: null,
        wall: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back)),
        turn: new THREE.Quaternion(), spin: new THREE.Quaternion(), q: new THREE.Quaternion(),
      };
    }
    let weight, grab;
    if (hp.phase !== 'release') {
      weight = THREE.MathUtils.smoothstep(hp.time / HANDPLANT.plantTime, 0, 1);
      pv.turn.setFromAxisAngle(hp.axis, hp.angle);
      pv.q.copy(pv.turn).multiply(pv.wall);
      this.visual.quaternion.copy(pv.start).slerp(pv.q, weight);
      pv.releaseQ = this.visual.quaternion.clone();
      grab = true;
    } else {
      const e = THREE.MathUtils.smoothstep(hp.time / HANDPLANT.releaseTime, 0, 1);
      pv.turn.setFromAxisAngle(hp.axis, -hp.releaseAngle * e);
      pv.spin.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * e);
      this.visual.quaternion.copy(pv.turn).multiply(pv.spin).multiply(pv.releaseQ);
      weight = 1 - e;
      grab = e < 0.55;
    }
    // Hold the skater at the physics anchor; the arm placement shifts it after posing.
    this.visual.position.set(0, 0, 0);
    this._smoothedVisualPosition?.copy(this.position);
    return { weight, grab };
  }

  /** Put the planting shoulder one arm-length above the coping, then reach the hand onto it. */
  placeHandplantArm({ weight }) {
    const hp = this.handplant, rider = this.rider;
    if (!hp || !rider?.bones || weight <= 0.001) return;
    const front = this.stance < 0 ? 'r' : 'l', rear = front === 'l' ? 'r' : 'l';
    const side = hp.variant.hand === 'front' ? front : rear;
    const upper = rider.bones['upperarm_' + side], lower = rider.bones['lowerarm_' + side], hand = rider.bones['hand_' + side];
    if (!upper || !lower || !hand) return;
    this.root.updateMatrixWorld(true);
    const shoulder = upper.getWorldPosition(new THREE.Vector3());
    const reach = (shoulder.distanceTo(lower.getWorldPosition(new THREE.Vector3()))
      + lower.getWorldPosition(new THREE.Vector3()).distanceTo(hand.getWorldPosition(new THREE.Vector3()))) * 0.96;
    // The arm runs up from the coping, a little more upright than the body.
    const armUp = new THREE.Vector3(0, -1, 0).applyQuaternion(this.visual.quaternion)
      .lerp(new THREE.Vector3(0, 1, 0), 0.45).normalize();
    const wanted = hp.hand.clone().addScaledVector(armUp, reach);
    this.visual.position.addScaledVector(wanted.sub(shoulder), weight);
    this.root.updateMatrixWorld(true);
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(this.visual.quaternion);
    rider.reachArm?.(side, hp.hand, upper.getWorldPosition(new THREE.Vector3()).addScaledVector(back, 0.4), weight);
    if (hp.variant.legOut) {
      // Sad Plant: the front leg leaves the board and points straight out past the nose.
      const thigh = rider.bones['thigh_' + front], calf = rider.bones['calf_' + front], foot = rider.bones['foot_' + front];
      if (thigh && calf && foot) {
        const hip = thigh.getWorldPosition(new THREE.Vector3());
        const legLength = hip.distanceTo(calf.getWorldPosition(new THREE.Vector3()))
          + calf.getWorldPosition(new THREE.Vector3()).distanceTo(foot.getWorldPosition(new THREE.Vector3()));
        const feetward = new THREE.Vector3(0, 1, 0).applyQuaternion(this.visual.quaternion).negate();
        const nose = back.clone().negate();
        const target = hip.clone().addScaledVector(feetward.multiplyScalar(.75).addScaledVector(nose, .45).normalize(), legLength * .97);
        rider.reachLeg?.(front, target, hip.clone().addScaledVector(nose, .5), weight);
      }
    }
  }

  getPresentationDebug() {
    return {
      physicsState: this.presentation.physicsState,
      presentationState: this.presentation.state,
      activeTrick: this.presentation.activeTrick || '—',
      flipPhase: this.presentation.flipPhase || '—',
      grab: this.grabState?.name || '—',
      grindType: this.grind?.trick?.name || '—',
      manual: this.manual || '—',
      grindBalance: Number.isFinite(this.grind?.balance) ? this.grind.balance : Number(this.grindBalance) || 0,
      manualBalance: Number(this.manualBalance) || 0,
      stance: this.stance < 0 ? 'SWITCH' : 'REGULAR',
      pumpState: this.presentation.pumpState,
      vertState: this.presentation.vertState,
      rig: this.rider?.rigAudit || null,
    };
  }
}
