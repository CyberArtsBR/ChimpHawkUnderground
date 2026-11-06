"""Close graffiti glyphs whose artwork was cut flat at the top or bottom edge.

The supplied letter art touches the image border on some glyphs (warm palettes
at the top of E/O/P/Q/U-Z, cyan-purple at the bottom of G-Z), so the letter
looks sliced. This pads the cut side and draws a dark rounded outline cap with
a thin highlight, so each letter reads as finished. Run from the repo root:
    python scripts/cap-graffiti-edges.py public/assets/graffiti [--preview out.png]
Idempotent: glyphs that no longer touch an edge are left alone.
"""
import os, sys
from PIL import Image, ImageDraw

ROOT = sys.argv[1]
PREVIEW = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
THRESHOLD, MIN_RUN, PAD = 40, 30, 12
OUTLINE = (18, 14, 22, 255)

def spans(alpha, y, width):
    runs, start = [], None
    for x in range(width + 1):
        solid = x < width and alpha.getpixel((x, y)) > THRESHOLD
        if solid and start is None: start = x
        if not solid and start is not None:
            if x - start >= 6: runs.append((start, x - 1))
            start = None
    return runs

def cap(image, side):
    w, h = image.size
    padded = Image.new('RGBA', (w, h + PAD), (0, 0, 0, 0))
    padded.paste(image, (0, PAD if side == 'top' else 0))
    draw = ImageDraw.Draw(padded)
    edge_y = 0 if side == 'top' else h - 1
    alpha = image.getchannel('A')
    for x0, x1 in spans(alpha, edge_y, w):
        if side == 'top':
            draw.rounded_rectangle((x0 - 1, PAD - 7, x1 + 1, PAD + 1), radius=5, fill=OUTLINE)
            # Thin glossy rim on the letter's new top edge.
            for x in range(x0 + 2, x1 - 1):
                r, g, b, a = image.getpixel((x, 0))
                padded.putpixel((x, PAD + 1), (min(255, r + 70), min(255, g + 70), min(255, b + 70), a))
        else:
            draw.rounded_rectangle((x0 - 1, h - 2, x1 + 1, h + 6), radius=5, fill=OUTLINE)
    # Re-draw the original over the cap so only the new edge shows.
    over = Image.new('RGBA', padded.size, (0, 0, 0, 0))
    over.paste(image, (0, PAD if side == 'top' else 0))
    if side == 'top':
        rim = padded.crop((0, PAD + 1, w, PAD + 2))
        padded = Image.alpha_composite(padded, over)
        padded.paste(rim, (0, PAD + 1), rim)
    else:
        padded = Image.alpha_composite(padded, over)
    return padded

changed = []
for tone in sorted(os.listdir(ROOT)):
    folder = os.path.join(ROOT, tone)
    if not os.path.isdir(folder): continue
    for name in sorted(os.listdir(folder)):
        if not name.endswith('.webp') or not name[0].isalpha(): continue
        path = os.path.join(folder, name)
        image = Image.open(path).convert('RGBA')
        w, h = image.size
        alpha = image.getchannel('A')
        top = sum(alpha.getpixel((x, 0)) > THRESHOLD for x in range(w))
        bottom = sum(alpha.getpixel((x, h - 1)) > THRESHOLD for x in range(w))
        result = image
        if top > MIN_RUN: result = cap(result, 'top')
        if bottom > MIN_RUN: result = cap(result, 'bottom')
        if result is not image:
            result.save(path, 'WEBP', quality=90, method=6)
            changed.append(f'{tone}/{name}')
print(f'capped {len(changed)} glyphs')
if PREVIEW and changed:
    tiles = [Image.open(os.path.join(ROOT, c)).convert('RGBA') for c in changed[:24]]
    tw = sum(t.width // 2 + 6 for t in tiles[:12]) + 10
    sheet = Image.new('RGBA', (max(tw, 10), 260), (60, 60, 70, 255))
    x = 5
    for i, t in enumerate(tiles):
        t = t.resize((t.width // 2, t.height // 2))
        if i == 12: x = 5
        sheet.alpha_composite(t, (x, 5 if i < 12 else 135)); x += t.width + 6
    sheet.save(PREVIEW)
