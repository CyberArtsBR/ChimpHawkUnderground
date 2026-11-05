# Agent 07 — AAA Rendering / Environment Performance Audit

**Repository:** CyberArtsBR/StreetSkate
**Branch:** `audit-fix/07-graphics-performance`
**Baseline `main` SHA:** `ff33677541f61b803901ac37c2465226799ec8a3`
**Scope:** `src/park/SurfaceMaterials.js`, `src/park/SolarDockPark.js`, `src/park/RooftopCity.js`, new `tests/agent07-*.test.mjs` and `tools/agent07-*.mjs`. Other owned files were audited but left unchanged. `game-main.js`, collision topology, transition metadata, `main`, deployment remain untouched.

## Confirmed code-level findings

1. **Discarded albedo generation.** The old `surface(kind)` created two 1024×1024 Canvas elements per material, filled an entire color ImageData and relief ImageData, then `createSurfaceMaterials()` disposed **all three new color maps immediately** and replaced them with pinned WebP photographs. Across three surfaces this generated six 1,048,576-pixel ImageData buffers for only three useful bump maps. The unused color noise, knots, drawing commands and canvases were startup CPU/JS-GC overhead, not a visual feature.
2. **Oversized single-purpose bump maps.** Three uncompressed RGBA CanvasTexture bump maps used 1024² each; a 512² bump signal is adequate to complement the original high-resolution photographed color maps. At 4 bytes/texel, their *base-level theoretical data size* changes from **12 MiB** to **3 MiB** (mipmaps and driver storage excluded).
3. **Duplicate mural resources.** Five separately created graffiti materials with identical photo/alpha settings produced five 128×128 alpha textures despite using the same graffiti photograph. Original static mesh construction submitted 8 profiled-ramp decals, 4 upright murals, 7 floor decals and 6 curved pool pieces: **25 mural meshes**.
4. **Existing batching is good.** Solar Dock already merges visible geometry by material and separately merges rideable collision proxies. Do **not** change the geometry topology, UV-to-collision correspondence, rail path shape, transition IDs, or ground/vert metadata for visual optimization.
5. **Decorative draw overhead.** `RooftopCity.js` used five separate meshes for one slab plus four coplanar-material fascia walls. The slab deliberately has a distinct shadow setting.
6. **Renderer-global concerns require integration.** `game-main.js` sets DPR cap 1.7, ACES tone mapping/exposure 0.94 in Solar Dock, a 2048² sun shadow atlas covering 180×180 metres, fog, and the loaded HDRI environment. Tuning these without GPU and image comparisons risks losing quality. They were not changed.
7. **Asset integrity.** WebP color textures and the 4K dusk HDRI are listed in `assets-source/solar/manifest.json` with SHA-256 values; `tools/materialize-textures.mjs` verifies hashes at build time. `SolarSky.js` already limits its PMREM `fromScene` cubemap face size to 256; leave it alone until a measured HDRI/per-frame profiling baseline exists.

## Changes implemented

### `src/park/SurfaceMaterials.js`
- Removed **three discarded 1024px procedural color maps** entirely. Keep the original pinned 2D WebP photographs for full color/detail.
- Retained procedural grain and concrete relief at **512×512** (three deterministic 4-channel data buffers) with plywood fibers, sheet joins, screw-head depressions and subtle concrete texture.
- Retained shared photographic albedo with correct `THREE.SRGBColorSpace` and non-color bump maps. Kept rough, nonmetallic wood and concrete. Made wood slightly more tactile while avoiding artificial plastic gloss.
- Cached one graffiti material and one feathered 128px alpha texture for all murals; existing API signature remains callable.

### `src/park/SolarDockPark.js`
- Matched mural geometry across **four geographic quadrants** and batch-merged via `mergeGeometries`, preserving their world-space transforms, UVs, transparency, collision independence and per-zone visibility.
- If a batch cannot be merged, preserve original artwork instead of dropping it.
- Refined coping metal from muted grey-green to neutral sun-catching steel (`metalness: 0.82`, `roughness: 0.27`) and adjusted turquoise painted hardware to a lower-metalness, more readable finish (`metalness: 0.25`, `roughness: 0.34`).
- Did **not** modify the functions producing rail paths, transition metadata, riding surfaces, or collision proxy geometry.

### `src/park/RooftopCity.js`
- Combined four material-identical fascia meshes into one; kept the below-bowl slab separate so its original non-shadow-casting behavior remains intact.

### Tools and tests
- `tools/agent07-park-audit.mjs`: constructs the **real Three.js park geometries and materials** under a headless canvas/image IO stub. Reports mesh/material/texture counts, exact triangle and attribute-buffer counts, photo requests, decal batches, retained rail names and collision batches. It is a **structural CPU-side audit**, not a GPU benchmark.
- `tests/agent07-rendering.test.mjs`: validates three 512px relief canvases, shared photographic resources and mural alpha mask, color spaces, grouped mural count, rooftop batching, triangle manifest parity and collision/rail metadata retention.
- `tools/agent07-browser-audit.mjs`: runs a local browser build and collects real `renderer.info.render`, `renderer.info.memory`, shader-program counts, texture dimensions, materials and scene meshes over 90 frame samples at a fixed 1440×900/DPR1 baseline. Does not invent GPU timer values.

