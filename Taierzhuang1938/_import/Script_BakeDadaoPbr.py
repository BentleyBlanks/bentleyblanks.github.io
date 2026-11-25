"""Bake the approved three views and the Image 2.6 surface swatches to PBR."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_erosion, distance_transform_edt, gaussian_filter

from Script_TraceDadaoThreeViews import ReadViews


ROOT = Path(__file__).resolve().parents[1]
FIT = ROOT / "_blender" / "Data_SichuanDadaoThreeViewFit.json"
BASE_SIZE = 2048
DATA_SIZE = 1024
# Diffuse gains measured against the approved sheet in the neutral comparison studio.
LIGHTING_GAINS = (
    ((.676, .622, .608), (.743, .716, .654)),
    ((.669, .604, .591), (.693, .673, .558)),
    ((.561, .430, .359), (.862, .796, .661)),
    ((.672, .613, .600), (.718, .694, .606)),
)


def Resize(image, shape):
    return np.array(Image.fromarray(image).resize(shape, Image.Resampling.LANCZOS), dtype=np.float32) / 255


def ProjectView(image, mask, atlasRect, shape):
    left, top, right, bottom = atlasRect
    image = image[top:bottom + 1, left:right + 1]
    mask = mask[top:bottom + 1, left:right + 1]
    interior = binary_erosion(mask)
    nearest = distance_transform_edt(~interior, return_distances=False, return_indices=True)
    return Resize(image[nearest[0], nearest[1]], shape)


def WrapWeight(atlas, shape):
    u = np.linspace(atlas["left"], atlas["right"], shape[0])
    # Feather only the junctions. The exposed cotton spans the observed wrap.
    return (np.clip((u - 1537) / 8, 0, 1) * np.clip((2095 - u) / 10, 0, 1))[None, :]


def FillUnseen(swatches, reference, atlas, shape):
    with Image.open(swatches) as image:
        image = image.convert("RGB")
        width, height = image.size
        if (width, height) != (3840, 2160):
            raise ValueError("Expected the 4K Image 2.6 material sheet")
        iron = Resize(np.array(image.crop((80, 100, width//2 - 100, height - 100))), shape)
        cotton = Resize(np.array(image.crop((width//2 + 100, 100, width - 80, height - 100))), shape)
    ironTarget = np.median(reference[270:397, 580:1155], axis=(0, 1)) / 255
    cottonTarget = np.median(reference[280:346, 1640:2035], axis=(0, 1)) / 255
    iron *= ironTarget / np.median(iron, axis=(0, 1))
    cotton *= cottonTarget / np.median(cotton, axis=(0, 1))
    wrap = WrapWeight(atlas, shape)[..., None]
    return np.clip(iron * (1 - wrap) + cotton * wrap, 0, 1)


def PackStrips(tiles, size):
    factor = size // 1024
    return np.concatenate([
        np.pad(tile, ((20*factor, 20*factor), (16*factor, 16*factor), (0, 0)), mode="edge")
        for tile in tiles
    ])


def DataMaps(color, wrap):
    luma = color @ np.array([.2126, .7152, .0722])
    grain = luma - gaussian_filter(luma, 2.5)
    dy, dx = np.gradient(grain * (1.0 + .40 * wrap))
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    oxide = np.clip((color[..., 0] - color[..., 2]) / .17, 0, 1)
    rough = (.72 + .09 * oxide - .16 * grain) * (1 - wrap) + (.89 - .14 * grain) * wrap
    metal = (.57 - .24 * oxide + .12 * grain) * (1 - wrap)
    ao = .985 - .018 * wrap + .22 * np.minimum(grain, 0)
    return .5 + .5 * normal, np.stack((ao, rough, metal), axis=2)


def CalibrateDiffuse(color, wrap, gains):
    iron, cotton = np.array(gains, dtype=np.float32)
    weight = wrap[..., None]
    factor = iron * (1 - weight) + cotton * weight
    linear = np.where(color <= .04045, color / 12.92, ((color + .055) / 1.055) ** 2.4)
    linear *= factor
    return np.where(linear <= .0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - .055)


def Save(color, path, quality):
    rgb = np.uint8(np.clip(np.rint(color * 255), 0, 255))
    Image.fromarray(rgb).save(path, "WEBP", quality=quality, method=6)
    print(f"{path.name} {rgb.shape[1]}×{rgb.shape[0]}, {path.stat().st_size:,} bytes")


def Bake(source, swatches, output):
    fit = json.loads(FIT.read_text(encoding="utf-8"))
    if hashlib.sha256(source.read_bytes()).hexdigest() != fit["referenceSha256"]:
        raise ValueError("Retrace the contours before baking from a different reference sheet")
    raw, front, side, back = ReadViews(source)
    atlas = fit["atlas"]
    shape = (1984, 432)
    broadRect = (atlas["left"], atlas["top"], atlas["right"], atlas["bottom"])
    sideRect = (atlas["left"], atlas["sideTop"] - 512, atlas["right"], atlas["sideBottom"] - 512)
    colors = [
        ProjectView(raw[:512], front, broadRect, shape),
        ProjectView(raw[1024:][::-1], back, broadRect, shape),
        ProjectView(raw[512:1024], side, sideRect, shape),
        FillUnseen(swatches, raw, atlas, shape),
    ]
    dataShape = (992, 216)
    wrap = WrapWeight(atlas, dataShape)
    surfaces = [DataMaps(Resize(np.uint8(np.rint(color * 255)), dataShape), wrap) for color in colors]
    base = [CalibrateDiffuse(color, WrapWeight(atlas, shape), gains)
            for color, gains in zip(colors, LIGHTING_GAINS)]
    output.mkdir(parents=True, exist_ok=True)
    Save(PackStrips(base, BASE_SIZE), output / "Texture_DadaoBase.webp", 92)
    Save(PackStrips([normal for normal, _ in surfaces], DATA_SIZE), output / "Texture_DadaoNormal.webp", 88)
    Save(PackStrips([orm for _, orm in surfaces], DATA_SIZE), output / "Texture_DadaoOrm.webp", 87)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Approved three-view PNG")
    parser.add_argument("swatches", type=Path, help="Image 2.6 max unseen-surface PNG")
    parser.add_argument("--out", type=Path, default=ROOT / "Texture")
    args = parser.parse_args()
    Bake(args.source, args.swatches, args.out)
