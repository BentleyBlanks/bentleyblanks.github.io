"""Pack the OpenAI source swatches into the grenade's shared cylindrical UV atlas."""

import argparse
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace

import numpy as np
from PIL import Image

from Script_BakePbrTexture import Audit

PROJECT = Path(__file__).resolve().parents[1]
BAKER = Path(__file__).with_name("Script_BakePbrTexture.py")
CHANNEL_SIZES = {"Base": 1024, "Normal": 512, "Orm": 256}


def BakeSwatch(image, name, folder, settings):
    path = folder / f"Source_{name}.png"
    image.save(path)
    # Bake each material in isolation so wood/iron cannot bleed into its
    # neighbor through the height and roughness filters.
    subprocess.run(
        [
            sys.executable, str(BAKER), "--source", str(path), "--name", name,
            "--out", str(folder), "--preview-dir", str(folder), "--no-record",
            "--size", "512", "--data-size", "256", "--base-quality", "97",
            "--data-lossless", "--seamless", "weld", "--row-flatten", "off",
            "--uv-atlas-reason", "One swatch of the cylindrical wood and iron atlas",
            *settings,
        ],
        check=True,
    )


def FinishIronEnds(image):
    # The planar caps have dedicated UV bands. Their dark satin finish avoids
    # reflecting the studio key as a single bright disk across the whole face.
    pixels = np.array(image)
    v = 1 - (np.arange(image.height) + 0.5) / image.height
    mask = np.maximum((v - 0.73) / 0.016, (0.187 - v) / 0.017)
    weight = np.clip(mask, 0, 1)
    weight = (weight * weight * (3 - 2 * weight))[:, None]
    pixels[:, :, 1] = np.rint(np.minimum(pixels[:, :, 1] + 60 * weight, 255)).astype(np.uint8)
    pixels[:, :, 2] = np.rint(pixels[:, :, 2] * (1 - 0.44 * weight)).astype(np.uint8)
    return Image.fromarray(pixels)


def PackChannel(folder, channel):
    size = CHANNEL_SIZES[channel]
    column = size // 2
    pad = size * 12 // CHANNEL_SIZES["Base"]
    atlas = Image.new("RGB", (size, size))
    for index, swatch in enumerate(("GrenadeWood", "GrenadeIron")):
        with Image.open(folder / f"Texture_{swatch}{channel}.webp") as image:
            innerWidth = column - 2 * pad
            body = image.convert("RGB").resize((innerWidth, size), Image.Resampling.LANCZOS)
        if swatch == "GrenadeIron" and channel == "Orm":
            body = FinishIronEnds(body)
        start = index * column
        atlas.paste(body, (start + pad, 0))
        # Wrap the U interval through the gutter at both ends of the cylinder.
        atlas.paste(body.crop((innerWidth - pad, 0, innerWidth, size)), (start, 0))
        atlas.paste(body.crop((0, 0, pad, size)), (start + column - pad, 0))
    file = PROJECT / "Texture" / f"Texture_Grenade{channel}.webp"
    if channel == "Base":
        atlas.save(file, quality=87, method=6)
    elif channel == "Normal":
        atlas.save(file, quality=93, method=6, use_sharp_yuv=True)
    else:
        atlas.save(file, lossless=True, method=6)


def Build(source):
    with Image.open(source) as image:
        width, height = image.size
        wood = image.convert("RGB").crop((width * 3 // 100, height // 32, width * 47 // 100, height * 31 // 32))
        iron = image.convert("RGB").crop((width * 53 // 100, height // 16, width * 97 // 100, height * 15 // 16))
    with TemporaryDirectory(prefix="GongxianGrenadeAtlas") as name:
        folder = Path(name)
        BakeSwatch(
            wood, "GrenadeWood", folder,
            ["--preset", "weatheredWood", "--mean", "0.58,0.42,0.27", "--contrast", "0.042",
             "--tile-m", "0.13", "--rough", "0.67", "--rough-var", "0.07",
             "--relief-m", "0.00011", "--ao", "0.12", "--metal", "0"],
        )
        BakeSwatch(
            iron, "GrenadeIron", folder,
            ["--preset", "wornSteel", "--mean", "0.19,0.183,0.174", "--contrast", "0.020",
             "--tile-m", "0.15", "--rough", "0.43", "--rough-var", "0.09",
             "--relief-m", "0.00015", "--ao", "0.16", "--metal", "0.73"],
        )
        for channel in CHANNEL_SIZES:
            PackChannel(folder, channel)

    Audit(SimpleNamespace(
        name="Grenade", pack="orm", out=str(PROJECT / "Texture"),
        tile_m=None, preset_given=False, normal_convention="gl",
    ))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="OpenAI split wood/iron source image")
    Build(parser.parse_args().source)
