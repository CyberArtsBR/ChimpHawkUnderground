// The skater: one explicit state machine (ground / air / grind / manual / bail).
// Each state has its own step function. There is no inheritance stack: a new
// move is a new state or a new branch inside one, never an override layer.
import * as THREE from 'three';
import { SKATER as C } from './config';
import type { PhysicsWorld, RayHit } from '../physics/PhysicsWorld';
import type { ParkSpot, Rail } from '../park/TestPark';
import type { Region } from '../park/GlbPark';
import type { InputFrame, Direction } from '../input/Input';
import { Combo } from '../tricks/Combo';
import {
  BOARDSLIDE, DOUBLE_FLIP_TRICKS, DOUBLE_GRAB_TRICKS, FLIP_TRICKS, GRAB_TRICKS, GRIND_TRICKS, MANUALS, OLLIE, WALLRIDE,
  directionKey, spinName, type FlipTrick, type Trick,
} from '../tricks/catalog';

export type SkaterState = 'ground' | 'air' | 'grind' | 'manual' | 'bail';

export type SkaterEvent =
  | { type: 'trick'; name: string; points: number }
  | { type: 'bank'; points: number; label: string; multiplier: number }
  | { type: 'bail'; lost: number; reason: string }
  | { type: 'pop' }
  | { type: 'land'; impact: number }
  | { type: 'grind'; rail: string }
  | { type: 'grindEnd' };

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

interface FlipState { trick: FlipTrick; t: number }
interface GrabState { trick: Trick; t: number; upgraded: boolean }

interface AirState {
  /** Spin axis and board "up" while airborne: world up, or the wall normal on vert. */
  up: THREE.Vector3;
  /** Horizontal ramp normal when launched off vert (rider returns to the ramp). */
  vertNormal: THREE.Vector3 | null;
  apexPassed: boolean;
  released: boolean;
  spin: number;
  time: number;
  flip: FlipState | null;
  grab: GrabState | null;
  wall: { normal: THREE.Vector3; t: number } | null;
}

interface GrindState {
  rail: Rail;
  /** Distance along the whole polyline. */
  s: number;
  dirSign: 1 | -1;
  speed: number;
  lean: number;
  leanVel: number;
  time: number;
  trick: Trick;
}

interface ManualState { kind: 'manual' | 'noseManual'; lean: number; leanVel: number; time: number }

