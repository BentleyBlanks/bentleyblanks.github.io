"""Extract exterior contours for the game mesh from the approved prop sheet."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "_blender" / "Data_SichuanDadaoThreeViewFit.json"


def Isolate(mask):
    _, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8))
    largest = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    return labels == largest


def ReadViews(source):
    with Image.open(source) as image:
        raw = np.array(image.convert("RGB"))
    if raw.shape[:2] != (1536, 2304):
        raise ValueError("Expected the approved 2304 × 1536 prop sheet")
    luma = cv2.cvtColor(raw, cv2.COLOR_RGB2GRAY)
    threshold = float(np.median(luma[:, :30])) - 39
    front, side, reverse = [Isolate(part < threshold) for part in np.split(luma, 3)]
    return raw, front, side, reverse[::-1]


def SignedDistance(mask):
    inside = cv2.distanceTransform(mask.astype(np.uint8), cv2.DIST_L2, 5)
    outside = cv2.distanceTransform((~mask).astype(np.uint8), cv2.DIST_L2, 5)
    return inside - outside


def ColumnEdges(mask, offset=0):
    valid = np.flatnonzero(mask.any(axis=0))
    top = [np.flatnonzero(mask[:, u])[0] - .5 + offset for u in valid]
    bottom = [np.flatnonzero(mask[:, u])[-1] + .5 + offset for u in valid]
    return valid, top, bottom


def EdgeAt(edges, columns):
    u, low, high = edges
    return np.interp(columns, u, low), np.interp(columns, u, high)


def SimplifyColumns(columns, contours, spacing, limit, tolerance):
    values = np.asarray(contours)
    controls = set(range(0, len(columns), spacing)) | {len(columns) - 1}
    while len(controls) < limit:
        ordered = sorted(controls)
        deviations = [
            np.abs(curve - np.interp(columns, columns[ordered], curve[ordered]))
            for curve in values
        ]
        error = np.max(deviations, axis=0)
        point = int(np.argmax(error))
        if error[point] <= tolerance:
            break
        controls.add(point)
    return [[int(columns[i]), *[round(float(v), 2) for v in values[:, i]]]
            for i in sorted(controls)]


def FitRows(edges, narrow, start, end, spacing, limit):
    columns = np.arange(start, end + 1)
    contours = (*EdgeAt(edges, columns), *EdgeAt(narrow, columns))
    return SimplifyColumns(columns, contours, spacing, limit, 1.25)


def FitGuard(broad):
    left, right = 1450, 1552
    patch = broad[:, left:right + 1]
    contours, _ = cv2.findContours(patch.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    outline = cv2.approxPolyDP(max(contours, key=cv2.contourArea), .72, True).reshape(-1, 2)
    return (outline + (left, 0)).tolist()


def FitRing(broad, narrow):
    patch = (~broad[246:396, 2081:2209]).astype(np.uint8)
    _, labels, stats, centroids = cv2.connectedComponentsWithStats(patch)
    holes = [(stats[i, cv2.CC_STAT_AREA], i) for i in range(1, len(stats))
             if not (labels[0] == i).any() and not (labels[-1] == i).any()
             and not (labels[:, 0] == i).any() and not (labels[:, -1] == i).any()]
    _, hole = max(holes)
    center = centroids[hole] + (2081, 246)
    radii = np.arange(0, 98, .20)
    samples = []
    for angle in np.linspace(0, math.tau, 88, endpoint=False):
        ray = np.array([math.cos(angle), math.sin(angle)])
        points = center + radii[:, None] * ray
        x, y = np.rint(points).astype(int).T
        inside = broad[y, x] & (x >= 2074)
        entries = np.flatnonzero(inside & ~np.r_[False, inside[:-1]])
        start = int(entries[0])
        ends = np.flatnonzero(~inside[start + 1:])
        end = start + 1 + int(ends[0]) if len(ends) else len(radii) - 1
        inner = center + (radii[start] - .10) * ray
        outer = center + (radii[end] - .10) * ray
        u = (inner[0] + outer[0]) / 2
        low, high = [float(v) for v in EdgeAt(narrow, u)]
        samples.append([round(float(n), 2) for n in (*outer, *inner, low, high)])
    return samples


def FitFrame(broad, edges):
    v, u = np.where(broad)
    left, right = float(u.min()), float(u.max())
    gripU = left + (right - left) * (.7225 / .900)
    gripV = float(np.mean(EdgeAt(edges, gripU)))
    tipU = left + .004 * (right - left) / .900
    tipV = float(np.mean(EdgeAt(edges, tipU)))
    angle = math.atan2(-.012074, -.7185) - math.atan2(tipV - gripV, tipU - gripU)
    sin, cos = math.sin(angle), math.cos(angle)
    longitudinal = (u - gripU) * cos - (v - gripV) * sin
    minZ, maxZ = float(longitudinal.min()), float(longitudinal.max())
    return {
        "axisU": gripU, "axisV": gripV, "axisDepth": 774.5,
        "sin": sin, "cos": cos, "metersPerPixel": .900 / (maxZ - minZ),
        "zMin": -.630, "zPixelMin": minZ,
    }


def Fit(source):
    _, front, side, reverse = ReadViews(source)
    broad = (SignedDistance(front) + SignedDistance(reverse)) > 0
    edges, depth = ColumnEdges(broad), ColumnEdges(side, 512)
    first = int(edges[0][0])
    # Follow the uninterrupted blade cross section up to the guard. Its curled
    # ends are traced on their own so they do not fill the gaps at the shoulder.
    blade = broad[:, :1475].copy()
    for column in blade.T[1440:]:
        occupied = np.flatnonzero(column)
        runs = np.split(occupied, np.flatnonzero(np.diff(occupied) > 1) + 1)
        section = max(runs, key=len)
        column[:section[0]] = False
        column[section[-1]+1:] = False
    bladeEdges = ColumnEdges(blade)
    guardColumns = np.arange(1450, 1553)
    return {
        "referenceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "atlas": {"left": 116, "right": 2210, "top": 193, "bottom": 451, "sideTop": 728, "sideBottom": 817},
        "frame": FitFrame(broad, edges),
        "blade": FitRows(bladeEdges, depth, first, 1483, 60, 82),
        "guard": FitGuard(broad),
        "guardDepth": SimplifyColumns(guardColumns, EdgeAt(depth, guardColumns), 30, 22, .60),
        "grip": FitRows(edges, depth, 1538, 2085, 18, 92),
        "ring": FitRing(broad, depth),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    data = Fit(args.source)
    # Keep one section sample per line to allow reviewing changes to the fit.
    scalars = {key: value for key, value in data.items() if not isinstance(value, list)}
    sections = [json.dumps(scalars, indent=2)[:-2]]
    for key, values in data.items():
        if isinstance(values, list):
            rows = ",\n".join("    " + json.dumps(row) for row in values)
            sections.append(f'  "{key}": [\n{rows}\n  ]')
    args.out.write_text(",\n".join(sections) + "\n}\n", encoding="utf-8")
    print(f"Fit saved: {args.out}")
    print({key: len(value) for key, value in data.items() if isinstance(value, list)})
