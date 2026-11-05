# ASTRA rendering and audio implementation

Completed 4 November 2026 in the existing local worktree. No assets, dependencies, commits, branches or deployment settings changed by this specialist. The lead owns integration, production-browser checks and the final local build.

## Completed changes

**GFX-01:** `MapContactDepthPass.setDynamicRoots(roots)` separates the small active actor/effects trees from cached static exclusions. Dynamic opacity/depth-write state and nested same-count actor swaps are classified every render; the static map retains its existing refresh cadence. Removed actor meshes are never stored in the static exclusion list. Both superclass and custom visibility restoration empty their respective caches, so the normal restore followed by the error-safety `finally` restore is harmless. GraphicsPipeline propagates current roots from `setGlowTarget`/`setEffectsTarget` and when allocating the contact-depth pass.

**AU-01:** Base Foley and variant banks share one URL promise/decode cache per AudioContext lifetime. Failed entries can retry; successful buffers are reused. `disposeFoleyCache` aborts fetches and rejects late decodes before consumer delivery. Successful playback layers/bank entries are retained and do not duplicate on retry. `unlock()` permits at most three automatic attempts, at least two seconds apart, on subsequent trusted unlocks. Explicit `retryFoley()` retries missing clips immediately and coalesces concurrent requests. There is no timer retry loop, new asset, synthetic character voice or rejected crowd cheer.

`SkateAudio.getAudioStatus()` returns `{total, ready, failed, loading, state, attempts, canRetry}`. States are `locked`, `loading`, `ready`, `degraded`, `disposed`. Counts refer to unique cached URL resources. A failed first load becomes `degraded`; explicit retry on a healthy connection reaches `ready` without reload. The lead exposes status and retry; TERRA can improve the product presentation.

**FX-01 audio support:** `playRecordedEvent(event)` supports pop, landing, bail, catch, grind and grindEnd, using the validated recorded surface rather than changing the live `surfaceTag`. Replay impact cooldowns and voices have independent ownership. `updateReplay(sourceDelta)` decrements a replay scrape's bounded source-time duration; `grindEnd`, `resetReplay()`, mute, background suppression and disposal stop it. Scrapes use already approved prepared metal/concrete recordings, with an eight-source-second maximum and a twenty-wall-second safety stop for incomplete legacy clips. `resetReplay()` stops replay-owned voices and clears replay cooldowns; `silence()` also resets replay. The lead must call reset at moment cuts/stop and pass actual source elapsed time before emitting later events. No audio-time stretching or new sound-quality claim is made.

**PERF-01:** `validateRenderAllocation(width,height,pixelRatio,capabilities)` checks finite positive dimensions against actual MAX_TEXTURE_SIZE/MAX_RENDERBUFFER_SIZE values. It does not estimate VRAM or alter requested quality. GraphicsPipeline preflights preset/resize allocations, retains the previous accepted settings on rejected preset changes, and attempts restoration after allocation exceptions. `resize()` returns false on rejection/rollback; `setQuality()` returns the accepted settings object and throws only when no previous safe configuration can be restored. Initial impossible dimensions therefore produce an explicit error rather than silently selecting a reduced-quality preset.

`GraphicsPipeline.getStatus().allocation` supplies `state` (`ready`, `rejected`, `rolled-back`, `failed`), optional dimension/limit information, `reason` and concise `recovery` text. The lead must persist the returned accepted `settings.name`, not the rejected requested name, and show rejected/failed recovery status. Dimension checking cannot guarantee VRAM allocation under memory pressure; actual driver OOM was not induced.

## Files

- [MapContactDepthPass](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/graphics/MapContactDepthPass.js)
- [GraphicsPipeline](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/graphics/GraphicsPipeline.js)
- [GraphicsSettings](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/graphics/GraphicsSettings.js)
- [SkateAudio](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/game/SkateAudio.js)
- [SkateFoley](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/game/SkateFoley.js)
- [Resource lifecycle tests](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tests/astra-resource-lifecycle.test.mjs)

## Verification

Passed focused existing suites: skate-foley, audio-polish, map-contact-depth, graphics-actor-swap-and-vfx-scale, graphics-quality-presets (32 tests); agent08-audio, audio-reactions, surface-audio-propagation and the initial five lifecycle regressions (29 tests). Two additional lifecycle cases were then added and passed alongside the existing contact-depth suite (13 tests, including repeated checks). No full-suite or GPU result is claimed by this specialist.

Seven new behavioral regressions prove: shared successful decoding and failed-only retry; disposal rejecting late delivery; next-render AO fade/same-count actor replacement; impossible resize rejected before any allocation; recorded replay surface without live-state mutation and source-time scrape cutoff; actual SkateAudio first-failure recovery without duplicate banks; quality rollback restoring prior settings after mutation/allocation failure. Existing injected normal-pass exception coverage confirms visibility/renderer restoration.

## Conditional work deferred

**PERF-02/03:** retain existing assets and batching. The audit's short current 1080p native-glow baseline was about143.8/143.9/141.5 callbacks per second across Warehouse/Orbit/Paradise. Its decoded texture estimates and source primitive counts do not establish an allocation/submission bottleneck. No KTX2 migration or visual batching is justified without a matched measured improvement. The lead may revisit if its final profile reveals a regression. Accepted glow1.50/1.09/.10/.11, native144 target, 2× edge smoothing and existing quality tiers remain intact.

Remaining verification belongs to the lead: current Ultra/Cinematic actor fade screenshots, production audio failure/recovery smoke, actual supported-DPR render behavior, full integration/build and local preview. Human sound approval, hardware OOM resilience and sustained144FPS are not certified by CPU fixtures.
