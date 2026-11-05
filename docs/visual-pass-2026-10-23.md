# First visual pass — 23 October 2026

This pass adds contact shading, per-map lighting, material variation and rider calibration, based on audited revision `4e94abc`. The verification below records the pre-release checks.

## What changed

| Area | Result | Main implementation |
| --- | --- | --- |
| Contact shading | Four soft wheel-contact patches follow measured riding-surface normals. They clear on jumps, bails, grinds, resets and visual-only highlights. | `src/graphics/WheelContactShadows.js` |
| Iron District | Warm directional light, cooler fill, less environmental wash, nonmetallic concrete/brick/asphalt, subtle broad surface variation. | `src/graphics/MapLook.js`, `SurfaceFinish.js` |
| Orbit | Calmer galaxy backdrop, matte ceramic riding surfaces, cooler directional separation and bounded structural shadows. | `src/park/OrbitPark.js`, shared look/finish modules |
| Grand Warehouse | Lower ambient fill, warm key and cool skylight, variation in timber/rubber/concrete roughness, selected ramp shadows. | Shared look/finish modules |
| Rider calibration | Tuxr's painted body no longer inherits glTF's metallic default. His crouched pelvis clears the deck by at least 35 cm in the tested stance; the ankle targets stay planted. | `RiderMaterialPresentation.js`, `UnrealRider.js` |

The contact patches use one instanced draw with four quads, no texture downloads and no additional ground probes. They are excluded from the bloom pass and disposed with the graphics pipeline. Existing directional shadows still handle airborne silhouettes. Replay deliberately uses those directional shadows because its recorded poses do not contain current wheel-contact data.

Orbit and Grand Warehouse select at most 12 opaque ramp/structure batches as new shadow casters. Roof batches are excluded. Performance mode disables these new structural casters; returning to higher presets restores them. The existing 1024² shadow atlas is retained.

Surface variation uses world-space color/roughness modulation over existing materials. It preserves original image maps, UVs, vertex positions and collision meshes. This is a restrained response/variation pass, not a replacement texture package or baked ambient-occlusion delivery. The original large-scale ground texture repetition is reduced only subtly; new tiling assets and authored wear would be a separate art pass.

Map lighting overrides are applied after imported manifest defaults so switching maps cannot silently restore the old ambient levels. One non-shadowed directional fill helps separate riders and ramp faces. Known Heretic material calibration stays in effect; Tuxr's separate emissive accessory and custom uploaded rider materials retain their authored response.

## Verification

- Production build succeeds: 212 modules, main bundle 1,143.31 kB / 316.00 kB gzip. Existing large-bundle and mixed GLTFLoader-import warnings remain.
- Full regression suite: **753 passed / 757 total**. Six new visual-pass tests pass.
- Dedicated board, vert and pumping checks: **50/50 passed**.
- Tuxr's previously failing crouch-clearance test now passes. The new test also checks deep knee bend and planted foot targets in both stances using the real TuxR GLB and production asset URL.
- Contact tests cover ramp orientation, read-only physics data, hiding on unsupported states, reset rejection and GPU-resource disposal.
- Material tests cover retention of source maps/geometry and previous shader hooks. Shadow-budget tests cover roof exclusion and reversible quality changes.
- Browser review completed for Iron District, Orbit and Grand Warehouse. Observed Orbit airborne trick rendering, warehouse Tuxr rendering and the Performance/Cinematic transition. No warnings or errors appeared in the sampled browser logs.
- `git diff --check` succeeds. The pre-existing playlist edit was not part of this pass.

Four failures already identified by the audit remain:

1. `agent02-transition-flight.test.mjs`: quarter launch-height energy bound.
2. `agent02-vert-momentum-regression.test.mjs`: diagonal coping energy bound.
3. `custom-ghost-board-emission.test.mjs`: ghost opacity expectation.
4. `map4-physics-video-regression.test.mjs`: maximum-speed vert-height bound.

These keep the full suite from being green. They were not changed to make this visual pass pass.

The browser review is visual and functional evidence, not a GPU benchmark. Hardware frame times, mobile thermals and sustained high-refresh performance were not measured. The additional light, fragment-shader variation and structural shadows have a rendering cost despite the bounded caster count.

## Review artifacts

- [Iron District](G:/Streetskate/artifacts/visual-pass-2026-10-23/iron-district-gameplay.png)
- [Orbit](G:/Streetskate/artifacts/visual-pass-2026-10-23/orbit-gameplay.png)
- [Grand Warehouse / Tuxr](G:/Streetskate/artifacts/visual-pass-2026-10-23/warehouse-tuxr-gameplay.png)
- [Warehouse / Performance](G:/Streetskate/artifacts/visual-pass-2026-10-23/warehouse-performance.png)
- [Full test output](G:/Streetskate/artifacts/visual-pass-2026-10-23/unit-tests.txt)
- [Physics verification output](G:/Streetskate/artifacts/visual-pass-2026-10-23/physics-tests.txt)
- Final build: `G:/Streetskate/artifacts/visual-pass-2026-10-23/final-build`.

Screenshots show sampled gameplay viewpoints, not locked-camera before/after comparisons.
