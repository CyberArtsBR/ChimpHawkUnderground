# Bail liquid presentation

The first downward torso/head collision produces the liquid. Foot contacts at bail initiation are ignored. The event stores the collider world point and normal for ground and swept contacts; it never uses the gameplay bail position as the puddle origin.

The footprint is three times the previous radii (.69 by .48 m before irregular-edge variation). A shallow convex surface rises about 2.4 cm with a rounded meniscus, dark red dielectric material, clearcoat and environment reflections. Eight glossy 3D droplets arc outward, reduced to four on Performance. Droplets disappear when reaching the contact plane. Three reusable puddle/splash pairs bound memory and draw cost. Puddles fade over five seconds and clear on respawn/map/menu reset.

Validation: tests/bail-liquid.test.mjs covers collision gating, swept points, dimensions/thickness, slope orientation, pooling/fade/reset. Existing skating-effects tests pass. tools/bail-liquid-browser.mjs captured a real pelvis impact approximately .8 m from the bail origin with glow active and no page errors. Impact, settled and close-up screenshots are in artifacts/bail-liquid-v2. The QA script temporarily freezes the rider after impact for repeatable inspection; production motion is unchanged. Reflections use the environment map, not expensive real-time mirrored scene rendering.
