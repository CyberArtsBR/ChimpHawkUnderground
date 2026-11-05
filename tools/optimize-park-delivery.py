"""Create optional lossless delivery files while retaining the artist originals.

Run: python tools/optimize-park-delivery.py
Requires Pillow with WebP support for the optional galaxy; GLB gzip is stdlib.
The exact decoded GLB bytes and decoded RGB sky pixels are verified before use.
"""
from hashlib import sha256
from pathlib import Path
from io import BytesIO
import gzip
import json
import os

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'public' / 'assets'
REPORT = ROOT / 'artifacts' / 'master-upgrade' / 'asset-delivery-report.json'


def write_atomic(path, data):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_bytes(data)
    os.replace(temporary, path)


def gzip_glb(relative):
    source = ASSETS / relative
    original = source.read_bytes()
    assert original[:4] == b'glTF', f'Expected GLB: {source}'
    buffer = BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode='wb', compresslevel=9, mtime=0, filename='') as writer:
        writer.write(original)
    encoded = buffer.getvalue()
    assert gzip.decompress(encoded) == original, f'Round trip failed: {source}'
    destination = source.with_name(source.name + '.gz')
    write_atomic(destination, encoded)
    return {'asset': relative, 'optimized': relative + '.gz', 'originalBytes': len(original),
            'deliveredBytes': len(encoded), 'sha256': sha256(original).hexdigest(),
            'validation': 'GLB bytes identical after gzip decompression'}


def lossless_galaxy():
    from PIL import Image, features
    if not features.check('webp'):
        raise RuntimeError('Pillow requires WebP support to encode the sky.')
    relative = 'spacepark/textures/galaxy-4k.png'
    source = ASSETS / relative
    with Image.open(source) as image:
        pixels = image.convert('RGB')
        dimensions = list(pixels.size)
        expected = sha256(pixels.tobytes()).hexdigest()
        output = BytesIO()
        pixels.save(output, format='WEBP', lossless=True, method=6, exact=True)
    encoded = output.getvalue()
    with Image.open(BytesIO(encoded)) as check:
        assert list(check.size) == dimensions
        assert sha256(check.convert('RGB').tobytes()).hexdigest() == expected, 'Sky pixel round trip failed'
    destination = source.with_suffix('.webp')
    write_atomic(destination, encoded)
    return {'asset': relative, 'optimized': str(destination.relative_to(ASSETS)).replace('\\', '/'),
            'originalBytes': source.stat().st_size, 'deliveredBytes': len(encoded),
            'dimensions': dimensions, 'sha256RGB': expected,
            'validation': 'Decoded RGB pixels identical; sky dimensions unchanged'}


if __name__ == '__main__':
    results = [gzip_glb('spacepark/orbit.glb'), gzip_glb('warehouse/granwarehouse.glb'), lossless_galaxy()]
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps({'method': 'lossless optional delivery; originals retained', 'assets': results}, indent=2), encoding='utf-8')
    for item in results:
        print(f"{item['asset']}: {item['originalBytes']:,} -> {item['deliveredBytes']:,} bytes")
