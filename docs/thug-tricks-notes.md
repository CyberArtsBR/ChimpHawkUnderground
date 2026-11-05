# THUG reference: trick input and scoring adaptation

Date: 2026-10-08. This is a behavior study and an original JavaScript adaptation for StreetSkate. The local C++ reference was read; its runtime, scripts, animation clips and assets are not embedded in this change.

## Reference functions inspected

- [`CTrickComponent::AddTrick`, `RemoveFrontTrick`, `TriggerNextQueuedTrick`, `ClearTricksFrom`, `ClearEventBuffer`](https://github.com/RetailGameSourceCode/TonyHawksUnderground/blob/master/Code/Gel/Components/trickcomponent.cpp): bounded trick queue, consumption before execution, cancellation and separation of input history from execution.
- `CTrickComponent::MaybeQueueManualTrick` and `MaybeExpireManualTrick`, in the same file: manual detection and a separate pending manual lifetime.
- [`Score::Trigger`, `Score::deprecMult`, `Score::TweakTrick`, `Score::Land`, `Score::Bail`](https://github.com/RetailGameSourceCode/TonyHawksUnderground/blob/master/Code/Sk/Modules/Skate/score.cpp): named trick entries, repetition history keyed by stance, changing an existing trick's value, and separate landed versus failed combo outcomes. The reference depreciation sequence is 100%, 75%, 50%, 25%, 10%.

## Applied behavior

- New air button presses wait for the current flip to finish instead of being discarded or overlapping the rotating deck. The local queue allows two pending tricks with a 0.72-second lifetime. These bounds are StreetSkate tuning values, not extracted THUG constants.
- Repeating the same Kickflip or Heelflip before progress 0.62 upgrades it to its double version. A different directional flip queues separately. An upgrade retains one score entry and one multiplier; it no longer adds the entire double trick as a second scoring event. Board rotation continues from the current pose using the shared `flipTurns` helper.
- A held grab receives duration points on its own score entry. It waits for a flip to finish; releasing the grab button cancels queued grabs. A new flip ends the active grab. Duplicate queued copies of an already active grab do not add points.
- Trick repetition is tracked throughout the current combo by trick name and regular/switch stance, using the reference depreciation sequence. Duration points receive the same decay. This deliberately uses only the two StreetSkate stances and resets repetition history on settlement; it does not reproduce THUG's full four-mode/session history.
- A successful manual input consumes both directional taps. Selecting the same active manual, flatland pose or grind again does not create an extra multiplier. Existing manual landing grace and balance controls remain active.
- Air queues clear on ground contact, grind entry, wall ride and bail. `clearPendingInput()` additionally clears direction, manual and button buffers for pause/mode changes while preserving the current combo and score.
- Rail exits and wall departures capture fresh air heading, facing, stance, spin and flight time. They no longer inherit the previous bowl jump's takeoff heading. This fixes StreetSkate's existing lifecycle; it is not a claim that those fields directly mirror THUG.

## Scope and verification

The existing directional catalog, controls, collision system, park and authored procedural animation system remain in use. The queue windows, trick durations, grab point rates and double-flip values are local tuning. This does not import THUG's scripted trick database, create-a-trick, special meter, reverts, original animation clips or exact scoring/spin system.

Reviewed through source inspection and integration review. No gameplay tests or benchmarks were run, as requested. Compilation and deployment are performed by the main integration task.
