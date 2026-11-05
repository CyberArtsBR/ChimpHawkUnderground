# Classic skate behavior adaptation

Behavior reference: [THPS2 demo reconstruction](https://github.com/emoluvjd2/thps2-demo-decomp), revision `1050a327d0a009aad70549debc99788a8900a882`. Static study focused on `PHYSICS.cpp` ground/air, jump, rail and contact routines and `CAMERA.cpp` normal/big-air camera behavior. The reconstruction is incomplete; its fixed-point constants are not transplanted into meter-based gameplay. Project8Recomp publishes the recompiler host, not generated gameplay source.

This release uses original StreetSkate implementations:

- Return airs use a local vertical plane at the coping, independent of trick yaw. Held forward during approach no longer requests a transfer. Ctrl/L2 requests deliberate exit; a fresh forward tap after the apex also requests exit. Deck clearance remains required, and an airborne exit does not add another jump impulse.
- Recovery accepts the original transition within a bounded corridor and avoids large ground snaps. Continuous contact sweeps remain active.
- A lower chase camera follows actual travel, holds its side through return airs, widens the airborne framing and eases outward after occlusion.
- Flip presentation shares preparation/rotation/catch timing between rider and board. Grabs have distinct deck poses, blended hands and corrected nose/tail/edge targets. Feet follow the posed deck outside flips; wrist orientation is stabilized. Automatic pushing has matching presentation.
- Grabs pressed during takeoff have a short input buffer, like flips.

Animations are procedural adaptations for TheanchoURi's rig. These repositories do not supply usable original animation clips; this is not an exact reproduction of Tony Hawk animations or physics.

Validation for this release is compilation only. Gameplay testing and tuning are left to the user as requested.

## Recording follow-up

The user's 98-second recording exposed near-body camera occlusion at 92–94 seconds, repeated Ollie labels at the coping, and departure contacts being treated as touchdown. The follow-up uses a lower 58-degree chase view, five lens-clearance probes and a bounded side/elevation search when the normal chase arm is blocked. Emergency near-body positions hide the rider mesh temporarily. Camera clearance never changes player physics.

Return airs reject ascending departure contacts and flat coping support. Vertical contact uses a limiting climb tangent rather than a zero projected board direction. Ground wall contacts retain a short sliding constraint without changing player heading. Ollie scoring requires player-requested impulse and actual airborne separation; ramp energy alone earns no Ollie. Knee tuck varies through the air arc.
