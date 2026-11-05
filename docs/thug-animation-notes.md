# THUG animation principles adapted for TheanchoURi

Date: 2026-10-08. Source study: CAnimationComponent::PlayPrimarySequence and create_new_blend_channel in [animationcomponent.cpp](https://github.com/RetailGameSourceCode/TonyHawksUnderground/blob/master/Code/Gel/Components/animationcomponent.cpp); CAnimChannel::SetAnimSpeed in [AnimController.cpp](https://github.com/RetailGameSourceCode/TonyHawksUnderground/blob/master/Code/Gfx/AnimController.cpp); controller composition in [blendchannel.cpp](https://github.com/RetailGameSourceCode/TonyHawksUnderground/blob/master/Code/Gfx/blendchannel.cpp).

The reference separates animation sequence playback, playback rate, transitions and controller layers. StreetSkate applies those principles to its existing procedural rig, with original JavaScript and local timing values:

- State weights are normalized after time-based blending. Entering air, manual, grind and landing cannot accumulate multiple full-strength poses.
- Push cadence follows rolling speed with a continuous phase and a shared foot-stroke curve. Canonical ground-motor intent controls brake/push presentation, including the new sharp carve behavior.
- Ollie pop, flip rotation, flick, foot clearance and catch share phase helpers. Double-flip upgrades continue from the currently rendered number of turns rather than abruptly doubling the angle.
- Ordinary air tuck lowers the body while the feet track the deck. Only flips and named one-foot tricks release the relevant feet. The board crossfades manual/grind/grab poses; full flip rotations follow their complete rotation curve.
- Body and pelvis adjustments occur before limb IK, so later parent-bone rotations do not invalidate the solved contacts. Grab hand targets blend toward the posed skateboard, and wrist orientation follows the board during contact.
- Landing compression uses impact into the support normal, avoiding a hard-landing pose solely because a gentle ramp return had high world-vertical speed.
- Reset clears rider/board presentation state and pose blending as well as gameplay state.

The model has no supplied THUG animation clips. These are procedural approximations for the user's Unreal-style skeleton, not imported retail animations or a guarantee of exact anatomical contact. Existing advanced flatland poses remain approximations. Tuning and visual evaluation are left to the user: no runtime animation tests or benchmarks were run. The integrated application is compiled before publication.
