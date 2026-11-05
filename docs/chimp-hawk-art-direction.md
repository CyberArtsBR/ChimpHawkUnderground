# Chimp Hawk — compact art direction

This is a production guide for the existing three parks, not a request to change collision. References: `src/graphics/MapLook.js`, `src/graphics/SurfaceFinish.js`, `src/graphics/OrbitVisualPass.js`, `src/graphics/WarehouseVisualPass.js`, `src/park/WarehouseMaterials.js`, and the current-release audit. Values below are targets for new work; authored materials may deliberately differ.

## Shared visual priorities

1. Read the next edge, landing and rider before adding decoration. Check at gameplay distance and in motion, with the selected glowing board on and off.
2. Retain the supplied chimp cast, graffiti headings, individual park silhouettes and the original music. Graffiti is display type; use the existing Barlow Condensed and DM Sans families for instructions and UI. Avoid new fonts for body copy.
3. Respect the world scale: the shipping board is about 1.05 m long and the rider is approximately human-sized. Doorways, signs and benches should look plausible beside them, rather than using screen-space scale as a substitute for measurement.
4. A prop is useful when it makes a start, landmark or exit recognizable. Keep it outside landing and runout paths; add no collision geometry for a decorative element without a separately tested gameplay reason. Preserve artist transforms and collision/visual alignment.
5. Use the existing 1024 shadow atlas and selective glow. Do not add a live reflection pass for the bail liquid or a second large light solely for a photograph. The rider and board must remain legible without glowing costume fabric or blown-out coping.

## Locations

| Park | Palette and atmosphere | Surface / landmark guidance |
|---|---|---|
| Grand Warehouse | Warm wood, ochre lamp light, cool neutral fill and charcoal structure. Existing key `#ffdcad`, sky fill `#c7d8ed`; do not turn the wood orange. | Plywood grain follows panel scale; dark steel and concrete anchor the floor. Put one readable workshop or district sign at an approach, not on a landing. Use practical roof fixtures and structural beams sparingly. |
| ORBIT | Blue/violet night, silver ceramic riding skin and restrained cyan/magenta neon. Existing key `#d8e8ff`, fill `#a6b8ff`; keep a distinct rider silhouette against dark geometry. | Limit the brightest emissive accents to rails, lines and key signs. Inspect seams from the actual riding route before touching the artist mesh. Keep background points quieter than coping. |
| Skate Paradise | Sunset warmth against cool concrete, weathered asphalt and clear metal rails. Existing key `#ffd0a0`, fill `#a5bce9`. | Match concrete/asphalt texture scale across adjacent surfaces and use restrained edge wear. Landmarks belong beside lines, not where they block low obstacles or exits. |

## Material starting points

| Material | Roughness | Metalness | Notes |
|---|---:|---:|---|
| Concrete / worn asphalt | .78–.95 | 0 | Avoid mirrored ground; apparent variation should come from the existing maps and light. |
| Skate plywood | .64–.88 | 0–.12 | Grain should be legible at both transition and rider scale; no glossy plastic. |
| Ceramic / ORBIT panels | .61–.72 | .16–.42 | Keep enough contrast with dark rider and visible joins. |
| Rail / coping steel | .26–.45 | .72–.86 | Preserve the specular edge that helps identify a grindable surface. |
| Fabric / skin | .58–.9 | 0–.22 | Reflective cloth or skin is not an emissive light source. |

Intensity is scene-referred and depends on exposure: warehouse practical lamp materials currently use an emissive intensity around 2.0, with lower values for signs and glass. Treat this as an example, not an instruction to make all lamps equally bright. Validate with real glow enabled in the 144-target profile, preserving a saved explicit off choice. Avoid clipping large white areas.

## Review before accepting any art change

- Compare before/after screenshots at 1280×720 and 1920×1080 in the same camera and quality settings, then inspect the change during a line and landing.
- Check all four wheel contacts and board/feet on ramps and rails. Cosmetic marks cannot float over coping or conceal a collision boundary.
- Keep visible and collision geometry consistent. Any material/texture optimization must preserve UVs, colors and normal-map response and record the reproducible source and command.
- Record draw calls, frame intervals, memory and available GPU timing before/after. 144 Hz is a 6.94 ms frame budget, not a guaranteed frame rate or a reason to secretly turn glow off.
- Preserve a readable high-contrast UI and reduced-motion behavior. At large text settings let panels scroll rather than shrinking crucial labels.
