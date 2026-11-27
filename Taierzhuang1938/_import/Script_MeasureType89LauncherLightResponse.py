"""Measure the tab's warm response and the grip flank's response to calibrated light."""

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates

from Script_MeasureType89LauncherSteel import (
    RECORD, REGISTERED_LUMA, ContactAoSha256, FitSignedResponse, KnurlFlankResponseIdentity, Photo,
    ReadRegisteredLuma, ReadRegisteredRgb, RegisteredTabFace, ResponseEquations, SaveReferenceRecord,
    TabWarmIdentity, WriteResponseFields,
)

CHANNELS = ("Gain", "Across", "Along", "Rough", "Metal")


def GridAverage(u, v, selected, shape, sigma):
    bins = np.rint(u[selected] * (shape[0] - 1)).astype(int) * shape[1]
    bins += np.rint(v[selected] * (shape[1] - 1)).astype(int)

    def Deposit(values):
        field = np.bincount(bins, weights=values, minlength=np.prod(shape)).reshape(shape)
        return gaussian_filter(field, sigma)

    return Deposit, Deposit(np.ones(selected.sum()))


def Components(result, axes, sigma, coverage):
    fields = {axis: gaussian_filter(step * (result[..., 2*i] - result[..., 2*i+1]), sigma) * coverage
              for i, (axis, step, _, _) in enumerate(axes)}
    return [fields[name] for name in CHANNELS]


def TabWarmResponse(tab, photos, evidence):
    views = (("Default", 0, .22), ("Fill", 0, .39), ("Photo4", 1, .18), ("Museum", 0, .21))
    axes = (("Gain", .26, (1.40, 1.05), .035), ("Rough", .14, (.79, .69), .041),
            ("Metal", .18, (.67, .87), .045), ("Across", .16, (.43, .43), .064),
            ("Along", .16, (.43, .43), .066))
    shape = (61, 47)
    measured = []
    support = {}
    frameHashes = {}
    for name, source, weight in views:
        folder = evidence / f"V59TabStudy{name}"
        u, span, selected, target, gray, hashes = RegisteredTabFace(tab, photos, folder)
        if selected.sum() < 10000:
            raise ValueError(f"Too few visible samples in {folder.name}")

        def Read(tag):
            return ReadRegisteredLuma(folder, tag + ".png", hashes)[selected]

        if np.max(abs(Read("ProbeZero") - gray[selected])) > .6:
            raise ValueError(f"The unperturbed response differs from the baseline in {folder.name}")
        baseline = np.log(gray[selected] + 18)
        error = np.clip(np.log(target[source][selected] + 18) - baseline, -.35, .41)
        if name == "Museum":
            error *= .84
        basis = [np.log(Read(axis + side) + 18) - baseline
                 for axis, *_ in axes for side in ("Plus", "Minus")]
        deposit, count = GridAverage(u, span, selected, shape, (1.7, 1.65))

        def Average(values):
            return weight * deposit(values) / np.maximum(count, .45)

        measured.append(ResponseEquations(basis, error, Average, shape))
        support[name] = count
        frameHashes[folder.name] = hashes
    pull, matrix = (np.sum([view[i] for view in measured], axis=0) for i in (0, 1))
    result = FitSignedResponse(pull, matrix, axes, 10)
    u, v = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    edge = np.clip((np.minimum(u, 1-u) - .07)/.12, 0, 1) * np.clip((np.minimum(v, 1-v) - .07)/.12, 0, 1)
    coverage = edge * np.clip(np.minimum(support["Default"], support["Museum"]) / 1.01, 0, 1)
    fields = Components(result, axes, (.74, .83), coverage)
    return WriteResponseFields(RECORD.with_name("Texture_Type89LauncherTabWarmResponse.png"),
                               TabWarmIdentity(tab), fields, frameHashes, scale=63500)


