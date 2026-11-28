"""Bake the museum-referenced steel finish into one color, normal and ORM atlas."""

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, gaussian_filter1d, map_coordinates

from Script_BakePbrTexture import GaussianPeriodic, LinearToSrgb, NormalFromHeight, Sha256, SrgbToLinear
from Script_MeasureType89LauncherSteel import (
    BarrelJointIdentity, CollarJointIdentity, CollarReflectanceIdentity, GripFamilyPhaseIdentity, GripRearIdentity,
    NeckJointIdentity, ReverseReflectionIdentity, SaddleJointIdentity, SaddleReflectanceIdentity, SaddleRimIdentity,
    ShoulderReflectanceIdentity, SleeveJointIdentity, SleeveOpticalIdentity, SleeveReverseIdentity, StemJointIdentity,
    SurfaceBalanceIdentity, TabReflectanceIdentity, WheelOxideIdentity, WideReflectionIdentity,
)


HERE = Path(__file__).resolve().parent
STEM = "Type89LauncherSteel"
SOURCE = HERE / "Source/Type89Launcher/Texture_Type89LauncherSteelSource.webp"
CONTACT_AO = SOURCE.with_name("Texture_Type89LauncherContactAo.png")
CONTACT_RECORD = CONTACT_AO.with_name("Data_Type89LauncherContactAo.json")
SEAM_AO = SOURCE.with_name("Texture_Type89LauncherSeamAo.png")
SEAM_RECORD = SEAM_AO.with_name("Data_Type89LauncherSeamAo.json")
JOINT_AO = SOURCE.with_name("Texture_Type89LauncherJointAo.png")
JOINT_RECORD = JOINT_AO.with_name("Data_Type89LauncherJointAo.json")
CONTACT_DETAIL_AO = SOURCE.with_name("Texture_Type89LauncherContactDetailAo.png")
CONTACT_DETAIL_RECORD = CONTACT_DETAIL_AO.with_name("Data_Type89LauncherContactDetailAo.json")
REFERENCE = HERE / "Reference/Type89Launcher/Data_Type89LauncherSteelReference.json"
ATLAS_FILE = HERE.parent / "_blender/Data_Type89LauncherSteelAtlas.json"
CONTACT_ATLAS_FILE = ATLAS_FILE.with_name("Data_Type89LauncherContactAtlas.json")
ATLAS = json.loads(ATLAS_FILE.read_text(encoding="utf-8"))
CONTACT_ATLAS = json.loads(CONTACT_ATLAS_FILE.read_text(encoding="utf-8"))
LUMA = np.array([.2126, .7152, .0722], dtype=np.float32)
LUMA_NEUTRAL_WARMTH = np.array([.48, -.101, -.414])

# API sample quadrant, polished sRGB, oxidized sRGB, oxide coverage,
# polished / oxidized roughness, polished / oxidized metalness, relief strength.
FINISHES = {
    "Barrel": (0, (184, 178, 162), (74, 69, 61), .63, (.244, .56), (.96, .61), .64),
    "Stem": (1, (155, 151, 141), (77, 69, 61), .51, (.29, .60), (.96, .53), .71),
    "Collar": (0, (180, 177, 164), (82, 72, 62), .50, (.215, .54), (.98, .53), .43),
    "Shoulder": (0, (168, 160, 151), (64, 53, 45), .58, (.41, .69), (.89, .43), .60),
    "Knurl": (3, (145, 140, 135), (86, 79, 74), .49, (.392, .622), (.947, .44), .79),
    "Sleeve": (1, (84, 83, 83), (44, 43, 43), .73, (.64, .80), (.84, .30), .62),
    "Saddle": (2, (119, 128, 129), (70, 74, 73), .59, (.48, .76), (.88, .34), .92),
    "Tab": (2, (141, 129, 114), (70, 53, 39), .51, (.35, .68), (.95, .41), .73),
    "SaddleBack": (2, (115, 119, 114), (62, 53, 44), .66, (.51, .78), (.88, .32), .86),
    "Edge": (0, (182, 179, 165), (71, 61, 50), .36, (.255, .59), (.98, .43), .49),
    "Neck": (2, (130, 124, 116), (60, 51, 43), .55, (.46, .80), (.91, .28), .77),
    "Recess": (1, (41, 39, 36), (24, 22, 20), .61, (.67, .85), (.32, .16), .28),
    "SaddleRim": (2, (126, 129, 124), (55, 50, 43), .61, (.34, .70), (.89, .38), .49),
    "Channel": (1, (73, 69, 60), (32, 28, 24), .58, (.49, .81), (.77, .22), .60),
    "TabBack": (2, (174, 162, 148), (85, 73, 61), .47, (.348, .65), (.96, .43), .71),
    "RearEye": (2, (162, 150, 136), (67, 53, 43), .52, (.40, .71), (.95, .44), .67),
    "Wheel": (2, (151, 136, 120), (56, 37, 28), .66, (.45, .76), (.95, .38), .77),
    "CollarRing": (0, (172, 171, 164), (66, 59, 52), .56, (.309, .61), (.95, .49), .56),
}

# Finish, coverage channel, roughness, metallic, blend strength and relief attenuation.
REGISTERED_FINISHES = {
    "Stem": ((177, 162, 144), "rubbedCoverage", .406, .84, .49, .43),
    "Sleeve": ((148, 89, 40), "oxideCoverage", .76, .24, .78, .31),
    "Saddle": ((121, 105, 82), "oxideCoverage", .74, .31, .65, .16),
    "Neck": ((113, 97, 79), "oxideCoverage", .78, .34, .65, .15),
    "Tab": ((163, 149, 134), "rubbedCoverage", .425, .88, .59, .29),
    "TabBack": ((174, 165, 151), "rubbedCoverage", .40, .90, .71, .28),
}


def UnitVariation(field, lower, upper):
    filtered = GaussianPeriodic(field, lower) - GaussianPeriodic(field, upper)
    return np.clip(filtered / max(filtered.std(), 1e-5), -3, 3).astype(np.float32)


