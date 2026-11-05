# StreetSkate / Solar Dock — deep gameplay/video audit — 2026-10-08

## Evidence and baseline

- Repository: `CyberArtsBR/StreetSkate`, baseline `main` at `cfd5cc7da54a0a9cbe659313f229b798175b4b79`.
- Recording: `Desktop 2026.10.08 - 13.25.20.06.mp4` (164.07 seconds, H.264 1280 × 720, 60 fps). Browser game takes the left side of the desktop; a separate controller display takes the right.
- Audit combines time-coded video observation and actual source review. Video cannot reveal exact collision normals, controller events, instantaneous force, real FPS, shader timings or browser focus. Those are *diagnostic hypotheses* until reproduced with the new QA overlay.
- Scope: camera/vert, collision/contact, grind/manual, controls/gamepad, animations, graphics/park, UI/QA, deterministic verification, release quality.

## Critical playback observations

| Time | What is visible | Inference; confidence | Verification |
| --- | --- | --- | --- |
| 00:04–00:20 | Big empty run-up, limited surface contrast; mega ramp/platform difficult to read | Art and contrast issue (high) | Screenshot in high/low graphics |
| 00:20–00:28 | Rider near steep ramp and roof; camera sometimes gives little landing context | Camera/line readability (medium) | Compare orbit, projected rider-to-lip gap |
| 00:34–00:44 | Bowl air filmed with nearly top-down angle; cyan coping dominates foreground | Excessive camera pitch or obstruction-induced relocation (high) | QA cameraPitchDeg and clearance; capture at peak |
| 00:38–00:46 | Speed HUD briefly near 00 then around 50–61 km/h | Discontinuous displayed speed, or naturally small horizontal component at apex (medium, not proven physics bug) | Compare QA speedKmh, hudKmh, velocityY and state |
| 00:47–01:08 | Multiple flips/spins and return arcs; abrupt, hard-to-read camera facing on some returns | Framing consistency issue (high); yaw issue not independently proven (low) | No-input return with overlay behindTravel, heading |
| 01:12–01:20 | Street/wood transitions, high fixed-style camera and little material contrast | Theme readability issue (high) | Compare reference PBR textures and graphics modes |
| 01:36–01:44 | Bowl again presents overhead-facing views; landing region not well anticipated | Repeatable camera problem (high) | Test bowl enter from opposite sides |
| 02:20–02:40 | Rider almost stationary over a rail, HUD `AIR`, speed `00`, old combo display still visible | Apparent simulation suspension/stall (high), exact cause unresolved | QA FOCUS, PAUSED, rail speed/s and wheel contacts |

## Findings, root cause and priority

### P0 — silent unfocused freeze (verified from code)

`src/game-main.js` rendered frames while `document.hasFocus()` was false, but skipped `skater.update()`. The game could look frozen in mid-air without a visible state explanation. A separate controller input display, browser focus switches or clicks into another app can trigger this. Existing `blur` events might pause, but relying only on them does not cover the continuous focus gate. **Patch**: transition to explicit PAUSED when focus is lost, with visible resume instructions. This is a *verified code defect* and a *plausible*, not proven, explanation of the last video segment.

### P0 — insufficient in-game diagnostics (verified)

Prior debugging requires `?debug=1` and an animation panel; the usual build doesn't disclose camera pitch, measured horizontal speed versus displayed speed, grind longitudinal progress, rail balance, browser focus, or camera collision intervention. **Patch**: always available read-only QA/F3 toggle displaying these metrics with focus and stall warnings. Does not affect simulation input or physics state. The runtime also exposes `streetSkate.captureAuditTelemetry()`.

### P1 — return camera rises into an overhead-looking shot (video confirmed)

In `FollowCamera.js`, high-follow used 7 m of vertical camera offset versus 9 m horizontal for the return, compared to 5.4 / 9.5 m on ground. Occlusion fallback can further affect eye placement; its actual activation in this video was not measured. **Patch**: return high-follow 5.3 / 11.6 m, include 1.4 m downhill look-ahead; wider and shallower line of sight. Preserve quick follow reorientation on vert return, classic and fixed alternatives, and read-only camera state. Add regression test asserting the intended nominal return pitch. **Remaining**: replay and on-device occlusion/coping tests.

### P1 — coping landing/heading continuity (historical report, not proven by this recording)

The user previously saw a sudden 90° yaw on recontact. The baseline contains `LandingOrientation`, state invariant tests and suppression of auto yaw on collision. No verified reproduction of the 90° snap in the recording. **Do not rewrite yaw physics blindly**. Capture `heading`, `airHeading`, `fakie`, `travelDirection`, `normal` before/after recontact; if jump >15° with zero spin input, add deterministic replay first and patch responsible layer.

### P1 — grind may remain stationary near a rail (video confirmed; cause undetermined)

