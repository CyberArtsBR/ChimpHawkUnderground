# StreetSkate session selector

The owner-supplied StreetSkate_Graffiti_Letter_Art_Pack.zip contains transparent PNG artwork, not an installable font. Its five palettes (uppercase A–Z and digits 0–9) are preserved in public/assets/graffiti. Menu headings and trick feedback compose these sprites with accessible text labels; small control labels retain readable text.

The selector has three rounded panels for riders, skateboard finishes, and parks. Its backdrop is a real WebGL alley with instanced brick relief, roughness, lighting, graffiti paint, and restrained pointer parallax. Reduced-motion preferences disable camera movement. The alley renders only in the selector; hidden park postprocessing is suspended there.

Rider portraits use the game's corrected stance. All eight board thumbnails render the actual board GLB and finish shader without changing the saved finish. Location images are fresh captures of the current game, generated with tools/menu-location-previews.mjs.

Only Skyline Rooftop (map 1) and Urban Warehouse (map 2, formerly map 4) remain selectable. Their stable IDs are unchanged. Foundry and Tron Warehouse are removed from both runtime registries. Shared warehouse construction code and archived GLB assets remain to preserve Urban Warehouse dependencies and historical geometry checks.

Validation: 571 Node tests pass; the full production build includes textures and the seven-track soundtrack. tools/menu-audit-browser.mjs checks desktop, laptop, short landscape, and phone layouts, all character/deck images, graffiti sizing, uncropped rider previews, map numbering, controller arrow navigation, saved finish isolation, starting Urban Warehouse, and graffiti trick feedback.
