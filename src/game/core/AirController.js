export const AIR_CONTROL = Object.freeze({
  turnRate: 5.2,
  maxTurnInput: 1,
  directionDeadZone: 0.06,
  directionNoRotateTime: 0.045,
  directionFullRotateTime: 0.14,
});

/**
 * Pure fixed-step airborne orientation + gravity.
 * It consumes one already-interpreted player turn command and never reads contact
 * normals, collision geometry, stance, or smoothed ground steering.
 */
export function resolveAirMotion({
  airHeading = 0,
  airSpin = 0,
  turnInput = 0,
  directSpinInput = 0,
  turnHoldTime = 0,
  previousTurnDirection = 0,
  velocityY = 0,
  gravity = 20,
  dt = 0,
  config = AIR_CONTROL,
} = {}) {
  const step = Math.max(0, Number(dt) || 0);
  const turn = Math.max(
    -config.maxTurnInput,
    Math.min(config.maxTurnInput, Number(turnInput) || 0),
  );
  const turnDirection = Math.abs(turn) > config.directionDeadZone ? Math.sign(turn) : 0;
  const nextTurnHoldTime = turnDirection
    ? (turnDirection === previousTurnDirection ? Math.max(0, turnHoldTime) : 0) + step
    : 0;
  const directSpin = Math.abs(Number(directSpinInput) || 0) > 0.1;
  // Brief directional taps choose flips/grabs without immediately yawing the
  // body. Deliberately held directions ramp quickly; shoulder spins start now.
  const ramp = directSpin ? 1 : Math.max(0, Math.min(1,
    (nextTurnHoldTime - config.directionNoRotateTime)
      / (config.directionFullRotateTime - config.directionNoRotateTime)));
  const appliedTurn = turnDirection ? turn * ramp : 0;
  const nextAirSpin = (Number(airSpin) || 0) - appliedTurn * config.turnRate * step;
  const heading = (Number(airHeading) || 0) + nextAirSpin;
  const nextVelocityY = (Number(velocityY) || 0)
    - Math.max(0, Number(gravity) || 0) * step;

  return Object.freeze({
    turnInput: appliedTurn,
    turnHoldTime: nextTurnHoldTime,
    turnDirection,
    airSpin: nextAirSpin,
    heading,
    velocityY: nextVelocityY,
  });
}
