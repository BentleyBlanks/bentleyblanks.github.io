# -*- coding: utf-8 -*-
"""Pack Type 89 textures from the licensed Sketchfab glTF download (requires Pillow).
Usage: python Script_Type89TextureBake.py <download-directory>
Original PNGs stay outside the repository; only runtime WebP/ORM are delivered.
"""
import argparse
from pathlib import Path
from PIL import Image

TEXTURES = {
    "Type_89_baseColor.png": "Texture_Type89ArmorBase.webp",
    "Type_89_normal.png": "Texture_Type89ArmorNormal.webp",
    "Track_baseColor.png": "Texture_Type89TrackBase.webp",
    "Track_normal.png": "Texture_Type89TrackNormal.webp",
}


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "Texture")
    args = parser.parse_args()
    sources = [(args.source / "textures" / name, output) for name, output in TEXTURES.items()]
    for source, _ in sources:
        if not source.is_file():
            raise FileNotFoundError(source)
    args.output.mkdir(parents=True, exist_ok=True)
    for source, output in sources:
        with Image.open(source) as original:
            image = original.convert("RGB")
            image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            image.save(args.output / output, quality=90, method=6)
            print(output, image.size)
    # Source has diffuse + tangent normal, no authored ORM. Use a uniform dry
    # nonmetal surface rather than borrowing unrelated helmet rust/occlusion.
    Image.new("RGB", (4, 4), (255, 235, 0)).save(args.output / "Texture_Type89Orm.png")


if __name__ == "__main__":
    Main()
