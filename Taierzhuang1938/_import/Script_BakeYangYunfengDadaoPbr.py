"""Project the observed photo colors into the game's Dadao PBR atlas."""

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import distance_transform_edt, gaussian_filter

from Script_BakeDadaoPbr import BASE_SIZE, DATA_SIZE, LUMA, Save, Smoothstep
from Script_TraceYangYunfengDadao import DEFAULT_FIT, PartMasks, ReadReference, ROOT


REFERENCE = ROOT / "_import/Reference/SichuanDadao"
STEEL = REFERENCE / "Texture_YangYunfengSteel03.webp"
TEXTILES = REFERENCE / "Texture_YangYunfengTextiles.webp"
DIFFUSE_FIT = REFERENCE / "Texture_YangYunfengDiffuseFit.png"


def LinearSrgb(image):
    return np.where(image <= .04045, image / 12.92, ((image + .055) / 1.055) ** 2.4)


def EncodeSrgb(image):
    return np.where(image <= .0031308, 12.92 * image, 1.055 * image ** (1 / 2.4) - .055)


def Project(photo, labels, fit, shape):
    atlas, frame = fit["atlas"], fit["frame"]
    u = np.linspace(atlas["left"], atlas["right"], shape[0], dtype=np.float32)[None, :]
    v = np.linspace(atlas["top"], atlas["bottom"], shape[1], dtype=np.float32)[:, None]
    x = frame["cos"] * u - frame["sin"] * v
    y = frame["sin"] * u + frame["cos"] * v
    tag = cv2.remap(labels, x, y, cv2.INTER_NEAREST)
    visible = tag > 0
    # Bleed genuine in-object color out into the UV margins.
    interior = cv2.erode(np.uint8(labels > 0), np.ones((3, 3), np.uint8)).astype(np.float32)
    accumulated = cv2.remap(photo.astype(np.float32) * interior[..., None], x, y, cv2.INTER_LINEAR)
    weight = cv2.remap(interior, x, y, cv2.INTER_LINEAR)
    reliable = (weight > .16) & visible
    donor = distance_transform_edt(~reliable, return_distances=False, return_indices=True)
    color = accumulated / np.maximum(weight[..., None], 1e-8) / 255
    color = color[donor[0], donor[1]]
    tags = tag[donor[0], donor[1]]
    return color, tags, visible


def MaterialRegions(color, tags):
    textile = tags >= 3
    green = textile & (color[..., 1] > .96 * color[..., 0]) & (color[..., 1] > color[..., 2] + .02)
    red = (tags == 4) & ~green
    linen = textile & ~green & ~red
    return textile, green, red, linen


def Sample(image, shape, position):
    fit = ImageOps.fit(image, shape, Image.Resampling.LANCZOS, centering=position)
    return np.asarray(fit, dtype=np.float32) / 255


