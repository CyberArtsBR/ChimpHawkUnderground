# The Foundry warehouse

Added as an independent selectable location alongside Rooftop. The existing character, skateboard, music, camera rigs and skate physics remain unchanged.

## Environment

150 × 110 metre industrial hall with steel trusses, skylights, clerestory windows, brick walls, loading doors, workshop dressing and original signage. Photographic plywood and concrete reuse the project's local material library. The original brick albedo was generated with OpenAI ImageGen; its prompt is recorded in `foundry-brick-prompt.txt`.

Four connected districts contain street stairs, banks, manuals, hubbas, kickers, pyramids, a 25.82 metre continuous horseshoe rail, a timber bowl with three depths and roll-in, a 20 metre wide competition halfpipe with 4.5 metre transitions and eight metre flat, smaller vert features, rolling waves and a volcano. The central plaza remains clear for travel between districts.

Six intended lines: street timber chain; stairs and tech; horseshoe return; timber pocket loop; competition vert; cross-zone flow. Their individual obstacles are listed in the environment manifest.

## Integration

ParkRegistry builds and prepares a candidate world's materials, collision BVHs, wheel contacts, transitions and rail network before replacing the active world. Invalid loads keep the current world. Shared Rooftop textures survive disposal. Restart uses the selected location's entrance. A roof cutaway prevents high inspection views from being obscured without modifying the camera controller. Existing legacy park loading remains available.

## Validation

- Eight focused environment checks passed, covering nondegenerate geometry, all named spawns in both stances, more than 8,000 floor probes, clear plaza, bowl opening and roll-in, halfpipe profiles, uninterrupted curved rail and transition metadata.
- Production Vite build passed (160 modules; existing bundle-size warning remains).
- Chromium/WebGL rendered interior, bowl and overhead views without page errors. Rooftop → Warehouse → Rooftop → Warehouse preserved actor/board identity and rebound surface/wheel services correctly.
- Authored environment: 75,710 visual triangles, 29,654 collision triangles, 28 visual meshes, nine collision meshes and 32 grind paths. These are scene counts, not FPS claims.

Visual captures are development evidence, not a claim of exhaustive gameplay coverage. Controller feel and every possible high-speed transfer still need normal playtesting. Roof cutaway is intentional; decorative fixtures do not each add collision proxies. No claim of bug-free or photorealistic rendering is made.

