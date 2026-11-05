# StreetSkate

Current technical profile, independent review findings, local candidate and verification: [Game Evolution project state](docs/PROJECT_STATE.md). Historical audits below describe their own release milestones.

The local coping/presentation quality pass is documented in [docs/coping-quality-pass-2026-10-27.md](docs/coping-quality-pass-2026-10-27.md), including the confirmed cause, before/after captures and validation. Run `npm run test:browser` against a local preview with `STREETSKATE_URL` set to its URL; the smoke test covers the current three-map game.

Playable Three.js street skateboarding prototype, using the reconstructed Insanity-inspired park, the user-supplied TheanchoURi character, and the skateboard from CyberArtsBR/Skate.

## Run locally

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ and click inside the game to give it focus.
Simulation pauses when the page loses focus; Esc / Start resumes it. Explore mode pauses the rider.

PC browsers with keyboard/mouse or a standard gamepad are supported. Mobile/touch controls and phone layouts are not supported.

The default **144 FPS** graphics profile follows the display refresh rate and enables lightweight glow, native-resolution rendering and 2× edge smoothing. Graphics includes a saved 60–125% render scale. Turning glow off skips post-processing in the two lean presets. Set your display to 144 Hz in the operating system; actual frame rate depends on the GPU and browser. Higher visual presets remain available in Options → Graphics. The simulation stays at a fixed 120 Hz across display refresh rates.

## Controls

Open **Tutorial** on the title screen to start with Flip School: twelve looping flip-trick demonstrations, synchronized Xbox/PlayStation/keyboard inputs, numbered button order, pause/replay, and 0.5× slow motion. The readable detail pages and controller overlay use your saved controls. The pause menu also provides a direct Flip School shortcut. Only the selected clip loads, and exiting the menu stops playback. Free Practice opens the normal unlimited session setup.

In Free Practice, press **M** to save a grounded practice marker and **N** to return to it. On a controller, hold both shoulder buttons and press D-pad up to save or down to return. The marker restores position, facing, and stance; save a new marker after changing parks.

Pause Free Practice and turn on **Practice Drills** for a sequence of optional challenges. Successfully bank an ollie, a kickflip, a grind, and a three-trick combo to complete them.
The pause menu also offers an optional **Input Display** showing your recent skating actions.

Options includes a controller stick dead zone setting (8%, 16%, or 24%) for skating and camera movement. Increase it if the sticks drift; menu navigation and trick-direction taps keep their separate thresholds.

Graphics includes a toggle for 2× edge smoothing in the 144 FPS preset with glow enabled. It starts on and can be compared locally on your hardware. All six presets share default glow values of 1.50× world emissive, 1.09 bloom strength, 0.10 glow contribution and 0.11 radius; your adjustments remain saved per preset.

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Roll / trick direction | Automatic push; W selects forward | Automatic push; stick / D-pad forward |
| Turn / air spin | A, D | Left stick / D-pad sideways |
| Brake / sharp carve | S brakes; S + A/D carves; Shift always brakes | Back brakes; back + sideways carves |
| Charge ollie / pop | Hold / release Space | Hold / release A / Cross |
| Directional flip | Left arrow + WASD direction | X / Square + direction |
| Directional grab | Right arrow + WASD direction | B / Circle + direction |
| Grind / wall ride | Hold Up arrow near a rail / wall | Hold Y / Triangle |
| Additional air spin | Q / E | LB / RB or L1 / R1 |
| Exit vert after apex | Left Ctrl | LT / L2 |
| Switch stance | Right Ctrl | RT / R2 |
| Manual / nose manual | W then S / S then W | Forward then back / back then forward |
| Cycle Follow / Follow Close / Follow Low / Classic / Fixed | C or toolbar camera button | Right-stick click (R3) |
| Lookaround in follow cameras | Drag with left mouse button | Right stick |
| Pause | Esc | Start / Options |
| Respawn rider, retain banked score | R | Assign in Settings |