def TextileSample(image, width, height, position):
    tile = Sample(image, (width // 3, height // 2), position)
    row = np.concatenate((tile, tile[:, ::-1]), axis=1)
    mirror = np.concatenate((row, row[::-1]), axis=0)
    return np.tile(mirror, (2, 2, 1))[:height, :width]


def MergeUnseen(color, tags, samples, strip):
    steel, linen, cord = samples
    height, width = color.shape[:2]
    cloth, green, red, tan = MaterialRegions(color, tags)
    # Match the reference palette while using the generated fiber and steel grain on the back and rims.
    result = gaussian_filter(color, (2.0, 2.5, 0))
    groups = ((~cloth, steel, .49), (tan, linen, .75), (red, cord, .70), (green, linen, .54))
    for i, (mask, source, blend) in enumerate(groups):
        if not np.any(mask):
            continue
        position = (.5, (.19, .44, .68, .82)[strip])
        field = TextileSample(source, width, height, position) if i else Sample(source, (width, height), position)
        center = np.median(field.reshape(-1, 3), axis=0)
        observed = np.median(color[mask], axis=0)
        synthetic = observed + .77 * (field - center)
        result[mask] += (synthetic[mask] - result[mask]) * blend
    return np.clip(result, 0, 1)


def EdgeProjection(color, tags, visible, fromBottom):
    height = visible.shape[0]
    known = distance_transform_edt(~visible.any(axis=0), return_distances=False, return_indices=True)[0]
    first = np.argmax(visible, axis=0)
    last = height - 1 - np.argmax(visible[::-1], axis=0)
    inset = np.minimum(5, np.maximum(0, (last - first) // 3))
    edge = (last - inset if fromBottom else first + inset)[known]
    return (np.broadcast_to(color[edge, known], color.shape),
            np.broadcast_to(tags[edge, known], tags.shape))


def Tiles(photo, labels, fit, size, samples, balanced=None):
    factor = size // DATA_SIZE
    shape = (992 * factor, 216 * factor)
    color, tags, visible = Project(photo, labels, fit, shape)
    front = Project(balanced, labels, fit, shape)[0] if balanced is not None else color
    if size == BASE_SIZE:
        detail = front - gaussian_filter(front, (.9, .9, 0))
        front = np.clip(front + .32 * detail, 0, 1)
    yield front, tags
    yield MergeUnseen(color, tags, samples, 1), tags
    for strip, opposite in ((2, False), (3, True)):
        edge, kind = EdgeProjection(color, tags, visible, opposite)
        yield MergeUnseen(edge, kind, samples, strip), kind


def DataTiles(color, tags):
    textile, _, _, _ = MaterialRegions(color, tags)
    luma = color @ LUMA
    haze = gaussian_filter(luma, (3.0, 6.0))
    fine = gaussian_filter(luma, .55) - haze
    strength = np.where(textile, .81, .51)
    dy, dx = np.gradient(strength * fine)
    direction = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    normal = .5 + .5 * direction / np.linalg.norm(direction, axis=2, keepdims=True)
    age = 1 - Smoothstep(.40, .82, luma)
    rough = np.where(textile, .84 + .08 * age, .44 + .23 * age)
    metal = np.where(textile, 0, .91 - .24 * age)
    occlusion = .987 + .18 * np.minimum(0, fine)
    return normal, np.stack((occlusion, rough, metal), axis=2)


def Bake(reference, fitFile, textileSource, diffuseFit, out):
    fit = json.loads(fitFile.read_text(encoding="utf-8"))
    if hashlib.sha256(reference.read_bytes()).hexdigest() != fit["reference"]["sha256"]:
        raise ValueError("Trace the approved reference before baking the project UVs")
    photo = ReadReference(reference)
    labels = np.zeros(photo.shape[:2], dtype=np.uint8)
    for i, mask in enumerate(PartMasks(photo).values(), 1):
        labels[mask] = i
    balanced = None
    if diffuseFit.is_file():
        with Image.open(diffuseFit) as image:
            stored = np.asarray(image.convert("RGB").resize((photo.shape[1], photo.shape[0]), Image.Resampling.BILINEAR),
                                dtype=np.float32)
        gain = np.exp2((stored - 128) / 128)
        balanced = 255 * EncodeSrgb(np.clip(LinearSrgb(photo.astype(np.float32) / 255) * gain, 0, 1))
    with Image.open(STEEL) as image:
        steel = image.convert("RGB")
    with Image.open(textileSource) as image:
        textile = image.convert("RGB")
        width, height = textile.size
        linen = textile.crop((26, 14, round(width * .639), height - 14))
        red = textile.crop((round(width * .691), 14, width - 24, height - 14))
    samples = (steel, linen, red)
    base = [color for color, _ in Tiles(photo, labels, fit, BASE_SIZE, samples, balanced)]
    base[1:] = [gaussian_filter(tile, (.69, .69, 0)) for tile in base[1:]]
    data = [DataTiles(color, tags) for color, tags in Tiles(photo, labels, fit, DATA_SIZE, samples)]
    out.mkdir(parents=True, exist_ok=True)
    Save(base, BASE_SIZE, out / "Texture_DadaoBase.webp", 91)
    Save([normal for normal, _ in data], DATA_SIZE, out / "Texture_DadaoNormal.webp", 87)
    Save([orm for _, orm in data], DATA_SIZE, out / "Texture_DadaoOrm.webp", 85)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("--fit", type=Path, default=DEFAULT_FIT)
    parser.add_argument("--textile", type=Path, default=TEXTILES)
    parser.add_argument("--diffuse", type=Path, default=DIFFUSE_FIT)
    parser.add_argument("--out", type=Path, default=ROOT / "Texture")
    args = parser.parse_args()
    Bake(args.reference, args.fit, args.textile, args.diffuse, args.out)
