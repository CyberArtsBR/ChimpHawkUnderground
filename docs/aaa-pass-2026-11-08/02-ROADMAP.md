# Document 2 — Prioritized Improvement Roadmap (2026-11-08)

Legend — Priority: P0 critical … P3 minor. Complexity: S (≤½ day), M (1–2 days), L (multi-day). "Owner" = needs an explicit owner decision because it touches physics, controls, camera behaviour, menu structure or art direction.

## Done in this pass (verified; see Document 3)

| ID | Item | Priority |
|---|---|---|
| D1 | Guarded main loop (no permanent freeze on exceptions) | P1 |
| D2 | Respawn signal on fall-out recovery | P3 |
| D3 | Camera clearance broad phase (exact results, hitches removed) | P1 |
| D4 | Shader re-resolve fixes (mirror, glow black, decals, rider material) | P1 |
| D5 | Six animation discontinuity fixes + flip presentation at high refresh | P1 |
| D6 | Music limiter; reactive music outside render path | P1 |
| D7 | Click-free stops; menu cues survive; extras bus; landing/loop fixes | P2 |
| D8 | UI readability, focus, hover, overlap fixes | P1/P2 |

## Phase A — Safe technical follow-ups (no behaviour change)

| ID | Task | Pri | Cx | Risk | Player benefit | Acceptance criteria |
|---|---|---|---|---|---|---|
| A1 | Resume AudioContext on `statechange` and when the tab becomes visible; call `skateAudio.unlock()` wherever music unlocks (gamepad) | P2 | S | Low | Sound returns after device switch/interruption without a click | Context returns to `running` after a forced `suspend()` + visibility change; tested on Chrome + one mobile browser |
| A2 | Record live event strengths for replays; drive replay roll bed from playback speed | P2 | S | Low | Replays sound like the run | Replay landing gain matches live within 1 dB for the same event |
| A3 | Handle `webglcontextrestored` (rebuild composer/targets) or auto-reload prompt | P2 | M | Med | Recover from GPU resets | Forced `WEBGL_lose_context` round-trip returns to a rendering game |
| A4 | Clamp real delta for highlight playback after hidden tabs | P3 | S | Low | Replays don't skip ahead | Replay frame index advances ≤ 0.1 s after a 10 s hidden gap |
| A5 | Unify stepper styles; one footnote size token; remove legacy model-viewer CSS after grep proof | P3 | S | Low | Cohesive UI | All three stepper groups share size/shape; no visual diffs elsewhere in 3-size captures |
| A6 | WOFF2 + preload for Bangers/Barlow; drop undeclared weights | P3 | S | Low | Faster first paint | Font bytes reduced; no FOUT in captures |
| A7 | Fix or retire the 17 long-failing tests (asset/preset expectations) | P2 | M | Low | Trustworthy CI | `npm test` all green with each change justified |
| A8 | KTX2/Basis texture pipeline for the 2048² park maps (measure GPU memory first) | P3 | L | Med | Lower VRAM on weak GPUs | ≥40% texture memory reduction, pixel diff within agreed tolerance |

## Phase B — Audio feel (subjective; needs listening approval)

| ID | Task | Pri | Cx | Risk | Benefit | Acceptance |
|---|---|---|---|---|---|---|
| B1 | Narrow roll loop pitch (e.g. 0.85 + 0.5·speed) and carry speed with gain/filter; dual offset loops with slow drift | P2 | S | Low | Less "chipmunk", less loop repetition | Owner listening A/B |
| B2 | Wider impact variance (±4% rate, ±1.5 dB), strength-driven low-pass, pop scaled by actual impulse | P2 | S | Low | Less repetition | Owner listening |
| B3 | Surface tag hysteresis (~80 ms) | P3 | S | Low | No roll-layer flicker on mixed surfaces | No tag flips < 80 ms in a route trace |
| B4 | Separate gentle compressor for impacts; keep crowd/voice clean | P3 | S | Low | Less pumping | Owner listening |
| B5 | Voice stealing at the cap (oldest low-priority) | P3 | S | Low | Pain voices never dropped | Unit test |

## Phase C — Gameplay feel (Owner decisions; physics/camera rules apply)

| ID | Task | Pri | Cx | Risk | Benefit | Acceptance |
|---|---|---|---|---|---|---|
| C1 | Wall stall assist: gentle deflection or auto-turn when speed < threshold facing a wall | P1 | M | Med | Fewer dead stops; flow | Owner playtest; existing collision/coping tests pass |
| C2 | Revert on vert landings + manual linking for long lines (new inputs on spare bindings only) | P1 | L | Med | THUG-style line depth | Owner playtest; controls doc updated; no existing binding changed |
| C3 | Vert lock tuning (less "on rails" in bowls) | P2 | M | Med | More expressive vert | Owner playtest; vert/pump verification passes |
| C4 | Camera height/distance presets per map (opt-in) | P2 | S | Low | Rider larger on screen | Owner approval; camera stability tests pass |

## Phase D — Content and art (Owner)

| ID | Task | Pri | Cx | Benefit |
|---|---|---|---|---|
| D-1 | Named gaps + goal list per park (SKATE letters, combo targets) | P1 | L | Reason to replay |
| D-2 | Prop density and readable coping/rail colour-coding per park | P2 | L | Readability, life |
| D-3 | Per-rider voice palettes / chimp vocal set (licensed or original) | P2 | M | Personality |

## Dependencies and risks

- C1–C3 depend on owner approval and should each ship behind a setting first for A/B playtests.
- A3 interacts with the graphics pipeline's render targets; test on two GPUs.
- B-items need human listening; automated checks can only prove level/clipping safety.
- A7 should come before any large physics work (C-phase) so regressions are visible.
