# Agent 03 — Grinds, Manuals, Trick Chaining

## Isolation
- Repository: `CyberArtsBR/StreetSkate`
- Branch: `audit-fix/03-grinds-tricks`
- Main baseline SHA: `ff33677541f61b803901ac37c2465226799ec8a3`
- Scope: only the user-assigned grind/trick files, new `tests/agent03-*.test.mjs`, and this report. No changes to ground physics, wheel contact, character IK, camera, CI workflow or main.

## Confirmed issues / corrections
1. **Severe low-speed artificial acceleration:** `GRIND_CAPTURE.antiStallSpeed` was 8.5 m/s. `projectedGrindSpeed(0.21)` returned 8.5 and `SkillStreetPhysics.stepGrind` re-applied the same 8.5 floor every step. This directly contradicts the existing CI test `9. low-speed capture does not create large fake speed`. The guard is now only 0.12 m/s (below the lowest eligible capture speed), and running grinds decay under slope gravity and friction toward 0. A grind exits once it stalls (<=0.10 m/s). No free drive-on-rail acceleration was added.
2. **Sharp tangent discontinuities on curved rails:** `RailNetwork.sample()` previously switched to the next line-segment tangent instantaneously at each polyline vertex, abruptly rotating velocity and board direction. The contact position is left exactly on the authored rail; tangent direction is blended over <=0.16m near adjacent vertices, including closed rails.
3. **Grind switch scoring exploit:** `grindChange` could instantly award a new base trick and multiplier without the board moving. Rail changes now need both >=0.20 s since the prior change and >=0.38 m along the rail. Existing directional inputs and trick catalog remain unchanged.
4. **Duplicate trick-scoring edges:** back-to-back identical `SkateTricks.record` calls within 0.14 s previously granted extra multiplier credit. Identical same-stance events in that window now reuse the existing entry. Later real repetitions still use the established diminishing-repeat weights (1 / 0.75 / 0.5 / 0.25 / 0.1). Existing combo scoring engine is retained.
5. **Stale manual movement mode:** `SkillStreetPhysics.endManual()` cleared manual state without explicitly returning grounded movement mode to GROUND. It now restores GROUND on a normal grounded manual release. Bails still follow the established bail flow.

## Investigation notes
- Canonical rail capture is `CoreSkateController.enterGrind() -> resolveGrindCapture() -> applyGrindEntry()`; `RailNetwork.capture()` is a legacy compatibility query, not the gameplay authority.
- Strict-first capture and magnetic fallback remain intact; transverse specialty grind angle profiles are not broadened.
- 50-50 still uses front and rear truck offsets; 5-0/Nosegrind use respective rear/front truck offsets, while Boardslide uses deck center and transverse visual yaw. Clearance continues to use `railSurfaceHeight(centerY, radius, profile.clearance)`.
- Ollie Out and its existing air departure/cooldown are unchanged. Airborne directional manual queuing, combo preservation through landing, and balance failures are covered by new regression tests.
- Rail-to-rail magnetic auto-transfers and a wholesale scoring-system rewrite were deliberately **not** added; both would need a larger collision/surface-authority design review with other agents.

## Regression coverage
- `tests/agent03-grind.test.mjs`: low-speed entry + applied entry speed, high-speed projected entry, perpendicular rejection, contact types, curved tangent continuity, rail-end release, low-speed stall, anti-spam grind trick switches.
- `tests/agent03-combo.test.mjs`: manual -> Ollie, grind -> airborne manual bridge, rail balance failure, duplicate award prevention, one-shot combo bank, bail combo cancellation, clean manual end.

## Integration contract
- No new public methods, input buttons, exports or catalog tricks.
- `GRIND_CAPTURE.antiStallSpeed` remains exported for compatibility but now equals **0.12** instead of 8.5; dependent physics/tuning snapshots expecting 8.5 must be updated, not the value reverted.
- `runtime.grind` has two new fields: `lastSwitchTime` and `lastSwitchS`. They are initialized on entry, and old/save states without them use safe fallback values.
- `SkateTricks.record` combo entries now carry `recordedAt` (simulated time); any external combo serializers may retain or ignore it. Input mapping and multiplier formula are unchanged.
- `RailNetwork.sample().point`, `s`, `radius`, and `clearance` remain unchanged; tangent is now smoothed near vertices. Other agents should not reintroduce an unbounded rail speed floor.
- Suggested integration playtests: rail contact height on narrow deck slides; quick double-tap grind upgrades after >=0.2 s; manual rides across mixed polygon boundaries; concave curved rails; near-stop rail exits; rail-to-rail transitions after deliberate Ollie Out.

## Validation
- PR #9 GitHub Actions run: https://github.com/CyberArtsBR/StreetSkate/actions/runs/37917946701
- **360 tests executed: 359 passed, 1 failed. All 15 new Agent 03 tests passed.**
- The sole failure is `tests/ground-motor.test.mjs` ("ground steering owns the complete park carve curve", assertion near line 102). Neither that test nor `src/game/core/GroundMotor.js` is changed in this branch. It must be handled by the separate ground-physics owner/integrator rather than editing unowned files.
- Because `npm test` failed, this CI workflow skipped `npm run verify:physics`, `npx vite build`, and browser smoke. **Do not claim the build or physics verification passed.**
- Subsequent documentation commits may rerun CI; use the current PR checks for the latest status.
