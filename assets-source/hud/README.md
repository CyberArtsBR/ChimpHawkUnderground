# In-game numeric glyphs

Generated in Codex with the built-in image generator on 2026-10-12. The tool does not expose its exact model version. No Higgsfield generation was used.

Original transparent artwork: `numeric-glyph-sheet.png`.
Runtime glyphs: `public/assets/hud/glyphs/`.
The 12 prepared PNGs total about 775 KiB and are cached after one preload.

The preparation script only isolates and normalizes the generated glyphs. It preserves alpha and adds safe padding. Run it with Pillow:

```
python tools/prepare-hud-glyphs.py assets-source/hud/numeric-glyph-sheet.png public/assets/hud/glyphs
```

The HUD uses the real banked session score, speed in km/h, and remaining session time. Practice shows infinity. Bitmap failures reveal the original numeric text. Values update only when changed.

## Generation prompt

Use case: stylized-concept. Asset type: production bitmap glyph atlas for the StreetSkate / Chimp Hawk in-game HUD. Generate ONE perfectly organized sprite sheet on a truly transparent alpha background, 4 columns by 3 rows of equal-size cells. EXACT content in reading order: row 1: 0 1 2 3; row 2: 4 5 6 7; row 3: 8 9 : ∞. Exactly twelve separate glyphs, one per cell, centered inside its own cell, no labels, no cell lines, no other characters. All digits share identical visual height, coherent straight baseline and broad monospaced proportions. Each glyph fits within the middle 65 percent of its cell, leaving generous transparent padding all around, zero overlap or clipping. Style: premium arcade skateboarding graffiti numerals, bold hand-painted angular lettering with slightly forward-slanted stance, controlled clean contours, warm ivory-to-champagne-gold face, subtle painted highlights, deep ink-plum outline and a short hard black shadow, a restrained ice-cyan offset accent on the lower edge. Flat readable front-on lettering, crisp silhouette, thick strokes, unmistakable 0,1,2,3,4,5,6,7,8,9. The colon has two clearly separated dots; the infinity glyph is a horizontal figure eight. Cohesive design that matches an underground skate game with gold/fire/red trick lettering. Must stay legible at 30-48 pixels tall over moving 3D scenery. No flames, no spray clouds, no excessive glow, no scene, no panels, no fake checkerboard, no watermark, no extra text. Preserve the exact 4x3 regular grid and glyph order.
