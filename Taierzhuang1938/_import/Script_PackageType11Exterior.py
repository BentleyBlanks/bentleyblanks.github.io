
"""Package the Type 11 Blender atlas as the runtime WebP set."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageFilter

from Script_BakePbrTexture import Audit, ParseArgs

PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "OneDrive/AI/Models/Blender/Taierzhuang1938/Type11Exterior_20261128/MetalFinish"


def Package(source):
    setName = "Type11Exterior"
    rawPngSha256 = {}
    for channel in ("Base", "Normal", "Orm"):
        stem = f"Texture_{setName}{channel}"
        baked = source / "Bakes" / f"{stem}.png"
        target = PROJECT / "Texture" / f"{stem}.webp"
        with Image.open(baked) as image:
            rgb = image.convert("RGB")
            if rgb.size != (2048, 2048):
                raise ValueError(f"{baked}: expected a 2048 x 2048 Blender bake")
            if channel == "Normal":
                # A one-code-value change keeps machining and bevel normals
                # resolvable while the 1K lossless texture stays compact.
                rgb = rgb.resize((1024, 1024), Image.Resampling.LANCZOS)
                rgb = rgb.point([min(255, round(value / 2) * 2) for value in range(256)] * 3)
            if channel == "Orm":
                ao, roughness, metalness = rgb.resize((1024, 1024), Image.Resampling.BOX).split()
                # Scalar work stays linear. Filter only the AO sampling noise.
                ao = ao.filter(ImageFilter.MedianFilter(3)).point(lambda value: min(255, round(value / 4) * 4))
                roughness = roughness.point(lambda value: min(255, round(value / 4) * 4))
                metalness = metalness.point(lambda value: min(255, round(value / 3) * 3))
                rgb = Image.merge("RGB", (ao, roughness, metalness))
            rgb.save(target, format="WEBP", quality=87, method=6, lossless=channel != "Base")
        rawPngSha256[channel] = hashlib.sha256(baked.read_bytes()).hexdigest()

    Audit(ParseArgs(["--audit", "--name", setName]))
    recordPath = PROJECT / "_import/TextureBakes/Texture_Type11Exterior.json"
    record = json.loads(recordPath.read_text(encoding="utf-8"))
    record["generator"] = "Blender Cycles / Script_Type11ExteriorBake.py / Script_PackageType11Exterior.py"
    record["date"] = "2026-11-28"
    record["source"] = {
        "provider": "procedural",
        "blenderFile": "Type11Exterior_20261128/MetalFinish/Model_Type11Exterior.blend",
        "rawPngSha256": rawPngSha256,
        "note": "Museum photographs guide the steel oxide, polishing, machining and pitting masks; the atlas uses no photographic pixels.",
        "encoding": {
            "Base": "2048 px, sRGB WebP quality 87",
            "Normal": "1024 px, linear lossless WebP; at most one code value quantization after filtering",
            "Orm": "1024 px, linear lossless WebP; AO/roughness/metalness quantization steps 4/4/3",
        },
    }
    recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=DEFAULT_SOURCE, type=Path)
    Package(parser.parse_args().source)
