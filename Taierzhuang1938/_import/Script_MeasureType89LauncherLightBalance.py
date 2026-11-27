"""Rebuild the tab and grip correction maps from measured light perturbations."""

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.ndimage import binary_erosion, gaussian_filter, map_coordinates

from Script_MeasureType89LauncherLightResponse import Components, GridAverage, RegisterFlank
from Script_MeasureType89LauncherSteel import (
    RECORD, REGISTERED_LUMA, FitSignedResponse, GripLightBalanceIdentity, Photo,
    ReadRegisteredLuma, ReadRegisteredRgb, RegisteredTabFace, ResponseEquations, SaveReferenceRecord,
    TabLightBalanceIdentity, WriteResponseFields,
)


def MeasureLights(read, lights, offsets, axes, target, weights, deposit, count, shape, support, factors=1):
    origin, clipLow, clipHigh = offsets
    baseline = np.log(np.column_stack([read(light) for light in lights]) + origin)
    difference = np.clip(np.log(target[:, None] + origin) - baseline, clipLow, clipHigh) * factors
    basis = [np.log(np.column_stack([
        read(light + ("Base" if axis == "Gain" else axis) + sign) for light in lights
    ]) + origin) - baseline for axis, *_ in axes for sign in ("Plus", "Minus")]

    def Average(values):
        return deposit(values @ np.asarray(weights)) / np.maximum(count, support)

    return ResponseEquations(basis, difference, Average, shape)


def TabLightBalance(tab, photos, evidence, neutral, alternate):
    hashes = {}
    hi, lo = (ReadRegisteredRgb(evidence, f"uv{word}.png", hashes).astype(np.int32) for word in ("Hi", "Lo"))
    u, v = np.moveaxis((256 * hi[..., :2] + lo[..., :2]) / 65535, -1, 0)
    anchors, lower, upper = np.asarray(tab["outlineUV"]).T
    low, high = [np.interp(u, anchors, rail) for rail in (lower, upper)]
    span = (v - low) / (high - low)
    x, first, last = [np.interp(u, anchors, column) for column in np.asarray(tab["source"]["sampleStrips"]).T]
    target = map_coordinates(photos[0], (first + np.clip(span, 0, 1) * (last - first), x), order=1)
    visible = (hi[..., 2] == 32) & (lo[..., 2] == 32) & (u > anchors[0] + .05) & (u < anchors[-1] - .05)
    visible = binary_erosion(visible & (span > .15) & (span < .85), iterations=1)
    if visible.sum() < 9000:
        raise ValueError("Too few visible samples in the tab light balance evidence")
    u = (u - anchors[0]) / (anchors[-1] - anchors[0])

    def Read(tag):
        return ReadRegisteredLuma(evidence, tag + ".png", hashes)[visible]

    lights = ("EyeMix1", "EyeMix3", "EyeMix4", "EyeMix5", "Default", "Museum", "Independent")
    weights = (.10, .05, .075, .12, .14, .055, .065)
    axes = (("Gain", .27, (.69, .69), .042), ("Rough", .12, (.76, .76), .044),
            ("Metal", .16, (.66, .66), .047), ("Across", .18, (.72, .72), .055),
            ("Along", .18, (.59, .59), .061))
    shape = (65, 47)
    deposit, count = GridAverage(u, span, visible, shape, (1.65, 1.50))
    pull, matrix = MeasureLights(Read, lights, (18, -.31, .35), axes, target[visible], weights,
                                 deposit, count, shape, .36)
    frameHashes = {evidence.name: hashes}
    # The earlier neutral test and paired photograph use a second camera and
    # different probe steps. Accumulate their responses in the same UV grid.
    legacySteps = {"Gain": .26, "Rough": .14, "Metal": .18, "Across": .16, "Along": .16}
    for folder, photograph, weight in ((neutral, 0, .19), (alternate, 1, .205)):
        legacyU, legacySpan, selected, targets, gray, legacyHashes = RegisteredTabFace(tab, photos, folder)
        if selected.sum() < 10000:
            raise ValueError(f"Too few registered samples in {folder.name}")
        baseline = np.log(gray[selected] + 18)
        difference = np.clip(np.log(targets[photograph][selected] + 18) - baseline, -.31, .35)
        basis = []
        for axis, step, *_ in axes:
            for sign in ("Plus", "Minus"):
                sample = ReadRegisteredLuma(folder, axis + sign + ".png", legacyHashes)[selected]
                basis.append((np.log(sample + 18) - baseline) * step / legacySteps[axis])
        distribute, support = GridAverage(legacyU, legacySpan, selected, shape, (1.65, 1.50))

        def Average(values):
            return weight * distribute(values) / np.maximum(support, .44)

        addition, response = ResponseEquations(basis, difference, Average, shape)
        pull += addition
        matrix += response
        frameHashes[folder.name] = legacyHashes

    result = FitSignedResponse(pull, matrix, axes, 10)
    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    coverage = np.clip((np.minimum(uu, 1-uu) - .085)/.13, 0, 1) * np.clip((np.minimum(vv, 1-vv) - .09)/.14, 0, 1)
    coverage *= np.clip(count / 1.5, 0, 1)
    fields = Components(result, axes, (.8, .8), coverage)
    return WriteResponseFields(RECORD.with_name("Texture_Type89LauncherTabLightBalance.png"),
                               TabLightBalanceIdentity(tab), fields, frameHashes, scale=70000)


