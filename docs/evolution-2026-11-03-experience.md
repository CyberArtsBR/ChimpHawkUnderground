# Experience review — 2026-11-03

Baseline: `f62779d`. Owner: `/root/evolution_experience` (UI/UX, tutorial, accessibility, audio, session flow, persistence). Source review plus Node regression tests; lead owns integrated browser screenshots and local production build. Game Studio `game-ui-frontend` skill applied. This report does not claim new listening or physical-controller approval.

## Findings and controlled changes

| ID | Baseline issue / reproduction | Severity | Decision and acceptance |
|---|---|---|---|
| EX-01 | Open Player Settings, Tab through the controls to Reset Default Controls, then Tab toward Back. `GameShell.key()` included hidden binding-capture actions in its Tab route; focusing the hidden element fails and repeated Tab retries the same element. | P1 | Implemented shared availability filtering for disabled, hidden and inert targets. Acceptance: forward/reverse Tab crosses the hidden dialog to footer, wraps, and retains native details-summary behavior; arrow/controller navigation excludes the same unavailable targets. Automated regression passed; browser check lead-owned. |
| EX-02 | Rebind Flip, Ollie or directions in Settings, then read the tutorial detail pages. `TutorialPages.js` still taught fixed arrows/Space/WASD/X/A even though gameplay and Flip School step text used remaps. | P2 | Implemented all readable pages from current bindings and regeneration when the guide opens. Covers directions/diagonals, flip/grab/grind, balance corrections, flatland pairs, wall actions, spin, camera and practice markers. Poster is explicitly a default-controls overview, followed by “YOUR CONTROLS”. Acceptance: persisted and current live maps produce matching instructions. Fixed menu navigation remains fixed. |
| EX-03 | Rebind Ollie to Y and Flip to B; enter Flip School. Labels changed but the highlighted circles remained physically at A and X. | P2 | Implemented physical face-button mapping for both controller label modes, using compact PlayStation symbols. Nonface or unassigned actions hide the incorrect face highlight and show explicit text instructions instead. Live in-memory bindings are passed through, including when storage is blocked. Acceptance: button positions are correct for all four face positions; shoulder/trigger/stick/D-pad/null never appear at a false face position. Browser layout check lead-owned. |
| EX-04 | Toggle `#sound-toggle` in the skating toolbar, then inspect Options → Skate Sounds. Toolbar changed `SkateAudio.enabled` without updating `GameShell.sound`; menu toggle did not update toolbar text/ARIA either. | P2 | COMPLETED — lead integrated one sound-state update path for runtime, shell and toolbar. Actual browser verifies HUD off → menu off → menu on → HUD on, including persisted state/ARIA. Integrated evidence: [PROJECT_STATE](PROJECT_STATE.md). |
| EX-05 | Final tutorial page said the timer simply stops at 00:00, omitting the existing active-attempt grace period. | P3 | Updated copy to match `SessionFlow`; no timer, score or game-rule changes. |

Dependencies: EX-02/03 use the existing sanitized `ControlBindings` and `SkateInput` contracts. `SkateInput.read()` uses remapped spin and direction actions for practice-marker chords. A real input test swaps spins onto LT/RT and directions onto D-pad left/right, verifies mark/return edges and suppression of drive, and checks tutorial text. Direct marker bindings are shown when present; an incomplete chord is described as unassigned rather than teaching an unusable shortcut.

Implementation complexity: EX-01 low; EX-02/03 medium; EX-04 low; EX-05 low. Risks are tutorial content density, controller diagram overflow, and stale UI state after changing settings. Existing layout, art, controller navigation, game rules and no-mobile scope are retained. No dependencies installed, assets regenerated, recordings added, new modes added, merges or deployments performed by this workstream.

## Audio and session assessment

The rejected `crowd-cheer.ogg` remains absent from active sample banks. `SkateFoley.js` uses the retained applause recording for three intensity bands; this is a limited palette, not three different crowd performances. The voice bank remains shared across riders. A future authored voice palette and distinct restrained crowd variations could improve identity, but require a specific recording/source choice and human listening; no generic replacement was introduced here.

Recorded skate effects, independent effects/announcer/crowd/voice volumes, accepted-combo reaction gating, ORBIT audience suppression, background behavior, music skipping and versioned park records are present. `SessionFlow` explicitly separates ready, play, overtime and finish. These systems have meaningful automated coverage; tests do not certify timbre, emotional delivery or final mix on speakers/headphones.

## Bounded scorecard

Scores describe this reviewed desktop subsystem on the baseline, not an AAA certification. No after-score is raised before lead browser verification and owner listening.

| Discipline | Baseline / 10 | Evidence / confidence |
|---|---:|---|
| Menu/UI usability | 7 | Established layouts/controller routes, but confirmed hidden-dialog keyboard trap. Source + navigation tests; medium confidence. |
| Tutorial quality | 6 | Twelve synchronized flip lessons and readable tables; confirmed mismatched remaps and inaccurate diagram positions. Source + binding tests; high confidence for these defects. |
| Accessibility | 7 | Text scaling, high contrast, keyboard routes and system reduced-motion support exist; keyboard trap prevented complete traversal. No fresh screen-reader or disability playtest. |
| Audio | 6 | Real skate recordings and bounded reactions, but shared voice/crowd palette and owner feedback “sounds need more work”. No fresh listening; provisional rating. |
| Session flow / feedback | 8 | Existing ready/overtime/results/replay contracts and regression coverage; tutorial overtime-copy mismatch. No new full physical play session. |
| Persistence/settings reliability | 8 | Binding validation, corrupt/blocked storage fallback and versioned score records tested. Toolbar/menu sound-state duplication remains an integration defect. |
| Mobile compatibility | N/A | User explicitly chose PC/keyboard/gamepad only. |
| Multiplayer | N/A | Main-build experience reviewed here; separate Portals integration is not changed in this cycle. |

## Verification and changed files

- `src/game/GameShell.js`: available focus targets, current-control guide regeneration, live binding handoff to Flip School, default-poster clarification.
- `src/game/TutorialPages.js`: binding-driven instructions and overtime explanation.
- `src/game/FlipSchool.js`: mapped face-button positions, nonface textual fallback, compact PlayStation symbols.
- `tests/evolution-experience.test.mjs`: hidden/inert/footer traversal, persisted tutorial mappings, actual remapped marker input behavior, diagram positions and nonface fallback.
- `artifacts/evolution-experience-focused.log`: 22 focused tests passed, zero failed.
- `artifacts/evolution-experience-audio-flow.log`: 29 independent audio/session/persistence tests passed, zero failed.
- `git diff --check` passed for owned source/test files.

Next priorities: lead browser checks at 720p/1080p including remapped nonface fallback; finish shared sound-state integration; owner audition for voice/applause/skate mix; later use real controller play sessions to validate first-time learning rather than infer it from DOM and unit tests.