/** Small deterministic PRNG so balance wobble is repeatable in tests. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function railLength(rail: Rail): number[] {
  const lengths = [0];
  for (let i = 1; i < rail.points.length; i++) lengths.push(lengths[i - 1] + rail.points[i].distanceTo(rail.points[i - 1]));
  return lengths;
}

export class Skater {
  state: SkaterState = 'ground';
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly normal = UP.clone();
  /** Direction of travel, tangent to the surface on the ground. */
  readonly forward = new THREE.Vector3(0, 0, -1);
  speed = 0;
  /** Last steering input, for presentation (body lean). */
  steer = 0;
  fakie = false;
  switchStance = false;

  charge = 0;
  air: AirState | null = null;
  grind: GrindState | null = null;
  manual: ManualState | null = null;
  bailTimer = 0;
  time = 0;
  score = 0;
  readonly combo = new Combo();
  readonly events: SkaterEvent[] = [];

  private coyote = 0;
  private jumpBuffer = 0;
  private grindCooldown = 0;
  private pendingBankAt: number | null = null;
  private ollieOnlyEntry = false;
  private taps: { dir: Direction; time: number }[] = [];
  private lastSafe = new THREE.Vector3();
  private lastSafeForward = new THREE.Vector3(0, 0, -1);
  private marker: { position: THREE.Vector3; forward: THREE.Vector3; switchStance: boolean } | null = null;
  private random = mulberry32(7);
  private railLengths = new Map<Rail, number[]>();

  constructor(private world: PhysicsWorld, private rails: Rail[], private spawn: ParkSpot, private regions: Region[] = []) {
    for (const rail of rails) this.railLengths.set(rail, railLength(rail));
    this.respawn(spawn.position, spawn.heading);
  }

  // ── Public controls ────────────────────────────────────────────────────

  respawn(position: THREE.Vector3, heading: number): void {
    const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    this.place(position, forward);
  }

  setMarker(): boolean {
    if (this.state !== 'ground' || this.normal.y < 0.95) return false;
    this.marker = { position: this.position.clone(), forward: this.forward.clone(), switchStance: this.switchStance };
    return true;
  }

  returnToMarker(): boolean {
    if (!this.marker) return false;
    this.place(this.marker.position, this.marker.forward);
    this.switchStance = this.marker.switchStance;
    return true;
  }

  /** Advance one fixed step. `input` edges (pressed/released/taps) apply to this step only. */
  step(input: InputFrame, dt = C.step): void {
    this.time += dt;
    this.steer = input.steer;
    this.grindCooldown = Math.max(0, this.grindCooldown - dt);
    for (const dir of input.directionTaps) this.taps.push({ dir, time: this.time });
    this.taps = this.taps.filter(t => this.time - t.time <= C.manualTapWindow);
    if (input.switchStancePressed && this.state !== 'bail') this.switchStance = !this.switchStance;
    if (input.reset) { this.respawn(this.spawn.position, this.spawn.heading); return; }
    if (input.practiceMark) this.setMarker();
    if (input.practiceReturn) { this.returnToMarker(); return; }

    // Safety net: anything that ends up below the world respawns safely.
    if (this.position.y < -10 || this.outsideRegions()) { this.place(this.lastSafe.clone(), this.lastSafeForward.clone()); return; }

    switch (this.state) {
      case 'ground': this.stepGround(input, dt); break;
      case 'manual': this.stepManual(input, dt); break;
      case 'air': this.stepAir(input, dt); break;
      case 'grind': this.stepGrind(input, dt); break;
      case 'bail': this.stepBail(dt); break;
    }
  }

  /** Board nose direction for presentation. */
  get nose(): THREE.Vector3 {
    return this.fakie ? this.forward.clone().negate() : this.forward.clone();
  }

  /** Board up direction for presentation. */
  get boardUp(): THREE.Vector3 {
    if (this.state === 'air' && this.air) return this.air.wall ? this.air.wall.normal.clone().lerp(UP, 0.4).normalize() : this.air.up.clone();
    return this.normal.clone();
  }

  get balance(): number | null {
    if (this.grind) return this.grind.lean;
    if (this.manual) return this.manual.lean;
    return null;
  }

  get crouch(): number { return clamp(this.charge / C.chargeTime, 0, 1); }

  // ── Ground ─────────────────────────────────────────────────────────────

  private stepGround(input: InputFrame, dt: number): void {
    this.coyote = C.coyoteTime;
    if (this.normal.y > 0.97 && this.speed < C.autoPushTarget + 2) {
      this.lastSafe.copy(this.position);
      this.lastSafeForward.copy(this.forward);
    }
    if (this.pendingBankAt !== null && this.time - this.pendingBankAt > C.landingManualGrace) this.bankCombo();

    const manualKind = this.manualFromTaps();
    if (manualKind && this.speed > 1) { this.startManual(manualKind); return; }

    if (input.ollieHeld) this.charge = Math.min(C.chargeTime, this.charge + dt);
    if (input.ollieReleased || (this.jumpBuffer > 0 && !input.ollieHeld)) { this.pop(); return; }
    this.jumpBuffer = 0;

    this.rollOnSurface(input, dt, { push: true, turnScale: 1 });
  }

  /**
   * Shared ground motion for riding and manuals: slope gravity, automatic
   * push, braking, steering, wall deflection, surface following and launch.
   */
  private rollOnSurface(input: InputFrame, dt: number, opts: { push: boolean; turnScale: number }): void {
    const flat = this.normal.y >= C.autoPushSurfaceY;
    const braking = input.brake || (input.drive < C.brakeDriveThreshold && Math.abs(input.steer) < 0.3 && opts.push);
    const carving = opts.push && input.drive < C.brakeDriveThreshold && Math.abs(input.steer) >= 0.3;

    let s = this.speed;
    const fy = this.forward.y;
    s += -C.gravity * fy * (!flat && fy > 0 ? C.uphillGravityScale : 1) * dt;
    if (s < -0.05) {
      // Rolled back down a ramp: now travelling the other way, fakie.
      this.forward.negate();
      this.fakie = !this.fakie;
      s = -s;
    } else if (s < 0) {
      // Rounding noise at a standstill is not a direction change.
      s = 0;
    }
    if (opts.push && flat && !braking && !carving && s < C.autoPushTarget) {
      const accel = lerp(C.autoPushMaxAccel, C.autoPushMinAccel, clamp(s / C.autoPushTarget, 0, 1));
      s = Math.min(C.autoPushTarget, s + accel * dt);
    }
    let resist = C.rollingBase + C.rollingQuadratic * s * s;
    if (s > C.softSpeedLimit) resist += C.overspeedDrag * (s - C.softSpeedLimit) ** 2;
    if (braking) resist += C.brakeDecel;
    if (carving) resist += C.carveDecel;
    s = Math.max(0, s - resist * dt);

    const rate = lerp(C.steerRateLowSpeed, C.steerRateHighSpeed, clamp(s / C.steerFullSpeed, 0, 1))
      * opts.turnScale * (carving ? C.carveRateScale : 1);
    this.forward.applyAxisAngle(this.normal, -input.steer * rate * dt).normalize();

    // Walls: anything much steeper than the surface we ride on.
    const wall = this.world.raycast(tmp.copy(this.position).addScaledVector(this.normal, 0.3), this.forward, s * dt + 0.35);
    if (wall && wall.normal.dot(this.normal) < 0.55) {
      const into = -this.forward.dot(wall.normal);
      if (into > 0.85 && s > C.wallBailSpeed) { this.speed = s; this.startBail('Hit a wall'); return; }
      if (into > 0) {
        const slide = this.forward.clone().addScaledVector(wall.normal, into);
        slide.addScaledVector(this.normal, -slide.dot(this.normal));
        if (slide.lengthSq() > 1e-4) this.forward.copy(slide.normalize());
        s *= Math.max(0, 1 - into * 0.9);
      }
    }
    this.speed = s;

    const next = this.position.clone().addScaledVector(this.forward, s * dt);
    const hit = this.probeGround(next, this.normal);
    if (!hit) { this.leaveGround(); return; }
    const delta = 0.5 - hit.distance; // + means the surface rose under the wheels
    if (delta > C.stepUpLimit && hit.normal.dot(this.normal) > 0.9) {
      // A curb or stair riser: the wheels catch.
      if (s > 7) { this.startBail('Tripped on an edge'); return; }
      this.speed = 0;
      return;
    }
    if (delta < -C.dropOffLimit) { this.position.copy(next); this.leaveGround(); return; }
    // Convex edge (a lip, a bank crest): the surface turns away from the travel
    // direction faster than the wheels can follow, so the rider takes off.
    const turn = Math.acos(clamp(hit.normal.dot(this.normal), -1, 1));
    if (hit.normal.dot(this.forward) > 0.2 && turn > C.convexLaunchAngle && s > C.convexLaunchSpeed) {
      this.position.copy(next);
      this.leaveGround();
      return;
    }

    this.position.copy(hit.point);
    this.normal.lerp(hit.normal, 1 - Math.exp(-60 * dt)).normalize();
    this.forward.addScaledVector(this.normal, -this.forward.dot(this.normal)).normalize();
  }

  private probeGround(at: THREE.Vector3, up: THREE.Vector3): RayHit | null {
    const origin = at.clone().addScaledVector(up, 0.5);
    return this.world.raycast(origin, up.clone().negate(), 1.0);
  }

  private leaveGround(): void {
    const velocity = this.forward.clone().multiplyScalar(this.speed);
    // Lift off the surface slightly so the first air ray doesn't hit the edge we left.
    this.position.addScaledVector(this.normal, 0.02);
    this.enterAir(velocity, this.normal);
  }

  private pop(): void {
    const power = lerp(C.minJump, C.maxJump, clamp(this.charge / C.chargeTime, 0, 1));
    this.charge = 0;
    this.jumpBuffer = 0;
    const popDir = this.normal.y > 0.7 ? this.normal.clone() : UP.clone();
    const velocity = this.forward.clone().multiplyScalar(this.speed).addScaledVector(popDir, power);
    const wasManual = this.state === 'manual';
    this.manual = null;
    if (!this.combo.active) { this.combo.add(OLLIE.name, OLLIE.points); this.ollieOnlyEntry = true; }
    else if (!wasManual) this.ollieOnlyEntry = false;
    this.pendingBankAt = null;
    this.events.push({ type: 'pop' });
    this.enterAir(velocity, this.normal);
  }

  // ── Air ────────────────────────────────────────────────────────────────

  private enterAir(velocity: THREE.Vector3, takeoffNormal: THREE.Vector3): void {
    const vert = takeoffNormal.y < 0.35 && velocity.y > 0.3 * velocity.length();
    const air: AirState = {
      up: UP.clone(), vertNormal: null, apexPassed: false, released: false, spin: 0, time: 0,
      flip: null, grab: null, wall: null,
    };
    this.velocity.copy(velocity);
    if (vert) {
      const nh = new THREE.Vector3(takeoffNormal.x, 0, takeoffNormal.z).normalize();
      this.velocity.addScaledVector(nh, -this.velocity.dot(nh));
      this.velocity.y = Math.min(this.velocity.y, C.vertLaunchCap);
      this.position.addScaledVector(nh, 0.08);
      air.up.copy(nh);
      air.vertNormal = nh;
      // Board stays in the wall plane: forward is the travel direction up the ramp.
      this.forward.copy(this.velocity).normalize();
    } else {
      const flat = new THREE.Vector3(this.forward.x, 0, this.forward.z);
      if (flat.lengthSq() > 1e-4) this.forward.copy(flat.normalize());
    }
    this.air = air;
    this.state = 'air';
  }

  private stepAir(input: InputFrame, dt: number): void {
    const air = this.air!;
    air.time += dt;
    this.coyote = Math.max(0, this.coyote - dt);
    if (input.ollieHeld) this.charge = Math.min(C.chargeTime, this.charge + dt);
    if (input.ollieReleased) {
      if (air.wall) { this.wallJump(); return; }
      if (this.coyote > 0 && air.time < C.coyoteTime) { this.coyote = 0; this.state = 'ground'; this.air = null; this.pop(); return; }
      this.jumpBuffer = C.jumpBuffer;
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    // Spin: steering and Q/E rotate the board around its air "up" axis.
    const spinInput = clamp(input.steer + input.spin, -1.6, 1.6);
    const angle = -spinInput * C.airTurnRate * dt;
    this.forward.applyAxisAngle(air.up, angle).normalize();
    air.spin += angle;

    // Vert: hold the line back to the ramp until the player exits after the apex.
    if (air.vertNormal && !air.released) {
      if (this.velocity.y <= 0) air.apexPassed = true;
      if (air.apexPassed && (input.vertExit || input.directionTaps.includes('up'))) {
        air.released = true;
        this.velocity.addScaledVector(air.vertNormal, -C.vertExitPush);
      } else {
        this.velocity.addScaledVector(air.vertNormal, -this.velocity.dot(air.vertNormal));
      }
    }

    this.airTricks(input, dt);
    if (input.grindHeld && this.grindCooldown <= 0 && this.velocity.y < 2.5 && this.tryCaptureGrind(input)) return;

    const gravity = air.wall ? C.gravity * 0.35 : C.gravity;
    this.velocity.y -= gravity * dt;
    if (air.wall) {
      air.wall.t += dt;
      this.velocity.addScaledVector(air.wall.normal, -this.velocity.dot(air.wall.normal));
      const along = Math.hypot(this.velocity.x, this.velocity.z);
      if (air.wall.t > 0.9 || along < 3 || !input.grindHeld) {
        this.velocity.addScaledVector(air.wall.normal, 1.2);
        air.wall = null;
      }
    }

    const travel = this.velocity.length() * dt;
    if (travel > 1e-6) {
      const dir = this.velocity.clone().normalize();
      const hit = this.world.raycast(this.position, dir, travel + 0.05);
      if (hit && this.airContact(hit, input)) return;
    }
    this.position.addScaledVector(this.velocity, dt);
  }

  private airTricks(input: InputFrame, dt: number): void {
    const air = this.air!;
    const dir = directionKey(input.steer, input.drive);
    if (air.flip) {
      air.flip.t += dt;
      if (input.flipPressed && air.flip.t < air.flip.trick.duration * 0.6) {
        const upgrade = DOUBLE_FLIP_TRICKS[air.flip.trick.name];
        if (upgrade) { air.flip.trick = upgrade; this.renameLast(upgrade); }
      }
      if (air.flip.t >= air.flip.trick.duration) air.flip = null;
    } else if (input.flipPressed && !air.grab) {
      const trick = FLIP_TRICKS[dir];
      air.flip = { trick, t: 0 };
      this.addTrick(trick);
    }

    if (air.grab) {
      if (!input.grabHeld) air.grab = null;
      else {
        air.grab.t += dt;
        this.combo.addHeld(C.grabPointsPerSecond * dt);
      }
    }
    if (input.grabPressed && !air.flip) {
      if (air.grab && !air.grab.upgraded && DOUBLE_GRAB_TRICKS[air.grab.trick.name]) {
        const upgrade = DOUBLE_GRAB_TRICKS[air.grab.trick.name];
        air.grab = { trick: upgrade, t: 0, upgraded: true };
        this.renameLast(upgrade);
      } else if (!air.grab) {
        const trick = GRAB_TRICKS[dir];
        air.grab = { trick, t: 0, upgraded: false };
        this.addTrick(trick);
      }
    }
  }

  /** Returns true when the contact ended the air state (landed, grind, bail). */
  private airContact(hit: RayHit, input: InputFrame): boolean {
    const air = this.air!;
    const n = hit.normal;
    const vhat = this.velocity.clone().normalize();
    // Only surfaces we are moving into count (not the edge we just left).
    if (vhat.dot(n) > -0.01) return false;
    const grazing = Math.abs(vhat.dot(n)) < 0.55;
    if (n.y < -0.3) {
      // Ceiling.
      this.velocity.addScaledVector(n, -1.2 * this.velocity.dot(n));
      return false;
    }
    if (n.y > 0.25 || grazing && n.y > -0.05 && (air.vertNormal || n.y > 0.05)) {
      this.land(hit);
      return true;
    }
    // Vertical wall.
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (input.grindHeld && Math.abs(n.y) < 0.2 && grazing && horizontalSpeed > 5 && !air.wall) {
      air.wall = { normal: n.clone(), t: 0 };
      this.velocity.addScaledVector(n, -this.velocity.dot(n));
      this.velocity.y = Math.max(this.velocity.y, 2.5);
      this.position.copy(hit.point).addScaledVector(n, 0.3);
      this.addTrick(WALLRIDE);
      return true;
    }
    this.velocity.addScaledVector(n, -1.3 * this.velocity.dot(n));
    this.position.copy(hit.point).addScaledVector(n, 0.05);
    return true;
  }

  private wallJump(): void {
    const air = this.air!;
    const n = air.wall!.normal;
    this.velocity.addScaledVector(n, 4.5);
    this.velocity.y = Math.max(this.velocity.y, 0) + 5.5;
    air.wall = null;
    this.charge = 0;
    this.events.push({ type: 'pop' });
  }

  private land(hit: RayHit): void {
    const air = this.air!;
    const n = hit.normal;
    const vT = this.velocity.clone().addScaledVector(n, -this.velocity.dot(n));
    const fT = this.forward.clone().addScaledVector(n, -this.forward.dot(n));
    const impact = Math.abs(this.velocity.dot(n));
    this.position.copy(hit.point);
    this.normal.copy(n);

    if (air.flip && air.flip.t < air.flip.trick.duration - C.flipLandGrace) { this.toGroundForBail(vT, n); this.startBail('Flip not finished'); return; }
    const autoAlign = air.released || fT.length() < 0.3;
    if (!autoAlign && air.up.dot(n) < C.landingUpTolerance) { this.toGroundForBail(vT, n); this.startBail('Landed crooked'); return; }

    const speed = vT.length();
    if (speed > 1.5) {
      const travel = vT.clone().normalize();
      if (!autoAlign) {
        const cos = fT.normalize().dot(travel);
        if (Math.abs(cos) < C.landingAlignCos) { this.toGroundForBail(vT, n); this.startBail('Landed sideways'); return; }
        if (cos < 0) this.fakie = !this.fakie;
      }
      this.forward.copy(travel);
    } else if (fT.lengthSq() > 1e-4) {
      this.forward.copy(fT.normalize());
    }
    this.speed = speed;

    const halfTurns = Math.round(Math.abs(air.spin) / Math.PI);
    const spin = spinName(halfTurns);
    if (spin && this.combo.active) {
      // A spun ollie reads "180 Ollie"; a spin after other tricks is its own entry.
      if (this.ollieOnlyEntry) this.addTrick({ name: `${spin} ${OLLIE.name}`, points: OLLIE.points + 75 * halfTurns });
      else this.addTrick({ name: spin, points: 75 * halfTurns });
    }

    this.air = null;
    this.state = 'ground';
    this.events.push({ type: 'land', impact });
    if (this.combo.active) this.pendingBankAt = this.time;
    const manualKind = this.manualFromTaps();
    if (manualKind && speed > 1) this.startManual(manualKind);
    else if (this.jumpBuffer > 0) this.pop();
  }

  private toGroundForBail(vT: THREE.Vector3, n: THREE.Vector3): void {
    this.speed = vT.length();
    if (this.speed > 0.1) this.forward.copy(vT).normalize();
    this.normal.copy(n);
  }

  // ── Grind ──────────────────────────────────────────────────────────────

  private tryCaptureGrind(input: InputFrame): boolean {
    let best: { rail: Rail; seg: number; t: number; point: THREE.Vector3; dist: number } | null = null;
    for (const rail of this.rails) {
      for (let i = 0; i < rail.points.length - 1; i++) {
        const a = rail.points[i], b = rail.points[i + 1];
        const ab = b.clone().sub(a);
        const t = clamp(this.position.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
        const point = a.clone().addScaledVector(ab, t);
        const d = this.position.clone().sub(point);
        const vertical = d.y;
        const horizontal = Math.hypot(d.x, d.z);
        if (vertical > C.grindCaptureAbove || vertical < -C.grindCaptureBelow || horizontal > C.grindCaptureRadius) continue;
        const dist = Math.hypot(horizontal, vertical);
        if (!best || dist < best.dist) best = { rail, seg: i, t, point, dist };
      }
    }
    if (!best) return false;
    const { rail, seg, t } = best;
    const a = rail.points[seg], b = rail.points[seg + 1];
    const segDir = b.clone().sub(a).normalize();
    const along = this.velocity.dot(segDir);
    const dirSign: 1 | -1 = along >= 0 ? 1 : -1;
    const facing = new THREE.Vector3(this.forward.x, 0, this.forward.z).normalize();
    const boardslide = Math.abs(facing.dot(new THREE.Vector3(segDir.x, 0, segDir.z).normalize())) < 0.5;
    const trick = boardslide ? BOARDSLIDE : GRIND_TRICKS[directionKey(input.steer, input.drive)];
    const lengths = this.railLengths.get(rail)!;

    this.grind = {
      rail, s: lengths[seg] + t * (lengths[seg + 1] - lengths[seg]), dirSign,
      speed: Math.max(3, Math.abs(along)), lean: (this.random() - 0.5) * 0.16, leanVel: 0, time: 0, trick,
    };
    this.air = null;
    this.state = 'grind';
    this.position.copy(best.point);
    this.normal.copy(UP);
    this.forward.copy(segDir).multiplyScalar(dirSign);
    this.addTrick(trick);
    this.events.push({ type: 'grind', rail: rail.name });
    return true;
  }

  private railFrame(rail: Rail, s: number): { point: THREE.Vector3; dir: THREE.Vector3 } {
    const lengths = this.railLengths.get(rail)!;
    let i = 0;
    while (i < lengths.length - 2 && s > lengths[i + 1]) i++;
    const a = rail.points[i], b = rail.points[i + 1];
    const segLen = lengths[i + 1] - lengths[i];
    const t = clamp((s - lengths[i]) / segLen, 0, 1);
    return { point: a.clone().lerp(b, t), dir: b.clone().sub(a).normalize() };
  }

  private stepGrind(input: InputFrame, dt: number): void {
    const g = this.grind!;
    g.time += dt;
    const lengths = this.railLengths.get(g.rail)!;
    const total = lengths[lengths.length - 1];
    let frame = this.railFrame(g.rail, g.s);
    const travelDir = frame.dir.clone().multiplyScalar(g.dirSign);

    if (input.ollieHeld) this.charge = Math.min(C.chargeTime, this.charge + dt);
    if (input.ollieReleased) { this.endGrind(true); return; }
    if (input.grindPressed) {
      const trick = GRIND_TRICKS[directionKey(input.steer, input.drive)];
      if (trick.name !== g.trick.name) { g.trick = trick; this.addTrick(trick); }
    }

    g.speed += -C.gravity * travelDir.y * dt;
    g.speed -= (C.grindFriction + (input.brake ? 4 : 0)) * dt;
    if (g.speed < 0) { g.dirSign = (g.dirSign * -1) as 1 | -1; g.speed = -g.speed; }
    g.s += g.speed * dt * g.dirSign;

    // Balance: an uncorrected lean grows; steer pushes it back (left fixes a right lean).
    const instability = C.balanceDrift * (1 + C.balanceGrowth * g.time);
    const noise = (this.random() - 0.5) * 1.2;
    g.leanVel += (g.lean * instability * 3 + noise + input.steer * C.balanceControl) * dt;
    g.leanVel *= 0.985;
    g.lean += g.leanVel * dt;
    this.combo.addHeld(C.grindPointsPerSecond * dt);
    if (Math.abs(g.lean) > 1) { this.startBail('Lost balance'); return; }

    if (g.s < 0 || g.s > total) { this.endGrind(false); return; }
    frame = this.railFrame(g.rail, g.s);
    this.position.copy(frame.point);
    this.forward.copy(frame.dir).multiplyScalar(g.dirSign);
  }

  private endGrind(ollie: boolean): void {
    const g = this.grind!;
    const velocity = this.forward.clone().multiplyScalar(g.speed);
    velocity.y += ollie ? lerp(C.minJump, C.maxJump, this.crouch) * 0.85 : 0.6;
    this.charge = 0;
    this.grind = null;
    this.grindCooldown = C.grindCooldown;
    this.events.push({ type: 'grindEnd' });
    if (ollie) this.events.push({ type: 'pop' });
    this.enterAir(velocity, UP);
  }

  // ── Manual ─────────────────────────────────────────────────────────────

  private manualFromTaps(): 'manual' | 'noseManual' | null {
    const recent = this.taps.slice(-2);
    if (recent.length < 2) return null;
    const [first, second] = recent;
    if (first.dir === 'up' && second.dir === 'down') { this.taps = []; return 'manual'; }
    if (first.dir === 'down' && second.dir === 'up') { this.taps = []; return 'noseManual'; }
    return null;
  }

  private startManual(kind: 'manual' | 'noseManual'): void {
    const trick = MANUALS[kind];
    this.pendingBankAt = null;
    this.manual = { kind, lean: (this.random() - 0.5) * 0.1, leanVel: 0, time: 0 };
    this.state = 'manual';
    this.addTrick(trick);
  }

  private stepManual(input: InputFrame, dt: number): void {
    const m = this.manual!;
    m.time += dt;
    if (input.ollieHeld) this.charge = Math.min(C.chargeTime, this.charge + dt);
    if (input.ollieReleased) { this.pop(); return; }
    const other = this.manualFromTaps();
    if (other && other !== m.kind) { m.kind = other; this.addTrick(MANUALS[other]); }

    const difficulty = MANUALS[m.kind].difficulty;
    const instability = C.balanceDrift * difficulty * (1 + C.balanceGrowth * m.time);
    const noise = (this.random() - 0.5) * 1.0;
    m.leanVel += (m.lean * instability * 3 + noise + input.drive * C.balanceControl) * dt;
    m.leanVel *= 0.985;
    m.lean += m.leanVel * dt;
    this.combo.addHeld(C.manualPointsPerSecond * dt);
    if (Math.abs(m.lean) > 1) { this.manual = null; this.startBail('Lost the manual'); return; }

    const neutral = { ...input, drive: 0, brake: false };
    this.rollOnSurface(neutral, dt, { push: false, turnScale: 1.14 * 0.6 });
    if (this.state !== 'manual') { this.manual = null; return; }
    if (this.speed < 0.5) { this.manual = null; this.state = 'ground'; this.bankCombo(); }
  }

  // ── Bail ───────────────────────────────────────────────────────────────

  private startBail(reason: string): void {
    const lost = this.combo.total;
    this.combo.fail();
    this.pendingBankAt = null;
    this.ollieOnlyEntry = false;
    this.air = null; this.grind = null; this.manual = null;
    this.charge = 0;
    this.state = 'bail';
    this.bailTimer = C.bailDuration;
    this.events.push({ type: 'bail', lost, reason });
  }

  private stepBail(dt: number): void {
    this.bailTimer -= dt;
    this.speed = Math.max(0, this.speed - 12 * dt);
    // The slide stops at walls (it used to carry the rider through them).
    const wall = this.world.raycast(tmp.copy(this.position).addScaledVector(UP, 0.3), this.forward, this.speed * dt + 0.4);
    if (wall && Math.abs(wall.normal.y) < 0.6) this.speed = 0;
    const next = this.position.clone().addScaledVector(this.forward, this.speed * dt);
    const hit = this.probeGround(next, UP);
    if (hit && hit.distance > 0.3) this.position.copy(hit.point);
    if (this.bailTimer > 0) return;
    const ground = this.probeGround(this.position.clone().setY(this.position.y + 2), UP);
    if (ground && ground.normal.y > 0.9) this.place(ground.point, this.forward);
    else this.place(this.lastSafe.clone(), this.lastSafeForward.clone());
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private outsideRegions(): boolean {
    if (!this.regions.length) return false;
    const { x, z } = this.position;
    return !this.regions.some(r => x >= r.minX - 2 && x <= r.maxX + 2 && z >= r.minZ - 2 && z <= r.maxZ + 2);
  }

  private place(position: THREE.Vector3, forward: THREE.Vector3): void {
    let hit = this.probeGround(position.clone().setY(position.y + 1.5), UP)
      ?? this.world.raycast(position.clone().setY(position.y + 3), UP.clone().negate(), 10);
    if (!hit) {
      // Nowhere to stand (off the map): go back to the spawn point.
      position = this.spawn.position.clone();
      forward = new THREE.Vector3(-Math.sin(this.spawn.heading), 0, -Math.cos(this.spawn.heading));
      hit = this.world.raycast(position.clone().setY(position.y + 3), UP.clone().negate(), 10);
    }
    this.position.copy(hit ? hit.point : position);
    this.normal.copy(hit ? hit.normal : UP);
    this.forward.copy(forward).addScaledVector(this.normal, -forward.dot(this.normal)).normalize();
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.fakie = false;
    this.charge = 0;
    this.air = null; this.grind = null; this.manual = null;
    this.state = 'ground';
    this.pendingBankAt = null;
    this.ollieOnlyEntry = false;
    this.combo.clear();
    this.lastSafe.copy(this.position);
    this.lastSafeForward.copy(this.forward);
  }

  private trickName(trick: Trick): { name: string; points: number } {
    return this.switchStance ? { name: `Switch ${trick.name}`, points: Math.round(trick.points * 1.25) } : trick;
  }

  private addTrick(trick: Trick): void {
    const { name, points } = this.trickName(trick);
    if (this.ollieOnlyEntry) { this.combo.upgradeLast(name, points); this.ollieOnlyEntry = false; }
    else this.combo.add(name, points);
    this.events.push({ type: 'trick', name, points });
  }

  private renameLast(trick: Trick): void {
    const { name, points } = this.trickName(trick);
    this.combo.upgradeLast(name, points);
    this.events.push({ type: 'trick', name, points });
  }

  private bankCombo(): void {
    this.pendingBankAt = null;
    this.ollieOnlyEntry = false;
    const result = this.combo.bank();
    if (!result) return;
    this.score += result.points;
    this.events.push({ type: 'bank', points: result.points, label: result.label, multiplier: result.multiplier });
  }
}
