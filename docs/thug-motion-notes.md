# THUG movement behavior adapted for StreetSkate

Date: 2026-10-07. This is a source study and original JavaScript implementation,
not a port of Neversoft's engine or a claim of exact gameplay parity.

Reference: the supplied `Tony_Hawks_Underground_Neversoft_2003_Source_Code`,
`Sk/Components/SkaterCorePhysicsComponent.cpp`, also published in
[the supplied Code repository](https://github.com/RetailGameSourceCode/TonyHawksUnderground/tree/master/Code).

## Observations and implementation

| Source behavior | StreetSkate adaptation |
| --- | --- |
| `can_kick` / `do_kick` (around lines 1882–1970) distinguish standing and crouched speed/acceleration and prevent kicking while Down is pressed. | Space/A crouching now has a 14 m/s flat-ground push target, compared with the existing 12.5 m/s standing target, and 12% stronger push. Down disables automatic acceleration, including while carving. Manuals still disable automatic push. |
| `handle_wind_resistance` / `apply_wind_resistance` use a crouch-specific drag value and speed-squared drag. `limit_speed` separates a soft limit from an absolute cap. | Crouching reduces the aerodynamic part of rolling resistance. Additional drag grows smoothly above 15.2 m/s; the existing 17 m/s hard safety cap remains. Hills/pumps can carry speed above the automatic push target. |
| `is_trying_to_brake` and `handle_ground_rotation` (around lines 1789 and 3911) distinguish Down alone from Down with a direction: the latter allows a sharper turn while rolling forward. | S + A/D makes a sharper forward carve, with 38% more turn rate and no Down braking. S alone brakes. Fakie Down still brakes. Shift is always an explicit brake, and manual balance inputs do not activate this carve mode. |
| `on_steep_slow_slope` / `do_brake` avoid braking a nearly stopped skater on a steep surface. | Down braking releases below 1.5 m/s on steep surfaces so gravity can return the board down a transition. Shift remains explicitly available. |
| `handle_air_rotation` (around lines 5369–5558) gives shoulder spin controls priority over directional inputs, and uses a brief directional no-rotation/ramp period. | Q/E or LB/RB own air rotation while held, so an opposite trick direction does not cancel the spin. Directional turns wait 45 ms, then reach full response at 140 ms. Shoulder turns start immediately. Rotation stops immediately when the input is released. |
| Air rotation changes orientation separately from flight velocity. | The air controller continues to change yaw only from deliberate input, with a full turn rate of 5.2 rad/s. Steering does not redirect flight velocity or change vertical impulse. |

The values above are StreetSkate tuning in meters and seconds. THUG looks up many
physics/stat values from scripts; this source snapshot does not provide the full
retail scripts, content, and playable runtime needed to reproduce its exact
numbers. No original C++ implementation was copied into the game.

## Boundaries

- Ground motor changes remain in the canonical `GroundMotor` transaction.
- Air hold state is local to an individual flight and restarts at takeoff.
- Collision normals never generate horizontal yaw.
- Same-ramp vertical return, deliberate deck exit, and the prohibition on a
  second airborne vertical boost remain unchanged.
- The original game's automatic vert turn is intentionally omitted to preserve
  the user's explicit-input-only facing behavior.
- Spin taps that automatically finish a 180 are not added; existing held Q/E and
  shoulder controls remain authoritative.
- No gameplay tests or benchmarks were run, as requested. These changes were
  reviewed statically; the parent integration handles compilation and deployment.
