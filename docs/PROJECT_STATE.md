# Game Evolution — current project state

**Portals manual-sync target: `fix/portals-bundled-fonts`.** This branch includes main `b53ec09` and preserves its own Party entry, map-load queue, focus simulation gate, identity, rankings, asset paths and bundled fonts. The integration passes 1,107 unit tests, the production asset checks and an explicitly verified `--base=./` build. Host synchronization remains manual. The previously updated `feat/portals-online-beta` is a separate branch.

Updated 2026-11-03. **The Hollow local polish is ready:** fifth rider first in the roster, preserved source rig, calibrated palm reach on the existing crew, smoother grab gather, recording-length music ducks and first-bail/respawn shader preparation. Base: `66fcd65`. Branch: `codex/hollow-grip-mix-20261103`. [Current report and evidence](hollow-grip-mix-status-2026-11-03.md).

Release follow-up: the owner authorized main deployment and a Portals branch update. Main runtime `401ee4b` is live on Render; the served JS bytes and original Hollow GLB match the verified local build. Main's full suite passes 1,078 tests plus board/vert/pump checks. The Portals integration preserves online/identity/host adapters and TuxR's ground clearance while allowing the calibrated airborne grabs; its full suite passes 1,083 tests and the relative-base build passes. The release browser gate now checks the five stock riders plus an uploaded sixth, visible clipped card bounds, and actual deformed torso clearance instead of a common pelvis-pivot height. Platform synchronization remains manual.

Live game: https://streetskate.onrender.com/ . Local game: http://127.0.0.1:5185/ . Current soundtrack/reaction A/B: http://127.0.0.1:5187/mix-v3/ . Refresh to load the latest bundle. No Portals platform synchronization was performed. [Previous cycle 2 milestone](evolution-cycle2-status.md) remains recorded at `66fcd65`.

## Previous milestone — cycle 1

The following sections preserve the verified cycle 1 milestone. Its release base was `f62779d`, integration branch `codex/evolution-cycle-20261103`, saved as `77fbf6d`. The owner tested and accepted that local batch before requesting cycle 2.

## Executive summary

Executed the attached Game Evolution AI Studio system against the actual Three.js game. Three native specialist agents independently inspected gameplay/physics/animation, graphics/assets/performance, and UI/tutorial/audio/session experience. The lead integrated bounded fixes, cross-reviewed changes, ran the full validation/build and inspected real browser screenshots. No new mode, engine rewrite, dependency installation or generated asset was required.

The candidate fixes earned-score loss on rider reset, translucent decks after swaps, manual-switch difficulty refresh, stale actor bloom masks, resolution-dependent particles, incomplete ORBIT floor decoration, inaccessible Settings focus routes, incorrect remapped tutorials/controller diagrams, unsynchronized sound toggles and recovery/contact serial handling. Full restart semantics, inverse balance controls, source assets/collision/rails and the requested glow defaults are preserved.

**Test locally:** http://127.0.0.1:5185/ . Refresh the page after a rebuild. The preview was started/opened for this session; after restarting the machine, run `npm run build` then `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5185 --strictPort` from the repository.

## Documentation and audit findings

- [PROJECT PROFILE](PROJECT_PROFILE.md): engine/version, physics, animation, input, renderer, assets, audio, saves, networking scope and build/deploy.
- [ARCHITECTURE](ARCHITECTURE.md): system map and decision authority, linked to the existing canonical physics map.
- [GAME VISION](GAME_VISION.md): accepted identity, controls and constraints.
- [QUALITY SCORECARD](QUALITY_SCORECARD.md):24 categories; evidence-qualified scores, NE/N/A where appropriate.
- [DEVELOPMENT ROADMAP](DEVELOPMENT_ROADMAP.md): task IDs, owners, dependencies, acceptance/status and ranked next work.
- [KNOWN ISSUES](KNOWN_ISSUES.md), [DECISIONS](DECISIONS.md), [CHANGELOG](CHANGELOG.md).
- Independent detailed findings: [gameplay](evolution-2026-11-03-gameplay.md), [graphics](evolution-2026-11-03-graphics.md), [experience](evolution-2026-11-03-experience.md).

## Agents, skills and review

| Workstream | Agent / actual activity | Review / evidence |
|---|---|---|
| Gameplay, skate physics and animation integration | `evolution_gameplay`: source/deterministic reproduction; recovery, rider materials and manual-chain changes. | Lead integration review; experience agent independently reviewed reset/main audio state. Real keyboard reset/manual tests and existing physical regressions retained. |
| Graphics, technical art and performance | `evolution_graphics`: actor-mask and particle bugs; actual-GLB diagnosis of ORBIT's incomplete joint grid. | Gameplay agent independently reviewed bloom hot path/restoration; lead viewed three parks and a fixed-camera production A/B. |
| UI, accessibility, tutorial, audio and session flow | `evolution_experience`: focus trap, saved/live remap instruction/diagram fixes; audio-state inconsistency identified. | Lead reviewed code, exercised actual menu/settings/remap routes and inspected720p captures. Audio changed only for state synchronization. |
| Integration / QA / production coordination | Lead: shared sound state, marker/spot recovery, README/HTML identity, governance, full build/test/browser QA. | Isolated local branch; only reviewed paths enter the checkpoint. Existing unrelated modifications/artifacts preserved. |

