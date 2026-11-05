# StreetSkate Agent 06 — AAA Third-Person Camera Audit

**Branch:** `audit-fix/06-camera`  
**Baseline main SHA:** `ff33677541f61b803901ac37c2465226799ec8a3`  
**Scope:** camera-only code, new Agent 06 tests, and this audit. No main edits, merge, deployment, physics, collision, character, UI, or `game-main.js` edits.

## Baseline findings and fixes

| Area | Before (verified in baseline) | After (Agent 06) |
| --- | --- | --- |
| High-speed chase | Fixed horizontal follow rate (`9.5 s⁻¹`), with `1.4 m` maximum tripod lag; no speed-aware look-ahead | Time-exponential smoothing accelerates as horizontal velocity increases, capped at an additional `9 s⁻¹`. Ground look-ahead grows by up to `0.85 m`, without moving the physics body |
| Ground/fakie direction | Any grounded sample with sufficiently horizontal contact normal could replace canonical travel with instantaneous velocity, even during a rebuilt velocity/trick frame | Canonical `travelDirection` remains authoritative. Only a `justLanded` sample with meaningful horizontal velocity may resolve conflicting stale travel |
| Coping reversal | High Follow could reframe with `18 s⁻¹` yaw smoothing even toward the opposite ramp direction | Normal return reframe `8 s⁻¹`; near-180° returns use `2.4 s⁻¹` |
| Landing recovery | Misaligned post-landing travel could prevent `returnHold` from ever decreasing; camera could stay permanently attached to the last vert direction | Return hold always decays and releases faster when the current travel aligns or steering/exiting is deliberate |
| Air/wallride composition | Ordinary air had one high frame; wallride had no specifically elevated composition | Wallrides request higher framing (`6.1 m` above arm anchor), retaining useful speed lead and more clearance |
| Shortened camera ray | The camera could expand a collision-shortened ray to `minArm` even when the expanded position had never been verified by the collision solver | Camera always applies the collision-verified distance or less. No untested extension; obstacle removal recovers via exponential smoothing |
| Emergency fallback | A raised camera position was returned without a successful surface-probe if other samples failed | Unverified fallback removed. Candidate positions are probed through `surface.camera`; a fully enclosed level returns the best verified but possibly subminimum available ray |
| Clearance probing | Solver searched alternatives only when under a hard-coded `1.8 m`, independent of a larger rider/wallride minimum | Solver honors dynamically requested `2.35 m` normal / `3.3 m` wallride minimum and tests elevated, fixed-axis, and alternate angles where applicable |
| Fixed camera | Fixed world-axis chase already present | Preserved; fixed never follows deck rotation and clearance search uses no alternate azimuths |
| First person | Previously intentionally removed | Not reintroduced; Follow, Classic, Fixed only |

### Implementation notes

- Camera input is a read-only-by-copy presentation snapshot. No physical heading, contact normal, wheel support, trick state, or collision geometry is modified.
- Distance and position blending use `1 - exp(-rate * dt)` so smoothing is stable for varying frame times.
- Camera yaw is based on canonical world travel, not the animated deck's current facing direction.
- Surface-normal changes do not directly rotate the camera. The `yawStableSurfaceBasis` implementation in `core/PresentationOrientation.js` already separates contact tilt from authored yaw and was intentionally left untouched.
- The viewer remains visible even when the camera cannot meet its desired clearance. Fully enclosed geometry cannot guarantee a safe minimum arm; the resolver does not invent a collision-free position. Such level meshes require authored camera blockers/occluders or geometry fixes.
- Existing camera configuration, export names, public `update(player, dt, input)`, `snap`, and `setMode` remain compatible.
- No new runtime dependency.

## Changes

- `src/game/FollowCamera.js` — speed-aware tracking/look-ahead, vertical and wallride composition, bounded coping turn, finite landing-hold recovery, safe camera distance, and visibility preservation.
- `src/game/CameraClearance.js` — configurable clearance threshold and verified candidate solver; no unchecked fallback.
- `src/game/core/CameraState.js` — canonical travel priority and landing-only correction; wallride/speed snapshot signals.
- `tests/agent06-camera.test.mjs` — 17 targeted unit/regression cases.
- `docs/parallel-audits/agent-06-camera.md` — this report.

## Automated regression coverage

Agent 06 tests include straight travel, max follow lag at high speed, bounded predictive look-ahead, deck 180/fakie, 90-degree steer, abrupt world-travel reversal, bowl carving with near-vertical normals, coping launch, mismatched ramp return, wallride camera elevation and rider visibility, bail yaw freeze, reset/snap, Fixed no-orbit, presentation snapshot isolation, 30 vs 120 Hz invariance, angular interpolation equivalence, and fully obstructed collision rays.

Existing tests provide additional coverage in:
- `tests/camera-state.test.mjs`
- `tests/fakie-camera-speed.test.mjs`
- `tests/unified-ramp-camera-feel.test.mjs`
- `tests/yaw-stable-presentation.test.mjs`

**CI result (PR #10, Phase 1 Core CI run 37918019507):** `npm test` ran 362 cases: **360 passed, 2 failed**. **All 17 Agent 06 camera tests passed.** The two failures were outside this branch's owned and modified paths: `tests/grind-manual.test.mjs:76` (`projectedGrindSpeed`, expected 0.21 but received 8.5) and `tests/ground-motor.test.mjs:93` (park carve curve assertion). Agent 03 and Agent 01 own those respective systems; they were left unchanged. The overall CI workflow is **red**, so `npm run verify:physics`, `npx vite build`, and browser smoke were **skipped** rather than verified. Local execution was unavailable because the authoring environment has no repository checkout or installed `three` dependency.

## Manual browser QA checklist

1. Run Follow / Classic / Fixed through an ordinary straight cruise at both slow and fast speed; inspect lead and lag.
2. Land a 180 into fakie, then carve a broad 90, watching that the camera follows travel, not the board nose.
3. Ride a bowl high enough to meet the coping, return downhill, and repeat in quick sequence; verify no whipping/spinning or indefinite hold.
4. Launch vertically into an aerial trick, land back in transition, and verify sufficient runout ahead.
5. Test wallride, curved rails, and posts against the near-plane camera, including narrow passages.
6. Bail and respawn from distant locations; verify rider remains visible and there is no old position/occlusion memory.
7. Compare 30/60/120 FPS using browser throttling while turning and returning from a ramp.
8. Repeat in narrow spaces; report cases where geometry does not expose any collision-safe minimum clearance.

## Integration needs for other agents

- Agent 01 ground/fakie: preserve the semantics of `player.travelDirection`, `player.justLanded`, and `player.velocity` so presentation has stable world-travel information.
- Agent 02 vert: maintain `player.transitionAir.frame.rampInward` as a meaningful ramp-inward horizontal direction; this is a **suggested camera-facing vector**, not a forced yaw.
- Agent 04 collision: `player.surface.camera(anchor, desired, radius)` must return a collision-verified point along the ray from `anchor` toward `desired`. Do not silently change that contract.
- Animation agent: may modify visible poses independently; camera never hides `player.visual`.
- Integrator: resolve any shared semantics in the camera snapshot, but do not merge unrelated collision/physics changes into this isolated PR without review.

**Remaining risk:** These are code-level fixes and regression tests, not a claim of gameplay footage verification. Camera obstruction in fully enclosed geometry remains limited by the actual collision mesh. Tune the exported `THPS_CAMERA` rates only after playtesting the new warehouse and existing bowls.
