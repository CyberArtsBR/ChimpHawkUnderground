# Stance, crouch and flip review

Reviewed the user's 02.53.19 recording of StreetSkate and the 03.01.05 / 03.03.06 skating references. The game recording uses The_AdolescentUR and predates the earlier wrist/knee correction deployment. The references show readable preparation, takeoff extension, distinct foot flicks, tucked knees, catches and landing compression.

Changes:

- Solve hip height from each actual upper/lower leg chain and the final ankle anchors. Charged crouches now bend both knees to about 120 degrees, move the hips backward and pitch the chest forward in the avatar's anatomical plane.
- Use shoulder geometry for facing direction when imported straight knees provide only rounding noise. This corrects Tux's ambiguous knee plane.
- Extend out of the charged crouch during the existing ollie pop phase, then gather the knees for flight. Preserve landing impact compression.
- Animate the rear foot snap separately from the front foot drag/flick, with distinct kick/heel direction and asymmetric tuck. Feet remain in the skater's frame during deck rotation and blend back onto the deck at catch.
- Remove the current trick's final yaw as well as previous shove yaw from catch targets. Completing a 180 shove no longer crosses the leg anchors.
- Open the arms for airborne balance while retaining bounded reach and neutral local wrist orientation.

Validation:

- 566 Node tests pass, including 12 new regressions against all five actual character GLBs. Checks cover crouch depth, knee direction, shoe contacts, regular/switch catches, 180/360 shove yaw and finite bone rotations.
- Chrome rendered 25 poses across all five avatars. Measured charged hip drops: Adolescent 23.6 cm, Heretic 27.1 cm, Anchor / TheanchoURi 21.3 cm, Tux 16.7 cm. Head height also visibly decreases.
- A 165-frame browser simulation exercises the shipping skater input/physics/presentation path: hold ollie, release, kickflip and landing.
- Production Vite build succeeds. Existing bundle size/code splitting warnings remain.

These are original procedural poses on the existing rigs. The recordings are visual references; no commercial animation data or character assets were extracted or copied.

Reproduce browser checks with `tools/rider-animation-browser.mjs` (set PLAYWRIGHT_MODULE when using the bundled desktop runtime). JSON telemetry and rendered captures are written to the ignored/untracked `artifacts/collision-audit` directory.
