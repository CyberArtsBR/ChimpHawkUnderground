# ASTRA gameplay implementation — GP-03 / GP-01

Implemented locally against audited source `b53ec09`; no commit, deployment, asset edits or numerical tuning. Source inputs and fixtures were inspected before changing the shipping controller. No applicable AGENTS.md was found in the searched workspace/parent locations.

## Completed

**GP-03:** Added a bounded shipping-controller/current-geometry acceptance tool using real Warehouse and Orbit collision GLBs and the measured skateboard contact rig. Sixty CPU cases cover quarter/halfpipe/bowl, early/near/late release, partial/full intended holds, regular/switch, diagonal approaches, passive departures, slow/high-speed examples and explicit transfer input. Assertions cover finite position/velocity at every sample, true lip-corridor stall, unique charge credit, and the expected buffered Warehouse halfpipe return path. Added focused runtime tests for monotonic flat charge/saturation, accepted full-charge height, one-shot late release, detached diagnostic snapshots and reset/drain semantics.

The existing TransitionGuide component fixtures now import `PHYSICS.gravity` (21) instead of locally integrating20. Their comments explicitly distinguish component checks from whole-runtime collision acceptance; assertions were retained.

**GP-01:** Added a bounded simulation-owned release ledger. Physical release, semantic interpretation, charge owner, departure and re-entry are separate events. One-shot late-ramp credit is claimed before applying the existing impulse composition. Ground/coyote, buffered vert, grind and pump ownership are recorded through the existing authoritative execution paths; the established takeoff/coyote/grind/pump guards remain in charge of their existing physics. This does not replace the controller hierarchy or alter accepted launch numbers.

## Actual API for integration / TERRA

Available on the shipping physics instance, including the inherited browser skater:

```js
const diagnostic = skater.getLaunchTelemetry();
const newEvents = skater.drainLaunchTelemetry();
```

`getLaunchTelemetry()` returns a detached plain-data snapshot:

- `units`: seconds, metres, metres/second; `time` is elapsed simulation time since reset.
- `release`: latest `{id,time,charge,grounded,position,velocity,owner,command}`. Charge is the actual pre-release held charge; a tap can be0 even though the existing jump-buffer minimum remains.05.
- `activeFlight` / `lastFlight`: departure time, position, velocity, normal, stance, movement mode, transition ID, optional lip point, transfer flag, requested-at-departure flag and peakY. A late credit adds `lateReleaseId`; it does not rewrite the historical fact that departure was passive.
- Completed flight includes end time/position/velocity, outcome (`grounded`, `grind`, `wall`, `bail`), rise above first airborne sample and peak above the coping when an actual transition lip is known. Generic AIR without authored lip reports null coping height; do not fabricate one.
- `history`: last128 release/interpret/credit/departure/reentry events. `drainLaunchTelemetry()` returns pending events once, also bounded to128. Reset replaces both history and queue. Diagnostics do not mutate live state or gameplay event/HUD queues.

Credit owners are `ground-or-coyote`, `buffered-vert`, `late-ramp`, `grind`, `pump`. No-credit releases remain visible (for example blocked pump/invalid airborne release). This ledger exposes source-time semantics for lessons and diagnosis; no new HUD is added in this stage.

## Accepted launch contract

Gravity21m/s²; fixed integration1/120s; full flat charge.24s; configured flat impulse5.6–7.9m/s; neutral motor18m/s. Accepted full-charge flat fixture remains approximately1.453m rise/.742s flight.

Early uphill release can depart as generic AIR. A near-coping release can buffer into VERT_AIR, so the button timestamp precedes departure. A held charge released within the existing.14s early-flight grace can be consumed once if the ramp departure was passive and still rising. Late energy composition remains `hypot(vY, impulse*.85)` with the existing departure envelope. A second release in the same flight cannot repeat it. Descent/bottom pumping, coyote input, immediate grind pop and deliberate transfers retain their existing ownership.

The reproducible Warehouse halfpipe fixture is in the runtime report: initial tangent speed10m/s, lip approximately(3.144274,5.763280,-51.520555), start3.4m inward. With a.32s intended hold, near release achieves full charge, release about.517s and VERT_AIR departure about.825s, then downhill return. Early and late paths remain distinct. TERRA must display actual mapped actions and measured timing, not promise equal apex across these paths.

## Verification

- Sixty actual-geometry baseline/candidate cases: all finite, all departed,39 observed downhill returns, two existing early-diagonal bowl bails, maximum low-speed lip dwell.2083s. No true >.5s coping stall reproduced. Two bails are unchanged from baseline and are not asserted erroneous.
- Exact baseline/candidate comparison of release, departure, apex, outcome and final position/velocity: **zero differences across60cases**. No numerical retune is justified by this patch.
- Focused command across launch-credit, ramp-height, input-interpreter, pump-energy, transfer, takeoff-context and ollie/flip/landing suites: **39 tests passed**.
- `node tools/verify-vert.mjs`: **20/20 component checks passed** with runtime gravity21.

Reproduce the actual-geometry sweep with `node tools/charged-ramp-runtime.mjs`. Optional `RAMP_REPORT` names the JSON result within the artifact directory. Run focused runtime checks with `node --test tests/launch-credit-runtime.test.mjs`. These are CPU/scripted-input checks, not physical-controller, natural player approach, GPU or animation certification. Explicit transfer-input cases exercise the geometry-dependent outcome; the dedicated runtime transfer tests additionally assert wide-deck transfer and narrow-deck safe return.

## Changed files and evidence

- [Shipping controller](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/game/StatefulSkillStreetPhysics.js)
- [Bounded release ledger](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/game/core/LaunchTelemetry.js)
- [Actual-geometry tool](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tools/charged-ramp-runtime.mjs)
- [Runtime credit tests](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tests/launch-credit-runtime.test.mjs)
- [Component ramp tests](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tests/ramp-launch-height.test.mjs)
- [Component vert verifier](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tools/verify-vert.mjs)
- [Before-patch baseline](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-gameplay/baseline.json), [candidate](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-gameplay/runtime.json), [exact parity report](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-gameplay/parity.json)

Root owns integrated full-suite/build/browser verification and the final local URL. GP-02/UI-04 lesson presentation belongs to TERRA. Broader ramp timing retunes and cruise-speed changes remain deliberately deferred because current behavior was preserved and no comparative player benefit established.
