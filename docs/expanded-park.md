# Three connected skating areas

Source: user-supplied `halfnew.glb`, originally 4,929,780 bytes. Imported at its authored meter scale and world transforms. The repository copy is under `public/assets/park/halfnew.glb`; the Downloads source is never modified.

The model contains the original sector plus two new concrete slabs: X 34–102, Z -23–23 and X 33.89–101.89, Z 22.99–68.99. Runtime assembly keeps the existing original park's matching optimized visual/collision pair and admits the extension meshes from the supplied file, avoiding overlapping older copies of the original ramps. New mesh collision uses position-only proxies with world transforms baked; small details and decorative meshes are excluded.

The original east fence/curb is opened in visual and collision geometry. Both active physics finish paths use shared sector-union bounds, so no invisible wall remains at X 33.2 or Z 22.1. New flat rails and four halfpipe coping paths are registered for grinds and transitions. Explore overview, park dimensions and light coverage include all three areas.

Compilation only; no gameplay tests or benchmarks, per user instruction. No runtime assumption of asset ownership or licensing is made beyond the user's supplied file and requested integration.

## Initial-sector frame-rate report

The user reported roughly 10 FPS in the original sector and normal play in the extensions. Static inspection found unaccelerated wheel, clearance and camera raycasts against the original mesh triangles, an octree that duplicates long triangles into multiple children, and repeated full camera-clearance searches near obstacles. These are plausible CPU bottlenecks; no runtime timings were collected.

Static collision meshes now use `three-mesh-bvh` in indirect mode, preserving triangle indices. Body and sphere broad-phase queries use a BVH candidate index and retain the existing Three.js capsule/sphere intersection mathematics. Camera rays use closest-hit traversal, reuse hit arrays, and revalidate a cached alternative arm before searching again. A comfortably clear view ends the search early. Visual assets and three-area access remain the same. Compilation confirms bundling only; no FPS improvement is claimed as measured.

The user's camera correction replaces travel-oriented chase with a fixed world-axis view that translates with a single smoothed player position. Distance and framing no longer change for air or vert, and clearance searches never orbit sideways. Vertical clearance is an obstacle exception. The purple material is changed to black in the repository GLB, and two invalid negative UV-channel references are repaired. Geometry and the binary mesh/texture chunk remain unchanged.
