# StreetSkate Map 3 — Skatewarehouse exact GLB replacement

**User-approved target:** `Skatewarehouse.glb` uploaded October 11, 2026.
Use its bytes unchanged at `public/assets/warehouse/granwarehouse.glb`.

| Field | Expected |
|---|---|
| SHA-256 | `fbc46ba3e414bb4380366c749fa0aa526e06328ae3bff702e956b43c37f0902c` |
| Byte length | `13,730,256` |
| glTF format | GLB v2 |
| Meshes / nodes | 1,412 / 1,457 |
| Materials / embedded images | 134 / 6 |
| Existing Map 3 URL | `/assets/warehouse/granwarehouse.glb?v=fbc46ba3` |

**Compared to the previously deployed GLB:** scene node names and all scene node transforms are identical. All six embedded textures are byte-identical. Changes are in GLB geometry buffers/topology around two horseshoe rails and the West transfer quarter, with minor normal data differences. The two tube mesh primitives have 2,710 vertices each versus 2,664 previously; their unique ring positions remain unchanged. The West quarter skin has a primitive with 510 instead of 502 vertices; its unique surface positions remain unchanged.

**Scope:** Map 3 Grand Warehouse only. Keep Map 1/Map 2 unchanged; no changes to `urban-warehouse.glb`. Existing Map 3 runtime wall graffiti, dark-rubber floor, artist-layout preservation, collision/rail reconstruction, and spawn safety remain enabled. Do not add removed legacy SkateLite/Cube obstacles.

**Release gate:** GitHub cannot receive binary bytes from this chat connector. The owner must upload the exact GLB supplied in ChatGPT, renamed `granwarehouse.glb`, overwriting `public/assets/warehouse/granwarehouse.glb` **on branch `fix/map3-skatewarehouse-exact-20261011`**. Until that upload, tests intentionally fail their SHA-256 gate and Map 3 still loads the previous GLB in production. Merge only after full Node physics/geometry tests, Vite production build, and Map 3 browser smoke check. Confirm latest Render commit and clear cache with the new asset URL revision.

The target version was not selected based on the filename alone: this manifest pins the exact SHA-256 to guarantee the same exported scene is served.
