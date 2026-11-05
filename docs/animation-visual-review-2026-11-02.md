# Rendered animation review — 2026-11-02

Local implementation and review; no publishing. The capture stage loads the shipping `UnrealRider`, `StreetBoard`, supplied GLBs/materials, and shared Flip School timeline. It isolates body/deck readability with side, nose and tail cameras. It does not reproduce each park's lighting, collision route or physical controller input.

## Rendered coverage

- Examined contact sheets for all 12 lessons: Kickflip, Heelflip, Impossible, Pop Shove-It, Hardflip, Inward Heelflip, Varial Kickflip, Varial Heelflip, 360 Flip, Laser Flip, Double Kickflip and Double Heelflip. Each includes regular/switch and three views, with six timeline samples from flick through catch. Percent labels in advanced sheets refer to nominal lesson sampling, not a separate retimed upgraded trick.
- Examined representative Indy, Melon, Nosegrab, Tailgrab, Japan and Stalefish; 50-50, Noseslide, Crook and Smith; manual/nose manual; and bail/contact/settling sheets in regular/switch. Low/high presentation arcs were captured for Kickflip and Laser. These arcs are presentation fixtures, not new physics settings.
- Recorded normal then 0.45× reference clips for Kickflip (regular), Impossible (switch), 360 Flip (regular), and Laser (switch). Clips are review artifacts, not replacements for the supplied tutorial media.
- Examined final grab sheets for Adolescent, Heretic and TuxR. The four-avatar numeric matrix also includes Anchor, which was not given a separate rendered sheet in this bounded pass.

Evidence: `artifacts/quality-pass/animation-visual/before/` and `after/`; each has a manifest. Reproduce with `node tools/capture-animation-review.mjs before`; set `ANIMATION_CLIPS=1` for clips, or `ANIMATION_EXTRAS_ONLY=1` and `ANIMATION_COMPARE_RIDERS=1` for the focused grab/character pass.

## Findings and changes

**Grab contact was visibly weak.** Hands often stopped beside the knee instead of meeting the intended deck edge. Numeric diagnosis supported the rendered finding: Adolescent's Indy wrist pivot was about 0.40 m from its requested target; Nose/Tail pivots about 0.23 m away. Wrist distance is a diagnostic proxy, not a glove-surface contact measurement.

The grab target used the reaching foot's outward sign for toe/heel selection. That sign changes with the hand/stance and made Indy/Stalefish choose inconsistent rails. Targets now use the rider's anatomical facing for toe/heel edges. Named cross-body reaches are allowed to travel inward toward the board while retaining skull exclusion and measured arm-length limits.

The pose now gathers the knees and tilts the torso a little farther toward the deck. A grab-only 0.18 m cosmetic board lift brings the deck toward the body; foot IK follows it while the physical skater root and contact rig remain unchanged. A per-leg minimum-reach floor limits the deepest tuck: an intermediate candidate missed a foot anchor by 3.9 cm, so that candidate was corrected before final capture. Ordinary held-grab foot targets now pass the 1.5 cm bound in both stances; bone scales are unchanged. Japan's deliberately released foot retains its authored pose.

Final sheets show a more compact grab silhouette, consistent rail targeting, and improved apparent hand/deck proximity. No board-through-body or limb stretching was observed in the reviewed final Adolescent/Heretic/TuxR sheets. **Contact is still imperfect on compact rigs.** Final Adolescent wrist pivot gaps remain approximately 0.24 m for Indy/Melon and 0.19–0.20 m for Nose/Tail after preserving foot/hinge safety. Do not describe this as a complete grab-contact solution; a further authored shoulder/board reach pass is warranted.

**No demonstrated flip defect justified changing rotation/timing.** The examined frames show distinct roll, shove, pitch-accent and Impossible-wrap trajectories, then an upright catch. The side/nose views of Hardflip and Inward Heelflip were inspected at the accent; overlap in a projection alone was not treated as proof of mesh penetration. No authored flip timing, scoring, physics, balance controls, or tutorial recording was changed. Existing end-catch continuity checks remain in place. Grinds/manuals retain their existing balance/weight poses; the bail sheets show body contact followed by settling without a newly demonstrated constraint defect.

## Validation and limits

`tests/grab-visual-contact-quality.test.mjs` checks anatomical rails in both stances, physical root/contact metadata preservation, grounded tuck exclusion, unchanged paths for all 12 board flips, planted ordinary grab feet, and unchanged bone scales. Along with the existing crouch/grab, full rider, motion runtime and pose-constraint suite, **38 focused tests pass** (`final-focused-tests.log`). This supplements the earlier 96 numeric trick/avatar/stance cases and ragdoll profile; it does not replace rendered inspection.

Residual work includes exact palm/finger grip authoring on compact rigs, rendered Anchor and every extended grab, low/high captures of every family through actual gameplay input, park-specific camera/lighting review, and human normal/slow-motion approval. The reference clips were recorded; this report does not claim every encoded frame or every gameplay state was visually certified.
