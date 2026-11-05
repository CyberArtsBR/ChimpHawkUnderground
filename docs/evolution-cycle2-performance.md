# Local performance review — 2026-11-03

This is local investigation for the next polish cycle. There is no release, upload or deployment. The quality contract remains the native-resolution 144 FPS preset, render scale 1, glow 1.5/1.09/.1/.11, edge smoothing, 1024² shadows and the existing collision/animation fidelity. Sustained 144 FPS remains unproven.

## Measured candidates and decisions

| Candidate | Evidence | Decision / controlled verification |
|---|---|---|
| Finish shader preparation for the actual render pipeline | In the approved production build (`index-CtSN9U7h.js`), an 8-second CDP CPU sample after a 2-second warmup still spent 231.873 ms in `getProgramInfoLog` on Grand Warehouse and 1049.738 ms on Paradise. The existing warmup compiles the scene using its current material/target state; the later offscreen/bloom occluder states can require additional variants. | Highest-priority investigation. Root agent owns a load-time warmup change. Compare the first moving route after load and repeated warm routes, with identical quality and submitted draw counts. A stall moved behind the loadout is a first-route improvement; it is not evidence of higher steady-state GPU throughput. [CPU baseline](../artifacts/evolution-cycle2-performance/cpu-baseline/report.json). |
| Reduce retained per-frame rider scratch allocation and repeated matrix propagation | The isolated actual 61-bone rider+board update costs about 0.25–0.30 ms/frame in the latest source snapshot. Coasting creates 110 `Vector3.clone()` results and visits 1875 objects recursively through `updateWorldMatrix`; the Indy-air probe creates 113 clones and 1977 recursive visits. Direct vector/quaternion constructors are additional. | Measurable CPU work, but not selected without a browser allocation/CPU profile identifying a worthwhile hotspot. Reusing scratch storage must preserve sampled poses, velocities, wrist/foot contacts and rendered animation. Animation source changed during the review; these runs are not an optimization comparison. [Probe and source hashes](../artifacts/evolution-cycle2-performance/source-probes.json). |
| Cache selective-bloom actor collection | Actual Heretic+board topology is 125 nodes/27 meshes. Collection with a new Set/traversal measures 0.00552 ms; reused Set without material-array wrappers 0.00528 ms; cached mesh list 0.00166 ms. The existing method with GPU work stubbed measures 0.00673 ms on the actor-only scene. | Rejected as this cycle's optimization: about 0.004 ms potential in this isolated probe does not explain the 144 FPS gap. Rider/board invalidation complexity requires a stronger reason. Existing mesh/material replacement storage already reuses a flat array. [Probe](../artifacts/evolution-cycle2-performance/bloom-mask-probe.json). |

CPU-only microprobes use actual GLB geometry/skeletons with texture loading omitted. They do not measure GPU work, browser animation scheduling, texture upload or frame presentation. The clone counter omits direct constructors. Matrix counts include recursive object visits rather than counting only root calls. Other work on the shared machine can affect elapsed timings; no speedup is inferred from separate source snapshots.

## Raw exports and runtime scene graphs

Raw GLB mesh counts are not the batched runtime graph or submitted draw calls. Source inspection found Grand Warehouse and ORBIT already batch by material/attribute signature before rendering. The runtime CPU baseline confirms:

| Map | Raw GLB nodes / mesh definitions / primitives | Runtime park nodes / meshes |
|---|---|---|
| Grand Warehouse |1457 /1412 /1505 |156 /146 |
| ORBIT |2625 /2623 /2625 |30 /22 |
| Paradise |501 /416 /480 |612 /483 |

All three baseline actors have 125 nodes/27 meshes and one skinned mesh. Added wear/decorations explain why runtime Paradise is larger than its source graph. Runtime graph counts still differ from submitted draw calls because render passes, visibility, groups and shadows contribute separately. [Raw source inventory](../artifacts/evolution-cycle2-performance/source-probes.json), [runtime graph and unchanged quality](../artifacts/evolution-cycle2-performance/cpu-baseline/report.json).

## Cold loading and lifecycle review

An in-memory production build (`write:false`, leaving `dist` untouched) measured the main entry at 1,304,113 bytes /365,148 gzip bytes. Its eager source contributions include SSRPass+SSRShader 32,445 rendered-source bytes; GTAO/SimplexNoise/GTAOShader/PoissonDenoise 52,641 bytes; debug/trace/snapshot 19,107 bytes. These are pre-minification module contributions, not transferable gzip savings. Every current preset disables SSR; GTAO remains available on Ultra/Cinematic. A lazy boundary would need loading/failure/preset-transition verification. The default Paradise path uses `TestMapLoader`, so merely lazy-loading the creator's map importer would not remove that loader from startup. [Bundle inventory](../artifacts/evolution-cycle2-performance/bundle-inventory.json).

