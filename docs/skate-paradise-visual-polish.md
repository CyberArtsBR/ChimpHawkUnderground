# Skate Paradise visual polish

The sunset pass strengthens warm directional light, cooler sky fill and material separation while retaining the embedded sky. Concrete, asphalt and timber gain restrained macro variation. The park adds 48 projected wheel-scuff, repair and worn-marking patches in three merged batches (7,306 triangles). Placement uses visible surface triangles and rejects unsupported or sharply changing cells; riding geometry, rails and spawn positions stay unchanged.

Skating now has short grind sparks, impact-sensitive landing dust and faint traces during fast airborne tricks. Two fixed particle pools cap the effect budget. Respawns, map changes, replay seeks and menus clear or hide the effects; particles do not contribute to selective bloom. Performance disables sparks/traces and reduces dust; lower presets reduce surface wear.

Camera landings retain a short period of headroom and settle over 0.24 seconds. Clearance looks for alternate sightlines earlier and avoids oscillating around coping edges. Direction, trick behavior and skating physics retain their existing rules.

Title artwork and the Options test-map upload control are unchanged. No new external assets or network calls are introduced. This pass is local until a separate publish request.

Validation: production build passes. Full suite: 796 of 800 tests pass; the four failures are the previously reproduced baseline launch-energy and ghost-material expectations. New surface, particle, lighting, bloom-restoration and camera checks pass. Browser checks cover the rendered park and live grind particles without shader errors. `tools/skate-effects-preview.html` is a standalone local development fixture, excluded from the production entry/build.