Game Studio skills applied: `three-webgl-game`, `game-playtest`, specialist `game-ui-frontend`. Existing Playwright/Chrome was sufficient. Blender/Portals/media capabilities were discovered but were not necessary for these source-level defects. Agents are real parallel workstreams, not simulated roles.

## Completed and verified

| Check | Result / evidence |
|---|---|
| Baseline tests |1,013 passed,0 failed: `artifacts/evolution-baseline-tests.log`. |
| Final full validation |**1,038 passed,0 failed/skipped**; board15/15, vert20/20, pumping15/15: `artifacts/evolution-validation.log`, command `npm run validate`. |
| Production build |Passed `npm run build`. Entry `assets/index-CtSN9U7h.js`; large-bundle advisory remains. `artifacts/evolution-build.log`. |
| Integrated browser |`node tools/evolution-local-qa.mjs`: PASS; no page exceptions or HTTP errors. Three parks, selected rider swaps, six glow presets,60/100/125% render scale, readable/live remaps, Xbox/PS/nonface diagram screenshots, Settings Tab/reverse Tab and sound synchronization. `artifacts/evolution-2026-11-03/browser/report.json`. |
| Gameplay / session |Real keyboard ollies banked points; real R preserved an accepted100-point fixture; marker return advanced serial; actual Manual→Nose Manual retained4.125 s accumulated challenge. Complete90-second round,10/5-second warnings, time-up, results and replay captured. Any fixture-injected score/time is explicitly labelled in the browser report. |
| Final ORBIT / spot recovery |`node tools/evolution-orbit-qa.mjs`: PASS; controlled production before/after removes785 short joints/9,420 decorative triangles, with unchanged156 collision meshes and14 rails. Named-spot recovery preserves375-point fixture and switch stance, advances serial and canonical stance. Final production bundle checked after this visual-only/recovery follow-up. `artifacts/evolution-2026-11-03/orbit-final/report.json`. |
| Actual source/geometry preservation |New asset regression verifies source GLB SHA, all 66real ramp joins and32 grilles, collision attributes/index/metadata hash and all14 rail paths. No authored GLB edited. |
| Independent visual inspection |Lead viewed title, tutorial, remapped PS/shoulder layouts, three parks, manual, results/replay and ORBIT before/after/gameplay captures. This is screenshot review, not human sound or full-motion approval. |

The complete round/browser suite used the candidate before the final decorative-filter/named-spot follow-up. The final bundle received the full1,038-test validation, rebuild and targeted production A/B/recovery browser check; no second full90-second run is claimed for the final bundle. No relevant rules/timer/replay changes occurred in that final follow-up.

## Performance results

Correctness fixes avoid adding a whole-scene traversal on ordinary bloom frames. Removing decorative ORBIT bars eliminates9,420triangles; this is a geometry-count reduction, not proof of an FPS gain. Particle counts, glow values and quality defaults were not lowered.

Fresh short samples: Chrome/Windows, RTX 5060 Ti via ANGLE/D3D11,1280×720, native drawing ratio1,144 FPS preset/glow,120-frame samples per park:

| Park | Mean interval | p95 interval |
|---|---:|---:|
| ORBIT |7.29 ms |7.00 ms |
| Warehouse |7.06 ms |7.00 ms |
| Paradise |7.81 ms |13.90 ms |

These are brief requestAnimationFrame observations, captured before the decorative-filter follow-up, with machine load not controlled. They are not CPU/GPU timings, a sustained benchmark, a before/after speedup or a locked144 FPS result. Shader/hardware particle-size clamps remain. Controlled long-run profiling is still prioritized.

## Files and assets

Runtime: `src/game-main.js`, `src/game/{StreetPhysics,SkillStreetPhysics,StreetSkater,GameShell,TutorialPages,FlipSchool}.js`, `src/graphics/{GraphicsPipeline,SkateEffects}.js`, `src/park/OrbitPark.js`; presentation identity in `index.html` and current instructions in `README.md`.

Regression additions: `rider-reset-context`, `manual-chain-balance`, `graphics-actor-swap-and-vfx-scale`, `evolution-experience`, `orbit-decorative-joints`; existing rider-swap and warehouse hotfix tests strengthened. Browser tools: `tools/evolution-local-qa.mjs`, `tools/evolution-orbit-qa.mjs`. Governance/specialist docs linked above.

**Assets created/updated: none.** Original models, audio recordings, textures and source collision data remain intact. Existing generated `playlist.json`, old audit artifacts and unrelated preview work are excluded from this cycle's checkpoint.

## Implemented but not human-certified / remaining risks

No new physical-gamepad, screen-reader or subjective sound approval is claimed. Hand/deck grip gaps, limited character/crowd palette, long-session memory, cross-browser coverage, large entry bundle and controlled GPU performance remain in [KNOWN ISSUES](KNOWN_ISSUES.md). No tool/permission blocker prevented this milestone; follow-up listening/hardware work needs actual participation/evidence rather than a fabricated pass.

The next priorities are compact-rig motion contact review, audio audition, controlled frame-pacing capture, measured texture/entry optimization and compatibility/accessibility/lifecycle checks. See the ordered acceptance criteria in [DEVELOPMENT ROADMAP](DEVELOPMENT_ROADMAP.md).
