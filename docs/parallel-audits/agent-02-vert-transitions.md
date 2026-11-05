# Agent 02 — AAA vert / transition physics handoff

**Branch:** `aaa/02-vert-transitions`  
**Base:** `17259ec6f5dc8eb1aee0ba449b3db84e90a814f9`  
**Status:** Source changes and regression/diagnostic scripts committed. **Not merged or deployed.** No map, character, board, camera or Agent 01 modules modified.

## Implemented

| Concern | Baseline | Agent 02 change |
| --- | --- | --- |
| Diagonal quarter/halfpipe/bowl launches | Incoming speed included lateral travel in climb, then clipped along-coping speed to 1.1 m/s | Exclude real lateral speed from climb projection; retain along-coping vector. Rebalance vertical component against the existing launch energy budget |
| Near-vertical takeoff | Entire XZ radial velocity set to zero for passive return | Retain a *small slope-dependent* outward radial component (at most 1.65 m/s) on steep coping; shallow normals retain existing return behavior |
| Return flight | Lateral motion hard-clipped at 1.4 m/s and radial at 2.4 m/s per frame | Keep genuine diagonal lateral motion; never reverse direction just to revisit takeoff; corrections are acceleration-limited; retain gravitational Y unchanged |
| Deck-target steering | 24/36 m/s² horizontal correction during ascent/descent | 6/9 m/s² corrections; conserve Y and apply bounded horizontal steering in fixed steps |
| Transfer abuse | Up exit accepted with very little approach energy; staged transfer could produce a deck launch from almost nothing | Require credible takeoff speed/rise and abort low-energy deck planning to return without upward impulse |
| Wrong transition | Coping candidate could select a nearby nearly perpendicular crossing rail | Reject candidates whose rail tangent is inconsistent with the measured slope normal |
| Verified transfer reentry | Emergency original-wall sweep could catch a rider already headed for a verified deck | Original-wall emergency sweep is disabled during active verified deck transfers; deck support owns landing |
| Diagonal reentry | Same-wall support was rejected outside 1.55 m from original takeoff point | Match real authored coping segments and their endpoints while still requiring original-side surface normal, radial depth and height |
| Pump on hard seams | Large wheel-normal discontinuities qualified as curved transition compression | Reject incoherent curvature above 0.48 radians while preserving real bowl/quarter pumping and landing-window timing |
| 180/360 | Legacy auto-yaw and landing orientation are already handled by a distinct orientation authority | Preserve existing player-only spin/heading logic; no automatic turnaround introduced |

### Physics model and ownership

The vertical launch envelope and gravity remain owned by `TransitionController`. Start-of-air kinetic budget: `v_launch² <= v_inbound² + (0.72 * boost)²`. Near-vertical ramp return permits controlled finite outward drift; it never teleports the rider onto a return line. `VertReturnFlight` corrects velocity in the local ramp/coping plane and leaves Y ballistic. The reentry matcher uses the source transition's authored lip path instead of treating the original launch point as the entire landing rail. `TransferFlightResult` applies a limited horizontal acceleration, not scripted XZ teleportation.

The low-energy transfer guard is applied only to the post-takeoff transfer plan. This *does not* override genuine collisions or wheel contacts. The original same-transition wheel-sweep/continuous-sweep support rules remain the landing authority. Existing pump timing, compression, cooldown, and hard-cap policy in `PumpSystem` remain unchanged, but its curvature eligibility now excludes hard seams. The phase-one runtime consumes this pure helper in `StatefulSkillStreetPhysics` (outside Agent 02 ownership). Pump speed limits should be jointly reviewed with Agent 01 before integration.

### Deterministic verification

```bash
npm ci
node --test tests/agent02-vert-momentum-regression.test.mjs
node --test tests/agent02-transition-flight.test.mjs tests/agent02-pump-launch.test.mjs
node --test tests/transition-trajectory-parity.test.mjs tests/transition-reentry-result.test.mjs
node --test tests/transfer-launch-result.test.mjs tests/transfer-flight-result.test.mjs
node --test tests/ramp-launch-height.test.mjs tests/warehouse-geometry.test.mjs
node tools/agent02-vert-trajectories.mjs
npm run build
```

