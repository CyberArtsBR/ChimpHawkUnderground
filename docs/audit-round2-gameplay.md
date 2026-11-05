# Gameplay audit — 29 October 2026

Base: standalone `fcdd864`; changes on `codex/post-release-full-audit`. This is a source and deterministic-test audit. Browser coverage below is explicitly separate from physical-controller or pro-player validation.

## Confirmed issue fixed

**P2 — upgrading a flip bypassed multiplier repeat limits.** In one continuous combo, record a Kickflip then upgrade it to Double Kickflip eight times, with distinct execution times. Before the fix, the multiplier reaches 8 even though the final three Double Kickflips earn zero base points from repeat decay. `record()` counts the provisional Kickflip identity, whereas `upgrade()` changes that identity without correcting the multiplier. This rewards repetition over varied lines.

`SkateTricks.recalculateCombo()` now derives both score decay and multiplier eligibility from final trick identities and stance. Eight identical double flips produce multiplier 2, matching eight directly recorded double flips. An upgrade remains one execution; legitimate switch-stance variety, duration points, banking, and the overall multiplier cap remain intact.

Evidence: `tests/upgraded-trick-scoring.test.mjs`; the pre-fix reproduction returned multiplier 8 and final entry points `[200,150,100,50,20,0,0,0]`.

## Coverage defect improved

**P2 — coping harness could miss grounded freezes and skipped imported-rail approaches.** The previous test counted only low velocity while airborne. A character frozen at the lip with `grounded=true` would not be flagged. It also sampled only each rail's midpoint; the previous Paradise report skipped `G-Object.022 / coping 10` and `coping 11`.

The harness now checks sustained near-lip low speed after launch even when grounded, excludes intentional active grinds and brake cases from automatic stall candidates, and tries other rail segments and offsets before declaring an approach unavailable. It records the sampled segment and separate launched/no-launch counts: an attempt that never launches must not be described as a successful return. `COPING_OUTPUT` allows independent audit evidence without replacing the prior report.

This improves test sensitivity, not game physics. A flagged stall remains a candidate requiring trace inspection, particularly for intentional exits. Sampling one valid approach per side is not exhaustive coverage of every point along a bowl.

## Other areas inspected

- Practice progression receives accepted score banks; bail cancellation cannot complete a drill. Optional drills remain separate from normal play.
- Manual and grind duration scoring scales with movement; stationary duration farming is already suppressed. Simultaneous scoring events are deduplicated, and a bank is one-shot.
- Ground motor retains automatic propulsion toward 17 m/s, no automatic push animation, high-speed steering attenuation, slope-sensitive acceleration, and progressive drag. These are deliberate arcade choices; there is no player evidence here to justify changing the default speed.
- Base jump impulses remain 5.4–7.6 m/s, charge time 0.24 s, coyote time 0.09 s and buffer 0.12 s. No gravity or jump-height change was made without obstacle/landing evidence.
- Existing deterministic checks cover 30/60/120/144 Hz render schedules and same-wall fakie returns without invented yaw. That coverage does not establish every imported coping path.

## Validation and remaining work

38 focused tests pass: upgraded scoring, combos, practice drills, render cadence, ramp return, ground motor and ollie/flip landing. Log: `artifacts/audit-round2-gameplay-tests.log`. The coping harness passes `node --check`.

The subagent's new browser run was blocked by local-server reachability: sandbox navigation returned access denied, and escalated browser/curl attempts to `127.0.0.1:5182` returned refusal/timeout. No fresh coping result is claimed by this document until the parent completes the runtime pass. Preserve the earlier two untested Paradise sections as an open validation gap if the expanded harness still cannot obtain an approach.

Next gameplay acceptance work: complete the runtime coping matrix with trace review for candidates, manually compare low/high pop at ledges and transfers, and test marker retries plus drills on a physical gamepad. Keep default speed, gravity and approved ramp-exit controls until those measurements support a change.
