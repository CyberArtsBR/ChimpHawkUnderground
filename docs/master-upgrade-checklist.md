# Local master upgrade — working checkpoint

Branch: `codex/master-local-upgrade`. Baseline: `29c3809` (remote main verified 29 October 2026). No publish, push, merge or hosted Portals sync authorized for this upgrade.

## Ownership
- Lead: shared GameShell/game-main integration, camera, rendering, assets, art, final browser QA.
- Gameplay agent: scoring/versioned records, round policy, practice drills, physics fixtures.
- Interface agent: CSS/type, glyph loading, lessons, saved preferences/remapping and settings panel.
- Presentation agent: animation, sound, physical impact effects, audio preferences.

## Checklist
- [x] Read complete prompt/audit and relevant Game Studio skills; verify branch/base and preserve unrelated changes.
- [x] Phase 1: warnings/type/glyphs/tutorial lessons and selected-trick practice.
- [x] Phase 2: saved settings, remapping, camera, audio, liquid and measured performance.
- [x] Phase 3: READY/GO, zero-clock resolution, results, scoring/PB, fixtures.
- [ ] Phase 4: motion/contact/audio/VFX: initial implementation and evidence complete; named-grab contact and Paradise surface authoring need further work.
- [ ] Phase 5: art bible, park readability, reproducible assets, measured loading/rendering: initial pass complete; Paradise asset remains large and 144 FPS is not locked.
- [x] Integration tests/build, browser round/menu/tutorial/parks/animation, performance comparison.
- [x] Persistent local server verified and final test notes; local commit records the follow-up.

Preserved baseline: 120 Hz simulation; 18 m/s cruise; gravity21; pop5.6–7.9; charge.24; rail attachment/acceleration; glow; grounded-impact liquid; no BANKED and no new modes.

Pre-existing edits/artifacts are retained. This document and specialist status notes are the durable continuation checkpoint.

## Checkpoint — 1 November, local test candidate
- Implemented: warning labels/readability, decoded graffiti fallback, four advanced lesson clips, saved controls/accessibility/camera/audio/liquid/FPS options, creator page, READY/GO, bounded overtime, versioned score records and results, measured fixtures, tested coping/deck transfer correction, visual animation and ground-impact sound/puddle updates.
- Validation: 934/934 tests and board15/vert20/pump15 passed; production build succeeded; browser smoke opened settings and started a round with no page errors; original eight lessons passed. Four new clips generated; complete advanced-video/browser/controller acceptance remains.
- Remaining before considering the full prompt complete: full real-time round/overtime/bail/replay QA; physical controller and listening/animation review; reliable per-surface contact tagging; art-bible and asset optimization; controlled after-change GPU/loading measurements and multi-resolution screenshots. Baseline measured submissions/s 143.5 Warehouse,137.8 ORBIT,130.7 Paradise at 1080p on RTX5060Ti with glow; these are not display FPS or GPU time. Lossless asset experiment was not applied.
- Current local build is suitable for exploratory testing, not yet a release approval. Main and Portals unchanged. Re-run full validation after any additional edits.

## Integrated follow-up — 1 November

- Real-time 90-second Warehouse session: READY/GO, five real ollies, pause, visible 10/5-second warnings, Time's Up, results, highlight playback and retry passed (`artifacts/master-upgrade/round-qa/report.json`). Two further clock-accelerated tests passed: a clean pending ollie scored once after zero, while a bail forfeited it (`artifacts/master-upgrade/overtime-qa/report.json`).
- User tested a physical Xbox 360 controller and reported analog, ollie, flip, grind and pause all worked. No hardware-latency or other-controller claim.
- Re-recorded all four advanced lessons after QA found inconsistent recording duration. All four now decode at 3.17 seconds; button press/release/second press cues and the selected practice drill passed (`artifacts/master-upgrade/flip-sync/`).
- Real CC0 recordings replaced the complained-about synthesized pop, catch, landing and bail; player retested and reported a large improvement. Credits: `public/audio/foley/CREDITS.md`.
- Optional lossless asset delivery: ORBIT GLB 14.47→8.39 MB, Warehouse GLB 13.73→6.03 MB, ORBIT galaxy 11.94→7.34 MB. Decoded source bytes/pixels are identical; originals remain fallback. No geometry simplification or normal map quality loss. Paradise remains large (50.69 MB) because the tested alternatives did not preserve quality sufficiently.
- One simulated 40 Mbps/20 ms cold-context comparison measured Warehouse ready in 2.49 s optimized versus 4.09 s original, ORBIT in 3.72 s versus 5.85 s. The comparison includes parsing and setup; these single-run results are not guaranteed on a real network (`artifacts/master-upgrade/asset-loading/report.json`).
- All three parks entered under 144-target settings with glow; gameplay screenshots and fallback tests passed. One 60-second measurement per park recorded ~137.0/138.4/130.7 screen submissions/s (Warehouse/ORBIT/Paradise), p95 8.0/8.2/8.9 ms on RTX5060Ti 1080p. These are not presented FPS or proof of a stable 144 Hz; routes differed from prior samples, so no causal speedup claim. A separate 12-case moving-route matrix with GPU queries passed without browser errors (`artifacts/master-upgrade/performance-matrix/report.json`); its ten-second cases include occasional stalls, and the 1440p viewport uses a 1080p render buffer in this profile.
- `npm run validate`: 951/951 tests plus board15/vert20/pump15. `npm run build` passed (Vite still reports an approximately 1.27 MB uncompressed main JS chunk).

Remaining limitations: Paradise is still a heavy asset; 144 FPS is not locked; the short-arm riders' named grabs need further skate-animator review in motion; Paradise's hidden collision proxies need authored surface tags before they can select specific material sounds. This local candidate has not been synchronized or deployed.