def SeamBlend(field, pixels=24):
    """Blend only the angular seam, keeping the axial patina field intact."""
    padding = ATLAS["padding"]
    end = field.shape[1] - padding
    width = min(pixels, (end - padding) // 8)
    ramp = np.linspace(0, 1, width, dtype=np.float32)[None, :, None]
    left = field[:, padding:padding + width].copy()
    right = field[:, end - width:end][:, ::-1].copy()
    average = (left + right) * .5
    field[:, padding:padding + width] = average * (1 - ramp) + left * ramp
    field[:, end - width:end] = (average * (1 - ramp) + right * ramp)[:, ::-1]
    field[:, :padding] = average[:, :1]
    field[:, end:] = average[:, :1]
    return field


def WrapKnurlPadding(pixels):
    padding = ATLAS["padding"]
    pixels[:, :padding] = pixels[:, -2 * padding:-padding]
    pixels[:, -padding:] = pixels[:, padding:2 * padding]


def BlendKnurlSeam(field):
    # Match the value at the wrap without mirroring the diagonal grooves.
    padding = ATLAS["padding"]
    end = field.shape[1] - padding
    span = 15
    delta = .5 * (field[:, end] - field[:, padding])
    weight = np.linspace(1, 0, span, dtype=np.float32)
    weight = (weight**2 * (3 - 2 * weight))[None, :, None]
    field[:, padding:padding + span] += delta[:, None] * weight
    field[:, end - span + 1:end + 1] -= delta[:, None] * weight[:, ::-1]
    WrapKnurlPadding(field)


def ReferenceField(data, xx, vv, values):
    stencil = np.asarray(data[values], dtype=np.float32)
    footprint = data["footprint"]
    arc = (xx - footprint["uCenter"]) / footprint["uHalfSpan"]
    first, last = footprint["vRange"]
    axial = (vv - first) / (last - first)
    row = np.clip((arc + 1) * .5, 0, 1) * (stencil.shape[0] - 1)
    col = np.clip(axial, 0, 1) * (stencil.shape[1] - 1)
    i0, j0 = row.astype(np.int32), col.astype(np.int32)
    i1 = np.minimum(i0 + 1, stencil.shape[0] - 1)
    j1 = np.minimum(j0 + 1, stencil.shape[1] - 1)
    du, dv = row - i0, col - j0
    a = stencil[i0, j0] * (1 - du) + stencil[i1, j0] * du
    b = stencil[i0, j1] * (1 - du) + stencil[i1, j1] * du
    fade = np.clip((1.26 - abs(arc)) * 3.8, 0, 1)
    fade *= np.clip((axial + .14) * 7, 0, 1) * np.clip((1.13 - axial) * 7, 0, 1)
    return (a * (1 - dv) + b * dv) * fade


def CheckBarrelRegistration(calibration, closeup):
    if (calibration["photoSha256"] != closeup["source"]["sha256"]
            or calibration["projection"] != closeup["source"]["projection"]
            or calibration["footprint"] != closeup["footprint"]):
        raise ValueError("The barrel calibration does not match the source photo and projection")


def CheckSleeveRegistration(calibration, closeup):
    if (calibration["photoSha256"] != closeup["source"]["sha256"]
            or calibration["sampleRails"] != closeup["source"]["sampleRails"]
            or calibration["footprint"] != closeup["footprint"]):
        raise ValueError("The sleeve calibration does not match the source photo and projection")


def RegisterKnurlFlankPattern(knurl, angular, axial, u, v):
    flank = knurl["flankWear"]
    calibration = flank.get("patternRegistration")
    if calibration is None:
        return angular, axial
    if (calibration["photoSha256"] != flank["source"]["sha256"]
            or calibration["footprint"] != flank["footprint"]
            or calibration["uBySampleRow"] != flank["source"]["uBySampleRow"]
            or calibration["cyclesPerChart"] != [knurl["angularCycles"], knurl["axialCycles"]]
            or calibration["responseSha256"] != flank.get("surfaceCalibration", {}).get("sha256")):
        raise ValueError("The grip pattern registration must match the side photo and current material response")
    source = calibration["photo"]
    measured = tuple(calibration["controls"].values())
    cycles = np.array(source["cyclesScale"]) / np.median([row["cyclesScale"] for row in measured], axis=0) - 1
    phase = np.array(source["phaseByDiagonal"]) - np.median([row["phaseByDiagonal"] for row in measured], axis=0)
    phase = (phase + .5) % 1 - .5
    angularOffset, axialOffset = np.round(.5 * np.array([phase.sum(), phase[0] - phase[1]]), 8).tolist()
    angularScale, axialScale = np.round(cycles, 8).tolist()
    footprint = flank["footprint"]
    center, halfSpan = footprint["uCenter"], footprint["uHalfSpan"]
    low, high = footprint["vRange"]
    mid = (low + high) / 2
    # Taper the pattern shift into the rest of the rotating surface.
    weight = np.clip((halfSpan + .038 - abs(u - center)) / .046, 0, 1)
    weight *= np.clip((v - low + .044) / .061, 0, 1) * np.clip((high + .044 - v) / .061, 0, 1)
    weight = weight**2 * (3 - 2 * weight)
    angularCenter, axialCenter = knurl["angularCycles"] * center, knurl["axialCycles"] * mid
    return (angular + weight * (angularScale * (angular - angularCenter) + angularOffset),
            axial + weight * (axialScale * (axial - axialCenter) + axialOffset))


def ApplyBaseLogGain(base, logGain):
    corrected = LinearToSrgb(SrgbToLinear(np.clip(base, 0, 1)) * np.exp(logGain)[..., None])
    return np.where((logGain != 0)[..., None], corrected, base)


def ApplyBaseChroma(base, red, blue):
    steel = SrgbToLinear(base)
    tint = np.exp(np.stack((red, np.zeros_like(red), blue), axis=-1))
    tinted = steel * tint
    exposure = (steel @ LUMA) / np.maximum(tinted @ LUMA, 1e-8)
    return np.clip(LinearToSrgb(tinted * exposure[..., None]), 0, 1)


def BarrelTexelCenters(width, height, sampling):
    padding = ATLAS["padding"]
    arc, packed = np.asarray(sampling["angularCurve"]).T
    first, last = sampling["activeV"]
    column = np.clip((np.arange(width) + .5 - padding) / (width - 2 * padding), 0, 1)
    row = np.clip((np.arange(height) + .5 - padding) / (height - 2 * padding), 0, 1)
    return np.meshgrid(np.interp(column, packed, arc), last - row * (last - first))


def SampleResponseFields(calibration, channels, uu, vv):
    path = REFERENCE.with_name(calibration["file"])
    if Sha256(path) != calibration["sha256"]:
        raise ValueError(f"Response fields do not match the measured reference: {path}")
    with Image.open(path) as image:
        encoded = (np.asarray(image, dtype=float) - 32768) / calibration["scale"]
    if encoded.ndim != 2 or encoded.shape[1] % len(channels):
        raise ValueError(f"Invalid response fields: {path}")
    return {name: ReferenceField({"footprint": calibration["footprint"], "value": field.T}, uu, vv, "value")
            for name, field in zip(channels, np.split(encoded, len(channels), axis=1))}


def ApplyResponseFields(tile, calibration, channels, uu, vv, coverage=None):
    fields = SampleResponseFields(calibration, channels, uu, vv)
    ApplyMaterialFields(tile, fields, coverage)


def ApplyMaterialFields(tile, fields, coverage):
    base, normal, orm = tile
    if coverage is not None:
        for field in fields.values():
            field *= coverage
    color = np.clip(ApplyBaseLogGain(base / 255, fields["gain"]), 0, 1)
    if "tintRed" in fields:
        color = ApplyBaseChroma(color, fields["tintRed"], fields["tintBlue"])
    base[:] = np.rint(255 * color).astype(np.uint8)
    tiltU, tiltV = fields.get("tilt"), fields.get("tiltV")
    if tiltU is not None or tiltV is not None:
        # Bias the tangent direction of the existing relief before normalizing it.
        active = (abs(tiltU if tiltU is not None else 0) + abs(tiltV if tiltV is not None else 0)) > 1e-8
        vector = normal[active].astype(float) / 127.5 - 1
        if tiltU is not None:
            vector[:, 0] += tiltU[active] * vector[:, 2]
        if tiltV is not None:
            vector[:, 1] += tiltV[active] * vector[:, 2]
        unit = vector / np.linalg.norm(vector, axis=1, keepdims=True)
        normal[active] = np.rint(127.5 * (unit + 1)).astype(np.uint8)
    for name, index, limits in (("roughness", 1, (.17, .92)), ("metalness", 2, (0, 1))):
        if name in fields:
            adjustment = fields[name]
            active = abs(adjustment) > 1e-8
            channel = orm[..., index]
            channel[active] = np.rint(255 * np.clip(channel[active] / 255 + adjustment[active], *limits)).astype(np.uint8)


def ApplyBarrelResponse(tile, closeup, calibration, channels):
    CheckBarrelRegistration(calibration, closeup)
    height, width = tile[0].shape[:2]
    ApplyResponseFields(tile, calibration, channels, *BarrelTexelCenters(width, height, ATLAS["barrelSampling"]))


def PlanarTexelCenters(width, height):
    padding = ATLAS["padding"]
    column = (np.arange(width) + .5 - padding) / (width - 2 * padding)
    row = 1 - (np.arange(height) + .5 - padding) / (height - 2 * padding)
    return np.meshgrid(column, row)


def ApplySaddleResponse(tile, saddle, calibration):
    if (calibration["photoSha256"] != saddle["source"]["sha256"]
            or calibration["sampleStrips"] != saddle["source"]["sampleStrips"]
            or calibration["footprint"] != saddle["footprint"]):
        raise ValueError("The saddle response does not match the source photo and projection")
    height, width = tile[0].shape[:2]
    ApplyResponseFields(tile, calibration, ("gain", "tilt", "tiltV", "roughness"), *PlanarTexelCenters(width, height))


def ApplyStemResponse(tile, stem, calibration):
    source = stem["source"]
    if (calibration["photoSha256"] != source["sha256"] or calibration["sampleBounds"] != source["sampleBounds"]
            or calibration["lowerSampleEdge"] != source["lowerSampleEdge"]
            or calibration["footprint"] != stem["footprint"]):
        raise ValueError("The stem response does not match the source photo and projection")
    height, width = tile[0].shape[:2]
    ApplyResponseFields(tile, calibration, ("gain", "tilt", "tiltV", "roughness"), *PlanarTexelCenters(width, height))


def CheckNeckRegistration(neck, calibration):
    trace = neck["stampTrace"]
    projection = [trace["imageCenter"], trace["imageRadius"], *trace["imageYForVRange"]]
    if (calibration["photoSha256"] != neck["source"]["sha256"] or calibration["projection"] != projection
            or calibration["footprint"] != neck["detail"]["footprint"]):
        raise ValueError("The neck response does not match the source photo and projection")


def ApplyNeckChroma(tile, neck, calibration):
    CheckNeckRegistration(neck, calibration)
    base = tile[0]
    height, width = base.shape[:2]
    channels = ("red", "green", "blue")
    fields = SampleResponseFields(calibration, channels, *PlanarTexelCenters(width, height))
    gain = np.stack([fields[name] for name in channels], axis=-1)
    linear = SrgbToLinear(base / 255) * np.exp(gain)
    base[:] = np.rint(255 * np.clip(LinearToSrgb(linear), 0, 1)).astype(np.uint8)


def ApplyTabResponses(tile, tab, visibility=None, seamVisibility=None):
    source = tab["source"]
    peer = source["pairedPhoto"]
    height, width = tile[0].shape[:2]
    uu, vv = PlanarTexelCenters(width, height)
    anchors, lower, upper = np.asarray(tab["outlineUV"]).T
    lo, hi = (np.interp(uu, anchors, rail) for rail in (lower, upper))
    span = (vv - lo) / np.maximum(hi - lo, 1e-6)
    for key, channels in (("grainCalibration", ("gain",)),
                          ("surfaceCalibration", ("gain", "tilt", "tiltV", "roughness")),
                          ("warmCalibration", ("gain", "tilt", "tiltV", "roughness", "metalness")),
                          ("lightBalance", ("gain", "tilt", "tiltV", "roughness", "metalness")),
                          ("steelBalance", ("gain", "tilt", "tiltV", "roughness", "metalness", "tintRed", "tintBlue"))):
        calibration = tab.get(key)
        if calibration is None:
            continue
        if (calibration["photoSha256"] != source["sha256"] or calibration["pairedPhotoSha256"] != peer["sha256"]
                or calibration["projection"] != peer["projectionFromPrimary"]
                or calibration["sampleStrips"] != source["sampleStrips"]
                or calibration["outlineUV"] != tab["outlineUV"] or calibration["footprint"] != tab["footprint"]):
            raise ValueError("Tab response data do not match the paired source photographs and projection")
        coverage = None
        if key in ("warmCalibration", "lightBalance", "steelBalance"):
            if (calibration.get("contactAoSha256") != Sha256(CONTACT_AO)
                    or calibration.get("surfaceSha256") != tab.get("surfaceCalibration", {}).get("sha256")
                    or calibration.get("grainSha256") != tab.get("grainCalibration", {}).get("sha256")):
                raise ValueError("Tab light response must be measured on the current tab finish and contact AO")
            coverage = np.clip((visibility - .54) / .32, 0, 1)
        if key in ("lightBalance", "steelBalance"):
            if calibration.get("warmSha256") != tab.get("warmCalibration", {}).get("sha256"):
                raise ValueError("The balanced tab response must use the measured warm finish as its base")
            coverage = .92 * np.clip((visibility - .56) / .30, 0, 1)
        if key == "steelBalance":
            if (calibration.get("lightBalanceSha256") != tab.get("lightBalance", {}).get("sha256")
                    or calibration.get("seamAoSha256") != Sha256(SEAM_AO)):
                raise ValueError("Tab steel balance does not match the measured finish and seam AO")
            t = np.clip((seamVisibility - .61) / .27, 0, 1)
            coverage = t * t * (3 - 2 * t)
        ApplyResponseFields(tile, calibration, channels, uu, span, coverage)


def SmoothRamp(value):
    t = np.clip(value, 0, 1)
    return t * t * (3 - 2 * t)


def RangeFade(value, limits, feather):
    first, last = limits
    return SmoothRamp((value - first) / feather) * SmoothRamp((last - value) / feather)


def ApplyKnurlAlbedoBalance(base, u, axial, seamVisibility, balance):
    left, right = balance["angularRange"]
    fadeLeft, fadeRight = balance["angularFeather"]
    start, end = balance["axialRange"]
    fadeAxial = balance["axialFeather"]
    coverage = (SmoothRamp((u - left) / fadeLeft) * SmoothRamp((right - u) / fadeRight)
                * SmoothRamp((axial - start) / fadeAxial) * SmoothRamp((end - axial) / fadeAxial))
    coverage *= SmoothRamp((seamVisibility - balance["visibilityFloor"]) / balance["visibilityFade"])

    linear = SrgbToLinear(base / 255.)
    luma = linear @ LUMA
    support = gaussian_filter(luma, balance["sigmaRowsColumns"], mode="nearest")
    change = balance["contrastStrength"] * coverage * (support - luma)
    # Rebalance the fine pattern around the same linear energy before applying
    # the small exposure correction measured from the two view distances.
    change -= coverage * change.sum() / max(coverage.sum(), 1)
    adjusted = linear * (1 + change / np.maximum(luma, 1e-8))[..., None]
    adjusted *= np.exp(balance["logGain"] * coverage)[..., None]
    base[:] = np.rint(255 * np.clip(LinearToSrgb(adjusted), 0, 1)).astype(np.uint8)


def ApplyKnurlFlankResponse(tile, flank, visibility, seamVisibility=None):
    calibration = flank["surfaceCalibration"]
    source = flank["source"]
    expected = {"photoSha256": source["sha256"], "sampleBounds": source["sampleBounds"],
                "uBySampleRow": source["uBySampleRow"], "footprint": flank["footprint"],
                "detailSha256": flank["detail"]["sha256"], "contactAoSha256": Sha256(CONTACT_AO)}
    if any(calibration.get(key) != value for key, value in expected.items()):
        raise ValueError("Knurl flank response must be measured on the current side wear and contact AO")
    height, width = tile[0].shape[:2]
    u, v = PlanarTexelCenters(width, height)
    first, last = ATLAS["knurlSourceV"]
    axial = first + (last - first) * v
    visibilityWeight = np.clip((visibility - .55) / .27, 0, 1)
    channels = ("gain", "tilt", "tiltV", "roughness", "metalness")
    ApplyResponseFields(tile, calibration, channels, u, axial, .92 * visibilityWeight)
    if (balance := flank.get("lightBalance")) is not None:
        finish = json.dumps(flank.get("grooveFinish"), sort_keys=True, separators=(",", ":")).encode("utf-8")
        balanceIdentity = expected | {"sourceResponseSha256": calibration["sha256"],
                                      "sourceFinishSha256": sha256(finish).hexdigest()}
        if any(balance.get(key) != value for key, value in balanceIdentity.items()):
            raise ValueError("The balanced grip response must match the measured flank finish")
        ApplyResponseFields(tile, balance, channels, u, axial, .84 * visibilityWeight)
    if (albedo := flank.get("albedoBalance")) is not None:
        if balance is None or seamVisibility is None:
            raise ValueError("Knurl albedo balance requires the measured flank finish and seam AO")
        albedoIdentity = balanceIdentity | {"lightBalanceSha256": balance["sha256"],
                                            "seamAoSha256": Sha256(SEAM_AO)}
        if any(albedo.get(key) != value for key, value in albedoIdentity.items()):
            raise ValueError("Knurl albedo balance does not match the measured flank finish and seam AO")
        ApplyKnurlAlbedoBalance(tile[0], u, axial, seamVisibility, albedo)


def ApplyKnurlResponse(tile, knurl, calibration):
    source = knurl["source"]
    if (calibration["photoSha256"] != source["sha256"] or calibration["sampleBounds"] != source["sampleBounds"]
            or calibration["footprint"] != knurl["wear"]["footprint"]):
        raise ValueError("Knurl response does not match the source photo and projection")
    height, width = tile[0].shape[:2]
    uu, vv = PlanarTexelCenters(width, height)
    first, last = ATLAS["knurlSourceV"]
    angular = (np.clip(uu, 0, 1) + .5) % 1 - .5
    ApplyResponseFields(tile, calibration, ("gain", "tilt", "roughness"), angular, first + (last - first) * vv)
    for pixels in tile:
        WrapKnurlPadding(pixels)


def ApplyCollarResponse(tile, collar, calibration):
    source = collar["source"]
    if (calibration["photoSha256"] != source["sha256"] or calibration["footprint"] != collar["footprint"]
            or any(calibration[key] != source[key] for key in ("rasterX", "sampleRails", "lastY"))):
        raise ValueError("Collar response does not match the source photo and projection")
    height, width = tile[0].shape[:2]
    ApplyResponseFields(tile, calibration, ("gain", "tilt", "roughness"), *PlanarTexelCenters(width, height))


def PhotographicGrain(closeup, xx, vv):
    detail = closeup["detail"]
    path = REFERENCE.with_name(detail["file"])
    if Sha256(path) != detail["sha256"]:
        raise ValueError(f"Detail does not match the measured reference: {path}")
    with Image.open(path) as image:
        tone, warmth, confidence = np.asarray(image.convert("RGB"), dtype=np.float32).T
    plate = {"footprint": detail.get("footprint", closeup["footprint"]), "tone": (tone - 128) / detail["toneScale"],
             "warmth": (warmth - 128) / detail["warmthScale"], "confidence": confidence / 255}
    coverage = ReferenceField(plate, xx, vv, "confidence")
    return ReferenceField(plate, xx, vv, "tone"), ReferenceField(plate, xx, vv, "warmth"), coverage


def BarrelPatina(overall, closeup, xx, vv):
    footprint = closeup["footprint"]
    u = (xx - footprint["uCenter"]) / footprint["uHalfSpan"]
    lower, upper = footprint["vRange"]
    v = (vv - lower) / (upper - lower)
    angularFade = np.clip((1.14 - abs(u)) * 4.4, 0, 1)
    axialFade = np.clip((v + .12) * 6, 0, 1) * np.clip((1.12 - v) * 6, 0, 1)
    near = angularFade * axialFade
    finishes = []
    for channel in ("oxideCoverage", "coolFilmCoverage", "exposedSteelCoverage"):
        whole = ReferenceField(overall, xx, vv, channel)
        photographed = ReferenceField(closeup, xx, vv, channel)
        finishes.append((whole + near * (photographed - whole)) / 100)
    return near, *finishes


def SampleBarrelStripe(maps, size):
    # The existing narrow UV strip follows the adjoining barrel's finish.
    # Keep its texture continuous across the two chart edges.
    x, y, width, height = ATLAS["regions"]["Barrel"]
    pad = ATLAS["padding"]
    halfSpan = .032 / (2 * np.pi)
    span = width - 2 * pad
    oldU, packedU = np.asarray(ATLAS["barrelSampling"]["angularCurve"]).T
    left, right = np.interp([.25 - halfSpan, .25 + halfSpan], oldU, packedU)
    extent = (x + pad + left * span, y + pad, x + pad + right * span, y + height - pad)
    inner = (size[0] - 2 * pad, size[1] - 2 * pad)
    padding = ((pad, pad), (pad, pad), (0, 0))
    sampled = []
    for pixels in maps:
        crop = Image.fromarray(pixels).transform(inner, Image.Transform.EXTENT, extent, Image.Resampling.BILINEAR)
        sampled.append(np.pad(np.asarray(crop), padding, mode="edge"))
    return sampled


def RepackBarrelTile(dense, prior, reference):
    # Retain the established finish around the back and give the photographed wear more texels.
    height, width = dense[0].shape[:2]
    pad = ATLAS["padding"]
    sampling = ATLAS["barrelSampling"]
    oldU, packedU = np.asarray(sampling["angularCurve"]).T
    texelsU = np.clip((np.arange(width) + .5 - pad) / (width - 2 * pad), 0, 1)
    texelsY = np.clip((np.arange(height) + .5 - pad) / (height - 2 * pad), 0, 1)
    u = np.interp(texelsU, packedU, oldU)
    start, end = sampling["activeV"]
    v = start + (1 - texelsY) * (end - start)
    rows, columns = np.meshgrid(pad + (1 - v) * (height - 2 * pad) - .5,
                                pad + u * (width - 2 * pad) - .5, indexing="ij")
    field = reference["closeups"]["Barrel"]["footprint"]
    first, last = field["vRange"]
    axial = (v - first) / (last - first)
    arc = (u - field["uCenter"]) / field["uHalfSpan"]
    radialWeight = np.clip((1.16 - np.abs(arc)) * 5.0, 0, 1)
    axialWeight = np.clip((axial + .16) * 4.8, 0, 1) * np.clip((1.16 - axial) * 4.8, 0, 1)
    photographed = (axialWeight[:, None] * radialWeight[None, :])[..., None]
    backArc = np.abs((u - field["uCenter"] + .5) % 1 - .5)
    backWeight = np.clip((backArc - .18) / .12, 0, 1)[None, :, None]

    result = []
    for channel, (pixels, previous) in enumerate(zip(dense, prior)):
        old = previous.astype(np.float32)
        sampled = np.stack([map_coordinates(ch, (rows, columns), order=3, mode="nearest")
                            for ch in np.moveaxis(old, -1, 0)], axis=-1)
        if channel == 0:
            luma = sampled @ LUMA
            fine = luma - gaussian_filter(luma, (.85, .90), mode="nearest")
            sampled += 1.32 * backWeight * fine[..., None]
        mixed = pixels * photographed + sampled * (1 - photographed)
        result.append(np.rint(np.clip(mixed, 0, 255)).astype(np.uint8))
    return result


def CircumferentialAbrasion(luminance):
    """Extract long, irregular strokes across the turned finish."""
    height, width = luminance.shape
    spectrum = np.fft.rfft2(luminance)
    fy = np.fft.fftfreq(height)[:, None] ** 2
    fx = np.fft.rfftfreq(width)[None, :] ** 2
    across = np.exp(-2 * np.pi ** 2 * 12 ** 2 * fx)
    along = np.exp(-2 * np.pi ** 2 * .72 ** 2 * fy) - np.exp(-2 * np.pi ** 2 * 4.4 ** 2 * fy)
    strokes = np.fft.irfft2(spectrum * across * along, s=(height, width), axes=(0, 1))
    return np.clip(strokes / max(strokes.std(), 1e-6), -2.8, 2.8)


def TracedStamp(data, xx, vv):
    trace = data["stampTrace"]
    left, top, right, bottom = trace["bounds"]
    scale = 3
    image = Image.new("L", ((right-left)*scale, (bottom-top)*scale))
    draw = ImageDraw.Draw(image)
    for width, points in trace["strokes"]:
        path = [((x-left)*scale, (y-top)*scale) for x, y in points]
        draw.line(path, fill=255, width=width*scale, joint="curve")
    field = np.asarray(image.filter(ImageFilter.GaussianBlur(1.35*scale)), dtype=np.float32) / 255

    footprint = data["footprint"]
    angular = xx[0] - footprint["uCenter"]
    imageX = trace["imageCenter"] + trace["imageRadius"] * np.sin(2*np.pi*angular)
    v0, v1 = footprint["vRange"]
    y0, y1 = trace["imageYForVRange"]
    pivot = v0 + (trace["axialCenterImageY"]-y0) * (v1-v0) / (y1-y0)
    # Preserve the on-screen stamp proportions in the registered neck view.
    sampledV = pivot + (vv[:, 0]-pivot) / trace["axialScale"]
    imageY = y0 + (y1-y0) * (sampledV-v0) / (v1-v0)
    columns = (imageX-left)*scale
    rows = (imageY-top)*scale
    across = np.array([np.interp(columns, np.arange(field.shape[1]), line, left=0, right=0) for line in field])
    mask = np.array([np.interp(rows, np.arange(field.shape[0]), line, left=0, right=0) for line in across.T]).T
    mask[:, np.abs(angular) > footprint["uHalfSpan"]] = 0
    return mask.astype(np.float32)


def SampleTile(sample, width, height, index, vFraction=1):
    # Select different crops inside each sample and keep the original broad
    # variation continuous across a region.
    edge = sample.width // 6
    if index:
        x, y = index * 97 % edge, index * 73 % edge
        sample = sample.crop((x, y, x + sample.width - edge, y + sample.height - edge))
    if vFraction < 1:
        inset = round(sample.height * (1 - vFraction) * .5)
        sample = sample.crop((0, inset, sample.width, sample.height - inset))
    return np.asarray(sample.resize((width, height), Image.Resampling.LANCZOS), dtype=np.float32) / 255


def EyeWear(reference, xx, vv):
    front, reverse = reference["front"], reference["reverse"]
    tipDistance = np.minimum(vv, 1 - vv)
    frontArc = np.interp(tipDistance, front["v"], front["rubbedCoverage"]) / 100
    frontArc *= np.clip((.47 - tipDistance) / .09, 0, 1)
    reverseArc = np.interp(vv, reverse["v"], reverse["rubbedCoverage"], period=1) / 100
    reverseArc *= np.clip((abs(vv - .5) - .08) / .075, 0, 1)
    # The near arc in the edge-on photograph is seen across the angular UV
    # seam. Continue the worn steel from the face around the outer wire.
    frontWear = frontArc * np.exp(-((xx - .25) / .138) ** 2)
    signedU = (xx + .5) % 1 - .5
    outerWear = ReferenceField(front["outerWire"], signedU, vv, "rubbedCoverage") / 100
    frontWear = np.maximum(frontWear, outerWear)
    reverseWear = reverseArc * np.exp(-((xx - .75) / .148) ** 2)
    return frontWear, reverseWear


def BakeRegion(name, sample, size, index, reference, *, barrelSampling=None, knurlFamily=None):
    sourceIndex, metalColor, oxideColor, coverage, roughness, metalness, strength = FINISHES[name]
    width, height = size
    padding = ATLAS["padding"]
    yy, xx = np.meshgrid(
        np.clip((np.arange(height, dtype=np.float32) - padding) / (height - 2 * padding), 0, 1),
        np.clip((np.arange(width, dtype=np.float32) - padding) / (width - 2 * padding), 0, 1),
        indexing="ij",
    )
    vv = 1 - yy
    if barrelSampling is not None:
        oldU, packedU = np.asarray(barrelSampling["angularCurve"]).T
        xx = np.interp(xx, packedU, oldU).astype(np.float32)
        bottom, top = barrelSampling["activeV"]
        vv = bottom + vv * (top - bottom)
    # The photographed grip sample carries its original glare and perspective.
    # Use its microtexture, with the diamond scale and lighting rebuilt in UVs.
    # The short ring and wheel charts use shallower source crops along V.
    vFraction = {"Wheel": .34, "CollarRing": .24}.get(name, 1)
    srgb = SampleTile(sample[0 if name == "Knurl" else sourceIndex], width, height, index,
                      vFraction=vFraction)
    luminance = srgb @ LUMA
    grainLuma = luminance
    if name == "Knurl":
        grainLuma = SampleTile(sample[sourceIndex], width, height, index) @ LUMA
    detail = UnitVariation(grainLuma, .9, 3.6 if name == "Knurl" else 5)
    medium = UnitVariation(luminance, 4, 27)
    cloud = UnitVariation(luminance, 19, max(37, min(size) / 5))
    pits = np.maximum(0, -.68 - detail) ** 1.28

    oxidation = coverage - .079 * medium - .108 * cloud + .031 * pits
    tonalDelta = detail * 3.0 + medium * 4.0
    warmth = (srgb[:, :, 0] - srgb[:, :, 2])
    warmth -= GaussianPeriodic(warmth, 65)
    closeup = reference["closeups"].get(name)
    sampledV = vv
    if closeup:
        if "outlineUV" in closeup:
            u, lower, upper = np.asarray(closeup["outlineUV"], dtype=np.float32).T
            minimum, maximum = np.interp(xx[0], u, lower), np.interp(xx[0], u, upper)
            sampledV = (vv - minimum) / (maximum - minimum)
        measuredTone = ReferenceField(closeup, xx, sampledV, "relativeLuminance")
        measuredWarmth = ReferenceField(closeup, xx, sampledV, "relativeWarmth")
        oxidation += np.clip(-measuredTone / 207, -.13, .13) + np.clip(measuredWarmth / 240, -.08, .08)
        tonalDelta += measuredTone * .48
        warmth += measuredWarmth / 254
    if name == "Barrel":
        # Reuse the API steel at a fine scale around the whole tube. The close
        # photo supplies local variations where its surface can be registered.
        finePits = UnitVariation(luminance, .38, 1.95)
        footprint = closeup["footprint"]
        start, end = footprint["vRange"]
        axial = (vv - start) / (end - start)
        photoArc = (xx - footprint["uCenter"]) / footprint["uHalfSpan"]
        # Fade the measured phase correction away from the photographed wear.
        correction = np.clip((.70 - axial) / .27, 0, 1)
        arcBlend = np.clip((photoArc + .10) / .55, 0, 1)
        offsetU, offsetV = closeup["detail"]["registrationOffsetInFootprint"]
        sourceU = xx + offsetU * (2 * footprint["uHalfSpan"]) * correction * arcBlend
        sourceV = vv + offsetV * (end - start) * correction
        photoPits, photoWarmth, photoCoverage = PhotographicGrain(closeup, sourceU, sourceV)
        apiPits = finePits * (1 - .78 * photoCoverage)
        photoPits *= photoCoverage
        photoWarmth *= photoCoverage
        oxidation += .061 * medium + .079 * cloud + np.clip(.19 * photoWarmth, -.037, .054)
        tonalDelta += 8.7 * apiPits + 123 * photoPits - 2.85 * medium
        warmth += .41 * photoWarmth
        evidence = ReferenceField(reference, xx, vv, "relativeLuminance")
        heat = ReferenceField(reference, xx, vv, "relativeWarmth")
        oxidation += np.clip(-evidence / 183, -.13, .13) + np.clip(heat / 161, -.08, .08)
        tonalDelta += evidence * .39
        warmth += heat / 330
        # The photographed barrel retains a mottled blue-gray finish across the
        # middle of the visible arc and worn-through steel outside that patch.
        blue = np.exp(-(((xx - .397) / .14) ** 2 + ((vv - .46) / .47) ** 2))
        oxidation += .090 * blue
        warmth -= .021 * blue
    if name == "Stem":
        stemTone, stemWarmth, stemCoverage = PhotographicGrain(closeup, xx, vv)
        stemDetail = stemTone * stemCoverage
        tonalDelta += 119 * stemDetail - (2.5 * detail + 1.25 * medium) * stemCoverage
        warmth += .38 * stemWarmth * stemCoverage
        oxidation += (.024 * medium - .016 * pits) * stemCoverage
    if name == "Neck":
        neckTone, neckWarmth, neckCoverage = PhotographicGrain(closeup, xx, vv)
        neckDetail = neckTone * neckCoverage
        tonalDelta += 125 * neckDetail - (2.7 * detail + 1.2 * medium) * neckCoverage
        warmth += .42 * neckWarmth * neckCoverage
    if name in ("Tab", "TabBack"):
        # Register the narrow photographed grain to the runtime texel centers.
        texelU = xx + .5 / (width - 2 * padding)
        texelV = vv - .5 / (height - 2 * padding)
        u, lower, upper = np.asarray(closeup["outlineUV"], dtype=np.float32).T
        bottom = np.interp(texelU[0], u, lower)
        top = np.interp(texelU[0], u, upper)
        tabTone, tabWarmth, tabCoverage = PhotographicGrain(closeup, texelU, (texelV - bottom) / (top - bottom))
        tabDetail = tabTone * tabCoverage
        photoGain = 67 if name == "Tab" else 103
        tonalDelta += photoGain * tabDetail - (2.7 * detail + 1.0 * medium) * tabCoverage
        warmth += .28 * tabWarmth * tabCoverage
    if name == "Saddle":
        # Trade the generic grain for the photographed pits and rub marks.
        finePhoto, warmPhoto, shoeCoverage = PhotographicGrain(closeup, xx, vv)
        shoeDetail = finePhoto * shoeCoverage
        tonalDelta += 94 * shoeDetail - (3.0 * detail + 1.2 * medium) * shoeCoverage
        warmth += .36 * warmPhoto * shoeCoverage
        oxidation += (.037 * medium - .023 * pits) * shoeCoverage
    if name == "CollarRing":
        photoPits, photoWarmth, photoCoverage = PhotographicGrain(closeup, xx, vv)
        apiPits = UnitVariation(luminance, .42, 2.15) * (1 - .75 * photoCoverage)
        photoPits *= photoCoverage
        photoWarmth *= photoCoverage
        oxidation += .056 * medium + .072 * cloud + np.clip(.16 * photoWarmth, -.034, .044)
        tonalDelta += 7.2 * apiPits + 204 * photoPits - 2.9 * medium
        warmth += .34 * photoWarmth
    if name == "Shoulder":
        oxidation += .041 * medium + .068 * cloud
        tonalDelta -= 2.4 * medium
        shoulderFields = reference["shoulder"]
        front = shoulderFields["Direct"]
        flank = shoulderFields["Flank"]
        frontTone, frontWarmth, frontCoverage = PhotographicGrain(front, xx, vv)
        flankTone, flankWarmth, flankCoverage = PhotographicGrain(flank, xx, vv)
        shoulderFine = frontTone * frontCoverage + flankTone * flankCoverage
        shoulderWarmth = frontWarmth * frontCoverage + flankWarmth * flankCoverage
        tonalDelta += 122 * shoulderFine
        warmth += .43 * shoulderWarmth
        for field in shoulderFields.values():
            tonalDelta += .40 * ReferenceField(field, xx, vv, "relativeLuminance")
            warmth += ReferenceField(field, xx, vv, "relativeWarmth") / 260
    if name == "Sleeve":
        sleeveTone, sleeveWarmth, sleeveCoverage = PhotographicGrain(closeup, xx, vv)
        sleeveDetail = sleeveTone * sleeveCoverage
        # The wider arc remains cool. Retain warm oxidation at its worn end.
        shoulder = np.exp(-((vv - .101) / .032) ** 2)
        tonalDelta += 82 * sleeveDetail - (2.0 * detail + 2.5 * medium) * sleeveCoverage
        warmth += .28 * sleeveWarmth * sleeveCoverage + .012 * shoulder
        oxidation += .091 * shoulder

    heightField = strength * (.23 * detail + .17 * medium - .22 * pits)
    roughnessDelta = np.zeros_like(luminance)
    if name == "Barrel":
        heightField = strength * (.13 * detail + .036 * medium - .112 * pits) + .102 * apiPits + .38 * photoPits
        roughnessDelta += .023 * np.maximum(-apiPits, 0) + .17 * np.maximum(-photoPits, 0)
    if name == "CollarRing":
        heightField = strength * (.14 * detail + .031 * medium - .12 * pits) + .123 * apiPits + .41 * photoPits
        roughnessDelta += .029 * np.maximum(-apiPits, 0) + .14 * np.maximum(-photoPits, 0)
    if name == "Stem":
        heightField *= 1 - .54 * stemCoverage
        heightField += .33 * stemDetail
        roughnessDelta -= (.016 * medium + .013 * pits) * stemCoverage
        roughnessDelta += .11 * np.maximum(-stemDetail, 0) - .089 * np.maximum(stemDetail, 0)
    if name == "Neck":
        heightField *= 1 - .57 * neckCoverage
        heightField += .32 * neckDetail
        roughnessDelta += .13 * np.maximum(-neckDetail, 0) - .074 * np.maximum(neckDetail, 0)
    if name == "Sleeve":
        heightField *= 1 - .38 * sleeveCoverage
        heightField += .24 * sleeveDetail
        roughnessDelta += .11 * np.maximum(-sleeveDetail, 0) - .066 * np.maximum(sleeveDetail, 0)
    if name in ("Tab", "TabBack"):
        heightField *= 1 - .56 * tabCoverage
        heightField += .27 * tabDetail
        roughnessDelta += .12 * np.maximum(-tabDetail, 0) - .073 * np.maximum(tabDetail, 0)
    if name == "Saddle":
        heightField *= 1 - .76 * shoeCoverage
        heightField += .29 * shoeDetail
        roughnessDelta -= (.022 * medium + .014 * pits) * shoeCoverage
        roughnessDelta += .11 * np.maximum(-shoeDetail, 0) - .067 * np.maximum(shoeDetail, 0)
    if name == "SaddleRim":
        # A few exposed contact marks interrupt the dark forged edge.
        exposed = np.exp(-((xx - .088) / .071) ** 2) + .7 * np.exp(-((xx - .581) / .091) ** 2)
        oxidation -= .16 * exposed
        roughnessDelta -= .066 * exposed
    if name in ("RearEye", "Wheel"):
        # Separately retain small pits and bright flecks in the API steel.
        # Larger scale changes in finish come from the measured photo profiles.
        speckle = UnitVariation(luminance, .5, 2.4)
        darkPits = np.clip((-.24 - speckle) * .58, 0, 1)
        flecks = np.clip((speckle - .47) * .42, 0, 1)
        oxidation += .15 * darkPits - .12 * flecks
        tonalDelta += 14 * flecks - 17 * darkPits
        heightField -= .27 * darkPits
        roughnessDelta += .077 * darkPits - .03 * flecks
    if name == "RearEye":
        oxidation += .038 * medium + .036 * cloud
        tonalDelta += 5.4 * flecks - 4.0 * darkPits - .92 * medium
        outerWire = reference["ringFinish"]["front"]["outerWire"]
        signedU = (xx + .5) % 1 - .5
        measuredDetail = ReferenceField(outerWire, signedU, vv, "relativeDetail") / 100
        tonalDelta += 172 * measuredDetail
        heightField += .33 * measuredDetail
        roughnessDelta -= .18 * measuredDetail
    if name == "Wheel":
        rim = reference["wheelFinish"]
        lip = np.interp(vv, rim["v"], rim["rubbedCoverage"]) / 100
        wheelU = ATLAS["wheelPatterns"] * xx
        phase = wheelU % 1
        steel = ReferenceField(rim["rim"], phase, vv, "wornSteel") / 100
        rust = ReferenceField(rim["rim"], phase, vv, "oxide") / 100
        swatches = rim["rim"]["toothDetail"]
        tooth = wheelU.astype(int) % len(swatches)
        grain = np.zeros_like(luminance)
        for i, pattern in enumerate(swatches):
            surface = {"footprint": rim["rim"]["footprint"], "detail": pattern}
            grain += (tooth == i) * ReferenceField(surface, phase, vv, "detail") / 100
        trough = np.maximum(0, -np.cos(2 * np.pi * (phase - .125))) ** 1.25
        # Keep the source's pitting, reducing the large bands that only look
        # continuous because the UV wraps the whole rim. Photo chroma separates
        # rubbed steel at the crown from oxide in the recess.
        oxidation += .072 * medium + .09 * cloud + .22 * rust + .13 * trough - .17 * steel
        tonalDelta += 94 * grain - 3.7 * medium
        warmth *= .48
        shoulders = np.maximum(np.exp(-((vv - .20) / .057) ** 2), .86 * np.exp(-((vv - .82) / .059) ** 2))
        wheelWear = np.clip(.87 * steel + .19 * lip * shoulders * (1 - trough), 0, 1)
        wheelWear *= 1 - .51 * darkPits
        heightField += strength * (.093 * detail - .127 * medium) + .25 * grain
        roughnessDelta -= .28 * grain
    if name in ("Barrel", "Collar"):
        brushing = CircumferentialAbrasion(luminance) * np.clip(.92 - oxidation, .08, .9)
        if name == "Barrel":
            brushing *= 1 - .68 * photoCoverage
        tonalDelta += (3.6 if name == "Barrel" else 4.8) * brushing
        heightField += (.106 if name == "Barrel" else .23) * brushing
        roughnessDelta -= (.026 if name == "Barrel" else .037) * brushing
    if name == "Knurl":
        knurl = reference["knurl"]
        flank = knurl["flankWear"]
        grooveFinish = flank.get("grooveFinish", {})
        if grooveFinish:
            identity = {"photoSha256": flank["source"]["sha256"],
                        "photoPattern": flank.get("patternRegistration", {}).get("photo"),
                        "responseSha256": flank.get("surfaceCalibration", {}).get("sha256"),
                        "contactAoSha256": Sha256(CONTACT_AO)}
            if any(grooveFinish.get(key) != value for key, value in identity.items()):
                raise ValueError("Grip groove finish must match the registered photo and current material response")
        angular = knurl["angularCycles"] * xx
        axial = knurl["axialCycles"] * vv
        angular, axial = RegisterKnurlFlankPattern(knurl, angular, axial, xx, vv)
        if knurlFamily is not None:
            offset = KnurlFamilyOffset(xx, vv, knurlFamily)
            angular, axial = angular + .5 * offset, axial + .5 * offset
        phaseA, phaseB = angular + axial, angular - axial
        left, right = np.mod(phaseA, 1), np.mod(phaseB, 1)
        flankTone, flankWarmth, flankCoverage = PhotographicGrain(flank, xx, vv)
        distanceA, distanceB = 2 * np.minimum(left, 1 - left), 2 * np.minimum(right, 1 - right)
        if grooveFinish:
            # The two groove families have different relief in the side photo.
            liftA, liftB = grooveFinish["reliefLift"]
            distanceA += liftA * flankCoverage * (1 - distanceA)
            distanceB += liftB * flankCoverage * (1 - distanceB)
        diamonds = np.minimum(distanceA, distanceB)
        # The front photo shows worn narrow crests and a shallower slope to the grooves.
        angularDistance = np.abs((xx + .5) % 1 - .5)
        front = 1 - np.clip((angularDistance - .121) / .065, 0, 1)
        front = front**2 * (3 - 2 * front)
        shoulders = np.clip((diamonds - .05) / (.55 + .115 * front), 0, 1)
        grooves = np.clip(1 - diamonds / .34, 0, 1) ** .83
        chip = UnitVariation(luminance, .42, 2.15)
        centerA, centerB = np.floor(phaseA) + .5, np.floor(phaseB) + .5
        centerU = np.mod((centerA + centerB) / (2 * knurl["angularCycles"]), 1)
        centerV = np.clip((centerA - centerB) / (2 * knurl["axialCycles"]), 0, 1)
        columns = np.rint(padding + centerU * (width - 2 * padding)).astype(np.int32)
        rows = np.rint(padding + (1 - centerV) * (height - 2 * padding)).astype(np.int32)
        cellWear = chip[rows, columns]
        photoTone, photoWarmth, coverage = PhotographicGrain(knurl["wear"], (xx + .5) % 1 - .5, vv)
        photoTone = photoTone * coverage + 1.32 * flankTone * flankCoverage
        photoWarmth = photoWarmth * coverage + flankWarmth * flankCoverage
        coverage = np.maximum(coverage, flankCoverage)
        # In the flank photo the darker, warmer grooves run along phase B.
        # Broaden that groove profile within the registered area.
        cutDistance = 2 * np.minimum(right, 1 - right)
        flankGroove = np.clip(1 - cutDistance / .44, 0, 1) ** .79
        grooves += flankCoverage * np.maximum(flankGroove - grooves, 0)
        wornHeight = np.clip(.91 + .16 * cellWear, .55, 1.11) * (1 - .10 * coverage)
        exposedArea = np.clip((diamonds - .26 - .075 * front) / .56, 0, 1)
        polish = np.clip(.39 + .19 * chip + .29 * cellWear + .75 * photoTone
                         - .95 * np.maximum(photoWarmth, 0), .02, 1)
        chippedCrests = exposedArea * polish * (1 + .28 * flankCoverage)
        uKnots, shadowChroma = np.asarray(flank["shadowChroma"], dtype=np.float32).T
        flankOxide = flankCoverage * np.clip(np.interp(xx, uKnots, shadowChroma) / .24, 0, 1)
        tonalDelta += 6.4 * chip + 15.5 * (shoulders - .45) - 7.6 * grooves + 112 * photoTone
        oxideTone, grooveTone = grooveFinish.get("recessTone", (12.5, 22))
        tonalDelta -= oxideTone * flankOxide * grooves + grooveTone * flankCoverage * flankGroove
        polishedLip = np.exp(-((diamonds - .29) / .13)**2) * np.clip(.56 + .36 * cellWear + .98 * photoTone, .07, 1)
        tonalDelta += .9 * front + 1.74 * front * polishedLip
        heightField += (1.56 + .40 * flankCoverage) * shoulders * wornHeight * (1 - .14 * front)
        heightField += (.12 + .029 * front) * chip * shoulders + .28 * photoTone
        heightField -= .49 * flankCoverage * flankGroove
        oxidation += .127 * grooves + .10 * photoWarmth
        warmth += .32 * photoWarmth + .27 * flankOxide * grooves
        roughnessDelta += .071 * grooves + (.092 + .082 * front) * shoulders - .14 * photoTone + .067 * flankOxide * grooves
    if name == "Channel":
        shadowRibs = np.maximum(0, np.cos(2 * np.pi * (44 * vv + xx * .18))) ** 7
        tonalDelta += 18 * shadowRibs
        heightField += .31 * shadowRibs
    if name in ("Barrel", "Neck"):
        stamp = TracedStamp(closeup, xx, vv)
        rim = GaussianPeriodic(stamp, 1.5) - stamp * .54
        if name == "Neck":
            heightField -= .84 * stamp
            tonalDelta += 8 * rim - 17.5 * stamp
            oxidation += .14 * stamp
            roughnessDelta += .044 * stamp
        else:
            heightField -= .82 * stamp
            tonalDelta += 6 * rim - 22 * stamp
            oxidation += .11 * stamp
            roughnessDelta += .027 * stamp

    oxidation = np.clip(oxidation, .025, .964)
    mix = oxidation[..., None].astype(np.float32)
    clean = SrgbToLinear(np.asarray(metalColor, dtype=np.float32) / 255)
    oxide = SrgbToLinear(np.asarray(oxideColor, dtype=np.float32) / 255)
    linear = (1 - mix) * clean + mix * oxide
    rough = roughness[0] + (roughness[1] - roughness[0]) * oxidation + .028 * medium + .020 * pits + roughnessDelta
    metal = metalness[0] + (metalness[1] - metalness[0]) * oxidation
    if name == "Barrel":
        # Blue-gray residue remains between exposed steel and matte oxide.
        near, oxideCoverage, coolFilm, exposedSteel = BarrelPatina(reference["barrelPatina"], closeup, xx, vv)
        rubbed = np.clip(1 - np.abs(oxidation - .575) / .34, 0, 1) * .58
        rubbed = np.maximum(rubbed, .68 * coolFilm) * (1 - .57 * oxideCoverage) * (1 - .54 * exposedSteel)
        rubbedColor = SrgbToLinear(np.array([103, 108, 107], dtype=np.float32) / 255)
        linear += (rubbedColor - linear) * rubbed[..., None]
        rough += (.463 - rough) * rubbed
        metal += (.801 - metal) * rubbed
        rust = .58 * oxideCoverage
        rustColor = SrgbToLinear(np.array([87, 75, 64], dtype=np.float32) / 255)
        linear += (rustColor - linear) * rust[..., None]
        rough += (.646 - rough) * rust
        metal += (.438 - metal) * rust
        exposed = .56 * exposedSteel * (1 - oxideCoverage)
        steelColor = SrgbToLinear(np.array([175, 172, 163], dtype=np.float32) / 255)
        linear += (steelColor - linear) * exposed[..., None]
        rough += (.348 - rough) * exposed
        metal += (.918 - metal) * exposed
        # The overall photo shows brighter worn film and darker deep oxide
        # across the visible arc. Keep the close-up's own finish near the stamp.
        overall = {"footprint": reference["barrelPatina"]["footprint"], "coverage": [[1, 1], [1, 1]]}
        broad = ReferenceField(overall, xx, vv, "coverage") * (1 - near)
        partlyWorn = np.clip((oxideCoverage - .04) / .36, 0, 1)
        partlyWorn *= np.clip((.67 - oxideCoverage) / .22, 0, 1) * (1 - .7 * exposedSteel)
        deepOxide = np.clip((oxideCoverage - .49) / .43, 0, 1)
        toneCorrection = GaussianPeriodic(.47 * partlyWorn - .24 * deepOxide, 11)
        linear *= (1 + broad * toneCorrection)[..., None]
        unpolished = broad * (1 - exposedSteel) * (1 - .8 * oxideCoverage)
        rough += .110 * unpolished
        metal -= .078 * unpolished
        # The worn steel and the oxide beside the stamp scatter light differently.
        # Soften the hot steel glints and keep the oxide's diffuse response.
        rough += near * (.115 + .20 * exposedSteel) * (1 - .62 * oxideCoverage)
        metal -= near * (.40 + .54 * oxideCoverage) * np.maximum(metal - (.55 - .19 * oxideCoverage), 0)
        linear *= (1 - .19 * near * exposedSteel)[..., None]
        # The dark oxidation in the close-up scatters light diffusely. Use its
        # measured coverage to recover shadow detail around the rubbed steel.
        matteOxide = .92 * near * oxideCoverage * (1 - .85 * exposedSteel)
        rough += (.725 - rough) * matteOxide + .030 * near * exposedSteel
        metal += (.18 - metal) * matteOxide
        deepCloseOxide = np.clip((oxideCoverage - .28) / .65, 0, 1)
        shadow = ReferenceField(closeup, xx, vv, "shadowCoverage") / 100
        # The unpolished brown patch in the close-up stays darker across both views.
        warmOxide = near * np.clip((photoArc - .24) / .54, 0, 1) * np.clip((axial - .27) / .46, 0, 1)
        warmOxide *= .76 + .24 * oxideCoverage
        diffuseGain = .09 * matteOxide * deepCloseOxide
        diffuseGain += .34 * near * shadow * (1 - .60 * exposedSteel) * (1 - .75 * warmOxide)
        diffuseGain -= .45 * warmOxide
        if barrelSampling is not None:
            # Worn steel catches a brighter reflection than the oxide beside it.
            steelIslands = ReferenceField(closeup, xx, vv, "exposedSteelIslands") / 100
            bareSteel = warmOxide * steelIslands
            matte = warmOxide * (1 - steelIslands) * (1 - .80 * shadow)
            rough += .043 * matte - .045 * bareSteel
            metal += .075 * bareSteel
            diffuseGain += (1.17 + .56 * steelIslands**2) * bareSteel - .28 * matte
        linear *= (1 + diffuseGain)[..., None]
        calibration = closeup.get("registeredCalibration")
        if barrelSampling is not None and calibration is not None:
            CheckBarrelRegistration(calibration, closeup)
            # Apply local contrast and polished-steel response on the registered surface.
            oxideContrast = ReferenceField(calibration, xx, vv, "contrast") / 1000
            steelPeaks = ReferenceField(calibration, xx, vv, "highlights") / 1000
            linear *= np.exp(1.85 * oxideContrast)[..., None]
            linear *= np.exp(2.58 * steelPeaks)[..., None]
            rough -= .09 * np.clip(steelPeaks / .32, 0, 1)
    if name == "CollarRing":
        oxidized = .58 * ReferenceField(closeup, xx, vv, "oxideCoverage") / 100
        exposed = .56 * ReferenceField(closeup, xx, vv, "exposedSteelCoverage") / 100
        exposed *= 1 - oxidized
        rustColor = SrgbToLinear(np.array([95, 79, 67], dtype=np.float32) / 255)
        steelColor = SrgbToLinear(np.array([174, 170, 163], dtype=np.float32) / 255)
        linear += (rustColor - linear) * oxidized[..., None]
        linear += (steelColor - linear) * exposed[..., None]
        rough += (.666 - rough) * oxidized - .063 * exposed
        metal += (.46 - metal) * oxidized + (.91 - metal) * exposed
    if name == "Knurl":
        # The groove bottoms retain oxide. Small worn patches catch sharper
        # reflections within the satin finish on the diamond shoulders.
        dark = (.83 - .20 * front) * grooves * np.clip(.94 + .105 * cellWear, .68, 1)
        dark = np.minimum(.96, dark + grooveFinish.get("recessMix", .21) * flankCoverage * flankGroove)
        recessColor = SrgbToLinear(np.array([40, 36, 30], dtype=np.float32) / 255)
        linear += (recessColor - linear) * dark[..., None]
        rough += (.73 - rough) * dark
        metal += (.30 - metal) * dark
        lip = np.clip(1 - np.abs(cutDistance - .47) / .22, 0, 1)
        wornLip = flankCoverage * lip * (1 - grooves) * np.clip(.65 + .32 * cellWear, .25, 1)
        exposed = np.clip(.77 * chippedCrests + .26 * wornLip + .116 * front * polishedLip, 0, 1)
        crestColor = SrgbToLinear(np.array([159, 152, 140], dtype=np.float32) / 255)
        linear += (crestColor - linear) * exposed[..., None]
        rough += (.322 + grooveFinish.get("crestRoughnessLift", 0) * flankCoverage - rough) * exposed
        metal += (.94 - metal) * exposed
    if name == "Shoulder":
        # The front arc retains a dark satin film. Its flank has oxidized
        # patches and narrow rubbed edges that still reflect like steel.
        frontZone = {"footprint": front["footprint"], "inside": [[1., 1.], [1., 1.]]}
        face = .93 * ReferenceField(frontZone, xx, vv, "inside")
        slate = SrgbToLinear(np.array([81, 74, 67], dtype=np.float32) / 255)
        linear += (slate - linear) * face[..., None]
        rough += (.575 - rough) * face
        metal += (.59 - metal) * face
        oxide = GaussianPeriodic(.74 * ReferenceField(flank, xx, vv, "oxideCoverage") / 100, 2.5)
        warmOxide = SrgbToLinear(np.array([75, 57, 44], dtype=np.float32) / 255)
        linear += (warmOxide - linear) * oxide[..., None]
        rough += (.695 - rough) * oxide
        metal += (.43 - metal) * oxide
        bright = GaussianPeriodic(.66 * ReferenceField(flank, xx, vv, "exposedSteelCoverage") / 100, 2.2) * (1 - oxide)
        exposed = SrgbToLinear(np.array([170, 157, 143], dtype=np.float32) / 255)
        linear += (exposed - linear) * bright[..., None]
        rough += (.36 - rough) * bright
        metal += (.88 - metal) * bright
        heightField = strength * (.14 * detail + .06 * medium - .16 * pits) + .40 * shoulderFine
        flankZone = {"footprint": flank["footprint"], "inside": [[1., 1.], [1., 1.]]}
        shoulderTint = .123 * GaussianPeriodic(ReferenceField(flankZone, xx, vv, "inside"), 4.5) * (1 - .58 * bright)
    if name in REGISTERED_FINISHES:
        tint, channel, finishRoughness, finishMetal, influence, smoothing = REGISTERED_FINISHES[name]
        weight = ReferenceField(closeup, xx, sampledV, channel) * influence / 100
        finish = SrgbToLinear(np.asarray(tint, dtype=np.float32) / 255)
        linear += (finish - linear) * weight[..., None]
        rough += (finishRoughness - rough) * weight
        metal += (finishMetal - metal) * weight
        heightField *= 1 - smoothing * weight
    if name == "Stem":
        # The brightest parts of the registered wear expose polished steel.
        # Let them pick up the light while the surrounding scratches stay visible.
        exposedSteel = ReferenceField(closeup, xx, vv, "rubbedCoverage") / 100
        polished = .72 * np.clip((exposedSteel - .32) / .63, 0, 1) ** 1.15
        polishedColor = SrgbToLinear(np.array([207, 188, 165], dtype=np.float32) / 255)
        linear += (polishedColor - linear) * polished[..., None]
        rough += (.345 - rough) * polished
        metal += (.83 - metal) * polished
    if name in ("Tab", "TabBack"):
        rubbedSteel = ReferenceField(closeup, xx, sampledV, "rubbedCoverage") / 100
        wear = np.clip((rubbedSteel - .22) / .68, 0, 1) ** 1.2
        if name == "Tab":
            # The front has small rubbed scratches amid the oxidized steel.
            scratches = .075 * np.clip((tabDetail - .021) / .16, 0, 1)
            polished = np.maximum(.74 * wear, scratches)
            tint, gloss, metalFinish = (191, 180, 167), .325, .86
        else:
            polished = .925 * wear
            tint, gloss, metalFinish = (204, 194, 178), .31, .87
            relative = ReferenceField(closeup, xx, sampledV, "relativeLuminance")
            oxideShade = np.clip((-relative - 6) / 24, 0, 1) * (1 - rubbedSteel)
            linear *= (1 - .276 * oxideShade)[..., None]
        exposed = SrgbToLinear(np.asarray(tint, dtype=np.float32) / 255)
        linear += (exposed - linear) * polished[..., None]
        rough += (gloss - rough) * polished
        metal += (metalFinish - metal) * polished
        if name == "Tab":
            # The oxidized steel has a softer, dimmer reflection between the rub marks.
            matteFinish = tabCoverage * (1 - wear)
            rough += .08 * matteFinish
            metal += .080 * matteFinish
    if name == "RearEye":
        front, reverse = EyeWear(reference["ringFinish"], xx, vv)
        front *= (1 - .31 * darkPits)
        reverse *= (1 - .31 * darkPits) * .93
        exposed = SrgbToLinear(np.array([237, 224, 207], dtype=np.float32) / 255)
        rubbed = SrgbToLinear(np.array([221, 205, 187], dtype=np.float32) / 255)
        linear += (exposed - linear) * front[..., None] + (rubbed - linear) * reverse[..., None]
        rough += (.362 - rough) * front + (.434 - rough) * reverse
        metal += (.79 - metal) * front + (.80 - metal) * reverse
        heightField *= 1 - .24 * (front + reverse)
    if name == "Wheel":
        recess = SrgbToLinear(np.array([45, 28, 16], dtype=np.float32) / 255)
        retainedOxide = .52 * trough * rust
        linear += (recess - linear) * retainedOxide[..., None]
        bareRim = SrgbToLinear(np.array([224, 216, 200], dtype=np.float32) / 255)
        linear += (bareRim - linear) * wheelWear[..., None]
        rough += (.327 - rough) * wheelWear
        metal += (.82 - metal) * wheelWear
    if name == "Sleeve":
        calibration = closeup.get("registeredCalibration")
        if calibration is not None:
            CheckSleeveRegistration(calibration, closeup)
            # Restore photographed local contrast shared by both lighting conditions.
            contrast = ReferenceField(calibration, xx, vv, "contrast") / 1000
            linear *= np.exp(1.65 * contrast)[..., None]
    base = LinearToSrgb(linear)
    base += tonalDelta[..., None] / 255 + warmth[..., None] * np.array([.39, .055, -.27])
    if name in ("Tab", "TabBack"):
        coolTab = .015 if name == "Tab" else .009
        base -= coolTab * tabCoverage[..., None] * LUMA_NEUTRAL_WARMTH
        if name == "Tab":
            brightWear = np.clip((measuredTone - 4) / 24, 0, 1) * tabCoverage
            base += .110 * brightWear[..., None]
    if name == "Barrel":
        coolPatina = .029 * near * (.40 + .60 * oxideCoverage)
        base -= coolPatina[..., None] * LUMA_NEUTRAL_WARMTH
        if barrelSampling is not None:
            base += .076 * (warmOxide - .55 * bareSteel)[..., None] * LUMA_NEUTRAL_WARMTH
        else:
            base += .072 * warmOxide[..., None] * LUMA_NEUTRAL_WARMTH
        response = closeup.get("surfaceResponseCalibration")
        if barrelSampling is not None and response is not None:
            CheckBarrelRegistration(response, closeup)
            # The measured response scales the base color seen by the renderer in linear light.
            base = ApplyBaseLogGain(base, ReferenceField(response, xx, vv, "base") / 1000)
            rough *= np.exp(ReferenceField(response, xx, vv, "roughness") / 1000)
            metal *= np.exp(ReferenceField(response, xx, vv, "metalness") / 1000)
        finish = closeup.get("finishCalibration")
        if barrelSampling is not None and finish is not None:
            CheckBarrelRegistration(finish, closeup)
            base = ApplyBaseLogGain(base, ReferenceField(finish, xx, vv, "base") / 1000)
            metal *= np.exp(ReferenceField(finish, xx, vv, "metalness") / 1000)
            chroma = np.stack([ReferenceField(finish, xx, vv, channel) / 1000
                               for channel in ("red", "green", "blue")], axis=-1)
            base += .90 * (base @ np.array([.2126, .7152, .0722]))[..., None] * chroma
        materialFit = closeup.get("materialCalibration")
        if barrelSampling is not None and materialFit is not None:
            CheckBarrelRegistration(materialFit, closeup)
            base = ApplyBaseLogGain(base, ReferenceField(materialFit, xx, vv, "base") / 1000)
            rough += (ReferenceField(materialFit, xx, vv, "polish") * (.27 - rough)
                      + ReferenceField(materialFit, xx, vv, "matte") * (.90 - rough)) / 1000
            metal += (ReferenceField(materialFit, xx, vv, "metal") * (.89 - metal)
                      + ReferenceField(materialFit, xx, vv, "oxide") * (.19 - metal)) / 1000
            base = ApplyBaseLogGain(base, ReferenceField(materialFit, xx, vv, "highlightBase") / 1000)
            metal += ReferenceField(materialFit, xx, vv, "highlightMetal") * (.93 - metal) / 1000
        if barrelSampling is not None:
            # The registered marks follow the texel centers addressed by the renderer.
            markU, markV = BarrelTexelCenters(width, height, barrelSampling)
            gain = np.zeros_like(markU)
            for key in ("markCalibration", "smallMarkCalibration"):
                marks = closeup.get(key)
                if marks is None:
                    continue
                CheckBarrelRegistration(marks, closeup)
                path = REFERENCE.with_name(marks["file"])
                if Sha256(path) != marks["sha256"]:
                    raise ValueError(f"Mark correction does not match the measured reference: {path}")
                with Image.open(path) as image:
                    plate = (np.asarray(image.convert("L"), dtype=float).T - 128) / marks["gainScale"]
                gain += ReferenceField({"footprint": marks["footprint"], "gain": plate}, markU, markV, "gain")
            base = ApplyBaseLogGain(base, gain)
    if name == "Sleeve":
        patina = closeup["endPatina"]
        darkPatina = ReferenceField(patina, xx, vv, "darkPatinaCoverage") / 100
        oxideChroma = ReferenceField(patina, xx, vv, "oxideChroma") / 100
        exposedSteel = ReferenceField(patina, xx, vv, "exposedSteelCoverage") / 100
        # The contact patch carries deeper oxide than the neighboring steel.
        contact = np.exp(-((vv - .103) / .023) ** 2)
        rimFade = np.clip((vv - .056) / .044, 0, 1)
        base *= 1 - ((.39 + .235 * contact) * darkPatina)[..., None]
        chroma = (.080 + .090 * contact) * oxideChroma * rimFade - .038 * exposedSteel
        base += chroma[..., None] * LUMA_NEUTRAL_WARMTH
        response = closeup.get("responseCalibration")
        if response is not None:
            CheckSleeveRegistration(response, closeup)
            zone = {"footprint": response["footprint"], "coverage": [[1, 1], [1, 1]]}
            gain = ReferenceField(response, xx, vv, "base") / 1000
            gain += 2.05 * ReferenceField(response, xx, vv, "contrast") / 1000
            gain += .038 * ReferenceField(zone, xx, vv, "coverage")
            base = ApplyBaseLogGain(base, gain)
            metal += ReferenceField(response, xx, vv, "metal") * (.94 - metal) / 1000
            rough += (ReferenceField(response, xx, vv, "polish") * (.40 - rough)
                      + ReferenceField(response, xx, vv, "matte") * (.92 - rough)) / 1000
            color = np.stack([ReferenceField(response, xx, vv, channel) / 1000
                              for channel in ("red", "green", "blue")], axis=-1)
            base += .74 * (base @ np.array([.2126, .7152, .0722]))[..., None] * color
        horizon = closeup.get("horizonCalibration")
        if horizon is not None:
            CheckSleeveRegistration(horizon, closeup)
            fine = ReferenceField(horizon, xx, vv, "contrast") / 1000
            base = ApplyBaseLogGain(base, 1.78 * fine)
            tint = np.stack([ReferenceField(horizon, xx, vv, channel) / 1000
                             for channel in ("red", "green", "blue")], axis=-1)
            base += .65 * (base @ np.array([.2126, .7152, .0722]))[..., None] * tint
    if name == "Shoulder":
        # Shift hue with near-zero luma change in the photographed flank.
        base += shoulderTint[..., None] * LUMA_NEUTRAL_WARMTH
    if name == "Saddle":
        base += .035 * shoeCoverage[..., None] * LUMA_NEUTRAL_WARMTH
    if name == "Stem":
        base += .051 * stemCoverage[..., None] * LUMA_NEUTRAL_WARMTH
    if name == "Knurl" and grooveFinish:
        # Match the steel and oxide colors at equal luminance. The exposed
        # crests need less correction than the worn faces and groove bottoms.
        chromaCoverage = flankCoverage * (1 - .42 * exposed)
        active = chromaCoverage > 0
        redBase, redGroove = grooveFinish["redAdjustment"]
        blueBase, blueFace = grooveFinish["blueAdjustment"]
        red = redBase + redGroove * grooves[active]
        blue = blueBase + blueFace * (1 - exposed[active])
        green = -(LUMA[0] * red + LUMA[2] * blue)
        tint = np.stack([green + red, green, green + blue], axis=-1)
        colors = SrgbToLinear(np.clip(base[active], 0, 1))
        colors += ((colors @ LUMA) * chromaCoverage[active])[..., None] * tint
        base[active] = LinearToSrgb(np.clip(colors, 0, 1))
    ao = 1 - .019 * pits - (.087 if name in ("Recess", "Channel") else .016) * oxidation
    if name == "Knurl":
        ao *= 1 - (.31 - grooveFinish.get("microAoReduction", 0) * flankCoverage) * grooves
    if name == "Wheel":
        ao *= 1 - .54 * trough - .11 * rust
    heightField = np.clip(heightField * (.54 + .46 * oxidation), -1.5, 1.5)
    surface = np.stack([rough, metal, ao], axis=-1)
    if name == "Knurl":
        for field in (base, heightField[..., None], surface):
            BlendKnurlSeam(field)
    elif name in ("Barrel", "Collar", "CollarRing", "Shoulder", "Sleeve", "Neck", "SaddleRim", "RearEye", "Wheel"):
        seamWidth = 6 if name in ("RearEye", "Wheel") else 24
        base = SeamBlend(base, pixels=seamWidth)
        heightField = SeamBlend(heightField[..., None], pixels=seamWidth)[..., 0]
        surface = SeamBlend(surface, pixels=seamWidth)
    if name == "RearEye":
        # The wire and the length around the loop both wrap at their UV seams.
        SeamBlend(base.swapaxes(0, 1), pixels=10)
        SeamBlend(heightField.T[..., None], pixels=10)
        SeamBlend(surface.swapaxes(0, 1), pixels=10)
    rough, metal, ao = np.moveaxis(surface, -1, 0)
    relief = .00018 if name in ("RearEye", "Wheel") else .00012
    smoothing = {"Barrel": .55, "Knurl": .50, "CollarRing": .56}.get(name, .72)
    normal = NormalFromHeight(GaussianPeriodic(heightField, smoothing), relief, .12, 1.0, "gl") * .5 + .5
    orm = np.stack([ao, np.clip(rough, .17, .92), metal], axis=-1)
    return tuple(np.rint(255 * np.clip(arr, 0, 1)).astype(np.uint8) for arr in (base, normal, orm))


def ResizeChart(maps, width, height):
    pad = ATLAS["padding"]
    inner = (width - 2 * pad, height - 2 * pad)
    border = ((pad, pad), (pad, pad), (0, 0))
    output = []
    for pixels in maps:
        face = Image.fromarray(pixels[pad:-pad, pad:-pad]).resize(inner, Image.Resampling.LANCZOS)
        output.append(np.pad(np.asarray(face), border, mode="edge"))
    return output


def KnurlFamilyOffset(u, v, phase):
    first, last = ATLAS["knurlSourceV"]
    displayV = (v - first) / (last - first)
    loU, hiU, loV, hiV = phase["bounds"]
    fadeLoU, fadeHiU, fadeLoV, fadeHiV = phase["featherWidths"]
    feather = (SmoothRamp((u - loU) / fadeLoU) * SmoothRamp((hiU - u) / fadeHiU)
               * SmoothRamp((displayV - loV) / fadeLoV) * SmoothRamp((hiV - displayV) / fadeHiV))
    centerU, centerV = phase["origin"]
    across, along = phase["frequencyShift"]
    return feather * (across * (u - centerU) + along * (displayV - centerV) + phase["phaseOffset"])


def BakeKnurl(quadrants, width, height, index, reference, *, phase=None):
    # The grip chart now covers just the patterned bands. Evaluate the finish
    # in the original coordinates so the measured diamond pitch stays fixed.
    pad = ATLAS["padding"]
    sourceWidth, sourceHeight = 2 * (width - pad), 2 * (height - pad)
    sourceSize = (sourceWidth, sourceHeight)
    maps = list(BakeRegion("Knurl", quadrants, sourceSize, index, reference, knurlFamily=phase))
    knurl = reference["knurl"]
    flank = knurl["flankWear"]
    if "patternRegistration" in flank or "grooveFinish" in flank:
        # The periodic normal filter has a small response outside the shifted
        # pattern. Fade that halo back to the established surrounding chart.
        originalFlank = {key: value for key, value in flank.items()
                         if key not in ("patternRegistration", "grooveFinish")}
        originalReference = reference | {"knurl": knurl | {"flankWear": originalFlank}}
        originalNormal = BakeRegion("Knurl", quadrants, sourceSize, index, originalReference, knurlFamily=phase)[1]
        u = (np.arange(sourceWidth) - pad) / (sourceWidth - 2 * pad)
        footprint = flank["footprint"]
        distance = abs(u - footprint["uCenter"]) - footprint["uHalfSpan"]
        edge = np.clip((.052 - distance) / .014, 0, 1)[None, :, None]
        edge = edge**2 * (3 - 2 * edge)
        delta = maps[1].astype(float) - originalNormal
        maps[1] = np.rint(originalNormal + edge * delta).astype(np.uint8)
    first, last = ATLAS["knurlSourceV"]
    across = np.clip((np.arange(width) + .5 - pad) / (width - 2 * pad), 0, 1)
    columns = pad + across * (sourceWidth - 2 * pad)
    fraction = np.clip((np.arange(height) - pad) / (height - 2 * pad), 0, 1)
    rows = pad + (1 - last + (last - first) * fraction) * (sourceHeight - 2 * pad)
    lower, left = rows.astype(np.int32), columns.astype(np.int32)
    blendV, blendU = (rows - lower)[:, None, None], (columns - left)[None, :, None]
    output = []
    for pixels in maps:
        vertical = (1 - blendV) * pixels[lower] + blendV * pixels[lower + 1]
        tile = (1 - blendU) * vertical[:, left] + blendU * vertical[:, left + 1]
        WrapKnurlPadding(tile)
        output.append(np.rint(tile).astype(np.uint8))
    return output


def BakeKnurlMaterial(quadrants, width, height, index, reference, visibility, seam, *, phase=None):
    tile = BakeKnurl(quadrants, width, height, index, reference, phase=phase)
    knurl = reference["knurl"]
    if (calibration := knurl.get("responseCalibration")) is not None:
        ApplyKnurlResponse(tile, knurl, calibration)
    flank = knurl["flankWear"]
    if "surfaceCalibration" in flank:
        ApplyKnurlFlankResponse(tile, flank, visibility, seam)
    return tile


def SampleShoulder(pixels, u, v):
    pad = ATLAS["padding"]
    cols = pad + u * (pixels.shape[1] - 2 * pad)
    rows = pad + (1 - v) * (pixels.shape[0] - 2 * pad)
    left, top = cols.astype(np.int32), rows.astype(np.int32)
    du, dv = (cols - left)[None, :, None], (rows - top)[:, None, None]
    vertical = (1 - dv) * pixels[top] + dv * pixels[top + 1]
    return (1 - du) * vertical[:, left] + du * vertical[:, left + 1]


def BakeShoulder(quadrants, width, height, index, reference):
    layout = ATLAS["shoulderFlank"]
    pad = ATLAS["padding"]
    mainWidth = layout["splitX"]
    flankWidth = width - mainWidth
    uStart, uEnd = layout["uRange"]
    sourceU, packedU = np.asarray(layout["mainU"]).T
    sourceV, packedV = np.asarray(layout["flankV"]).T

    def Fraction(length):
        return np.clip((np.arange(length) - pad) / (length - 2 * pad), 0, 1)

    mainU = np.interp(Fraction(mainWidth), packedU, sourceU) % 1
    flankU = uStart + Fraction(flankWidth) * (uEnd - uStart)
    mainV = 1 - Fraction(height)
    flankV = np.interp(mainV, packedV, sourceV)
    maps = BakeRegion("Shoulder", quadrants, (width, height), index, reference)
    photo = reference["shoulder"]["Flank"]

    def PhotoColor(u, v, gain):
        xx, vv = np.meshgrid(u, v)
        tone, warmth, coverage = PhotographicGrain(photo, xx, vv)
        color = gain * tone[..., None] + (255 * .43 * warmth)[..., None] * np.array([.39, .055, -.27])
        return color * coverage[..., None]

    # Bake the measured grain at its new coordinates. The coarse finish and
    # the packed surface channels come from the existing material recipe.
    vStart, vEnd = photo["footprint"]["vRange"]
    fadeU = np.clip(np.minimum(flankU - uStart, uEnd - flankU) / .026, 0, 1)
    fadeV = np.clip(np.minimum(flankV - vStart + .045, vEnd + .045 - flankV) / .045, 0, 1)
    blend = (fadeV[:, None] * fadeU[None, :])[..., None]
    main = [SampleShoulder(pixels, mainU, mainV) for pixels in maps]
    flank = [SampleShoulder(pixels, flankU, flankV) for pixels in maps]
    previous = PhotoColor(Fraction(width), mainV, 122)
    offsetU, offsetV = photo["fineUvOffset"]
    grain = PhotoColor(flankU + offsetU, flankV + offsetV, 166) - SampleShoulder(previous, flankU, flankV)
    xx, vv = np.meshgrid(flankU, flankV)
    oxide = ReferenceField(photo, xx, vv, "oxideCoverage") / 100
    exposed = ReferenceField(photo, xx, vv, "exposedSteelCoverage") / 100
    tone = 22 * exposed - 18 * oxide + 4
    warmth = 9 * (1 - .6 * exposed)
    flank[0] += blend * (grain + tone[..., None] + warmth[..., None] * LUMA_NEUTRAL_WARMTH)
    return [np.rint(np.clip(np.concatenate((left, right), axis=1), 0, 255)).astype(np.uint8)
            for left, right in zip(main, flank)]


def ApplyShoulderReflection(tile, shoulder, seamVisibility):
    balance = shoulder["reflectionBalance"]
    source = shoulder["source"]
    expected = {"photoSha256": source["sha256"], "photoRails": source["photoRails"], "viewCenter": source["viewCenter"],
                "footprint": shoulder["footprint"], "fineUvOffset": shoulder["fineUvOffset"],
                "detailSha256": shoulder["detail"]["sha256"],
                "contactAoSha256": Sha256(CONTACT_AO), "seamAoSha256": Sha256(SEAM_AO)}
    if any(balance.get(key) != value for key, value in expected.items()):
        raise ValueError("Shoulder reflection balance does not match the photographed flank and seam AO")

    height, width = tile[0].shape[:2]
    layout = ATLAS["shoulderFlank"]
    split = layout["splitX"]
    fraction, packedV = PlanarTexelCenters(width - split, height)
    uStart, uEnd = layout["uRange"]
    sourceV, storedV = np.asarray(layout["flankV"]).T
    v = np.interp(packedV, storedV, sourceV)
    u = uStart + (uEnd - uStart) * fraction
    footprint = shoulder["footprint"]
    lower = footprint["uCenter"] - footprint["uHalfSpan"]
    upper = footprint["uCenter"] + footprint["uHalfSpan"]
    bottom, top = footprint["vRange"]
    u = (u - lower) / (upper - lower)
    v = (v - bottom) / (top - bottom)

    positions = np.asarray(balance["angularKnots"])
    coefficients = np.asarray(balance["coefficients"])
    clipped = np.clip(u, 0, 1)
    segment = np.clip(np.searchsorted(positions, clipped, side="right") - 1, 0, len(positions) - 2)
    t = SmoothRamp((clipped - positions[segment]) / (positions[segment + 1] - positions[segment]))
    weights = np.eye(len(positions))
    blend = weights[segment] * (1 - t[..., None]) + weights[segment + 1] * t[..., None]
    amounts = (blend @ coefficients) * np.asarray(balance["responseSteps"])
    fields = dict(zip(("gain", "tilt", "tiltV", "tintRed", "tintBlue"), np.moveaxis(amounts, -1, 0)))
    featherU, featherV = balance["footprintFeather"]
    margin = balance["footprintMargin"]
    coverage = (SmoothRamp((np.minimum(u, 1 - u) - margin) / featherU)
                * SmoothRamp((np.minimum(v, 1 - v) - margin) / featherV)
                * SmoothRamp((seamVisibility[:, split:] - balance["visibilityFloor"]) / balance["visibilityFade"]))
    ApplyMaterialFields([pixels[:, split:] for pixels in tile], fields, coverage)


def ApplyCloseupSurfaceBalance(tile, spec, u, v, seamVisibility):
    calibration = spec["surfaceBalance"]
    if any(calibration.get(key) != value for key, value in SurfaceBalanceIdentity(spec).items()):
        raise ValueError("Surface balance does not match the registered photograph, finish and seam AO")
    coverage = SmoothRamp((seamVisibility - .61) / .27)
    channels = ("gain", "tilt", "tiltV", "tintRed", "tintBlue")
    ApplyResponseFields(tile, calibration, channels, u, v, coverage)


def ApplyBarrelWideReflection(tile, reference, u, v, seamVisibility):
    balance = reference["barrelPatina"]["wideReflectionBalance"]
    if any(balance.get(key) != value for key, value in WideReflectionIdentity(reference).items()):
        raise ValueError("Wide barrel reflection balance does not match the photographed finish and seam AO")

    def Coordinates(section):
        angle = .5 + (u - section["uCenter"]) / (2 * section["uHalfSpan"])
        lo, hi = section["vRange"]
        return angle, (v - lo) / (hi - lo)

    def Fade(value, limits):
        lo, hi = limits
        feather = balance["edgeFeather"]
        return SmoothRamp((value - lo) / feather) * SmoothRamp((hi - value) / feather)

    angle, axial = Coordinates(reference["footprint"])
    closeAngle, closeAxial = Coordinates(reference["closeups"]["Barrel"]["footprint"])
    close = Fade(closeAngle, balance["closeRange"]) * Fade(closeAxial, balance["closeRange"])
    coverage = Fade(angle, balance["angularRange"]) * Fade(axial, balance["axialRange"])
    coverage *= 1 - balance["closeProtection"] * close
    coverage *= SmoothRamp((seamVisibility - balance["visibilityFloor"]) / balance["visibilityFade"])
    fields = {name: np.interp(angle, balance["angularKnots"], values)
              for name, values in zip(("gain", "tilt", "tiltV"), balance["coefficients"])}
    ApplyMaterialFields(tile, fields, coverage)


def ApplyBarrelReverseReflection(tile, reference, u, v, seamVisibility):
    balance = reference["reverseReflectionBalance"]
    if any(balance.get(key) != value for key, value in ReverseReflectionIdentity(reference).items()):
        raise ValueError("Reverse barrel balance does not match the front, close-up and contact atlas")
    detail = balance["detail"]
    if detail["photoSha256"] != balance["sourceSha256"]:
        raise ValueError("Reverse barrel fine detail does not match its registered photograph")

    center = balance["center"]
    angle = center + (u - center + .5) % 1 - .5
    coverage = RangeFade(angle, balance["angularRange"], balance["angularFeather"])
    coverage *= RangeFade(v, balance["axialRange"], balance["axialFeather"])
    coverage *= SmoothRamp((seamVisibility - balance["visibilityFloor"]) / balance["visibilityFade"])
    fields = {name: np.interp(angle, balance["knots"], balance["coefficients"][name])
              for name in ("gain", "tilt", "tiltV")}
    fields["gain"] += detail["strength"] * SampleResponseFields(detail, ("gain",), angle, v)["gain"]
    ApplyMaterialFields(tile, fields, coverage)

    # Reduce the repeated circumferential texture while leaving the measured wear in base color.
    smoothing = balance["axialNormalSmoothing"]
    normal = tile[1].astype(float) / 127.5 - 1
    filtered = gaussian_filter1d(normal, smoothing["sigma"], axis=0, mode="nearest")
    active = coverage > 1e-4
    vector = normal[active] + smoothing["strength"] * coverage[active, None] * (filtered[active] - normal[active])
    vector /= np.linalg.norm(vector, axis=-1, keepdims=True)
    tile[1][active] = np.rint(127.5 * (vector + 1)).astype(np.uint8)


def ApplySleeveReverseFinish(tile, reference):
    balance = reference["sleeveReverseFinish"]
    if any(balance.get(key) != value for key, value in SleeveReverseIdentity(reference).items()):
        raise ValueError("Reverse sleeve balance does not match the photographed front and groove shading")
    detail = balance["detail"]
    if detail["sourceSha256"] != balance["sourceSha256"]:
        raise ValueError("Reverse sleeve fine detail does not match its registered photograph")

    height, width = tile[0].shape[:2]
    u, v = PlanarTexelCenters(width, height)
    center = balance["center"]
    u = center + (u - center + .5) % 1 - .5
    coverage = RangeFade(u, balance["angularRange"], balance["angularFeather"])
    coverage *= RangeFade(v, balance["axialRange"], balance["axialFeather"])
    source = balance["fields"]
    fields = {name: np.interp(u, balance["knots"], source[name]) for name in ("gain", "tilt", "tiltV")}
    fields["gain"] += np.interp(v, balance["axialKnots"], source["axialGain"])
    fields["gain"] += detail["strength"] * SampleResponseFields(detail, ("gain",), u, v)["gain"]
    first, last = balance["tintFade"]
    tintOpacity = SmoothRamp((last - u) / (last - first))
    for name, tint in zip(("tintRed", "tintBlue"), balance["tint"]):
        fields[name] = tint * tintOpacity
    ApplyMaterialFields(tile, fields, coverage)


def CollarJointCoordinates(balance, u, v):
    center = balance["center"]
    u = center + (u - center + .5) % 1 - .5
    angles, stations = balance["angles"], balance["stations"]
    coverage = RangeFade(u, (angles[0], angles[-1]), balance["angularFeather"])
    coverage *= RangeFade(v, (stations[0], stations[-1]), balance["axialFeather"])
    xy = [np.interp(u, angles, np.arange(len(angles))), np.interp(v, stations, np.arange(len(stations)))]
    return u, xy, coverage


def ApplyCollarJointFinish(tile, reference):
    balance = reference["collarJointFinish"]
    if any(balance.get(key) != value for key, value in CollarJointIdentity(reference).items()):
        raise ValueError("Joint collar response does not match the existing photo fit, steel and atlas")
    detail = balance["detail"]
    if (detail["frontPhotoSha256"], detail["rearPhotoSha256"]) != (balance["frontPhotoSha256"], balance["sourceSha256"]):
        raise ValueError("Collar surface detail does not match the registered photographs")
    height, width = tile[0].shape[:2]
    u, v = PlanarTexelCenters(width, height)
    seed = balance["seed"]
    center = seed["center"]
    angle = center + (u - center + .5) % 1 - .5
    coverage = RangeFade(angle, (seed["angle"][0], seed["angle"][-1]), seed["angularFeather"])
    coverage *= RangeFade(v, (seed["axial"][0], seed["axial"][-1]), seed["axialFeather"])
    count = len(seed["angle"])
    coarse = {key: np.interp(angle, seed["angle"], row[:count]) + np.interp(v, seed["axial"], row[count:])
              for key, row in zip(("gain", "tilt"), seed["coefficients"])}
    ApplyMaterialFields(tile, coarse, coverage)

    angle, xy, coverage = CollarJointCoordinates(balance, u, v)
    fields = {key: map_coordinates(np.asarray(balance["fields"][key]), xy, order=1, mode="nearest")
              for key in ("gain", "tilt", "tiltV")}
    for key, values in SampleResponseFields(detail, ("gain", "tintRed", "tintBlue"), angle, v).items():
        adjustment = detail["strength"] * values
        if key in fields:
            fields[key] += adjustment
        else:
            fields[key] = adjustment
    ApplyMaterialFields(tile, fields, coverage)


def SaddleJointCoordinates(balance, width, height):
    u, v = PlanarTexelCenters(width, height)
    horizontal, vertical = balance["u"], balance["v"]
    featherU, featherV = balance["feather"]
    coverage = RangeFade(u, (horizontal[0], horizontal[-1]), featherU)
    coverage *= RangeFade(v, (vertical[0], vertical[-1]), featherV)
    front = balance["frontGuard"]
    distance = np.full(u.shape, -np.inf)
    for x, y, offset in front["edges"]:
        np.maximum(distance, x * u + y * v + offset, out=distance)
    coverage *= SmoothRamp(distance / front["feather"])
    xy = [np.interp(u, horizontal, np.arange(len(horizontal))), np.interp(v, vertical, np.arange(len(vertical)))]
    return u, v, xy, coverage


def ApplySaddleJointFinish(tile, reference):
    balance = reference["saddleJointFinish"]
    if any(balance.get(key) != value for key, value in SaddleJointIdentity(reference).items()):
        raise ValueError("Joint saddle response does not match the existing photo fit, steel and atlas")
    detail = balance["detail"]
    if detail["rearPhotoSha256"] != balance["sourceSha256"]:
        raise ValueError("Saddle texture detail does not match the registered rear photograph")
    height, width = tile[0].shape[:2]
    u, v, xy, coverage = SaddleJointCoordinates(balance, width, height)
    fields = {key: map_coordinates(np.asarray(values), xy, order=1, mode="nearest")
              for key, values in balance["fields"].items() if key != "roughness"}
    for key, values in SampleResponseFields(detail, ("gain", "tintRed", "tintBlue"), u, v).items():
        fields[key] += detail["strength"] * values
    ApplyMaterialFields(tile, fields, coverage)
    if (smoothing := balance.get("rearNormalFilter")) is not None:
        normal = tile[1].astype(float) / 127.5 - 1
        filtered = gaussian_filter(normal, (*smoothing["sigma"], 0), mode="nearest")
        opacity = smoothing["strength"] * coverage
        opacity *= SmoothRamp((v - smoothing["axialStart"]) / smoothing["axialFeather"])
        active = opacity > 1e-4
        vector = normal[active] + opacity[active, None] * (filtered[active] - normal[active])
        vector /= np.linalg.norm(vector, axis=-1, keepdims=True)
        tile[1][active] = np.rint(127.5 * (vector + 1)).astype(np.uint8)


def ApplyPackedSurfaceChannel(packed, original, region, adjustment, channel, limits):
    # The existing joint-AO identity uses the legacy bake. Apply this UV0
    # material adjustment after validating that bake and restoring authored R.
    x, y, width, height = ATLAS["regions"][region]
    active = abs(adjustment) > 1e-8
    surface = original[..., channel].copy()
    tile = surface[y:y + height, x:x + width]
    tile[active] = np.rint(255 * np.clip(tile[active] / 255 + adjustment[active], *limits)).astype(np.uint8)
    size = packed.shape[1], packed.shape[0]
    previous, current = [np.array(Image.fromarray(array).resize(size, Image.Resampling.BOX), dtype=np.int16)
                         for array in (original[..., channel], surface)]
    packed[..., channel] = np.clip(packed[..., channel] + current - previous, 0, 255).astype(np.uint8)


def ApplyPackedRoughness(packed, original, region, adjustment):
    ApplyPackedSurfaceChannel(packed, original, region, adjustment, 1, (.17, .92))


def PeriodicMaterialField(values, u, v):
    samples = np.asarray(values)
    rows, columns = samples.shape
    wrapped = np.column_stack((samples, samples[:, 0]))
    return map_coordinates(wrapped, (v * (rows - 1), (u % 1) * columns), order=1, mode="nearest")


def ApplyJointMaterialFields(maps, packed, region, fields):
    roughness = fields.pop("roughness")
    metalness = fields.pop("metalness")
    x, y, width, height = ATLAS["regions"][region]
    tile = np.s_[y:y + height, x:x + width]
    ApplyMaterialFields([image[tile] for image in maps], fields, None)
    ApplyPackedRoughness(packed, maps[2], region, roughness)
    ApplyPackedSurfaceChannel(packed, maps[2], region, metalness, 2, (0., 1.))


def ApplyWheelOxideFinish(maps, packed, reference, finish):
    if any(finish.get(key) != value for key, value in WheelOxideIdentity(reference).items()):
        raise ValueError("Wheel finish does not match the photographed rim and contact AO")
    _, _, width, height = ATLAS["regions"]["Wheel"]
    u, v = PlanarTexelCenters(width, height)
    phase = (np.clip(u, 0., 1.) * ATLAS["wheelPatterns"]) % 1.
    rim = reference["wheelFinish"]["rim"]
    photoOxide = ReferenceField(rim, phase, v, "oxide") / 100.
    feather = SmoothRamp((v + .016) / .106) * SmoothRamp((1.016 - v) / .106)
    weight = feather * (.68 + .42 * photoOxide)
    fields = {name: np.interp(phase, finish["phase"], values) * weight for name, values in finish["fields"].items()}
    ApplyJointMaterialFields(maps, packed, "Wheel", fields)


def ApplyNeckJointFinish(maps, packed, reference):
    finish = reference["neckJointFinish"]
    if any(finish.get(key) != value for key, value in NeckJointIdentity(reference).items()):
        raise ValueError("Joint neck response does not match the existing photo fit, steel and atlas")
    detail = finish["detail"]
    if detail["rearPhotoSha256"] != finish["sourceSha256"]:
        raise ValueError("Neck wear does not match the registered rear photograph")

    _, _, width, height = ATLAS["regions"]["Neck"]
    u, v = PlanarTexelCenters(width, height)
    fields = {name: PeriodicMaterialField(values, u, v) for name, values in finish["fields"].items()}
    center = detail["footprint"]["uCenter"]
    angular = center + (u - center + .5) % 1 - .5
    for name, values in SampleResponseFields(detail, ("gain", "tintRed", "tintBlue"), angular, v).items():
        fields[name] += detail["strength"] * values
    ApplyJointMaterialFields(maps, packed, "Neck", fields)


def ReadPhotoField(region, record):
    file = REFERENCE.with_name(record["file"])
    if Sha256(file) != record["sha256"]:
        raise ValueError(f"{region} response data does not match {file.name}")
    with Image.open(file) as image:
        return np.asarray(image, dtype=float)


def SampleCoveredPhotoFields(region, finish, identity, *, includeWear=True):
    if any(finish.get(key) != value for key, value in identity.items()):
        raise ValueError(f"{region} response does not match the underlying material and AO")
    coverage = finish.get("coverage") if includeWear else finish["coverage"]
    detail = finish["detail"] if includeWear else None
    if includeWear and (detail["rearPhotoSha256"] != finish["sourceSha256"]
            or detail.get("frontPhotoSha256", finish["frontPhotoSha256"]) != finish["frontPhotoSha256"]):
        raise ValueError(f"{region} wear does not match its registered photographs")
    _, _, width, height = ATLAS["regions"][region]
    u, v = PlanarTexelCenters(width, height)
    fields = {}
    if coverage is not None:
        weight = PeriodicMaterialField(ReadPhotoField(region, coverage) / 65535., u, v)
        fields = {name: PeriodicMaterialField(values, u, v) * weight for name, values in finish["fields"].items()}
    if not includeWear:
        return fields
    encoded = (ReadPhotoField(region, detail) - 32768.) / detail["scale"]
    for name, layer in zip(detail["fields"], np.split(encoded, len(detail["fields"]), axis=1), strict=True):
        correction = PeriodicMaterialField(layer, u, v) * detail["strength"]
        fields[name] = fields[name] + correction if name in fields else correction
    return fields


def ApplyCoveredPhotoFinish(maps, packed, region, finish, identity, *, includeWear=True):
    fields = SampleCoveredPhotoFields(region, finish, identity, includeWear=includeWear)
    ApplyJointMaterialFields(maps, packed, region, fields)


def ApplySleeveJointFinish(maps, packed, reference):
    ApplyCoveredPhotoFinish(maps, packed, "Sleeve", reference["sleeveJointFinish"], SleeveJointIdentity(reference))


def ApplyBarrelJointFinish(maps, packed, reference):
    fields = SampleCoveredPhotoFields("Barrel", reference["barrelJointFinish"], BarrelJointIdentity(reference))
    size = packed.shape[1], packed.shape[0]

    def SurfaceChannels():
        return np.asarray(Image.fromarray(maps[2]).resize(size, Image.Resampling.BOX), dtype=np.int16)[..., 1:]

    before = SurfaceChannels()
    x, y, width, height = ATLAS["regions"]["Barrel"]
    tile = np.s_[y:y + height, x:x + width]
    ApplyMaterialFields([image[tile] for image in maps], fields, None)
    # Rebuild the narrow stripe from the finished barrel and fold both surface deltas into GB.
    sx, sy, sw, sh = ATLAS["regions"]["Stripe"]
    for image, stripe in zip(maps, SampleBarrelStripe(maps, (sw, sh)), strict=True):
        image[sy:sy + sh, sx:sx + sw] = stripe
    packed[..., 1:] = np.clip(packed[..., 1:].astype(np.int16) + SurfaceChannels() - before, 0, 255).astype(np.uint8)


def ApplyCollarPackedRoughness(packed, original, balance):
    _, _, width, height = ATLAS["regions"]["CollarRing"]
    u, v = PlanarTexelCenters(width, height)
    _, xy, coverage = CollarJointCoordinates(balance, u, v)
    roughness = map_coordinates(np.asarray(balance["fields"]["roughness"]), xy, order=1, mode="nearest")
    ApplyPackedRoughness(packed, original, "CollarRing", roughness * coverage)


def ReadSteelQuadrants():
    with Image.open(SOURCE) as image:
        source = image.convert("RGB")
    side = min(source.size) // 2
    margin = side // 24
    quadrants = []
    for index in range(4):
        x, y = index % 2 * side, index // 2 * side
        quadrants.append(source.crop((x + margin, y + margin, x + side - margin, y + side - margin)))
    return quadrants


def BuildAtlas(reference, contactAo=None, seamAo=None):
    quadrants = ReadSteelQuadrants()
    size = ATLAS["size"]
    closeups = reference["closeups"]
    tab = closeups["Tab"]
    flank = reference["knurl"]["flankWear"]
    shoulder = reference["shoulder"]["Flank"]
    surfaceBalances = {name: closeups[name] for name in ("Barrel", "Saddle") if "surfaceBalance" in closeups[name]}
    wideBarrelBalance = "wideReflectionBalance" in reference["barrelPatina"]
    reverseBarrelBalance = "reverseReflectionBalance" in reference
    if "albedoBalance" in flank and "surfaceCalibration" not in flank:
        raise ValueError("Knurl albedo balance requires the registered flank response")
    visibility = seamVisibility = None
    needsSeamVisibility = ("steelBalance" in tab or "albedoBalance" in flank
                           or "reflectionBalance" in shoulder or bool(surfaceBalances)
                           or wideBarrelBalance or reverseBarrelBalance)
    if needsSeamVisibility or "warmCalibration" in tab or "lightBalance" in tab or "surfaceCalibration" in flank:
        if contactAo is None:
            contactAo, _ = ReadContactAo()
        contactImage = Image.fromarray(contactAo).resize((size, size), Image.Resampling.BILINEAR)
        visibility = np.asarray(contactImage, dtype=float) / 255
    if needsSeamVisibility:
        if seamAo is None:
            seamAo, _ = ReadContactAo(SEAM_AO, SEAM_RECORD)
        seam = Image.fromarray(np.minimum(contactAo, seamAo)).resize((size, size), Image.Resampling.BILINEAR)
        seamVisibility = np.asarray(seam, dtype=float) / 255
    maps = [np.zeros((size, size, 3), dtype=np.uint8) for _ in range(3)]
    for index, (name, (x, y, width, height)) in enumerate(ATLAS["regions"].items()):
        if name == "Stripe":
            continue
        if name == "Collar":
            # Resample the legacy finish into the smaller shared chart.
            legacyHeight = height + ATLAS["regions"]["Shoulder"][3]
            sourceHeight = legacyHeight + ATLAS["regions"]["CollarRing"][3]
            legacy = ResizeChart(BakeRegion(name, quadrants, (width, sourceHeight), index, reference),
                                 width, legacyHeight)
            tile = ResizeChart(legacy, width, height)
        elif name == "SaddleBack":
            # Preserve the underside's existing steel sample at the new allocation.
            sourceSize = (width, ATLAS["saddleBackSourceHeight"])
            tile = ResizeChart(BakeRegion(name, quadrants, sourceSize, index, reference), width, height)
        elif name == "Knurl":
            region = np.s_[y:y + height, x:x + width]
            contact = visibility[region] if visibility is not None else None
            seam = seamVisibility[region] if seamVisibility is not None else None
            tile = BakeKnurlMaterial(quadrants, width, height, index, reference, contact, seam)
        elif name == "Shoulder":
            tile = BakeShoulder(quadrants, width, height, index, reference)
            if "reflectionBalance" in shoulder:
                ApplyShoulderReflection(tile, shoulder, seamVisibility[y:y + height, x:x + width])
        elif name == "Barrel":
            oldTile = BakeRegion(name, quadrants, (width, height), index, reference)
            denseTile = BakeRegion(name, quadrants, (width, height), index, reference,
                                   barrelSampling=ATLAS["barrelSampling"])
            tile = RepackBarrelTile(denseTile, oldTile, reference)
            closeup = reference["closeups"]["Barrel"]
            for key, channels in (("facetCalibration", ("tilt", "gain")),
                                  ("bandCalibration", ("tilt", "gain", "roughness")),
                                  ("grainCalibration", ("gain",))):
                calibration = closeup.get(key)
                if calibration is not None:
                    ApplyBarrelResponse(tile, closeup, calibration, channels)
        else:
            tile = BakeRegion(name, quadrants, (width, height), index, reference)
            if name == "Saddle":
                saddle = reference["closeups"]["Saddle"]
                if (calibration := saddle.get("responseCalibration")) is not None:
                    ApplySaddleResponse(tile, saddle, calibration)
            elif name == "Stem":
                stem = reference["closeups"]["Stem"]
                if (calibration := stem.get("responseCalibration")) is not None:
                    ApplyStemResponse(tile, stem, calibration)
            elif name == "Neck":
                neck = reference["closeups"]["Neck"]
                if (calibration := neck.get("chromaCalibration")) is not None:
                    ApplyNeckChroma(tile, neck, calibration)
                if (calibration := neck.get("markCalibration")) is not None:
                    CheckNeckRegistration(neck, calibration)
                    ApplyResponseFields(tile, calibration, ("gain",), *PlanarTexelCenters(width, height))
            elif name == "Tab" and any(key in tab for key in ("grainCalibration", "surfaceCalibration", "warmCalibration", "lightBalance", "steelBalance")):
                outlineVisibility = None if visibility is None else visibility[y:y + height, x:x + width]
                seam = None if seamVisibility is None else seamVisibility[y:y + height, x:x + width]
                ApplyTabResponses(tile, tab, outlineVisibility, seam)
            elif name == "CollarRing":
                collar = reference["closeups"]["CollarRing"]
                if (calibration := collar.get("responseCalibration")) is not None:
                    ApplyCollarResponse(tile, collar, calibration)
                if "collarJointFinish" in reference:
                    ApplyCollarJointFinish(tile, reference)
            elif name == "Sleeve" and "sleeveReverseFinish" in reference:
                ApplySleeveReverseFinish(tile, reference)
        if name in surfaceBalances or (name == "Barrel" and (wideBarrelBalance or reverseBarrelBalance)):
            if name == "Barrel":
                u, v = BarrelTexelCenters(width, height, ATLAS["barrelSampling"])
            else:
                u, v = PlanarTexelCenters(width, height)
            regionVisibility = seamVisibility[y:y + height, x:x + width]
            if name in surfaceBalances:
                ApplyCloseupSurfaceBalance(tile, surfaceBalances[name], u, v, regionVisibility)
            if name == "Barrel" and wideBarrelBalance:
                ApplyBarrelWideReflection(tile, reference, u, v, regionVisibility)
            if name == "Barrel" and reverseBarrelBalance:
                ApplyBarrelReverseReflection(tile, reference, u, v, regionVisibility)
        if name == "Saddle" and "saddleJointFinish" in reference:
            ApplySaddleJointFinish(tile, reference)
        for atlas, pixels in zip(maps, tile):
            atlas[y:y + height, x:x + width] = pixels
    x, y, width, height = ATLAS["regions"]["Stripe"]
    for atlas, pixels in zip(maps, SampleBarrelStripe(maps, (width, height))):
        atlas[y:y + height, x:x + width] = pixels
    return maps


def ReadContactAo(imagePath=CONTACT_AO, recordPath=CONTACT_RECORD, atlasFile=ATLAS_FILE):
    record = json.loads(recordPath.read_bytes())
    model = HERE.parent / "Model/Model_Type89Launcher.tzm.json"
    expected = {"file": imagePath.name, "sha256": Sha256(imagePath), "modelSha256": Sha256(model)}
    layout = atlasFile.read_bytes().replace(b"\r\n", b"\n")
    # Older bakes recorded the Windows checkout's CRLF bytes for this JSON.
    layoutDigests = {sha256(layout).hexdigest(), sha256(layout.replace(b"\n", b"\r\n")).hexdigest()}
    if (any(record.get(field) != value for field, value in expected.items())
            or record.get("atlasSha256") not in layoutDigests):
        raise ValueError(f"Rebake {imagePath.name} from the current launcher mesh and UV atlas")
    with Image.open(imagePath) as image:
        pixels = np.array(image.convert("L"))
    if (pixels.shape != (record["size"], record["size"])
            or sha256(pixels.tobytes()).hexdigest() != record["pixelSha256"]):
        raise ValueError(f"{imagePath.name} does not match its linear bake")
    return pixels, record


def ComposeContactAo(orm, visibility):
    surface = np.array(orm.convert("RGB"))
    if surface.shape[:2] != visibility.shape:
        raise ValueError("Contact AO and ORM must use the same steel atlas dimensions")
    surface[..., 0] = (surface[..., 0].astype(np.uint16) * visibility + 127) // 255
    return Image.fromarray(surface)


def EncodeLegacyOrm(pixels, visibility):
    orm = Image.fromarray(pixels).resize((1024, 1024), Image.Resampling.BOX)
    stream = BytesIO()
    ComposeContactAo(orm, visibility).save(stream, format="WEBP", method=6, quality=82)
    with Image.open(stream) as image:
        return image.convert("RGB")


def ApplyGripFamilyPhase(maps, packed, reference, phase, contactAo, seamAo):
    if any(phase.get(key) != value for key, value in GripFamilyPhaseIdentity(reference).items()):
        raise ValueError("The grip diagonal calibration must match the current finish and contact AO")
    size = ATLAS["size"]
    x, y, width, height = ATLAS["regions"]["Knurl"]
    region = np.s_[y:y + height, x:x + width]
    visibility, seam = (np.asarray(Image.fromarray(array).resize((size, size), Image.Resampling.BILINEAR),
                                   dtype=float)[region] / 255. for array in (contactAo, np.minimum(contactAo, seamAo)))
    quadrants = ReadSteelQuadrants()
    index = list(ATLAS["regions"]).index("Knurl")
    before = BakeKnurlMaterial(quadrants, width, height, index, reference, visibility, seam)
    after = BakeKnurlMaterial(quadrants, width, height, index, reference, visibility, seam, phase=phase)
    if not np.array_equal(maps[1][region], before[1]):
        raise ValueError("The grip normal map differs from the diagonal calibration's source")

    # Transfer the changed ridge pattern over the photographed wear in the live atlas.
    originalColor, retunedColor = (SrgbToLinear(tile[0].astype(float) / 255.) for tile in (before, after))
    gain = np.clip((retunedColor + .020) / (originalColor + .020), .58, 1.66)
    base = SrgbToLinear(maps[0][region].astype(float) / 255.)
    maps[0][region] = np.rint(255 * LinearToSrgb(np.clip(base * gain, 0, 1))).astype(np.uint8)
    maps[1][region] = after[1]
    surface = packed[y // 2:(y + height) // 2, x // 2:(x + width) // 2, 1:]
    old, new = (np.asarray(Image.fromarray(tile[2]).resize((width // 2, height // 2), Image.Resampling.BOX),
                           dtype=np.int16)[..., 1:] for tile in (before, after))
    surface[:] = np.clip(surface.astype(np.int16) + new - old, 0, 255).astype(np.uint8)


def Bake(legacyOrm=None):
    reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
    calibrationVisibility, contact = ReadContactAo()
    seamVisibility, seams = ReadContactAo(SEAM_AO, SEAM_RECORD)
    # The photographed material fits use the original visibility weights.
    # Keep the darker AO sample so a joint hit by either pass keeps its shadow.
    maps = BuildAtlas(reference, calibrationVisibility, seamVisibility)
    visibility = np.minimum(calibrationVisibility, seamVisibility)
    orm = EncodeLegacyOrm(maps[2], visibility)
    if legacyOrm is not None:
        orm.save(legacyOrm, format="PNG")
        return
    joints, jointRecord = ReadContactAo(JOINT_AO, JOINT_RECORD, CONTACT_ATLAS_FILE)
    pixels = np.array(orm)
    if sha256(pixels[..., 0].tobytes()).hexdigest() != jointRecord["legacyRedSha256"]:
        raise ValueError("Rebake the joint AO from the current steel finish's legacy ORM")
    fineContact, fineContactRecord = ReadContactAo(CONTACT_DETAIL_AO, CONTACT_DETAIL_RECORD, CONTACT_ATLAS_FILE)
    # Near-field occluders sharpen the narrow seams while the original joint bake
    # carries the wider shadows and the photographed surface relief.
    blocked = (255 - fineContact) / 255.
    contactWeight = SmoothRamp((blocked - .045) / .42)
    x, y, width, height = CONTACT_ATLAS["regions"]["RibbedLowerSleeve"]
    sleeve = np.s_[y:y + height, x:x + width]
    # The sleeve's flanks already have a calibrated light response. Reserve
    # the added occlusion for its most enclosed groove bottoms and end contacts.
    contactWeight[sleeve] = SmoothRamp((blocked[sleeve] - .39) / .23)
    pixels[..., 0] = np.rint(joints * (1. - .66 * contactWeight)).astype(np.uint8)
    if (collar := reference.get("collarJointFinish")) is not None:
        ApplyCollarPackedRoughness(pixels, maps[2], collar)
    saddle = reference.get("saddleJointFinish")
    if saddle is not None and "roughness" in saddle["fields"]:
        _, _, width, height = ATLAS["regions"]["Saddle"]
        _, _, xy, coverage = SaddleJointCoordinates(saddle, width, height)
        roughness = map_coordinates(np.asarray(saddle["fields"]["roughness"]), xy, order=1, mode="nearest")
        ApplyPackedRoughness(pixels, maps[2], "Saddle", roughness * coverage)
    neck = reference.get("neckJointFinish")
    if neck is not None:
        ApplyNeckJointFinish(maps, pixels, reference)
    sleeveFinish = reference.get("sleeveJointFinish")
    if sleeveFinish is not None:
        ApplySleeveJointFinish(maps, pixels, reference)
    sleeveOptical = reference.get("sleeveOpticalFinish")
    if sleeveOptical is not None:
        ApplyCoveredPhotoFinish(maps, pixels, "Sleeve", sleeveOptical, SleeveOpticalIdentity(reference))
    collarReflectance = reference.get("collarReflectanceFinish")
    if collarReflectance is not None:
        ApplyCoveredPhotoFinish(maps, pixels, "CollarRing", collarReflectance, CollarReflectanceIdentity(reference))
    barrelFinish = reference.get("barrelJointFinish")
    if barrelFinish is not None:
        ApplyBarrelJointFinish(maps, pixels, reference)
    stemFinish = reference.get("stemJointFinish")
    if stemFinish is not None:
        ApplyCoveredPhotoFinish(maps, pixels, "Stem", stemFinish, StemJointIdentity(reference))
    saddleReflectance = reference.get("saddleReflectanceFinish")
    if saddleReflectance is not None:
        ApplyCoveredPhotoFinish(maps, pixels, "Saddle", saddleReflectance, SaddleReflectanceIdentity(reference))
    saddleRim = reference.get("saddleRimFinish")
    if saddleRim is not None:
        ApplyCoveredPhotoFinish(maps, pixels, "SaddleRim", saddleRim, SaddleRimIdentity(reference))
    tabFinishes = (("Tab", "tabReflectance", reference.get("tabReflectanceFinish")),
                   ("TabBack", "tabBackReflectance", reference.get("tabBackReflectanceFinish")))
    for region, _, finish in tabFinishes:
        if finish is not None:
            ApplyCoveredPhotoFinish(maps, pixels, region, finish, TabReflectanceIdentity(reference, region),
                                    includeWear="detail" in finish)
    shoulderReflectance = reference.get("shoulderReflectanceFinish")
    if shoulderReflectance is not None:
        ApplyCoveredPhotoFinish(maps, pixels, "Shoulder", shoulderReflectance, ShoulderReflectanceIdentity(reference),
                                includeWear=False)
    if (wheelOxide := reference.get("wheelOxideFinish")) is not None:
        ApplyWheelOxideFinish(maps, pixels, reference, wheelOxide)
    gripRear = reference.get("gripRearFinish")
    if gripRear is not None:
        ApplyCoveredPhotoFinish(maps, pixels, "Knurl", gripRear, GripRearIdentity(reference))
    if (gripFamily := reference.get("gripFamilyPhase")) is not None:
        ApplyGripFamilyPhase(maps, pixels, reference, gripFamily, calibrationVisibility, seamVisibility)
    saddleSurface = reference.get("saddleSurfaceRefinement")
    if saddleSurface is not None:
        ApplyCoveredPhotoFinish(maps, pixels, "Saddle", saddleSurface, SaddleRimIdentity(reference))
    baseQuality = (collarReflectance or {}).get("baseQuality", 84)
    baseQuality = (barrelFinish or {}).get("baseQuality", baseQuality)
    for channel, image in zip(("Base", "Normal"), maps[:2]):
        output = HERE.parent / "Texture" / f"Texture_{STEM}{channel}.webp"
        quality = baseQuality if channel == "Base" else 84
        Image.fromarray(image).save(output, method=6, quality=quality)
    # Keep the shallow contact gradients within the project's 1 MiB set budget.
    Image.fromarray(pixels).save(HERE.parent / "Texture" / f"Texture_{STEM}Orm.webp", method=6, quality=86)
    subprocess.run([sys.executable, str(HERE / "Script_BakePbrTexture.py"), "--audit", "--name", STEM], check=True)
    recordPath = HERE / "TextureBakes" / f"Texture_{STEM}.json"
    record = json.loads(recordPath.read_text(encoding="utf-8"))
    record["source"] = {"path": SOURCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(SOURCE)}
    record["reference"] = {"path": REFERENCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(REFERENCE)}
    record["contactAo"] = {"path": CONTACT_AO.relative_to(HERE.parent).as_posix(), "sha256": contact["sha256"],
                           "record": CONTACT_RECORD.relative_to(HERE.parent).as_posix()}
    record["seamAo"] = {"path": SEAM_AO.relative_to(HERE.parent).as_posix(), "sha256": seams["sha256"],
                        "record": SEAM_RECORD.relative_to(HERE.parent).as_posix()}
    record["jointAo"] = {"path": JOINT_AO.relative_to(HERE.parent).as_posix(), "sha256": jointRecord["sha256"],
                         "record": JOINT_RECORD.relative_to(HERE.parent).as_posix()}
    record["contactDetailAo"] = {"path": CONTACT_DETAIL_AO.relative_to(HERE.parent).as_posix(),
                                 "sha256": fineContactRecord["sha256"],
                                 "record": CONTACT_DETAIL_RECORD.relative_to(HERE.parent).as_posix()}
    details = {"barrelDetail": reference["closeups"]["Barrel"]["detail"],
               "stemDetail": reference["closeups"]["Stem"]["detail"],
               "sleeveDetail": reference["closeups"]["Sleeve"]["detail"],
               "neckDetail": reference["closeups"]["Neck"]["detail"],
               "saddleDetail": reference["closeups"]["Saddle"]["detail"],
               "collarDetail": reference["closeups"]["CollarRing"]["detail"],
               "tabDetail": reference["closeups"]["Tab"]["detail"],
               "tabBackDetail": reference["closeups"]["TabBack"]["detail"],
               "knurlWear": reference["knurl"]["wear"]["detail"],
               "knurlFlank": reference["knurl"]["flankWear"]["detail"],
               "shoulderDirect": reference["shoulder"]["Direct"]["detail"],
               "shoulderFlank": reference["shoulder"]["Flank"]["detail"]}
    for key, name in (("markCalibration", "barrelMarks"), ("smallMarkCalibration", "smallBarrelMarks"),
                      ("facetCalibration", "barrelFacets"), ("bandCalibration", "barrelBand"),
                      ("grainCalibration", "barrelGrain")):
        calibration = reference["closeups"]["Barrel"].get(key)
        if calibration is not None:
            details[name] = calibration
    if (calibration := reference["closeups"]["Saddle"].get("responseCalibration")) is not None:
        details["saddleResponse"] = calibration
    if (calibration := reference["closeups"]["Stem"].get("responseCalibration")) is not None:
        details["stemResponse"] = calibration
    if (calibration := reference["knurl"].get("responseCalibration")) is not None:
        details["knurlResponse"] = calibration
    if (calibration := reference["closeups"]["CollarRing"].get("responseCalibration")) is not None:
        details["collarResponse"] = calibration
    if (calibration := reference["closeups"]["Neck"].get("chromaCalibration")) is not None:
        details["neckChroma"] = calibration
    if (calibration := reference["closeups"]["Neck"].get("markCalibration")) is not None:
        details["neckMarks"] = calibration
    for key, name in (("grainCalibration", "tabGrain"), ("surfaceCalibration", "tabResponse"),
                      ("warmCalibration", "tabWarmResponse"), ("lightBalance", "tabLightBalance"),
                      ("steelBalance", "tabSteelBalance")):
        if (calibration := reference["closeups"]["Tab"].get(key)) is not None:
            details[name] = calibration
    for key, name in (("surfaceCalibration", "knurlFlankResponse"), ("lightBalance", "knurlLightBalance")):
        if (calibration := reference["knurl"]["flankWear"].get(key)) is not None:
            details[name] = calibration
    for name in ("Barrel", "Saddle"):
        if (calibration := reference["closeups"][name].get("surfaceBalance")) is not None:
            details[f"{name.lower()}SurfaceBalance"] = calibration
    if (reverse := reference.get("reverseReflectionBalance")) is not None:
        details["reverseBarrelDetail"] = reverse["detail"]
    if (sleeve := reference.get("sleeveReverseFinish")) is not None:
        details["reverseSleeveDetail"] = sleeve["detail"]
    if (collar := reference.get("collarJointFinish")) is not None:
        details["jointCollarDetail"] = collar["detail"]
    if saddle is not None:
        details["jointSaddleDetail"] = saddle["detail"]
    if neck is not None:
        details["jointNeckDetail"] = neck["detail"]
    if sleeveFinish is not None:
        details["jointSleeveCoverage"] = sleeveFinish["coverage"]
        details["jointSleeveDetail"] = sleeveFinish["detail"]
    if sleeveOptical is not None:
        details["sleeveOpticalDetail"] = sleeveOptical["detail"]
    if collarReflectance is not None:
        details["collarReflectanceCoverage"] = collarReflectance["coverage"]
        details["collarReflectanceDetail"] = collarReflectance["detail"]
    if barrelFinish is not None:
        details["jointBarrelCoverage"] = barrelFinish["coverage"]
        details["jointBarrelDetail"] = barrelFinish["detail"]
    if stemFinish is not None:
        details["jointStemCoverage"] = stemFinish["coverage"]
        details["jointStemDetail"] = stemFinish["detail"]
    if saddleReflectance is not None:
        details["saddleReflectanceCoverage"] = saddleReflectance["coverage"]
        details["saddleReflectanceDetail"] = saddleReflectance["detail"]
    for _, label, finish in tabFinishes:
        if finish is not None:
            details[label + "Coverage"] = finish["coverage"]
            if "detail" in finish:
                details[label + "Detail"] = finish["detail"]
    if shoulderReflectance is not None:
        details["shoulderReflectanceCoverage"] = shoulderReflectance["coverage"]
    if gripRear is not None:
        details["gripRearCoverage"] = gripRear["coverage"]
        details["gripRearDetail"] = gripRear["detail"]
    if saddleRim is not None:
        details["saddleRimCoverage"] = saddleRim["coverage"]
        details["saddleRimDetail"] = saddleRim["detail"]
    if saddleSurface is not None:
        details["saddleSurfaceResponse"] = saddleSurface["detail"]
    for key, detail in details.items():
        record["reference"][key] = {"path": REFERENCE.with_name(detail["file"]).relative_to(HERE.parent).as_posix(),
                                    "sha256": detail["sha256"]}
    recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--legacy-orm", type=Path, help="Write the UV0 reference plate for the Blender joint bake")
    Bake(cli.parse_args().legacy_orm)
