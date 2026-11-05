# StreetSkate Phase 1 — Migration Status

Branch: `refactor/core-skate-controller-v1`

Production `main` remains untouched by this refactor branch.

Status: **CORE REVIEW CANDIDATE — NOT MERGED / NOT DEPLOYED**

Latest validated gameplay/test head before this documentation-only commit: `2b72a381279c52bd8161e4856d132ede1935e14c`.

Current production `main` is still the original Phase 1 baseline: `b9d657ad813975857219dab37089dd2ec96ccb24`. There are no concurrent production changes to reconcile at this checkpoint.

## Canonical authorities active in runtime

### TransitionController

`TransitionController` owns authored transition selection, canonical IDs/types/capabilities, approach/launch detection, vert begin/advance trajectory and presentation normal. `TransitionGuide` remains a compatibility/regression oracle only.

### InputInterpreter

Ollie release semantics are interpreted once. The interpreter owns ollie, pump, vert ollie, grind ollie-out, blocked-pump and air-release meaning.

### TravelState

`resolveTravelState()` is the canonical derivation for world travel direction, signed travel relative to the deck and fakie. Legacy `rollingSign`, `fakie` and `travelDirection` remain synchronized compatibility outputs.

### LaunchEnergyModel

Ramp launch energy has one authority. Lower layers no longer inject an independent second ramp boost.

### TakeoffContext

`captureTakeoffContext()` is the canonical read-only pre-launch facts boundary. It derives/captures player-authored takeoff facing/heading/stance, current and remembered ramp bonus, composed impulse, ramp context, buffered exit intent and canonical transition identity.

`UnifiedRampFeelSkillStreetPhysics.takeoff()` consumes it for energy/ramp context. `StableRampReturnSkillStreetPhysics.takeoff()` consumes it for facing/heading/stance while passing the received impulse through unchanged, so energy cannot be composed twice.

### TransferLaunchResult

`TransferLaunchResult` is the canonical post-takeoff launch-decision model for the three historical stages:

1. controlled coping/deck transfer profile;
2. real-deck target or missing-deck abort;
3. narrow/unsafe-deck conversion to same-wall return.

Runtime ownership is now split by responsibility rather than duplicated math:

- `RampWallSafety.takeoff()` applies `resolveControlledTransferLaunch()`;
- `DeckAwareRampExit.takeoff()` keeps the real collision-deck scan as geometry evidence, then applies `resolveDeckAwareTransferLaunch()`;
- `SafeCopingExit.takeoff()` applies `resolveSafeCopingTransferLaunch()` / canonical deck-fit rules.

The actual collision deck scan intentionally remains a geometry service in `DeckAwareRampExit`; the launch decision math no longer lives there independently.

### TransferFlightResult

`resolveTransferFlightStep()` is the single airborne transfer-flight authority for:

- generic controlled transfer;
- geometry-aware verified-deck targeting;
- abort-to-return flight.

`RampWallSafety.advanceControlledTransfer()` is the one runtime executor. `DeckAwareRampExit` no longer owns an override; a structural regression test fails if that second authority is reintroduced.

### LandingPolicy

Deck/coping routing has canonical priority:

1. verified original-transition return;
2. abort-to-return;
3. deck-target rejection;
4. standard landing.

### LandingResult

Landing acceptance is pure and canonical. `evaluateTransitionLanding()` handles forgiving bowl/ramp/deck-exit contact; `evaluateStableLanding()` handles stricter base/full-support contact. Contact geometry never returns heading/yaw.

### LandingExecutor

Accepted touchdown mutation is centralized in `applyAcceptedLanding()` and shared by stable/base, bowl and ramp/deck-exit paths. It preserves player-authored heading.

### LandingPostPipeline

Post-landing behavior is composed once after accepted landing instead of depending on nested `super.land()` ordering. It owns yaw invariant observation, re-entry steering lock, ramp orientation from takeoff-facing + explicit spin, incoming travel reconstruction, canonical travel/fakie sync and pump landing bookkeeping.

The direct `StableRampReturn` compatibility path also defers nested legacy post hooks and runs this pipeline exactly once.

### Orientation invariant

Automatic wall/coping/landing yaw writers have been removed from runtime. Deterministic replay requires `landingYawInvariantViolations === 0` on every captured frame. Contact may change support normal, pitch/roll, position or velocity; horizontal yaw remains player-authored.

### CollisionResolver

Body/capsule collision is consumed through an explicit result boundary. The validated `ParkCollision.move()` substep solver remains underneath, while `CollisionResolver` returns position/velocity/contacts and exposes no heading/yaw field. Regression coverage includes solid-wall collision at 3/6/9/12/15 m/s.

