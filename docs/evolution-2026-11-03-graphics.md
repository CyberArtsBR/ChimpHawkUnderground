# Game Evolution review: graphics, assets and performance

Baseline: main release `f62779d`; review date 2026-11-03. Owner: graphics/performance specialist. This review uses the shipped Three.js 0.180 renderer, source inspection, existing captured evidence and fresh deterministic regressions. It does not claim a fresh GPU profile or human visual approval. Root integration owns the new browser inspection.

## Findings and selected implementation

| ID | Priority / status | Player-visible finding and evidence | Change, cost and acceptance |
|---|---|---|---|
| EV-GFX-01 | P2 / implemented, focused tests verified | Swap the rider while retaining the same active board. `StreetSkater.setRiderModel` replaces a nested child of the stable visual group. `GraphicsPipeline.renderSelectiveBloom` previously checked only scene child count, emissive mesh count and a 120-render-frame timeout. A same-count replacement left the new non-emissive face/clothes unmasked until timeout and retained the old disposed mesh in the bloom cache. The new regression failed on baseline at the first replacement frame. | Compare the visual group's direct child references, usually two, and refresh the existing scene cache immediately on identity change. No full-scene traversal on unchanged frames. Low complexity/risk; board glow and restoration-on-error remain unchanged. Acceptance: new costume black in the bloom mask on its first frame, restored afterward, old mesh/root no longer retained, unchanged actor still reuses cache. All pass. |
| EV-GFX-02 | P2 / implemented, focused tests verified | Dust/spark apparent size changed with rendering resolution. `SkateEffects.setSize` clamped actual drawing ratio to 1–2.25, while settings support render scale .6–1.25 and native high-DPI. At ratio .6, an expected 9.9 CSS-pixel particle became 16.5 pixels, 66.7% larger. At DPR4, the old clamp produced 5.56875 rather than 9.9 pixels, 43.75% smaller. | Use the actual finite positive render ratio for shader viewport height. Low complexity/risk; no change to particle counts, lifetimes, launch speed, glow defaults or physics. Acceptance: CSS footprint remains constant for ratios .6/.75/1/1.25/2/2.5/4/5, invalid ratios fall back safely. All pass. Existing hardware point-size limits still apply. |
| EV-GFX-03 | P2 / profiling backlog | Latest prior 30-second routes do not demonstrate a general FPS gain or locked144: Warehouse 142.4→130.2, ORBIT132.4→131.7, Paradise120.5→115.9, with p95 frame intervals around7.0–7.1ms. Routes/machine contention limit attribution. Evidence: `artifacts/aaa-polish/reflective-pass/performance-comparison.json`. | Controlled repeated same-route/same-view runs, one active game, fixed DPR/preset, CPU/GPU trace, median of runs. Medium complexity; no automatic quality reduction. Acceptance: profile the actual hotspot and demonstrate a repeatable gain without changing the requested image quality. This cycle's two correctness fixes make no FPS-gain claim. |
| EV-GFX-04 | P2 / asset-pipeline backlog | Transfer optimization has reduced Paradise's selected payload from50,686,100 to16,267,532bytes, but decoded JPEG/PNG textures still occupy ordinary GPU textures. ORBIT galaxy remains4096×2048, retained originals increase deployment size. Evidence: `docs/aaa-polish-status.md`, `docs/asset-delivery-optimization.md`, asset headers. | Evaluate KTX2/Basis for a measured GPU-memory target, keeping source assets and image comparisons. Medium/high complexity; color-space, normals, decoder and fallback risks. Acceptance: real-device decoded-memory reduction, bounded texture error and unchanged scene/collision data. Not installed or implemented speculatively. |
| EV-GFX-05 | P3 / verification backlog | Scene shader warmup compiles currently visible materials before skating; bail liquid and other initially invisible effects can still require their first shader compilation later. Source: `ShaderWarmup.js`, `SkateEffects.js`, `BailLiquid.js`. A resulting hitch has not been established in this review. | First-bail/contact trace in a cold context before expanding warmup. Low/medium cost; load-time cost and unnecessary variant compilation risk. Acceptance: attribute an actual long frame to compilation, then compare first-contact p95. Treat as a hypothesis, not a confirmed defect. |
| EV-GFX-06 | P2 / implemented, asset regression verified, visual A/B integration-owned | New browser `orbit.png` visibly retains a dense field of hard, disconnected charcoal bars across polished concrete. GLB inspection identifies 785 `Deck / short joint` meshes, each 3.7m×.021m and 2.5–11.5mm above the floor. The importer already removes 785 matching `Deck / expansion joint` meshes but leaves their short counterparts, creating an incomplete seam grid. They persist in the prior no-shadows capture, unlike the fixed dense shadow-acne bands. Evidence: `artifacts/evolution-2026-11-03/orbit-joints-diagnosis.json`, `artifacts/evolution-2026-11-03/browser/orbit.png`, `artifacts/orbit-floor/practice-no-shadows.png`. | Extended the existing decorative helper filter to include `Deck / short joint`, preserving actual ramp panel joins and utility grilles. Low complexity/risk; these 785 meshes contribute no collision surfaces. The source GLB is unchanged; all 66 ramp panel joins, 32 grilles, 156 collision meshes and 14 rails pass preservation checks. 9,420 decorative triangles removed. Frozen same-camera visual A/B remains integration-owned. |

