# ASTRA animation implementation — 4 November 2026

Scope: AN-01 and AN-02, local candidate only. No commit, release, source GLB or gameplay-physics change.

## Implemented

- Four calibrated stock riders (Adolescent, Heretic, Anchor, TuxR) now have an Airwalk front-hand target on the actual forward deck surface in regular and switch. The released legs use a compact knee gather and smaller vertical separation so the shoulder can approach the deck without stretching an arm. The rear hand retains its balancing pose.
- Authored finger flexion uses each supplied rig's actual phalange direction and calibrated palm normal. Index/middle/ring/pinky articulate through bounded rotations; unrecognized or incomplete chains remain untouched. There is no bone scaling, position rewrite or source mesh edit.
- Calibrated hand targets and finger flexion follow the existing damped grab-gather envelope through release instead of dropping instantly when the input label disappears. Flip, bail, grounded and flatland boundaries retain their reset ownership.
- The Hollow's default whitelist exclusion and supplied motion remain unchanged. `rider.setGrabContactCandidate(true)` explicitly enables a local review alternative for Hollow only; `false` returns to the accepted default. It is not persisted or enabled by a menu. The review harness exposes the same opt-in as `window.reviewGrabContactCandidate(true)` and includes a separate labelled candidate sheet.

## Files

- [UnrealRider.js](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/character/UnrealRider.js)
- [GrabReachPose.js](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/src/character/GrabReachPose.js)
- [actual-rig acceptance test](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tests/astra-grab-contact.test.mjs)
- [review harness](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tools/animation-review-scene.js)
- [capture tool](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tools/capture-astra-animation.mjs)

## Verification

Focused command: `node --test tests/astra-grab-contact.test.mjs tests/grab-palm-contact-quality.test.mjs tests/grab-shoulder-reach-quality.test.mjs tests/grab-visual-contact-quality.test.mjs` — **21 passed**, including exact preserved Hollow reach/hold/release fixture, actual-rig dimensions, existing planted-foot assertions, grab-to-flip preservation and bounded fingers/release. The new test was then strengthened with an actual deformed palm-patch envelope and rerun: **5 passed**. Two existing rider-reset tests also passed in the first focused run.

Fresh held Airwalk actual palmar-centroid distances to the authored deck point (metres, regular / switch):

| Rider | Regular | Switch |
| --- | ---: | ---: |
| Adolescent | .0067 | .0875 |
| Heretic | .1238 | .1708 |
| Anchor | .0326 | .0980 |
| TuxR | .0913 | .1630 |

These are actual mesh-patch centroid gaps, not a claim of zero skin/deck separation. The four-rig acceptance envelope is .18m. The visual board-holding intent is substantially clearer than the previous Airwalk with no hand target; compact-rig contact still needs owner review. Exact finger-to-deck collision is not simulated.

The existing six-grab palmar benchmark was rerun before and after. Four-rig mean changes were approximately Adolescent .07452→.07504m, Heretic .14588→.14663m, Anchor .11306→.11417m and TuxR .06904→.07034m. Finger skin deformation shifts the sampled palm patch slightly; **do not claim those older grabs gained positional contact accuracy**. Their main improvements here are finger shaping and release continuity. Hollow stayed .220917m exactly. AN-01's broader aspiration of consistently closed palm gaps therefore remains partial; further per-rig reach/pose authoring is a remaining quality task, not hidden by scaled limbs or relocated physics.

Hollow GLB SHA256 remains `c8e5f3c41a656580e2ce8b6761f46314add8390ed68fbfe22d0e7e82e6f278fc`.

## Visual evidence

[Capture report](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-implementation/animation/report.json): **PASS**, no browser errors, 11 sheets and 2 WebM clips. Five stock riders have held and six-phase Airwalk sheets, regular/switch and three angles. Hollow candidate is captured separately. Heretic Airwalk and Adolescent Japan clips include normal and 0.45× presentation.

Reviewed stills: Heretic held, Anchor held, TuxR held, Adolescent Airwalk transition and Hollow candidate. The sampled Airwalk transition gathers from the open pose, presents the front hand toward the board, and returns to neutral; no obvious limb stretch appears in these samples. This is isolated presentation lighting, not a park-physics/full-motion or human approval certificate. The clips are available for owner review; their existence alone is not a listening or real-time motion approval.

- [Heretic held](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-implementation/animation/The_Heretic-held.png)
- [Adolescent transition](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-implementation/animation/The_AdolescentUR-airwalk-transition.png)
- [Hollow unchanged default](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-implementation/animation/thehollowf-held.png)
- [Hollow opt-in candidate](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-implementation/animation/thehollowf-OPT-IN-candidate.png)
- [Heretic Airwalk normal/slow](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-implementation/animation/The_Heretic-Airwalk-switch.webm)
- [Adolescent Japan normal/slow](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-implementation/animation/The_AdolescentUR-Japan-switch.webm)

Lead integration can use the source immediately; there are no required game-main hooks or runtime dependencies. GPU browser is closed. No additional asset generation or new package was needed.

## Bounded residual-reach investigation

A final CPU-only actual-mesh comparison separated wrist-orientation error from anatomical reach. [Diagnostic](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/artifacts/astra-implementation/animation/reach-diagnostic-before-refine.json), reproduced by [measure-astra-grab-reach.mjs](C:/Users/meltb/.codex/worktrees/coping-quality-pass/Streetskate/tools/measure-astra-grab-reach.mjs), measures shoulder-to-required-wrist distance minus the actual upper/lower-arm chain length with both the ideal and achieved palm orientation.

The largest remaining Heretic switch Tailgrab gap is .21275m, with a .31945m arm and **.20960m reach excess even at the achieved palm orientation**. Its orientation-offset disagreement is only .01915m. Heretic regular Nosegrab has .20582m palm gap versus .20297m reach excess. Heretic switch Airwalk has .17085m palm gap versus .16355m reach excess and essentially zero orientation-offset disagreement. Thus these large residuals cannot be closed by a safer palm-offset correction alone; the required target is beyond the unchanged arm's reach in the current torso pose.

Closing them would require a further reviewed per-rig torso/leg composition or board-presentation redesign. No extra runtime tuning was made after this diagnostic: the currently tested local candidate, unchanged limb lengths, planted-foot guards and Hollow baseline were retained. AN-01 residual closure is explicitly outstanding, not presented as fully fixed. This limitation does not undo the implemented finger shaping, release continuity or Airwalk board ownership.
