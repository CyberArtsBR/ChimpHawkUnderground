# Map 3: GRAND WAREHOUSE — 2026-10-11

Source provided by user: granwarehouse.glb (15,961,164 bytes, SHA-256 f0f47613e0aad90fd1ba7903ec218d46fea7bdc9433d437f3a1b26a72d41d886).
Chosen committed game asset: granwarehouse.glb (15,961,164 bytes, SHA-256 f0f47613e0aad90fd1ba7903ec218d46fea7bdc9433d437f3a1b26a72d41d886). The uploaded file is the original Blender export. Graffiti is provided at runtime as no-collision decals, without modifying this GLB.

- Independent Map 3 location with the unchanged SkyLine Rooftop Map 1 and unchanged Urban Warehouse Map 2.
- 150 x 110 m original footprint; 1,414 original meshes preserved, plus runtime visual-only graffiti decals (no collision).
- Graffiti art is generated from small CanvasTextures in the browser and added to the batched warehouse visuals at the four brick walls.
- Blender export joined rail tubes with wooden ledge/quarter shell geometry; Grand mode reads the material-specific GLTF child primitives, extracts actual tubes, leaves wood as solid/rideable as appropriate.
- ImportedWarehouseRepairs Grand mode keeps artist-authored transforms, original floor material, and original ramp arrangement. Existing Map 2 follows the exact old repair path.
- Confirm all original entrance and respawn markers, all metal rail paths, bowled/swept transitions and camera clearances before release.

**Binary upload gate**: GitHub connector cannot send binary files from the sandbox. The branch intentionally references an uncommitted `public/assets/warehouse/grand-warehouse.glb`. Do not merge the PR until it is uploaded as the EXACT file named `grand-warehouse.glb`, checksum verified, CI green, and the browser Map 3 smoke test succeeds.

Download from ChatGPT and upload to `public/assets/warehouse/grand-warehouse.glb` on branch `feat/map3-grand-warehouse-20261011`. Do NOT overwrite `urban-warehouse.glb`; do NOT rename or change its GLB.

## Updated Blender export — 2026-10-11

Replacement for the **same Map 3 only**: `granwarehousenew.glb` is prepared under the game asset filename `granwarehouse.glb`.
SHA-256: `a28205a7aea6cab744f6e374e6239cac1f604f8040ab5bb41a19f78b3da50a24` (13,728,112 bytes).
1,412 meshes and 1,457 nodes. The edited GLB removes `Cube__0`, `Cube__0.001`, and `Plane_SkateLite_base_color.002_0`; the previous special obstacle geometry no longer exists, so no invisible collision proxies may remain. Two Flow launch decorative side bands move slightly toward the ramp. Every shared mesh primitive and material identity is unchanged; all 17 named metal tube meshes, stairs, bowl, quarters, and the riding ground remain. Map 2 is untouched.

### Binary upload gate
The GitHub connector has no operation for uploading a local 13.7 MB binary. Upload the ChatGPT-provided replacement `granwarehouse.glb` to `public/assets/warehouse/granwarehouse.glb` on branch `fix/map3-grandwarehouse-new-export-20261011`, replacing only the Map 3 GLB. Keep this PR in draft and do not merge until the exact checksum, 586+ regressions, physics checks, and build pass. The URL query changes to `?v=a28205a7` to clear the browser cache.
