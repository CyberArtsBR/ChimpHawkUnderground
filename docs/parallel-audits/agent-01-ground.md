# StreetSkate — Agent 01: Ground Physics & Fakie Audit

- **Starting `main` SHA:** `ff33677541f61b803901ac37c2465226799ec8a3` (2026-10-09).
- **Isolation:** `audit-fix/01-ground-fakie`, PR into `main`; never merge or deploy from this branch.
- **Ownership:** Only `src/game/core/GroundMotor.js`, this document, and `tests/agent01-ground-fakie.test.mjs` changed. No other agent files touched.

## Confirmed issues and corrections

### 1. Pre-existing `ground steering owns the complete park carve curve` failure

The legacy runtime's `stepGround` uses `lerp(2.7, 1.2, abs(speed) / 12)` for steering rate. The Phase 1 extracted GroundMotor instead used `steerFullSpeed: 17`. At 12 m/s, the existing regression expects the full high-speed rate `1.2`, but the motor interpolated to ~`1.641`, so the mismatch was real, not a faulty assertion. Restored `steerFullSpeed: 12`. This preserves the existing test expectations and keeps high-speed park carving controlled. `turnGainFullSpeed` remains 17; it is a separate gain curve and was not changed.

### 2. Fakie down+turn silently triggered hard braking

`groundControlIntent` checked `speed >= sharpTurnMinSpeed` even though ground speed is signed relative to deck orientation. When rolling fakie at -8 m/s, Down+Left/Right could never satisfy this branch, so it became a brake command. Changed to `Math.abs(speed) >= sharpTurnMinSpeed`, giving the same deliberate sharp-carve semantics in regular and fakie. Down alone, Shift brake, and steep near-stall rollback remain unchanged.

### 3. Fully braking in fakie returned signed negative zero

The pure propulsion transaction used `Math.sign(nextSpeed) * Math.max(0, remaining)`, which returns `-0` for a stopped reverse-rolling skater. JavaScript's strict assertion semantics and state serialization distinguish this boundary in some paths. Canonicalize a fully stopped board to `+0` regardless of previous travel sign; strictly preserve real negative speed while moving. The new braking test detects this edge case.

## Invariants preserved

- Ground steering yaw is player-authored; collision normals, camera heading, and deck-facing alignment do not become steering inputs.
- Explicit 180 rotates deck facing, **not** the velocity's world travel. The landing pipeline derives `rollingSign` and `fakie` from velocity vs deck heading.
- Ground motion holds a signed deck-tangent speed, preserves neutral rolling and uphill arcade gravity scaling, and respects hard brake and speed cap.
- This patch does not change ground-to-air contact authority, wheel support, collision response, jumping, score, or camera.

## Added regression coverage

`tests/agent01-ground-fakie.test.mjs` verifies:
1. full park-speed steering curve at 0, 6, 12, 17 and -12 m/s;
2. sharp carve vs brake in both rolling signs, and Down-only braking;
3. steep near-stall rollback in both signs;
4. real `StatefulSkillStreetPhysics.land()` on a flat fixture after 180: original travel continues in fakie;
5. 360 landing retains regular travel;
6. left/right world-space response parity in regular vs fakie;
7. travel-sign detection independent of camera;
8. uphill/downhill momentum and hard brake;
9. bounded neutral/overspeed drag across 30/60/120/144 Hz integration steps.

Run locally:
```sh
npm ci
node --test tests/agent01-ground-fakie.test.mjs tests/ground-motor.test.mjs tests/fakie-camera-speed.test.mjs
npm test
npm run verify:physics
npx vite build
```

## Validation and pre-existing regressions

The **GitHub PR workflow** (`.github/workflows/phase1-core-ci.yml`) runs all tests, physics verification, Vite bundle, and browser smoke on PRs to main. Track its actual results via the PR checks. No local repository checkout or dependencies were available to this chat runtime, so do not claim local npm, physics verification, build, or gameplay FPS passed without workflow evidence.

First PR workflow run [37917393784](https://github.com/CyberArtsBR/StreetSkate/actions/runs/37917393784) executed `npm test`: **352 passed, 2 failed**. The original `ground steering owns the complete park carve curve` test passed, and 8 of 9 new Agent 01 tests passed. The ninth exposed reverse-speed `-0` and led to the concrete canonical-stop fix above, rather than weakening the assertion. The other failure was the pre-existing `9. low-speed capture does not create large fake speed` test in grind capture (expected 0.21, actual 8.5), outside Agent 01 ownership. A follow-up CI run is required to verify the updated branch. The initial workflow skipped physics verification and production build due to the failed unit-test prerequisite.

## Integration requests / remaining risks

- Do **not** overwrite Agent 01's `GroundMotor` changes with older ramp or speed-tuning files.
- `src/game/StableBoardContactSkillStreetPhysics.js` (outside ownership) rebuilds velocity along deck forward after accepted wheel support and may convert a collision slide's lateral momentum into longitudinal speed. A different agent should verify wall/corner behavior; this branch does not broaden collision authority.
- `CoreSkateController.syncTravel` writes `runtime.fakie` from `PlayerState.fakie`, which derives geometric deck/travel alignment, while `resolveTravelState` retains `rollingSign` near zero speed. Very low-speed/perpendicular velocity edge cases merit an integration-level invariant test before introducing angular sign hysteresis. No unreviewed extra deadzone was added here.
- High-speed ramps, landings, grounded/airborne flicker, wheel probe details, and browser game feel still require live playtests and replay/CI verification. No deployment performed.
