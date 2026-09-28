"""Bake the two tiling detail packs of the character surface layer (2026-09-28, 3A pass B3).

Usage:
  python Script_BakeCharacterDetail.py [--wool <weave source>] [--grime <grime source>]
                                       [--skin <skin source>] [--out <Texture directory>]

Sources are Lovart photos kept out of the repository in `_shots/Gap3A_Source/B3/` (ignored);
the grime photo is the NRA one already in `_import/Reference/NraClothDetail/`. Both packs follow
the NRA cloth pack layout (`Script_BakeNraClothDetail.py`, same seamless closing and resize) and
are sampled a second time at a high repeat on the atlas UV of the character material:

  Texture_IjaUniformWoolDetail.webp   (Data_Tuning_Materials.IJA_WOOL_DETAIL)
    R, G  serge twill normal, tangent-space xy (0.5 = flat), glTF orientation (flipY = false)
    B     twill value: rib crowns bright, gaps dark (0.5 = neutral)
    A     grime / wear (dust, sun-faded blotches), sampled at a low repeat

  Texture_CharacterSkinDetail.webp    (Data_Tuning_Materials.CHARACTER_SKIN)
    R, G  pore and skin-line normal, tangent-space xy (0.5 = flat)
    B     cavity value: pores and lines dark (0.5 = neutral)
    A     sebum / roughness variation: lines and pores rougher (0.5 = neutral)

Why a second pack instead of reusing the NRA one: the Type 98 wool serge is a finer, felted twill
than the NRA cotton drill, and skin has no fabric at all. The skin pack takes the sampler slot the
GLB's `specularIntensityMap` used to hold (three reads that map's alpha; every character spec map
is an RGB WebP, so it was a constant 1 - see docs/Data_CharacterStandard.md, 2026-09-28).
"""
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

from Script_BakeNraClothDetail import Luminance, Seamless, Resize, HighPass, DEFAULT_GRIME

HERE = Path(__file__).resolve().parent
SOURCE_DIR = HERE.parent / "_shots" / "Gap3A_Source" / "B3"
DEFAULT_WOOL = SOURCE_DIR / "IjaWoolSerge" / "lovart_3710010418a9.png"
DEFAULT_SKIN = SOURCE_DIR / "SkinMicroDetail" / "lovart_4b91632ca3ee.png"
DEFAULT_OUT = HERE.parent / "Texture"
SIZE = 512


def NormalFrom(value, strength):
    """Tangent-space xy from a height field in 0..1 (glTF, flipY = false: +y against +v)."""
    dx = (np.roll(value, -1, axis=1) - np.roll(value, 1, axis=1)) * 0.5 * strength
    dy = (np.roll(value, -1, axis=0) - np.roll(value, 1, axis=0)) * 0.5 * strength
    length = np.sqrt(dx * dx + dy * dy + 1)
    return -dx / length, dy / length


def Save(rgba, target):
    image = Image.fromarray(np.uint8(np.round(np.clip(rgba, 0, 1) * 255)), "RGBA")
    image.save(target, quality=88, alpha_quality=100, method=6)
    stats = {name: (round(float(c.mean()), 3), round(float(c.std()), 3))
             for name, c in zip("RGBA", np.moveaxis(rgba, -1, 0))}
    print(f"wrote {target} ({target.stat().st_size} bytes) channel mean/std {stats}")
    return target


def BakeWool(woolPath, grimePath, destination):
    # The serge photo is ~0.03 mm/px; ribs ~25 px apart. Drop the weave-scale lighting drift first.
    weave = Resize(Seamless(HighPass(Luminance(woolPath), 40), "wool weave"), SIZE)
    grime = Resize(Seamless(Luminance(grimePath), "grime"), SIZE)
    weave = gaussian_filter(weave, 0.6, mode="wrap")
    value = np.clip(0.5 + weave / (8 * weave.std()), 0, 1)
    nx, ny = NormalFrom(value, 4.0)
    # Same grime treatment as the NRA pack, flipped so the two uniforms never share blotches.
    grime = HighPass(grime, SIZE * 0.22)[::-1, :]
    grime = np.clip(0.5 + grime / (6 * grime.std()), 0, 1)
    rgba = np.stack([0.5 + 0.5 * nx, 0.5 + 0.5 * ny, value, grime], axis=-1)
    return Save(rgba, Path(destination) / "Texture_IjaUniformWoolDetail.webp")


def BakeSkin(skinPath, destination):
    lum = Luminance(skinPath)
    # Pores and the diamond line pattern live below ~1 mm (~30 px in the 3 cm source).
    fine = Resize(Seamless(HighPass(lum, 24), "skin fine"), SIZE)
    fine = gaussian_filter(fine, 0.5, mode="wrap")
    value = np.clip(0.5 + fine / (7 * fine.std()), 0, 1)
    nx, ny = NormalFrom(value, 3.2)
    # Sebum: lines and pores catch dirt and read rougher; the flat patches between them are oilier.
    oil = gaussian_filter(fine, 2.0, mode="wrap")
    oil = np.clip(0.5 - oil / (6 * oil.std()), 0, 1)
    rgba = np.stack([0.5 + 0.5 * nx, 0.5 + 0.5 * ny, value, oil], axis=-1)
    return Save(rgba, Path(destination) / "Texture_CharacterSkinDetail.webp")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--wool", default=str(DEFAULT_WOOL))
    parser.add_argument("--grime", default=str(DEFAULT_GRIME))
    parser.add_argument("--skin", default=str(DEFAULT_SKIN))
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--only", choices=["wool", "skin"], default=None)
    args = parser.parse_args()
    if args.only in (None, "wool"):
        BakeWool(args.wool, args.grime, args.out)
    if args.only in (None, "skin"):
        BakeSkin(args.skin, args.out)
