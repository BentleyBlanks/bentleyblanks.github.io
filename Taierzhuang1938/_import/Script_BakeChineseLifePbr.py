"""Compress the approved ChineseLife PBR maps for browser runtime.

The Sketchfab downloader intentionally excludes ``Model_*/textures/`` from Git because the
original 2K packs are large.  To rebuild these outputs, download the source packs with
``Script_ChineseLifeFetch.py`` after temporarily setting ``SKIP_TEXTURES = False``, then run:

    python Taierzhuang1938/_import/Script_BakeChineseLifePbr.py

Only the two source materials whose visual identity is valid are restored here.  The upstream
``ShopPlaque`` texture is a carved sign reading “首播”, not a removable storefront door board;
that asset uses ``BuildWeaponPbr.py`` with the approved imagegen wood source instead.
"""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_import" / "Source"
TEXTURE = ROOT / "Texture"
SIZE = 512
QUALITY = {"Base": 90, "Normal": 92, "Orm": 92}

MATERIALS = {
    "StoneWellOriginal": (
        "Model_SketchfabStoneWell",
        "WellTube_baseColor.png",
        "WellTube_normal.png",
        "WellTube_metallicRoughness.png",
    ),
    "StoneMillOriginal": (
        "Model_SketchfabStoneMillWheel",
        "Normal_Map_baseColor.png",
        "Normal_Map_normal.png",
        "Normal_Map_metallicRoughness.png",
    ),
}


def Bake(stem: str, folder: str, base: str, normal: str, orm: str) -> None:
    source_dir = SOURCE / folder / "textures"
    for channel, file_name in (("Base", base), ("Normal", normal), ("Orm", orm)):
        source = source_dir / file_name
        if not source.is_file():
            raise FileNotFoundError(f"missing ChineseLife source map: {source}")
        image = Image.open(source).convert("RGB")
        small = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
        target = TEXTURE / f"Texture_{stem}{channel}.webp"
        small.save(target, "WEBP", quality=QUALITY[channel], method=6)
        print(f"{source.name} {image.width}px -> {target.name} {target.stat().st_size} bytes")


if __name__ == "__main__":
    TEXTURE.mkdir(parents=True, exist_ok=True)
    for material_stem, source_spec in MATERIALS.items():
        Bake(material_stem, *source_spec)
