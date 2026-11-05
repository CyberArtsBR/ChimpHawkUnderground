# Map 4 — revised Blender export asset swap

Prepared binary: `urban-warehouse.glb`
Input upload: `urban-warehouseedit.glb` (2026-10-10)
SHA-256: `813cbf0c11ffcb9a2317843978b7d3d08973fb029d4ecdac047c018ed351a7b2`
Byte length: 14,444,332 bytes
GLB specification: glTF 2.0, single embedded buffer
Meshes: 1,946; nodes: 1,983; grind tubes: 34
Topology: seven authored warehouse sections including street, bowl, vert hall, flow, building and roof
West transfer quarter: `03_VERT_HALL / West transfer quarter / Skateable_Surface 001` has upward-facing riding normals.
Floor spans 150 × 110 metres, and its object name is recognized by the existing charcoal-rubber floor material override.

## Upload still required

The GitHub source connector cannot upload this 14.4 MB user-provided binary from this chat. This commit therefore deliberately updates the Map 4 URL cache key and expected SHA **ahead of binary upload**; CI will fail on this feature branch until the new file is actually uploaded.

Upload the prepared `urban-warehouse.glb` into this feature branch at exactly:
`public/assets/warehouse/urban-warehouse.glb` (replace existing file).

Do not upload to the Tron map, leave files in Maps 1–3 unchanged, and do not rename the URL or the directory.

After upload verify:
- `npm test` including `tests/warehouse-variants.test.mjs` and `tests/imported-warehouse.test.mjs`
- `npm run verify:physics`
- `npm run build`
- Real gameplay: six spawn locations, rails, bowl, staircases, both quarters, roof visibility and camera.
- Merge/deploy only if all tests pass and Map 4 looks as intended.

**Preserved:** rubber floor override, renderer environment and Map 4 selection identifier `urban-warehouse`.
