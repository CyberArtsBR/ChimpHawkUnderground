# Local master upgrade — gameplay checkpoint

Updated 1 November 2026. Local branch only; no commit, push, merge or deployment performed by this agent.

## Implemented

- `SessionFlow`: brief READY state, consumed skip/GO event, immediate Free Practice, 90-second timed play, eligible-attempt overtime capped at six seconds, once-only settlement and finish events, pause/restart handling. Grounded charging alone does not earn overtime. Runtime integration is owned by the lead in GameShell/game-main.
- `ScoreRecords`: saved per-park records keyed by scoring-rule version; incompatible old scores are retained separately and never silently compared. Practice, invalid runs and corrupt/blocked storage are handled.
- `RunFinalScore`: `line-score-v2` removes the flat +100 per-bank and +25 per-entry bonuses. Existing combo multiplier/repeat decay, variety cap and 250-point bail penalty remain. Actual scorer/run-summary matrix: three isolated ollies **158**, three linked ollies **237**, linked Ollie/Kickflip/Heelflip **863**. A bail removes 250 from an otherwise identical accepted run. Zero-value repetitions cannot farm the removed bonuses.
- `PracticeDrills`: selected-trick clean-landing goals, failure hints, immediate retry, nine generic drills including low/high pop, switch landing, balance correction and ramp return. Success depends on accepted scoring and observed motion rather than button presses. Failed evidence returns a strict boolean. Retry preserves the selected target; ordinary practice entry should explicitly clear `target` if a previous selected lesson must be discarded.
- Real 120 Hz controller fixtures for flat pops, low ledge, stairs, entry-speed rail capture, neutral quarter return, deliberate deck transfer and braking. Run `node tools/measure-skate-feel.mjs` to regenerate `artifacts/upgrade-gameplay/feel-fixtures.json`.

## Narrow coping-transfer correction

The new 2 m quarter/4 m deck fixture reproduced a persistent freeze after an apex exit at 10 m/s: a blended ramp/deck wheel contact (normal Y ≈ .934) was accepted as an original-ramp landing despite an active verified transfer. Descent projected onto that mixed normal reversed travel, leaving the skater around z −3.27 with near-zero speed.

`SafeCopingExitSkillStreetPhysics.land` now lets the verified transfer own its deck landing; the original-ramp precedence applies to returns/aborted transfers. `supportMatchesDeckTarget` checks agreement with the scanned deck normal, so a mixed lip contact cannot masquerade as that deck. Existing swept collision remains active until the wheels reach valid support. Sloped decks compare against their own scanned normal, not world UP. No launch impulse, acceleration, gravity, yaw, collision geometry or global tolerance was changed.

At entry speeds 8/10/14/18 m/s, the apex exits now land at y 2.015 with normal Y 1, then continue beyond z −10 without bailing or freezing. Neutral quarter return still lands on the ramp face. Tests cover the full runtime path plus flat/mixed/sloped target-normal acceptance.

## Measured feel

- Low/high charged flat pops: peak rise **.754 / 1.453 m**, airborne **.533 / .742 s**.
- Braking from 6/12/18 m/s: **1.10 / 4.42 / 9.92 m**; stopped within 1.3 seconds.
- Low ledge and stair fixtures clear their authored approach and land cleanly.
- Rail fixture captures at the supplied 10 m/s entry speed and remains attached with balance correction until the actual rail end.
- Neutral quarter return lands with ramp normal Y approximately .56, rather than accepting a flat coping catch.
- Default cruise18, gravity21, pop5.6–7.9, charge.24 and fixed120Hz remain unchanged. No precision-speed preset added without evidence it is needed.

## Validation

- Final focused gameplay/session/records/transfer suite: **73/73 passed**, including the two new transfer regressions. Log: `artifacts/upgrade-gameplay-final-targeted.log`.
- Full suite checkpoint: **926/934 passed**. All eight remaining failures are shared shell legacy expectations/harnesses (camera start without SessionFlow, old hard cutoff/unskippable Time's Up/result-bonus expectations, and importer moved from Options to Creator). These were sent to the lead; no failing tests were weakened or skipped here. Log: `artifacts/master-upgrade-tests.log`.
- Physics verification completed successfully (exit 0), including board15/15, vert20/20 and pumping15/15. Output: `artifacts/upgrade-gameplay-physics.log`.

The fixtures isolate measured behavior. They do not certify every imported bowl corner, every physical controller or all player-authored routes. Browser acceptance, complete round flow and final integrated validation belong to the lead.
