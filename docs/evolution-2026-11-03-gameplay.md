# Gameplay, physics and animation review — 2026-11-03

Reviewed release base: `f62779d`. Owner: gameplay specialist (`evolution_gameplay`). Source and deterministic tests were reviewed; this is not a new human-controller or complete rendered-animation certification. No browser/GPU session ran concurrently with the lead's visual review.

## Findings and controlled patch

| ID / priority | Reproduction and player impact | Ownership / status | Acceptance and evidence |
|---|---|---|---|
| EV-GP-01 / P1 | Land a 100-point combo, then press the mapped Reset Rider key (`R`). `StreetPhysics.advance()` called the full round reset: HUD score became 0 while `RunSummary.totalScore` remained 100; final results explicitly consumed the now-zero controller score. The clock/round did not restart. | `StreetPhysics.resetRider`, `game-main` reset toolbar. **COMPLETED — focused verification.** An explicit rider-reset transaction retains accepted score, stance and distance, clears unfinished tricks/buffered jumps, invokes the existing virtual reset pipeline, syncs canonical state and increments the respawn serial. Full `reset()` remains the round-start/restart operation. | Tests bank an actual combo, start an unfinished second combo, reset via real `advance({reset:true})`, verify accepted score survives, pending combo disappears, velocity/charge/input/interpolation reset, canonical stance stays consistent, and serial increases. Independent full-round/browser verification is lead-owned. |
| EV-GP-02 / P2 | Select a different character, then bail/respawn. `StreetSkater.setRiderModel()` collected flash materials from `visual`, including the board; `load()` correctly collected rider materials only. The swapped rider's respawn effect therefore made the deck translucent and disabled depth writing. | `StreetSkater.captureRiderFlashMaterials`. **COMPLETED — focused verification.** Boot and swap now share the same rider-only capture method. | Async swap regression verifies only rider materials are collected once (including a duplicate material in a mesh array); applying the runtime ghost transaction leaves board opacity 1, transparency false, depth writing true. Existing late-load/cancellation test also passes. |
| EV-GP-03 / P2 | Start a manual, accumulate difficulty/drift, then complete the opposite manual sequence. `SkillStreetPhysics.handleEvents()` reset `manualTime`, balance velocity/value and instability to zero for every manual↔nose-manual switch. The before-state probe with time 8 s/value .63/velocity .6/instability .8 returned all four to zero on switch. This refreshed difficulty without leaving the manual chain. | `SkillStreetPhysics.handleEvents`. **COMPLETED — phase 2 focused verification.** Only first manual initiation resets the challenge; switching nose/tail retains accumulated time, drift/velocity/phase, instability and flatland cooldown while updating the actual manual kind and score-entry attribution. | Real direction-sequence tests cover both switch directions, old/new duration attribution, unchanged initial seeds, exit/reentry, queued landing bridge, repeated-switch stress and opposite correction at 30/60/120/144 Hz. Existing fixed-step air-to-manual replay also passes. No coefficient, initial-assistance formula, inverse-control rule, grind behavior, scoring formula or scoring-version change. |

Before-state reproduction: `artifacts/evolution-2026-11-03/gameplay-before.json`. Focused regression log: `artifacts/evolution-2026-11-03/gameplay-tests.log` (15 passed, zero failures). New reset tests: `tests/rider-reset-context.test.mjs`; rider-swap regression: `tests/agent11-rider-swap.test.mjs`.

## Existing work retained and remaining limitations

- Coping continuous return, yaw authority, inverse grind/manual correction, persistent rail capture and ground-speed/gravity tuning remain unchanged. Their existing fixed-step regression tests are retained; they were not represented as newly fixed in this cycle.
- The released geometry-based board/sole clearance patch remains in place. Compact-rig grab hand/deck separation remains a known visual limitation from `docs/animation-visual-review-2026-11-02.md`; this source pass does not establish a new defect or perfect contact.
- Camera framing/smoothing and five camera choices are retained. No new camera-motion quality claim is made without recorded play footage.
- The long compatibility inheritance chain remains documented technical debt. New authority should stay in the existing controller/result seams rather than adding wrappers; an engine/physics rewrite is not justified by these two reproduced bugs.
- `R` retains its existing ability to abandon an unfinished trick or return from a bail. The patch changes accepted-score preservation, not the game's recovery/penalty policy.

## Evidence-based provisional scorecard

Scores are specialist judgments about the inspected release, not automated-test pass percentages or a whole-game AAA certification. Categories without new direct evidence should retain the lead's existing baseline rather than receive invented increases.

| Discipline | Provisional / 10 | Evidence and practical limit |
|---|---:|---|
| Gameplay mechanics / game feel | 7 | Clear ground/air/grind/manual separation and dedicated input/controller tests; manual-switch challenge refresh now has a focused fix and regression coverage. Fresh physical-controller feel is not graded by this source pass. |
| Physics consistency | 7 | Canonical yaw/landing authority, 120 Hz stepping and many real-geometry regressions are established; complex authored park contact still needs ongoing human routes. This patch leaves physics constants unchanged. |
| Animation integration | 6 | Explicit physics/presentation separation and the released measured sole fix; compact-rig grip gaps remain and fresh full-motion approval is pending. |
| Input/recovery reliability | 7 after focused fixes | Rider reset now preserves round state and rider swaps preserve opaque board presentation, with reproducible regressions. End-to-end local browser acceptance remains lead-owned. |
| Architecture/maintainability | 6 | Canonical result/controller modules provide useful authority boundaries, but legacy chain and monolithic main integration still raise change risk. |

## Next dependency order

1. Lead integrates the two focused fixes and runs full tests/build plus local `R`/swap/respawn acceptance.
2. Lead integrates EV-GP-03 and runs the full suite/build plus actual local manual-switch play; challenge coefficients and controller direction remain unchanged.
3. Complete normal/slow visual review of remaining compact-rig grabs and all park/controller combinations; avoid claiming solved IK from endpoint-only tests.

No new mode, dependency, asset, merge, deployment or Portals platform sync was performed by this workstream.

## Phase 2 manual-chain verification

`tests/manual-chain-balance.test.mjs` adds 14 cases using the actual direction resolver, event handler and fixed-step runtime. Continuous switches preserve the exact balance-state object/values and time; new trick `recordedAt` timestamps and duration attribution still change independently. A fresh manual after exit or queued touchdown retains the original 0.72/2.05 seeds and initial grace behavior.

At 30/60/120/144 Hz, repeatedly switching every approximately 0.4 s completes 16 nose/tail changes before neutral input loses the continuous challenge at about 6.2 s; it cannot repeatedly refresh initial assistance. Correct opposite-direction input still reduces either sign of lean for both manual types at every tested cadence. This is a deterministic fixture, not a claim about all speeds, maps or human performance.

The 14 new cases plus the existing keyboard/stick/D-pad balance-direction, grind/manual and deterministic scenario replay checks pass: 51 tests, zero failures. Evidence: `artifacts/evolution-2026-11-03/manual-chain-tests.log`. Integrated full-suite/build and fresh browser acceptance remain lead-owned.
