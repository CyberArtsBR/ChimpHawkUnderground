# Evolution cycle 3 — rig-specific palm reach

This local presentation pass calibrates Adolescent, Heretic, Anchor and TuxR. The Hollow retains its existing supplied motion. No physics, input envelope, trick timing, scoring, bone scale or collider changes are included.

## Diagnosis and calibration

The previous targets described wrist pivots about 5.5 cm inside the actual rails and above the center rail surface. They also omitted each model's palm length and thickness. The common torso gather bent toward the toe side even for heel grabs, moving the shoulder away from Japan's requested rail. Japan's lifted rear ankle additionally raised the shared minimum-flex hip guard.

`GrabReachPose.js` samples a palmar patch from vertices predominantly weighted to the hand, using the actual middle/index/pinky bases for its anatomical frame. The board target is now the closest point on the supplied deck triangles at the requested rail or end. Neither the deck mesh nor its contact metadata moves to manufacture contact. Triangle and authored sample caches can be warmed during loadout with `warmGrabDeckSurface(board)`.

The four calibrated rigs gather toward the actual toe/heel side. Heretic receives an additional 0.15 rad per pelvis/spine/shoulder component for its compact arms. Nose/Tail share more gather laterally toward the reaching shoulder. The maximum pelvis hinge is 0.60 rad, total spine curl 0.60 rad and total lateral spine bend 0.90 rad; spine rotations are divided across three joints. All parent adjustments precede leg IK. Japan's released knee may fold to 2.80 rad; the supporting knee retains its original limit and ankle target. A local 8 Hz critically damped channel eases only this body gather and resets with presentation state. Grip input and deck timing retain the original envelope.

The wrist goal accounts for the mesh-derived palm offset. Forearm pronation is bounded to 0.85 rad around its actual wrist axis and local wrist rotation to 0.95 rad. No finger wrap is authored in this pass.

The exact shipping-rig whitelist excludes `thehollowf.glb`. Its original wrist targets, torso gather and wrist orientation remain unchanged. A 36-sample fixture verifies pelvis, head, hands and feet positions/quaternions at reach, hold and release, for six grabs in both stances, against base `66fcd65` within 2e-7.

## Matching mesh measurements

These measurements use the centroid of an actual deformed palmar vertex patch against the same real deck surface point before and after, after 90 held frames at 120 Hz. They differ from cycle 2's wrist-pivot metric. Both original pose modules are loaded from `66fcd65` for the baseline; importing only the old rider would incorrectly use today's reach helper.

Distances are in centimetres. Japan cells show regular / switch.

| Rider | Mean before | Mean after | Japan before | Japan after |
| --- | ---: | ---: | ---: | ---: |
| Adolescent | 14.4 | 7.5 | 16.5 / 20.5 | 6.7 / 0.7 |
| Heretic | 27.0 | 14.6 | 30.4 / 34.3 | 12.1 / 7.9 |
| Anchor | 21.3 | 11.3 | 27.2 / 27.0 | 14.8 / 6.8 |
| TuxR | 16.7 | 6.9 | 15.5 / 14.0 | 2.2 / 0.5 |
| The Hollow, preserved | 22.1 | 22.1 | 25.2 / 24.3 | 25.2 / 24.3 |

Across the four calibrated riders and 48 held cases, mean palm gap falls from 19.87 to 10.06 cm (49.4%). Anchor regular Indy changes from 15.04 to 15.15 cm, a 1.1 mm regression; the other 47 improve. Heretic switch Tailgrab remains the largest calibrated gap at 21.4 cm. These are improved reaches, not complete grip/contact certification.

Planted ankle errors stay below 0.005 mm. The sampled pelvis/spine vertices projected inside the deck footprint remain above its conservative top plane; the smallest clearance is 8.4 cm (Anchor). This is a sampled clearance check, not a swept triangle-intersection certificate.

Smoothing reduces the measured peak head step across all six grabs/both stances from 10.7 to 6.0 cm for Heretic and 11.9 to 7.3 cm for Anchor at 120 Hz. The focused continuity regression covers Heretic Japan and Anchor Stalefish through engage and release. Remaining peak movement includes the existing 28/s grip/deck envelope and ankle guard behavior.

## Reproduction and validation

Evidence: `artifacts/evolution-cycle3/grab-palm-before.json`, `grab-palm-final.json`, and `grab-transition-final.json`.

```sh
node tools/measure-grab-palm-quality.mjs before --baseline=66fcd65
node tools/measure-grab-palm-quality.mjs final
node tools/measure-grab-transition-quality.mjs
node --test tests/grab-palm-contact-quality.test.mjs tests/grab-shoulder-reach-quality.test.mjs tests/grab-visual-contact-quality.test.mjs tests/pose-crouch-grab-20261009.test.mjs tests/rider-motion-runtime.test.mjs tests/rider-reset-context.test.mjs
```

The focused set passes 25 tests. Tests enforce actual mesh palm improvement, real arm lengths, scales, planted/released ankle targets, wrist bounds, continuity, all authored grab board metadata, all twelve flip trajectories after grab exit, finite runtime poses and reset behavior. Rendered held sheets and transition clips are reviewed separately in the integrated cycle report; these numeric results do not replace motion review.
