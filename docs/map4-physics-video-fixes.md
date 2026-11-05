# StreetSkate Map 4 — 2026-10-10 video physics hotfix

Baseline main: 67a14066ac799ecca314da15e3f63bdfe6f87713
Evidence: user gameplay video `Desktop 2026.10.10 - 17.38.56.02.mp4` (62.75 seconds).

## Video issues
- 00:17–00:30: suspect handrail/clipping and failed grind proximity
- 00:31–00:39: broken bank/stair/side-surface contact
- 00:42–00:47: extremely high vert departure without controlled return
- 00:54–01:02: second roofward quarter launch and near-black, obstructed chase camera

## Corrections
1. Clamp excess ramp-origin Y speed, including the previously unbounded *generic* launch path that adds vertical velocity to remembered boost. Never change flat Ollies.
2. Keep same-wall vert-return correction active for a wider but bounded drift corridor. Preserve gravity and player-authored yaw, no teleports.
3. Permit steep-facet support only when the previously known rideable normal was itself steep, not for walls reached from level ground. If wheel support releases before coping detection, preserve a genuine nearby authored transition through a validated upward-approach fallback instead of switching to uncontrolled generic air.
4. Separate structural solid ramp sides and back panels from actual rideable ramp skins. Honor additional stair riser/landing labels.
5. Evaluate each nearby grind rail before choosing a valid one (port prior PR #27). Do not permit a wrong-height or perpendicular coping to hide a valid path.
6. Recover chase camera when a collision ray starts just inside a thin solid face (port prior PR #27).

## QA
- Real GLB is retained unchanged; metadata, transforms and 34 authored grind tubes must remain intact.
- Deterministic launch, return, steep support, rail-neighborhood, camera and GLB collision tests.
- Reproduce the two filmed return failures manually on deployed Map 4 before claiming every issue closed.
- Maps 1–3, graphics and input bindings remain unchanged.
