"""Bake the Dadao atlas from the reference, material swatches and Blender contact shadows."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

import cv2
import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import distance_transform_edt, gaussian_filter

from Script_BakeDadaoPbr import BASE_SIZE, DATA_SIZE, LUMA, PackStrips, Smoothstep
from Script_TraceYangYunfengDadao import DEFAULT_FIT, PartMasks, ReadReference, ROOT

sys.path.insert(0, str(ROOT / "_blender"))
from Script_YangYunfengDadaoUv import BLADE_FACE, FACES, GRIP, RIMS, FaceBounds, GripRange, Plane, RimPaths


REFERENCE = ROOT / "_import/Reference/SichuanDadao"
STEEL = REFERENCE / "Texture_YangYunfengSteel03.webp"
FIELD_STEEL = REFERENCE / "Texture_DadaoFieldSteelSource.webp"
TEXTILES = REFERENCE / "Texture_YangYunfengTextiles.webp"
DIFFUSE_FIT = REFERENCE / "Texture_YangYunfengDiffuseFit.png"
GEOMETRY_AO = REFERENCE / "Texture_YangYunfengGeometryAo.png"
FILLS = ((.49, .47, .44), (.5, .5, 1), (1, .74, .64))


def LinearSrgb(image):
    return np.where(image <= .04045, image / 12.92, ((image + .055) / 1.055) ** 2.4)


def EncodeSrgb(image):
    return np.where(image <= .0031308, 12.92 * image, 1.055 * image ** (1 / 2.4) - .055)


def Sample(image, shape, center=(.5, .5)):
    return np.asarray(ImageOps.fit(image, shape, Image.Resampling.LANCZOS, centering=center), dtype=np.float32) / 255


def PhotoMaps(fit, u, v):
    frame = fit["frame"]
    return (frame["cos"] * u - frame["sin"] * v).astype(np.float32), (frame["sin"] * u + frame["cos"] * v).astype(np.float32)


def Remap(image, x, y):
    return cv2.remap(image, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)


def PartColor(photo, mask):
    interior = cv2.erode(mask.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    donor = distance_transform_edt(~interior, return_distances=False, return_indices=True)
    return photo[tuple(donor)].astype(np.float32) / 255


def BladeProjection(photo, labels, fit, u, v):
    x, y = PhotoMaps(fit, u, v)
    visible = cv2.remap(labels, x, y, cv2.INTER_NEAREST).astype(bool)
    interior = cv2.erode(labels, np.ones((3, 3), np.uint8)).astype(np.float32)
    accumulated = cv2.remap(photo.astype(np.float32) * interior[..., None], x, y, cv2.INTER_LINEAR)
    weight = cv2.remap(interior, x, y, cv2.INTER_LINEAR)
    donor = distance_transform_edt(~((weight > .16) & visible), return_distances=False, return_indices=True)
    return (accumulated / np.maximum(weight[..., None], 1e-8) / 255)[tuple(donor)], visible


def Valley(field, axis, distance):
    index = np.arange(field.shape[axis])
    left = np.take(field, np.maximum(index - distance, 0), axis=axis)
    right = np.take(field, np.minimum(index + distance, len(index) - 1), axis=axis)
    return np.minimum(left, right) - field


def SteelCavities(luma):
    band = gaussian_filter(luma, (.64, 3.2))
    groove = np.maximum(Valley(band, 0, 3), .68 * Valley(band, 0, 6))
    detail = gaussian_filter(luma, .52)
    pits = np.minimum(Valley(detail, 0, 2), Valley(detail, 1, 2))
    return Smoothstep(.009, .049, groove), Smoothstep(.010, .063, pits)


def Patina(color):
    lab = cv2.cvtColor(np.clip(color, 0, 1).astype(np.float32), cv2.COLOR_RGB2LAB)
    a, b = lab[..., 1], lab[..., 2]
    chroma = Smoothstep(3, 9.5, np.hypot(a, b))
    green = 1 - Smoothstep(-2.2, 1.0, a)
    olive = Smoothstep(4, 14, b) * (1 - Smoothstep(.04, .30, a / np.maximum(1, np.abs(b))))
    amount = chroma * np.maximum(green, olive)
    lab[..., 1:] += amount[..., None] * (np.array((1.65, 3.9)) - lab[..., 1:])
    corrected = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
    return np.where(amount[..., None] > .001, corrected, color)


def Normal(height):
    dy, dx = np.gradient(height)
    direction = np.stack((-dx, dy, np.ones_like(dx)), axis=2)
    return .5 + .5 * direction / np.linalg.norm(direction, axis=2, keepdims=True)


def Pad(tiles, fills, coverage, factor=1):
    distance, nearest = distance_transform_edt(~coverage, return_indices=True)
    weight = (1 - Smoothstep(5 * factor, 11 * factor, distance))[..., None]
    return tuple(fill + weight * (tile[tuple(nearest)] - fill) for tile, fill in zip(tiles, fills))


def SteelShade(luma):
    return .567 + .58 * np.clip(luma - .49, -.32, .28)


def BladeSteel(color, u, v, steel, field, ambient, factor):
    neutral = Patina(color)
    luma = neutral @ LUMA
    low = gaussian_filter(luma, (3.8 * factor, 7.2 * factor))
    marks = gaussian_filter(luma, (.55 * factor, 1.32 * factor)) - low
    pitted = Remap(steel, 1.74 * u + .24 * v, 3.0 * v - .13 * u)
    rubbed = Remap(field, 1.28 * u - .31 * v, 3.19 * v + .064 * u)
    # Derive the lengthwise abrasion and the pitted field at separate scales.
    grit = gaussian_filter(pitted, .42 * factor) - gaussian_filter(pitted, 2.25 * factor)
    abrasion = gaussian_filter(rubbed, (.43 * factor, 2.75 * factor)) - gaussian_filter(rubbed, (1.7 * factor, 5.6 * factor))
    pit = Smoothstep(.019, .121, gaussian_filter(pitted, 2.65 * factor) - pitted)
    wear = .25 + .75 * Smoothstep(.025, .39, .72 - low)
    pit *= wear
    age = Smoothstep(.095, .39, .77 - low - .44 * gaussian_filter(marks, 1.2 * factor))
    pitRim = gaussian_filter(luma, .35 * factor) - gaussian_filter(luma, 1.48 * factor)
    tint = SteelShade(low) + .49 * marks + .31 * pitRim + (.77 + .36 * wear) * grit + 2.45 * abrasion - .041 * pit
    base = tint[..., None] * (1.014, 1, .969) + .25 * np.clip(neutral - luma[..., None], -.10, .10)
    if factor > 1:
        return (np.clip(base, 0, 1),)

    groove, tracePit = SteelCavities(luma)
    relief = .67 * marks + (.37 + .30 * wear) * grit + 2.37 * abrasion - .255 * pit - .14 * groove
    roughness = np.clip(.39 + .245 * age + .062 * pit - .61 * abrasion, .38, .77)
    metal = .90 - .26 * age
    ao = np.maximum(.16, ambient ** 1.52 * (1 - .24 * groove - .086 * tracePit - .093 * pit))
    return Normal(relief), np.stack((ao, roughness, metal), axis=-1)


def BladeAtlas(photo, labels, fit, steel, field, geometry, factor):
    width, height = 992 * factor, 216 * factor
    masks = []
    for strip in range(4):
        y = strip * 256 + 20
        mask = (geometry[y:y + 216, 16:1008, 1] > 127).copy()
        # Fitting walls use the empty space beyond the blade's projected rims.
        if strip >= 2:
            mask[:, 692:] = False
        masks.append(mask)
    x, y = Grid(BLADE_FACE, factor)
    left, right, top, bottom = FaceBounds(fit, "Blade")
    u, v = left + x * (right - left), top + y * (bottom - top)
    broad, _ = BladeProjection(photo, labels, fit, u, v)
    atlasBounds = fit["atlas"]
    rimU = atlasBounds["left"] + x * (atlasBounds["right"] - atlasBounds["left"])
    rimV = atlasBounds["top"] + y * (atlasBounds["bottom"] - atlasBounds["top"])
    color, visible = BladeProjection(photo, labels, fit, rimU, rimV)
    steelLuma = np.asarray(steel, dtype=np.float32) @ LUMA / 255
    atlases = [[] for _ in range(2 if factor == 1 else 1)]
    known = distance_transform_edt(~visible.any(axis=0), return_distances=False, return_indices=True)[0]
    for strip in range(4):
        if strip == 1:
            for atlas, fill in zip(atlases, FILLS[1:] if factor == 1 else FILLS[:1]):
                atlas.append(np.broadcast_to(fill, (height, width, 3)))
            continue
        mask = masks[strip]
        ambient = geometry[strip * 256 + 20:strip * 256 + 236, 16:1008, 0].astype(np.float32) / 255
        if strip == 0:
            maps = BladeSteel(broad, u, v, steelLuma, field, ambient, factor)
            if factor > 1:
                mask = np.repeat(np.repeat(mask, factor, axis=0), factor, axis=1)
            for atlas, tile in zip(atlases, Pad(maps, FILLS[:1] if factor > 1 else FILLS[1:], mask, factor)):
                atlas.append(tile)
            continue
        mask |= mask[::-1].copy()
        first, last = np.argmax(visible, axis=0), height - 1 - np.argmax(visible[::-1], axis=0)
        inset = np.minimum(5, np.maximum(0, (last - first) // 3))
        edge = (last - inset if strip == 3 else first + inset)[known]
        projected = np.broadcast_to(color[edge, known], (height, width, 3))
        grain = Sample(steel, (width, height), (.5, .68 if strip == 2 else .82))
        center = np.median(grain.reshape(-1, 3), axis=0)
        observed = np.median(projected.reshape(-1, 3), axis=0)
        smooth = gaussian_filter(projected, (2.0, 2.5, 0))
        paint = np.clip(.51 * smooth + .49 * (observed + .77 * (grain - center)), 0, 1)
        if factor > 1:
            paint = gaussian_filter(paint, (.69, .69, 0))
        paint = np.concatenate((paint[height // 2:][::-1], paint[height // 2:]), axis=0)
        ambient = np.concatenate((ambient[108:][::-1], ambient[108:]), axis=0)
        if factor > 1:
            high = np.repeat(np.repeat(mask, factor, axis=0), factor, axis=1)
            atlases[0].extend(Pad((Patina(paint),), FILLS[:1], high, factor))
            continue
        luma = paint @ LUMA
        groove, pits = SteelCavities(luma)
        micro = gaussian_filter(luma, .55) - gaussian_filter(luma, (3.0, 6.0))
        normal = Normal(.51 * micro - .08 * groove - .06 * pits)
        age = 1 - Smoothstep(.40, .82, luma)
        ao = np.maximum(.16, ambient ** 1.58 * (1 - .48 * groove - .25 * pits))
        orm = np.stack((ao, .44 + .23 * age, .91 - .24 * age), axis=2)
        for atlas, tile in zip(atlases, Pad((normal, orm), FILLS[1:], mask)):
            atlas.append(tile)
    return tuple(PackStrips(atlas, DATA_SIZE * factor).astype(np.float32) for atlas in atlases)


def Grid(rect, factor):
    _, _, width, height = rect
    x = (np.arange(width * factor, dtype=np.float32) + .5) / (width * factor)
    y = (np.arange(height * factor, dtype=np.float32) + .5) / (height * factor)
    return np.meshgrid(x, y)


def ClothLaps(fit, u, v):
    across = v - fit["frame"]["center"]
    height = np.zeros_like(u)
    contact = np.zeros_like(u)
    lay = np.zeros_like(u)
    for center, pitch, bow, width, rise in fit.get("clothLaps", ()):
        distance = (u - center - pitch * across - bow * across * across) / width
        edge = .12 * np.sin(.23 * across + center) + .06 * np.cos(.64 * across - center)
        seam = np.exp(-((distance + edge - .18) / .40) ** 2)
        shoulder = np.exp(-((distance + 1.07) / 1.23) ** 2)
        underlap = np.exp(-((distance + edge - .61) / 1.11) ** 2)
        profile = rise * (.76 + .24 * np.cos(across * .079 + center))
        height += profile * (3.4 * shoulder - 4.5 * seam)
        contact += profile * (1.55 * seam + .78 * underlap)
        lay += Smoothstep(-.52, .41, distance) * (1.2 + .74 * np.sin(center))
    return height, contact, lay


def Cotton(fit, grid, dyedCloth, swatch, factor):
    along, around = grid
    lo, hi = GripRange(fit)
    u = lo + along * (hi - lo)
    theta = 2 * np.pi * (around + .25)
    rows = np.asarray(fit["grip"])
    low = np.interp(u, rows[:, 0], rows[:, 1])
    high = np.interp(u, rows[:, 0], rows[:, 2])
    radius = np.clip((high - low) * .5, 44, 82)
    v = np.clip((high + low) * .5, 88, 108) + radius * np.sin(theta)
    source = Remap(dyedCloth, *PhotoMaps(fit, u, v))
    folds, contact, lay = ClothLaps(fit, u, v)

    # Alternate raised warp and weft floats at glancing light. The phase shifts
    # and yarn tension vary by overlap, and both sides meet at the wrap seam.
    tension = .83 + .13 * np.sin(theta * 3 + u * .029) + .11 * np.cos(u * .136 - theta * 5)
    pinched = np.sin(theta * 4 - .054 * u) * Smoothstep(.015, .16, contact)
    across = 64 * around + lay * .40 + .23 * np.sin(theta * 11 + u * .070) + .43 * pinched
    length = (u - .12 * (v - 100) + .65 * np.sin(u * .125 + theta) + .73 * np.sin(u * .065 - theta * 6) + .58 * lay) / 4.0
    chevrons = np.abs(np.mod(across + 8, 16) - 8)
    floatArc = .5 + .5 * np.cos((length + chevrons) * (np.pi / 2))
    warp = (.5 + .5 * np.cos(2 * np.pi * length)) ** 1.5 * (.31 + .69 * floatArc)
    weft = (.5 + .5 * np.cos(2 * np.pi * across)) ** 1.5 * (1 - .70 * floatArc)
    floats = np.maximum(warp, .91 * weft)
    swatchLuma = swatch @ LUMA
    sx = 2.78 * (u - lo - .15 * (v - 100) + 1.7 * lay) + 8 * pinched
    sy = around * swatch.shape[0] + 3.8 * np.sin(theta * 3 + u * .056) + 10 * lay
    thread = cv2.remap(swatchLuma.astype(np.float32), sx.astype(np.float32), sy.astype(np.float32),
                       cv2.INTER_LINEAR, borderMode=cv2.BORDER_WRAP)
    fine = np.clip(thread - gaussian_filter(thread, (1.55 * factor, 1.80 * factor), mode=("wrap", "nearest")), -.13, .13)
    floats = gaussian_filter(floats, .36 * factor, mode=("wrap", "nearest"))
    nap = thread - gaussian_filter(thread, .80 * factor, mode=("wrap", "nearest"))
    height = folds + tension * (1.03 * floats + 2.98 * fine + 1.3 * nap)

    sourceLuma = source @ LUMA
    dye = np.clip(gaussian_filter(sourceLuma, (3.6 * factor, 4.9 * factor), mode=("wrap", "nearest")) - .59, -.17, .10)
    rubbed = Smoothstep(-.08, .055, dye) * Smoothstep(.29, .61, floats)
    shade = .68 * dye + .035 * (floats - .37) + .73 * fine + .37 * nap + .014 * np.sin(lay * 1.6)
    base = np.array((.673, .533, .377), dtype=np.float32) + shade[..., None] * (.94, .83, .69)
    enclosed = Smoothstep(.05, .27, .46 - floats) * Smoothstep(.007, .088, -fine)
    fabricAo = 1 - contact * (1 + .15 * pinched) - .146 * gaussian_filter(enclosed, .47 * factor) * tension
    roughness = np.clip(.959 + .026 * (1 - floats) - .085 * rubbed - .18 * nap, .88, .99)
    return base, height, fabricAo, roughness, np.zeros_like(u)


def RingFrame(fit):
    holes = [Plane(fit["frame"], *p) for loop in fit["parts"]["Pommel"]["loops"][1:] for p in loop]
    vertices = np.asarray(holes)
    return (vertices.max(axis=0) + vertices.min(axis=0)) / 2


def RedYarn(fit, u, v, color, swatch, factor, side=None):
    thread, linen = swatch
    centerU, centerV = RingFrame(fit)
    dx, dy = 1.12 * (u - centerU), v - centerV
    theta, radius = np.arctan2(dy, dx), np.hypot(dx, dy)
    spacing = theta + .073 * np.sin(5 * theta + .57) + .031 * np.sin(11 * theta - .64)
    bend = 1.7 * np.sin(6 * theta + radius * .083) + .81 * np.sin(13 * theta - radius * .12)
    wind = 35 * spacing + bend + .92 * np.sin(radius * .1 - 7 * theta)
    turn = 0 if side is None else 1 - Smoothstep(.12, .65, np.abs(side))
    wind += 1.7 * turn * np.cos(5 * theta)
    pinch = 1.39 + .42 * np.cos(8 * theta + radius * .076)
    bundle = (.5 + .5 * np.cos(wind)) ** pinch
    ply = (.5 + .5 * np.cos(102 * spacing + 2.46 * bend + radius * .69 + 1.25 * np.sin(wind))) ** 1.26
    overlap = (1 - Smoothstep(19, 60, radius)) * Smoothstep(-.19, .82, np.cos(3 * theta - .67))
    cross = (.5 + .5 * np.cos(31 * spacing + bend + radius * .41 + 1.9 * np.sin(4 * theta))) ** 2.05
    cross *= overlap
    sx = radius * 3.5 + 37 * np.sin(theta) + 24 * np.cos(3 * theta)
    sx += 21 * turn
    sy = thread.shape[0] * .5 + 221 * np.sin(spacing) + 67 * np.cos(2 * spacing + .25) + 3.3 * bend + 12 * cross
    luma = Remap(thread @ LUMA, sx, sy)
    fibres = np.clip(luma - gaussian_filter(luma, 1.22 * factor), -.16, .16)
    rolls = np.maximum(.78 * bundle, .25 * bundle + .83 * cross)
    height = rolls + .24 * ply * (.31 + .69 * bundle) + 3.05 * fibres
    # Only intersections and troughs occlude. Preserve the lit thread ridges.
    valleys = Smoothstep(.36, .82, 1 - bundle) * (.32 + .68 * Smoothstep(.012, .088, -fibres))
    yarnAo = 1 - .215 * gaussian_filter(valleys, .57 * factor) - .25 * cross * (1 - bundle)
    r, g, b = np.moveaxis(color, -1, 0)
    dyed = np.maximum(Smoothstep(.10, .29, r - g), Smoothstep(centerU - 7, centerU + 2, u))
    shade = np.clip(gaussian_filter(r, 2.0 * factor) - .57, -.24, .20)
    yarn = np.array((.578, .077, .116), dtype=np.float32) + shade[..., None] * (.52, .15, .15)
    knot = 1 - Smoothstep(20, 38, radius)
    looseDye = knot * np.clip(r - gaussian_filter(r, 2.5 * factor), -.12, .12)
    yarn += (.94 * fibres + .092 * (rolls - .28) + .037 * (ply - .45) + .55 * looseDye)[..., None] * (1, .38, .36)
    # The cloth emerging from beneath the ring shares the grip's brown palette.
    weave = Remap(linen @ LUMA, 2.6 * u, 2.7 * v)
    linenDetail = np.clip(weave - gaussian_filter(weave, 1.04 * factor), -.13, .13)
    underlay = np.array((.361, .272, .186), dtype=np.float32)
    underlay = underlay + (.26 * (color @ LUMA - .36) + .52 * linenDetail)[..., None] * (1., .86, .72)
    base = underlay + dyed[..., None] * (yarn - underlay)
    roughness = np.clip(.965 - .041 * dyed - .059 * rolls - .28 * fibres, .87, .99)
    return base, height * dyed + 1.95 * linenDetail * (1 - dyed), 1 - dyed * (1 - yarnAo), roughness, np.zeros_like(u)


def GuardSteel(fit, v, color, steel, factor, side=None):
    height, width = color.shape[:2]
    swatch = Sample(steel, (width, height), (.57 if side is None else .38, .44)) @ LUMA
    grain = gaussian_filter(swatch, .52 * factor) - gaussian_filter(swatch, 2.2 * factor)
    pits = Smoothstep(.012, .105, np.minimum(Valley(swatch, 0, factor), Valley(swatch, 1, factor)))
    color = Patina(color)
    luma = color @ LUMA
    _, _, top, bottom = FaceBounds(fit, "Guard")
    curl = 1 - Smoothstep(39, 72, np.minimum(v - top, bottom - v))
    smooth = gaussian_filter(luma, (.9 * factor, 2.1 * factor))
    # Match the shoulders of each curl to its wall and remove photographed glints before lighting.
    match = .20 + .69 * curl if side is None else .76 + .13 * curl
    tone = .395 + .62 * np.clip(smooth - .395, -.26, .28)
    base = color + match[..., None] * (tone[..., None] * (1.046, 1, .950) - color)
    base += (.76 * grain - .044 * pits)[..., None]
    rust = 1 - Smoothstep(.28, .60, luma + .49 * grain)
    surfaceHeight = .91 * grain - .36 * pits
    if side is None:
        surfaceHeight += .65 * (gaussian_filter(luma, .60 * factor) - gaussian_filter(luma, 2.5 * factor))
    return base, surfaceHeight, 1 - .24 * pits, .46 + .22 * rust - .24 * grain, .91 - .30 * rust


def FitFace(fit, name, grid, source, swatch, factor):
    x, y = grid
    left, right, top, bottom = FaceBounds(fit, name)
    u, v = left + x * (right - left), top + y * (bottom - top)
    color = Remap(source, *PhotoMaps(fit, u, v))
    if name == "Guard":
        return GuardSteel(fit, v, color, swatch, factor)
    return RedYarn(fit, u, v, color, swatch, factor)


def FitRim(fit, name, pathIndex, grid, source, swatch, factor):
    station, width = grid
    points, distance = tuple(RimPaths(fit, name))[pathIndex]
    a, b = np.asarray(points, dtype=np.float32), np.roll(np.asarray(points, dtype=np.float32), -1, axis=0)
    distance = np.asarray(distance, dtype=np.float32)
    samples = station * distance[-1]
    i = np.minimum(len(a) - 1, np.searchsorted(distance, samples, side="right") - 1)
    vector = b - a
    span = np.diff(distance)
    part = (samples - distance[i]) / span[i]
    centre = a[i] + vector[i] * part[..., None]
    sign = np.sign(np.sum(a[:, 0] * b[:, 1] - b[:, 0] * a[:, 1])) * (-1 if pathIndex else 1)
    inward = vector[i][..., ::-1] * (-1, 1) / span[i][..., None] * sign
    side = 2 * width - 1
    inset = 4.5 + 2.0 * (1 - side * side)
    u, v = np.moveaxis(centre + inward * inset[..., None], -1, 0)
    color = Remap(source, *PhotoMaps(fit, u, v))
    if name == "Guard":
        return GuardSteel(fit, v, color, swatch, factor, side)
    # Match the yarn phase at the bevel before bending the fibres across the wall.
    u, v = np.moveaxis(centre + 1.05 * inward, -1, 0)
    return RedYarn(fit, u, v, color, swatch, factor, side)


def Place(atlas, rect, tile, scale, periodic=None):
    x, y, w, h = (value * scale for value in rect)
    pad = 5 * scale
    tile = np.pad(tile, ((pad, pad), (0, 0), (0, 0)), mode="wrap" if periodic == 0 else "edge")
    tile = np.pad(tile, ((0, 0), (pad, pad), (0, 0)), mode="wrap" if periodic == 1 else "edge")
    atlas[y - pad:y + h + pad, x - pad:x + w + pad] = tile


def Finish(geometry, rect, channels, factor):
    x, y, w, h = rect
    embedded = geometry[y:y + h, x:x + w]
    coverage = embedded[..., 1] > 127
    if not coverage.any():
        raise ValueError(f"Missing Blender coverage for atlas chart {rect}")
    base, height, reliefAo, roughness, metallic = channels
    if factor != 1:
        scaled = np.repeat(np.repeat(coverage, factor, axis=0), factor, axis=1)
        return Pad((np.clip(base, 0, 1),), FILLS[:1], scaled, factor)
    ambient = embedded[..., 0].astype(np.float32) / 255
    orm = np.stack((np.maximum(.21, ambient ** 1.32 * reliefAo), roughness, metallic), axis=2)
    return Pad((Normal(height), np.clip(orm, 0, 1)), FILLS[1:], coverage)


def BakeFittings(atlases, photo, masks, fit, swatches, geometry, factor):
    steel, linen, red = swatches
    cloth = PartColor(photo, masks["Grip"])
    tiles = Finish(geometry, GRIP, Cotton(fit, Grid(GRIP, factor), cloth, linen, factor), factor)
    for atlas, tile in zip(atlases, tiles):
        Place(atlas, GRIP, tile, factor, periodic=0)

    for name, swatch in (("Guard", steel), ("Pommel", (red, linen))):
        source = PartColor(photo, masks[name])
        rect = FACES[name]
        face = FitFace(fit, name, Grid(rect, factor), source, swatch, factor)
        for atlas, tile in zip(atlases, Finish(geometry, rect, face, factor)):
            Place(atlas, rect, tile, factor)
        for index, rect in enumerate(RIMS[name]):
            edge = FitRim(fit, name, index, Grid(rect, factor), source, swatch, factor)
            for atlas, tile in zip(atlases, Finish(geometry, rect, edge, factor)):
                Place(atlas, rect, tile, factor, periodic=1)


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
        support = gaussian_filter(mask.astype(np.float32), .61)
        smoothed = gaussian_filter(strength * mask, .61) / np.maximum(support, .00001)
        distance, nearest = distance_transform_edt(~mask, return_indices=True)
        shaded = (.43 * strength + .57 * smoothed)[tuple(nearest)]
        result[region] -= np.where(distance <= 4, shaded, 0)
    output.parent.mkdir(parents=True, exist_ok=True)
    channels = np.stack((np.uint8(np.round(result * 255)), np.uint8(coverage) * 255), axis=-1)
    Image.fromarray(channels).save(output, optimize=True)


def SaveAtlas(atlas, output, quality, *, levels=None):
    pixels = np.rint(atlas * 255)
    if levels is not None:
        origin, step = levels
        pixels = origin + np.rint((pixels - origin) / step) * step
    pixels = np.uint8(np.clip(pixels, 0, 255))
    Image.fromarray(pixels).save(output, "WEBP", quality=quality, method=6, lossless=levels is not None)
    print(output.name, pixels.shape[:2], f"{output.stat().st_size:,} bytes")


def Bake(reference, fitFile, textileSource, diffuseFit, out, aoSource=GEOMETRY_AO):
    fit = json.loads(fitFile.read_text(encoding="utf-8"))
    if hashlib.sha256(reference.read_bytes()).hexdigest() != fit["reference"]["sha256"]:
        raise ValueError("Trace the approved reference before baking the project UVs")
    photo = ReadReference(reference)
    masks = PartMasks(photo)
    balanced = photo
    if diffuseFit.is_file():
        with Image.open(diffuseFit) as image:
            stored = np.asarray(image.convert("RGB").resize((photo.shape[1], photo.shape[0]), Image.Resampling.BILINEAR), dtype=np.float32)
        gain = np.exp2((stored - 128) / 128)
        balanced = 255 * EncodeSrgb(np.clip(LinearSrgb(photo.astype(np.float32) / 255) * gain, 0, 1))
    with Image.open(STEEL) as image:
        steel = image.convert("RGB")
    with Image.open(FIELD_STEEL) as image:
        field = np.asarray(image.convert("RGB"), dtype=np.float32) @ LUMA / 255
    with Image.open(textileSource) as image:
        w, h = image.size
        linen = np.asarray(image.convert("RGB").crop((26, 14, round(w * .639), h - 14)), dtype=np.float32) / 255
        red = np.asarray(image.convert("RGB").crop((round(w * .691), 14, w - 24, h - 14)), dtype=np.float32) / 255
    swatches = (steel, linen, red)
    with Image.open(aoSource) as image:
        if image.size != (DATA_SIZE, DATA_SIZE):
            raise ValueError("The geometry AO must have the same resolution as ORM")
        geometry = np.asarray(image.convert("LA"))

    out.mkdir(parents=True, exist_ok=True)
    factor = BASE_SIZE // DATA_SIZE
    base = BladeAtlas(balanced, masks["Blade"].astype(np.uint8), fit, steel, field, geometry, factor)
    BakeFittings(base, balanced, masks, fit, swatches, geometry, factor)
    SaveAtlas(base[0], out / "Texture_DadaoBase.webp", 80)
    data = BladeAtlas(photo, masks["Blade"].astype(np.uint8), fit, steel, field, geometry, 1)
    BakeFittings(data, photo, masks, fit, swatches, geometry, 1)
    # Keep finer precision for tangent direction and contact AO than for the
    # largely flat normal Z, roughness and metalness channels.
    SaveAtlas(data[0], out / "Texture_DadaoNormal.webp", 89, levels=((128, 128, 255), (10, 10, 16)))
    SaveAtlas(data[1], out / "Texture_DadaoOrm.webp", 89, levels=((255, 0, 0), (4, 13, 17)))


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
