"""Canonicalize the approved imagegen cloth atlas and bake its PBR/mask maps.

Python 3 + numpy + Pillow. This is an author UV atlas, never a repeating tile.
The source PNG is a physical 1.4 x 1.9 m rectangle encoded into square UV space;
that affine encoding restores the original yarn aspect ratio on the model.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

projectDir = Path(__file__).resolve().parents[1]
sourcePath = projectDir / "_import/Source/SingleBlanket/Texture_SingleBlanketSource.png"


def PrepareSource(inputPath):
    with Image.open(inputPath) as sourceImage:
        rgba = np.asarray(sourceImage.convert("RGBA"))
    foreground = rgba[..., 3] > 24
    rows, columns = np.nonzero(foreground)
    if not len(rows):
        raise ValueError("Generated source has no visible cloth")
    cropBox = (int(columns.min()), int(rows.min()), int(columns.max()) + 1, int(rows.max()) + 1)
    atlasImage = Image.fromarray(rgba).crop(cropBox).resize((1024, 1024), Image.Resampling.LANCZOS)
    atlas = np.asarray(atlasImage).copy()
    # Keep invisible RGB neutral; black outside the alpha would contaminate the
    # derivative normal map, colour metrics and bilinear edge sampling.
    bodyRgb = np.median(atlas[atlas[..., 3] > 250, :3], axis=0).astype(np.uint8)
    atlas[atlas[..., 3] < 8, :3] = bodyRgb
    sourcePath.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas).save(sourcePath, optimize=True)
    print(json.dumps({"crop": cropBox, "canonicalSource": str(sourcePath), "size": [1024, 1024]}))


def BakeMask():
    # Image top is the head (-Y). Pelvis y=+0.05 maps to image y=0.5263.
    rng = np.random.default_rng(19380317)
    y, x = np.mgrid[0:1024, 0:1024] / 1023.0
    coarse = Image.fromarray(np.uint8(rng.random((64, 64)) * 255)).resize((1024, 1024), Image.Resampling.BICUBIC)
    noise = np.asarray(coarse, dtype=np.float64) / 255.0
    edge = np.minimum.reduce([x, 1-x, y, 1-y])
    mud = np.clip((0.15-edge) / 0.15, 0, 1) * (0.28 + 0.72*noise)
    mud = np.maximum(mud, np.exp(-((y-0.93)/0.15)**2) * (0.22+0.65*noise))
    blood = np.zeros_like(x)
    for centerX, centerY, radiusX, radiusY, amount in [
        (0.50, 0.52, 0.13, 0.09, 0.90),
        (0.49, 0.44, 0.16, 0.13, 1.00),
        (0.52, 0.33, 0.11, 0.11, 0.72),
    ]:
        blob = np.exp(-2.0*(((x-centerX)/radiusX)**2+((y-centerY)/radiusY)**2))
        blood = np.maximum(blood, amount*blob)
    blood = np.clip(blood * (0.63+0.52*noise), 0, 1)
    mask = np.stack([mud, blood, np.zeros_like(x)], axis=2)
    maskPath = projectDir / "Texture/Texture_SingleBlanketMask.webp"
    Image.fromarray(np.uint8(np.clip(mask, 0, 1)*255+0.5)).save(maskPath, lossless=True, method=6)
    print(json.dumps({"mask": str(maskPath), "channels": "R=mud G=blood B=0", "size": [1024, 1024]}))


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Optional original imagegen RGBA; default reuses the committed canonical PNG")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.source:
        PrepareSource(args.source)
    if not sourcePath.exists():
        raise FileNotFoundError(sourcePath)
    command = [sys.executable, str(projectDir / "_import/Script_BakePbrTexture.py"),
        "--source", str(sourcePath), "--name", "SingleBlanket", "--preset", "singleBlanketAtlas",
        "--tile-m", "1.630950643", "--size", "1024", "--data-size", "1024",
        "--pack", "orm", "--seamless", "none", "--no-flatten", "--keep-alpha",
        # Approved V3 cloth crop's display palette: warm gray-brown, without
        # the previous cool/green bias. These are image sRGB statistics, not
        # a measured historical albedo. Full strength avoids source mean leak.
        "--mean", "0.655,0.601,0.548", "--contrast", "0.0804", "--tone-strength", "1.0",
        "--normal-convention", "gl", "--relief-m", "0.00012", "--normal-strength", "0.8",
        "--rough", "0.90", "--rough-var", "0.006", "--rough-min", "0.85", "--ao", "0.04", "--metal", "0",
        "--base-quality", "90", "--data-quality", "90", "--data-lossless",
        "--uv-atlas-reason", "One non-repeating 1.4x1.9m worn sheet, five user-approved repair patches; square UV encoding compensates the physical cloth aspect ratio",
        "--strict"]
    if args.dry_run:
        command.append("--dry-run")
    subprocess.run(command, check=True)
    if not args.dry_run:
        BakeMask()


if __name__ == "__main__":
    Main()
