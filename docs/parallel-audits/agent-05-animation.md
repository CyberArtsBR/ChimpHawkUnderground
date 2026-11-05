# Agent 05 — Rider Animation, IK & Presentation

## Branch and boundary
- Baseline `main`: `ff33677541f61b803901ac37c2465226799ec8a3`
- Working branch: `audit-fix/05-rider-animation`
- Modified files: `src/character/UnrealRider.js`, `src/character/PresentationState.js`; new `src/character/RigMapping.js`, `tests/agent05-rig-animation.test.mjs`, this document.
- No skateboard, physics, collision, camera, asset, design, model or texture changes.

## Audited characters and default GLBs

| Character | GLB | Repository byte size |
|---|---|---:|
| Heretic | `public/assets/rider/The_Heretic.glb` | 6,370,204 |
| Adolescent | `public/assets/rider/The_AdolescentUR.glb` | 3,125,416 |
| Anchor | `public/assets/rider/The_Anchor.glb` | 2,700,460 |
| Tuxr | `public/assets/rider/TuxR.glb` | 2,111,960 |

`The_Anchor.glb` and `TheanchoURi.glb` have the same Git blob SHA on the baseline. The default paths and user GLB upload interface remain unchanged.

## Confirmed code findings and implemented fixes

1. **Strict bone-name matching:** The previous dictionary keyed only exact imported bone names. Mixamo-prefixed, differently capitalized or customary joint aliases would silently lose IK, despite having a valid rig. Added a conservative semantic resolver with exact Unreal bones taking priority; built-in model bone names and hierarchies are never edited. Added per-limb availability diagnostics to `rigAudit`.
2. **Fixed knee pole origins:** Knee poles were cached as **positions** in rider-root space. As the pelvis translated during crouches or board-relative motion, a pole could land on the wrong side of the thigh. Now stored as rest-pose **hip-relative directions**, rotated by the current root orientation and applied at the current thigh origin. Degenerate poles fall back to the current joint plane, then deterministic axes.
3. **IK numerical safety:** Two-bone leg/arm solver now rejects nonfinite pole/target vectors, computes a non-overlapping reach interval for extremely short limb bones, and normalizes world-to-local bone quaternions.
4. **Invalid model geometry:** Normalization now throws a clear load error when visual bounds have zero/invalid height, rather than dividing by zero.
5. **Presentation spring resilience:** Corrects nonfinite targets, frequencies, timesteps, positions and velocities before advancing spring channels.
6. **Avoid non-authoritative oscillation:** Removed an unconditional speed-scaled sinusoidal arm-bob contribution, which added movement unrelated to push/grind/impact forces.

## Kept intentionally unchanged

- Deck contact is still derived from the board's actual `pointWorld` and contact rig.
- Hip compression, grabs, spins, bail, procedural stance, animation state blending, default authoring orientation and custom rigged GLB hot-swaps keep their existing behavior.
- Both feet remain planted for automatic propulsion as explicitly coded on `main`. The existing `pushWeight=0` behavior is not overridden: a believable one-foot push needs a gameplay-sanctioned push-contact/replant window to avoid introducing an obvious new foot slide.
- Existing presentation translation/normal damping in `StreetSkater.js` is not increased; it should not be used to hide genuine physics jitter.
- Hand IK reach may still fail on extreme proportions or very long reaches; this needs full animation QA rather than artificial limb stretching.
- No speculative per-character scale/sole tweaks without actually measuring rendered geometry.

## Tests

Added `tests/agent05-rig-animation.test.mjs`:
- Unreal versus Mixamo bone name aliases and precedence
- Full left/right IK chain coverage checks
- NaN/Infinity presentation spring handling
- File-based glTF 2.0 header, length, JSON scene and rig-semantic diagnostics for all four stock character files
- Synthetic hierarchical two-bone legs/arms, deck targets and finite/unit bone quaternion checks across idle, push, coast, crouch, Ollie, air, landing, grind, manuals, fakie, wallride, flip, grab and bail

Test execution command: `npm ci && node --test tests/agent05-*.test.mjs && npm test && npm run build`.

## Limits and follow-up visual validation

- A syntactically valid GLB container and semantic name coverage do **not** prove rendered sole clearance, bone bind-pose quality, correct footwear contact or actual animation quality.
- Browser/video visual inspection across all four real rigs is needed for standing, skating straight, side camera, regular/fakie, ramp, push, Ollie, flip, grind, manual, bail and recovery.
- If physics root is unstable, isolate it from bone pose/jitter via replay and numerical sampling; do not bury it under extra smoothing.
- Only approved PR integration should land these changes. No merge or deployment in this agent branch.
