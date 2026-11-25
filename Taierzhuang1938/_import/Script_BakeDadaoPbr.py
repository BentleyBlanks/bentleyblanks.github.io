"""Bake the OpenAI material swatches into the runtime dadao UV atlas."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SIZE = 1024
PAD_X = 16
PAD_Y = 20
TILE_SIZE = (SIZE - 2 * PAD_X, SIZE // 4 - 2 * PAD_Y)


def ReadSwatch(image, box, repeats=(1, 1)):
    swatch = image.crop(box)
    repeatU, repeatV = repeats
    tiled = Image.new("RGB", (swatch.width * repeatU, swatch.height * repeatV))
    for row in range(repeatV):
        for column in range(repeatU):
            tile = ImageOps.mirror(swatch) if column % 2 else swatch
            tile = ImageOps.flip(tile) if row % 2 else tile
            tiled.paste(tile, (column * swatch.width, row * swatch.height))
    return np.asarray(tiled.resize(TILE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32)


def Luminance(rgb):
    return rgb @ np.array([.2126, .7152, .0722], dtype=np.float32)


def NormalAndGrain(rgb, strength):
    luma = Luminance(rgb)
    lowPass = np.asarray(Image.fromarray(luma.astype(np.uint8))
                         .filter(ImageFilter.GaussianBlur(3)), dtype=np.float32)
    grain = (luma - lowPass) / 255
    dy, dx = np.gradient(grain * strength)
    # Pixel rows run downward. The OpenGL tangent V axis runs upward.
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return 127.5 * (normal + 1), grain


def MetalMaps(rgb, blade):
    normal, grain = NormalAndGrain(rgb, 2.6)
    base = 1.03 * rgb + np.array([29, 22, 15])
    roughness = .65 - .55 * grain
    metalness = .76 + .65 * grain
    if blade:
        # A narrow change in polish follows the existing bevel UV. Let the
        # generated steel grain continue across that transition.
        across = np.linspace(0, 1, rgb.shape[0], dtype=np.float32)[:, None]
        bevel = np.clip((across - .84) / .14, 0, 1) ** 1.5
        base += bevel[..., None] * np.array([26, 30, 34])
        roughness -= .13 * bevel
        metalness += .10 * bevel
    else:
        base *= .86
        roughness += .07
    ao = np.ones_like(grain) * .98
    return base, normal, 255 * np.stack((ao, roughness, metalness), axis=2)


def CottonMaps(rgb):
    normal, grain = NormalAndGrain(rgb, 3.35)
    base = .93 * rgb + np.array([13, 9, 5])
    length = np.linspace(0, 1, rgb.shape[1], dtype=np.float32)[None, :]
    around = np.linspace(0, 1, rgb.shape[0], dtype=np.float32)[:, None]
    lap = (.5 + .5 * np.cos(np.pi * 2 * (length * (85 / 6.4) - around + .16))) ** 8
    base *= 1 - .09 * lap[..., None]
    ao = .96 - .06 * lap + .40 * np.minimum(grain, 0)
    roughness = np.clip(.89 - .30 * grain, .82, .95)
    metalness = np.zeros_like(grain)
    return base, normal, 255 * np.stack((ao, roughness, metalness), axis=2)


def Bake(source, output):
    with Image.open(source) as image:
        image = image.convert("RGB")
    if image.size != (1536, 1024):
        raise ValueError(f"Expected the 1536 × 1024 OpenAI swatch, got {image.size}")
    strips = (
        MetalMaps(ReadSwatch(image, (34, 70, 729, 342)), blade=True),
        MetalMaps(ReadSwatch(image, (35, 397, 730, 669)), blade=True),
        CottonMaps(ReadSwatch(image, (812, 308, 1480, 550), repeats=(3, 2))),
        MetalMaps(ReadSwatch(image, (50, 697, 720, 976)), blade=False),
    )
    output.mkdir(parents=True, exist_ok=True)
    for channel, (stem, quality) in enumerate((("Base", 86), ("Normal", 84), ("Orm", 86))):
        atlas = np.concatenate([
            np.pad(maps[channel], ((PAD_Y, PAD_Y), (PAD_X, PAD_X), (0, 0)), mode="edge")
            for maps in strips
        ])
        path = output / f"Texture_Dadao{stem}.webp"
        image = Image.fromarray(np.uint8(np.clip(np.rint(atlas), 0, 255)))
        image.save(path, "WEBP", quality=quality, method=6)
        print(f"{path.name} {path.stat().st_size:,} bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="OpenAI-generated Texture_DadaoSource.png")
    parser.add_argument("--out", type=Path, default=ROOT / "Texture")
    args = parser.parse_args()
    Bake(args.source, args.out)
