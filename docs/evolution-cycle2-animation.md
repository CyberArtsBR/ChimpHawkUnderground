# Evolution cycle 2 — local grab reach polish

This is a local presentation pass on the supplied Adolescent, Heretic, Anchor and TuxR rigs. No release, Portals synchronization, physical controller, collider, flip timing or scoring change is part of this work.

## Diagnosis

The remaining gap was predominantly a reach problem. At the prior held regular Indy pose, Adolescent's shoulder-to-deck target distance was 63.6 cm while the upper arm plus forearm measured 43.2 cm. Changing only the elbow pole could not bridge that distance. The fixed 3.5 cm wrist reserve also consumed roughly 8–10% of compact rigs' reach. Heretic's baseline wrist gaps were larger than Adolescent's: about 40 cm on regular Indy and 42 cm on regular Japan.

The stance matrix exposed a separate deck-plane problem. `grabTarget` switches the Nose/Tail target end and reaching hand in switch, but the board previously kept its regular pitch. The requested switch end therefore tilted away from the hand. Adolescent's baseline Nose/Tail wrist gaps were about 44.5/43.2 cm in switch versus 20.4/19.2 cm in regular.

## Bounded changes

`GrabReachPose.js` adds a grab-only pelvis hinge of at most 0.35 rad, a further spine curl of 0.15 rad total, and a 0.25 rad total bend toward the reaching shoulder. Spine adjustments are distributed across three joints. The pose only activates for named airborne reaches and runs before leg IK, which retains its measured-chain constraints and ankle targets. The hand reserve now follows the measured arm length, bounded to 1–2.5 cm. Rail targets, scales and palm geometry are not moved to manufacture contact.

Only Nosegrab/Tailgrab mirror their airborne board pitch in switch. The other authored deck tilts remain as supplied: a broader pitch reversal made the released-foot Japan pose worse and was rejected. The deck's contact metadata and physical support geometry are unchanged.

## Measured results

The 48-case matrix covers four shipping GLBs, six representative grabs and regular/switch, held for 90 frames at 120 Hz. Mean wrist-pivot distance fell from 32.7 cm to 17.3 cm (47%). Every measured case improves by at least 22%; the largest improvement is 85%. These are wrist-pivot diagnostics, **not palm/finger contact measurements**.

Final gaps below are in centimetres; each cell is regular / switch.

| Rider | Indy | Melon | Nosegrab | Tailgrab | Japan | Stalefish |
| --- | --- | --- | --- | --- | --- | --- |
| Adolescent | 10.0 / 9.4 | 12.9 / 13.7 | 6.7 / 6.7 | 6.8 / 6.8 | 18.7 / 22.9 | 8.0 / 11.2 |
| Heretic | 25.9 / 23.7 | 28.6 / 30.4 | 21.1 / 19.5 | 19.1 / 21.0 | 31.2 / 37.2 | 22.3 / 26.5 |
| Anchor | 17.2 / 15.1 | 21.7 / 23.9 | 10.3 / 11.7 | 12.2 / 10.7 | 26.9 / 28.4 | 17.8 / 18.4 |
| TuxR | 10.2 / 10.1 | 19.1 / 19.3 | 11.7 / 11.4 | 12.3 / 12.6 | 18.8 / 16.2 | 15.0 / 17.5 |

Baseline/final evidence: `artifacts/quality-pass/animation-visual/grab-contact-evolution2-before.json` and `grab-contact-evolution2-final.json`. Reproduce the final matrix with `node tools/measure-grab-contact-quality.mjs evolution2-final`. The sweep used to choose a bounded gather is in `artifacts/evolution-2026-11-03/grab-grid.json`; it is diagnostic evidence, not a shipping runtime.

## Validation and remaining limits

The focused animation set passes 34 tests, including the new `tests/grab-shoulder-reach-quality.test.mjs`. The new tests require at least 20% wrist-gap improvement in every representative rider/stance case, unchanged measured arm segments and bone scales, and planted ordinary grab feet within 1.5 cm. Japan keeps its authored released rear foot. All authored grab deck tilts retain collider metadata; Nose/Tail lift the requested end in both stances. Exiting every authored grab preserves all twelve flip trajectories in both stances. Existing root/contact preservation and crouch, IK, finite pose, runtime and reset regressions also pass.

A further deformed-vertex diagnostic samples vertices weighted primarily to the pelvis/spine and projected inside the deck footprint. All sampled torso vertices remain above the deck plane in the 48 held cases; the smallest clearance is 15.9 cm (Anchor/Melon). Evidence is `artifacts/evolution-2026-11-03/grab-trunk-clearance.json`, reproduced by `node artifacts/evolution-2026-11-03/grab-clearance.mjs`. This sampled plane check supplements the render review; it is not a full triangle-intersection or swept-volume certificate.

The pose remains deliberately short of a complete grip solution. Heretic's compact arms and Japan's released-foot posture still leave large visible reach limits. Exact palm placement and finger wrap require further rig-specific authoring; a wrist distance alone cannot certify hand-surface contact or mesh clearance. Rendered review is coordinated by the parent pass and will be appended once its all-rider sheets are inspected. No rendered or live gameplay approval is claimed by the numeric tests.

## Integrated rendered review

The lead inspected all four final grab sheets from `artifacts/evolution-cycle2/animation/after/`, each covering six named grabs, regular/switch and side/nose/tail views. No new visible torso/deck intersection was observed in those held views; the supported feet remain on their intended deck points. Sampled Nosegrab reach/hold/release sheets were also inspected. Four representative normal/0.45× clips were recorded: Adolescent switch Nosegrab, Heretic switch Japan, Anchor regular Nosegrab and TuxR regular Nosegrab. This is not an every-frame human motion certification.

Reproduce held before/after sheets with `node tools/capture-grab-polish.mjs`; set `GRAB_REVIEW_CLIPS=1` for current transition sheets and the four clips. The fixed 120 Hz fixture follows the existing grab envelope, without changing shipping timing. The real local browser also exercised an airborne grab in the final build. [Integrated status](evolution-cycle2-status.md).