The toolbar switches between Skate and Explore. Aerial steering rotates the rider without redirecting momentum. Land aligned with the travel direction (or switch); unfinished flips and sideways landings cause a bail.

Bowl and quarter-pipe lips launch into a locked vertical air. Speed controls airtime and height; Left Ctrl / LT / L2 after the apex deliberately releases the return line and carries the rider over the coping. Holding forward alone keeps the return line. Ordinary banks and flat-ground ollies keep their normal momentum.

Hold grind while descending close to a rail to catch it; release an ollie to jump off. A short cooldown prevents immediate recapture. Direction + flip, grab, or grind selects the trick. Quick pairs of trick buttons during a manual select flatland variations.

The [THUG behavior adaptation](docs/thug-adaptation.md) adds crouch-specific speed/drag, shoulder-priority air rotation, queued air tricks, combo repetition decay and synchronized procedural animation. Follow is the initial camera preference; C / R3 cycles the five modes and saves the choice. Balance against the marker: correct a left lean to the right and a right lean to the left; manual nose/tail changes retain the accumulated balancing challenge. Restart Session starts a new round and clears its score.

## Build and deploy

```sh
npm run build
```

Render Static Site: branch main, no root directory, build command
`npm ci && npm run build`, publish directory `dist`.
Runtime GLBs are ordinary Git binary files in `public/assets`; no chunk reconstruction or external asset service is needed.

`build` only compiles the production bundle. Tests and physics verification remain available through `npm run validate`; they are separate from deployment.

The 2026-10-07 production integration merges `refactor/core-skate-controller-v1` through `fba85cc2c622aeb3d50c0a88477a4364667c1777`. It includes the canonical input, transition, collision, takeoff, and landing services coordinated by `CoreSkateController`, with `StableBoardContact.land()` using `LandingResult` and `LandingExecutor`. The original park loader is preserved. This merge/deploy was requested without any new test or benchmark runs.

## Integration

- 120 Hz fixed movement step with acceleration, braking, gravity on slopes, chargeable ollies, short coyote time, and jump buffering.
- Board-contact ground/landing sweeps plus subdivided capsule movement for the rider and grounded skateboard. Obstacle contacts slide along barriers without rolling back the entire move.
- Solid ramp sides/backs, rails and supports, guards, lamp posts, bench legs, and curbs in the separate collision mesh. The active grind rail is excluded from body blocking while grinding.
- Left/right steering corrected for the local -Z forward convention.
- Real 38,544-triangle park and 8,296-triangle collision mesh.
- Quarter-pipe transitions and heights enlarged 30% in the asset generator, before batching, with matching visual/collision geometry and coping paths. Bowl dimensions are unchanged.
- Single Unreal-style 61-bone character; procedural limb posing and foot placement because the supplied GLB has no animation clips.
- Skateboard resized to 1.05 m with deck-centered flip rotation.
- Fixed camera preserves world orientation. Optional Classic camera tracks travel, frames vert/grind states and ignores deck spins.
- Vertical transition launches use the authored coping paths, with a locked return line and intentional forward exits after the apex.
- Arm poses respect the authored elbow bend planes, spread forearm/wrist roll, and distribute the gaze across the torso, neck, and head.

The park follows the broad layout of the supplied reference without the building or grass.
It is an original low-poly reconstruction, not the photogrammetry scan.
Dimensions are estimated for gameplay. See `public/assets/park/park-manifest.json` for provenance, counts, and rail paths.

This is a movement prototype with directional tricks, rail grinds, manuals, flatland variations, wall rides/plants, and combo scoring. Authored animation clips remain future work; the existing transition pumping uses held compression and release timing. Gameplay tests and benchmarks were not run for this integration at the user's request.

`tools/build_park.py` is the editable Blender source. Regenerate the embedded-texture GLBs and manifest without rendering a preview:

```sh
blender --background --factory-startup --python tools/build_park.py -- --assets-only
```

The ignored `references/` folder is research material, not application source; Tony Hawk source code is not shipped.
