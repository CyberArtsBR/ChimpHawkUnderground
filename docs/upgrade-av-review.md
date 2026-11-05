# Audiovisual upgrade review

Working review, 1 November 2026. Local branch only.

## Implemented and verified by CPU tests

- `SkateAudio` consumes the ragdoll's physical `groundImpact` event exactly once, including pause/mute transitions. A soft board rattle occurs when control is lost; the body impact waits for actual contact.
- Announcer/session gain is independent from skating effects; music ducking returns to the latest selected volume and cannot undo mute. Background playback is an explicit saved preference.
- Liquid stays a shallow glossy mesh with bounded droplets. A maximum of eight probes fits mild local curvature once per hit; no continuing reflection/raycast cost. Preference, reset and disposal clear the effect.
- The Impossible uses a shared rear-foot presentation pivot; the front foot lifts clear. Grind weighting follows the supporting truck. Grab targets follow stance and board scale. No physical controller or collision geometry was moved by the animation change.

## Surface audio contract

`audioSurfaceTag` (or authored `surfaceType`) is inherited from glTF node metadata. Rideable raycasts and swept contacts preserve object, face and tag. Each current valid wheel stores its tag; the majority contact chooses the rolling profile. Missing/invalid contact returns neutral rather than retaining an old surface. Rail runtime preserves a validated authored tag.

For Warehouse and ORBIT, an exact registry maps inspected shipping material identities to wood/concrete/metal/rubber. Blender numbered material instances use the same finish. Arbitrary mesh-name substrings never select audio. Warehouse collision batching keeps materials separate while preserving all triangles/transforms.

Paradise's authored hidden proxies use `Collision / hidden` and have no audio metadata. Those contacts intentionally remain neutral until the artist supplies explicit tags; assigning a sound by obstacle name would fabricate evidence. Uploaded maps can opt into tags on collision groups and rails.

## Evidence so far

- `artifacts/presentation-upgrade-tests.log`: 39 targeted motion/audio/liquid tests passed.
- `artifacts/presentation-upgrade-audio-tests.log`: 23 focused audio/presentation tests passed, including overlapping ducks, hidden music, independent gains and all five supplied rigs in both stances.
- `artifacts/surface-audio-propagation-tests.log`: 47/47 metadata, map, board-contact and imported-park tests passed.

The follow-up below records the browser, physical-controller and listening checks completed after these initial CPU tests.

Reference: [Nollie Skateboarding — Backfoot Impossible](https://nollieskateboarding.com/en/news/15884) explains the rear-foot wrapping relationship. The shipped animation remains stylized procedural motion; it is not motion capture.

## Updated review — 1 November

- Captured 60 contact sheets (five rigs, regular/switch, front/side/rear, motion and named grabs), reframed the airborne shots to include the whole rider, and inspected representative views of every rider. The bend, Impossible pivot and catch are visible. Some named grab hand-to-board contacts, particularly Rocket Air, Seatbelt and Crail, remain stylized and should be judged in motion by a skate animator; short-arm rigs constrain exact contact. `artifacts/presentation-upgrade/report.json` records wrist-to-target distances and every sheet. This does not certify physical hand contact or animation quality in every frame.
- Real ragdoll browser check produced a body-impact point and the raised glossy puddle at that contact with active glow. Evidence: `artifacts/master-upgrade/bail-review/`.
- User tested an Xbox 360 controller in local practice and reported analog, A, X, Y and Start responded well. Windows XInput also reported a connected device. This is a player-reported check, not a latency measurement or confirmation for other controller models.
- The previous procedural pop/catch/landing/bail sounded artificial to the user. Local game now loads CC0 recordings of a real ollie, wheels and body fall, with the prior synthesis only as a fallback. User retested and reported the new sounds improved considerably. `public/audio/foley/CREDITS.md` records origin, transformations and license; the body fall recording was on dirt, not concrete. All four clips decoded in Chromium and the offline mix rendered without clipping (`artifacts/master-upgrade/foley-qa/`).
- Warehouse/ORBIT use validated collision material tags for rolling/grinding sounds. Imported Paradise hidden collision proxies lack material metadata, so those fall back to a neutral profile; no material sound is guessed from object names.
