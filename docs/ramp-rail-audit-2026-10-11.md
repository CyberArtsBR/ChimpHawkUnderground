# Urban Warehouse ramp and rail audit

The supplied 151-second recording shows Urban Warehouse, served by the
`warehouse-update` project. Repairs run on its imported scene before visual
batching and collision generation so rendered and physical positions agree.

## Changes

- Classify joined Blender ramp primitives by material: plywood rides, timber
  sides/backs block, trim is decoration, and stainless coping supplies grind
  paths and transition metadata. Joined coping previously disappeared into the
  wood-core name and could become a wheel surface.
- Extract disconnected tubes separately. Joined halfpipes now have two coping
  bars rather than a phantom diagonal between their decks.
- Deduplicate coincident bowl coping paths within export precision. There are
  50 usable paths after recovering the joined bars and removing duplicates.
- Move copied spines inside the room and ground elevated/submerged joined
  ramps. Restore the two halfpipes to separate lanes where they no longer
  intersect other ramp structures. Move the copied kicker clear of the manual
  ledge entries.
- Fill stale floor cutouts with a matching charcoal underlay, excluding the actual
  imported bowl rim. The bowl remains open below plaza level.
- Clamp normalized rail alignment dot products to [-1, 1]. Floating-point values
  slightly above 1 previously rejected an otherwise perfectly aligned grind.

The source GLB is preserved. Repairs are deterministic scene adjustments at load.

## Verification

- `node --test tests/*.test.mjs`: 515 tests passed after the follow-up repairs.
- Board, vert and pumping verifiers: 15 + 20 + 15 checks passed.
- Imported-map regressions check visible ramp facets, over 12,000 floor sample
  points, solid ramp sides, all six respawn spots in both directions, capsule
  clearance along every rail, and shipping-controller capture/entry on all 50
  paths.
- `node tools/audit-ramp-rails.mjs`: no missing sampled ramp support, displaced
  sampled riding positions, or obstructed grind samples. Full spatial evidence
  is in `artifacts/collision-audit/geometry.json`.
- Production Vite build and normal browser Practice/loadout flow pass. Browser
  captures are `artifacts/collision-audit/urban-top.png` and
  `artifacts/collision-audit/urban-overview.png`; telemetry is in `browser.json`.

Checks cover sampled geometry and deterministic entry scenarios, not every
possible player route or trick combination.

## Follow-up recording (105 seconds)

Restored the preferred charcoal floor by cloning and tinting only the plaza
material, retaining its texture maps and sharing it with the cutout patches.
The floor treatment no longer depends on the white marble asset finish.

Reproduced the camera close-up on the nine-stair centerline: thin handrails and
their posts reduced the chase arm to zero. Rail bodies and posts retain physical
collision but are excluded from camera boom obstruction. Steps, hubbas, walls
and ramp shells still obstruct the camera. Regression tests cover 408 views
across both stair sets/platforms, including their centerlines and side lanes,
and recheck each returned camera position against the remaining occluders.
