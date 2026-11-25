"""Measure visible steel finish from the local Mariners' Museum photos."""

import argparse
from hashlib import sha256
import json
from pathlib import Path
import re

import numpy as np
from PIL import Image


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
    xs = 510 + 431 * np.sin(2 * np.pi * angles)
    ys = np.linspace(468, 186, 21)
    samples = np.array([[Sample(image, x, y, radius=8) for y in ys] for x in xs])
    source["sampleBounds"] = [int(xs[0]), int(ys[-1]), int(xs[-1]), int(ys[0])]
    field = FinishMap(samples, source, {"uCenter": .642, "uHalfSpan": .132, "vRange": [.23, .89]})
    lightness = samples @ LUMA
    warmth = (samples[..., 0] - samples[..., 2]) / np.maximum(lightness, 25)
    field["oxideCoverage"] = np.rint(100 * np.clip((warmth - .15) / .29, 0, 1)).astype(int).tolist()
    return field


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
                          "Saddle": ShoeFinish(args.photos), "Neck": NeckFinish(args.photos)}
    record["knurl"] = KnurlFrequency(args.photos)
    encoded = json.dumps(record, ensure_ascii=False, indent=2)
    encoded = re.sub(r"\[\s*(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)+)\s*\]",
                     lambda match: "[" + ", ".join(x.strip() for x in match[1].split(",")) + "]", encoded)
    RECORD.write_text(encoded + "\n", encoding="utf-8")
    print("Measured close-ups:", ", ".join(record["closeups"]), "knurl UV cycles:",
          record["knurl"]["angularCycles"], record["knurl"]["axialCycles"], flush=True)


if __name__ == "__main__":
    Main()
