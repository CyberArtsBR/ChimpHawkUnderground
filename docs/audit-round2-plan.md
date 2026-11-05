# Post-release audit and improvement plan

Baseline: standalone `fcdd864`, published and matched by SHA-256 against the live JavaScript bundle. Portals source: `ee2526e` on `fix/portals-bundled-fonts`. Hosted Portals synchronization remains manual.

Work branch: `codex/post-release-full-audit`. This next iteration is for local review.

## Responsibilities and order

1. Gameplay agent: audit scoring, speed, jumps and practice; expand coping approach coverage; reproduce defects before changing physics.
2. Animation agent: audit board/foot movement, stance, flick and catch; correct concrete motion mismatches with rig-level regressions.
3. UI agent: audit menu and tutorial transitions, focus and controller routes; fix lost session intent and inaccessible actions.
4. Lead: audit rendering, graphics lifecycle, frame measurement and screenshots; integrate changes and validate the whole build.

Prioritize reproducible correctness problems, then measurable performance and presentation improvements. Preserve auto propulsion, approved vert controls, fixed simulation, desktop/gamepad scope, tutorial-first Flip School and glow in the 144 profile. Do not retune gravity or speed solely from subjective assumptions.

## Acceptance

- Targeted regression tests, full unit and physics suites, production build.
- Browser checks of title, tutorial, selection, settings, practice and all three parks, with screenshots.
- Coping results distinguish successful returns, failures and approaches that never launched.
- Performance results distinguish browser callbacks, submitted screen frames and GPU/display presentation. Record hardware, resolution and glow settings; do not promise 144 FPS from callback cadence.
- Final report separates implemented fixes, observations and unverified player/hardware/audio judgments.

Publish this new iteration only after review; the previously authorized release is already on main and the Portals source branch.
