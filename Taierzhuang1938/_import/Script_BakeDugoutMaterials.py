"""Bake the texture inputs for the DugoutAidOpenFields GLB with the shared PBR baker."""

import json
import sys
from pathlib import Path

from PIL import Image

from Script_BakePbrTexture import Bake, ParseArgs


PROJECT = Path(__file__).resolve().parents[1]
SOURCES = PROJECT / "_import" / "DugoutAidOpenFields"
TARGET = PROJECT.parent / "tmp" / "DugoutAidOpenFields" / "MaterialBake"


def Main():
    recipes = json.loads((SOURCES / "Data_DugoutMaterialSources.json").read_text(encoding="utf-8"))["materials"]
    for recipe in recipes:
        name = recipe["id"]
        number = lambda key: str(recipe[key])
        args = ParseArgs([
            "--source", str(SOURCES / f"Source_{name}.webp"),
            "--name", f"Dugout{name}", "--preset", recipe["preset"],
            "--tile-m", number("tileM"), "--size", number("size"), "--data-size", number("dataSize"),
            "--mean", ",".join(map(str, recipe["mean"])), "--contrast", number("contrast"),
            "--relief-m", number("reliefM"), "--rough", number("rough"), "--rough-var", "0.065",
            "--ao", number("ao"), "--seamless", recipe["seamless"], "--row-flatten", "off",
            "--flatten-sigma", "0.19", "--height-fine-weight", "0.53",
            "--base-quality", "98", "--data-lossless", "--no-record",
            "--out", str(TARGET), "--preview-dir", str(TARGET / "Preview"),
        ])
        if Bake(args):
            raise RuntimeError(f"PBR bake did not complete for {name}")
        stem = TARGET / f"Texture_Dugout{name}"
        # Baseline glTF supports JPEG and PNG in any browser. Keep data maps
        # lossless through export, and avoid putting stand-alone textures on the site.
        with Image.open(f"{stem}Base.webp") as image:
            image.convert("RGB").save(f"{stem}Base.jpg", quality=92, subsampling=0)
        with Image.open(f"{stem}Normal.webp") as image:
            image.convert("RGB").save(f"{stem}Normal.png", compress_level=8)
        with Image.open(f"{stem}Orm.webp") as image:
            orm = image.convert("RGB")
            orm.thumbnail((512, 512), Image.Resampling.BOX)
            orm.save(f"{stem}Orm.png", compress_level=8)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    Main()
