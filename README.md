# Chimp Hawk Underground (v2)

Browser street-skating game. TypeScript + Three.js 0.180 + Rapier physics, built with Vite.
This is the v2 rebuild of [StreetSkate](https://github.com/CyberArtsBR/StreetSkate); the audit and roadmap behind it live in that repo (`docs/AAA-AUDIT-AND-ROADMAP-2026-11-05.md`).

**Status: Phase 1 (foundation).** Four maps: the original **Skate Paradise**, **Orbit** and **Grand Warehouse**, plus **The Lab** (code-built test park with every obstacle type). The five original riders and the original skateboard, the full Classic control scheme from v1, sunset lighting, bloom, effects and audio.

### Riders and uploading your own

Pick a rider on the **Build your line** screen, or choose **Upload rider** and load your own rigged character (`.glb`, textures embedded, up to 40 MB). Any humanoid skeleton works: bones are matched by name (Mixamo `mixamorig:*`, Unreal Mannequin `pelvis/thigh_l/calf_l…`, common Rigify/Blender names), then posed on the board with IK, so no retargeting is needed. The legs must be identifiable (hips, both thighs, calves and feet); arms, spine and head are optional.

## Run

```sh
npm install
npm run dev      # http://127.0.0.1:5173
npm test         # 23 deterministic skater / input / scoring tests
npm run build    # type-check + production build into dist/
```

## Controls (Classic, identical to v1)

| Action | Keyboard | Gamepad |
|---|---|---|
| Roll / steer / trick direction | W A S D (auto-push) | Left stick / D-pad |
| Brake / carve | S or Shift / S + A/D | Back / back + sideways |
| Ollie (hold to charge) | Space | A / Cross |
| Flip / Grab / Grind | ← / → / ↑ (+ direction) | X / B / Y |
| Spin | Q / E | LB / RB |
| Vert: carry over the coping | Left Ctrl after the apex | LT |
| Switch stance | Right Ctrl | RT |
| Manual / Nose manual | W then S / S then W | D-pad up→down / down→up |
| Camera mode / look around | C / drag mouse | R3 / right stick |
| Reset / marker save / return | R / M / N | — |
| Pause | Esc | Start |

## Architecture

```
src/
  input/     Classic bindings (pinned by tests to v1) + keyboard/gamepad reader
  skater/    Skater.ts: one explicit state machine (ground / air / grind / manual / bail); config.ts tuning
  physics/   Rapier wrapper: static park colliders + ray queries
  park/      Obstacle builders and The Lab layout (node-safe, shared by render and physics)
  tricks/    Trick catalog (from v1) and THUG-style combo scoring
  render/    Rider placeholder, park materials, sunset environment, GPU particles
  camera/    Follow camera (3 framings)
  audio/     Web Audio mix: CC0 skate foley + streamed soundtrack
  hud/       DOM HUD and pause-menu controls table
```

Physics runs at a fixed 120 Hz; rendering interpolates between steps. Adding a move means adding a state or a branch in `Skater.ts`, never another override layer.

## Deploy (Cloudflare Pages)

Build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=22`. `public/_headers` sets cache rules.

## Credits

Sound effects: CC0 recordings, see `public/audio/foley/CREDITS.md`. Fonts: Bangers and Barlow Condensed (SIL OFL, licences in `public/media`). Music and title art: Chimp Hawk / CyberArtsBR.
