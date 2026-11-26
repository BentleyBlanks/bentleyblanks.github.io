"""Bake the museum hilt and API-generated worn steel to the production atlas."""

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import distance_transform_edt, gaussian_filter

from Script_TraceDadaoMuseumPhoto import ReadProfile


ROOT = Path(__file__).resolve().parents[1]
FIT = ROOT / "_blender" / "Data_SichuanDadaoMuseumFit.json"
STEEL = ROOT / "_import/Reference/SichuanDadao/Texture_YangYunfengSteel03.webp"
BASE_SIZE, DATA_SIZE = 2048, 1024
LUMA = np.array([.2126, .7152, .0722], dtype=np.float32)


def PhotoTile(photo, mask, atlas, shape):
    region = np.s_[atlas["top"]:atlas["bottom"] + 1, atlas["left"]:atlas["right"] + 1]
    nearest = distance_transform_edt(~mask[region], return_distances=False, return_indices=True)
    color = Image.fromarray(photo[region][nearest[0], nearest[1]])
    rgb = np.asarray(color.resize(shape, Image.Resampling.LANCZOS), dtype=np.float32) / 255
    grey = rgb @ LUMA
    return .32 * rgb + .68 * grey[..., None]


def Smoothstep(start, end, value):
    t = np.clip((value - start) / (end - start), 0, 1)
    return t * t * (3 - 2 * t)


def BladeMasks(fit, shape, strip):
    atlas = fit["atlas"]
    along = np.linspace(atlas["left"], atlas["right"], shape[0], dtype=np.float32)
    contour = np.asarray(fit["blade"])
    end = contour[-1, 0]
    blend = 1 - Smoothstep(end - 70, end + 8, along)[None, :]
    if strip >= 2:
        return blend, float(strip == 3), float(strip == 2)
    top = np.interp(along, contour[:, 0], contour[:, 1])
    bottom = np.interp(along, contour[:, 0], contour[:, 2])
    v = np.linspace(atlas["top"], atlas["bottom"], shape[1], dtype=np.float32)[:, None]
    cross = (v - top) / np.maximum(bottom - top, 1)
    edge = Smoothstep(.91, .99, cross)
    spine = 1 - Smoothstep(.025, .18, cross)
    return blend, edge, spine


def SteelPattern(image, shape, strip):
    centerY = (.2, .76, .45, .58)[strip]
    sample = ImageOps.fit(image, shape, Image.Resampling.LANCZOS, centering=(.5, centerY))
    value = np.asarray(sample, dtype=np.float32) / 255
    if strip >= 2:
        value = gaussian_filter(value, (1.3, 2.1))
    return value - np.median(value)


def SurfaceTile(photo, swatch, fit, size, strip):
    factor = size // DATA_SIZE
    shape = (992 * factor, 216 * factor)
    if strip >= 2:
        photo = np.broadcast_to(photo[shape[1] // 2], photo.shape)
    blade, edge, spine = BladeMasks(fit, shape, strip)
    pattern = SteelPattern(swatch, shape, strip)
    pit = np.maximum(0, -pattern)
    tone = .685 + .050 * edge - .036 * spine + .74 * np.maximum(pattern, 0) - 1.96 * pit
    steel = tone[..., None] * np.array([.992, 1, 1.006], dtype=np.float32)
    color = photo + (steel - photo) * blade[..., None]
    return color, (blade, edge, spine, pit)


def DataTiles(color, masks):
    blade, edge, spine, pit = masks
    value = color @ LUMA
    fine = gaussian_filter(value, .7) - gaussian_filter(value, (3.2, 7.4))
    dy, dx = np.gradient(fine * (.5 - .22 * edge))
    direction = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    normal = .5 + .5 * direction / np.linalg.norm(direction, axis=2, keepdims=True)
    roughSteel = .47 - .164 * edge + .068 * spine + .52 * pit
    metalSteel = .765 + .20 * edge - .072 * spine - .32 * pit
    rough = .66 + (roughSteel - .66) * blade
    metal = .56 + (metalSteel - .56) * blade
    ao = .985 + .19 * np.minimum(0, fine)
    return normal, np.stack((ao, rough, metal), axis=2)


def PackStrips(tiles, size):
    factor = size // DATA_SIZE
    padding = ((20 * factor, 20 * factor), (16 * factor, 16 * factor), (0, 0))
    return np.concatenate([np.pad(tile, padding, mode="edge") for tile in tiles])


def Save(tiles, size, path, quality):
    atlas = PackStrips(tiles, size)
    rgb = np.uint8(np.clip(np.rint(atlas * 255), 0, 255))
    Image.fromarray(rgb).save(path, "WEBP", quality=quality, method=6)
    print(f"{path.name} {size} × {size}, {path.stat().st_size:,} bytes")


def Bake(profile, steel, output):
    fit = json.loads(FIT.read_text(encoding="utf-8"))
    if hashlib.sha256(profile.read_bytes()).hexdigest() != fit["referenceSha256"]:
        raise ValueError("Retrace the registered photograph before applying it to the UV atlas")
    original, mask = ReadProfile(profile)
    with Image.open(steel) as image:
        swatch = image.convert("L")
    basePhoto = PhotoTile(original, mask, fit["atlas"], (1984, 432))
    dataPhoto = PhotoTile(original, mask, fit["atlas"], (992, 216))
    base = [SurfaceTile(basePhoto, swatch, fit, BASE_SIZE, strip)[0] for strip in range(4)]
    data = [DataTiles(*SurfaceTile(dataPhoto, swatch, fit, DATA_SIZE, strip)) for strip in range(4)]
    output.mkdir(parents=True, exist_ok=True)
    Save(base, BASE_SIZE, output / "Texture_DadaoBase.webp", 86)
    Save([normal for normal, _ in data], DATA_SIZE, output / "Texture_DadaoNormal.webp", 88)
    Save([orm for _, orm in data], DATA_SIZE, output / "Texture_DadaoOrm.webp", 87)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", type=Path, help="Registered museum profile PNG")
    parser.add_argument("--steel", type=Path, default=STEEL)
    parser.add_argument("--out", type=Path, default=ROOT / "Texture")
    args = parser.parse_args()
    Bake(args.profile, args.steel, args.out)
