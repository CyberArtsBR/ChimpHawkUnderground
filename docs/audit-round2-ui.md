# Chimp Hawk UI audit — 29 October 2026

Baseline: standalone `fcdd864`. Scope: title, rider/deck selection, Tutorial / Flip School, pause, options, graphics, results, keyboard/gamepad navigation and practice onboarding.

## Confirmed issues and implemented changes

1. **P1: tutorial shortcut bypasses loadout confirmation.** Choose Practice or Start Game, press H in the rider/deck selector, then close Flip School. The old `closeTutorial()` started the pending session directly, without calling the selected loadout loader or requiring rider/deck confirmation. Tutorial closure now returns to its originating screen. Only the existing confirmed loadout action starts that session.
2. **P2: original tutorial cancels practice intent.** From that same selector, press H, choose Next: Controls, then Escape. The old `back()` cleared `pendingMode`; completing selection afterward started a timed session. Returning from the guide now retains the selected session mode. Both timed and practice variants have regression coverage.
3. **P2: Tab could leave the active game menu.** Added forward/backward Tab wrapping across enabled menu buttons and native rendering-details disclosures. Browser Ctrl/Meta/Alt+Tab shortcuts remain untouched; gameplay Tab is not intercepted. Disclosure Enter/Space activation remains native. Arrow/gamepad navigation remains unchanged.

## Existing strengths retained

- Tutorial opens Flip School first, with the original guide still available. No duplicate title-screen Flip School button.
- Existing keyboard Enter/Space activation, gamepad edge detection, selection scrolling, focus outlines and reduced-motion styles.
- Practice tools remain optional and live in pause; the playfield is not covered by another mandatory tutorial overlay.
- Graphics controls explain the 144 FPS target and its hardware dependence, with glow and smoothing choices exposed separately.
- Results already distinguish banked trick points, achievement bonuses and bail penalties.

## Validation

`node --test tests/tutorial-flip-first.test.mjs tests/agent08-input-menu.test.mjs tests/game-shell-session-results.test.mjs`: **16 passed**. Includes both new regressions, practice/timed tutorial returns, Tab wrap, browser shortcut bypass, existing controller edge behavior and session/results rules.

Browser regression: `node tools/audit-round2-ui.mjs`: **passed**, with no captured JavaScript errors. Validated both tutorial return paths, disabled unconfirmed session start, preserved practice mode after actual loadout, Tab/Shift+Tab wrapping, native graphics disclosure activation and absence of a title-screen Flip School duplicate. Captured and visually inspected `artifacts/audit-round2/ui/loadout-return.png` and `practice-preserved.png` at 1280×720: controls fit, focused buttons are clear, and the unconfirmed start remains disabled. Initial server connectivity failures were resolved before this successful run. The tutorial's final button also now names its actual destination rather than promising to start skating.

## Remaining improvement opportunities and limits

- Complete input remapping is a separate input-system project; dead-zone presets are available but are not remapping.
- Real controller comfort, screen-reader output and couch-distance readability still need hardware/player review. Programmatic keyboard tests cannot certify these.
- Existing title/loadout styling is retained; this pass fixes state and navigation defects rather than changing the approved art direction.
- Mobile support is intentionally out of scope, per the user's PC/gamepad-only decision.
