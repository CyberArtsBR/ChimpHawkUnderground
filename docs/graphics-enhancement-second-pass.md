# Visible UI presentation pass — 2026-10-11

The supplied 157.4-second, 1280×720 recording shows the local first-pass candidate, including its current map thumbnails and compact HUD. The limited perceived improvement was not caused by viewing production. The first pass left the main menu composition and small avatar cards mostly unchanged; the infographic described implementation rather than demonstrating a substantial visual upgrade.

## Implemented following the recording review

- A large selected-rider feature replaces the small selection note. It shows the chosen existing character with a clear name and subtitle; four compact roster buttons remain available. Choosing another rider updates this feature using the cached preview, without adding a live 3D render loop.
- Desktop loadout composition uses the available width and a stable action row. All three map cards and the session-start action remain visible in the reviewed 1280×720 viewport. The footer stays available during scrolling on smaller layouts.
- Deck cards have larger previews, clearer finish labels and consistent card treatment. Narrow layouts stack the sections.
- Pause, options, results and graphics controls use a coherent readable typeface, quieter surfaces, clear focus and a gold primary action. Decorative owner-supplied graffiti remains.
- Banked score receives an explicit BANKED label.
- Selective actor bloom now admits emissive details rather than every costume surface. Board glow and authored emissive features remain eligible; ordinary fabric/face highlights are masked out of the bloom pass. Materials are restored after the pass, including renderer failure.

## Verification and limits

Production build passed. Only the four focused selective-bloom tests were run for this follow-up; all passed. Browser inspection verified rider/board selection, the unlocked session action, gameplay BANKED label and pause controls. Evidence: `artifacts/graphics-enhancement/loadout-pass2.png` and `pause-pass2.png`.

This is a UI and rendering presentation update, not a reauthoring of character meshes or texture artwork. No map geometry, collision, respawn flashing, controls or camera behavior was changed. The translucent frames in the recording can include the existing respawn opacity flash; this pass does not claim to remove that gameplay signal. 144 FPS remains unmeasured. Changes remain local and have not been deployed.
