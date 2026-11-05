# 144 FPS PC build

The default graphics setting is now **144 FPS**. Existing installations start on this profile once through the v2 preference key; later explicit quality selections persist. Rendering follows the browser's native display cadence. The physics step remains 120 Hz, so changing refresh rate does not change gameplay speed or the coping fixes.

The profile enables selective glow using a smaller bloom buffer, disables AO and sharpening, and limits internal rendering to 2,073,600 pixels while preserving viewport aspect ratio. Turning glow off restores direct rendering. Materials, lighting, 1024² shadows and hardware canvas antialiasing remain. Canvas CSS fills the viewport independently of internal resolution, including after resizing. Higher quality profiles remain available.

Phone-specific menu/HUD/tutorial layouts and the touch audio-unlock handler were removed. Supported inputs are PC keyboard/mouse and standard gamepads. Small desktop-window layouts and reduced-motion settings remain.

## Validation

- All 862 unit/regression tests pass; production build passes.
- `STREETSKATE_URL=http://127.0.0.1:5181/ node tools/quality-144fps.mjs` checks all three maps, keyboard steering, simulated gamepad steering/pause, 4K-to-720p resizing, switching effects back on, preference persistence, and browser errors.
- Earlier, before glow was enabled in this preset, local Chrome / NVIDIA RTX 5060 Ti short rolling samples measured approximately 144 FPS in all three maps at 1920×1080 internal rendering. These historical numbers do not measure the newer glow-enabled configuration.
- With glow enabled, a short local Chrome / RTX 5060 Ti sample at 2560×1440 viewport and 1920×1080 internal resolution measured 144.0 FPS in Warehouse, 144.0 FPS in ORBIT and 141.3 FPS in Skate Paradise; p95 intervals were 7.0–7.1 ms. This is a limited local sample, not a guarantee on other hardware or routes.
- A second Skate Paradise sample after switching back from Cinematic averaged 101.3 FPS despite a 7.1 ms p95, indicating at least occasional long frame intervals in this short run; profile preset-switching and longer routes before claiming sustained performance.
- Screenshots and the full measurement report are produced in `artifacts/144fps/`. Timing measures actual animation-frame intervals, not render-pass counters.

These are short local measurements, not a guarantee across every GPU or gameplay situation. The browser cannot change the monitor refresh setting; a 144 Hz display mode must be enabled in the operating system.
