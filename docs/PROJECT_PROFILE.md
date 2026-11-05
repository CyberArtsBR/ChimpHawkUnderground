# Project profile — Chimp Hawk / StreetSkate

Discovered from source on 2026-11-03. Release baseline: `f62779d`; the current local pass follows `66fcd65` on `codex/hollow-grip-mix-20261103`. [Current state](PROJECT_STATE.md).

| Area | Actual implementation |
|---|---|
| Game / audience | Arcade street skating: timed 90-second runs, unlimited practice, drills, combos, local records and visual highlights. Existing game modes only. |
| Engine / language | Imperative Three.js **0.180.0**, WebGL, JavaScript ES modules. No React, Unity, Unreal or Godot runtime. |
| Build / dependencies | Vite **7.3.5**, three-mesh-bvh **^0.9.15**, Playwright **1.64.1** in the lock/install. `package.json`, `package-lock.json`. |
| Platform | Desktop browser, keyboard/mouse and standard gamepad. Mobile/touch deliberately outside the user's scope. |
| Simulation | Custom 120 Hz fixed-step skate physics, board support probes and BVH collision. `CoreSkateController` coordinates explicit ground/air/landing/transition results; compatibility inheritance remains. No Rapier migration is justified by this cycle. |
| Animation | Supplied rigged GLBs, procedural Three.js bone posing, foot/hand IK, board trick motion and presentation-only ragdoll. Physics and presentation have separate authorities. |
| Rendering | ACES tone mapping, PBR materials, stable environment reflections, 1024 shadow atlas, optional selective bloom/CAS/contact shading. Six presets; 144 FPS is a target, not a monitor setting or guarantee. |
| Inputs | `SkateInput`, semantic `InputInterpreter`, saved validated bindings, analog tap detector, fixed menu confirmation/back controls. Five camera modes. |
| Assets | GLB/glTF, gzip delivery for selected park data, JPEG/PNG/WebP textures, local bitmap graffiti glyphs and fonts. Paradise has a separate optimized delivery asset and original fallback. |
| Riders | Five supplied rigged stock characters, headed by The Hollow; baked stock portraits and existing custom GLB import. Hollow's source bytes and prior procedural motion are preserved. |
| Audio | Web Audio effects, recorded skate Foley/banks with synthesis fallback, surface layers, location ambience, music player, separate effects/announcer/crowd/voice controls. Rejected `crowd-cheer.ogg` stays excluded. |
| UI | DOM/CSS menu shell, tutorial/Flip School video loops, synchronized controller overlay, HUD lettering, settings, loadout previews, round/results/replay screens. |
| Persistence | Defensive localStorage preferences, bindings and versioned per-park score records. Highlight poses remain session-local. |
| Networking | Main entry contains no active Portals online runtime. Separate `feat/portals-online-beta` branch retains platform adapters; it is not changed or synchronized by this local cycle. |
| Deploy | GitHub workflows plus Render static hosting; `render.yaml`: `npm ci && npm run build`, publish `dist`. This cycle stops at a verified local candidate. |
| Tooling found | Existing Node/PowerShell/Git, Playwright/Chrome, native subagents, Game Studio skills, connected Blender and Portals tools, media-generation integrations. No installation, paid generation or external-service connection was needed. |

Sources: `src/game-main.js`, `src/game/StreetSkater.js`, `src/game/core/CoreSkateController.js`, `src/input/SkateInput.js`, `src/graphics/GraphicsPipeline.js`, `src/game/SkateAudio.js`, `src/game/GameShell.js`, `src/game/ParkRegistry.js`, `package.json`, `render.yaml`.

Existing specialist references remain authoritative for their earlier work: [physics authority map](phase1-core-authority-map.md), [prior polish and evidence](aaa-polish-status.md), [animation review](animation-visual-review-2026-11-02.md), [audio provenance/review](audio-quality-pass-2026-11-02.md), [asset delivery](asset-delivery-optimization.md).
