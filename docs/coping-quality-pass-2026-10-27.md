# Coping return and presentation quality pass

Developed on `codex/coping-quality-pass`, based on `fef1a78b30a6c01ad86ec0e6a8022d00f26df070`. The isolated checkout used for validation is `C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate`. Development ran at http://127.0.0.1:5180/; the production preview used http://127.0.0.1:5181/. This report records the local validation before release.

## Source and map identity

The original root checkout contained an older ORBIT runtime plus unrelated staged deletions. It was left untouched. A clean build of the remote main revision produced `index-CHCp4SgS.js`, exactly matching the deployed main bundle. Both SHA-256 values were `3e55822d51f09b80b2c98fc2ac14a0d930910b350ba53564f70cd67cf4d43c00`.

The first frame of the supplied recording identifies **Adolescent / Grand Warehouse**. Its shipped map is `public/assets/warehouse/granwarehouse.glb`, SHA-256 `fbc46ba3e414bb4380366c749fa0aa526e06328ae3bff702e956b43c37f0902c`. Tests load the real artist geometry and the production collision importer. The physics fixtures now also measure the real skateboard through the same transform routine as the browser: a 1.4868 m deck with approximately 0.676 m wheelbase. The old default 1.05 m fixture did not reproduce the same lip footprint.

## Confirmed cause and correction

The full-runtime reproduction starts at `[3, 0.1, -40.8]` in Grand Warehouse, facing the north half-pipe with 17 m/s initial travel and neutral input. Around fixed frame 253, the world-UP airborne wheel sweep detects **front-truck-only flat deck support** while the board centre is already about 0.30 m inward of the coping.

The landing policy correctly rejects that flat partial support. Previously the generic impact fallback still treated it as a floor: it set downward velocity from about −12.27 m/s to zero, clamped height near 5.747 m and cleared `transitionAir`. With the original return authority gone, subsequent front-truck hits repeatedly cancelled gravity. This produced the hovering pose and near-zero speed in the video. Body collision reported no structural blocker; this was a support-routing conflict.

`partialDeckContactDuringReturn()` now identifies this narrow case using actual truck support, measured wheel reach, board centre on the inward side, apex/return state and the original authored lip bounds. It routes that partial contact to the existing ramp-oriented re-entry solver. It does not create support, add a speed impulse or teleport the player. Full deck support, outward landings, verified transfers, grinds and structural collisions keep their existing paths. On acceptance the normal landing executor clears return state once and preserves downhill tangential momentum.

## Other changes

- Accepted flips now leave a one-use presentation snapshot for the board. An auto-catch between render frames therefore retains a completed shove-it's decorative half-turn instead of unwinding. This does not change physical heading, travel, stance or scoring.
- Camera reduced-motion mode suppresses speed-driven FOV changes and trick zoom. Travel tracking and collision clearance continue normally. The existing camera preference already survived restart and was verified rather than rewritten.
- The tutorial uses stacked labelled control cards on narrow screens, with 14 px body text and a plain readable heading. Short landscape layouts fit their footer without horizontal scrolling. Practice has a direct title entry.
- Banked feedback is bounded to the score and multiplier; detailed names remain available to session results. Plain captions distinguish **COMBO AT RISK**, **POINTS BANKED** and **TRY AGAIN**. Landing bails distinguish incomplete flips from travel alignment.
- Added an opt-in bounded fixed-step `CopingTrace`, enabled automatically only in development. It records input, before/after position and velocity, support normal, truck counts, triangle/surface identity, landing reasons and body collision decisions. Pausing a local session stores a JSON snapshot in `#local-coping-capture`. Production recording stays off unless explicitly enabled through the existing QA API.
- Updated the obsolete Solar Dock browser smoke entry point for the shipping three-map game and locked Playwright as a development dependency. Repeatable evidence and browser QA tools accompany the regressions.

The matching production source already included warehouse wear/roughness work, practical lighting, contact shadows, selective ORBIT bloom, six graphics presets, separate audio controls, tutorial skip and session previews. Those existing visual systems were retained and checked. No artist mesh, map layout, character asset or collision geometry was replaced in this pass.

## Validation

| Check | Result |
|---|---|
| Full unit/integration suite | **860/860 passed** |
| Board physics | **15/15 passed** |
| Vert verification | **20/20 passed** |
| Pumping verification | **15/15 passed** |
| Production build | Passed; existing large-chunk warning remains |
| Production browser smoke | Passed, zero uncaught page exceptions |
| Agent10 production browser release gate | Passed, 11 scenarios |
| Agent10 map and simulated gamepad gate | Passed, three maps plus menu input |
| Shipped maps | Grand Warehouse, ORBIT and Skate Paradise loaded and played |
| Graphics | All six presets exercised on all three maps |
| Responsive tutorial | 1280×720, 1920×1080, 390×844, 844×390; no horizontal overflow |
| Camera and lifecycle | Classic preference survived restart; blur paused correctly |
| Missing map asset | Clear failure message, disabled start, reload offered |

