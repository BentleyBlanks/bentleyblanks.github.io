"""Measure visible steel finish from the local Mariners' Museum photos."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter


LUMA = np.array([.2126, .7152, .0722], dtype=np.float32)
RECORD = Path(__file__).resolve().parent / "Reference/Type89Launcher/Data_Type89LauncherSteelReference.json"
BARREL_DETAIL = RECORD.with_name("Texture_Type89LauncherBarrelDetail.png")
COLLAR_DETAIL = RECORD.with_name("Texture_Type89LauncherCollarDetail.png")
SADDLE_DETAIL = RECORD.with_name("Texture_Type89LauncherSaddleDetail.png")
STEM_DETAIL = RECORD.with_name("Texture_Type89LauncherStemDetail.png")
NECK_DETAIL = RECORD.with_name("Texture_Type89LauncherNeckDetail.png")
SLEEVE_DETAIL = RECORD.with_name("Texture_Type89LauncherSleeveDetail.png")
KNURL_DETAIL = RECORD.with_name("Texture_Type89LauncherKnurlDetail.png")
KNURL_FLANK = RECORD.with_name("Texture_Type89LauncherKnurlFlank.png")
TAB_FRONT_PAIR_PROJECTION = [
    [0.27025285843021063, -0.006591860418187142, 1028.448752789885],
    [-0.011732769701317706, 0.28119255144826527, 475.2094623617538],
    [-1.4645408783465048e-05, -1.0538823106249734e-05, 1.0],
]


def Photo(folder, number):
    path = folder / f"Mariners{number}.jpg"
    with Image.open(path) as source:
        rotated = source.height > source.width
        image = source.convert("RGB")
        if rotated:
            image = image.transpose(Image.Transpose.ROTATE_90)
    return np.asarray(image, dtype=np.float32), {
        "file": path.name,
        "sha256": sha256(path.read_bytes()).hexdigest(),
        "rotatedCounterclockwise": rotated,
    }


def Sample(image, x, y, radius=4):
    ix, iy = round(x), round(y)
    patch = image[iy-radius:iy+radius+1, ix-radius:ix+radius+1]
    return np.median(patch.reshape(-1, 3), axis=0)


def SampleBilinear(image, x, y):
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    dx, dy = x - ix, y - iy
    above = (1 - dx) * image[iy, ix] + dx * image[iy, ix + 1]
    below = (1 - dx) * image[iy + 1, ix] + dx * image[iy + 1, ix + 1]
    return (1 - dy) * above + dy * below


def FinishMap(samples, evidence, footprint, planar=False):
    lightness = samples @ LUMA
    # The median along each strip removes a shared cylindrical reflection band.
    # On the shoe subtract a plane fitted robustly to the photographed face.
    if planar:
        u, v = np.meshgrid(np.linspace(-1, 1, lightness.shape[0]),
                           np.linspace(-1, 1, lightness.shape[1]), indexing="ij")
        axes = np.stack([np.ones(u.size), u.ravel(), v.ravel()], axis=1)
        intensity = lightness.ravel()
        weight = np.ones_like(intensity)
        for _ in range(3):
            fit = np.linalg.lstsq(axes * weight[:, None], intensity * weight, rcond=None)[0]
            weight = 1 / np.maximum(1, np.abs(intensity - axes @ fit) / 11)
        relative = lightness - (axes @ fit).reshape(lightness.shape)
    else:
        relative = lightness - np.median(lightness, axis=1, keepdims=True)
    # Chromaticity retains the warm oxide contrast when exposure changes.
    warmth = 100 * (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    warmth -= np.median(warmth)
    return {"source": evidence, "footprint": footprint,
            "relativeLuminance": np.clip(np.rint(relative), -30, 30).astype(int).tolist(),
            "relativeWarmth": np.clip(np.rint(warmth), -18, 18).astype(int).tolist()}


def PatinaMap(samples):
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    middle, bright, peak = np.percentile(lightness, [50, 82, 95])
    neutral = float(np.median(warmth[(lightness >= bright) & (lightness <= peak)]))
    # Compare hue to the same photograph's bright steel. Use the color
    # separation to distinguish brown oxide from the cooler worn finish.
    oxide = np.clip((warmth - neutral - .020) / .212, 0, 1)
    cool = np.clip((neutral + .022 - warmth) / .097, 0, 1)
    cool *= np.clip((peak - lightness) / (.60 * peak), 0, 1)
    polished = np.clip((neutral + .10 - warmth) / .105, 0, 1)
    polished *= np.clip((lightness - middle) / max(bright - middle, 12), 0, 1)
    return {"neutralWarmth": round(neutral, 4), "oxideCoverage": np.rint(100 * oxide).astype(int).tolist(),
            "coolFilmCoverage": np.rint(100 * cool).astype(int).tolist(),
            "exposedSteelCoverage": np.rint(100 * polished).astype(int).tolist()}


def OverallBarrelPatina(folder, footprint):
    image, source = Photo(folder, 1)
    # Image-space silhouette rails keep samples on the external steel surface.
    rails = [[83, 550, 682], [200, 548, 683], [400, 544, 684], [611, 541, 685]]
    stations, top, bottom = np.asarray(rails).T
    xs = np.linspace(stations[0], stations[-1], 43)
    lo, hi = np.interp(xs, stations, top), np.interp(xs, stations, bottom)
    angles = np.linspace(-footprint["uHalfSpan"], footprint["uHalfSpan"], 25)
    ys = (lo + hi) / 2 + (hi - lo) / 2 * np.sin(2 * np.pi * angles[:, None])
    samples = np.array([[Sample(image, x, y, radius=4) for x, y in zip(xs, row)] for row in ys])
    source["sampleRails"] = rails
    return {"source": source, "footprint": footprint, **PatinaMap(samples)}


def PhotoResiduals(image, envelopeRadius=8.0):
    photo = Image.fromarray(image.astype(np.uint8))
    fine = np.asarray(photo.filter(ImageFilter.GaussianBlur(.58)), dtype=np.float32)
    surround = np.asarray(photo.filter(ImageFilter.GaussianBlur(envelopeRadius)), dtype=np.float32)
    lightness = fine @ LUMA
    envelope = surround @ LUMA
    tone = (lightness - envelope) / np.maximum(envelope, 35)
    warmth = ((fine[..., 0] - fine[..., 2]) / np.maximum(lightness, 30)
              - (surround[..., 0] - surround[..., 2]) / np.maximum(envelope, 30))

    return tone, warmth, lightness


def SaveDetailPlate(tone, warmth, confidence, xs, ys, path, *, halfSize=True, adjustment=None):
    height, width = xs.shape
    us, vs = np.meshgrid(np.linspace(0, 1, width), np.linspace(0, 1, height))
    edge = np.clip(14 * np.minimum(np.minimum(us, 1 - us), np.minimum(vs, 1 - vs)), 0, 1)
    toneScale, warmthScale = 300, 520
    channels = [128 + toneScale * SampleBilinear(tone, xs, ys),
                128 + warmthScale * SampleBilinear(warmth, xs, ys),
                255 * edge * SampleBilinear(confidence, xs, ys)]
    encoded = np.rint(np.clip(np.stack(channels, axis=-1), 0, 255)).astype(np.uint8)
    if adjustment is not None:
        encoded = adjustment(encoded, toneScale, warmthScale)
    detail = Image.fromarray(encoded)
    if halfSize:
        detail = detail.resize((width // 2, height // 2), Image.Resampling.LANCZOS)
    detail.save(path, optimize=True)
    return {"file": path.name, "sha256": sha256(path.read_bytes()).hexdigest(),
            "toneScale": toneScale, "warmthScale": warmthScale}


def WriteDetailPlate(image, xs, ys, path, excluded=()):
    tone, warmth, lightness = PhotoResiduals(image)
    valid = Image.new("L", (image.shape[1], image.shape[0]), 255)
    draw = ImageDraw.Draw(valid)
    for box in excluded:
        draw.rectangle(box, fill=0)
    confidence = np.asarray(valid.filter(ImageFilter.GaussianBlur(8)), dtype=np.float32) / 255
    confidence *= np.clip((245 - lightness) / 30, 0, 1)
    return SaveDetailPlate(tone, warmth, confidence, xs, ys, path)


def BarrelPhotoCoordinates(projection, halfSpan, u, v):
    center, radius, first, last = projection
    x = center + radius * np.sin(2 * np.pi * halfSpan * (2 * u - 1))
    y = first + (last - first) * v
    return x, y


def BarrelSteelIslands(image, projection, halfSpan):
    # Average over the tiny pits and favor the pale steel within the warm oxide.
    smooth = gaussian_filter(image, (3.4, 3.4, 0), mode="nearest")
    u, v = np.meshgrid(np.linspace(0, 1, 85), np.linspace(0, 1, 65), indexing="ij")
    x, y = BarrelPhotoCoordinates(projection, halfSpan, u, v)
    sampled = np.stack([SampleBilinear(smooth[..., channel], x, y) for channel in range(3)], axis=-1)
    luma = sampled @ LUMA
    warmth = (sampled[..., 0] - sampled[..., 2]) / np.maximum(luma, 25)
    bright = np.clip((luma - 102) / 31, 0, 1)
    pale = .58 + .42 * np.clip((.23 - warmth) / .154, 0, 1)
    return np.rint(bright * pale * 100).astype(int).tolist()


def BarrelDetail(image, projection, halfSpan, stampTrace):
    # Hold out the punch marks while keeping the steel grain beside the grooves.
    untracedMarks = [[148, 291, 197, 353], [756, 284, 811, 346]]
    strokeMargin, feather = 10, 4
    tone, warmth, lightness = PhotoResiduals(image)
    valid = Image.new("L", (image.shape[1], image.shape[0]), 255)
    draw = ImageDraw.Draw(valid)
    for box in untracedMarks:
        draw.rectangle(box, fill=0)
    for width, stroke in stampTrace["strokes"]:
        points = [tuple(point) for point in stroke]
        width += 2 * strokeMargin
        draw.line(points, fill=0, width=width, joint="curve")
        halfWidth = width / 2
        for x, y in (points[0], points[-1]):
            draw.ellipse((x - halfWidth, y - halfWidth, x + halfWidth, y + halfWidth), fill=0)
    confidence = np.asarray(valid.filter(ImageFilter.GaussianBlur(feather)), dtype=np.float32) / 255
    confidence *= np.clip((245 - lightness) / 30, 0, 1)
    us, vs = np.meshgrid(np.linspace(0, 1, 584), np.linspace(0, 1, 320))
    xs, ys = BarrelPhotoCoordinates(projection, halfSpan, us, vs)
    detail = SaveDetailPlate(tone, warmth, confidence, xs, ys, BARREL_DETAIL, halfSize=False)
    return {**detail, "excludedMarks": untracedMarks, "strokeMarginPixels": strokeMargin,
            "maskFeatherPixels": feather, "registrationOffsetInFootprint": [.003937, -.005615]}


def BarrelFinish(folder):
    image, source = Photo(folder, 7)
    projection = [509, 540, 23, 400]
    center, radius, first, last = projection
    halfSpan = .154
    angles = np.linspace(-halfSpan, halfSpan, 21)
    xs = center + radius * np.sin(2 * np.pi * angles)
    ys = np.linspace(first, last, 19)
    samples = np.array([[Sample(image, x, y, radius=9) for y in ys] for x in xs])
    source["sampleBounds"] = [int(xs[0]), int(ys[0]), int(xs[-1]), int(ys[-1])]
    source["projection"] = projection
    result = FinishMap(samples, source, {"uCenter": .398, "uHalfSpan": halfSpan, "vRange": [.722, .849]})
    result.update(PatinaMap(samples))
    lightness = samples @ LUMA
    low, transition = np.percentile(lightness, (13, 39))
    shadow = np.clip((transition - lightness) / max(transition - low, 10), 0, 1)
    result["shadowCoverage"] = np.rint(100 * shadow).astype(int).tolist()
    result["stampTrace"] = {
        "bounds": [130, 165, 852, 363], "imageCenter": center, "imageRadius": radius,
        "imageYForVRange": [first, last], "axialCenterImageY": 223, "axialScale": 1,
        "strokes": [
            [5, [[168, 181], [159, 194], [147, 221], [155, 223], [180, 223]]],
            [4, [[169, 182], [170, 205], [168, 238]]],
            [6, [[324, 192], [308, 212], [291, 237], [293, 242], [309, 242], [335, 238]]],
            [5, [[324, 192], [325, 213], [323, 239], [323, 254]]],
            [4, [[510, 207], [498, 210], [489, 221], [485, 235], [487, 251], [494, 265],
                 [505, 271], [519, 269], [529, 260], [534, 245], [533, 229], [527, 216], [519, 208], [510, 207]]],
            [5, [[645, 210], [651, 200], [662, 194], [677, 193], [688, 198], [692, 206],
                 [688, 217], [676, 230], [661, 245], [646, 258], [665, 259], [687, 257]]],
            [4, [[787, 193], [795, 185], [809, 183], [819, 188], [824, 196], [823, 205],
                 [815, 213], [800, 216], [811, 219], [817, 228], [817, 238], [811, 247],
                 [802, 251], [792, 250], [787, 246], [785, 238]]],
            [3, [[318, 314], [319, 333], [315, 347]]],
            [3, [[307, 333], [326, 334], [333, 332]]],
            [3, [[671, 303], [658, 307], [650, 321], [651, 334], [659, 342], [672, 346],
                 [684, 343], [693, 334], [695, 321], [687, 309], [678, 304], [671, 303]]],
            [2, [[660, 317], [677, 317], [664, 331], [678, 332]]],
        ],
    }
    result["detail"] = BarrelDetail(image, projection, halfSpan, result["stampTrace"])
    result["exposedSteelIslands"] = BarrelSteelIslands(image, projection, halfSpan)
    return result


def CollarFinish(folder):
    image, source = Photo(folder, 7)
    # Image rows remain below the curved dark seam and inside the visible ring.
    # The short axial footprint is the portion visible in this close-up.
    rails = [[56, 411], [130, 430], [224, 443], [350, 454], [509, 457],
             [670, 452], [810, 441], [960, 418]]
    rasterX = [509, 540]
    lastY = 580
    footprint = {"uCenter": .398, "uHalfSpan": .154, "vRange": [.18, .61]}
    xStations, firstRows = np.asarray(rails).T
    angles = np.linspace(-footprint["uHalfSpan"], footprint["uHalfSpan"], 27)
    xs = rasterX[0] + rasterX[1] * np.sin(2 * np.pi * angles)
    top = np.interp(xs, xStations, firstRows)
    samples = np.array([[Sample(image, x, y, radius=5) for y in np.linspace(first, lastY, 15)]
                        for x, first in zip(xs, top)])
    source.update({"rasterX": rasterX, "sampleRails": rails, "lastY": lastY})
    result = FinishMap(samples, source, footprint)
    result.update(PatinaMap(samples))

    us, vs = np.meshgrid(np.linspace(0, 1, 352), np.linspace(0, 1, 160))
    xs = rasterX[0] + rasterX[1] * np.sin(2 * np.pi * footprint["uHalfSpan"] * (2 * us - 1))
    first = np.interp(xs, xStations, firstRows)
    ys = first + (lastY - first) * vs
    result["detail"] = WriteDetailPlate(image, xs, ys, COLLAR_DETAIL)
    return result


def StemDetail(image, source):
    left, top, right, bottom = source["sampleBounds"]
    rail = np.asarray(source["lowerSampleEdge"])
    columns = np.arange(left, right + 2)
    rows = np.arange(top, bottom + 2)[:, None]
    lower = np.interp(columns, rail[:, 0], rail[:, 1])[None, :]
    # Continue the steel pixels to the edge of the filter. This keeps the
    # lettering and shadow below the sampled strip out of the detail plate.
    sampleY = np.clip(rows, top + 1, np.floor(lower - 1)).astype(int)
    padded = image[sampleY, columns[None, :]]
    tone, warmth, lightness = PhotoResiduals(padded, envelopeRadius=4.8)
    margin = np.minimum(rows - top, lower - rows)
    confidence = np.clip(margin / 4.5, 0, 1)
    # Fade the photograph's plane transition out of the scratch layer.
    confidence *= np.clip((np.abs(columns - 669) - 8) / 11, 0, 1)[None, :]
    confidence *= np.clip((245 - lightness) / 30, 0, 1)
    u, v = np.meshgrid(np.linspace(0, 1, 80), np.linspace(0, 1, 1152))
    x = left + (right - left) * v
    y = top + (1 - u) * (np.interp(x, rail[:, 0], rail[:, 1]) - top)
    return SaveDetailPlate(tone, warmth, confidence, x - left, y - top, STEM_DETAIL, halfSize=False)


def StemFinish(folder):
    image, source = Photo(folder, 4)
    # Registration in the inspection scene puts the lower side of the rubbed
    # rectangle at the smaller U. Stay above the stamped strip to its right.
    xs = np.linspace(170, 1444, 61)
    lower = np.interp(xs, [170, 658, 730, 1444], [473, 473, 443, 443])
    samples = np.array([[Sample(image, x, y, radius=3) for x, y in zip(xs, 405 + t * (lower - 405))]
                        for t in np.linspace(1, 0, 19)])
    source["sampleBounds"] = [170, 405, 1444, 473]
    source["lowerSampleEdge"] = [[170, 473], [658, 473], [730, 443], [1444, 443]]
    footprint = {"uCenter": .549, "uHalfSpan": .043, "vRange": [.078, .934]}
    field = FinishMap(samples, source, footprint)
    lightness = samples @ LUMA
    surround = np.median(lightness[:, (xs >= 748) & (xs <= 1360)], axis=1, keepdims=True)
    exposed = np.clip((lightness - surround - 12) / 39, 0, 1)
    edge = np.clip((xs - 184) / 22, 0, 1) * np.clip((674 - xs) / 20, 0, 1)
    field["rubbedCoverage"] = np.rint(100 * exposed * edge).astype(int).tolist()
    field["detail"] = StemDetail(image, source)
    return field


def ShoeDetail(image, strips):
    guide, left, right = np.asarray(strips, dtype=float).T
    x0, y0 = int(left.min()), int(guide[0])
    x1, y1 = int(right.max()) + 2, int(guide[-1]) + 2
    rows = np.arange(y0, y1)
    lo = np.interp(rows, guide, left)
    hi = np.interp(rows, guide, right)
    columns = np.arange(x0, x1)[None, :]
    sourceX = np.clip(columns, np.ceil(lo[:, None] + 1), np.floor(hi[:, None] - 1)).astype(int)
    # Extend the nearest steel pixels before blurring so the background
    # and curled edge do not get interpreted as wear on the face.
    padded = image[rows[:, None], sourceX]
    tone, warmth, lightness = PhotoResiduals(padded, envelopeRadius=4.65)
    margin = np.minimum(columns - lo[:, None], hi[:, None] - columns)
    confidence = np.clip(margin / 5, 0, 1) * np.clip((hi - lo - 19) / 26, 0, 1)[:, None]
    confidence *= np.clip((245 - lightness) / 30, 0, 1)
    u, v = np.meshgrid(np.linspace(0, 1, 336), np.linspace(0, 1, 152))
    y = guide[0] + (guide[-1] - guide[0]) * u
    a = np.interp(y, guide, left)
    b = np.interp(y, guide, right)
    x = b + v * (a - b)
    return SaveDetailPlate(tone, warmth, confidence, x - x0, y - y0, SADDLE_DETAIL, halfSize=False)


def ShoeFinish(folder):
    image, source = Photo(folder, 1)
    # On the photographed convex face U increases downward and V toward the
    # left. End each strip inside the steel, clear of the dark return and stem.
    strips = [[457, 1458, 1468], [490, 1438, 1473], [530, 1419, 1493],
              [563, 1402, 1515], [603, 1388, 1491], [643, 1375, 1480],
              [680, 1356, 1456], [724, 1352, 1428], [760, 1363, 1409]]
    yz, left, right = np.asarray(strips).T
    ys = np.linspace(yz[0], yz[-1], 37)
    lo = np.interp(ys, yz, left)
    hi = np.interp(ys, yz, right)
    samples = np.array([[Sample(image, x, y, radius=3) for x in np.linspace(rightX, leftX, 19)]
                        for y, leftX, rightX in zip(ys, lo, hi)])
    source["sampleStrips"] = strips
    footprint = {"uCenter": .500, "uHalfSpan": .383, "vRange": [.14, .585]}
    field = FinishMap(samples, source, footprint, planar=True)
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    # Chroma distinguishes brown oxidation from a dark unlit blue-gray spot.
    residue = np.clip((warmth - .035) / .255, 0, 1)
    field["oxideCoverage"] = np.rint(100 * residue).astype(int).tolist()
    field["detail"] = ShoeDetail(image, strips)
    return field


def SleeveFinish(folder):
    image, source = Photo(folder, 1)
    rails = [[1149, 593, 642], [1164, 593, 648], [1183, 593, 640],
             [1260, 594, 639], [1334, 594, 639], [1354, 595, 641]]
    source["sampleRails"] = rails
    photoX, top, bottom = np.asarray(rails).T
    xs = np.linspace(photoX[0], photoX[-1], 37)
    low, high = (np.interp(xs, photoX, rail) for rail in (top, bottom))
    samples = np.array([[Sample(image, x, y, radius=3) for x, y in zip(xs, low + t * (high - low))]
                        for t in np.linspace(0, 1, 17)])
    footprint = {"uCenter": .375, "uHalfSpan": .166, "vRange": [.026, .984]}
    field = FinishMap(samples, source, footprint)
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    oxide = np.clip((warmth - .185) / .32, 0, 1)
    oxide *= np.clip((samples[..., 0] - samples[..., 1] - 4) / 21, 0, 1)
    field["oxideCoverage"] = np.rint(100 * oxide ** 1.7).astype(int).tolist()

    # The short contact patch needs denser color samples than the wider arc.
    endRange = [.043, .174]
    first, last = footprint["vRange"]
    endX = photoX[0] + (photoX[-1] - photoX[0]) * (np.linspace(*endRange, 23) - first) / (last - first)
    endTop, endBottom = (np.interp(endX, photoX, rail) for rail in (top, bottom))
    endSamples = np.array([[Sample(image, x, y, radius=1) for x, y in zip(endX, endTop + t * (endBottom - endTop))]
                           for t in np.linspace(0, 1, 25)])
    endLightness = endSamples @ LUMA
    endWarmth = (endSamples[..., 0] - endSamples[..., 2]) / np.maximum(endLightness, 25)
    field["endPatina"] = {
        "footprint": {**footprint, "vRange": endRange},
        "darkPatinaCoverage": np.rint(100 * np.clip((59 - endLightness) / 32, 0, 1)).astype(int).tolist(),
        "oxideChroma": np.rint(100 * np.clip((endWarmth - .32) / .64, 0, 1)).astype(int).tolist(),
        "exposedSteelCoverage": np.rint(100 * np.clip((.37 - endWarmth) / .34, 0, 1)).astype(int).tolist(),
    }

    tone, warmth, lightness = PhotoResiduals(image, envelopeRadius=5.4)
    columns = np.arange(image.shape[1])
    rows = np.arange(image.shape[0])[:, None]
    upper, lower = (np.interp(columns, photoX, rail) for rail in (top, bottom))
    clearance = np.minimum(rows - upper, lower - rows)
    confidence = np.clip((clearance - 1.5) / 7.5, 0, 1)
    confidence *= np.clip((lightness - 17) / 16, 0, 1) * np.clip((233 - lightness) / 31, 0, 1)
    # Remove reflection streaks shared across the photographed arc before
    # transferring the irregular oxide and fine scratches.
    tone -= .80 * np.median(tone[605:635], axis=0)
    us, vs = np.meshgrid(np.linspace(0, 1, 88), np.linspace(0, 1, 352))
    x = photoX[0] + vs * (photoX[-1] - photoX[0])
    upper, lower = (np.interp(x, photoX, rail) for rail in (top, bottom))
    field["detail"] = SaveDetailPlate(tone, warmth, confidence, x, upper + us * (lower - upper),
                                     SLEEVE_DETAIL, halfSize=False)
    return field


def NeckDetail(image, field):
    footprint = field["footprint"]
    trace = field["stampTrace"]
    v0, v1 = footprint["vRange"]
    y0, y1 = trace["imageYForVRange"]
    pivot = v0 + (trace["axialCenterImageY"] - y0) * (v1 - v0) / (y1 - y0)
    # Use the rectified stamp registration for the surrounding metal as well.
    vRange = [pivot + (v - pivot) * trace["axialScale"] for v in (v0, v1)]
    u, v = np.meshgrid(np.linspace(-footprint["uHalfSpan"], footprint["uHalfSpan"], 512),
                       np.linspace(0, 1, 304))
    xs = trace["imageCenter"] + trace["imageRadius"] * np.sin(2 * np.pi * u)
    ys = y0 + (y1 - y0) * v

    tone, warmth, lightness = PhotoResiduals(image, envelopeRadius=8.0)
    valid = Image.new("L", (image.shape[1], image.shape[0]), 255)
    draw = ImageDraw.Draw(valid)
    for width, points in trace["strokes"]:
        draw.line([tuple(point) for point in points], fill=0, width=width + 25, joint="curve")
    confidence = np.asarray(valid.filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255
    confidence *= np.clip((lightness - 24) / 23, 0, 1) * np.clip((245 - lightness) / 32, 0, 1)
    detail = SaveDetailPlate(tone, warmth, confidence, xs, ys, NECK_DETAIL)
    return {**detail, "footprint": {**footprint, "vRange": vRange}}


def NeckFinish(folder):
    image, source = Photo(folder, 6)
    angles = np.linspace(-.132, .132, 23)
    imageCenter, imageRadius = 510, 431
    xs = imageCenter + imageRadius * np.sin(2 * np.pi * angles)
    ys = np.linspace(468, 186, 21)
    samples = np.array([[Sample(image, x, y, radius=8) for y in ys] for x in xs])
    source["sampleBounds"] = [int(xs[0]), int(ys[-1]), int(xs[-1]), int(ys[0])]
    field = FinishMap(samples, source, {"uCenter": .642, "uHalfSpan": .132, "vRange": [.23, .89]})
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    field["oxideCoverage"] = np.rint(100 * np.clip((warmth - .15) / .29, 0, 1)).astype(int).tolist()
    # The five strokes use the photographed outline and its uneven baseline.
    # All coordinates are pixels in the local reference photograph.
    field["stampTrace"] = {
        "bounds": [208, 286, 729, 413],
        "imageCenter": imageCenter, "imageRadius": imageRadius,
        "imageYForVRange": [int(ys[0]), int(ys[-1])],
        "axialCenterImageY": 346,
        "axialScale": .447,
        "strokes": [
            [8, [[251, 296], [241, 311], [231, 331], [222, 351], [243, 351], [275, 349]]],
            [7, [[251, 299], [255, 320], [259, 346], [260, 370]]],
            [8, [[366, 304], [353, 319], [340, 341], [327, 360], [357, 360], [388, 359]]],
            [7, [[366, 306], [366, 332], [365, 358], [365, 383]]],
            [8, [[460, 310], [443, 312], [431, 322], [425, 341], [425, 363],
                 [431, 381], [444, 393], [462, 396], [478, 392], [491, 379], [497, 359],
                 [496, 339], [490, 323], [478, 313], [460, 310]]],
            [8, [[543, 328], [550, 316], [563, 308], [581, 307], [597, 311], [609, 320],
                 [613, 333], [607, 347], [592, 357], [574, 368], [557, 378],
                 [542, 390], [565, 390], [589, 389], [617, 389]]],
            [7, [[654, 324], [663, 313], [676, 307], [690, 306], [704, 310], [712, 321],
                 [712, 333], [701, 342], [685, 348], [667, 351]]],
            [8, [[686, 348], [703, 350], [713, 358], [716, 370], [711, 381], [700, 389],
                 [687, 393], [672, 392], [658, 386], [652, 377]]],
        ],
    }
    field["detail"] = NeckDetail(image, field)
    return field


def BlendTabDetail(encoded, photos, toneScale, warmthScale):
    tone, warmth, coverage = np.asarray(encoded, dtype=np.float32).transpose(2, 0, 1)
    confidence = coverage / 255

    def LocalAverage(values, sigma):
        weighted = gaussian_filter(values * confidence, sigma, mode="nearest")
        weights = gaussian_filter(confidence, sigma, mode="nearest")
        return weighted / np.maximum(weights, .03)

    mediumBands, chromaBands = [], []
    for pixels in photos:
        lightness = pixels @ LUMA
        chroma = (pixels[..., 0] - pixels[..., 2]) / np.maximum(lightness, 25)
        surrounding = LocalAverage(lightness, (16, 10))
        medium = LocalAverage(lightness, (3.4, 2.25))
        mediumBands.append((medium - surrounding) / np.maximum(surrounding, 35))
        chromaBands.append(LocalAverage(chroma, (3.4, 2.25)) - LocalAverage(chroma, (16, 10)))

    # Strong lighting changes between photographs have less influence on the wear layer.
    agreement = np.clip(1 - np.abs(mediumBands[0] - mediumBands[1]) / .24, .25, 1)
    alternateShare = .59
    blend = .48 * agreement
    tone += toneScale * blend * ((1 - alternateShare) * mediumBands[0] + alternateShare * mediumBands[1])
    warmth += warmthScale * .28 * blend * ((1 - alternateShare) * chromaBands[0] + alternateShare * chromaBands[1])
    return np.rint(np.clip(np.stack((tone, warmth, coverage), axis=-1), 0, 255)).astype(np.uint8)


def TabDetail(image, number, uAnchors, strips, alternate=None):
    radius = 5.8 if number == 5 else 4.6
    tone, warmth, lightness = PhotoResiduals(image, envelopeRadius=radius)
    columns = np.arange(image.shape[1])
    rows = np.arange(image.shape[0])[:, None]
    photoX, first, last = np.asarray(strips).T
    edgeA, edgeB = (np.interp(columns, photoX, edge) for edge in (first, last))
    clearance = np.minimum(rows - np.minimum(edgeA, edgeB), np.maximum(edgeA, edgeB) - rows)
    confidence = np.clip((clearance - radius) / (radius + 1), 0, 1)
    confidence *= np.clip((lightness - 22) / 22, 0, 1) * np.clip((246 - lightness) / 30, 0, 1)
    uu, vv = np.meshgrid(np.linspace(uAnchors[0], uAnchors[-1], 480), np.linspace(0, 1, 144))
    xs, start, end = (np.interp(uu, uAnchors, values) for values in (photoX, first, last))
    ys = start + vv * (end - start)
    adjustment = None
    if alternate is not None:
        projected = np.stack((xs, ys, np.ones_like(xs)), axis=-1) @ np.asarray(TAB_FRONT_PAIR_PROJECTION).T
        pairedX, pairedY = (projected[..., :2] / projected[..., 2:3]).transpose(2, 0, 1)
        samples = tuple(np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(photo, -1, 0)], axis=-1)
                        for photo, x, y in ((image, xs, ys), (alternate, pairedX, pairedY)))

        def Adjust(encoded, toneScale, warmthScale):
            return BlendTabDetail(encoded, samples, toneScale, warmthScale)

        adjustment = Adjust

    name = "Tab" if number == 5 else "TabBack"
    path = RECORD.with_name(f"Texture_Type89Launcher{name}Detail.png")
    return SaveDetailPlate(tone, warmth, confidence, xs, ys, path, halfSize=False, adjustment=adjustment)


def TabFinish(folder, number):
    image, source = Photo(folder, number)
    # UV bounds sampled through the artwork's curved face. Each photograph
    # has its own strips of visible metal, in increasing local V order.
    outline = [[.055, .5915, .9808], [.12, .4348, .9911], [.25, .2449, .5492],
               [.382, .1146, .4066], [.51, .0328, .3716], [.66, .0139, .3719],
               [.80, .007, .4302], [.902, .0019, .4542], [.946, .0218, .3694]]
    strips = ([[168, 652, 745], [244, 581, 734], [376, 488, 654],
               [550, 445, 577], [716, 435, 564], [916, 439, 572],
               [1122, 467, 583], [1269, 449, 532], [1370, 384, 459]] if number == 5 else
              [[895, 283, 246], [935, 307, 258], [1005, 346, 257],
               [1100, 344, 270], [1200, 344, 268], [1280, 345, 257],
               [1360, 347, 240], [1425, 354, 313], [1461, 351, 322]])
    uAnchors = np.asarray(outline)[:, 0]
    first, last = uAnchors[0], uAnchors[-1]
    u = np.linspace(first, last, 33)
    xs, starts, ends = (np.interp(u, uAnchors, column) for column in np.asarray(strips).T)
    samples = np.array([[Sample(image, x, y, radius=3) for y in np.linspace(start, end, 17)]
                        for x, start, end in zip(xs, starts, ends)])
    source["sampleStrips"] = strips
    field = FinishMap(samples, source, {"uCenter": (first+last)/2, "uHalfSpan": (last-first)/2, "vRange": [0, 1]})
    field["outlineUV"] = outline
    alternate = None
    if number == 5:
        alternate, alternateSource = Photo(folder, 4)
        source["pairedPhoto"] = {**alternateSource, "matchedPoints": 94, "medianErrorPixels": .524,
                                 "projectionFromPrimary": TAB_FRONT_PAIR_PROJECTION}
    field["detail"] = TabDetail(image, number, uAnchors, strips, alternate)
    lightness = samples @ LUMA
    # Reflective rubbed edges are paired with the remainder of each strip.
    # Restrict the bright-metal estimate to the less saturated areas.
    body = np.median(lightness[:, 3:-3], axis=1, keepdims=True)
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    exposed = np.clip((lightness - body - 7) / 34, 0, 1) * np.clip((.61-warmth)/.39, .2, 1)
    field["rubbedCoverage"] = np.rint(100 * exposed).astype(int).tolist()
    return field


def EyeEdgeFinish(image, trace):
    halfWidths = [32, 38, 37, 38, 39, 40, 37, 37]
    angularHalfSpan = .16
    angles = np.linspace(-angularHalfSpan, angularHalfSpan, 9)
    crossOffsets = np.sin(2 * np.pi * angles)
    samples = np.array([[Sample(image, x, y + width * offset) for offset in crossOffsets]
                        for (_, x, y), width in zip(trace, halfWidths)])
    lightness = samples @ LUMA
    chroma = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    # The cooler patch is cut by the lighting stripe in the photograph. Use
    # the change in oxide color and taper the coverage at the dull tip.
    clean = np.clip((.46 - chroma) / .34, 0, 1)
    positions = np.array([v for v, _, _ in trace])
    clean *= np.clip((positions - .035) / .10, 0, 1)[:, None]
    spaced = np.linspace(positions[0], positions[-1], 25)
    coverage = np.array([np.interp(spaced, positions, column) for column in clean.T])

    # Transfer the fine corrosion contrast without the broad lighting band.
    fineV = np.linspace(positions[0], positions[-1], 93)
    centerX, centerY = [np.interp(fineV, positions, column) for column in np.asarray(trace).T[1:]]
    widths = np.interp(fineV, positions, halfWidths)
    angles = np.linspace(-angularHalfSpan, angularHalfSpan, 63)
    xs = np.broadcast_to(centerX, (len(angles), len(fineV)))
    ys = centerY + np.sin(2 * np.pi * angles[:, None]) * widths
    tone = SampleBilinear(image @ LUMA, xs, ys)
    blurred = Image.fromarray(np.rint(tone).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3.3))
    envelope = np.asarray(blurred, dtype=np.float32)
    contrast = np.clip(100 * (tone - envelope) / np.maximum(envelope, 45), -29, 29)

    return {"footprint": {"uCenter": 0, "uHalfSpan": angularHalfSpan, "vRange": [positions[0], positions[-1]]},
            "sampleHalfWidths": halfWidths, "rubbedCoverage": np.rint(100 * coverage).astype(int).tolist(),
            "relativeDetail": np.rint(contrast).astype(int).tolist()}


def EyeFinish(folder):
    # V runs around the loop from its outer tip. Photo 5 shows the wire nearly
    # edge-on, giving an unsigned distance from the tip along the visible bar.
    # The oblique reverse view in photo 2 also distinguishes the two arcs.
    traces = {
        "front": (5, [[0, 517, 821], [.065, 463, 824], [.115, 418, 825], [.17, 375, 823],
                      [.226, 335, 820], [.27, 289, 816], [.326, 248, 815], [.38, 214, 813]]),
        "reverse": (2, [[.655, 940, 181], [.70, 971, 165], [.75, 1001, 148], [.80, 1032, 143],
                        [.85, 1052, 161], [.90, 1064, 184], [.95, 1068, 212], [0, 1069, 238],
                        [.04, 1067, 269], [.10, 1048, 288], [.16, 1017, 291], [.22, 981, 283],
                        [.28, 946, 269], [.345, 915, 252]]),
    }
    result = {}
    for side, (number, trace) in traces.items():
        image, source = Photo(folder, number)
        xy = np.asarray(trace)[:, 1:]
        tangent = np.gradient(xy, axis=0)
        across = tangent[:, ::-1] * [-1, 1] / np.linalg.norm(tangent, axis=1)[:, None]
        offsets = np.linspace(-12, 12, 5)
        samples = np.array([[Sample(image, *(position + axis * offset), radius=4) for offset in offsets]
                            for position, axis in zip(xy, across)])
        lightness = samples @ LUMA
        tone = np.median(lightness, axis=1)
        warmth = np.median((samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25), axis=1)
        lo, hi = np.percentile(tone, [15, 85])
        rubbed = np.clip((tone - lo) / (hi - lo), 0, 1)
        rubbed *= np.clip((.53 - warmth) / .30, .15, 1)
        source["trace"] = trace
        result[side] = {"source": source, "v": [point[0] for point in trace],
                        "sampleLuminance": np.rint(tone).astype(int).tolist(),
                        "sampleWarmth": np.round(warmth.astype(np.float64), 3).tolist(),
                        "rubbedCoverage": np.rint(100 * rubbed).astype(int).tolist()}
        if side == "front":
            result[side]["outerWire"] = EyeEdgeFinish(image, trace)
    return result


def WheelFinish(folder):
    image, source = Photo(folder, 3)
    # Average several teeth at each cross-rim station. Reflected light changes
    # with each facet, while the warm oxide is concentrated away from the lips.
    columns = list(range(267, 324, 4))
    top, bottom = 272, 612
    warmth = []
    for x in columns:
        pixels = image[top:bottom, x:x+3]
        lightness = pixels @ LUMA
        warmth.append(np.median((pixels[..., 0] - pixels[..., 2]) / np.maximum(lightness, 25)))
    rubbed = np.clip((.49 - np.array(warmth)) / .17, 0, 1)
    source.update({"columns": columns, "sampleY": [top, bottom]})

    # Register each complete tooth separately. The rows run toward the top of
    # the photo from the lower crown break, through the crown and the recess.
    toothRows = [[358, 335, 326, 307, 299], [425, 399, 385, 368, 358],
                 [498, 474, 451, 431, 425], [554, 535, 521, 504, 498]]
    phase = np.linspace(0, 1, 25)
    across = np.linspace(.09, .91, 17)
    swatches = []
    for rows in toothRows:
        yy = np.interp(phase, [0, .25, .50, .75, 1], rows)
        lo = np.interp(yy, [265, 410, 560, 613], [267, 269, 271, 272])
        hi = np.interp(yy, [265, 410, 560, 613], [326, 328, 328, 329])
        xx = lo[:, None] + (hi - lo)[:, None] * across
        swatches.append([[Sample(image, x, y, radius=2) for x in line] for y, line in zip(yy, xx)])
    swatches = np.asarray(swatches)
    lightness = swatches @ LUMA
    chroma = np.median((swatches[..., 0] - swatches[..., 2]) / np.maximum(lightness, 25), axis=0)
    worn = np.clip((.57 - chroma) / .46, 0, 1)
    rust = np.clip((chroma - .185) / .55, 0, 1)
    for field in (worn, rust):
        field[0] = field[-1] = (field[0] + field[-1]) * .5
    # Suppress the common reflection at each angular station before keeping
    # small tone changes across a tooth. Keep the four swatches independent.
    fine = []
    for tile in lightness:
        smooth = np.asarray(Image.fromarray(np.rint(tile).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.7)))
        residual = (tile - smooth) / np.maximum(smooth, 45)
        residual -= np.median(residual, axis=1, keepdims=True)
        residual[[0, -1]] = 0
        fine.append(np.rint(np.clip(100 * residual, -28, 28)).astype(int).tolist())
    source["toothRows"] = toothRows
    return {"source": source, "v": np.linspace(.06, .94, len(columns)).round(4).tolist(),
            "sampleWarmth": np.round(np.asarray(warmth, dtype=np.float64), 3).tolist(),
            "rubbedCoverage": np.rint(100 * rubbed).astype(int).tolist(),
            "rim": {"footprint": {"uCenter": .5, "uHalfSpan": .5, "vRange": [.09, .91]},
                    "wornSteel": np.rint(100 * worn).astype(int).tolist(),
                    "oxide": np.rint(100 * rust).astype(int).tolist(), "toothDetail": fine}}


def KnurlWear(image, bounds):
    left, top, right, bottom = bounds
    selection = np.s_[top:bottom, left:right]
    tone, warmth, lightness = (field[selection] for field in PhotoResiduals(image))
    h, w = tone.shape
    window = np.hanning(h)[:, None] * np.hanning(w)[None, :]
    amplitude = np.abs(np.fft.rfft2(tone * window, s=(h * 4, w * 4)))
    fx = np.fft.rfftfreq(w * 4)[None, :]
    fy = np.fft.fftfreq(h * 4)[:, None]
    band = (fx > .025) & (fx < .052) & (abs(fy) > .041) & (abs(fy) < .077)
    peaks = [np.unravel_index(np.where(band & (sign * fy > 0), amplitude, 0).argmax(), amplitude.shape)
             for sign in (-1, 1)]
    frequencies = [(float(fx[0, j]), float(fy[i, 0])) for i, j in peaks]
    yy, xx = np.indices((h, w))
    phaseA, phaseB = (2 * np.pi * (px * xx + py * yy) for px, py in frequencies)
    # Keep the measured variations between crests. The regular diamond
    # response and its first harmonics are built separately during baking.
    modes = [phaseA, phaseB, 2 * phaseA, 2 * phaseB, phaseA + phaseB, phaseA - phaseB]
    basis = np.column_stack([fn(phase.ravel()) for phase in modes for fn in (np.cos, np.sin)])
    signals = np.column_stack((tone.ravel(), warmth.ravel()))
    weights = np.sqrt(window.ravel())[:, None]
    fitted = np.linalg.lstsq(basis * weights, signals * weights, rcond=None)[0]
    irregularTone, irregularWarmth = (signals - basis @ fitted).T.reshape(2, h, w)

    # This photo crop matches the visible UV window in the side inspection.
    # V increases to the right and U increases down in the rotated photo.
    # The grip sits below the stem in this orientation, across the U seam.
    center, halfSpan = .02227, .09188
    footprint = {"uCenter": center, "uHalfSpan": halfSpan, "vRange": [.44433, .69863]}
    us, vs = np.meshgrid(np.linspace(0, 1, 200), np.linspace(0, 1, 216))
    srcX = (w - 1.01) * vs
    arc = np.sin(2 * np.pi * halfSpan * (2 * us - 1)) / np.sin(2 * np.pi * halfSpan)
    srcY = (h - 1.01) * (.5 + .5 * arc)
    confidence = np.clip((247 - lightness) / 25, 0, 1)
    detail = SaveDetailPlate(irregularTone, irregularWarmth, confidence, srcX, srcY, KNURL_DETAIL, halfSize=False)
    return {"footprint": footprint, "detail": detail,
            "removedFrequencies": [[round(x, 5), round(y, 5)] for x, y in frequencies]}


def KnurlFrequency(folder):
    image, source = Photo(folder, 3)
    x0, y0, x1, y1 = bounds = [665, 338, 883, 513]
    patch = image[y0:y1, x0:x1] @ LUMA
    rows, cols = patch.shape
    amplitude = np.abs(np.fft.rfft2((patch - patch.mean()) * np.hanning(rows)[:, None] * np.hanning(cols)))
    fy, fx = np.fft.fftfreq(rows)[:, None], np.fft.rfftfreq(cols)[None, :]
    region = (fx > .025) & (fx < .052) & (abs(fy) > .041) & (abs(fy) < .077)
    peaks = [np.unravel_index(np.where(region & (sign * fy > 0), amplitude, 0).argmax(), amplitude.shape)
             for sign in (1, -1)]
    axial = float(np.mean([fx[0, i] for j, i in peaks]))
    angular = float(np.mean([abs(fy[j, 0]) for j, i in peaks]))
    # The counts are frequencies in the display asset's UVs.
    source["sampleBounds"] = bounds
    return {"source": source, "axialCyclesPerPixel": round(axial, 5),
            "angularCyclesPerPixel": round(angular, 5),
            "axialCycles": round(axial * 345 / .406), "angularCycles": round(angular * np.pi * 316),
            "wear": KnurlWear(image, bounds)}


def KnurlFlankWear(folder):
    image, source = Photo(folder, 4)
    bounds = [162, 587, 328, 660]
    left, top, right, bottom = bounds
    region = np.s_[top:bottom, left:right]
    tone, warmth, lightness = (field[region] for field in PhotoResiduals(image))
    # Match the straight patterned face to the visible rim and the edge of
    # the stem. The angular samples follow the foreshortened cylinder.
    us = np.array([.65413, .66609, .67802, .69007, .70246, .71485, .72793,
                   .74129, .75531, .77049, .78660, .80496, .82687])
    projectedY = np.arange(len(us)) * 6
    sampleU, sampleV = np.meshgrid(np.linspace(us[0], us[-1], 100), np.linspace(0, 1, 168))
    srcX = (right - left - 1.01) * sampleV
    srcY = np.clip(np.interp(sampleU, us, projectedY), 0, bottom - top - 1.01)
    toneUv, warmthUv, shadeUv = (SampleBilinear(field, srcX, srcY) for field in (tone, warmth, lightness))
    height, width = toneUv.shape
    window = np.hanning(height)[:, None] * np.hanning(width)[None, :]
    amplitude = np.abs(np.fft.rfft2(toneUv * window, s=(height * 6, width * 6)))
    fx = np.fft.rfftfreq(width * 6)[None, :]
    fy = np.fft.fftfreq(height * 6)[:, None]
    band = (fx > .074) & (fx < .122) & (np.abs(fy) > .052) & (np.abs(fy) < .081)
    peaks = [np.unravel_index(np.where(band & (fy * sign > 0), amplitude, 0).argmax(), amplitude.shape)
             for sign in (-1, 1)]
    frequencies = [(float(fx[0, j]), float(fy[i, 0])) for i, j in peaks]
    yy, xx = np.indices(toneUv.shape)
    a, b = (2 * np.pi * (f * xx + g * yy) for f, g in frequencies)
    phases = [a, b, 2 * a, 2 * b, a + b, a - b]
    # The same row of diamonds reflects differently near the rim. Fit that
    # variation before transferring the non-repeating pits and scratches.
    angular = (2 * xx / (width - 1) - 1).ravel()
    basis = np.column_stack([fn(phase).ravel() * scale for phase in phases
                             for fn in (np.cos, np.sin) for scale in (1, angular, angular ** 2)])
    weight = np.sqrt(window).ravel()[:, None]
    observations = np.column_stack((toneUv.ravel(), warmthUv.ravel()))
    fitted = np.linalg.lstsq(basis * weight, observations * weight, rcond=None)[0]
    wearTone, wearWarmth = (observations - basis @ fitted).T.reshape(2, height, width)
    detail = SaveDetailPlate(wearTone, wearWarmth, np.clip((247 - shadeUv) / 25, 0, 1),
                             np.minimum(xx, width - 1.01), np.minimum(yy, height - 1.01),
                             KNURL_FLANK, halfSize=False)
    # The steel is lit unevenly. Measure the excess warmth in grooves
    # against the exposed edges in the same band of the photograph.
    sample = image[region]
    chroma = (sample[..., 0] - sample[..., 2]) / np.maximum(sample @ LUMA, 25)
    shadowChroma = []
    for rows in np.array_split(np.arange(tone.shape[0]), 5):
        bandTone, bandChroma = tone[rows], chroma[rows]
        dark = np.median(bandChroma[bandTone < -.09])
        bright = np.median(bandChroma[bandTone > .09])
        shadowChroma.append([np.interp(rows.mean(), projectedY, us), np.clip(dark - bright, 0, 1)])
    source["sampleBounds"] = bounds
    source["observedGripBounds"] = [151, 581, 338, 669]
    source["uBySampleRow"] = np.stack([us, projectedY], axis=1).tolist()
    footprint = {"uCenter": round((us[0] + us[-1]) / 2, 6), "uHalfSpan": round((us[-1] - us[0]) / 2, 6),
                 "vRange": [.39821, .75679]}
    return {"source": source, "footprint": footprint, "detail": detail,
            "shadowChroma": np.round(shadowChroma, 5).tolist(), "uvFrequencies": np.round(frequencies, 5).tolist()}


def ShoulderPhotoGrid(uRange, vRange, viewCenter, rails, width, height):
    # The two photo rails follow the projected arc. Their horizontal
    # positions are calibrated at the collar seam and the shoulder edge.
    u, v = np.meshgrid(np.linspace(*uRange, width), np.linspace(*vRange, height))
    samples, x, first, last = np.asarray(rails, dtype=float).T
    low, high = np.sin(2 * np.pi * (np.asarray(uRange) - viewCenter))
    angle = (np.sin(2 * np.pi * (u - viewCenter)) - low) / (high - low)
    y = (1 - angle) * np.interp(v, samples, first) + angle * np.interp(v, samples, last)
    return np.interp(v, samples, x), y


def ShoulderFinish(folder):
    # Each row is a shoulder V coordinate and the photograph's x, upper y
    # and lower y for the selected angular window.
    views = {
        "Direct": (3, (.805, .859), (.48249027237354086, .8664682993820096), .998, 104, [
            [.48249, 308.06956, 38.40369, 64.61473], [.53109, 322.13987, 49.36836, 74.93868],
            [.57931, 336.09973, 58.14894, 83.13699], [.62753, 350.0596, 65.88087, 90.28486],
            [.67576, 364.02388, 70.53136, 94.25883], [.72398, 377.98374, 76.60274, 99.35858],
            [.77247, 392.02312, 80.4039, 102.34945], [.81669, 404.82555, 82.49834, 103.75066],
            [.86647, 419.23602, 84.6097, 105.24531],
        ]),
        "Flank": (4, (.524, .778), (.3431906614785992, .43404287785152973), .645, 246, [
            [.34319, 87.96217, 356.49705, 535.42175], [.35531, 88.7496, 356.68103, 535.41247],
            [.36742, 89.53703, 356.86836, 535.40346], [.37954, 90.32446, 357.17862, 536.22417],
            [.39165, 91.11188, 356.50108, 536.05457], [.40375, 91.89832, 355.80537, 535.87569],
            [.40981, 92.29204, 356.45206, 536.37513], [.42193, 93.07946, 355.7389, 536.19099],
            [.43404, 93.86689, 356.84941, 536.33033],
        ]),
    }
    fields = {}
    for name, (photo, uRange, vRange, viewCenter, width, rails) in views.items():
        image, source = Photo(folder, photo)
        source.update({"photoRails": rails, "viewCenter": viewCenter})
        u0, u1 = uRange
        footprint = {"uCenter": round((u0 + u1) / 2, 6), "uHalfSpan": round((u1 - u0) / 2, 6),
                     "vRange": vRange}
        x, y = ShoulderPhotoGrid(uRange, vRange, viewCenter, rails, 17, 21)
        samples = np.stack([SampleBilinear(channel, x, y) for channel in np.moveaxis(image, -1, 0)], axis=-1)
        samples = samples.transpose(1, 0, 2)
        field = FinishMap(samples, source, footprint)
        if name == "Flank":
            patina = PatinaMap(samples)
            field["oxideCoverage"] = patina["oxideCoverage"]
            field["neutralWarmth"] = patina["neutralWarmth"]
            luma = samples @ LUMA
            chroma = (samples[..., 0] - samples[..., 2]) / np.maximum(luma, 25)
            relative = np.asarray(field["relativeLuminance"], dtype=float)
            clean = np.clip((patina["neutralWarmth"] + .065 - chroma) / .13, 0, 1)
            # Use scratches and cool local highlights. The broad strip
            # reflection is removed by FinishMap.
            wear = np.clip((relative - 2) / 20, 0, 1) * clean
            field["exposedSteelCoverage"] = np.rint(100 * wear).astype(int).tolist()
            # Surface correspondence measured with the shoulder UV islands.
            field["fineUvOffset"] = [-.00199, -.00255]
        x, y = ShoulderPhotoGrid(uRange, vRange, viewCenter, rails, width, 108)
        if name == "Flank":
            # Keep the blur in PhotoResiduals inside the visible strip so
            # the adjoining dark stem cannot contribute to the grain.
            detailBounds = [85, 346, 96, 548]
            left, top, right, bottom = detailBounds
            source["detailBounds"] = detailBounds
            image = image[top:bottom, left:right]
            x, y = x - left, y - top
        detailPath = RECORD.with_name(f"Texture_Type89LauncherShoulder{name}.png")
        field["detail"] = WriteDetailPlate(image, x, y, detailPath)
        fields[name] = field
    return fields


def Main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--photos", type=Path, required=True, help="Local ReferencePhotos directory")
    args = options.parse_args()
    record = json.loads(RECORD.read_text(encoding="utf-8"))
    record["barrelPatina"] = OverallBarrelPatina(args.photos, record["footprint"])
    record["closeups"] = {"Barrel": BarrelFinish(args.photos), "CollarRing": CollarFinish(args.photos),
                          "Stem": StemFinish(args.photos), "Sleeve": SleeveFinish(args.photos),
                          "Saddle": ShoeFinish(args.photos), "Neck": NeckFinish(args.photos),
                          "Tab": TabFinish(args.photos, 5), "TabBack": TabFinish(args.photos, 2)}
    record["ringFinish"] = EyeFinish(args.photos)
    record["wheelFinish"] = WheelFinish(args.photos)
    record["knurl"] = KnurlFrequency(args.photos)
    record["knurl"]["flankWear"] = KnurlFlankWear(args.photos)
    record["shoulder"] = ShoulderFinish(args.photos)
    encoded = json.dumps(record, ensure_ascii=False, indent=2)
    encoded = re.sub(r"\[\s*(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+)\s*\]",
                     lambda match: "[" + ", ".join(x.strip() for x in match[1].split(",")) + "]", encoded)
    RECORD.write_text(encoded + "\n", encoding="utf-8")
    print("Measured close-ups:", ", ".join(record["closeups"]), "knurl UV cycles:",
          record["knurl"]["angularCycles"], record["knurl"]["axialCycles"], flush=True)


if __name__ == "__main__":
    Main()
