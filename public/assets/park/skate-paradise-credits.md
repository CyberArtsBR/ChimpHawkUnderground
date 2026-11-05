# Skate Paradise / After Hours

Standalone test-map art pass, preserving the supplied park's 150% scale and gameplay geometry.

## Source materials

- **The Sky Is On Fire**, Poly Haven, CC0: https://polyhaven.com/a/the_sky_is_on_fire . Embedded 8192 × 4096 photographic panorama, with a separate 2048-wide reflection image generated once in the game.
- **Concrete Floor Worn 001**, Poly Haven, CC0: https://polyhaven.com/a/concrete_floor_worn_001 . Embedded 4096 × 4096 diffuse, normal and packed roughness maps. Authors listed by Poly Haven: Dimitrios Savva and Rico Cilliers.
- **Asphalt 02**, Poly Haven, CC0: https://polyhaven.com/a/asphalt_02 . Embedded 4096 × 4096 diffuse, normal and packed roughness maps. Author: Rob Tuytel.
- Timber finish: existing StreetSkate plywood asset, retained from the project's asset library.
- Bangers typography: existing StreetSkate font asset.

New map art includes inset cyan/amber bowl lighting, floodlight fixtures and local lights, brushed metal, vertex ambient occlusion, a landscaped promenade, palm trees, ornamental grasses, planters, illuminated branding and wayfinding.

The GLB is self-contained. The source supplied by the user and the previous test edition remain unchanged. This edition is outside the public game map catalog.


## Optimized delivery variant — 2026-11-02

`skate-paradise.optimized.glb` and `.glb.gz` retain the original model, mesh/accessor bytes, transforms, materials, texture assignments, rails and collision metadata. Six ground photographs are resized from 4096² to 2048²; the sky panorama is resized from 8192×4096 to 4096×2048 and JPEGs are recompressed. Original texture licenses and credits above apply to these derived images. The original `skate-paradise.glb` remains the fallback/source. Rebuild with `tools/optimize-paradise-textures.py`; see `artifacts/paradise-textures/report.json` for per-image sizes and exact non-image preservation checks. This is lossy texture optimization followed by gzip, not a claim of lossless compression.
