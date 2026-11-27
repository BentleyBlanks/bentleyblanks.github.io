"""Register the visible surfaces of the selected photo to the existing prop rig."""

import argparse
import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from Script_TraceDadaoThreeViews import ColumnEdges, EdgeAt, SimplifyColumns


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FIT = ROOT / "_blender" / "Data_YangYunfengDadaoFit.json"
SOURCE_ANGLE = math.atan2(53, 100)
SOURCE_WIDENING = 1.15
SOURCE_PIVOT = (1090, 547)
VIRTUAL_SPAN = .900
VIRTUAL_TIP_Z = -.630


def ReadReference(source):
    with Image.open(source) as image:
        photo = np.array(image.convert("RGB"))
    if photo.shape != (872, 1700, 3):
        raise ValueError("Expected the approved 1700 × 872 photo reference")
    return photo


def SourceCoordinates(shape):
    """Use the markup recorded against the original photo before the approved widen."""
    y, x = np.indices(shape, dtype=np.float32)
    sine, cosine = math.sin(SOURCE_ANGLE), math.cos(SOURCE_ANGLE)
    pivot = -sine * SOURCE_PIVOT[0] + cosine * SOURCE_PIVOT[1]
    across = -sine * x + cosine * y
    change = (across - pivot) * (1 / SOURCE_WIDENING - 1)
    return x - sine * change + 135, y + cosine * change + 331


def PartMasks(photo):
    outline = np.min(photo, axis=2) < 248
    x, y = SourceCoordinates(outline.shape)
    blade = (y < 933) & (x < 1261 - .56 * np.maximum(0, y - 827))
    fabric = (y >= 830) & (x >= 1290 - .29 * (y - 834))
    red = (photo[..., 0].astype(np.int16) - photo[..., 1]) > 48
    ring = fabric & (x > 1638) & (y > 984) & ((x > 1715 - .53 * (y - 990)) | red)
    return {
        "Blade": outline & blade,
        "Guard": outline & ~blade & ~fabric,
        "Grip": outline & fabric & ~ring,
        "Pommel": outline & ring,
    }


def Register(masks):
    ys, xs = np.where(np.logical_or.reduce(list(masks.values())))
    gripY, gripX = np.where(masks["Grip"])
    best = None
    for angle in np.deg2rad(np.linspace(15, 33, 73)):
        sine, cosine = math.sin(angle), math.cos(angle)
        u = xs * cosine + ys * sine
        v = -xs * sine + ys * cosine
        left, right = np.min(u), np.max(u)
        scale = VIRTUAL_SPAN / (right - left)
        gu = gripX * cosine + gripY * sine
        gv = -gripX * sine + gripY * cosine
        positions = [left + (value - VIRTUAL_TIP_Z) / scale for value in (.030, .155)]
        centers = [gv[np.abs(gu - value) < 7] for value in positions]
        if any(len(values) == 0 for values in centers):
            continue
        dominant, support = [float(np.median(values)) for values in centers]
        tip = float(np.median(v[u < left + 8]))
        center = .62 * dominant + .38 * support
        score = 2.7 * ((tip - center) * scale + .012074) ** 2 + ((dominant - support) * scale) ** 2
        if best is None or score < best[0]:
            best = score, {
                "sin": sine, "cos": cosine, "scale": float(scale),
                "left": float(left), "center": center, "zMin": VIRTUAL_TIP_Z,
            }, {
                "left": int(math.floor(left)) - 12, "right": int(math.ceil(right)) + 12,
                "top": int(math.floor(v.min())) - 12, "bottom": int(math.ceil(v.max())) + 12,
            }
    if best is None:
        raise ValueError("The reference grip could not be registered to the game rig")
    return best[1:]


