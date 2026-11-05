# StreetSkate — Maps 3 & 4 (TRON and Urban Warehouse)

This feature branch wires two **distinct** GLB worlds into the existing four-location selection flow without changing Skyline Rooftop or The Foundry.

## Asset upload required before merge

The two user-supplied GLBs were byte-identical (SHA-256 `0306579ac6473b57c550920c9c8a39749bcc07fe59697ba149a23d380115abe3`). A separate Urban Warehouse asset was authored by keeping all ramp, bowl, quarter, halfpipe, coping, rail, spawn and floor geometry intact and changing the used PBR materials to black rubber/anthracite/brushed metal/amber, with five embedded wall-art decals.

Download the prepared files from the ChatGPT conversation and upload them to **this branch** using GitHub's browser file uploader, inside `public/assets/warehouse/`:

- `tron-warehouse.glb` — 16,306,856 bytes; original TRON look; SHA-256 `0306579ac6473b57c550920c9c8a39749bcc07fe59697ba149a23d380115abe3`.
- `urban-warehouse.glb` — distinct black-rubber/steel/graffiti version; SHA-256 begins `4d77ce1d7641aceb`.

Do not merge before both binaries are present and `tests/warehouse-variants.test.mjs` passes. The test intentionally fails when either file is missing. No temporary fallbacks that misrepresent The Foundry as a new map.

## Playability and hole handling

`src/park/WarehouseVariants.js` imports the GLB **visuals** while reusing `createWarehousePark({ textures: false })` for gameplay collision, rails, contact surfaces, metadata, transition scale, all spots, spawn and playable boundaries.

The original Foundry supports depressed bowl pockets (to -3.7 m), roll-in, halfpipe, quarters, curved rail, volcano, etc., and has coverage tests in `tests/warehouse-geometry.test.mjs`. Visual seam underlays use exactly the existing rideable proxy surfaces 2.5 cm below the authored surfaces, **not a rectangular plane over the bowl**.

For render performance, the ~2,000 source GLB meshes are merged into materially equivalent draw batches, preserving UVs and material references. The `06_ROOF_CUTAWAY` group is kept separate for camera roof hiding.

## Acceptance checklist

1. In `Start Session` choose **TRON WAREHOUSE** or **URBAN WAREHOUSE**, then start with a rider and board.
2. Verify each variant renders its distinct materials and, for Urban, graffiti walls.
3. Skate entrance/street/bowl/vert/flow spawn spots; traverse recessed bowl roll-in, both halfpipe walls, quarter ramps and rails; check wheel contact and grind.
4. Check no holes or invisible walls during transitions and no severe framerate regressions.
5. Switch back to Rooftop or Foundry and check that no existing visuals or collision changed.
6. Run `npm test`, `npm run verify:physics`, and `npm run build` once assets are uploaded; deploy from main to Render only after passing.

## Upload blocker

This ChatGPT session can edit UTF-8 source files through the connected GitHub integration, but cannot stream local multi-megabyte binary files to that connection. Both GLBs were prepared, validated, and made downloadable in the conversation; only their GitHub binary upload remains manual.
