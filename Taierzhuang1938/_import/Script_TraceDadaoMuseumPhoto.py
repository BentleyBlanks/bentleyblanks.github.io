"""Fit the visible game-prop contour to museum reference 02."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from Script_TraceDadaoThreeViews import ColumnEdges, Crossing, EdgeAt, FitFrame, SignedDistance, SimplifyColumns


BLENDER = Path(__file__).resolve().parents[1] / "_blender"
OUTPUT = BLENDER / "Data_SichuanDadaoMuseumFit.json"
PRIOR = BLENDER / "Data_SichuanDadaoThreeViewFit.json"
GUARD_START, GUARD_END = 1476, 1610
BLADE_END = 1530
HILT_START, HILT_END = 1569, 2043


def ReadProfile(source):
    with Image.open(source) as image:
        rgba = np.asarray(image.convert("RGBA"))
    if rgba.shape[:2] != (512, 2304):
        raise ValueError("Expected the registered museum photograph at 2304 × 512")
    return rgba[..., :3], rgba[..., 3] >= 128


def Depths(prior, segment, columns, widthGain, axis):
    rows = np.asarray(prior[segment])
    half = (rows[:, -1] - rows[:, -2]) / 2
    stations = (rows[:, 0] - rows[0, 0]) / (rows[-1, 0] - rows[0, 0])
    along = (columns - columns[0]) / (columns[-1] - columns[0])
    radius = np.interp(along, stations, half) * widthGain
    return axis - radius, axis + radius


def BladeRows(mask, prior, axis):
    start = int(np.flatnonzero(mask.any(axis=0))[0])
    columns = np.arange(start, BLADE_END + 1)
    measured = ColumnEdges(mask[:, :GUARD_START])
    upper, lower = EdgeAt(measured, columns)
    # Continue the concealed shoulder into the guard with the measured local slope.
    hidden = columns >= GUARD_START
    last = GUARD_START - start - 1
    for boundary in (upper, lower):
        slope = (boundary[last] - boundary[last - 36]) / 36
        boundary[hidden] = boundary[last] + (columns[hidden] - GUARD_START + 1) * slope
    near, far = Depths(prior, "blade", columns, 1, axis)
    return SimplifyColumns(columns, (upper, lower, near, far), 36, 96, .76)


def GuardRows(mask, prior, axis):
    patch = np.uint8(mask[:, GUARD_START:GUARD_END + 1])
    contours, _ = cv2.findContours(patch, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    outline = cv2.approxPolyDP(max(contours, key=cv2.contourArea), .81, True).reshape(-1, 2)
    columns = np.arange(GUARD_START, GUARD_END + 1)
    depth = Depths(prior, "guardDepth", columns, .9, axis)
    return (outline + (GUARD_START, 0)).tolist(), SimplifyColumns(columns, depth, 30, 12, .75)


def HiltRows(edges, prior, axis):
    columns = np.arange(HILT_START, HILT_END + 1)
    visibleStart, visibleEnd = GUARD_END + 1, 2020
    surface = np.clip(columns, visibleStart, visibleEnd)
    upper, lower = EdgeAt(edges, surface)
    upper[:visibleStart-HILT_START] += (visibleStart - columns[:visibleStart-HILT_START]) * .18
    lower[columns > visibleEnd] -= (columns[columns > visibleEnd] - visibleEnd) * .14
    near, far = Depths(prior, "grip", columns, .45, axis)
    return SimplifyColumns(columns, (upper, lower, near, far), 24, 45, .72)


def RingRows(mask, axis):
    _, _, stats, centers = cv2.connectedComponentsWithStats(np.uint8(~mask))
    candidates = [i for i in range(1, len(stats))
                  if stats[i, cv2.CC_STAT_LEFT] > HILT_END - 10 and stats[i, cv2.CC_STAT_AREA] > 300]
    hole = max(candidates, key=lambda i: stats[i, cv2.CC_STAT_AREA])
    center = centers[hole]
    holeStart = stats[hole, cv2.CC_STAT_LEFT]
    holeEnd = holeStart + stats[hole, cv2.CC_STAT_WIDTH]
    outerEnd = np.flatnonzero(mask.any(axis=0))[-1]
    cutoff = holeStart - (outerEnd - holeEnd) * .9
    distance = SignedDistance(mask)
    hiltTop = np.flatnonzero(mask[:, 1995])[0]
    radii = np.arange(0, 200, .2)
    samples = []
    for angle in np.linspace(0, math.tau, 96, endpoint=False):
        ray = np.array([math.cos(angle), math.sin(angle)])
        x, y = (center + radii[:, None] * ray).astype(np.float32).T
        values = cv2.remap(distance, x[None, :], y[None, :], cv2.INTER_LINEAR)[0]
        # Above the hilt, the shoulder of the loop follows the open photo contour.
        join = cutoff - np.clip(hiltTop + 10 - y, 0, 24)
        values = np.minimum(values, (x - join) * 2)
        start, end = np.flatnonzero((values[1:] > 0) != (values[:-1] > 0))[:2] + 1
        inner = center + Crossing(radii, values, start) * ray
        outer = center + Crossing(radii, values, end) * ray
        thickness = np.clip(np.linalg.norm(outer - inner) * .39, 6, 13)
        samples.append([round(float(v), 2) for v in (*outer, *inner, axis - thickness, axis + thickness)])
    return samples


def Fit(source):
    _, mask = ReadProfile(source)
    ys, xs = np.where(mask)
    prior = json.loads(PRIOR.read_text(encoding="utf-8"))
    edges = ColumnEdges(mask)
    frame = FitFrame(mask, edges)
    axis = frame["axisDepth"]
    guard, guardDepth = GuardRows(mask, prior, axis)
    atlas = {"left": int(xs.min()) - 6, "right": int(xs.max()) + 6,
             "top": int(ys.min()) - 8, "bottom": int(ys.max()) + 8,
             "sideTop": prior["atlas"]["sideTop"], "sideBottom": prior["atlas"]["sideBottom"]}
    return {
        "referenceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "atlas": atlas,
        "frame": frame,
        "blade": BladeRows(mask, prior, axis),
        "guard": guard,
        "guardDepth": guardDepth,
        "grip": HiltRows(edges, prior, axis),
        "ring": RingRows(mask, axis),
    }


def Save(data, output):
    # Keep the sampled contours readable without wrapping each coordinate.
    scalars = {key: value for key, value in data.items() if not isinstance(value, list)}
    sections = [json.dumps(scalars, indent=2)[:-2]]
    for key, rows in data.items():
        if isinstance(rows, list):
            lines = ",\n".join("    " + json.dumps(row) for row in rows)
            sections.append(f'  "{key}": [\n{lines}\n  ]')
    output.write_text(",\n".join(sections) + "\n}\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Registered RGBA museum photograph")
    parser.add_argument("--out", type=Path, default=OUTPUT)
    args = parser.parse_args()
    fit = Fit(args.source)
    Save(fit, args.out)
    print({key: len(rows) for key, rows in fit.items() if isinstance(rows, list)})
