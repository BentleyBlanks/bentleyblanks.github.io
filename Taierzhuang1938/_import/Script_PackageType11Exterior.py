
"""Package the Type 11 Blender atlas as the runtime WebP set."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageFilter

from Script_BakePbrTexture import Audit, ParseArgs

PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path.home() / "OneDrive/AI/Models/Blender/Taierzhuang1938/Type11Exterior_20261128"


def Package(source):
    setName = "Type11Exterior"
    rawPngSha256 = {}
    for channel in ("Base", "Normal", "Orm"):
        stem = f"Texture_{setName}{channel}"
        baked = source / "Bakes" / f"{stem}.png"
        target = PROJECT / "Texture" / f"{stem}.webp"
        with Image.open(baked) as image:
            rgb = image.convert("RGB")
            if channel == "Orm":
                ao, roughness, metalness = rgb.split()
                # Suppress Cycles' AO sampling noise and retain scalar data in lossless WebP.
                ao = ao.filter(ImageFilter.MedianFilter(3)).point(lambda value: min(255, round(value / 4) * 4))
                roughness = roughness.point(lambda value: min(255, round(value / 2) * 2))
                rgb = Image.merge("RGB", (ao, roughness, metalness))
            rgb.save(target, format="WEBP", quality=86, method=6, lossless=channel != "Base")
        rawPngSha256[channel] = hashlib.sha256(baked.read_bytes()).hexdigest()

    Audit(ParseArgs(["--audit", "--name", setName]))
    recordPath = PROJECT / "_import/TextureBakes/Texture_Type11Exterior.json"
    record = json.loads(recordPath.read_text(encoding="utf-8"))
    record["generator"] = "Blender Cycles / Script_Type11ExteriorBake.py / Script_PackageType11Exterior.py"
    record["date"] = "2026-11-28"
    record["source"] = {
        "provider": "procedural",
        "blenderFile": "Type11Exterior_20261128/Model_Type11Exterior.blend",
        "rawPngSha256": rawPngSha256,
        "note": "Procedure uses museum photos as visual references and bakes no photographic pixels.",
    }
    recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=DEFAULT_SOURCE, type=Path)
    Package(parser.parse_args().source)
