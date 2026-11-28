"""Encode the Type92Hmg Blender atlas and audit the runtime WebPs."""
import argparse
import hashlib
import json
import os
from pathlib import Path

from PIL import Image

from Script_BakePbrTexture import Audit, ParseArgs

PROJECT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(os.environ.get("TZ1938_TYPE92_HMG_SOURCE") or
                      Path.home() / "OneDrive/AI/Models/Blender/Taierzhuang1938/Type92Hmg/Exterior_20261128")


def Sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def Package(source):
    setName = "Type92HmgExterior"
    outputs = {}
    for channel in ("Base", "Normal", "Orm"):
        stem = f"Texture_{setName}{channel}"
        baked = source / "Bakes" / f"{stem}.png"
        target = PROJECT / "Texture" / f"{stem}.webp"
        with Image.open(baked) as image:
            rgb = image.convert("RGB")
            if channel == "Orm":
                # AO and roughness are low frequency. Keep packed channel values
                # independent, including the metalness transitions at chart edges.
                rgb = rgb.resize((512, 512), Image.Resampling.BOX)
                occlusion, roughness, metalness = rgb.split()
                levels = [min(255, 4 * round(value / 4)) for value in range(256)]
                rgb = Image.merge("RGB", (occlusion.point(levels), roughness.point(levels), metalness))
            rgb.save(target, format="WEBP", quality=87, method=6, lossless=channel != "Base")
        outputs[channel] = Sha(baked)
    Audit(ParseArgs(["--audit", "--name", setName]))
    recordPath = PROJECT / "_import/TextureBakes" / f"Texture_{setName}.json"
    record = json.loads(recordPath.read_text(encoding="utf-8"))
    record["generator"] = "Blender Cycles / Script_Type92HmgExteriorBake.py / Script_PackageType92HmgExterior.py"
    record["date"] = "2026-11-28"
    record["source"] = {
        "provider": "procedural",
        "blenderFile": "Type92Hmg/Exterior_20261128/Model_Type92HmgExterior.blend",
        "rawPngSha256": outputs,
        "note": "Reference-guided procedural finish; no photographic pixels in the atlas.",
    }
    recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=DEFAULT_SOURCE, type=Path)
    arguments = parser.parse_args()
    Package(arguments.source)
