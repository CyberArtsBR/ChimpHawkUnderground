# Local map testing

Options → **UPLOAD TEST MAP · GLB** opens a local file picker and starts unlimited
practice with a random built-in rider and skateboard finish. The file stays in
the browser, is not uploaded to a server, and is not added to the map catalog.
The title screen is unchanged. Reloading restores the regular game.

The importer accepts static, self-contained GLB 2.0 files up to 80 MiB and 350,000
triangles. It rejects external resources, rigs, animations, invalid hierarchies,
invalid geometry and malformed gameplay metadata. Leaving Options cancels a
pending swap. A rejected upload preserves the current world.

Generic GLBs receive mesh collision, inferred rectangular boundaries and a
probed flat spawn. Accurate grind paths and special collision require authored
metadata. Maps without a clear four-wheel entrance are rejected.

## Prepared GLB format

One node contains `extras.streetSkateMap` as an object or JSON string:

```json
{
  "version": 1,
  "name": "My test park",
  "spawn": [0, 0.04, 0],
  "spawnHeading": 0,
  "rails": [{ "name": "Street rail", "radius": 0.055,
    "points": [[-2, 1, -2], [2, 1, -2]] }],
  "playableRegions": [{ "minX": -10, "maxX": 10, "minZ": -10, "maxZ": 10 }]
}
```

Coordinates are world-space metres in glTF's Y-up system. Rail points describe
tube centrelines. Include `coping` in bowl-lip names for transition capture.

`extras.streetSkateRole` may be `visual`, `collision`, `sky` or `decoration` and
inherits through parent nodes. Prepared maps require explicit collision meshes;
visual geometry does not become additional collision. Collision nodes accept
`surface: "solid"` or `"rideable"`, `transitionSkin: true`, `railId`, and
`cameraTransparent: true`. Sky nodes are excluded from collision and bounds.
Export collision meshes normally: the loader hides them at runtime.

An optional `presentation` object in `streetSkateMap` carries the authored look.
Allowed numeric settings are `exposure` (0.25–2), `ambientIntensity` (0–3),
`keyIntensity` (0–8), `environmentIntensity` (0–2), `fillIntensity` (0–3), and
`fogDensity` (0–0.01). `ambientSky`, `ambientGround`, `keyColor`, `fillColor`,
`fogColor` and `background` require full `#RRGGBB` colors. `center`, `keyPosition`
and `fillPosition` are world-space xyz arrays with finite coordinates below
10,000 metres in magnitude. Unknown settings are rejected. Existing maps keep
the original lighting defaults when this object is absent.

`presentation.environmentFromSky: true` uses the embedded sky dome's texture for
environment reflections as well. The loader creates an independent equirectangular
texture so metal reflections match the sky without changing the dome's UVs. The
reflection image is capped at 2048 pixels wide while the visible sky keeps its
full resolution. If canvas conversion is unavailable, a large reflection image
falls back to the game's standard environment instead of allocating an oversized
reflection map.

Embedded `KHR_lights_punctual` point/spot lights supply local illumination. At
most 12 are active, intensity is capped at 5,000, range at 80 metres, and imported
lights never create dynamic shadow maps. Authored vertex colors or textures can
carry baked indirect light. Emissive materials named `LED / …` or `Grind / …`
participate in the game's existing neon glow pass. Decorative surroundings count
toward geometry totals but do not affect gameplay bounds or collision.

## Skate Paradise test edition

The supplied park remains a separate artifact, outside shipped game assets and
the regular registry. Its entire geometry, collision, spawn, rails, boundaries
and sky dome are scaled to **150%** of the original size. It contains corrected
riding-surface winding, recalculated normals, continuous collision over the east
stairs and south straight/fan stair, 44 grind paths, perimeter blockers, a west
fence, embedded PBR surface maps and a seamless 4096 × 2048 sky.

The original GLB is preserved. The editable blend, build script, final GLB,
preview and validation reports are in `G:/Streetskate/artifacts/skate-paradise/`.

Validation: 32 targeted tests, production build, desktop file-picker upload and
invalid-file recovery. The final GLB passes 297 stair samples, 15,289 sloped
surface probes, 482 rail-segment contact/alignment samples and four boundary
sweeps. These are geometry/runtime checks, not an exhaustive playthrough of
every trick or approach. No phone testing was performed.

```sh
node tools/verify-test-map.mjs /path/to/skate_paradise_test.glb /path/to/report.json
```

## After Hours visual edition

The separate `G:/Streetskate/artifacts/skate-paradise-cinematic/` delivery adds
scanned 4K concrete/asphalt PBR maps, a photographic 8K sunset, baked vertex AO,
cyan/amber bowl ribbons, warm local lights, a landscaped promenade, palms and
illuminated signage. Its sky is exported as an unlit material and normalized to
an unlit texture in the importer, keeping PBR lighting and neon quality settings
from altering the panorama. All 25,996 source collision triangles, spawn, 44
rails, boundaries and 150% scale are preserved. The file remains outside the
game's regular catalog.

This edition passes 46 targeted tests and the production build. Its geometry
checks retain the same sample counts listed above. The headless geometry
verifier strips images and disables sky reflections in its temporary copy;
browser verification loads the original textures and environment.

## Recording-driven repairs

The separate `G:/Streetskate/artifacts/skate-paradise-fixes/` edition addresses
the supplied desktop recording:

- Extend the east small quarter's right boundary by 0.507 m to close a narrow
  channel beside the neighboring structure. Visual geometry, collision and the
  affected coping endpoint move together; the arched route stays open.
- Replace the raised funbox's 26 intersecting faces with a closed 12-face hull.
- Close the thirty-stair collision entrance's 75 mm gap and bridge its landing.
- Use a double-sided depth-writing bloom blocker so reverse-wound imported
  skins occlude neon instead of leaking glow through their backs.

`tools/verify-map-repairs.mjs` compares the old and repaired assets. The old
quarter seam fails all 26 support probes; the repaired seam passes all 26. The
funbox's non-manifold edge count falls from four to zero. Four-wheel support
passes 101 entrance probes; 44 rails, spawn and the 150% scale are retained.
The full map geometry and neon-occlusion regression checks also pass.
