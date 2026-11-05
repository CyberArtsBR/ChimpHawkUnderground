# Evolution cycle 2 — local delivery

Date: 2026-11-03. Base: owner-tested `77fbf6d`. Branch: `codex/evolution-cycle2-20261103`. No merge, push, deployment or Portals synchronization. This is the next bounded local improvement milestone; unresolved content/quality work remains explicit.

## Executive summary and implemented changes

- **Grabs:** bounded pelvis/spine/shoulder movement lowers the reaching shoulder while foot IK preserves ankle targets and bone lengths. The switch Nosegrab/Tailgrab board pitch now lifts the requested end. Across 48 held rider/stance/grab cases, mean wrist-pivot gap improves from 32.7 to 17.3 cm, with every case improving 22–85%. This is a reach diagnostic, not a claim of perfect palm contact.
- **Audio:** pain takes have bounded gain correction; contact pain interrupts a still-playing loss grunt with a short fade. Same-frame contact does not stack a second effort voice. Recorded menu/round cues now deduplicate, slower impacts keep their tails, map ambience crossfades, exceptional applause retains its recorded decay, and skate scrape loops use measured sustained sections instead of unrelated mounting contacts/silent gaps. Source recordings are unchanged; the rejected cheer remains excluded.
- **First-use frame pacing:** scene compilation is followed by the actual composed draw before loadout completes. The wheels' speed-dependent bloom material variant is prepared too, without changing their emission or normal gameplay mask. A cancelled loadout/lost context skips this preparation.
- **Performance evidence:** GPU query results now have unique serials and freshness state; suspension/disjoint events discard stale samples. Render-only CPU timing is labelled accurately. A repeatable paired profiler is supplied for later longer runs; no steady-state FPS improvement or locked 144 FPS is claimed.

Test the current game at http://127.0.0.1:5185/ after refreshing. Audio comparisons are served at http://127.0.0.1:5187/ . They are QA artifacts, not shipped game content.

## Agents, skills and integration review

Three native specialist agents contributed: `polish_grab_contact_v2` (animation), `polish_audio_v2` (recorded sound), and `polish_perf_review_v2` (measurement/source profiling). The lead reviewed/integrated source, inspected all four riders' contact sheets and sampled transitions, completed audio renders and handled the shader investigation. The performance specialist independently reviewed the final warmup changes and found no actionable lifecycle/state-restoration defect; it ran no additional tests.

Game Studio Three WebGL Game and Game Playtest skills, existing Three.js/Playwright/Chrome, Web Audio and Git were sufficient. No external dependency/plugin installation, paid generation, new engine or new game mode was needed.

## Verification performed

The owner requested minimal additional testing. Existing results were retained; subsequent checks targeted the new warmup defect rather than repeating long sessions.

| Check | Result / evidence |
|---|---|
| Unit suite during integration | **1,058 passed, zero failed/skipped**, `artifacts/evolution-cycle2/validation.log`. |
| Final warmup/telemetry regressions | **16 passed**, covering compiler/draw order, cancellation/context loss, temporary wheel-mask selection, unchanged emission/materials, ordinary mask restoration, timer serial/disjoint cleanup and existing bloom error restoration. `artifacts/evolution-cycle2-performance/warmup-tests.log`. These overlap the earlier suite and are not added to its count. |
| Physics | Board 15/15, vert 20/20, pumping 15/15. `artifacts/evolution-cycle2/physics.log`. |
| Production build | Passed; entry `assets/index-C4akgjwD.js`. Existing bundle-size advisory remains. `artifacts/evolution-cycle2/build.log`. |
| Actual local browser | `node tools/verify-cycle2-local.mjs`: PASS. New grab input, finite positions, three parks including initial Paradise, unchanged glow, active post-processing, fresh GPU serials and zero page/HTTP errors. A 1.3-second paused-work fixture confirms READY remains active after resume instead of consuming loading time. `artifacts/evolution-cycle2/local/report.json`. |
| Grab geometry/visuals | 48 measured cases; unchanged chains/scales/support metadata and all 12 flip paths after authored grabs. Before/after sheets cover all four riders, both stances and side/nose/tail views; sampled reach/hold/release sheets and four normal/0.45× WebM recordings were produced. `artifacts/evolution-cycle2/animation/`, [animation report](evolution-cycle2-animation.md). |
| Audio signals/events | 31 unique active recordings decode; ten before/after WAVs have finite unclipped output. Focused audio tests and waveform/timing evidence are in [audio report](evolution-cycle2-audio.md) and `artifacts/evolution-cycle2/audio/report.json`. No subjective listening approval is inferred. |

No repeated full 90-second round, physical controller certification or long paired GPU benchmark was run for this pass. The owner had accepted the earlier full-round/replay milestone; the current changes preserve game rules/collision/timing and received the targeted checks above.

## Performance results and practical limits

The cold before capture recorded four `getProgramInfoLog` calls totalling **1,071.5 ms during play**. The final capture records four calls totalling **1,128.4 ms during loadout**, with **zero such calls in the sampled first playable interval**. Compilation/driver validation work is moved before the playable clock; it is not eliminated. These are individual cold runs, not a sustained frame-rate comparison.

The final browser reported GPU sample serial 125 with GPU timing supported, glow and post-processing enabled. All requested glow values, native render scale, AA and 1024 shadows remain unchanged. No image quality was reduced to manufacture a performance gain.

The negligible actor-bloom caching proposal was rejected after a roughly 0.004 ms isolated potential saving. Wider scratch/texture/entry optimizations remain profiling work, not changes silently described as complete. [Performance analysis and paired-profiler instructions](evolution-cycle2-performance.md).

## Files, assets and remaining work

Animation: `GrabReachPose`, `UnrealRider`, `StreetBoard`. Audio: `SkateAudio`, `SkateFoley`, provenance notes. Rendering/measurement: `ShaderWarmup`, `GraphicsPipeline`, `FrameMetrics`, the loadout callback in `game-main`. New focused tests, reusable capture/audition/profile tools and current project documentation are included in the local checkpoint.

**No original model, audio recording or texture bytes changed.** Audio source credits describe the runtime windows; before/after WAVs, images, videos, profiles and the frozen previous `dist` stay under artifacts. Existing unrelated playlist/preview/audit modifications are excluded from the checkpoint.

Remaining limits: Heretic/Japan and other compact-rig grips still need exact palm/finger authoring; voices/crowd still reuse the existing identities; the complete mix needs human listening; sustained 144 FPS, broad GPU/browser compatibility and long-session memory are not certified. See [known issues](KNOWN_ISSUES.md) and [roadmap](DEVELOPMENT_ROADMAP.md). No tool or approval blocker prevents delivery of this local candidate.
