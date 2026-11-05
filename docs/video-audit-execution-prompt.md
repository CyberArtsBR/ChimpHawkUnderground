# Executable follow-up prompt — StreetSkate audit-to-fix release

You are the principal engineer for `CyberArtsBR/StreetSkate` (Vite/Three.js). Start from current validated `main`; first read `docs/video-audit-2026-10-08.md` and inspect current repository history. No assumptions based on an older commit. Target feel: Tony Hawk's Underground, but no copied assets, decompiled source, or proprietary animations.

The user authorizes resolving routine technical details without asking. Preserve working gameplay and do not claim test success without running checks. Use one integrator to coordinate geometry, ramp physics, camera, animation, QA, visuals.

1. Reproduce user video time codes 00:34–00:44 (high camera pitch) and 02:20–02:40 (possible AIR/focus/grind stall). With QA overlay active, capture state, input, momentum, camera pitch and collision clearance. Distinguish observation from root cause.
2. Verify 10 no-input bowl airs per direction with behind-follow camera; do not use camera orientation to alter world-space heading. Ensure camera behind intended descent before contact, without top-down occlusion or camera clipping.
3. Test land-on-lip and four-wheel solver with zero steering. Add replay capturing pose, direction, normal, rail/coping, velocity and contact at each 1/120 s. Stop any 90-degree presentation/heading snap without intentional spin.
4. Evaluate energy: pushing, friction, pump phase, vert impulse, kinetic-to-potential conversion and correct re-entry. Fix proven discontinuities, not merely 00 km/h at apex. The game must climb reasonable small ramps at healthy approach speed.
5. Test grinds with varying approach speeds, angles and heights; explicitly verify low-speed stall escape, magnetic recapture cooldown and consistent rail contact height. Use real rail geometry and physically feasible balance.
6. Material/art pass: focus playable ramp, pool and mega readability; add convincing plywood grain, support structures, coping wear, graffiti decals, legible zone differentiation and high-quality PBR roughness variation while keeping visual and collision meshes separate and bounded draw-call count.
7. Character/board visual audit: rider T-pose must never surface, foot placement and truck/wheel contact must remain coupled, pop/flip/grab/grind landing animations blend without yaw injection.
8. UI: QA/F3 panel usable on mobile/desktop; focus-paused indication must be visible; improve controls hints and readable HUD.
9. Automated gates: `npm ci`, `npm test`, `npm run verify:physics`, `npm run build`, browser smoke, determinism at 30/60/120 fps. Save screenshots/logs. Create focused regression tests for each fixed bug.
10. Integrate only if all critical gates pass. Publish through guarded PR into main, verify deploy independently; document exactly what was tested and what remains for manual gameplay on a real controller.

Required deliverables: updated source and tests, audited before/after snapshots, reproduction steps, pass/fail matrix, final commit hash and a readable changelog. Never say 'no bugs' without evidence.
