# Park asset delivery: lossless local upgrade

The selected park is still loaded on demand. The original GLBs and sky PNG remain in `public` as artist-editable sources and as fallback assets. A failed compressed download, corrupt stream, unsupported `DecompressionStream`, or host without `.gz` support falls back to the original GLB; an unavailable WebP image falls back to the PNG. Three.js, scene topology, collision generation, names, UVs, positions, materials and glow are unchanged.

| Selected park asset | Previous delivery | New delivery | Reduction | Validation |
| --- | ---: | ---: | ---: | --- |
| ORBIT GLB | 14,473,524 bytes | 8,386,149 bytes | 42.1% | Decompressed file identical, SHA-256 `5038ff2ea2e65620faf098bbdf333b47163fe0837542e551e09561a2d45e674d` |
| Grand Warehouse GLB | 13,730,256 bytes | 6,033,768 bytes | 56.1% | Decompressed file identical, SHA-256 `fbc46ba3e414bb4380366c749fa0aa526e06328ae3bff702e956b43c37f0902c` |
| ORBIT 4096 × 2048 galaxy | 11,943,385 bytes | 7,340,296 bytes | 38.5% | Decoded RGB bytes identical, SHA-256 `0dcf5f02dcff9e0066c750cebfc11d4b95577ad91d811e16be48c97d9c82db23` |

Original sizes are file payloads, not promised network savings on hosts which already compress `.glb`. The compressed alternatives add 21,760,213 bytes to repository/deployment storage while originals are retained. They retain full image dimensions, so **GPU texture memory, number of triangles, draw calls and rendering workload are unchanged**. Runtime gzip decompression has a CPU/memory cost. Loading time and sustained frame rate require a controlled before/after browser measurement; a smaller payload alone does not establish either improvement.

In one cold-context local Chromium comparison with simulated 40 Mbps download and 20 ms latency, park readiness was 2.49 s optimized versus 4.09 s original for Warehouse, and 3.72 s versus 5.85 s for ORBIT. Readiness includes download, decompression, parsing and scene setup. This is one sample per case, not a guarantee across devices or servers; the original case intentionally forced the original GLB and PNG fallback. Details: `artifacts/master-upgrade/asset-loading/report.json`.

Skate Paradise remains unchanged: gzip decreases 50,686,100 to approximately 46,536,809 bytes (8.2%), with a significant second file and decompression cost. An exploratory re-encoding of its `asphalt_02_nor_gl_4k` normal map to lossy WebP at quality 98 reduced the image from 17,407,651 to 10,593,372 bytes, but only achieved about 29.5 dB compared with the original decoded pixels. This is insufficient evidence to trade the original normal fidelity for transfer size, so neither this conversion nor other Paradise texture changes are shipped. Its existing 8192 × 4096 sky is downsampled for reflections by the established runtime; the visible sky remains full resolution.

## Reproduction and safeguards

Run `python tools/optimize-park-delivery.py` with Pillow/WebP support. The script deterministically gzip-compresses untouched source GLBs, converts the galaxy with lossless WebP, verifies the decompressed GLB and decoded RGB pixel bytes, then writes the optional artifacts atomically. The SHA-256 and byte counts are emitted to `artifacts/master-upgrade/asset-delivery-report.json`. Original images/GLBs are never overwritten.

`node --test tests/compressed-park-delivery.test.mjs tests/map3-loader-lifecycle.test.mjs tests/orbit-map2.test.mjs tests/skate-paradise.test.mjs` passed 8/8. Tests cover the exact GLB roundtrip; successful decompression; transparent server decompression; unavailable, corrupt and unsupported gzip; cancellation without fallback; and existing map loader/spawn and collision checks. Browser validation entered all three parks with glow at the 144 FPS target (`artifacts/master-upgrade/graphics-validation/`). Physical GPU performance is not inferred from file size.