New regression scenarios: fast straight/diagonal approach, opposite halfpipe wall, curvature-dependent departure, shallow lip rejection, 60/120 Hz trajectory parity, weak/unsupported transfers, aborted returns, bounded deck-target acceleration, high lateral speed without snap, crossing lip normals, hard-seam pumping rejection, authored-span diagonal reentry, original-wall sweep exclusion for verified transfers. Existing landing/rotation tests independently cover passive same-wall fakie, deliberate 180/360, early-flip auto-catch and rejected alignments.

`tools/agent02-vert-trajectories.mjs` emits deterministic 120 Hz JSON for quarter straight/diagonal, halfpipe opposing and 180-motion cases, bowl pocket, mini ramp, and a planned verified transfer. Report fields include incoming/launch speed, launch vertical speed, apex rise and time, first descending lip-plane crossing, lateral displacement and return error. **Lip-plane crossing is not a confirmed landing**; real GLB contact/collision must still be replayed.

### Representative pure-model trajectory check

A lightweight fixed-step cross-check evaluated the committed transition functions with equivalent Vector3 arithmetic (not the production Three.js runtime). At 120 Hz, after 0.8 seconds:

| Scenario | Launch velocity X/Y/Z (m/s) | Position X/Y/Z (m) | Velocity X/Y/Z at 0.8 s (m/s) |
| --- | --- | --- | --- |
| Fast diagonal vert (normal Y 0.20) | +5.20 / +8.59 / -1.45 | +3.67 / +2.29 / -0.01 | +3.19 / -7.41 / +1.39 |
| Straight quarter (normal Y 0.45) | 0 / +7.88 / 0 | 0 / +1.72 / +0.30 | 0 / -8.12 / +0.02 |
| Reverse-diagonal pocket (normal Y 0.24) | -4.10 / +8.52 / -1.19 | -3.01 / +2.23 / +0.13 | -2.89 / -7.48 / +0.73 |

The fast diagonal keeps its *positive* along-coping velocity rather than reversing toward the takeoff point. Authored-span support accepts a matching same-wall contact at X=3.5 m and rejects one beyond the coping endpoint at X=6.1 m. These are algorithm-level diagnostics, **not** measured real-map wheel landings, and the bundled trajectory runner remains the reproducible source of truth for actual Three.js output.

### Map-coverage notes

The repository has authored transition rails in the Rooftop manifest and in the Foundry `createWarehousePark` geometry. The variant loader reuses the Foundry rail/physics contract and, for certain imported warehouses, may replace rideable collision and discovered rails. Therefore synthetic trajectory tests do **not** prove all ramp positions in the Rooftop, Foundry, TRON, Grand or Urban visuals. Integration QA must run the actual loaded map variants, including each revised GLB, and check quarter/halfpipe/bowl/spine/transfer support and clearance. Map meshes and GLBs were not changed here.

### Integrator contract

1. Integrate Agent 01 ground-momentum changes **before** retuning pump speed limits; do not overwrite `GroundMotor.js`, `TravelState.js`, `src/character/**`, camera files or park geometry.
2. Review the full branch diff against the recorded baseline. The agent branch is based on an older immutable SHA: **do not merge the whole branch as a reverse update of recent `main`**. Cherry-pick/rebase only reviewed owned-file changes onto a current integration branch.
3. Verify the shared takeoff/landing contracts in `StatefulSkillStreetPhysics.js` and `RampWallSafetySkillStreetPhysics.js`. These are outside this agent's owned files and were not modified.
4. Replay a stationary Up-tap, low-speed coping, fast diagonal bowl pocket, fakie return, opposite halfpipe wall, abort at apex, 180 and 360 landings, and transfer toward a deck with no width. Check that no unsupported airborne support becomes grounded and that there are no bails from ordinary aligned touchdowns.
5. Record trajectory output for each real location and measure contact clearance, peak rise, time to actual wheel contact and penetration. This session could not execute the repository's Node/GLB test suite through the GitHub connector; do **not** label these tests passing until CI or a checkout runs them.

### Release gates

- All old and new physics tests green (update legacy zero-XZ assumptions only if physical behavior is deliberately accepted).
- No new instant horizontal impulse; no energy injected on low-speed transfer; no air yaw without deliberate turn.
- All four-wheel support and edited warehouse variants checked against live collision; no clipping.
- Profile 60/120 Hz stability and runtime allocation before any merge/deploy.