def GripLightBalance(flank, photo, evidence):
    hashes = {}
    u, v, visible, target, crop = RegisterFlank(flank, photo, evidence, hashes)
    support = gaussian_filter(visible.astype(float), 4.1)
    selected = visible & (support > .78) & (target > 21) & (target < 242)
    if selected.sum() <= 1800:
        raise ValueError("Too few supported samples in the grip light balance evidence")

    def Smooth(field):
        return (gaussian_filter(field * visible, 4.1) / np.maximum(support, .03))[selected]

    def Read(tag):
        return Smooth(ReadRegisteredLuma(evidence, tag + ".png", hashes)[crop])

    lights = ("Mixed", "Second", "Anchored", "Default")
    weights = (.371, .215, .325, .089)
    axes = (("Rough", .12, (.65, .65), .042), ("Gain", .27, (.72, .63), .045),
            ("Metal", .16, (.56, .56), .045), ("Across", .18, (.38, .38), .054),
            ("Along", .18, (.34, .34), .056))
    shape = (37, 39)
    deposit, count = GridAverage(u, v, selected, shape, (1.35, 1.72))
    pull, matrix = MeasureLights(Read, lights, (19, -.29, .30), axes, Smooth(target), weights,
                                 deposit, count, shape, .45, np.array([1, 1, 1, .06]))
    result = FitSignedResponse(pull, matrix, axes, 10)
    uu, vv = np.meshgrid(np.linspace(0, 1, shape[0]), np.linspace(0, 1, shape[1]), indexing="ij")
    coverage = np.clip(count/1.28, 0, 1) * np.clip(np.minimum(uu, 1-uu)/.13, 0, 1)
    coverage *= np.clip(np.minimum(vv, 1-vv)/.16, 0, 1)
    fields = Components(result, axes, (.74, .84), coverage)
    return WriteResponseFields(RECORD.with_name("Texture_Type89LauncherGripLightBalance.png"),
                               GripLightBalanceIdentity(flank), fields, {evidence.name: hashes}, scale=70000)


def Main():
    options = argparse.ArgumentParser(description=__doc__)
    options.add_argument("--photos", type=Path, required=True)
    options.add_argument("--tab-evidence", type=Path, required=True)
    options.add_argument("--neutral-evidence", type=Path, required=True)
    options.add_argument("--photo4-evidence", type=Path, required=True)
    options.add_argument("--grip-evidence", type=Path, required=True)
    args = options.parse_args()
    reference = json.loads(RECORD.read_bytes())
    tab = reference["closeups"]["Tab"]
    flank = reference["knurl"]["flankWear"]
    primary, primarySource = Photo(args.photos, 5)
    paired, pairedSource = Photo(args.photos, 4)
    if (primarySource["sha256"] != tab["source"]["sha256"]
            or pairedSource["sha256"] != tab["source"]["pairedPhoto"]["sha256"]
            or pairedSource["sha256"] != flank["source"]["sha256"]):
        raise ValueError("The supplied photos do not match the tab and grip references")
    photos = (primary @ REGISTERED_LUMA, paired @ REGISTERED_LUMA)
    tab["lightBalance"] = TabLightBalance(tab, photos, args.tab_evidence, args.neutral_evidence, args.photo4_evidence)
    flank["lightBalance"] = GripLightBalance(flank, photos[1], args.grip_evidence)
    SaveReferenceRecord(reference)
    print("Measured and packed the tab and grip light balance")


if __name__ == "__main__":
    Main()
