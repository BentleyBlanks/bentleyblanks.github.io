"""Measure visible steel finish from the local Mariners' Museum photos."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageFilter


LUMA = np.array([.2126, .7152, .0722], dtype=np.float32)
RECORD = Path(__file__).resolve().parent / "Reference/Type89Launcher/Data_Type89LauncherSteelReference.json"


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


def BarrelFinish(folder):
    image, source = Photo(folder, 7)
    angles = np.linspace(-.154, .154, 21)
    xs = 509 + 540 * np.sin(2 * np.pi * angles)
    ys = np.linspace(23, 400, 19)
    samples = np.array([[Sample(image, x, y, radius=9) for y in ys] for x in xs])
    source["sampleBounds"] = [int(xs[0]), int(ys[0]), int(xs[-1]), int(ys[-1])]
    return FinishMap(samples, source, {"uCenter": .398, "uHalfSpan": .154, "vRange": [.722, .849]})


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
    return field


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
    return field


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
    return field


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
    first, last = outline[0][0], outline[-1][0]
    u = np.linspace(first, last, 33)
    xs, starts, ends = (np.interp(u, np.asarray(outline)[:, 0], column) for column in np.asarray(strips).T)
    samples = np.array([[Sample(image, x, y, radius=3) for y in np.linspace(start, end, 17)]
                        for x, start, end in zip(xs, starts, ends)])
    source["sampleStrips"] = strips
    field = FinishMap(samples, source, {"uCenter": (first+last)/2, "uHalfSpan": (last-first)/2, "vRange": [0, 1]})
    field["outlineUV"] = outline
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
    ix, iy = np.floor(xs).astype(int), np.floor(ys).astype(int)
    tx, ty = xs - ix, ys - iy
    photoTone = image @ LUMA
    above = (1 - tx) * photoTone[iy, ix] + tx * photoTone[iy, ix + 1]
    below = (1 - tx) * photoTone[iy + 1, ix] + tx * photoTone[iy + 1, ix + 1]
    tone = (1 - ty) * above + ty * below
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
            "axialCycles": round(axial * 345 / .406), "angularCycles": round(angular * np.pi * 316)}


def Main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--photos", type=Path, required=True, help="Local ReferencePhotos directory")
    args = options.parse_args()
    record = json.loads(RECORD.read_text(encoding="utf-8"))
    record["closeups"] = {"Barrel": BarrelFinish(args.photos), "Stem": StemFinish(args.photos),
                          "Saddle": ShoeFinish(args.photos), "Neck": NeckFinish(args.photos),
                          "Tab": TabFinish(args.photos, 5), "TabBack": TabFinish(args.photos, 2)}
    record["ringFinish"] = EyeFinish(args.photos)
    record["wheelFinish"] = WheelFinish(args.photos)
    record["knurl"] = KnurlFrequency(args.photos)
    encoded = json.dumps(record, ensure_ascii=False, indent=2)
    encoded = re.sub(r"\[\s*(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+)\s*\]",
                     lambda match: "[" + ", ".join(x.strip() for x in match[1].split(",")) + "]", encoded)
    RECORD.write_text(encoded + "\n", encoding="utf-8")
    print("Measured close-ups:", ", ".join(record["closeups"]), "knurl UV cycles:",
          record["knurl"]["angularCycles"], record["knurl"]["axialCycles"], flush=True)


if __name__ == "__main__":
    Main()
