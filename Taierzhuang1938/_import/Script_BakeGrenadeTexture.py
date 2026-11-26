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


def SmoothFade(value):
    weight = np.clip(value, 0, 1)
    return weight * weight * (3 - 2 * weight)


def FinishWood(image, channel):
    # Colour soaked into the wood spreads beyond the metal contact. V increases
    # from the heel to the collar in the cylindrical atlas.
    pixels = np.array(image)
    u = (np.arange(image.width) + 0.5) / image.width
    v = 1 - (np.arange(image.height) + 0.5) / image.height
    edge = 0.013 * np.cos(2 * np.pi * u + 0.65) + 0.008 * np.sin(6 * np.pi * u)
    collar = SmoothFade((v[:, None] - 0.75 + edge) / 0.215)
    heel = SmoothFade((0.087 - v[:, None] - edge * 0.4) / 0.063)
    if channel == "Base":
        glaze = 1 - collar[:, :, None] * np.asarray((0.14, 0.59, 0.70))
        handling = 1 - heel[:, :, None] * np.asarray((0.16, 0.24, 0.24))
        pixels = np.rint(pixels * glaze * handling).astype(np.uint8)
    else:
        # The open shaft carries a rubbed sheen and the joints hold quieter dirt.
        pixels[:, :, 1] = np.rint(
            np.clip(pixels[:, :, 1] + 23 * collar + 15 * heel, 0, 255)
        ).astype(np.uint8)
    return Image.fromarray(pixels)


def FinishIronEnds(image, channel):
    # Dedicated planar UV bands keep the cap faces satin, with the dark iron's
    # low reflectance instead of the white glare of a dielectric top coat.
    pixels = np.array(image)
    v = 1 - (np.arange(image.height) + 0.5) / image.height
    mask = np.maximum((v - 0.73) / 0.016, (0.187 - v) / 0.017)
    weight = SmoothFade(mask)[:, None]
    if channel == "Base":
        pixels = np.rint(pixels * (1 - 0.24 * weight[:, :, None])).astype(np.uint8)
    else:
        pixels[:, :, 1] = np.rint(np.minimum(pixels[:, :, 1] + 108 * weight, 255)).astype(np.uint8)
        pixels[:, :, 2] = np.rint(pixels[:, :, 2] * (1 - weight) + 238 * weight).astype(np.uint8)
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
        if channel != "Normal":
            body = FinishWood(body, channel) if swatch == "GrenadeWood" else FinishIronEnds(body, channel)
        start = index * column
        atlas.paste(body, (start + pad, 0))
        # Wrap the U interval through the gutter at both ends of the cylinder.
        atlas.paste(body.crop((innerWidth - pad, 0, innerWidth, size)), (start, 0))
        atlas.paste(body.crop((0, 0, pad, size)), (start + column - pad, 0))
    file = PROJECT / "Texture" / f"Texture_Grenade{channel}.webp"
    if channel == "Base":
        atlas.save(file, quality=76, method=6, use_sharp_yuv=True)
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
            ["--preset", "weatheredWood", "--mean", "0.66,0.49,0.346", "--contrast", "0.064",
             "--tile-m", "0.13", "--rough", "0.44", "--rough-var", "0.09", "--rough-luma-k", "-0.25",
             "--relief-m", "0.00013", "--ao", "0.16", "--metal", "0"],
        )
        BakeSwatch(
            iron, "GrenadeIron", folder,
            ["--preset", "wornSteel", "--mean", "0.105,0.091,0.080", "--contrast", "0.026",
             "--tile-m", "0.15", "--rough", "0.27", "--rough-min", "0.19",
             "--rough-var", "0.12", "--rough-luma-k", "-0.23",
             "--relief-m", "0.00016", "--ao", "0.21", "--metal", "0.78"],
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
