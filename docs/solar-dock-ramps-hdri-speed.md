# Solar Dock — continuous ramps, faster skating and HDRI

Release: `2026-10-08-continuous-ramps-hdri-speed`.

The plaza previously occupied the same plane as the mega ramp's wooden flat
bottom, allowing triangular concrete patches to show through. The plaza now has
an exact opening beneath that section. The half-pipe also uses a single wooden
profile through both transitions and its ten-metre flat bottom, with continuous
UVs and matching collision geometry. Its old overlapping floor decal is removed.
Existing coping locations and transition identifiers remain available.

Ground propulsion targets 17 m/s (61.2 km/h), or 19 m/s (68.4 km/h) while
crouched. The physical ground speed ceiling rises from 17 to 23 m/s (82.8 km/h);
the soft limit is 21 m/s. Acceleration, braking and steering speed thresholds
are adjusted for the higher cruise speed. The grind ceiling is also 23 m/s so
fast rail entries are not immediately truncated to the previous 18 m/s limit.

## HDRI provenance and packaging

- Asset: [Qwantani Dusk 2 (Pure Sky)](https://polyhaven.com/a/qwantani_dusk_2_puresky)
- Authors: Greg Zaal (photography), Jarod Guest (processing).
- License: CC0-1.0, as listed by Poly Haven.
- Original 4K Radiance HDR: 4096 × 2048, 17,976,514 bytes.
- SHA-256: `dbe5f750e4753f51ef8d178553318ad8550035cac0ce5cfab058e76cf8f021d2`.
- The manifest pins the upstream file URL and hash. The existing asset preparation
  step downloads it on a clean build, verifies it, and publishes a local copy.
  Cached valid files are reused. A clean build needs access to Poly Haven.
- The game serves the HDRI from its own origin. It provides the visible sky and
  a prefiltered environment generated once at 256-pixel cube resolution, keeping
  the full 4K background while avoiding an unnecessarily large lighting bake.
- Exposure, sunlight, hemisphere fill and fog are tuned together. The lighting
  toggle supports a texture background. Failed runtime sky loading retains the
  existing fallback lighting rather than blocking the rest of the game.

Validation for this release is limited to the production build and publication
status. No unit tests, gameplay runs or benchmarks were requested or performed.
