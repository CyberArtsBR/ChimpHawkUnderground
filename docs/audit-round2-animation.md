# Animation audit, 29 October 2026

Baseline: standalone `fcdd864`; changes are on the local audit branch.

## Confirmed issue and implemented correction

**P2: 360 Flip and Laser Flip used the same generic front-foot flick.** In `UnrealRider.update`, the flick was selected by looking for Heel, Kick, Hard or Varial in the displayed trick name. Neither upgraded name matches. Both therefore received a small positive lateral offset, even though the catalog specifies opposite board-roll directions. Laser Flip visibly needs its heelflip-family action; 360 Flip needs its kickflip-family action.

The renderer now derives that family from the finite authored `roll` value through `flipFlickOffset`. Existing anatomical stance mirroring, motion timing, rear-foot clearance, board rotations and catch anchors are preserved. Zero-roll shove/impossible motions retain their original generic lateral offset. This also avoids coupling motion to future label translations or renaming.

Reproduction: in Free Practice compare the front-foot flick on an upgraded Varial Kickflip (360 Flip) and upgraded Varial Heelflip (Laser Flip), ideally at slow playback or through a development pose capture at 34% progress. Before this patch both choose `0.06`; after it the kick family chooses `0.22` and the heel family `-0.19`, before anatomical mirroring and the shared time envelope.

## Validation

- 27 focused tests passed across `flip-family-footwork`, `inward-heelflip-catch`, and `rider-animation-footage`.
- New actual-GLB regression exercises both upgraded tricks through 101 phases in regular and switch stance. It verifies distinct opposite flick targets and the same final left/right catch positions within 1.5 cm.
- Existing footage-oriented regressions exercised five rider GLBs: idle/coast/brake/crouch, planted feet, knee bending, switch/shove catches, constrained arms, and finite rotations.
- Six additional tests in `src/character/AnimationDynamics.test.mjs` passed. The audit found these were outside the original `npm test` glob; the integrating agent is addressing discovery.
- Browser capture script: `artifacts/audit-round2-animation-capture.mjs`. After restarting the local server outside the isolated sandbox, it captured six actual rendered frames at 34%, 60% and 97% progress in `artifacts/audit-round2-animation/`. The filenames use each upgrade's base catalog key: Varial-Kickflip means 360 Flip and Varial-Heelflip means Laser Flip. Inspected the two flicks, Laser mid-spin and the common catch: foot paths are visibly distinct, the deck returns upright, and the feet return over the board. These are staged poses in the live renderer, not a certification of continuous in-game input or all camera angles.

## Reviewed systems and remaining work

| Area | Evidence and disposition |
| --- | --- |
| Inward and varial families | Existing corrected board yaw directions and upright catches pass focused tests. No additional board-rotation change needed. |
| Charge, takeoff and landing | `HalfPipePose` separates charge, extension, tuck and descent anticipation. `StreetSkater` derives impact severity and a recovery envelope. Existing pose tests pass; real-player timing/weight assessment remains necessary. |
| Foot contacts | Board-normal orientation and yaw-compensated anchor placement preserve stance through completed shove rotations. Focused actual-rig tests pass; this is not proof of every shoe/board combination on every slope. |
| Grabs and bail | Existing constrained hand reach, exclusion and fixed-length ragdoll machinery were inspected. No newly reproduced defect justified a speculative change. Hand-to-deck reach quality across all named grabs needs front/side/rear visual review. |
| Impossible | Still uses a deck pitch rotation and generic released rear-foot offsets. A convincing wrapped-foot relationship remains an authoring opportunity, not a confirmed numerical/contact defect repaired by this patch. Requires a reference-led motion pass and visual approval. |
| Staged lessons | The eight base lesson motions are unchanged by the roll-family correction. No 360/Laser video is part of the current base lesson set, so no existing instructional video needs regeneration for this fix. |
| Proportions and propulsion | Rider proportions, approved arms, automatic forward movement and disabled automatic push animation were preserved. |

## Next acceptance pass

Capture front, side and rear views for all five riders at pop, flick, 50% spin, catch and impact; include both stances and sloped contacts. Prioritize Impossible foot wrap, named grabs, and the large-drop landing envelope. Use those captures to choose authoring changes instead of changing gravity, limb proportions or default controls to disguise motion problems. Physical skate feel and professional animator acceptance are not established by unit tests alone.
