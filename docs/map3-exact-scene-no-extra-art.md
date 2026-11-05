# Map 3 near-volcano duplicate stair correction

## Screenshot audit (October 11, 2026)
The screenshot shows a complete six-step concrete stair, bank, metal rail and wood access slope immediately ahead of the Flow Volcano. Earlier PR #38 mistakenly hid the `Nine stair` assembly at approximately X=10, Z=31, which is the correctly placed stair in the Blender reference.

The **actual misplaced stair** is Blender node:
`01_STREET_DISTRICT / Six stair kinked down rail / Hubba_Solid_-1 001`,
whose seven material primitives combine concrete step treads (quarter-metre increments), the steel/wood rail, and wooden bank, centered at approximately X=42.3, Z=-7.5.

Two similarly named copies (`.001`, `.002`) at X~-21 and X~-17 are intentionally untouched. The correct Nine stair assembly and its grinds are restored.

## Map 3-only fix
- Exclude only the rogue near-volcano Six stair node at X 30–55, Z -18–5, before building both batched visuals and collision/grind paths.
- Restore the 35 proper Nine stair meshes to artwork, rideable/support collision, and rail capture at their original GLB coordinates.
- Preserve every remaining Blender mesh transform and the exact byte-identical `Skatewarehouse.glb`.
- Preserve removal of all runtime-added graffiti decals, as requested.
- Preserve Maps 1–2 completely, including the Urban Warehouse GLB.
- Add regression checks for the single misplaced group, correct Nine stair rails, and complete Map 3 loader lifecycle.
