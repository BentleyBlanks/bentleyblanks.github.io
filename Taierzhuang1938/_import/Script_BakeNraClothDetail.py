"""Bake the tiling detail pack for the NRA cotton uniform.

Usage: python Script_BakeNraClothDetail.py [<weave source> <grime source> <Texture directory>]
Defaults read the two Lovart sources kept in `_import/Reference/NraClothDetail/` and write
`Texture/Texture_NraUniformClothDetail.webp`.

The uniform atlas (`Material #1721585337`) is ~1 px/mm but its source is a blurred paint-over,
so at 1-2 m the cloth reads as flat blocks. This pack is sampled a second time at a much higher
repeat on the same UV (see `Data_Tuning_Materials.NRA_CLOTH_DETAIL`):

    R, G  weave normal, tangent-space xy (0.5 = flat), glTF orientation (flipY = false)
    B     weave value: thread crowns bright, gaps dark (0.5 = neutral)
    A     grime / wear (dust, sweat rings, sun-faded blotches), sampled at a low repeat

Both generated photos are not seamless (edge step 10-40 levels vs 0.6-1.2 between neighbours).
Each axis is closed by cross-fading the head of the image into a tail window taken from the
crop offset whose content correlates best with the head; for the twill that picks an in-phase
wale so the band does not blur the threads. The blend is variance preserving so the band keeps
the same contrast as the rest of the tile.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

HERE = Path(__file__).resolve().parent
SOURCE_DIR = HERE / "Reference" / "NraClothDetail"
DEFAULT_WEAVE = SOURCE_DIR / "Source_CottonDrillWeave.webp"
DEFAULT_GRIME = SOURCE_DIR / "Source_UniformGrime.webp"
DEFAULT_OUT = HERE.parent / "Texture"
OUT_NAME = "Texture_NraUniformClothDetail.webp"
SIZE = 512
BAND = 160            # cross-fade width in source pixels
SEARCH = (1500, 1880)  # crop widths tried; SEARCH[1] + BAND must fit in the source
NORMAL_STRENGTH = 5.0  # height units (0..1 over ~4 sigma) -> slope; ~35 deg on thread shoulders


def Luminance(path):
    image = Image.open(path).convert("RGB")
    return np.asarray(image, dtype=np.float64) @ np.array([0.2126, 0.7152, 0.0722])


def BestPeriod(data, axis):
    """Crop length along `axis` whose continuation best matches the head band."""
    # Every 4th line across the band is plenty for the score and keeps the search to seconds.
    data = np.take(data, np.arange(0, data.shape[1 - axis], 4), axis=1 - axis)
    head = np.take(data, np.arange(BAND), axis=axis)
    head = (head - head.mean()) / (head.std() + 1e-9)
    best, bestScore = SEARCH[0], -np.inf
    for length in range(SEARCH[0], min(SEARCH[1], data.shape[axis] - BAND) + 1):
        tail = np.take(data, np.arange(length, length + BAND), axis=axis)
        tail = (tail - tail.mean()) / (tail.std() + 1e-9)
        score = float((head * tail).mean())
        if score > bestScore:
            best, bestScore = length, score
    return best, bestScore


def CloseAxis(data, axis, length):
    """Seamless along `axis`: out[i] = data[i] for i >= BAND, head cross-fades from data[i + length]."""
    out = np.take(data, np.arange(length), axis=axis).copy()
    mean = data.mean()
    weight = (np.arange(BAND) + 0.5) / BAND
    shape = [1, 1]
    shape[axis] = BAND
    w = weight.reshape(shape)
    head = np.take(data, np.arange(BAND), axis=axis) - mean
    tail = np.take(data, np.arange(length, length + BAND), axis=axis) - mean
    blend = (head * w + tail * (1 - w)) / np.sqrt(w * w + (1 - w) * (1 - w))
    index = [slice(None), slice(None)]
    index[axis] = slice(0, BAND)
    out[tuple(index)] = blend + mean
    return out


def Seamless(data, label):
    for axis in (1, 0):
        length, score = BestPeriod(data, axis)
        data = CloseAxis(data, axis, length)
        print(f"{label}: axis {axis} period {length} px (head correlation {score:.3f})")
    return data


def Resize(data, size):
    lo, hi = data.min(), data.max()
    image = Image.fromarray(np.uint8(np.clip((data - lo) / (hi - lo) * 255, 0, 255)))
    # Tile three times so the Lanczos kernel sees wrapped neighbours at the border.
    tiled = Image.new("L", (image.width * 3, image.height * 3))
    for ty in range(3):
        for tx in range(3):
            tiled.paste(image, (tx * image.width, ty * image.height))
    big = tiled.resize((size * 3, size * 3), Image.Resampling.LANCZOS)
    small = np.asarray(big.crop((size, size, size * 2, size * 2)), dtype=np.float64) / 255
    return small * (hi - lo) + lo


def HighPass(data, sigma):
    return data - gaussian_filter(data, sigma, mode="wrap")


def Bake(weavePath=DEFAULT_WEAVE, grimePath=DEFAULT_GRIME, destination=DEFAULT_OUT):
    weave = Resize(Seamless(HighPass(Luminance(weavePath), 48), "weave"), SIZE)
    grime = Resize(Seamless(Luminance(grimePath), "grime"), SIZE)

    # Weave: normalise to +-4 sigma around 0.5, a light blur keeps mip 0 from shimmering.
    weave = gaussian_filter(weave, 0.6, mode="wrap")
    value = np.clip(0.5 + weave / (8 * weave.std()), 0, 1)
    dx = (np.roll(value, -1, axis=1) - np.roll(value, 1, axis=1)) * 0.5 * NORMAL_STRENGTH
    dy = (np.roll(value, -1, axis=0) - np.roll(value, 1, axis=0)) * 0.5 * NORMAL_STRENGTH
    length = np.sqrt(dx * dx + dy * dy + 1)
    # glTF tangent space with flipY = false: +x along +u, +y against +v (image rows grow with v).
    nx, ny = -dx / length, dy / length

    # Grime: keep blotches from ~2 cm up, drop the photo's global gradient, centre at 0.5.
    grime = HighPass(grime, SIZE * 0.22)
    grime = np.clip(0.5 + grime / (6 * grime.std()), 0, 1)

    rgba = np.stack([0.5 + 0.5 * nx, 0.5 + 0.5 * ny, value, grime], axis=-1)
    image = Image.fromarray(np.uint8(np.round(rgba * 255)), "RGBA")
    destination = Path(destination)
    target = destination / OUT_NAME
    image.save(target, quality=90, alpha_quality=100, method=6)
    print(f"wrote {target} ({target.stat().st_size} bytes)")
    stats = {name: (float(channel.mean()), float(channel.std()))
             for name, channel in zip("RGBA", np.moveaxis(rgba, -1, 0))}
    print("channel mean/std", stats)
    return target


if __name__ == "__main__":
    if len(sys.argv) == 4:
        Bake(sys.argv[1], sys.argv[2], sys.argv[3])
    else:
        Bake()