At 02:20–02:40 the character remains near the rail with 00 speed. The **effective** grind implementation is `SkillStreetPhysics.stepGrind()`, *not* `StreetPhysics.stepGrind()`. It already exits when `grind.speed < 0.07` after 0.22 s; this means we must rule out paused simulation, repeated magnetic recapture, and AIR mode resting on a collision before modifying rail friction. This is why the overlay reads `railS`, `railLength`, `railSpeed`, camera and focus. If an actual stall persists while FOCUS=YES and PAUSED=NO, record a deterministic input sequence and add a test for stalled rail exit / AIR gravity.

### P1 — raw vs indicated speed discrepancy (unresolved)

`StreetPhysics.advance()` computes speed using `this.grind.speed`, signed `velocity.dot(forward)` when grounded, and horizontal magnitude when airborne. HUD displays `abs(speed) * 3.6`. During transition it is possible to have nearly zero horizontal speed while rising rapidly and then regaining descent speed. Therefore a 00 → 60 km/h sequence is **not** enough to call it an impulse bug. Overlay shows horizontal magnitude and HUD value separately plus Y velocity. Add an energy continuity trace before changing gravity/pumping.

### P2 — Solar Dock visual production quality (video confirmed)

`SolarDockPark.js` already has plywood materials, concrete, procedural graffiti, and non-colliding scenery. However large regions still present as homogeneous flat expanses; ramps lack characteristic metal edging, real layered plywood sheet joints and distinctive approach markings from gameplay distance. Artist-led pass should improve roughness variation, wood panel direction, coping contrast, decals, signage, silhouette and lighting **without** altering collision surfaces. Check mesh/material draw calls and GPU cost first; use PBR maps with texture atlas and pooled instances.

### P2 — UI legibility and controls (video confirmed)

The top-left controls card sits on a low-contrast bright scene; the spot navigation and bottom help compete with gameplay. **Patch**: readable compact translucent backing for the card; QA hidden by default; focus overlay appears only when paused. Follow-up: interactive, dismissible help rather than permanently occupying screen.

### P2 — input and fake vs travel

Preserve prior contract: skate forward -> jump -> 180 -> continue same world direction while character is fakie; behind-follow camera tracks travel rather than nose; lateral inputs reverse appropriately while fakie; real-world direction remains stable. Avoid using `heading` as canonical velocity or switching stance from camera yaw. Use existing replay tests plus controller edge tests.

### P2 — animations/presentation

Screen review suggests procedural skate poses remain simplistic (hands/feet may lack contact with deck during busy tricks); no skeleton-level test from compressed desktop recording. Audit `StreetSkater`, `UnrealRider` and `TrickMotion` with frame captures at pop, apex, grind, landing, and bail. Ensure board and feet contacts match physical clearance, and animation never mutates physics heading.

## QA reproduction matrix

- Spawn **Pool**: release all input; climb one side; let physics return; repeat 10 cycles clockwise/counterclockwise.
- Verify camera doesn't go above 66° pitch and is behind travel before the landing, barring real obstruction. Inspect `CAM OCCLUSION` if it does.
- Repeat with Ollie, Kickflip, +180, no steering; read heading, fakie, yaw before/after recontact.
- Cross the coping with held Forward / contextual vert exit, and then without any input; ensure no unrequested transfers.
- Spawn Street; grind both flat rails, ledge, stair rail. Release all buttons; verify rail-coordinate progress and exit. Retry at 0–2 km/h and with loss of focus.
- While AIR, click an external window for 5 s. Expect **SKATING PAUSED** instead of frozen AIR; refocus and press Esc/Start to continue.
- Validate both keyboard and gamepad through same scenarios, including pause without phantom presses.
- Run `npm test`, `npm run verify:physics`, `npm run build`; browser smoke at 60 and 120 Hz with desktop and mobile viewports. Track WebGL warnings and FPS (overlay FPS is frame-rate observation, not a GPU profiler).

## Acceptance criteria and release rules

1. No silent frozen gameplay when the browser loses focus.
2. QA overlay is opt-in, toggles by F3/button, contains no HTML injection, never mutates simulation.
3. All camera modes selectable; default high follow; nominal return pitch under 30°; behind direction follows ramp inward during return.
4. All unit/replay and browser smoke checks pass; if any fail do not merge.
5. Do not claim zero bugs, perfectly correct coping or stable 60 FPS without actual gameplay, hardware and browser evidence.
6. Report baseline and new commit/PR, CI status, whether deployed and unresolved issues accurately.

## Relevant files

- `src/game-main.js`, `src/game/FollowCamera.js`, `src/game/CameraClearance.js`, `src/game/core/CameraState.js`
- `src/game/SkillStreetPhysics.js`, `src/game/core/GrindCaptureController.js`, `src/game/StreetPhysics.js`, `src/game/SkateSystems.js`
- `src/game/TransitionGuide.js`, `src/game/StreetSkater.js`, `src/park/SolarDockPark.js`, `src/park/SurfaceMaterials.js`
- `tests/video-wall-bowl-regression.test.mjs`, `tests/unified-ramp-camera-feel.test.mjs`, `tests/grind-capture-replay.test.mjs`
