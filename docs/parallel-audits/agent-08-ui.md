# Agent 08 — UI, input and audio audit

Date: 2026-10-09  
Baseline `main`: `ff33677541f61b803901ac37c2465226799ec8a3`  
Branch: `audit-fix/08-ui-input-audio`  
Owned scope only. No main edits, merges, deployments or renderer bootstrap edits.

## Confirmed findings / changes

| Severity | Area | Finding | Correction |
| --- | --- | --- | --- |
| High | Loadout | Movement was spatial only on selection screen; other menus collapsed left/right into linear movement | Consistent keyboard and gamepad axis handling; spatial grid navigation and vertical fallback |
| High | Gamepad | Menu focus restoration could interpret held inputs as newly pressed after tab focus changed | Seed controller edge state on focus acquisition; still sample state while unfocused |
| High | Reconnection | Gameplay input could register a held gamepad button as a new press when a controller reconnected | Track controller identity; initialize edges from physical button state on connection |
| High | Custom rider upload | A four-byte GLB magic check accepted wrong versions and inconsistent lengths; custom rider was silently confirmed | Verify GLB 2.0 length, JSON chunk tag and alignment; require explicit rider selection |
| Medium | Title UI | Artistic image had completely invisible interactive hit targets | Visible text inside art-aligned title buttons and clear keyboard focus styling |
| Medium | Audio | Rapid track skipping could leave an old play promise blocking new playback, and stale rejections could change the displayed song state | Generation-scoped asynchronous play and source replacement; robust error handling |
| Medium | Music | Shuffle could immediately repeat the previous track at cycle boundaries | Shuffle avoiding adjacent repeat with all valid tracks |
| Medium | SFX | Several transitions in a physics frame could generate multiple impact transients | 75 ms transient cooldown and quieter takeoff pop |
| Medium | Audio resources | No shutdown mechanism for synthesized loops and music listeners | Idempotent `dispose()` methods |
| Medium | Compact layout | Loadout/tutorial text and actionable controls could be very small on short/narrow viewports | Font clamps, minimum button sizes, scroll support, compact viewport rules |

## Gameplay UI coverage

- **Title / Start / launcher:** visible accessible title hit targets; disabled Start until ready. Launcher URL unchanged.
- **Rider and deck:** explicit confirmation preserved for both; eight board finishes preserved without changing `LoadoutCatalog.js`.
- **Location:** only available locations selectable; data and availability unchanged.
- **Tutorial:** arrow navigation, shoulder/left-right page turns and B/Escape back preserved; smaller viewport table scroll enabled.
- **HUD / timer / results / restart / pause / options:** HUD/gameplay rendering not modified; menu focus and button sizes improved, existing timer/results semantics preserved.
- **Loading/error:** existing status copy retained; invalid uploaded GLB shown as a nonfatal status message.
- **Trick guide:** existing behavior preserved; no duplicate modal introduced.

## Validation

New regression tests:
- `tests/agent08-input-menu.test.mjs`: GLB header checks, stick tap hysteresis, 2D menu geometry, keyboard one-shot actions, gamepad disconnect/reconnect edges
- `tests/agent08-audio.test.mjs`: adjacent song repeat avoidance, master volume persistence, rapid skip races, failed tracks, SFX toggles and transient cooldown

Run: `npm ci && npm test && npm run verify:physics && npx vite build`.

PR #11 validation, second run (`37918190040`): **354 tests, 352 passed, 2 failed.** Every new Agent 08 regression test passed. The two remaining failures belong to unchanged physics tests: `tests/grind-manual.test.mjs` (low-speed grind capture) and `tests/ground-motor.test.mjs` (park carve steering). Both files and their implementation dependencies are outside Agent 08 ownership. The gated production bundle and Chromium browser smoke jobs were skipped because the global unit-test job was unsuccessful.

The existing `Phase 1 Core CI` workflow runs unit/replay tests, physics verification, production bundling and a Chromium browser smoke job when a PR targets main. **Live hardware gamepad testing is not claimed.** Browser layouts at 1920×1080, 1366×768, 1280×720 and compact widths still require a human visual pass or dedicated screenshots; CSS breakpoints were reviewed and adjusted.

## Integration notes

1. Merge this branch only after all CI checks pass; retain Agent 08's changes as a unit.
2. Agent 09 (QA) should test native Xbox/PlayStation controller reconnects, long-hold inputs, keyboard/gamepad switching and the four requested browser resolutions.
3. Agent 05 (rig) should own deep binary parsing, texture resource budgets and skeleton validation; the new GLB preflight is deliberately shallow and not a security boundary for parsing arbitrary 3D data.
4. If an integrator implements global pause/audio management in `game-main.js`, reuse `MusicPlayer.dispose()` and `SkateAudio.dispose()` on application teardown; intentionally no changes made to that entrypoint.
5. Location changes stay with the location agent. `LoadoutCatalog.js` is untouched.
