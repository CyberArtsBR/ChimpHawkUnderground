#!/usr/bin/env node
/**
 * StreetSkate Agent 02 — reproducible synthetic vert trajectories.
 * No rendering, map-mesh changes or contact-solver stubs.
 * Run: node tools/agent02-vert-trajectories.mjs
 * Flight-plane crossing is a diagnostic, NOT a confirmed wheel landing.
 */
import * as THREE from 'three';
import { TransitionController } from '../src/game/transitions/TransitionController.js';
import { resolveTransferFlightStep } from '../src/game/core/TransferFlightResult.js';
import { resolveTransferLaunchResult } from '../src/game/core/TransferLaunchResult.js';
import { RAMP_WALL_SAFETY } from '../src/game/RampWallSafetySkillStreetPhysics.js';
import { DECK_AWARE_EXIT } from '../src/game/DeckAwareRampExitSkillStreetPhysics.js';
import { SAFE_COPING_EXIT } from '../src/game/SafeCopingExitSkillStreetPhysics.js';

const GRAVITY = 20, DT = 1 / 120;
const cases = [
  ['quarter-straight', 'QUARTER', .60, 0, 6.8, 3.5, 1],
  ['quarter-diagonal', 'QUARTER', .60, 3.0, 7.2, 4.0, 1],
  ['halfpipe-vert', 'VERT', .20, 0, 8.5, 5.1, -1],
  ['halfpipe-180-motion', 'VERT', .20, 1.2, 8.5, 5.1, 1],
  ['bowl-pocket', 'BOWL', .32, -2.4, 7.4, 4.8, 1],
  ['curved-mini', 'MINI', .72, 1.6, 6.2, 3.1, -1],
];

function runCase([name, type, normalY, side, speed, rise, inwardSign]) {
  const rail = {
    name, points: [[-5, 2, 0], [5, 2, 0]],
    transition: { id: name, type, axisMode: type === 'BOWL' ? 'RADIAL' : 'LINEAR',
      supportsVert: true, supportsTransfer: true, supportsPump: true },
  };
  const controller = new TransitionController({ rails: [rail] });
  const position = new THREE.Vector3(0, 1.88, .16 * inwardSign);
  const normal = new THREE.Vector3(0, normalY,
    inwardSign * Math.sqrt(1 - normalY * normalY));
  const velocity = new THREE.Vector3(side, rise, -speed * inwardSign);
  const before = velocity.clone();
  const edge = controller.launchAt(position, normal, velocity);
  if (!edge) throw Error(name + ': lip not captured');
  const air = controller.begin(position, velocity, edge, { launchBoost: 3 });
  const launchSpeed = velocity.length();
  const departureY = position.y;
  let peakY = departureY, peakTime = 0, crossedLipAt = null, maxLateral = 0;
  let maxReturnError = 0;
  for (let i = 1; i <= 360; i++) {
    velocity.y -= GRAVITY * DT;
    controller.advance(air, position, velocity, {}, DT);
    position.addScaledVector(velocity, DT);
    if (!Number.isFinite(position.lengthSq() + velocity.lengthSq())) throw Error('non-finite');
    if (position.y > peakY) { peakY = position.y; peakTime = i * DT; }
    maxLateral = Math.max(maxLateral, Math.abs(position.x));
    maxReturnError = Math.max(maxReturnError, air.returnError);
    if (air.apexPassed && velocity.y < 0 && position.y <= air.frame.lipPoint.y - .1) {
      crossedLipAt = i * DT; break;
    }
  }
  return {
    name, type, launchSpeed: +launchSpeed.toFixed(3),
    inboundSpeed: +before.length().toFixed(3),
    launchVertical: +air.launchVertical.toFixed(3),
    apexRise: +(peakY - departureY).toFixed(3),
    apexTime: +peakTime.toFixed(3),
    lipPlaneCrossTime: crossedLipAt == null ? null : +crossedLipAt.toFixed(3),
    lateralDisplacement: +maxLateral.toFixed(3),
    maxReturnError: +maxReturnError.toFixed(3),
    // Contact solver plus the live map are required to confirm a real landing.
    wheelLandingVerified: false,
  };
}
function plannedDeckTransfer() {
  const name = 'wide-deck-transfer';
  const controller = new TransitionController({ rails: [{
    name, points: [[-5, 2, 0], [5, 2, 0]],
    transition: { id: name, type: 'QUARTER', supportsVert: true,
      supportsTransfer: true, supportsPump: true },
  }] });
  const position = new THREE.Vector3(0, 1.88, .16);
  const velocity = new THREE.Vector3(.6, 5.1, -8.4);
  const normal = new THREE.Vector3(0, .35, Math.sqrt(1 - .35 ** 2));
  const edge = controller.launchAt(position, normal, velocity);
  if (!edge) throw Error('transfer coping not captured');
  edge.exitRequested = true;
  const air = controller.begin(position, velocity, edge, { launchBoost: 3 });
  const deck = {
    found: true, direction: edge.deckOutward.clone(), startDistance: .22,
    endDistance: 2.25, usableWidth: 2.03, targetDistance: .9,
    targetPoint: edge.lipPoint.clone().addScaledVector(edge.deckOutward, .9),
    targetNormal: new THREE.Vector3(0, 1, 0),
  };
  const launch = resolveTransferLaunchResult({
    frame: air.frame, incomingSpeed: air.frame.incomingSpeed,
    launchVertical: air.launchVertical, lateralVelocity: air.lateralVelocity,
    deck, gravity: GRAVITY, transferConfig: RAMP_WALL_SAFETY,
    deckConfig: DECK_AWARE_EXIT, copingConfig: SAFE_COPING_EXIT,
  });
  if (!launch.active || !launch.transferring) throw Error('valid deck transfer rejected');
  air.exitControl = launch.exitControl;
  air.transferring = true;
  air.mode = 'transfer';
  velocity.copy(launch.velocity);
  const startingY = position.y;
  let peakY = startingY, closestDeck = Infinity;
  for (let i = 0; i < 240; i++) {
    velocity.y -= GRAVITY * DT;
    const result = resolveTransferFlightStep({
      air, position, velocity, dt: DT, config: RAMP_WALL_SAFETY,
    });
    air.age = result.age;
    air.apexPassed = result.apexPassed;
    velocity.copy(result.velocity);
    position.addScaledVector(velocity, DT);
    peakY = Math.max(peakY, position.y);
    closestDeck = Math.min(closestDeck, position.distanceTo(deck.targetPoint));
    if (position.y < deck.targetPoint.y - .25) break;
  }
  return { name, type: 'TRANSFER', apexRise: +(peakY - startingY).toFixed(3),
    closestDeckPoint: +closestDeck.toFixed(3),
    launchVelocity: launch.velocity.toArray().map(n => +n.toFixed(3)),
    deckWidth: deck.usableWidth, wheelLandingVerified: false };
}
const results = [...cases.map(runCase), plannedDeckTransfer()];
process.stdout.write(JSON.stringify({ simulatedHz: 120, gravity: GRAVITY,
  note: 'Synthetic trajectory diagnostics only. Real wheel support requires map collision replay.',
  results }, null, 2) + '\n');
