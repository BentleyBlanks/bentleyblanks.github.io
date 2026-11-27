"""Bake photo color, fiber relief and mesh contact shadows for the Dadao atlas."""

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
GEOMETRY_AO = REFERENCE / "Texture_YangYunfengGeometryAo.png"


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


def TextileSample(image, width, height, position, *, continuous=False):
    tile = Sample(image, (width // 3, height if continuous else height // 2), position)
    row = np.concatenate((tile, tile[:, ::-1]), axis=1)
    if continuous:
        return np.tile(row, (1, 2, 1))[:, :width]
    mirror = np.concatenate((row, row[::-1]), axis=0)
    return np.tile(mirror, (2, 2, 1))[:height, :width]


def TextileDetails(guide, tags, samples, strip):
    cloth, _, red, _ = MaterialRegions(guide, tags)
    height, width = cloth.shape
    position = (.5, (.19, .44, .68, .82)[strip])
    linen, cord = (TextileSample(source, width, height, position, continuous=strip >= 2) @ LUMA
                   for source in samples[1:])
    field = np.where(red, cord, linen)
    scale = width / 992
    fibers = gaussian_filter(field, .32 * scale) - gaussian_filter(field, 1.85 * scale)
    # The photographed wrapping supplies the irregular lap edges between the yarns.
    luma = guide @ LUMA
    narrow = gaussian_filter(luma, (.95 * scale, .78 * scale))
    broad = gaussian_filter(luma, (1.7 * scale, 3.7 * scale))
    return cloth, np.clip(fibers, -.14, .14), np.clip(narrow - broad, -.15, .13)


def MergeUnseen(color, tags, samples, strip):
    steel, linen, cord = samples
    height, width = color.shape[:2]
    cloth, green, red, tan = MaterialRegions(color, tags)
    # Match the reference palette while using the generated fiber and steel grain on the narrow rims.
    result = gaussian_filter(color, (2.0, 2.5, 0))
    groups = ((~cloth, steel), (tan, linen), (red, cord), (green, linen))
    for i, (mask, source) in enumerate(groups):
        if not np.any(mask):
            continue
        position = (.5, (.19, .44, .68, .82)[strip])
        field = TextileSample(source, width, height, position, continuous=True) if i else Sample(source, (width, height), position)
        if i:
            weave = field - gaussian_filter(field, (2.2, 2.2, 0))
            result[mask] = color[mask] + .45 * weave[mask]
            continue
        center = np.median(field.reshape(-1, 3), axis=0)
        observed = np.median(color[mask], axis=0)
        synthetic = observed + .77 * (field - center)
        result[mask] += .49 * (synthetic[mask] - result[mask])
    return np.clip(result, 0, 1)


def CleanClothEdges(fabric, tags, visible, factor):
    _, green, _, _ = MaterialRegions(fabric, tags)
    chroma = np.ptp(fabric, axis=-1) / np.maximum(fabric.max(axis=-1), .0001)
    green &= ((green & visible & (chroma > .19)).sum(axis=0) >= 2 * factor)[None, :]
    red, linen = (tags == 4) & ~green, (tags == 3) & ~green
    finish, rimColors = fabric.copy(), fabric.copy()
    height, width = visible.shape
    y = np.arange(height)[:, None]
    for layer in (linen, green, red):
        valid = layer & visible
        diffuse = valid & (chroma > .19)
        if not diffuse.any():
            diffuse = valid
        if not diffuse.any():
            continue
        fallback = np.median(fabric[diffuse], axis=0)
        tones = np.broadcast_to(fallback, (width, 3)).copy()
        for col in np.flatnonzero(diffuse.any(axis=0)):
            rows = np.flatnonzero(diffuse[:, col])
            trim = len(rows) // 5
            tones[col] = np.median(fabric[rows[trim:len(rows) - trim], col], axis=0)

        # At an oblique view the projected edge of either broad face is visible
        # beside the rim. Both need the same diffuse fabric at the join.
        top, bottom = np.argmax(valid, axis=0), height - 1 - np.argmax(valid[::-1], axis=0)
        distance = np.maximum(0, np.minimum(y - top, bottom - y))
        span = np.maximum(1, bottom - top + 1)
        start = np.minimum(13 * factor, .20 * span)
        end = np.minimum(28 * factor, .43 * span)
        weight = 1 - Smoothstep(start, end, distance)
        # Lift the longitudinal shading inherited from the flat projection while
        # keeping the high-frequency texture of the individual wrapping layers.
        sigma = (1.55 * factor, 1.3 * factor)
        support = gaussian_filter(valid.astype(np.float32), sigma)
        low = gaussian_filter(fabric * valid[..., None], (*sigma, 0)) / np.maximum(support[..., None], .0001)
        fine = np.clip(fabric - low, -.055, .045)
        detail = Smoothstep(2 * factor, 9 * factor, distance)
        rimColors[layer] = np.broadcast_to(tones, fabric.shape)[layer]
        matte = rimColors[layer] + .65 * detail[layer, None] * fine[layer]
        finish[layer] += weight[layer, None] * (matte - finish[layer])
    return finish, rimColors


def EdgeProjection(color, tags, visible, fromBottom, fabric):
    height = visible.shape[0]
    known = distance_transform_edt(~visible.any(axis=0), return_distances=False, return_indices=True)[0]
    first = np.argmax(visible, axis=0)
    last = height - 1 - np.argmax(visible[::-1], axis=0)
    inset = np.minimum(5, np.maximum(0, (last - first) // 3))
    edge = (last - inset if fromBottom else first + inset)[known]
    paint = np.where(tags[edge, known, None] >= 3, fabric[edge, known], color[edge, known])
    return (np.broadcast_to(paint, color.shape),
            np.broadcast_to(tags[edge, known], tags.shape))


def TidyTailProjection(color, tags, fit, factor):
    height, width = tags.shape
    atlas, frame = fit["atlas"], fit["frame"]
    size = np.array((atlas["right"] - atlas["left"], atlas["bottom"] - atlas["top"]))
    low = np.array((atlas["left"], atlas["top"]))
    rotation = np.array(((frame["cos"], -frame["sin"]), (frame["sin"], frame["cos"])))
    holes = [np.array(loop) @ rotation for loop in fit["parts"]["Pommel"]["loops"][1:]]
    aperture = np.zeros(tags.shape, dtype=np.uint8)
    for loop in holes:
        pixels = (loop - low) / size * (width - 1, height - 1)
        cv2.fillPoly(aperture, [np.rint(pixels).astype(np.int32)], 1)

    r, g, b = np.moveaxis(color, -1, 0)
    thread = (tags == 4) & (r - g > .25) & (g < .21) & (b < .24)
    distance = distance_transform_edt(aperture == 0)
    close = 1 - Smoothstep(11 * factor, 24 * factor, distance)
    pale = (tags == 4) * close * Smoothstep(.18, .36, np.minimum(g, b))
    nearby = distance_transform_edt(~thread, return_distances=False, return_indices=True)
    # Continue the dyed fibres around the hole, including highlights carried over
    # from the reference background. The opening remains in the mesh.
    finish = color + pale[..., None] * (.87 * color[tuple(nearby)] - color)

    along = np.linspace(atlas["left"], atlas["right"], width)[None, :]
    gripEnd = fit["grip"][-1][0]
    opening = min(loop[:, 0].min() for loop in holes)
    cloth = (tags == 3) & (along < gripEnd - 51) & (r - b > .15) & (g > .39)
    sample = distance_transform_edt(~cloth, return_distances=False, return_indices=True)
    shift = round(57 * (width - 1) / size[0])
    sourceColumns = np.maximum(0, np.arange(width) - shift)
    weave = color[tuple(sample)][:, sourceColumns]
    # Continue the cloth into the overlap using the grain from its interior.
    # The baked contact AO supplies the small shadow where the layers meet.
    lap = (tags == 3) * Smoothstep(gripEnd - 69, gripEnd - 23, along)
    hem = (tags == 4) * (1 - Smoothstep(opening - 4, opening, along)) * (1 - Smoothstep(.13, .28, r - g))
    finish += lap[..., None] * (.93 * weave - finish)
    finish += hem[..., None] * (.77 * weave - finish)
    return finish.astype(np.float32)


def Tiles(photo, labels, fit, size, samples, balanced=None):
    factor = size // DATA_SIZE
    shape = (992 * factor, 216 * factor)
    color, tags, visible = Project(photo, labels, fit, shape)
    front = Project(balanced, labels, fit, shape)[0] if balanced is not None else color
    if size == BASE_SIZE:
        detail = front - gaussian_filter(front, (.9, .9, 0))
        front = np.clip(front + .32 * detail, 0, 1)
    front = TidyTailProjection(front, tags, fit, factor)
    front, rimCloth = CleanClothEdges(front, tags, visible, factor)
    guide = np.where(tags[..., None] >= 3, front, color)
    yield 0, front, tags, guide
    for strip, opposite in ((2, False), (3, True)):
        edge, kind = EdgeProjection(color, tags, visible, opposite, rimCloth)
        yield strip, MergeUnseen(edge, kind, samples, strip), kind, edge


def MirrorRim(tile):
    # The lower half of the rim chart meets the photographed face at positive X.
    half = tile[len(tile) // 2:]
    return np.concatenate((half[::-1], half), axis=0)


def MatchRimMetal(tile, textile):
    return np.where(textile[..., None], tile, MirrorRim(tile))


def WrapRimCloth(color, guide, tags, coverage, factor):
    cloth, green, red, _ = MaterialRegions(guide, tags)
    h, w = tags.shape
    y, x = np.indices((h, w), dtype=np.float32)
    cross = y - (h - 1) / 2
    halfWidth = np.maximum(1, np.max(np.abs(cross) * coverage, axis=0))
    arc = np.clip(cross / halfWidth, -1, 1)
    # Continue the existing wrap bands across the rounded rim. The shift tapers
    # to zero at both UV joins so the band's ends meet the broad-face texture.
    shift = (1 - arc * arc) ** 2 * (5.2 + 3.0 * arc) * factor
    layer = cloth.astype(np.uint8) + green + 2 * red
    sample = np.clip(np.rint(x + shift).astype(int), 0, w - 1)
    sameLayer = layer[y.astype(int), sample] == layer
    wrapX = x + np.where(cloth & sameLayer, shift, 0).astype(np.float32)
    return tuple(cv2.remap(tile, wrapX, y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
                 for tile in (color, guide))


def BaseTile(color, details):
    textile, fibers, _ = details
    adjusted = color.copy()
    adjusted[textile] *= 1 + .68 * fibers[textile, None]
    return np.clip(adjusted, 0, 1)


def GuardGrain(color, tags, steel):
    guard = tags == 2
    if not guard.any():
        return color
    height, width = guard.shape
    swatch = Sample(steel, (width, height), (.57, .45)) @ LUMA
    grain = swatch - gaussian_filter(swatch, (1.9, 2.3))
    updated = color.copy()
    updated[guard] *= 1 + .51 * np.clip(grain[guard, None], -.16, .14)
    return np.clip(updated, 0, 1)


def ApplyPatinaColor(color, tags):
    # Retain the photographed brightness and texture while shifting green cloth
    # to worn brown and olive-colored steel stains to muted gray-brown.
    lab = cv2.cvtColor(color.astype(np.float32), cv2.COLOR_RGB2LAB)
    a, b = lab[..., 1], lab[..., 2]
    chroma = Smoothstep(3, 9.5, np.hypot(a, b))
    green = 1 - Smoothstep(-2.2, 1.0, a)
    olive = Smoothstep(4, 14, b) * (1 - Smoothstep(.04, .30, a / np.maximum(1, np.abs(b))))
    amount = chroma * np.maximum(green, olive)
    target = np.where(tags[..., None] >= 3, (5.5, 12.0), (1.65, 3.9))
    lab[..., 1:] += amount[..., None] * (target - lab[..., 1:])
    corrected = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
    return np.where(amount[..., None] > .001, corrected, color)


def Valley(field, axis, distance):
    index = np.arange(field.shape[axis])
    left = np.take(field, np.maximum(index - distance, 0), axis=axis)
    right = np.take(field, np.minimum(index + distance, len(index) - 1), axis=axis)
    return np.minimum(left, right) - field


def SteelCavities(luma):
    # A recess is darker than both shoulders. Broad patina stays in the base color.
    band = gaussian_filter(luma, (.64, 3.2))
    groove = np.maximum(Valley(band, 0, 3), .68 * Valley(band, 0, 6))
    detail = gaussian_filter(luma, .52)
    pits = np.minimum(Valley(detail, 0, 2), Valley(detail, 1, 2))
    return Smoothstep(.009, .049, groove), Smoothstep(.010, .063, pits)


def DataTiles(color, details, geometryAo):
    textile, fibers, folds = details
    luma = color @ LUMA
    haze = gaussian_filter(luma, (3.0, 6.0))
    fine = gaussian_filter(luma, .55) - haze
    groove, pits = SteelCavities(luma)
    steelRelief = .51 * fine - .08 * groove - .06 * pits
    relief = np.where(textile, .42 * fine + 1.44 * folds + 1.82 * fibers, steelRelief)
    dy, dx = np.gradient(relief)
    direction = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    normal = .5 + .5 * direction / np.linalg.norm(direction, axis=2, keepdims=True)
    age = 1 - Smoothstep(.40, .82, luma)
    fabricRoughness = np.clip(.90 + .06 * age - .20 * fibers, .85, .99)
    rough = np.where(textile, fabricRoughness, .44 + .23 * age)
    metal = np.where(textile, 0, .91 - .24 * age)
    lapShade = Smoothstep(.010, .073, -folds)
    yarnShade = Smoothstep(.008, .085, -fibers)
    clothAo = 1 - .44 * lapShade - .16 * yarnShade
    steelAo = 1 - .48 * groove - .25 * pits
    occlusion = np.maximum(.16, geometryAo ** 1.58 * np.where(textile, clothAo, steelAo))
    return normal, np.stack((occlusion, rough, metal), axis=2)


def ExportGeometryAo(trace, output):
    with np.load(trace) as record:
        values, coverage = record["ao"], record["coverage"]
    if values.shape != (DATA_SIZE, DATA_SIZE) or coverage.shape != values.shape:
        raise ValueError("The Blender occlusion bake must use the production UV atlas size")
    result = np.ones(values.shape, dtype=np.float32)
    for strip in range(4):
        top = strip * 256 + 20
        region = np.s_[top:top + 216, 16:1008]
        mask = coverage[region]
        if not mask.any():
            raise ValueError(f"The Blender occlusion bake has no surface samples in UV strip {strip}")
        strength = 1 - values[region]
        support = gaussian_filter(mask.astype(np.float32), .70)
        smoothed = gaussian_filter(strength * mask, .70) / np.maximum(support, .00001)
        distance, nearest = distance_transform_edt(~mask, return_indices=True)
        shaded = (.40 * strength + .60 * smoothed)[tuple(nearest)]
        result[region] -= np.where(distance <= 4, shaded, 0)
    output.parent.mkdir(parents=True, exist_ok=True)
    channels = np.stack((np.uint8(np.round(result * 255)), np.uint8(coverage) * 255), axis=-1)
    Image.fromarray(channels).save(output, optimize=True)


def PadTiles(tiles, fills, coverage, factor=1):
    # Bleed from the real UV islands before simplifying the unused pixels.
    distance, nearest = distance_transform_edt(~coverage, return_indices=True)
    weight = (1 - Smoothstep(5 * factor, 13 * factor, distance))[..., None]
    return tuple(fill + weight * (tile[tuple(nearest)] - fill)
                 for tile, fill in zip(tiles, fills))


def Bake(reference, fitFile, textileSource, diffuseFit, out, aoSource=GEOMETRY_AO):
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
    with Image.open(aoSource) as image:
        if image.size != (DATA_SIZE, DATA_SIZE):
            raise ValueError("The geometry AO must have the same resolution as ORM")
        geometry = np.asarray(image.convert("LA"))
    occlusion = geometry[..., 0].astype(np.float32) / 255
    regions = [np.s_[strip * 256 + 20:strip * 256 + 236, 16:1008] for strip in range(4)]
    coverage = [geometry[region][..., 1] > 127 for region in regions]
    coverage[0] |= coverage[1]
    for strip in (2, 3):
        coverage[strip] |= coverage[strip][::-1].copy()

    base = {}
    factor = BASE_SIZE // DATA_SIZE
    for strip, color, tags, guide in Tiles(photo, labels, fit, BASE_SIZE, samples, balanced):
        highCoverage = np.repeat(np.repeat(coverage[strip], factor, axis=0), factor, axis=1)
        if strip:
            color, guide = WrapRimCloth(color, guide, tags, highCoverage, factor)
        color = GuardGrain(color, tags, steel)
        tile = BaseTile(color, TextileDetails(guide, tags, samples, strip))
        if strip:
            tile = MatchRimMetal(gaussian_filter(tile, (.69, .69, 0)), tags >= 3)
        tile = ApplyPatinaColor(tile, tags)
        base[strip], = PadTiles((tile,), ((.49, .47, .44),), highCoverage, factor)

    data = {}
    for strip, color, tags, guide in Tiles(photo, labels, fit, DATA_SIZE, samples):
        ambient = occlusion[regions[strip]]
        if strip:
            color, guide = WrapRimCloth(color, guide, tags, coverage[strip], 1)
            color = MatchRimMetal(color, tags >= 3)
            ambient = np.where(tags >= 3, ambient, MirrorRim(ambient))
        color = GuardGrain(color, tags, steel)
        details = TextileDetails(guide, tags, samples, strip)
        layers = DataTiles(color, details, ambient)
        data[strip] = PadTiles(layers, ((.5, .5, 1), (1, .74, .64)), coverage[strip])

    # Both broad faces use the same input values in the existing UV layout.
    strips = (0, 0, 2, 3)
    out.mkdir(parents=True, exist_ok=True)
    Save([base[strip] for strip in strips], BASE_SIZE, out / "Texture_DadaoBase.webp", 91)
    Save([data[strip][0] for strip in strips], DATA_SIZE, out / "Texture_DadaoNormal.webp", 87, lossless=True)
    Save([data[strip][1] for strip in strips], DATA_SIZE, out / "Texture_DadaoOrm.webp", 85, lossless=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path)
    parser.add_argument("--fit", type=Path, default=DEFAULT_FIT)
    parser.add_argument("--textile", type=Path, default=TEXTILES)
    parser.add_argument("--diffuse", type=Path, default=DIFFUSE_FIT)
    parser.add_argument("--occlusion", type=Path, default=GEOMETRY_AO)
    parser.add_argument("--raycast", type=Path, help="Rebuild the geometry AO image from a Blender raycast bake")
    parser.add_argument("--out", type=Path, default=ROOT / "Texture")
    args = parser.parse_args()
    if args.raycast:
        ExportGeometryAo(args.raycast, args.occlusion)
    Bake(args.reference, args.fit, args.textile, args.diffuse, args.out, args.occlusion)
