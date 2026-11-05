# StreetSkate — Agent 04: AAA collision and spawn safety

## Isolation and change ownership
- Source baseline: `17259ec6f5dc8eb1aee0ba449b3db84e90a814f9`.
- Branch: `aaa/04-collision-spawns`.
- No edits to `main`, deployment, map GLBs, visible prop transforms, rider dimensions, board dimensions, transition control, rail scoring, or another agent's owned code.

## Inspected pipelines
- Skyline Rooftop: `src/park/SolarDockPark.js` procedural park, `src/game/ParkCollision.js` BVH and four-wheel ground probes.
- ORBIT: `src/park/OrbitPark.js` collision copied from visible meshes; `COL_` mesh names used only as semantic hints.
- Grand Warehouse: `src/park/WarehouseVariants.js`, `src/park/ImportedWarehouseCollision.js`, `src/park/ImportedWarehouseRepairs.js`, `src/park/GrandWarehouseSpawns.js`. Collision proxies are derived from imported GLB surfaces without changing imported visible mesh positions.
- Shared: `SkateboardContactRig` and `ParkCoverageAudit`.

## Confirmed source-code defects and corrections

1. **Malformed facets could enter the collider spatial index.** `ParkCollision` formerly inserted zero-area/NaN/Infinity triangles as physical blockers and attempted BVH acceleration on invalid mesh buffers. Triangle validation now excludes such faces from body-capsule blockers and disables accelerated raycast when non-finite data is found. It does not rewrite GLB vertices.
2. **Landing on a single truck.** `SkateboardContactRig.solveLanding()` formerly accepted even one new wheel contact. Air-to-ground catches now require at least two contacted wheels and support on both trucks; ground-riding one-wheel lip exit remains unchanged.
3. **Inverted geometry hidden from coverage sampling.** `ParkCoverageAudit` required positive world-Y face winding while production support tolerates reversed GLB triangles. Read-only visual samples now accept either winding while still verifying the actual collision height.
4. **Grand Warehouse spawns could straddle uneven stair heights and obstructed headroom.** Placement now requires all four normals to be sufficiently upward, maximum 6.5 cm wheel height variance, checked reverse stance, an unblocked body capsule and 1.8 m of overhead clearance. New placements are transactional, and preparing the same manifest twice does not move already approved markers.

## Deterministic regression and geometry evidence
- `tests/agent04-collision-spawns-regression.test.mjs` covers non-finite/degenerate geometry, **49 synthetic reversed-winding XZ ray samples** with exact collision-height agreement, rejected one-truck air catches, valid four-wheel catches, flat vs stair-straddling wheel support, repeated Grand preparation, visual transform invariance, and failure atomicity.
- `tests/agent04-shipping-map-geometry.test.mjs` loads real shipping assets through the repository's own headless GLB importer and records both-stance entrance supports, offset samples, and Grand recessed bowl triangle comparisons.
- Existing `tests/agent04-contact-collision.test.mjs` covers 12 other flat/bank/bowl/seam/ledge/capsule cases; `tests/grand-warehouse-spawns.test.mjs` covers supported marker separation.
- Maps should additionally undergo **live binary GLB sampling** by selected region with short normal-ray comparisons at triangle centroids, four wheel probes at spawn and bowl-depth checks. Synthetic samples do not prove coverage of every exported ramp.

## Measured real-asset evidence (GitHub Actions, 2026-10-11)
[Shipping geometry CI log](https://github.com/CyberArtsBR/StreetSkate/actions/runs/38151346218) at commit `94606550113b4f29ce4ac5797c63a3bf30478006`:
- **Skyline Rooftop:** 25/25 short-range support rays around the actual start `(0, 0.15, 41)`, four wheels supported facing both directions, clear body capsule.
- **ORBIT:** 25/25 probes around `(10, 0.15, 36)`, four wheels and clear capsule in both stances.
- **Grand Warehouse:** 25/25 probes around the selected entrance `(0, 0.015, 43)`, four wheels and clear capsule in both stances.
- **Grand recessed bowl:** 30,496 qualifying deep authored facets were inventoried; 64 deterministic separated triangle interiors were ray-tested **from above**. All 64 reached expected depressed contact height with no intervening flat cap; **0** missing/covered facets at those sampled coordinates.
- Total: **75/75 physical entrance-neighborhood ray probes, 6/6 stance support checks, 64/64 recessed bowl checks**, plus 49/49 synthetic winding coverage rays.

The ten new Agent04 regression cases (**7 synthetic + 3 shipping maps**) all passed in that CI log. The full repository validation reports **577/587 passed, 10 failed**. These remaining failures correspond to pre-existing stale Map 2/Map 4 expectations and missing-file/import failures (e.g. the retired `urban-warehouse.glb`, `tests/orbit-map2.test.mjs` using `../../tools/`). Those unrelated tests have deliberately not been edited.

**Limitations:** sampling does not demonstrate that *every* ramp triangle, guardrail, stair face and all future gameplay paths are correct. The uploaded RAR is an older checkout that lacks the pinned ORBIT/Grand GLBs, so executable real-asset sampling was delegated to the repository's pinned CI runner. No exhaustive in-browser physics replay or FPS measurements have been claimed.

## Remaining owner handoffs
- Agent 02 (vert): if quarter-pipe last-wheel release or bowl re-entry requires an intentionally partial **airborne** landing, provide a clearly authored transition-specific policy instead of relaxing general collision landing guarantees.
- Agent 03 (grinds): an invalid path created by GLB tube-ring ordering/authoring is a rail-capture concern; verify line continuity and metadata with actual GLB samples.
- Scene/art owner: inspect the synthetic floor patch in `ImportedWarehouseRepairs` against the full imported bowl rim and preserve all depressions; do not add an invisible flat cap.
- Integration QA: test Skyline, ORBIT and Grand with their exact shipping GLBs for fast wall impacts, ramp and stair seams, bowl depths, repeatedly loaded maps and all named spawn markers. Document XYZ coordinates for remaining failures.
