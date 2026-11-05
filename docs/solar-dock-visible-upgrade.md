# Solar Dock: animation, grind and visual pass

Based on the user recording `Desktop 2026.10.08 - 19.48.21.09.mp4` (113 seconds)
and the audited main checkpoint `45f8a68`. Existing QA/focus-pause/camera work is
preserved. Only the production build is run; gameplay tests and benchmarks remain
with the user as requested.

## Gameplay and animation

- Removed the procedural pushing foot sweep. Pumping and automatic propulsion
  keep both feet on the deck.
- Full ollie charge: 0.24 seconds instead of 0.6; pop presentation: 0.12 instead
  of 0.22. A short tap already supplies a useful 5.4 m/s impulse.
- Compact air posture adapted from Half Pipe's `SkatePoseController`: sustain
  crouch through flight instead of standing at launch and bending only at apex.
- Grabs engage faster, lower the pelvis, lean the torso and use measured arm
  length to bring the shoulder within reach before the two-bone IK pass.
- Successful grind captures receive an 8.5 m/s minimum (30.6 km/h), maintained
  through the grind; faster entries retain speed up to the 18 m/s cap.
- One continuous express rail has two 47 m straights joined by a broad, finely
  segmented 180-degree elliptical curve. All segments/posts use one rail ID.
- Street rails are longer and thicker. A new Long rail area button starts at
  the entry, facing the correct way.
- Mega launch is a continuous circular transition ending at 58 degrees, about
  4.43 m high. It remains a forward-launch kicker, not a vert-return lip.

## Presentation

- Concrete and plywood now use generated photographic-style bitmap textures,
  retaining fine procedural bump detail. Curve-length UVs keep ramp sheets
  proportional. Graffiti covers ramp faces, pool walls, the bowl floor, plaza,
  ledges/terminal walls and the mega structure.
- Added spectator shelters, benches and industrial modules outside playable
  boundaries. Reduced flat ambient illumination so materials/shadows read better.
- Eight gradient deck palettes reused from the user's Half Pipe config. Painted
  deck edges/underside retain a dark grip center; selection persists locally.
- Original Web Audio synthesis provides rolling, metal grind, ollie/pop,
  landing/bail and air sounds. Audio unlocks on a click/key gesture, mutes during
  pause/focus loss and has a persistent Sound button. No external sound samples.

## Image provenance and build

All three raster assets were newly generated with the built-in imagegen tool
using the imagegen skill, not downloaded stock art. The tool selected its model;
no claim is made that a specific model called "Image 2.5" was available.

The generated originals were viewed in the conversation. WebP exports preserve
their native dimensions: graffiti 1774×887, concrete/plywood 1254×1254. Encoded
source parts in `assets-source/solar` are decoded by
`tools/materialize-textures.mjs` before dev/build. SHA-256 manifests detect
truncation. The build emits regular WebP files under `public/assets/park/hd`;
no base64 textures are bundled into gameplay JavaScript.

Half Pipe references: `references/halfpipe-source/src/character/SkatePoseController.js`,
`src/skateboard/SkateboardVisual.js`, and `src/config/skateboardFinishes.js` in that
reference checkout. The palette module is copied as `src/skateboard/BoardFinishes.js`;
poses and coloring are adapted to StreetSkate's coordinate system and rider rig.

## Generation prompts

### Graffiti

Game production texture asset, orthographic perfectly flat straight-on graffiti mural albedo texture, landscape 2:1. Full bleed professionally painted layered urban skatepark graffiti on aged light gray concrete. Extremely high detail authentic spray paint aerosol gradients, drips, overspray, overlapping elaborate wildstyle abstract lettering, painted shapes, expressive arrows, urban artwork turquoise magenta orange cream black, realistic rubbed paint and concrete pores, subtle skate wheel scuffs. Dense artwork across entire image, designed for use on bowl walls, skateboard ramps and ground. No perspective, no room, no objects, no scenery, no lighting shadows, no bevels, no frames, no watermark, no corporate logos. Matte flat diffuse texture with fine photographic surface detail, crisp large graphic forms readable from a distance. Predominantly art covering 80 percent, concrete showing through in margins and scratches. Create a single finished texture, not a contact sheet.

### Concrete

Single seamless tileable physically based game albedo texture, 2048 square if possible, top down orthographic photograph of well maintained but used skatepark concrete. Neutral medium light warm gray, realistic fine aggregate, subtle irregular cloudy trowel swirls, faint organic darker wheel rub marks and many tiny pores, mottled varied tones visible from distance. Flat even diffuse lighting, no shadows, no perspective, no text, no graffiti, no borders, no cracks deeper than hairlines, no stones sticking out. Entire frame one continuous concrete material, all four edges seamless. High quality photogrammetric surface detail, not a smooth solid color and not exaggerated noise.

### Plywood

One seamless tileable photorealistic game albedo material texture for a real premium skateboard halfpipe: weathered honey brown birch plywood riding surface, 2.44m by 2.44m real area, square image. Exactly two large vertical plywood sheets side by side, central very thin dark expansion seam, realistic long fine grain running vertically, subtle natural wood figure and a few understated oval knots, occasional skateboard wheel scuffs and sun faded grain. Small countersunk dark screw heads evenly spaced near the edges. Flat top-down orthographic scan, absolutely even diffuse illumination, no shadows, no perspective, no furniture, no border, no logos. Professional photographic material detail. Matte slightly worn surface, warm medium brown not orange. Entire frame is wood surface. Left/right and top/bottom edges should tile cleanly.
