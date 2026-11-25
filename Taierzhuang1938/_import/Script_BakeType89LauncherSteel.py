"""Bake the museum-referenced steel finish into one color, normal and ORM atlas."""

import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from Script_BakePbrTexture import GaussianPeriodic, LinearToSrgb, NormalFromHeight, Sha256, SrgbToLinear


HERE = Path(__file__).resolve().parent
STEM = "Type89LauncherSteel"
SOURCE = HERE / "Source/Type89Launcher/Texture_Type89LauncherSteelSource.webp"
REFERENCE = HERE / "Reference/Type89Launcher/Data_Type89LauncherSteelReference.json"
ATLAS = json.loads((HERE.parent / "_blender/Data_Type89LauncherSteelAtlas.json").read_text(encoding="utf-8"))
LUMA = np.array([.2126, .7152, .0722], dtype=np.float32)

# API sample quadrant, polished sRGB, oxidized sRGB, oxide coverage,
# polished / oxidized roughness, polished / oxidized metalness, relief strength.
FINISHES = {
    "Barrel": (0, (184, 178, 162), (74, 69, 61), .63, (.244, .56), (.96, .61), .64),
    "Stem": (1, (155, 151, 141), (77, 69, 61), .51, (.29, .60), (.96, .53), .71),
    "Collar": (0, (180, 177, 164), (82, 72, 62), .50, (.215, .54), (.98, .53), .43),
    "Knurl": (3, (155, 154, 148), (63, 57, 49), .49, (.34, .64), (.95, .44), .79),
    "Sleeve": (1, (129, 125, 114), (48, 42, 37), .63, (.36, .65), (.94, .42), .62),
    "Saddle": (2, (119, 128, 129), (70, 74, 73), .59, (.48, .76), (.88, .34), .92),
    "Tab": (2, (158, 149, 136), (86, 73, 60), .51, (.35, .68), (.95, .41), .73),
    "SaddleBack": (2, (115, 119, 114), (62, 53, 44), .66, (.51, .78), (.88, .32), .86),
    "Edge": (0, (182, 179, 165), (71, 61, 50), .36, (.255, .59), (.98, .43), .49),
    "Neck": (2, (142, 138, 125), (60, 51, 43), .55, (.385, .70), (.94, .34), .77),
    "Recess": (1, (41, 39, 36), (24, 22, 20), .61, (.67, .85), (.32, .16), .28),
    "SaddleRim": (2, (126, 129, 124), (55, 50, 43), .61, (.34, .70), (.89, .38), .49),
    "Channel": (1, (73, 69, 60), (32, 28, 24), .58, (.49, .81), (.77, .22), .60),
    "TabBack": (2, (169, 163, 153), (80, 74, 66), .47, (.348, .65), (.96, .43), .71),
    "RearEye": (2, (162, 150, 136), (67, 53, 43), .52, (.40, .71), (.95, .44), .67),
    "Wheel": (2, (151, 136, 120), (56, 37, 28), .66, (.45, .76), (.95, .38), .77),
}

