# StreetSkate Phase 1 — Readiness Checkpoint

Date: 2026-10-07

## Production integration update

The user subsequently requested merging and deploying the completed branch to `main` without further tests. The production integration includes branch head `fba85cc2c622aeb3d50c0a88477a4364667c1777`. Build and validation commands are now separate so deployment compiles only. No new gameplay, replay, browser, physics, or benchmark results are claimed for this integration.

The checkpoint, validation evidence, and pre-merge recommendations below describe the earlier staging state; they are retained as historical context.

## Safety / branch status

Production `main` remains unchanged:

- main SHA: `b9d657ad813975857219dab37089dd2ec96ccb24`
- Phase 1 branch: `refactor/core-skate-controller-v1`
- validated Phase 1 SHA: `01f3b5f4a76a24c9e148f45b7d340f53d89b333b`
- branch relationship at checkpoint: **203 commits ahead / 0 behind** main
- no Phase 1 commit has been merged into production
- original Insanity-inspired arena remains the production arena
- `halfpipenew.glb` remains unused by production

## CI evidence

GitHub Actions Phase 1 Core CI run #193 passed on the exact validated SHA.

Validation results:

- Node unit + deterministic replay suite: **274 / 274 passed**
- failures: **0**
- board physics verifier: **15 / 15 passed**
- vert verifier: **20 / 20 passed**
- pumping verifier: **15 / 15 passed**
- Vite production bundle: **passed**
- production build time reported by CI: **1.91 s**

These are automated/deterministic results. They are not a substitute for a manual browser gameplay pass.

## Final active runtime chain at this checkpoint

```text
StreetSkater
└─ StatefulSkillStreetPhysics
   └─ StableRampReturnSkillStreetPhysics
      └─ ArcadeParkMobilitySkillStreetPhysics
         └─ SafeCopingExitSkillStreetPhysics
            └─ DeckAwareRampExitSkillStreetPhysics
               └─ RampWallSafetySkillStreetPhysics
                  └─ MomentumRollSkillStreetPhysics
                     └─ StableBoardContactSkillStreetPhysics
                        └─ BoardContactSkillStreetPhysics
                           └─ SkillStreetPhysics
                              └─ StreetPhysics
```

The chain is still compatibility-based, but several former gameplay-authority levels have been removed from the active runtime.

## Compatibility shells no longer in the final runtime chain

- `YawStableStreetSkater` — alias only; presentation basis lives in `StreetSkater`
- `NoAutomaticYawSkillStreetPhysics` — compatibility observer only
- `WallContactAuthoritySkillStreetPhysics` — alias only
- `IntegratedRampSafetySkillStreetPhysics` — alias only
- `BowlLandingSkillStreetPhysics` — standalone compatibility/regression class
- `BaseStatefulSkillStreetPhysics` — compatibility wrapper
- `UnifiedRampFeelSkillStreetPhysics` — compatibility wrapper
- `TransitionGuide` — parity/regression oracle, not runtime transition authority

## Canonical composition root

`CoreSkateController` now owns or coordinates the canonical services for:

- `PlayerState`
- `TransitionController`
- `CollisionResolver`
- semantic Ollie / pump / vert / grind-out command interpretation
- canonical travel synchronization
- remembered ramp-energy sampling
- takeoff-context orchestration

New gameplay authority should attach to this composition root instead of creating another physics subclass.

## Phase 1 requirements status

### 1. Refactor the inheritance tower

**Substantially complete for Phase 1.**

The active chain is shorter, dead/alias-only layers were removed from runtime, and new authority is composition-first. Behavior-bearing compatibility layers remain intentionally until browser/staging parity is proven.

### 2. One authoritative transition/ramp controller

**Complete.**

`TransitionController` owns authored transition identity, approach/launch detection, begin/advance trajectory and presentation-normal behavior. `TransitionGuide` is an oracle only.

### 3. Metadata for skateable transitions

**Complete for the current production park coverage used by Phase 1.**

Explicit authored areas include:

- bowl
- western vert
- rear mini north
- rear mini south
- eastern quarter
- central hip
- south spine
- east bank

Ordinary rails remain grind-only.

### 4. Deterministic gameplay replay tests

**Complete for Phase 1 acceptance.**

Covered scenarios include:

- baseline fixed-step determinism
- passive ramp return
- explicit 180 return
- authored transition identity / trajectory parity
- wide-deck coping transfer
- narrow-deck / abort-to-return
- high-speed wall impact
- air-to-manual bridge
- repeated pump loop
- generic bank/kicker ramp-memory big air
- landing yaw invariant

### 5. Consolidate heading / fakie / stance / travel

**Complete at the canonical/compatibility boundary.**

`PlayerState` + `TravelState` own the canonical relationship. Fakie is derived from deck facing vs world travel. Legacy fields remain synchronized compatibility outputs.

### 6. Unify ramp energy + pumping + Ollie launch

**Complete for Phase 1.**

`LaunchEnergyModel`, `TakeoffContext`, `InputInterpreter`, and the Core controller own the transaction. Duplicate lower ramp boosts were removed.

The replay work also found and fixed a real pump-release ordering bug: compression hold time is now preserved through the release decision before being cleared.

### 7. Continuous collision / clipping

**Composition and regression coverage complete for Phase 1.**

`CollisionResolver` explicitly returns position / velocity / contacts and has no yaw authority. High-speed tests cover approximately 3 / 6 / 9 / 12 / 15+ m/s plus thin-solid regression coverage.

More production-park browser testing is still required for visual/body clipping.

### 8. Semantic input authority

**Complete for the Phase 1 Ollie/pump/vert/grind-out conflict.**

Raw release meaning is resolved once through the InputInterpreter/Core controller.

### 9. Migration instead of giant rewrite

**Complete and enforced.**

Legacy compatibility files remain where useful; runtime authority moved incrementally behind tests.

### 10. Keep production safe

**Complete for this phase.**

No Phase 1 code has been merged or deployed to production.

## No-contact-yaw invariant

The old automatic wall/coping/contact yaw behavior has been removed from:

- final runtime wall recovery
- coping re-entry alignment
- transition contact alignment
- landing executor
- StableBoardContact
- lower `SkillStreetPhysics.resolveMotion()`

Collision may alter position and world-space velocity/slide, but may not rewrite horizontal board heading.

Deterministic replay fails if `landingYawInvariantViolations > 0`.

## Important remaining gate: browser / staging playtest

Phase 1 is **code/CI ready for gameplay validation**, not production-approved.

Before merge, test the branch in a browser/staging build against the real production park, especially:

1. flat push / carving / braking
2. every authored quarter / mini / bowl / vert
3. passive same-wall return
4. explicit 180 / 360
5. pump timing and repeated pump loop
6. generic bank/kicker big-air launch
7. coping transfer and abort-to-return
8. grind capture
9. manual bridge
10. walls / rails / stair sides / ledges at high speed
11. camera during approach, vert reversal and landing
12. visible board/rider orientation at near-vertical coping

The Game Development Studio sealed GPU/performance CLI is unavailable in the current environment, so no sealed GPU/frame-time claim is made.

## Merge rule

Do **not** merge this branch to `main` until the browser/staging gameplay pass is accepted.

If a staging issue is found, fix it on `refactor/core-skate-controller-v1`, rerun the complete Phase 1 CI, then retest staging before merge.
