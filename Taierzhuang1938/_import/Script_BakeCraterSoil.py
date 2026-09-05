"""Pack the authored crater albedo and derive aligned micro-normal/ORM maps.

Usage: python Script_BakeCraterSoil.py <imagegen source.png> <Texture directory>
The generated photograph supplies color; luminance only supplies small (millimetre)
relief, not crater geometry. Terrain/collision depth remains the shared lattice.
"""
import math
import sys
from pathlib import Path
from PIL import Image, ImageFilter


def Bake(source, destination):
    destination = Path(destination)
    image = Image.open(source).convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
    image.save(destination / "Texture_CraterScorchedBase.webp", quality=92, method=6)
    height = image.convert("L").filter(ImageFilter.GaussianBlur(1.1))
    broad = height.filter(ImageFilter.GaussianBlur(9))
    pixels, macro = height.load(), broad.load()
    normal, orm = Image.new("RGB", image.size), Image.new("RGB", image.size)
    normals, packed = normal.load(), orm.load()
    width, rows = image.size
    for y in range(rows):
        for x in range(width):
            dx = (pixels[(x - 1) % width, y] - pixels[(x + 1) % width, y]) * 0.019
            dy = (pixels[x, (y + 1) % rows] - pixels[x, (y - 1) % rows]) * 0.019
            length = math.sqrt(dx * dx + dy * dy + 1)
            normals[x, y] = (round(127.5 + 127.5 * dx / length),
                             round(127.5 + 127.5 * dy / length), round(127.5 + 127.5 / length))
            crevice = max(0, macro[x, y] - pixels[x, y])
            packed[x, y] = (round(max(145, 255 - crevice * 2)),
                            round(min(252, 222 + crevice * 0.55)), 0)
    normal.save(destination / "Texture_CraterScorchedNormal.webp", quality=92, method=6)
    orm.save(destination / "Texture_CraterScorchedOrm.webp", quality=92, method=6)


if __name__ == "__main__":
    Bake(sys.argv[1], sys.argv[2])
