# Agent 04 — Contact, collision and board physics audit

- Baseline `main`: `ff33677541f61b803901ac37c2465226799ec8a3` (2026-10-09)
- Isolated branch: `audit-fix/04-contact-collision`
- Ownership: collision subsystem, board contact rig, contact-skill adapter, Agent04 tests and this document
- Constraint: no changes to `main`, movement controllers, transition code, rider animation, or park generation

## Findings and targeted fixes

### High — wall face can be hidden by floor overlap in sphere sweep

`ParkCollision.sweepSolidSphere` chose the deepest sphere-triangle penetration **before** filtering rideable/up-facing contacts. A wheel/deck probe overlapping both a floor and a thin ledge riser could select the floor, reject its normal, and skip the legitimate ledge hit at that sample.

**Fix:** filter invalid candidate normals before comparing penetration depths. An optional `maxAbsNormalY` seventh parameter (default `Infinity`, API-compatible) allows deck probes to request near-vertical blockers explicitly. `StableBoardContactSkillStreetPhysics.resolveSharpDeckClearance` now supplies `0.08`, consistent with `isSharpDeckBlocker`. Rail ignore IDs and the legacy generic sphere sweep continue to work.

### Medium — excessive single-wheel correction

`SkateboardContactRig._finishSupport` could apply a full probe-distance snap to the entire rigid board despite only one wheel having support. The existing game deliberately allows partial contacts at ramp lips, so **one contact is still retained** for the release policy; only the position correction on that degenerate frame is limited to 45 mm down / 35 mm up. Multi-wheel correction is unchanged.

`clearContacts()` now also resets nose/tail clearance flags to avoid stale debug/contact state on takeoff or a new grind.

### Medium — per-step body solver allocations, potential repeated penetration contacts

The swept capsule solver previously allocated new axis, before, capsule endpoints, candidate list and previous center vectors in each substep and iteration. It also kept the capsule endpoints at the pre-correction position during subsequent penetration iterations.

**Fix:** reuse per-instance scratch vectors and broadphase candidate array, update capsule endpoints after positional separation, and clone only normals included in returned public contacts (which must not alias reusable scratch). The body collision response retains its existing math and yaw-free API. Peak savings depend on obstacle density, speed and substep count; no numeric FPS claim is made without an in-game profiler.

## Verification

New `tests/agent04-contact-collision.test.mjs` covers:

1. Four wheel flat support, finite pitch/roll, stationary jitter.
2. Flat-to-bank support with changing normal.
3. Curved bowl/ramp surface normal continuity.
4. Geometry seam with two separate meshes.
5. Mixed-height left/right support and board roll.
6. True ground contact loss and re-entry.
7. Single-wheel correction clamping.
8. Floor overlap vs sharp wall collision selection.
9. Horizontal rideable floor exclusion from sharp deck probes.
10. Active coping rail ignore by ID.
11. Thin wall blocking with large motion / extreme delta (0.2 s) and yaw-free results.
12. Descending hard landing with front and rear supports.

Existing CI on pull requests to `main` executes `npm test`, `npm run verify:physics` (board, vert, pumping), `npx vite build`, then browser smoke. Use actual CI results as verification evidence; do not treat these scenarios as passed until GitHub Actions reports success.

## Audit inventory — deliberately unchanged

- **Four-wheel geometry:** the production GLB contact rig already separates wheel contact points from the visible mesh and has front/rear support reporting; no wholesale remeasurement of the asset is justified without examining the binary geometry.
- **Wheel radius / truck clearance:** wheel contact Y and deck underside Y already exist separately in `StreetBoard.deriveContactRig`. Numerical retuning is deferred pending asset-level inspection.
- **BVH / spatial index:** mesh raycasts use a static BVH and solid capsule/sphere queries use `BlockTriangleIndex`. The performance change is scratch reuse, not a spatial-index replacement.
- **Rail and coping:** the existing `ignoreRail` contract is preserved.
- **Ground/air authority:** no fake support contacts were inserted and no character IK was changed.
- **High-speed tunneling:** capsule substepping and ray-first sphere sweep are preserved. Swept collision at 0.2 s is covered; arbitrary unbounded time steps remain an engine-level integration concern.

## Integration notes for other agents

- Agent 01 (ground/fakie): `ParkCollision.move()` public signature/return shape and collision headings are unchanged. Continue passing real previous/current position and velocity.
- Agent 02 (vert/pumping): one-wheel position corrections are smaller; lip-release still sees `count=1` and the existing supported truck. If transitions call `snapToGround` with only one wheel, no longer expect a deep vertical snap.
- Agent 03 (grinds): pass `ignoreRail` for active grinds; unchanged semantics.
- Agent 05+ (animation/presentation): do not compensate collision errors with IK or visual board offsets.
- The new optional `sweepSolidSphere(..., ignoreRail, maxAbsNormalY)` seventh parameter defaults to legacy behavior. Use it only when a caller genuinely wants specific obstacle normal classes.

## Follow-up investigations

- Measure average per-frame raycasts and substep/candidate counts on the largest warehouse park and compare identical replay traces before/after the scratch change.
- Confirm the loaded skateboard GLB's four wheel extrema and truck placement against its contact-rig metadata, particularly under nonuniform scale.
- Examine complex overlapping visual-only ramp triangles versus physical collision proxies in the actual warehouse GLB before broadening collision registration.

## GitHub Actions evidence (2026-10-09)

- [PR validation run 37917882278](https://github.com/CyberArtsBR/StreetSkate/actions/runs/37917882278), at code commit `b715a6c505a46bade7410ad5178651877ea1f37b`.
- New deterministic scenarios: **12/12 PASS**.
- Official board verification executed by `tests/agent04-board-verifier.test.mjs`: **15/15 PASS**, despite the unrelated failures below.
- Entire Node suite: **356/358 PASS; 2 FAIL**. Consequently, the normal sequential verify:physics, Vite build, and browser smoke jobs were skipped by CI. Do not report those as passing.

### Unchanged baseline failures (handoff; do not modify outside ownership)

1. **Agent 03 / grinds** — `tests/grind-manual.test.mjs:77` expects `projectedGrindSpeed(0.21) === 0.21`, while unchanged `src/game/SkateSystems.js` sets `GRIND_CAPTURE.antiStallSpeed=8.5` and clamps speeds to that minimum; observed `8.5`.
2. **Agent 01 / ground steering** — `tests/ground-motor.test.mjs:102` expects the high-speed steering rate at speed 12, while unchanged `src/game/core/GroundMotor.js` interpolates to that rate by `steerFullSpeed=17`. Decide whether the source or assertion reflects the intended carve curve.

Neither failure is in an Agent04-changed file. These source/test inconsistencies are visible in the unmodified baseline, although a clean baseline CI run was not independently executed here.

No measured FPS/GC benchmark was run; scratch-allocation reduction is an implementation change, not a claimed numeric performance gain.
