// QA overlay is read-only: it must never affect controls, physics or camera.
const round = (value, places = 2) => Number.isFinite(value) ? Number(value.toFixed(places)) : null;
const format = (value) => value == null ? '—' : String(value);

export function captureAuditTelemetry({ skater, followCamera, camera, input = {}, paused = false, focused = true, fps = null } = {}) {
  const velocity = skater?.velocity;
  const horizontalSpeed = velocity ? Math.hypot(velocity.x, velocity.z) : null;
  const rail = skater?.grind || null;
  const air = skater?.transitionAir || null;
  const eye = camera?.position;
  const player = skater?.position;
  const dx = eye && player ? eye.x - player.x : null;
  const dz = eye && player ? eye.z - player.z : null;
  const dy = eye && player ? eye.y - player.y : null;
  const horizontalArm = dx == null ? null : Math.hypot(dx, dz);
  const pitch = horizontalArm == null ? null : Math.atan2(dy, horizontalArm) * 180 / Math.PI;
  const alignment = horizontalArm > 0.001 && horizontalSpeed > 0.1
    ? -(dx * velocity.x + dz * velocity.z) / (horizontalArm * horizontalSpeed)
    : null;
  const wheels = skater?.lastWheelSupport;
  const state = paused ? 'PAUSED' : rail ? 'GRIND' : air ? (air.transferring ? 'TRANSFER' : 'VERT_AIR')
    : skater?.bailTime > 0 ? 'BAIL' : skater?.wallRide ? 'WALLRIDE'
      : skater?.manual ? 'MANUAL' : skater?.grounded ? 'GROUND' : 'AIR';
  const warnings = [];
  if (!focused) warnings.push('WINDOW UNFOCUSED: physics suspended');
  if (pitch != null && pitch > 66 && !paused) warnings.push('CAMERA: overhead angle');
  if (rail && Math.abs(rail.speed || 0) < 0.25 && rail.time > 0.25) warnings.push('GRIND: near stall');
  if (!paused && skater && !skater.grounded && !rail && horizontalSpeed < 0.15
    && Math.abs(velocity?.y || 0) < 0.15 && (skater.airTime || 0) > 0.5) warnings.push('AIR: near-zero velocity');
  return {
    mode: state, paused: Boolean(paused), focused: Boolean(focused),
    fps: round(fps, 1), speedKmh: round((horizontalSpeed || 0) * 3.6, 1),
    hudKmh: round(Math.abs(skater?.speed || 0) * 3.6, 1),
    velocityY: round(velocity?.y), headingDeg: round((skater?.heading || 0) * 180 / Math.PI, 1),
    fakie: Boolean(skater?.fakie), stance: skater?.stance ?? null,
    cameraMode: followCamera?.mode || '—', cameraPitchDeg: round(pitch, 1),
    behindTravel: round(alignment, 2), clearance: Boolean(followCamera?.occlusionActive),
    transition: air?.copingName || air?.frame?.transitionId || null,
    transitionAge: round(air?.age), returnError: round(air?.returnError),
    rail: rail?.rail?.name || null, railS: round(rail?.s), railLength: round(rail?.rail?.length),
    railSpeed: round(rail?.speed), railBalance: round(rail?.balance),
    wheelCount: wheels?.wheelCount ?? wheels?.count ?? 0,
    inputDrive: round(input.drive || 0), inputSteer: round(input.steer || 0),
    inputSpin: round(input.spin || 0), inputGrind: Boolean(input.grindHeld || input.grindPressed),
    inputJump: Boolean(input.ollieHeld || input.ollieReleased), inputExit: Boolean(input.vertExit),
    warnings,
  };
}

export function formatAuditTelemetry(snapshot) {
  if (!snapshot) return 'Waiting for skater';
  return [
    'STREETSKATE  ·  LIVE QA',
    'F3 / QA to close',
    '──────────────────────────────',
    `STATE          ${snapshot.mode}`,
    `FOCUS          ${snapshot.focused ? 'YES' : 'NO'}`,
    `FPS            ${format(snapshot.fps)}`,
    `SPEED / HUD    ${format(snapshot.speedKmh)} / ${format(snapshot.hudKmh)} km/h`,
    `VERTICAL       ${format(snapshot.velocityY)} m/s`,
    `HEADING        ${format(snapshot.headingDeg)}°`,
    `FAKIE / STANCE ${snapshot.fakie ? 'YES' : 'NO'} / ${format(snapshot.stance)}`,
    `CAMERA         ${snapshot.cameraMode} · ${format(snapshot.cameraPitchDeg)}° pitch`,
    `BEHIND TRAVEL  ${format(snapshot.behindTravel)} (1 = behind)`,
    `CAM OCCLUSION  ${snapshot.clearance ? 'YES' : 'NO'}`,
    `TRANSITION     ${snapshot.transition || '—'}`,
    `VERT AGE/ERR   ${format(snapshot.transitionAge)}s / ${format(snapshot.returnError)}m`,
    `RAIL           ${snapshot.rail || '—'}`,
    `RAIL POS       ${format(snapshot.railS)} / ${format(snapshot.railLength)} m`,
    `RAIL SPEED/BAL ${format(snapshot.railSpeed)} / ${format(snapshot.railBalance)}`,
    `WHEEL CONTACTS ${format(snapshot.wheelCount)}`,
    `DRIVE/STEER    ${format(snapshot.inputDrive)} / ${format(snapshot.inputSteer)}`,
    `SPIN/G/J/EXIT  ${format(snapshot.inputSpin)} / ${+snapshot.inputGrind} / ${+snapshot.inputJump} / ${+snapshot.inputExit}`,
    ...(snapshot.warnings.length ? ['', '⚠ ' + snapshot.warnings.join(' · ')] : []),
  ].join('\n');
}

export function createDebugOverlay({ button, panel }) {
  if (!button || !panel) throw new Error('QA overlay requires button and panel');
  let visible = false;
  let elapsed = 0;
  let averageFps = null;
  const setVisible = (next) => {
    visible = Boolean(next);
    panel.hidden = !visible;
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-expanded', String(visible));
    if (visible) elapsed = Infinity;
    return visible;
  };
  const toggle = () => setVisible(!visible);
  button.addEventListener('click', toggle);
  document.addEventListener('keydown', e => {
    if (e.code === 'F3' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggle();
    }
  });
  return {
    toggle, setVisible,
    get visible() { return visible; },
    update(dt, context = {}) {
      if (!visible) return;
      if (Number.isFinite(dt) && dt > 0) {
        const sampled = Math.min(240, 1 / dt);
        averageFps = averageFps == null ? sampled : averageFps * 0.9 + sampled * 0.1;
        elapsed += dt;
      }
      if (elapsed < 0.12) return;
      elapsed = 0;
      panel.textContent = formatAuditTelemetry(captureAuditTelemetry({ ...context, fps: averageFps }));
    },
  };
}