def PlateSamples(mask, tolerance, spacing, minHole=6):
    model = np.uint8(mask)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(model)
    main = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    if count > 2:
        model = np.uint8(labels == main)
    x0, y0, width, height = cv2.boundingRect(model)
    left, top = x0 - 2, y0 - 2
    crop = model[top:y0 + height + 2, left:x0 + width + 2]
    factor = 4
    enlarged = cv2.resize(crop.astype(np.float32), None, fx=factor, fy=factor, interpolation=cv2.INTER_LINEAR)
    boundaries, layout = cv2.findContours(np.uint8(enlarged >= .5), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    shape = max(range(len(boundaries)), key=lambda i: cv2.contourArea(boundaries[i]))
    ids = [shape] + [i for i, row in enumerate(layout[0])
                      if row[3] == shape and cv2.contourArea(boundaries[i]) >= minHole * factor ** 2]
    rim = []
    for i in ids:
        epsilon = (tolerance if i == shape else min(.75, tolerance)) * factor
        polygon = cv2.approxPolyDP(boundaries[i], epsilon, True).reshape(-1, 2)
        polygon = (polygon + .5) / factor - .5 + (left, top)
        rim.append(polygon.tolist())
    distance = cv2.distanceTransform(model, cv2.DIST_L2, 5)
    points = []
    stepX, stepY = spacing
    for y in range(y0, y0 + height, stepY):
        offset = stepX // 2 if (y - y0) // stepY % 2 else 0
        for x in range(x0 + offset, x0 + width, stepX):
            if distance[y, x] >= min(stepX, stepY) * .45:
                points.append([x, y, round(float(distance[y, x]), 2)])
    return {"loops": rim, "surface": points}


def CleanBladeOutline(points):
    outline = np.asarray(points, dtype=np.float64)
    closed = np.vstack((outline, outline[0]))
    distance = np.r_[0, np.cumsum(np.linalg.norm(np.diff(closed, axis=0), axis=1))]
    count = math.ceil(distance[-1] / .8)
    step = distance[-1] / count
    positions = np.arange(count) * step
    samples = np.stack([np.interp(positions, distance, component) for component in closed.T], axis=1)

    radius = math.ceil(11 / step)
    border = np.pad(samples, ((radius, radius), (0, 0)), mode="wrap")
    smooth = cv2.GaussianBlur(border, (1, 2 * radius + 1), 0, sigmaY=3.1 / step)[radius:-radius]
    # Broad changes in direction define the silhouette. Use longer chords to
    # recognize them so isolated bumps from the scanned edge do not get pinned.
    window = round(15 / step)
    before = samples - np.roll(samples, window, axis=0)
    after = np.roll(samples, -window, axis=0) - samples
    length = np.linalg.norm(before, axis=1) * np.linalg.norm(after, axis=1)
    turn = 1 - np.sum(before * after, axis=1) / np.maximum(1e-5, length)
    preserve = np.clip((turn - .21) / .45, 0, 1)
    keep = preserve * preserve * (3 - 2 * preserve)
    result = samples + (smooth - samples) * (1 - keep[:, None])
    for axis in (0, 1):
        for extreme in (np.argmin, np.argmax):
            anchor = outline[extreme(outline[:, axis])]
            nearest = np.argmin(np.linalg.norm(samples - anchor, axis=1))
            result[nearest] = anchor
    return cv2.approxPolyDP(result.astype(np.float32), .48, True).reshape(-1, 2).tolist()


def GripRows(mask, frame, atlas):
    sine, cosine = frame["sin"], frame["cos"]
    u = np.arange(atlas["left"], atlas["right"] + 1, dtype=np.float32)
    v = np.arange(atlas["top"], atlas["bottom"] + 1, dtype=np.float32)
    x = cosine * u[None, :] - sine * v[:, None]
    y = sine * u[None, :] + cosine * v[:, None]
    straight = cv2.remap(np.uint8(mask), x, y, cv2.INTER_NEAREST).astype(bool)
    edge = ColumnEdges(straight, atlas["top"])
    columns = edge[0] + atlas["left"]
    width = np.asarray(edge[2]) - np.asarray(edge[1])
    visible = np.flatnonzero(width >= 4)
    allowed = columns[visible[0]:visible[-1] + 1]
    top, bottom = EdgeAt((columns, edge[1], edge[2]), allowed)
    # Stop the sampling where the rounded hand wrap tucks into the fittings.
    return SimplifyColumns(allowed, (top, bottom), 18, 48, .62)


def Fit(source):
    photo = ReadReference(source)
    masks = PartMasks(photo)
    frame, atlas = Register(masks)
    silhouette = np.logical_or.reduce(list(masks.values()))
    # Keep a small overlap at the fittings without growing the outer silhouette.
    kernel = np.ones((5, 5), np.uint8)
    joined = {name: silhouette & (cv2.dilate(np.uint8(part), kernel) > 0) for name, part in masks.items()}
    blade = PlateSamples(joined["Blade"], .82, (20, 16))
    blade["loops"][0] = CleanBladeOutline(blade["loops"][0])
    return {
        "reference": {"sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "width": 1700, "height": 872},
        "frame": frame,
        "atlas": atlas,
        "parts": {
            "Blade": blade,
            "Guard": PlateSamples(joined["Guard"], .65, (7, 8)),
            "Pommel": PlateSamples(joined["Pommel"], .63, (7, 8)),
        },
        "grip": GripRows(joined["Grip"], frame, atlas),
    }, masks


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, default=DEFAULT_FIT)
    parser.add_argument("--review", type=Path)
    args = parser.parse_args()
    fit, labels = Fit(args.source)
    args.out.write_text(json.dumps(fit, separators=(",", ":")) + "\n", encoding="utf-8")
    print("Contours", {name: [len(row) for row in part["loops"]] for name, part in fit["parts"].items()})
    print("Surface samples", {name: len(part["surface"]) for name, part in fit["parts"].items()}, "Grip rows", len(fit["grip"]))
    print("Frame", fit["frame"])
    if args.review:
        source = ReadReference(args.source).astype(np.float32)
        for rgba, mask in zip(((100, 187, 230), (104, 209, 131), (246, 178, 58), (219, 85, 139)), labels.values()):
            source[mask] = .59 * source[mask] + .41 * np.asarray(rgba)
        review = Image.fromarray(np.uint8(source))
        review.thumbnail((640, 640), Image.Resampling.LANCZOS)
        review.save(args.review, quality=85)