def KnurlFlankResponse(flank, photo, evidence):
    folder = evidence / "V59Photo4GripStudy"
    hashes = {}
    hi, lo = (ReadRegisteredRgb(folder, f"uv{bits}.png", hashes) for bits in ("Hi", "Lo"))
    u, v = np.moveaxis((256 * hi[..., :2] + lo[..., :2]) / 65535, -1, 0)
    atlas = json.loads((RECORD.parents[3] / "_blender/Data_Type89LauncherSteelAtlas.json").read_bytes())
    first, last = atlas["knurlSourceV"]
    low, high = flank["footprint"]["vRange"]
    v = (first + (last-first) * v - low) / (high-low)
    source = flank["source"]
    arc, rows = np.asarray(source["uBySampleRow"]).T
    visible = (hi[..., 2] == 32) & (lo[..., 2] == 32) & (u > arc[0]) & (u < arc[-1]) & (v > 0) & (v < 1)
    ys, xs = np.where(visible)
    if len(ys) < 3000:
        raise ValueError("Too few visible samples in the grip flank evidence")
    crop = np.s_[ys.min()-2:ys.max()+3, xs.min()-2:xs.max()+3]
    u, v, visible = u[crop], v[crop], visible[crop]
    left, top, right, _ = source["sampleBounds"]
    target = map_coordinates(photo, (top + np.interp(u, arc, rows), left + (right-left-1.01) * v), order=1)
    u = (u - arc[0]) / (arc[-1] - arc[0])
    support = gaussian_filter(visible.astype(float), 4.4)
    selected = visible & (support > .76) & (target > 21) & (target < 242)
    if selected.sum() <= 1800:
        raise ValueError("Too few supported grip flank samples remain")

    def Smooth(field):
        return (gaussian_filter(field * visible, 4.4) / np.maximum(support, .03))[selected]

    def Read(tag):
        return Smooth(ReadRegisteredLuma(folder, tag + ".png", hashes)[crop])

    lights = ("Mixed", "Second", "Anchored", "Default")
    weights = np.array([.45, .25, .19, .11])
    axes = (("Rough", .12, (1.00, 1.02), .038), ("Gain", .27, (1.55, 1.15), .041),
            ("Metal", .16, (.58, .78), .038), ("Across", .18, (1.06, 1.06), .043),
            ("Along", .18, (.83, .83), .045))
    baseline = np.log(np.column_stack([Read(light) for light in lights]) + 19)
    residual = np.clip(np.log(Smooth(target) + 19)[:, None] - baseline, -.36, .41)
    residual *= np.array([1, 1, .48, .11])
    basis = [np.log(np.column_stack([Read(light + ("Base" if axis == "Gain" else axis) + side)
                                    for light in lights]) + 19) - baseline
             for axis, *_ in axes for side in ("Plus", "Minus")]
    shape = (37, 39)
    deposit, count = GridAverage(u, v, selected, shape, (1.30, 1.72))

    def Average(values):
        return deposit(values @ weights) / np.maximum(count, .43)

    pull, matrix = ResponseEquations(basis, residual, Average, shape)
    result = FitSignedResponse(pull, matrix, axes, 9)
    x, y = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    coverage = np.clip(count/1.25, 0, 1) * np.clip(np.minimum(x, 1-x)/.13, 0, 1)
    coverage *= np.clip(np.minimum(y, 1-y)/.15, 0, 1)
    fields = Components(result, axes, (.71, .79), coverage)
    return WriteResponseFields(RECORD.with_name("Texture_Type89LauncherKnurlFlankResponse.png"),
                               KnurlFlankResponseIdentity(flank), fields, {folder.name: hashes}, scale=63500)


def Main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--photos", type=Path, required=True)
    options.add_argument("--evidence", type=Path, required=True)
    args = options.parse_args()
    if ContactAoSha256() is None:
        raise ValueError("Rebuild the contact AO before calibrating the material response")
    reference = json.loads(RECORD.read_bytes())
    tab, flank = reference["closeups"]["Tab"], reference["knurl"]["flankWear"]
    photos = [Photo(args.photos, number) for number in (5, 4)]
    for entry, (_, evidence) in zip((tab["source"], flank["source"]), photos):
        if entry["sha256"] != evidence["sha256"]:
            raise ValueError("The supplied reference photos do not match the registered material samples")
    luma = [image @ REGISTERED_LUMA for image, _ in photos]
    tab["warmCalibration"] = TabWarmResponse(tab, luma, args.evidence)
    flank["surfaceCalibration"] = KnurlFlankResponse(flank, luma[1], args.evidence)
    SaveReferenceRecord(reference)
    print("Measured tab warm shading and the grip flank material response")


if __name__ == "__main__":
    Main()