### CameraState

`FollowCamera` consumes a copied/read-only camera state snapshot rather than reading mutable gameplay vectors throughout its update. Camera collision is presentation-only and cannot feed back into physics.

## Inheritance reductions completed

- `IntegratedRampSafetySkillStreetPhysics` became a compatibility alias instead of an empty prototype level.
- `WallContactAuthoritySkillStreetPhysics` became a compatibility alias; broad-wall 90-degree turn authority is gone.
- automatic wall-turn execution was removed from `MomentumRoll.stepGround()`.
- coping/transition contact auto-align methods no longer write yaw.
- `NoAutomaticYawSkillStreetPhysics` is no longer part of the final runtime inheritance chain.
- stable/base, bowl and ramp/deck-exit landing mutation share one executor.
- post-landing orientation/travel/re-entry/pump work is composed once through `LandingPostPipeline`.
- pre-launch energy/orientation facts consume `TakeoffContext`.
- post-takeoff transfer launch decisions consume `TransferLaunchResult`.
- airborne transfer stepping consumes `TransferFlightResult` through one runtime method.
- `DeckAwareRampExit` no longer has its own `advanceControlledTransfer()` override.

## Deterministic / regression gates active

Coverage now includes:

- byte-identical fixed-step replay baselines;
- finite canonical state and zero landing-yaw violations per frame;
- passive same-wall ramp return: no spin, yaw preserved, final fakie;
- explicit 180: player-authored rotation preserved and stance/travel resolved correctly;
- geometry-aware verified-deck transfer;
- abort-to-return reconnect;
- full runtime transfer takeoff: wide real deck stays transfer, narrow real deck becomes return;
- deterministic repeated transfer takeoff construction;
- generic/deck-target/abort-return transfer-flight fixed-step parity;
- structural assertion that DeckAware cannot own a second transfer-flight method;
- broad solid-wall collision at 3/6/9/12/15 m/s;
- one canonical travel sync per accepted landing;
- flat ollie/ramp-memory/transition takeoff context coverage;
- board, vert and pump dedicated verifiers;
- production bundle on every Phase 1 CI run.

## Current invariants

- No ramp, coping, wall, rail or collision contact may create horizontal yaw.
- Explicit air spin is the only airborne yaw input.
- Ground steering is the only normal grounded yaw input.
- Fakie is derived from deck heading versus travel.
- Transition identity must be authored and canonical.
- Ramp launch energy has one authority.
- Transfer launch decisions have one pure result model.
- Transfer flight has one runtime authority.
- Collision results contain no heading/yaw authority.
- Camera state cannot mutate physics.
- The original production arena remains active.
- This branch does not merge or deploy to production without explicit approval.

## Compatibility code intentionally retained

Historical classes/files remain where useful for regression tests and stable import APIs. Their duplicate runtime authority has been removed or reduced to compatibility seams. Notable retained items:

- `StableRampReturnSkillStreetPhysics.land()` compatibility entrypoint backed by one canonical post pipeline;
- `ArcadeParkMobilitySkillStreetPhysics.land()` compatibility re-entry-lock hook for direct subsystem tests;
- `NoAutomaticYawSkillStreetPhysics` compatibility class/file, no longer in final runtime inheritance;
- `TransitionGuide` as regression oracle;
- legacy pure wall-recovery / transfer-profile helpers used for parity/tuning tests.

## Remaining Phase 1 risk

The main remaining risk is no longer duplicate core authority; it is **integration/gameplay validation** of the refactored composition against the real rendered park.

Still required before merge:

- browser gameplay validation of each authored transition;
- repeated vert ascent/air/return lines with no spin and explicit 180/360;
- real coping transfer on wide and narrow production decks;
- grind/manual smoke tests after the core refactor;
- high-speed clipping checks on real walls/rails/coping;
- camera-feel validation during travel reversal and vert return;
- confirmation that presentation/animation still matches the canonical physics state.

The Game Development Studio sealed GPU/performance capture CLI is unavailable in the current environment, so no sealed GPU bundle or measured frame-time report is claimed here.

## Review-candidate gate

Before any merge to `main`:

1. compare against fresh current `main` (currently unchanged at `b9d657ad813975857219dab37089dd2ec96ccb24`);
2. run complete Phase 1 CI on the exact integration head;
3. obtain a staging/browser build of this branch;
4. perform the gameplay validation list above;
5. merge/deploy only after explicit approval.
