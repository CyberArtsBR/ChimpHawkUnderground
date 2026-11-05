# Chimp Hawk local patch: testing guide

This patch is local and intended for player review. The 144 FPS preset and glow remain available; actual frame rate depends on the computer and display.

## Try the changes

1. Open Tutorial from the title. Flip School appears first. Choose Next: Controls and use Enter or the controller to navigate the original guide.
2. Watch the Inward and Varial Heelflip lessons, then perform them in Free Practice. Compare the board's turn, the catch and both feet in regular and switch stance.
3. In Free Practice, save a grounded marker with M or LB + RB + D-pad up. Return with N or LB + RB + D-pad down. Test it on a slope and after a bail.
4. Pause Free Practice and enable Practice Drills. Land and bank each requested trick. Bails should not complete a drill. Disable drills from the same pause menu.
   Enable Input Display in that menu to see recent skating actions while practicing.
5. In Options, cycle the stick dead zone. Use the smallest value that does not drift on your controller. This affects gameplay and camera axes, not menu or direction-tap thresholds.
6. In Options → Graphics, compare optional 144 FPS edge smoothing on and off with glow enabled. Check both edge quality and frame rate on your own display.
7. Ride several lines on every park, especially coping and bowl returns, with neutral, flip, grind, brake and deliberate exit input. Report the park, obstacle, approach and held controls for any freeze.

## Art direction criteria

- Keep Warehouse warm and industrial, ORBIT blue/violet and Skate Paradise concrete-led. Give obstacles and landing paths more contrast than decoration.
- Reserve the brightest neon for useful rails and coping. Avoid decorative light that hides a landing edge.
- Keep deck, feet, coping and landing zone legible at normal camera distance. Check in motion as well as in stills.
- Preserve the rider's established proportions, automatic propulsion and existing controls. Confirm new motion at takeoff, mid-flip, catch and sloped landing in both stances.
- Prefer restrained wear and consistent material scale; do not move collision geometry for a cosmetic change.

## Remaining validation

Automated tests cannot approve skateboard feel, physical controller comfort, every rider's contacts, all coping paths or sustained performance on other GPUs. A full reference-led animation and park-art pass, real-player tuning, sound mix review, control remapping, and wider hardware testing remain separate work.
