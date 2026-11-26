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
        photoPits, photoWarmth, photoCoverage = PhotographicGrain(closeup, xx, vv)
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
        tabTone, tabWarmth, tabCoverage = PhotographicGrain(closeup, xx, sampledV)
        tabDetail = tabTone * tabCoverage
        tonalDelta += 107 * tabDetail - (2.7 * detail + 1.0 * medium) * tabCoverage
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
        tonalDelta += (3.6 if name == "Barrel" else 4.8) * brushing
        heightField += (.106 if name == "Barrel" else .23) * brushing
        roughnessDelta -= (.026 if name == "Barrel" else .037) * brushing
    if name == "Knurl":
        knurl = reference["knurl"]
        angular = knurl["angularCycles"] * xx
        axial = knurl["axialCycles"] * vv
        phaseA, phaseB = angular + axial, angular - axial
        left, right = np.mod(phaseA, 1), np.mod(phaseB, 1)
        diamonds = 2 * np.minimum(np.minimum(left, 1 - left), np.minimum(right, 1 - right))
        shoulders = np.clip((diamonds - .05) / .55, 0, 1)
        grooves = np.clip(1 - diamonds / .34, 0, 1) ** .83
        chip = UnitVariation(luminance, .42, 2.15)
        centerA, centerB = np.floor(phaseA) + .5, np.floor(phaseB) + .5
        centerU = np.mod((centerA + centerB) / (2 * knurl["angularCycles"]), 1)
        centerV = np.clip((centerA - centerB) / (2 * knurl["axialCycles"]), 0, 1)
        columns = np.rint(padding + centerU * (width - 2 * padding)).astype(np.int32)
        rows = np.rint(padding + (1 - centerV) * (height - 2 * padding)).astype(np.int32)
        cellWear = chip[rows, columns]
        photoTone, photoWarmth, coverage = PhotographicGrain(knurl["wear"], (xx + .5) % 1 - .5, vv)
        flank = knurl["flankWear"]
        flankTone, flankWarmth, flankCoverage = PhotographicGrain(flank, xx, vv)
        photoTone = photoTone * coverage + 1.32 * flankTone * flankCoverage
        photoWarmth = photoWarmth * coverage + flankWarmth * flankCoverage
        coverage = np.maximum(coverage, flankCoverage)
        # In the flank photo the darker, warmer grooves run along phase B.
        # Broaden that groove profile within the registered area.
        cutDistance = 2 * np.minimum(right, 1 - right)
        flankGroove = np.clip(1 - cutDistance / .44, 0, 1) ** .79
        grooves += flankCoverage * np.maximum(flankGroove - grooves, 0)
        wornHeight = np.clip(.91 + .16 * cellWear, .55, 1.11) * (1 - .10 * coverage)
        exposedArea = np.clip((diamonds - .26) / .56, 0, 1)
        polish = np.clip(.39 + .19 * chip + .29 * cellWear + .75 * photoTone
                         - .95 * np.maximum(photoWarmth, 0), .02, 1)
        chippedCrests = exposedArea * polish * (1 + .28 * flankCoverage)
        uKnots, shadowChroma = np.asarray(flank["shadowChroma"], dtype=np.float32).T
        flankOxide = flankCoverage * np.clip(np.interp(xx, uKnots, shadowChroma) / .24, 0, 1)
        tonalDelta += 6.4 * chip + 15.5 * (shoulders - .45) - 7.6 * grooves + 112 * photoTone
        tonalDelta -= 12.5 * flankOxide * grooves + 22 * flankCoverage * flankGroove
        heightField += (1.56 + .40 * flankCoverage) * shoulders * wornHeight + .12 * chip * shoulders + .28 * photoTone
        heightField -= .49 * flankCoverage * flankGroove
        oxidation += .127 * grooves + .10 * photoWarmth
        warmth += .32 * photoWarmth + .27 * flankOxide * grooves
        roughnessDelta += .071 * grooves + .092 * shoulders - .14 * photoTone + .067 * flankOxide * grooves
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
        # The worn steel and the oxide beside the stamp scatter light differently.
        # Soften the hot steel glints and keep the oxide's diffuse response.
        rough += near * (.115 + .20 * exposedSteel) * (1 - .62 * oxideCoverage)
        metal -= near * (.40 + .54 * oxideCoverage) * np.maximum(metal - (.55 - .19 * oxideCoverage), 0)
        linear *= (1 - .19 * near * exposedSteel)[..., None]
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
        dark = .83 * grooves * np.clip(.94 + .105 * cellWear, .68, 1)
        dark = np.minimum(.96, dark + .21 * flankCoverage * flankGroove)
        recessColor = SrgbToLinear(np.array([40, 36, 30], dtype=np.float32) / 255)
        linear += (recessColor - linear) * dark[..., None]
        rough += (.73 - rough) * dark
        metal += (.30 - metal) * dark
        lip = np.clip(1 - np.abs(cutDistance - .47) / .22, 0, 1)
        wornLip = flankCoverage * lip * (1 - grooves) * np.clip(.65 + .32 * cellWear, .25, 1)
        exposed = np.clip(.77 * chippedCrests + .26 * wornLip, 0, 1)
        crestColor = SrgbToLinear(np.array([159, 152, 140], dtype=np.float32) / 255)
        linear += (crestColor - linear) * exposed[..., None]
        rough += (.322 - rough) * exposed
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
    if name == "Shoulder":
        # Shift hue with near-zero luma change in the photographed flank.
        base += shoulderTint[..., None] * LUMA_NEUTRAL_WARMTH
    if name == "Saddle":
        base += .035 * shoeCoverage[..., None] * LUMA_NEUTRAL_WARMTH
    if name == "Stem":
        base += .031 * stemCoverage[..., None] * LUMA_NEUTRAL_WARMTH
    ao = 1 - .019 * pits - (.087 if name in ("Recess", "Channel") else .016) * oxidation
    if name == "Knurl":
        ao *= 1 - .31 * grooves
    if name == "Wheel":
        ao *= 1 - .54 * trough - .11 * rust
    heightField = np.clip(heightField * (.54 + .46 * oxidation), -1.5, 1.5)
    surface = np.stack([rough, metal, ao], axis=-1)
    if name in ("Barrel", "Collar", "CollarRing", "Shoulder", "Knurl", "Sleeve", "Neck", "SaddleRim", "RearEye", "Wheel"):
        seamWidth = 6 if name in ("Knurl", "RearEye", "Wheel") else 24
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


