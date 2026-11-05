// Skater tuning. Values marked "v1" are carried over from the original game's
// GroundMotor / PHYSICS / AirController so the default feel stays familiar.

export const SKATER = Object.freeze({
  step: 1 / 120,             // v1: fixed 120 Hz simulation
  gravity: 21,               // v1 PHYSICS.gravity

  // Ground
  autoPushTarget: 18,        // v1: automatic push cruise speed (m/s ≈ 65 km/h)
  autoPushMinAccel: 3.6,     // v1
  autoPushMaxAccel: 13.5,    // v1
  autoPushSurfaceY: 0.992,   // v1: only push on (nearly) flat ground
  softSpeedLimit: 21,        // v1
  overspeedDrag: 0.008,      // v1
  rollingBase: 0.025,        // v1
  rollingQuadratic: 0.00115, // v1
  brakeDecel: 13,            // v1 GroundMotor brakeDecel
  brakeDriveThreshold: -0.12,// v1
  steerRateLowSpeed: 2.7,    // v1 rad/s
  steerRateHighSpeed: 1.65,  // v1 rad/s
  steerFullSpeed: 12,        // v1
  carveRateScale: 1.55,      // S + A/D sharper carve
  carveDecel: 4,
  uphillGravityScale: 0.85,  // transitions: a little help climbing ramps
  stepUpLimit: 0.06,         // taller edges block the wheels
  dropOffLimit: 0.3,         // larger drops leave the ground
  wallBailSpeed: 11,         // head-on wall hits faster than this bail
  convexLaunchAngle: 0.35,   // ≈20°: sharper crests launch the rider…
  convexLaunchSpeed: 5,      // …when moving faster than this (m/s)

  // Ollie
  minJump: 5.6,              // v1
  maxJump: 7.9,              // v1
  chargeTime: 0.24,          // v1
  coyoteTime: 0.09,          // v1
  jumpBuffer: 0.12,          // v1

  // Air
  airTurnRate: 5.2,          // v1 AirController turnRate (rad/s)
  vertLaunchCap: 11.5,       // caps vert airs at ~3.1 m above the lip
  vertExitPush: 2.6,         // Left Ctrl after apex carries over the coping
  landingAlignCos: Math.cos(THREE_DEG(40)),
  landingUpTolerance: Math.cos(THREE_DEG(65)),
  flipLandGrace: 0.16,       // a flip this close to done still lands (v1 was similarly forgiving)

  // Grind / manual balance
  grindCaptureRadius: 0.55,
  grindCaptureAbove: 0.6,
  grindCaptureBelow: 0.2,
  grindFriction: 0.8,
  grindCooldown: 0.35,
  grindPointsPerSecond: 40,
  manualPointsPerSecond: 30,
  grabPointsPerSecond: 60,
  balanceDrift: 1.6,         // how fast an uncorrected lean grows
  balanceGrowth: 0.18,       // extra instability per second held
  balanceControl: 3.2,       // correction strength from steer / drive
  manualTapWindow: 0.35,     // W then S (or S then W) within this window
  landingManualGrace: 0.3,   // start a manual this soon after landing to keep the combo

  // Bail / respawn
  bailDuration: 1.25,        // v1
});

function THREE_DEG(deg: number): number { return (deg * Math.PI) / 180; }

export type SkaterConfig = typeof SKATER;
