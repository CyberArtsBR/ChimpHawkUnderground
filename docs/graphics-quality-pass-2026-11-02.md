# Graphics and asset quality pass — 2026-11-02

## Local presentation changes

- Heretic costume metalness cap .22 -> .08; roughness floor .58 -> .72. This restores a matte textile response while retaining supplied maps, black clothing, geometry and existing emissive accessories. Custom riders are untouched. Broad map fill changes are restrained: Warehouse .50 -> .65, ORBIT .55 -> .68, Paradise .42 -> .50. Global glow, bloom, emissive defaults and edge smoothing are unchanged.
- Surface particles use the same validated physical tags as skate sound. Only metal grinds produce sparse luminous sparks; concrete/wood produce restrained nonluminous contact debris, rubber none. Clean metal/rubber landings have no dirt cloud. Pool sizes and quality gating are retained.
- Replay VFX consumes timestamped point/normal/material/strength events without simulation or scoring. Pools/liquid advance through `updateReplay` and expire/reset normally.
- Liquid keeps the requested existing footprint. A thinner rounded meniscus and slightly rougher outer wet edge refine highlights; mild contacts reduce splash velocity rather than enlarging the puddle. Surface-normal alignment, eight bounded curvature probes, pooling and toggle are preserved.

## Paradise delivery

Original GLB: 50,686,100 bytes. Optimized GLB: 20,384,272 bytes. Optimized gzip delivery: 16,267,532 bytes (67.9% below the original network payload).

Six 4096² ground images become 2048²; sky 8192×4096 becomes 4096×2048. Plywood is unchanged. JPEG quality is 94 for normal data and 90 otherwise with no chroma subsampling. This is lossy texture optimization, with gzip applied afterward. It reduces texture residency for resized images roughly fourfold; no universal FPS improvement is claimed.

All 1,741 nonimage buffer views are byte-identical. Mesh primitives, accessors, indices, normals, UVs, transforms, materials, texture assignments, samplers, authored rails and collision metadata are unchanged. The original GLB is retained as fallback/source. Rebuild/report: `tools/optimize-paradise-textures.py`, `artifacts/paradise-textures/report.json`.

Normal-angle and RGB statistics in that report compare recompressed output with the resized source; they do not measure the detail lost by downsampling. Visual A/B captures are required for that tradeoff.

## Evidence and remaining review

`tools/verify-quality-materials.mjs` captures frozen identical cameras and raw scene rendering for controlled material comparison, not performance benchmarks or every gameplay camera/preset certification. `artifacts/material-quality-pass` contains three-park Heretic before/after and Paradise original/optimized close-ground and route views. Agent inspected the three rider pairs and both Paradise texture pairs: optimized fine asphalt is slightly softer; cracks, landing edges, sky and palette remain readable. Rendered mean absolute RGB channel difference is .84/255 close-ground and .58/255 route. Runtime GPU/performance measurements are performed separately by the lead agent.

AR-02 follow-up: reproduced the dense floor bands through the practice path at a frozen Follow-like camera. Disabling normal maps did not remove them. Disabling only the broad flat deck's `castShadow` removed them while keeping `receiveShadow` true. Source GLB positions/normals are flat and unchanged. The bounded caster selector now excludes flat wide ORBIT ceramic receivers, fixing the demonstrated self-shadow acne without editing collider/source geometry, rails, ramp casters or the1024 shadow atlas. `artifacts/orbit-floor/practice-baseline.png`, `practice-no-normal.png` and `practice-no-floor-cast.png` are the diagnostic A/B.

The requested polished floor response is centralized across all material preparation stages: roughness.18, metalness.28, environment intensity1.85, restrained normal scale.045. The existing galaxy equirectangular environment supplies stable reflections; no SSR, per-frame cubemap, new render pass or realtime rider reflection is introduced. Blue tint remains supplied; floor-only surface variation is restrained so it no longer overrides the polished finish back to matte. Final polished/matte/acne comparisons are in `artifacts/orbit-floor/`.


AR-03/04: inspected existing `WarehouseVisualPass`, `OrbitVisualPass` and `ParadiseSurfaceDetail`: they already add bounded projected wheel wear, localized repairs, practical-light bounce and navigation/caution marks near authored routes. New random props or another decal layer would duplicate that work. No new physical obstacles or landing-corridor clutter was added. A full authored first-line/landmark review remains a playtest task.

No dynamic reflection replacement, KTX2 dependency, whole-ragdoll rewrite, or geometry simplification was introduced. Targeted tests cover surface emission rules, replay lifetime/reset, retained liquid alignment/footprint and supplied-material preservation. Physical controller testing, ten-cycle heap/GPU lifetime profiling and all-rider/all-camera motion certification remain outside this bounded visual pass.
