"""Split the generated HUD sheet into padded, baseline-safe bitmap assets.

This only crops and sizes the generated artwork; it does not repaint it.
"""
from pathlib import Path
from PIL import Image
import argparse
import json

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
sheet = Image.open(args.source).convert("RGBA")
args.output.mkdir(parents=True, exist_ok=True)
width, height = sheet.size
metadata = {}
for index, name in enumerate([*map(str, range(10)), "colon", "infinity"]):
    if index < 10:
        region = (index % 4 * width // 4, index // 4 * height // 3,
                  (index % 4 + 1) * width // 4, (index // 4 + 1) * height // 3)
        canvas_size, art_height = (240, 288), 248
    elif name == "colon":
        region = (int(width * .54), height * 2 // 3, int(width * .705), height)
        canvas_size, art_height = (110, 288), 210
    else:
        region = (int(width * .71), height * 2 // 3, width, height)
        canvas_size, art_height = (340, 288), 210
    cell = sheet.crop(region)
    # Low-opacity antialias specks outside the symbol must not include a neighbour.
    bounds = cell.getchannel("A").point(lambda a: 255 if a > 32 else 0).getbbox()
    if not bounds:
        raise ValueError(f"Missing generated glyph: {name}")
    bounds = (max(0, bounds[0]-7), max(0, bounds[1]-7),
              min(cell.width, bounds[2]+7), min(cell.height, bounds[3]+7))
    art = cell.crop(bounds)
    scale = min(art_height / art.height, (canvas_size[0]-20) / art.width)
    art = art.resize((round(art.width*scale), round(art.height*scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", canvas_size)
    canvas.alpha_composite(art, ((canvas.width-art.width)//2, (canvas.height-art.height)//2))
    canvas.save(args.output / f"{name}.png", optimize=True)
    metadata[name] = {"size": list(canvas_size), "sourceRegion": list(region)}
(args.output / "glyph-metrics.json").write_text(json.dumps(metadata, indent=2)+"\n", encoding="utf-8")
print(f"Prepared {len(metadata)} transparent HUD glyphs.")
