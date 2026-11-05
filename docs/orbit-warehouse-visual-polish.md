# ORBIT and Grand Warehouse visual pass

ORBIT now has satin ceramic relief, restrained brushed-metal reflections, 38 projected wheel-wear/navigation patches, and six cyan/violet fixture light pools. The authored galaxy, blue/violet palette, graffiti and branding stay in place. Added decoration is batched into three draws and 3,544 triangles.

Grand Warehouse now has photographed plywood detail at a 2.44-metre sheet scale, filtered fine grain, concrete pores, satin coping, 51 projected wear/maintenance patches and four warm practical lights beneath existing fixtures. Original albedo maps and tints are retained beneath the photograph layer; the existing local 1254-square plywood image is reused. Added decoration uses two draws and 7,272 triangles. There is no new wall artwork.

Both maps have revised key/fill/ambient balance. Ultra and Cinematic add subtle GTAO contact depth at a capped resolution; lower tiers release the pass entirely. Sky, transparent decals, unlit billboards and particle effects are excluded from the depth prepass. Visibility and renderer state restore even after an exception. Screen-space reflections remain disabled.

Ultra and Cinematic now request four-sample edge smoothing when the GPU supports it. Preset changes rebuild framebuffer storage when sample counts change. Additional wear and practical lights reduce with the existing detail presets. Texture quality also applies to the photographic material layer.

Rails, collision buffers, entrances and roof cutaway remain unchanged and are covered by focused invariants. The title artwork and local test-map upload control are untouched. The map selection previews reflect the updated rendering.

Validation: production build, board/vert/pumping checks and browser Cinematic renders pass. The complete suite reports 810 passing tests out of 814; the four remaining failures match the previously established baseline launch-energy and ghost-material expectations. The Warehouse grain shader was adjusted after a real ANGLE driver warning; the final fresh browser renders report no warnings or errors.

For a reproducible local review, the development-only art capture route accepts `art-capture=orbit` or `art-capture=grand-warehouse`, plus `art-quality=cinematic`. This capture route is removed from production builds. These enhancements have not been deployed.
