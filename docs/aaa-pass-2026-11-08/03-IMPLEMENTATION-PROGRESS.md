# Document 3 — Implementation Progress (2026-11-08)

Branch `aaa-polish` (local, not pushed). Earlier today on `main` (already live): `93a22e4` (shader re-resolve fixes) and `689d6e2` (animation continuity). Each batch below was measured before and after under the same scripted conditions.

## Batch 0a — Rendering: shader re-resolves (`93a22e4`, on main)

Files: `src/graphics/FloorReflections.js`, `src/graphics/GraphicsPipeline.js`, `src/graphics/{Paradise,Orbit,Warehouse}*VisualPass.js`/`ParadiseSurfaceDetail.js`, `src/character/UnrealRider.js`, `tests/shader-program-stability.test.mjs`.

- Program lookups/frame: Orbit 68.7 → 4, Warehouse 19.1 → 6, Paradise 14 → 0.
- Orbit A/B (stash, 2 runs each): 5.6–5.9 → 4.2–4.8 ms/frame.
- Same-view pixel diffs: only time-animated elements differ (Paradise/Warehouse < 0.5% pixels; Orbit stars/sign/rider sway).

## Batch 0b — Animation continuity (`689d6e2`, on main)

Files: `src/character/{UnrealRider,TrickMotion,AnimationDynamics,SkatePoseConstraints}.js`, `src/skateboard/StreetBoard.js`, `src/game/StreetSkater.js`, `tests/animation-continuity.test.mjs`.

- Presented flip progress covers the unsimulated part of the frame (physics untouched): jitter 1.87 → 0.002.
- Pelvis guard fades out as the deck rolls away (mid-flip lift removed).
- Chest lean and stance twist ride springs (takeoff and switch snaps removed).
- Pop tilt and deck lag carried into flips; feet peel off the deck by progress 0.14.
- Arm safety modes blend; knee bend plane rate-limited (Japan pop 12 → 2.5 cm).
- 8 new tests; 6 fail on the old code.

## Batch 1 — Stability and camera hitches (`4671514`)

Files: `src/game-main.js`, `src/game/StreetPhysics.js`, `src/game/ParkCollision.js`, `tests/aaa-polish-stability.test.mjs`.

| Change | Evidence |
|---|---|
| Guarded game loop | Three injected exceptions logged; 5,275 frames rendered afterwards; input still moves the rider. |
| Respawn signal on fall-out | Unit test: serial bumps, score kept, valid state untouched. |
| Camera broad phase | 9,000 random real-park probes identical (max diff 0); 7×/9×/1.35× faster per probe (Paradise/Orbit/Warehouse). In-game Paradise camera: max 18.5 → 3.6 ms, frames > 6 ms 60 → 0, p99 2.6 → 1.3 ms. |

## Batch 2 — Audio (`f348497`)

Files: `src/game/ReactiveMusic.js`, `src/game/SkateAudio.js`, `src/game/ComboCallouts.js`, `src/graphics/WorldLife.js`, `src/game-main.js`, `tests/aaa-polish-audio.test.mjs`.

| Change | Evidence |
|---|---|
| Music-only limiter + makeup trim | Chrome OfflineAudioContext: −20/−6/−1.94 dB in = out exactly; 0/+2.9/+6 dBFS in → −0.85/−0.59/−0.35 dBFS out. No added SFX latency. |
| Reactive music updates every frame, relaxes out of play | Unit test: bail muffle cleared when inactive; level returns to rest. |
| 20 ms fade-outs; menu cues survive | Live: landing voice faded and removed after `silence()`, confirm cue kept; unit tests on ramps. |
| Extras bus for stingers/world sounds | Live: bus replaced on silence; unit test. |
| Fresh-only landing severity; seamless wood loop; fallback tone condition | Code review + existing audio tests (2 pre-existing failures unchanged). |

## Batch 3 — UI readability and focus (`492f530`)

Files: `src/ui-polish.css` (new, loaded last), `src/game-main.js`, `src/game/RunSummary.js`, `src/game/GameShell.js`, `tests/aaa-polish-stability.test.mjs`.

| Change | Evidence |
|---|---|
| Label floors + Text size scaling | Computed styles: OLLIE CHARGE 7 → 10 px (15 px at 150%); state 9 → 11 px; menu headings/footnote 9 → 12 px (18 px at 150%). |
| Focus ring on chosen cards | Computed outline `none` → `3px solid`; capture inspected. |
| Hover tint distinct from selection | Computed backgrounds; capture inspected. (A first version used `color-mix` on a gradient variable and silently dropped the background — caught by the computed-style check and fixed; a test now guards it.) |
| Status vs hint overlap | Rect intersection false at 1920/1280/800. |
| Steppers, scrollbars, results bar, contrast, plural, locale | Captures + code. |

## Problems found and deliberately not changed

- Pause poster title behind the rider: deliberate art layering.
- Rider per-frame allocations: GC measured as non-issue (≤1 ms minor GCs).
- Board 2.5 cm airborne lift: rigid shift of board + rider, not a pose snap; existing tests encode it.
- Nosegrab grab-in kink: pre-existing, velocity reversal (not a positional jump).

## Remaining issues / not verified

See Document 2 (Phases A–D) and Document 4 limitations. No physical gamepad, mobile, Safari/Firefox or human listening/feel tests were performed.

## Continuation point

Next highest-value safe work: A1 (AudioContext resume), A2 (replay strengths), A7 (green test suite), then owner decisions on C1/C2.