Current gzip files are 16,267,532 bytes for optimized Paradise, 8,386,149 for ORBIT and 6,033,768 for Grand Warehouse. They change transfer/decompression behavior; they do not establish reduced decoded GPU texture memory. No KTX2/Basis or new dependency was introduced. The buffered gzip loader, texture decode/upload and first-effect shaders remain appropriate cold-load profiling targets before changing delivery.

The active `disposeParkWorld` gathers unique geometry/material/texture resources, includes custom shader uniforms, protects resources retained by the next world/shared material cache, and disposes geometry BVHs. Surface-detail resources attach to the owned park graph and use the same disposer. Source review alone establishes no long-session browser heap/VRAM guarantee. The prior ten-switch harness sampled resource counts after short delays; it did not capture browser heap dominators, ImageBitmap lifetime or long replay/actor stress. Preserve KI-08 until that evidence exists.

## Telemetry correction

`FrameMetrics.cpuSubmitMs` brackets only `GraphicsPipeline.render()`. It excludes input, physics, rider animation, HUD and audio. The new `cpuSubmitScope: 'graphicsPipeline.render'` explicitly records that boundary. CDP sampling supplies route-wide CPU attribution when requested.

The old GPU field held the latest asynchronous query result across frames. The previous performance tool added that same value once per RAF, incorrectly inflating the number of GPU samples. `FrameMetrics` now publishes a monotonic `gpuSampleSerial` and `gpuSampleFresh` only when a valid query resolves. It retains the last valid numeric result for display between completions; disjoint events and suspension clear it and release outstanding queries. Suspension does not reuse serials, so a collector can distinguish route epochs. Focused tests cover held values, disjoint invalidation, pending/active query cleanup, serial continuity and unsupported extensions.

The paired profiler also supports the immutable older baseline: it observes each actual `QUERY_RESULT` once per `WebGLQuery`, without issuing extra queries. If the GL context method cannot be observed, it falls back to serial deduplication; an older build without either mechanism reports no GPU samples instead of counting stale values. Serial fallback can retain only the newest result when multiple queries resolve between collector callbacks.

## Reproduction

Run from the repository root in PowerShell, using two immutable local builds served on different ports:

```powershell
$env:PERF_BASELINE_URL = 'http://127.0.0.1:5185/'
$env:PERF_CANDIDATE_URL = 'http://127.0.0.1:5186/'
$env:AUDIT_PERF_OUTPUT = 'artifacts/evolution-cycle2-performance/paired'
$env:PERF_CPU_PROFILE = '1'
node tools/profile-runtime-paired.mjs
```

Defaults are three repeats ×12 seconds for each of Grand Warehouse, ORBIT and Paradise, with one active game. Pair order alternates per repeat. The script fixes 1920×1080/DPR1, native 144 preset, glow, edge smoothing and spawn; it fails on a quality mismatch, lost focus or a route leaving gameplay. It records CPU/GPU distributions, actual graph sizes, cold navigation/resource sizes, resource counts, spawn/end positions and median run values. The keyboard event schedule is identical in wall time; render-rate-dependent physics can still produce route drift, which the position data exposes. It is not deterministic simulation replay.

`PERF_REPEATS`, `PERF_DURATION_MS` (minimum 10000), `PERF_MAPS`, `PERF_CPU_PROFILE` and `AUDIT_PERF_OUTPUT` control the capture. Omitting the baseline URL makes a candidate-only capture. CPU profiles add overhead; apply the same setting to both targets, and keep CPU-profile attribution separate from final low-overhead timing runs. Close other games/profilers and avoid builds, audio rendering or CPU microprobes during timing.

```powershell
node --test tests/frame-metrics.test.mjs
node --check tools/profile-runtime-paired.mjs
node artifacts/evolution-cycle2-performance/source-probes.mjs
node artifacts/evolution-cycle2-performance/bloom-mask-probe.mjs
node artifacts/evolution-cycle2-performance/bundle-inventory.mjs
```

Current verification: the focused FrameMetrics/warmup/bloom set passes 16 tests and the paired profiler passes syntax checking. The final short browser check validates fresh GPU serials, preserved image settings and the actual shader warmup. The longer paired run was not repeated after the owner's minimum-testing instruction. Report browser callback/submitted-frame statistics as such; do not call them display presentation or locked 144 FPS.

## Delivered first-use correction

The approved cold capture had four program-log calls totalling 1,071.5 ms after play began. A first composed draw during loading moved three calls, but the wheels' `StingrayPBS1` shader still first appeared when speed activated their bloom. The final warmup explicitly includes those real wheel materials in its temporary mask, then restores ordinary mask membership without changing emission. It runs synchronously after async compilation while the selected loadout is still current; material/fog/effects restoration remains in the existing renderer `finally` path.

Final short capture: all four calls, 1,128.4 ms total, occur during selection; zero program-log calls occur in the sampled first playable interval. Source and actual-browser verification are recorded in `artifacts/evolution-cycle2/local/report.json`. This shifts work before gameplay rather than removing shader cost or demonstrating higher steady-state throughput. Native resolution, bloom, AA and shadows remain enabled. Independent source review found no actionable lifecycle/fidelity issue.