The new geometry regressions cover both warehouse half-pipe walls, a quarter, completed flip/held grab, switch and diagonal return, the recorded partial-deck case, full approaches and all ten registered ORBIT transition paths including the bowl. Fixed simulation results are checked under 30/60/120 Hz render cadences. Existing transfer, grind, landing, yaw, wall and collision tests remain passing.

Four inherited test expectations were stale against already-shipped changes: boost conversion was 0.82 rather than 0.72, the charged cap was 17 m/s rather than the older 5.63 m height ceiling, and the approved green spectral material used 0.90 opacity rather than 0.80. Their assertions were reconciled with those existing contracts; the runtime was not changed to hide those failures. Energy bounds and cap assertions remain enforced.

## Measured rendering conditions

Windows Chrome headless, ANGLE D3D11, **NVIDIA GeForce RTX 5060 Ti**, 1280×720, device/render pixel ratio 1, 120 rAF samples per map/preset after warm-up. All 18 map/preset combinations were sampled. These are short local route samples, not whole-map benchmarks or mobile performance claims.

| Map / preset | Mean FPS | p95 frame interval | Mean draw calls across render passes | Mean CPU render submission |
|---|---:|---:|---:|---:|
| Warehouse / Performance | 145.2 | 7.1 ms | 113.0 | 1.75 ms |
| Warehouse / Cinematic | 145.0 | 7.1 ms | 183.0 | 1.76 ms |
| ORBIT / Performance | 144.5 | 7.1 ms | 48.0 | 0.82 ms |
| ORBIT / Cinematic | 144.5 | 7.1 ms | 158.0 | 1.77 ms |
| Paradise / Performance | 144.5 | 7.1 ms | 144.6 | 1.93 ms |
| Paradise / Cinematic | 145.0 | 7.1 ms | 192.7 | 2.29 ms |

Shadow maps stayed at 1024². CPU submission includes shadow/render work; separate GPU shadow time was not measured. Draw counts sum actual renderer passes, rather than reading only the composer's final fullscreen pass. The complete measurements are in [browser/report.json](../artifacts/quality-pass/browser/report.json).

## Evidence

- [Before: repeated coping hover](../artifacts/quality-pass/evidence/coping-before.webm)
- [After: continuous ramp return](../artifacts/quality-pass/evidence/coping-after.webm)
- [Before, at 3.0 s](../artifacts/quality-pass/evidence/before-180.png) and [after, at 3.0 s](../artifacts/quality-pass/evidence/after-180.png)
- [Before/after contact decisions around the coping return](../artifacts/quality-pass/evidence/coping-return-decisions.json)
- [Flip flick, side](../artifacts/quality-pass/evidence/animation-flick-side.png), [catch, front](../artifacts/quality-pass/evidence/animation-catch-front.png), [planted, side](../artifacts/quality-pass/evidence/animation-planted-side.png)
- [Phone tutorial](../artifacts/quality-pass/browser/tutorial-390x844.png) and [short landscape tutorial](../artifacts/quality-pass/browser/tutorial-844x390.png)
- [Ready local game](../artifacts/quality-pass/local-game-ready.png)

The comparison tool changes only the rejected partial-contact routing back to its original implementation for the **before** run. Both runs use the same current assets, board measurements, launch input and fixed camera. Videos are deterministic local physics evidence rendered without post-processing; the separate production smoke/performance pass uses the complete graphics pipeline. Animation close-ups are staged at fixed flip phases for contact inspection, rather than presented as user-recorded footage.

## Repeat locally

Run `npm ci`, then `npm run dev -- --port 5180`. In another terminal, point `STREETSKATE_URL` at that server and run `npm run test:browser`. `tools/quality-evidence.mjs` requires the development server because it imports source modules to reproduce the original contact route. For a production smoke test run `npm run build`, start `npm run preview -- --port 5181`, set `STREETSKATE_URL=http://127.0.0.1:5181/`, then run `npm run test:browser`.

On Windows the tools use installed Chrome when present. Other environments can run `npx playwright install chromium`, or supply `STREETSKATE_BROWSER_EXECUTABLE`. Tests run in separate headless contexts and do not control the player's open local tab.

Physical gamepad hardware, touch gameplay, every possible trick combination and every entire-map route were not exhaustively playtested. No touch support is claimed. Existing board/feet and grab/IK systems were retained; close-up QA and the new auto-catch fix do not constitute replacement animation clips.
