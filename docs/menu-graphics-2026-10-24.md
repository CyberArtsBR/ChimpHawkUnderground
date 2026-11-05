# Menu graphics pass

The rider/deck/park selector and pause, options, and graphics menus now share a skate-poster treatment: larger character artwork, photographic park cards, restrained panel accents, clear chosen/focused states, and stronger primary actions. Options groups session and audio controls, with visual meters for the existing volume buttons.

The title screen's markup, artwork, hit targets, and original styles are unchanged. New CSS is scoped to selection, pause, options, and graphics screens. Existing local artwork is reused; this pass adds no image downloads, packages, or animation loops.

## Changed source

- `src/menu-graphics.css`: scoped layout and presentation, focus and reduced-motion states, responsive rider-name sizing.
- `src/game/GameShell.js`: menu artwork frame, section headings, volume meters, and selection readiness indicators. Existing input actions remain in place.
- `src/game-main.js`: imports the menu stylesheet. Other changes in that file belong to the earlier 3D visual pass.

## Verification

- 49 existing targeted tests passed: menu input/navigation, audio, portrait lifecycle, graphics presets, session results, and graffiti/title regressions.
- Desktop browser checks: selection at 1044 × 884; options at 1280 × 720; pause/options/graphics/back/resume flow in Grand Warehouse.
- Adolescent's name fits on one line in the narrow desktop card; all rider and deck images load.
- No warnings or errors reported by the browser console during the final session.
- Production build passed after the last CSS adjustment. Existing bundle-size and GLTFLoader import warnings remain.
- Title markup comparison passed; no existing stylesheet was edited. `git diff --check` passed.
- Final validation was kept to desktop at the user's request; the preview viewport override was reset.

Screenshots, test/build logs, and verification JSON are saved in `G:/Streetskate/artifacts/menu-graphics-2026-10-23/`. The build is in its `final-build/` folder.

Release targets are `main` for Render and `fix/portals-bundled-fonts` for the owner's manual Portals sync. Preserve each branch's existing title screen and Portals-specific actions when integrating this pass.
