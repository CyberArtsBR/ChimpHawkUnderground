# StreetSkate Agent 02 — Vert, transition, bowl and pumping

## Baseline / ownership
- Branch: `audit-fix/02-vert-pumping`
- Baseline: `ff33677541f61b803901ac37c2465226799ec8a3` (2026-10-09)
- Shared ground motor, collision, camera, initialization and package scripts: **untouched**.
- Target runtime is the canonical `TransitionController`, `VertReturnFlight`, `LaunchEnergyModel` and `PumpSystem` path.

## Highest-value findings and fixes
1. **Launch energy could be fabricated by shallow faces.** `TransitionController.begin` converted 82–99% of non-lateral approach speed into vertical launch even on moderate slopes; it additionally imposed a 2.5 m/s minimum jump on weak takeoffs. Vertical launch now uses the slope-supported component of actual approach velocity and an explicit single boost budget. It cannot exceed the kinetic budget implied by incoming velocity plus the authored impulse. Strong approaches to near-vertical faces still create useful airtime.
2. **Return flight felt horizontal-locked.** `VertReturnFlight` previously tried to pull the skater to one XZ target on every airborne frame and rapidly damped lateral movement, even while ascending. Return guidance is now a limited, proximity-weighted acceleration, with a light ascent assist and stronger descent assist. It keeps world-Y ballistic, leaves lateral speed unchanged while inside the tolerance corridor, and never teleports the rider.
3. **Transfer steering ignored scanned deck speed.** `TransitionController.advance` repeatedly targeted a hard-coded speed via 30 m/s² correction. It now consumes the actual deck plan when available and limits steering correction to 8 m/s². Late explicit transfer input still works; holding forward does not request a transfer.
4. **Marginal low-speed climbs could earn full launch bonuses.** `LaunchEnergyModel` now fades out bonus energy for nearly stationary/low-rise slope-seam samples. Existing strong-quarter/bank boosts and expiry of climb-memory remain intact.
5. **Poorly timed pump releases could still add speed.** `PumpSystem` narrows the useful timing envelope and rejects near-zero-quality impulses, while preserving smaller rewards for slightly early/late inputs. Existing cooldown, charge consumption and soft/hard speed caps are retained. No second pump authority is introduced.

## New deterministic scenarios
- `tests/agent02-pump-launch.test.mjs`: curved bowl/quarter eligibility, early/ideal/late timing, energy and speed caps, weak approach suppression, launch memory.
- `tests/agent02-transition-flight.test.mjs`: mini/quarter/vert/bowl semantic setups, measured slope-vs-launch energy, normal/frame stability, no position teleport, bounded return/transfer, 60/120 Hz comparison and crossing a **synthetic** landing plane.
- Existing canonical trajectory/re-entry, deck catch, pump replay and vert/pumping verifier tests must also pass. Synthetic landing-plane checks are **not** proof of full collision/4-wheel landing success.

## Intentional constraints / integration
- No changes to `StreetPhysics.js`, `StatefulSkillStreetPhysics.js`, `GroundMotor.js`, `ParkCollision.js`, `CoreSkateController.js` or `TransferLaunchResult.js`. These modules own contact, final touchdown and launch composition.
- Existing `tools/verify-vert.mjs` still uses the *legacy* `TransitionGuide` rather than the canonical controller; this is a verification coverage gap and should be addressed by the integration owner, not by editing unowned files here.
- Legacy trajectory parity asserts zero **initial** radial XZ launch and the original 0.30 m return target. Those contracts are intentionally preserved. The new return system provides bounded dynamic correction without changing them.
- Pump release timing is processed in `StatefulSkillStreetPhysics.js`; this branch does not alter its event or cooldown semantics. To fully prevent a duplicate impulse in the broader hierarchy, integration QA should inspect actual input receipt count across one frame.
- Strong artificial transfers on very narrow deck corridors can still fail without changes to the shared `TransferLaunchResult` policy; this branch deliberately avoids unsafe cross-agent edits.

## Review checklist
Run:
```bash
npm ci
npm run test:vert
npm run test:pump
node --test tests/agent02-*.test.mjs
node --test tests/transition-trajectory-parity.test.mjs tests/coping-transfer-replay.test.mjs tests/phase1-scenario-replay.test.mjs
npm run build
```
Check bowl pockets, quarter re-entry, carving losses, fake/regular heading consistency and landing/bail telemetry in the live *local* build before merge. Do not deploy as part of Agent 02.
