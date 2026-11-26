"""Bake the approved three views, surface swatches and blade steel to PBR."""

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
DIFFUSE_FIT = ROOT / "_import" / "Reference" / "SichuanDadao" / "Texture_DadaoDiffuseFit.png"
SIDE_DIFFUSE_FIT = DIFFUSE_FIT.with_name("Texture_DadaoSideDiffuseFit.png")
FIELD_STEEL = DIFFUSE_FIT.with_name("Texture_DadaoFieldSteelSource.webp")
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


def LinearSrgb(color):
    return np.where(color <= .04045, color / 12.92, ((color + .055) / 1.055) ** 2.4)


def EncodeSrgb(linear):
    return np.where(linear <= .0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - .055)


def CalibrateDiffuse(color, wrap, gains):
    iron, cotton = np.array(gains, dtype=np.float32)
    weight = wrap[..., None]
    factor = iron * (1 - weight) + cotton * weight
    return EncodeSrgb(LinearSrgb(color) * factor)


def ApplyDiffuseFit(color, source):
    height, width = color.shape[:2]
    with Image.open(source) as image:
        # The calibration atlas stores neutral gain at 128 and a 1/202 step.
        fit = image.convert("RGB").resize((width, height), Image.Resampling.BILINEAR)
    factor = 1 + (np.asarray(fit, dtype=np.float32) - 128) / 202
    return EncodeSrgb(LinearSrgb(color) * factor)


def Smoothstep(start, end, value):
    t = np.clip((value - start) / (end - start), 0, 1)
    return t * t * (3 - 2 * t)


def BladeZones(fit, size, strip):
    atlas = fit["atlas"]
    factor = size // 1024
    along = np.linspace(atlas["left"], atlas["right"], 992 * factor, dtype=np.float32)
    along = np.pad(along, (16 * factor, 16 * factor), mode="edge")
    # Leave the blade-to-guard junction in the darker original finish.
    blend = 1 - Smoothstep(1390, 1450, along)[None, :]
    # The third and fourth strips are the spine and edge, respectively.
    if strip >= 2:
        return blend, float(strip == 3), float(strip == 2)
    frame = np.asarray(fit["blade"])
    top = np.interp(along, frame[:, 0], frame[:, 1])
    bottom = np.interp(along, frame[:, 0], frame[:, 2])
    across = np.linspace(atlas["top"], atlas["bottom"], 216 * factor, dtype=np.float32)
    across = np.pad(across, (20 * factor, 20 * factor), mode="edge")
    position = (across[:, None] - top) / np.maximum(bottom - top, 1)
    rim = Smoothstep(.86, .98, position)
    spine = 1 - Smoothstep(.015, .18, position)
    return blend, rim, spine


def SteelGrain(image, size):
    factor = size // 1024
    shape = (992 * factor, 216 * factor)
    value = np.asarray(image.resize(shape, Image.Resampling.LANCZOS), dtype=np.float32) / 255
    haze = gaussian_filter(value, (8 * factor, 26 * factor))
    grain = value - haze
    padding = ((20 * factor, 20 * factor), (16 * factor, 16 * factor))
    return np.pad(grain, padding, mode="edge"), np.pad(haze - np.median(haze), padding, mode="edge")


def ApplyFieldSteel(fit, source, base, normal, orm):
    with Image.open(source) as image:
        steelSwatch = image.convert("L")
    largeGrain, largeHaze = SteelGrain(steelSwatch, BASE_SIZE)
    grain, haze = SteelGrain(steelSwatch, DATA_SIZE)
    for strip in range(4):
        color = base[strip * BASE_SIZE // 4:(strip + 1) * BASE_SIZE // 4]
        relief = normal[strip * DATA_SIZE // 4:(strip + 1) * DATA_SIZE // 4]
        surface = orm[strip * DATA_SIZE // 4:(strip + 1) * DATA_SIZE // 4]
        mask, rim, spine = BladeZones(fit, BASE_SIZE, strip)
        fine = largeGrain if strip % 2 == 0 else largeGrain[::-1]
        tint = .518 + .117 * rim - .074 * spine + .73 * fine * (1 - .55 * rim) + .57 * largeHaze
        steel = tint[..., None] * np.array([.976, .994, 1.015], dtype=np.float32)
        color += (steel - color) * mask[..., None]

        mask, rim, spine = BladeZones(fit, DATA_SIZE, strip)
        fine = grain if strip % 2 == 0 else grain[::-1]
        dy, dx = np.gradient(fine * (.33 - .17 * rim))
        reliefShape = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
        reliefShape /= np.linalg.norm(reliefShape, axis=2, keepdims=True)
        relief += (.5 + .5 * reliefShape - relief) * mask[..., None]
        rough = .53 + .075 * spine - .235 * rim - .17 * fine + .12 * haze
        # Keep some diffuse response on the worn face under the game's side light.
        metal = .74 + .235 * rim - .075 * spine
        surface[..., 1] += (rough - surface[..., 1]) * mask
        surface[..., 2] += (metal - surface[..., 2]) * mask


def Save(color, path, quality):
    rgb = np.uint8(np.clip(np.rint(color * 255), 0, 255))
    Image.fromarray(rgb).save(path, "WEBP", quality=quality, method=6)
    print(f"{path.name} {rgb.shape[1]}×{rgb.shape[0]}, {path.stat().st_size:,} bytes")


def Bake(source, swatches, output, diffuseFit=DIFFUSE_FIT, sideDiffuseFit=SIDE_DIFFUSE_FIT,
         fieldSteel=FIELD_STEEL):
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
    packedBase = ApplyDiffuseFit(PackStrips(base, BASE_SIZE), diffuseFit)
    side = slice(BASE_SIZE // 2, BASE_SIZE * 3 // 4)
    packedBase[side] = ApplyDiffuseFit(packedBase[side], sideDiffuseFit)
    packedNormal = PackStrips([normal for normal, _ in surfaces], DATA_SIZE)
    packedOrm = PackStrips([orm for _, orm in surfaces], DATA_SIZE)
    ApplyFieldSteel(fit, fieldSteel, packedBase, packedNormal, packedOrm)
    Save(packedBase, output / "Texture_DadaoBase.webp", 91)
    Save(packedNormal, output / "Texture_DadaoNormal.webp", 88)
    Save(packedOrm, output / "Texture_DadaoOrm.webp", 87)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Approved three-view PNG")
    parser.add_argument("swatches", type=Path, help="Image 2.6 max unseen-surface PNG")
    parser.add_argument("--out", type=Path, default=ROOT / "Texture")
    parser.add_argument("--diffuse-fit", type=Path, default=DIFFUSE_FIT, help="Observed local diffuse gain atlas")
    parser.add_argument("--side-diffuse-fit", type=Path, default=SIDE_DIFFUSE_FIT,
                        help="Measured diffuse correction on the narrow atlas strip")
    parser.add_argument("--field-steel", type=Path, default=FIELD_STEEL, help="Neutral steel grain swatch")
    args = parser.parse_args()
    Bake(args.source, args.swatches, args.out, args.diffuse_fit, args.side_diffuse_fit, args.field_steel)