# Finish, coverage channel, roughness, metallic, blend strength and relief attenuation.
REGISTERED_FINISHES = {
    "Stem": ((177, 162, 144), "rubbedCoverage", .406, .84, .49, .43),
    "Saddle": ((121, 105, 82), "oxideCoverage", .74, .31, .65, .16),
    "Neck": ((124, 100, 75), "oxideCoverage", .708, .46, .65, .15),
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


def BarrelGrain(closeup, xx, vv):
    detail = closeup["detail"]
    path = REFERENCE.with_name(detail["file"])
    if Sha256(path) != detail["sha256"]:
        raise ValueError(f"Barrel detail does not match the measured reference: {path}")
    with Image.open(path) as image:
        tone, warmth, confidence = np.asarray(image.convert("RGB"), dtype=np.float32).T
    plate = {"footprint": closeup["footprint"], "tone": (tone - 128) / detail["toneScale"],
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
    extent = (x + pad + (.25 - halfSpan) * span, y + pad,
              x + pad + (.25 + halfSpan) * span, y + height - pad)
    inner = (size[0] - 2 * pad, size[1] - 2 * pad)
    padding = ((pad, pad), (pad, pad), (0, 0))
    sampled = []
    for pixels in maps:
        crop = Image.fromarray(pixels).transform(inner, Image.Transform.EXTENT, extent, Image.Resampling.BILINEAR)
        sampled.append(np.pad(np.asarray(crop), padding, mode="edge"))
    return sampled


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


def BakeRegion(name, sample, size, index, reference):
    sourceIndex, metalColor, oxideColor, coverage, roughness, metalness, strength = FINISHES[name]
    width, height = size
    padding = ATLAS["padding"]
    yy, xx = np.meshgrid(
        np.clip((np.arange(height, dtype=np.float32) - padding) / (height - 2 * padding), 0, 1),
        np.clip((np.arange(width, dtype=np.float32) - padding) / (width - 2 * padding), 0, 1),
        indexing="ij",
    )
    vv = 1 - yy
    # The photographed grip sample carries its original glare and perspective.
    # Use its microtexture, with the diamond scale and lighting rebuilt in UVs.
    # U spans several teeth while V crosses the short edge. Keep the source
    # pits compact when that strip is wrapped around the wheel.
    srgb = SampleTile(sample[0 if name == "Knurl" else sourceIndex], width, height, index,
                      vFraction=.34 if name == "Wheel" else 1)
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
        photoPits, photoWarmth, photoCoverage = BarrelGrain(closeup, xx, vv)
        apiPits = finePits * (1 - .78 * photoCoverage)
        photoPits *= photoCoverage
        photoWarmth *= photoCoverage
        oxidation += .061 * medium + .079 * cloud + np.clip(.19 * photoWarmth, -.037, .054)
        tonalDelta += 8.7 * apiPits + 174 * photoPits - 2.85 * medium
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
    if name == "Sleeve":
        # The thin brown residue at the stem-side shoulder is visible on the
        # overall and side close-ups of the same object.
        shoulder = np.exp(-((vv - .101) / .032) ** 2)
        warmth += .108 * shoulder
        oxidation += .13 * shoulder

    heightField = strength * (.23 * detail + .17 * medium - .22 * pits)
    roughnessDelta = np.zeros_like(luminance)
    if name == "Barrel":
        heightField = strength * (.13 * detail + .036 * medium - .112 * pits) + .102 * apiPits + .38 * photoPits
        roughnessDelta += .023 * np.maximum(-apiPits, 0) + .17 * np.maximum(-photoPits, 0)
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
        tonalDelta += (3.6 if name == "Barrel" else 4.8) * brushing
        heightField += (.106 if name == "Barrel" else .23) * brushing
        roughnessDelta -= (.026 if name == "Barrel" else .037) * brushing
    if name == "Knurl":
        angular = reference["knurl"]["angularCycles"] * xx
        axial = reference["knurl"]["axialCycles"] * vv
        left, right = np.mod(angular + axial, 1), np.mod(angular - axial, 1)
        diamonds = 2 * np.minimum(np.minimum(left, 1 - left), np.minimum(right, 1 - right))
        shoulders = np.minimum(diamonds / .82, 1)
        grooves = np.clip(1 - diamonds / .30, 0, 1)
        tonalDelta += 9 * (shoulders - .45) - 10 * grooves
        heightField += 1.12 * shoulders
        oxidation += .135 * grooves
        roughnessDelta += .075 * grooves - .048 * shoulders
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
            heightField -= .68 * stamp
            tonalDelta += 6 * rim - 12.5 * stamp
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
        # The close-up shows more diffuse wear beside the stamp. Ease the
        # polished response there while keeping the photographed color field.
        rough += .11 * near * (1 - .64 * oxideCoverage)
        metal -= .48 * near * np.maximum(metal - .55, 0)
    if name in REGISTERED_FINISHES:
        tint, channel, finishRoughness, finishMetal, influence, smoothing = REGISTERED_FINISHES[name]
        weight = ReferenceField(closeup, xx, sampledV, channel) * influence / 100
        finish = SrgbToLinear(np.asarray(tint, dtype=np.float32) / 255)
        linear += (finish - linear) * weight[..., None]
        rough += (finishRoughness - rough) * weight
        metal += (finishMetal - metal) * weight
        heightField *= 1 - smoothing * weight
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
    base = LinearToSrgb(linear)
    base += tonalDelta[..., None] / 255 + warmth[..., None] * np.array([.39, .055, -.27])
    ao = 1 - .019 * pits - (.087 if name in ("Recess", "Channel") else .016) * oxidation
    if name == "Wheel":
        ao *= 1 - .54 * trough - .11 * rust
    heightField = np.clip(heightField * (.54 + .46 * oxidation), -1.5, 1.5)
    surface = np.stack([rough, metal, ao], axis=-1)
    if name in ("Barrel", "Collar", "Knurl", "Sleeve", "Neck", "SaddleRim", "RearEye", "Wheel"):
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
    smoothing = .55 if name == "Barrel" else .72
    normal = NormalFromHeight(GaussianPeriodic(heightField, smoothing), relief, .12, 1.0, "gl") * .5 + .5
    orm = np.stack([ao, np.clip(rough, .17, .92), metal], axis=-1)
    return tuple(np.rint(255 * np.clip(arr, 0, 1)).astype(np.uint8) for arr in (base, normal, orm))


def Bake():
    reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
    with Image.open(SOURCE) as image:
        source = image.convert("RGB")
    side = min(source.size) // 2
    margin = side // 24
    quadrants = []
    for index in range(4):
        x, y = index % 2 * side, index // 2 * side
        quadrants.append(source.crop((x + margin, y + margin, x + side - margin, y + side - margin)))

    size = ATLAS["size"]
    maps = [np.zeros((size, size, 3), dtype=np.uint8) for _ in range(3)]
    for index, (name, (x, y, width, height)) in enumerate(ATLAS["regions"].items()):
        if name == "Stripe":
            continue
        tile = BakeRegion(name, quadrants, (width, height), index, reference)
        for atlas, pixels in zip(maps, tile):
            atlas[y:y + height, x:x + width] = pixels
    x, y, width, height = ATLAS["regions"]["Stripe"]
    for atlas, pixels in zip(maps, SampleBarrelStripe(maps, (width, height))):
        atlas[y:y + height, x:x + width] = pixels

    for channel, pixels, outputSize, quality in zip(("Base", "Normal", "Orm"), maps, (2048, 2048, 1024), (84, 86.5, 87)):
        image = Image.fromarray(pixels)
        if outputSize != size:
            image = image.resize((outputSize, outputSize), Image.Resampling.BOX)
        image.save(HERE.parent / "Texture" / f"Texture_{STEM}{channel}.webp", method=6, quality=quality)
    subprocess.run([sys.executable, str(HERE / "Script_BakePbrTexture.py"), "--audit", "--name", STEM], check=True)
    recordPath = HERE / "TextureBakes" / f"Texture_{STEM}.json"
    record = json.loads(recordPath.read_text(encoding="utf-8"))
    record["source"] = {"path": SOURCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(SOURCE)}
    record["reference"] = {"path": REFERENCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(REFERENCE)}
    detail = reference["closeups"]["Barrel"]["detail"]
    record["reference"]["barrelDetail"] = {"path": REFERENCE.with_name(detail["file"]).relative_to(HERE.parent).as_posix(),
                                          "sha256": detail["sha256"]}
    recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    Bake()
