# Animation and VFX small audit

## User-directed simplification (current)

- Removed Pogo, Wrap Around, Truck Stand, Anti Casper, To Rail, Switch Foot Pogo and One Foot Manual from the gameplay catalog, generated trick guide and animation channels.
- Remaining flatland variations: Handstand and Casper.
- Removed the newly added push-foot animation. Acceleration controls are unchanged.
- Removed the slow looping Kickflip demonstration from the preview; the pre-existing gameplay flip timing remains unchanged.
- Increased nose-manual presentation pitch from 0.16 to 0.30 radians, compensating height around the supporting truck.
- Casper underside foot targets now include measured ankle-to-sole clearance plus clearance for the truck hardware.
- Handstand preserves outward-facing hands, outward elbow poles and the slower transition approved in the preceding pass.

Validation: 13 focused tests pass; unminified modern-JavaScript verification build passes. Changes remain local. Earlier sections below record superseded experiments.

## Handstand follow-up

Replaced the raised-feet approximation with full-body inversion. Shoulder placement uses measured arm lengths; both hands target the deck, legs follow the inverted body, and shared flatland weights blend entry and exit. Added a head turn to reduce the oversized hat's overlap with the board.

Production-skeleton tests now verify hips above head, feet above hips, hands within 2.5 cm of deck targets, and return to an upright manual in both stances under a translated/tilted parent. All 12 focused tests pass. The unminified modern-JavaScript build passes. Browser inspection confirmed the inverted pose and exposed the hat overlap, prompting the head adjustment. The large hat still obscures some hand contact from the front; this is a stylized procedural pose, not a motion-captured animation.

An interactive review scene is saved at `tools/animation-preview.html`, with variation selection, stance switching, pause and orbit controls. The older limitation notes below are historical.

## Follow-up enhancement pass

Implemented after the initial audit:

- Shared, frame-rate-independent flatland channels blend entry, exit, and switches between all nine variants.
- Pogo and Switch Foot Pogo share a bounded bounce between deck and rider.
- Wrap Around now traces a continuous foot orbit with lift, rather than only moving sideways.
- To Rail rolls the deck 90 degrees onto its edge and uses edge foot targets.
- Casper and Anti Casper use underside targets and compensate foot orientation for the inverted deck. Truck Stand uses separate board-relative targets.
- Push timing now drives the rear foot through plant, sweep and recovery; previously the rider accepted but did not use push inputs.
- Supporting feet follow the posed board while released feet blend their orientation away from it.

Validation: 12 focused tests passed, including a runtime check against the production rider GLB in both stances, all variations, pushing and reset. A modern-JavaScript, unminified verification bundle succeeded at `artifacts/animation-build`. Standard optimized build remains blocked by the absent `@esbuild/win32-x64` executable. No browser visual approval or deployment was performed.

Handstand still needs a dedicated full-body inverted animation. These tests establish finite transforms and transition behavior, not anatomical realism or visual quality. The initial findings below describe the pre-follow-up state.

Scope: active source in G:/Streetskate. Code audit, not a visual approval.

## Improvements implemented

- Flip wind: two short cyan-white trails follow opposite deck corners in world space. Rotation naturally creates curls. Emission ends before catch; trails fade within 160 ms and clear on landing, bail, reset, or large frame gaps. Fixed geometry limits the effect to 128 vertices.
- Manuals: blended fore/aft body weight, opposing torso lean, wider balance arms, and subtle timed corrections distinguish nose and tail balance.
- One Foot Manual: supporting rear foot now tracks the posed deck, including its orientation. The released front foot lifts with the flatland blend. Removed an extra stance-dependent board pitch that doubled or cancelled the underlying manual angle.

## Remaining animation findings

- Handstand only bends the spine and raises feet; it does not invert the body. It needs a dedicated full-body pose and reachable hand support.
- Pogo and Switch Foot Pogo use fixed foot lifts, without a coordinated bounce/contact cycle.
- Casper, Anti Casper, Truck Stand and To Rail use approximate offsets; their specific underside/truck/edge contacts need dedicated IK targets.
- Wrap Around uses lateral oscillation rather than a complete foot orbit.
- Most flatland variants still change foot targets immediately. A per-variant transition system would improve switches between tricks.
- Existing flip timing already coordinates flick, rotation, clearance and catch; it was preserved.

## Verification

New automated checks cover trail world-space continuity, capacity, fade and cleanup. Existing grind/manual checks pass 23 of 24; the unchanged low-speed grind capture check expects 0.21 but receives 8.5. No gameplay physics changes were made. In-game visual review is still required, especially for model-specific joint reach and trail visibility.
