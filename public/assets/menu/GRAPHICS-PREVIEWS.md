# Baked menu previews

Created on 2026-10-11 from the existing StreetSkate game assets and renderer. No external stock imagery or generated replacement artwork is used.

- `riders/*.png`: four default rider GLBs, rendered through CharacterPortraits with consistent fill and rim lighting. Re-baked with an orthographic camera fitted to posed, rotated model bounds and 12% framing padding, so headwear and feet remain visible. Heretic includes the scoped material calibration also used during gameplay. The full-body-2 query version invalidates previous cropped browser previews.
- `decks/0.png` through `decks/7.png`: existing procedural StreetBoard finishes, in BOARD_CHOICES order, rendered through BoardPortraits.
- `rooftop-current.webp`, `orbit-current.webp`, `grand-warehouse-current.webp`: actual map renders at 768×432, WebP quality 0.88. The Warehouse image includes the scoped roughness refinement.

The development-only `?art-capture=<map-id>` route in game-main.js creates a hidden `#art-thumbnail` image after rendering the overview. Export its data URL when intentionally updating these files. Production compilation excludes the capture route. Verify the framing visually after any map revision before replacing a thumbnail.

Default rider/deck assets are preferred when available; missing previews and custom riders fall back to the existing rendering path. Original model artwork and its provenance remain with the source game assets.