## Before / after inventory

| Item | Before (source-derived) | After (implementation target) | Type |
|---|---:|---:|---|
| Procedural full-color 1024² canvases | 3 | 0 | Deterministic code |
| Relief canvas resolution | 3 × 1024² | 3 × 512² | Deterministic code |
| RGBA relief base-level storage | 12 MiB | 3 MiB | Theoretical size, not driver memory |
| Relief + discarded color ImageData pixels written | 6,291,456 | 786,432 | Deterministic code |
| Murals’ distinct materials / alpha textures | 5 / 5 | 1 / 1 | Deterministic construction |
| Standalone mural artwork meshes | 25 | ≤4 batches | Scene construction, full-scene count |
| Rooftop support meshes | 5 | 2 | Scene construction |
| Solar Dock riding surfaces / rail paths | Original | Unchanged | Physics constraint |
| End-user FPS, actual GPU memory, actual draw calls | Unmeasured | Unmeasured | Requires live comparison |
| Production Vite build | Not run in this session | Pending CI | Do not claim success early |

The potential **21+3 fewer decorative draw submissions** is a code-level *upper-view estimate*: it assumes the artwork and fascia were visible and does not account for GPU driver, culling or shadow passes. The full renderer audit will provide genuine draw counts instead.

## Actual CI headless audit (2026-10-09)

[GitHub Actions run #443](https://github.com/CyberArtsBR/StreetSkate/actions/runs/37918404464) executed the new tests against this branch's source tree. The structural-audit tool constructs real Three.js geometry/material objects but mocks canvas/image IO; these are **actual headless scene construction counts**, not GPU or browser benchmarks.

| After-change statistic | Observed CI value |
|---|---:|
| Visible park meshes (including rooftop) | 15 |
| Collision meshes | 142 |
| Distinct visual materials | 11 |
| Distinct material textures | 7 |
| Geometry-attribute allocations (unique scene geometries) | 2.411 MiB |
| Visual triangles (actual + manifest) | 28,301 |
| Mural spatial batches | 4 |
| Rooftop support meshes | 2 |
| Rideable collision mesh batches | 1 |
| Authored rail paths | 12 |
| Relief ImageData base bytes (3 × 512² × RGBA) | 3,145,728 |

**Validation:** all 4 Agent 07 regression tests passed; complete suite 347/349 passed. The 2 failures are `9. low-speed capture does not create large fake speed` and `ground steering owns the complete park carve curve` in non-owned physics tests. The workflow skipped physics verification, production build and browser smoke after `npm test` exited nonzero. **A production build and before/after WebGL renderer benchmark have not been executed on this branch.** The initial main merge commit already reports two physics failures, but their exact baseline logs were not rerun for this agent.

## Repeatable validation

```bash
npm ci
node tools/agent07-park-audit.mjs
node --test tests/agent07-rendering.test.mjs
npm test
npm run verify:physics
npm run build

# Optional browser benchmark on a LOCAL build
npm install --no-save @playwright/test@1.56.1
npm run preview -- --port 4173
STREETSKATE_URL=http://127.0.0.1:4173 node tools/agent07-browser-audit.mjs
```

Tests/build **must be verified by CI or an environment with installed node dependencies and access to the full repository**. A build passing on another SHA does not verify this branch. The starting merge commit mentions two existing physics failures; confirm whether those remain independently from Agent 07 tests.

## Integrator-owned `game-main.js` proposals (DO NOT auto-apply)

**Diagnostic hook (safe, low cost when called):** Inside the exported `window.streetSkate = { ... }` object, adjacent to `captureAuditTelemetry`, consider adding:

```js
captureRenderMetrics: () => ({
  calls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
  shaderPrograms: renderer.info.programs?.length ?? 0,
  effectivePixelRatio: renderer.getPixelRatio(),
  shadowMapSize: [sun.shadow.mapSize.x, sun.shadow.mapSize.y],
}),
```

**Shadow-quality issue for integrator study:** Existing 180m orthographic sun shadow extent at 2048² translates to approximately 8.8 cm per shadow texel. Contact details on trucks, wheels and feet may suffer. Profile near-player shadow framing or a scene-scaled quality preset **only after testing** against rooftop wide views, bowl/vert movement and camera occlusion. Never silently increase the global shadow atlas or sacrifice gameplay readability.

**Color grading/DPR:** Current Solar Dock overrides exposure to 0.94 and uses ACES. Compare calibrated sunset and dusk screenshots at DPR 1.0/1.5/1.7 before making adaptive-resolution, additional AO/bloom or exposure changes. Keep initial renderer bootstrap work with the integrator.

## Coordination and residual risk

- Translucent batches are spatially clustered rather than globally merged to limit cross-park sorting and retain coarse frustum culling. Browser screenshots should compare overlapping transparent mural/guard-glass conditions.
- Headless tests verify topology/metadata constraints structurally; physics agents own full gameplay collision regression.
- Live Chrome/Firefox/WebGL1/WebGL2, real GPU memory, live FPS, real resource disposal under context loss and HDRI compile cost are **not measured** by this report alone.
- No extra post-processing, no new texture downloads, no renderer setting change, no deploy, no merge.
