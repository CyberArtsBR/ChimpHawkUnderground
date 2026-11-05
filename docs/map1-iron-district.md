# Map 1 — Iron District

Map 1 now loads the user's edited `IronDistrictSource.glb` from `IRONMAP.rar`.
The internal `rooftop` ID remains stable for saved selections and existing map
routing; its displayed name is **IRON DISTRICT**. ORBIT and Grand Warehouse keep
their existing assets and loaders.

The submitted GLB is copied without modifying its bytes. Its SHA-256 is
`531860cd46cd610352c75146b2cd5a867e744a2ef73c36005daf4ea33e28e663`.
All 42 original package roster entries were verified. The edited GLB is an
additional user-authored export, so its digest is recorded separately in
`public/assets/iron-district/integration-receipt.json`. Project usage, editing
and redistribution are authorized in the supplied `LICENSES.md`.

The edited export contains old `COL_*` proxies whose positions no longer agree
with several visible obstacles. The loader excludes those proxies from both
rendering and physics. Collision instead uses the actual edited `RIDE_*`
geometry, matching structural `VIS_*` objects, and separate grind bars. Deleted
containers and the deleted light pole do not retain invisible colliders. Both
added megaramp access decks have matching collision. The recessed bowls remain
open, with no rectangular collider across their interiors.

Grind and coping paths are transformed from the original visual export's
coordinate frame to the matching edited object's frame. Existing package
planning envelopes are not movement boundaries: one continuous 200 × 150 m
playable rectangle allows travel between sectors. All five start areas are
checked for flat four-wheel support in both stances, body clearance and headroom.
The megaramp approach follows the ramp's edited location.

The 1,194 visible meshes are grouped into 21 material/attribute batches while
preserving positions, materials and UVs. Gameplay collision has 58,308 triangles.
The menu image is captured from the edited map in the game's renderer.

To regenerate the copied package and receipt after extracting the archive to
`../assets-source/iron-district`, run `node tools/prepare-iron-district.mjs`.
The original-transforms file intentionally comes from the original visual
export and is used only to move metadata paths into the edited coordinate frame.

Validation: `tests/iron-district-map1.test.mjs` loads the real edited GLB and
checks its digest, moved-obstacle support and absence of stale proxies, relocated
grind paths, added access decks, spawn support, open bowl pockets and route
metadata. Architecture, ORBIT and Grand Warehouse loader regression checks also
pass. Local browser verification covers initial load, selecting map 1, starting
free skate and an ollie, with no console errors or warnings.
The 13 focused integration/regression checks pass, and `npm run build` succeeds.
The production bundle includes the edited GLB, its metadata, original transforms
and the captured Iron District menu image. The local preview is available at
`http://127.0.0.1:5173/`.