def ResizeSharedCollar(maps, width, height):
    pad = ATLAS["padding"]
    inner = (width - 2 * pad, height - 2 * pad)
    border = ((pad, pad), (pad, pad), (0, 0))
    output = []
    for pixels in maps:
        face = Image.fromarray(pixels[pad:-pad, pad:-pad]).resize(inner, Image.Resampling.LANCZOS)
        output.append(np.pad(np.asarray(face), border, mode="edge"))
    return output


def BakeKnurl(quadrants, width, height, index, reference):
    # The grip chart now covers just the patterned bands. Evaluate the finish
    # in the original coordinates so the measured diamond pitch stays fixed.
    pad = ATLAS["padding"]
    sourceWidth, sourceHeight = 2 * (width - pad), 2 * (height - pad)
    maps = BakeRegion("Knurl", quadrants, (sourceWidth, sourceHeight), index, reference)
    first, last = ATLAS["knurlSourceV"]
    across = np.clip((np.arange(width) - pad) / (width - 2 * pad - 1), 0, 1)
    columns = pad + across * (sourceWidth - 2 * pad - 1)
    fraction = np.clip((np.arange(height) - pad) / (height - 2 * pad), 0, 1)
    rows = pad + (1 - last + (last - first) * fraction) * (sourceHeight - 2 * pad)
    lower, left = rows.astype(np.int32), columns.astype(np.int32)
    blendV, blendU = (rows - lower)[:, None, None], (columns - left)[None, :, None]
    output = []
    for pixels in maps:
        vertical = (1 - blendV) * pixels[lower] + blendV * pixels[lower + 1]
        tile = (1 - blendU) * vertical[:, left] + blendU * vertical[:, left + 1]
        # Extend the matched texels through padding before WebP encoding.
        SeamBlend(tile, pixels=3)
        output.append(np.rint(tile).astype(np.uint8))
    return output


def BuildAtlas(reference):
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
        if name == "Collar":
            # Resample the legacy finish into the smaller shared chart.
            legacyHeight = height + ATLAS["regions"]["Shoulder"][3]
            sourceHeight = legacyHeight + ATLAS["regions"]["CollarRing"][3]
            legacy = ResizeSharedCollar(BakeRegion(name, quadrants, (width, sourceHeight), index, reference),
                                        width, legacyHeight)
            tile = ResizeSharedCollar(legacy, width, height)
        elif name == "Knurl":
            tile = BakeKnurl(quadrants, width, height, index, reference)
        else:
            tile = BakeRegion(name, quadrants, (width, height), index, reference)
        for atlas, pixels in zip(maps, tile):
            atlas[y:y + height, x:x + width] = pixels
    x, y, width, height = ATLAS["regions"]["Stripe"]
    for atlas, pixels in zip(maps, SampleBarrelStripe(maps, (width, height))):
        atlas[y:y + height, x:x + width] = pixels
    return maps


def Bake():
    reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
    maps = BuildAtlas(reference)
    size = ATLAS["size"]
    for channel, pixels, outputSize, quality in zip(("Base", "Normal", "Orm"), maps, (2048, 2048, 1024), (84, 84, 87)):
        image = Image.fromarray(pixels)
        if outputSize != size:
            image = image.resize((outputSize, outputSize), Image.Resampling.BOX)
        image.save(HERE.parent / "Texture" / f"Texture_{STEM}{channel}.webp", method=6, quality=quality)
    subprocess.run([sys.executable, str(HERE / "Script_BakePbrTexture.py"), "--audit", "--name", STEM], check=True)
    recordPath = HERE / "TextureBakes" / f"Texture_{STEM}.json"
    record = json.loads(recordPath.read_text(encoding="utf-8"))
    record["source"] = {"path": SOURCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(SOURCE)}
    record["reference"] = {"path": REFERENCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(REFERENCE)}
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
    for key, detail in details.items():
        record["reference"][key] = {"path": REFERENCE.with_name(detail["file"]).relative_to(HERE.parent).as_posix(),
                                    "sha256": detail["sha256"]}
    recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    Bake()