## Architecture and art checks

- Rendering remains an imperative Three.js adapter with optional HDR selective bloom, CAS sharpening and stable environment reflections. No new renderer, temporal history, SSR, engine or dependency was introduced.
- All six presets retain the requested shared emissive1.50/bloom1.09/contribution.10/radius.11 defaults and per-preset user overrides. 144 FPS remains a target dependent on hardware and display refresh.
- ORBIT polished concrete retains roughness.18/metalness.28/environment1.85; flat-floor self-shadow casting stays disabled while receiving shadows remains enabled. No floor/collision/rail geometry changes in this cycle.
- Fresh screenshot inspection did not establish a clean ORBIT floor: the incomplete authored seam grid was visibly distracting and prompted EV-GFX-06. Removing those decorative bars does not certify all material, aliasing or art-direction weaknesses resolved; the broad polished surface still needs context-specific visual review.
- Static scenery freezing excludes actors, bones, skinned meshes and explicitly dynamic branches. The new bloom invalidation does not change those ownership rules.
- Park disposal deduplicates resources, protects retained/shared textures and releases collision BVHs. Existing lifecycle evidence supports ten successful park switches, not a browser-heap/VRAM leak certification.
- Existing contact particles and liquid use bounded reusable pools. This cycle corrects their scaling without increasing the particle budget or adding reflection passes.
- Creative integrations available to the project include Blender and media-generation tools; neither is necessary for these verified defects. No paid generation, new plugin or package installation was performed.

## Quality scorecard

Scores are reviewer judgments against this PC browser skating game's constraints, not AAA production certification. Only the two listed defects have fresh before/after verification here; visual/performance scores rely on explicitly linked prior evidence.

| Discipline | Baseline → candidate | Basis / confidence |
|---|---|---|
| Rendering correctness | 7→8/10 provisional | Immediate actor-mask invalidation and consistent particles fixed; 32 focused checks pass. Full visual matrix is integration-owned. Moderate confidence. |
| Asset pipeline | 7→7/10 | Proven transfer reduction and untouched source/fallback; compressed GPU textures remain unimplemented. Moderate confidence. |
| Performance | 6→6/10 provisional | Existing routes approach but do not sustain144; no new controlled GPU result and no claimed speedup. Low/moderate confidence. |
| Visual art / lighting | 7→7/10 provisional | Existing map captures/material review, coherent shared glow and reflective ORBIT; no new art or independent human inspection this cycle. Low/moderate confidence. |

## Verification

Fresh command:

```text
node --test tests/graphics-actor-swap-and-vfx-scale.test.mjs tests/selective-bloom-rider-board.test.mjs tests/agent07-performance-budget.test.mjs tests/skate-effects.test.mjs tests/graphics-quality-presets.test.mjs
```

Result:32passed,0failed. The two new tests both failed against the original source and pass after the changes. Test coverage includes first-frame actor mask/restoration, disposed-reference eviction, cache reuse, particle footprint and invalid-input handling; existing checks retain glow/defaults, renderer-error restoration, material-specific particles, fixed pools and replay effects.

Additional follow-up: 21 ORBIT/semantic/visual tests pass, including `tests/orbit-decorative-joints.test.mjs`; its before-change failure was 42,846 actual vs 24,006 expected seam vertices. It now compares all retained seam vertices and baseline collision/rail hashes. Evidence: `artifacts/evolution-2026-11-03/orbit-joints-tests.log`; baseline numerical contract: `artifacts/evolution-2026-11-03/orbit-before-joint-filter.json`.

Changed runtime files: `src/graphics/GraphicsPipeline.js`, `src/graphics/SkateEffects.js`, `src/park/OrbitPark.js`. New regressions: `tests/graphics-actor-swap-and-vfx-scale.test.mjs`, `tests/orbit-decorative-joints.test.mjs`. No authored asset files changed. Build/full-suite/browser evidence belongs to the integrated milestone report.
