# Changelog

## Unreleased — The Hollow / contact / mix, 2026-11-03

Base: `66fcd65`; branch `codex/hollow-grip-mix-20261103`. [Delivery and evidence](hollow-grip-mix-status-2026-11-03.md).

- Added The Hollow first among five riders, with the exact supplied GLB, baked portrait, readable roster and direct initial actor loading.
- Calibrated actual palm/deck reach on the existing four rigs, directional torso gather, bounded wrist/forearm orientation and eased grab entry/release. Hollow's prior motion is preserved.
- Music ducking follows actual pain/applause duration and releases on reaction silence/mute while preserving independent session cues.
- Prepared hidden bail-liquid/particle and translucent respawn shader variants behind loadout, fixing measured first-bail/respawn stalls without reducing graphics quality. Visibility and material state restore even after failure.
- Focused tests, five-rider runtime verification, soundtrack A/B and three-park CPU/GPU captures pass. No release, Portals synchronization, new modes or installations.

## Unreleased — local polish cycle 2, 2026-11-03

Base: owner-tested `77fbf6d`; branch `codex/evolution-cycle2-20261103`. [Current delivery](evolution-cycle2-status.md).

- Grabs now gather the pelvis/spine/reaching shoulder within measured limb limits; switch Nose/Tail pitch raises the requested end. Feet, colliders and flip paths are preserved.
- Recorded sound gains/tails, contact-voice priority, cue deduplication, ambience transitions and sustained skate loops are refined. Original source audio and rejected-cheer exclusion remain intact.
- Actual composed shaders and speed-dependent wheel-glow variants prepare before play. Resuming discards the paused frame interval so loading work does not consume READY or advance simulation.
- GPU telemetry distinguishes new query results from held/stale values; rendering-only CPU scope is explicit. Capture/audition/profile tools and focused regressions document the changes.
- No release, Portals sync, new mode, dependency or source-model/recording/texture replacement.

## Unreleased — Game Evolution local cycle, 2026-11-03

Base: `f62779d`. Integration: `codex/evolution-cycle-20261103`. [Verification](PROJECT_STATE.md).

- R and toolbar respawn preserve already-earned round score, stance and travelled distance while discarding unfinished tricks. Restart Session still starts a new round.
- Practice-marker/named-spot recovery uses the same contact-safe transaction, preventing teleport landings and retaining canonical stance.
- Rider swap/respawn affects only rider materials; the skateboard stays opaque.
- Switching Manual/Nose Manual retains accumulated difficulty, drift and flatland cooldown instead of refreshing initial assistance.
- Selective bloom refreshes immediately after same-count rider swaps; ordinary faces/clothes stay out of the glow mask.
- Dust/spark viewport sizing uses actual rendering resolution, including sub-native and high-DPI ratios.
- ORBIT no longer displays an incomplete grid of785decorative short-joint bars. Source GLB, real ramp seams/grilles, collision and14 rail paths are preserved.
- Settings Tab/reverse-Tab navigation skips hidden/inert capture controls and reaches the footer.
- Readable tutorial pages use current controls; Flip School controller diagrams follow physical face-button remaps, with explicit fallback text for other controls.
- Tutorial text explains existing overtime. HUD/menu sound toggles share the runtime state.
- Browser title uses the game identity rather than a legacy park name; the viewport's accessible description points to current tutorial controls instead of hardcoded defaults.
- Added behavioral/actual-asset regressions, production browser QA, technical profile, architecture, scorecard and prioritized roadmap. No new assets/dependencies/modes.

Earlier released changes and evidence remain in [AAA polish status](aaa-polish-status.md), [round2 status](audit-round2-status.md) and the Git history. This local cycle has not been merged, deployed or synchronized to Portals.
