# Document 4 — Final QA Report (2026-11-08)

## Regression results

- `npm test` (1,149 tests after this pass): **1,132 pass, 17 fail**. The 17 failures are identical, by name, to the failures before any change today (asset/preset expectation drift such as "all five presets retain 1024² shadows"). No new failures.
- New tests this pass: `tests/aaa-polish-stability.test.mjs` (4), `tests/aaa-polish-audio.test.mjs` (5); earlier today `tests/shader-program-stability.test.mjs` (3) and `tests/animation-continuity.test.mjs` (8).
- `vite build`: passes (existing large-bundle advisory unchanged).

## Gameplay verification (real browser, scripted input)

| Check | Result |
|---|---|
| Boot → title → loadout → play on all three parks | Pass, no page errors |
| Push, ollies, kickflips, heelflips, shove-its, grabs, spins, manual, stance switch, respawn, bail | Exercised every run; animation audit clean (Document 1 §D) |
| Long session (4 × 40 s on Paradise to time-up) | No geometry/texture/heap growth after first-play warm-up; heap ~90 MB flat |
| Map switches (Paradise ↔ Orbit ↔ Warehouse) | Resources released on return; no errors |
| Injected frame exceptions | Loop continues; input responsive |
| Pause with sound playing | Game voices fade and stop; menu cue survives; no errors |
| Menus at 1920×1080, 1280×720, 800×720 | Captured before/after; no overlaps at checked points |
| Console | One pre-existing warning: rider rig missing `root` bone (benign) |

## Performance comparison (1080p Cinematic, uncapped, same scripted route; single runs)

| Map | Idle mean (ms) start → final | Pushing mean (ms) start → final |
|---|---|---|
| Orbit | 5.55 → 4.33 | 5.97 → 4.17 |
| Grand Warehouse | 4.74 → 4.50 | 5.58 → 4.67 |
| Skate Paradise | 3.97 → 3.75 | 3.88 → 4.02 (within noise) |

Hitches (Paradise, 40-trick scripted route): camera max 18.5 → 3.6 ms; frames with camera > 6 ms: 60 → 0. Frame-time p99 10.7/8.2 ms → 8.1 ms. Rare 25–35 ms frames remain (first-use GPU work); not eliminated.

Single-run numbers vary by roughly ±0.3 ms; Orbit's improvement was confirmed with a repeated stash A/B.

## Graphics presets

Preset logic untouched. Shader-variant fixes apply to all presets; pixel parity verified at Cinematic on three maps. Other presets were not re-captured (unverified).

## Remaining limitations

- No human playtest of feel, no human listening test, no physical gamepad, no mobile/Safari/Firefox runs.
- Gameplay-feel items (wall stalls, vert lock, line linking, camera framing) intentionally untouched (owner rules).
- 17 legacy failing tests remain.
- AudioContext resume after device interruption unverified on devices.

## Release readiness

Branch `aaa-polish` is **ready for owner review** and lower risk than its size suggests: every change is local, tested, and measured; behaviour changes are limited to removing snaps/clicks/clipping and readability. Not pushed or merged (per instructions).

Recommended before merging to `main`: a 10-minute owner play session on each park with sound on (listen for the limiter on loud combos and the pause/mute behaviour), and a glance at the loadout and options screens at the owner's usual resolution.

## Final recommendations

1. Merge `aaa-polish` after the owner session above.
2. Decide on C1 (wall stall assist) and C2 (revert/manual linking): the largest remaining gains in fun.
3. Do A7 (green test suite) before any physics work.
