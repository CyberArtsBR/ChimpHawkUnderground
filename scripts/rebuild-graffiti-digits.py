"""Rebuild clipped graffiti glyphs by repainting the complete cyan-purple
versions in another palette. Colours come from that palette's intact
letters, matched by luminance rank within horizontal bands so the
highlight-to-shadow gradient (and fire's yellow-to-red) carries over."""
import sys, os
import numpy as np
from PIL import Image

ROOT, OUT = sys.argv[1], sys.argv[2]
GLYPHS = sys.argv[3]
FLIP9 = False
BANDS = 8
REF = list('ABCDFGHIJKLMNRST')  # letters intact in every palette

def load(tone, ch):
    if ch == '9' and tone == 'cyan-purple' and FLIP9:
        # The artwork's cyan '9' is a '%': a 6 turned upside down reads as a 9.
        return np.asarray(Image.open(os.path.join(ROOT, tone, '6.webp')).convert('RGBA').rotate(180)).astype(np.float32)
    return np.asarray(Image.open(os.path.join(ROOT, tone, ch + '.webp')).convert('RGBA')).astype(np.float32)

def lum(rgb):
    return rgb[..., 0] * .299 + rgb[..., 1] * .587 + rgb[..., 2] * .114

def bands(tone):
    """Per band: sorted luminances and colours sorted by luminance."""
    lums = [[] for _ in range(BANDS)]; cols = [[] for _ in range(BANDS)]
    for ch in REF:
        im = load(tone, ch)
        h = im.shape[0]
        ys, xs = np.nonzero(im[..., 3] > 200)
        b = np.minimum(BANDS - 1, (ys / h * BANDS).astype(int))
        rgb = im[ys, xs, :3]
        for k in range(BANDS):
            sel = b == k
            lums[k].append(lum(rgb[sel])); cols[k].append(rgb[sel])
    out = []
    for k in range(BANDS):
        l = np.concatenate(lums[k]); c = np.concatenate(cols[k])
        order = np.argsort(l)
        out.append((l[order], c[order]))
    return out

src_bands = bands('cyan-purple')
FLIP9 = True
for tone in sys.argv[4].split(','):
    dst_bands = bands(tone)
    os.makedirs(os.path.join(OUT, tone), exist_ok=True)
    for ch in GLYPHS:
        im = load('cyan-purple', ch)
        h = im.shape[0]
        rgb = im[..., :3]; L = lum(rgb)
        yrel = (np.arange(h)[:, None] / h * BANDS - .5).clip(0, BANDS - 1)
        yrel = np.broadcast_to(yrel, L.shape)
        lo = np.floor(yrel).astype(int); hi = np.minimum(lo + 1, BANDS - 1); w = (yrel - lo)[..., None]
        result = np.zeros_like(rgb)
        for k in range(BANDS):
            sl, _ = src_bands[k]; dl, dc = dst_bands[k]
            pct = np.searchsorted(sl, L) / max(1, len(sl))
            idx = np.clip((pct * (len(dl) - 1)).astype(int), 0, len(dl) - 1)
            colour = dc[idx]
            result += colour * ((lo == k)[..., None] * (1 - w) + (hi == k)[..., None] * w)
        out = np.dstack([result.clip(0, 255), im[..., 3]]).astype(np.uint8)
        Image.fromarray(out, 'RGBA').save(os.path.join(OUT, tone, ch + '.webp'), 'WEBP', quality=90, method=6)
print('ok')
