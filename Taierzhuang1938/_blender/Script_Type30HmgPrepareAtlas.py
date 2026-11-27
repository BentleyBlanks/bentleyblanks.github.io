"""Prepare the Type 30 game prop's photo-guided PBR atlas.

The guide records broad wear locations. Image 2.6 supplies the surface detail.
Material properties and the photograph's illumination are worked on separately.
"""

import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ATLAS_SIZE = (3840, 2160)
TILE_SIZE = (1280, 1080)
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
# Base color, contribution of the guide's large-scale marks, roughness,
# metalness, and strength of the fine surface relief.
FINISHES = (
    ("WaterJacket", (49, 46, 36), 0.57, 0.365, 0.54, 0.80),
    ("BrassBand", (132, 98, 39), 0.72, 0.51, 0.66, 1.05),
    ("BrassFace", (142, 133, 118), 0.68, 0.54, 0.42, 1.00),
    ("BluedSteel", (51, 51, 50), 0.00, 0.45, 0.76, 1.15),
    ("TripodSteel", (52, 55, 38), 0.00, 0.46, 0.34, 1.45),
    ("DarkWalnut", (47, 35, 26), 0.00, 0.60, 0.00, 0.78),
)
LINEAR_GAINS = {
    "WaterJacket": (1.28, 1.14, 1.18),
    "BrassBand": (0.28, 0.21, 0.37),
    "BrassFace": (1.0, 0.98, 0.89),
}
RECEIVER_TV_FINISHES = {
    "RightSidePanel": ((19, 22, 28), .22, .69),
    "UpperCoverRightSide": ((29, 33, 44), .72, .63),
    "ReceiverShell": ((20, 23, 30), .68, .66),
}
FAR_FORELEG_FINISH = ((95, 91, 60), .79, .14)
STAND_COLLAR_FINISH = {
    "RightForwardLegCollar": ((56, 62, 44), .80, .32, 1.27),
    "LeftForwardLegCollar": ((89, 92, 62), .82, .18, .94),
}
SWIVEL_RING_FINISH = ((65, 67, 55), .81, .08, .90)
CRADLE_TV_FINISH = ((36, 39, 31), .19, .60, 1.95, .60)
# The upper and lower margins of the walnut tile are outside the grip UVs.
# Pack rear details there so the prop still uses the same three 4K textures.
REAR_REGIONS = {
    "RearLeg": ((2560, 1080, 1280, 320), (0, 0), (1410, 1195, 2435, 1730)),
    "LeftSidePanel": ((2560, 1840, 896, 320), (0, 320), (275, 1395, 1011, 1600)),
    "RearPlate": ((3456, 1840, 384, 320), (896, 320), (445, 1390, 830, 1690)),
}


def Rgb(values):
    return Image.fromarray(np.uint8(np.clip(np.rint(values), 0, 255)))


def Tile(image, col, row, inset=0):
    width, height = image.width // 3, image.height // 2
    x, y = col * width, row * height
    region = image.crop((x + inset, y + inset, x + width - inset, y + height - inset))
    return np.asarray(region.resize(TILE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32)


def CenteredGuide(guide):
    """Keep the clouding and wear shapes while compressing the photo exposure."""
    broad = cv2.GaussianBlur(guide, (0, 0), 18)
    anchor = np.median(broad.reshape(-1, 3), axis=0)
    return np.clip(broad - anchor, -60, 45)


def CylinderRows(image):
    """Map the photographed side of the cylindrical surface around the UV seam."""
    height, width = image.shape[:2]
    angle = np.linspace(0, 2 * np.pi, height, dtype=np.float32)
    columns = np.arange(width, dtype=np.float32)[None, :]
    mapX = np.clip(columns + 11 * np.sin(angle[:, None]), 0, width - 1)
    mapY = (height - 1) * (0.5 + 0.465 * np.cos(angle[:, None]))
    mapY = np.broadcast_to(mapY, (height, width)).copy()
    return cv2.remap(image, mapX, mapY, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)


def CalibrateColor(color, gains):
    srgb = np.clip(color / 255, 0, 1)
    linear = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
    linear *= np.array(gains, dtype=np.float32)
    srgb = np.where(linear <= 0.0031308, linear * 12.92, 1.055 * linear ** (1 / 2.4) - 0.055)
    return srgb * 255


def RegisterCapWear(color, generated, neutral, capWear, photoCenter=None):
    coverage = capWear[..., 3] / 255
    photographed = capWear[..., :3]
    center = np.median(photographed[coverage > 0.72], axis=0) if photoCenter is None else photoCenter
    weighted = cv2.GaussianBlur((photographed - center) * coverage[..., None], (0, 0), 8)
    blurredCoverage = cv2.GaussianBlur(coverage, (0, 0), 8)
    variation = weighted / np.maximum(blurredCoverage, 0.08)[..., None]
    detail = generated - cv2.GaussianBlur(generated, (0, 0), 10)
    registered = neutral + np.clip(variation, -54, 40) * 1.03 + detail * 0.72
    mask = (0.94 * blurredCoverage)[..., None]
    return color * (1 - mask) + registered * mask


def BakeTile(generated, guide, finish, capWear=None, capPhotoCenter=None):
    name, neutral, influence, roughness, metalness, grainStrength = finish
    neutral = np.array(neutral, dtype=np.float32)
    median = np.median(generated.reshape(-1, 3), axis=0)
    color = neutral + (generated - median) * 0.89
    if influence:
        color += influence * CenteredGuide(guide)
    if capWear is not None:
        color = RegisterCapWear(color, generated, neutral, capWear, capPhotoCenter)
    if name in {"WaterJacket", "BrassBand"}:
        color = CylinderRows(color)

    tone = np.clip(color, 2, 254) @ LUMA / 255.0
    medium = cv2.GaussianBlur(tone, (0, 0), 4.2)
    soft = cv2.GaussianBlur(tone, (0, 0), 1.15)
    grain = soft - medium
    dark, mid, bright = np.quantile(medium, (0.11, 0.5, 0.94))
    contrast = max(0.055, bright - dark)
    oxide = np.clip((mid - medium) / contrast * 1.43, 0, 1)
    polished = np.clip((medium - mid) / contrast * 1.40, 0, 1)
    rough = roughness + 0.23 * oxide - 0.17 * polished - 0.30 * grain
    metallic = np.clip(metalness - 0.38 * oxide + 0.20 * polished, 0, 1)

    if name in {"BluedSteel", "TripodSteel"}:
        # Reserve the last rows for rubbed pins and collars. The remainder of
        # the tile retains the dark finish on plates and shafts.
        row = np.linspace(0.0, 1.0, color.shape[0], dtype=np.float32)[:, None]
        region = np.clip((row - 0.73) / 0.17, 0, 1)
        exposed = region * (0.085 + 0.76 * np.clip((polished - 0.17) * 1.38, 0, 1))
        wornColor = np.array((142, 140, 132) if name == "TripodSteel" else (116, 118, 116))
        color = color * (1 - exposed[..., None]) + wornColor * exposed[..., None]
        metallic = np.maximum(metallic, exposed * 0.89)
        rough -= exposed * 0.18
    if name == "DarkWalnut":
        metallic.fill(0)

    # Draw relief from texture at small scales. Broad color and light patches
    # must not become raised geometry in the normal map.
    height = grain * grainStrength * 2.7
    dy, dx = np.gradient(height)
    normal = np.stack((-dx, dy, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    packed = np.stack((np.ones_like(rough), np.clip(rough, 0.19, 0.84), metallic), axis=-1)
    if gains := LINEAR_GAINS.get(name):
        color = CalibrateColor(color, gains)
    return Rgb(color), Rgb(packed * 255), Rgb(255 * (normal * 0.5 + 0.5))


def BakeCapVideoDetail(maps, generated, guide, finish, firstPhoto, broaderPhoto):
    oldCoverage = firstPhoto[..., 3] / 255
    gain = np.maximum((broaderPhoto[..., 3] - firstPhoto[..., 3]) / 255, 0)
    if not np.any(gain > 0.4):
        raise ValueError("The cap video does not extend the registered photo coverage")
    # Both bakes share the same photographic color anchor. Added coverage
    # contributes where continuous video establishes the shape of the wear.
    center = np.median(firstPhoto[..., :3][oldCoverage > .72], axis=0)
    updated = BakeTile(generated, guide, finish, broaderPhoto, center)
    blend = np.clip(cv2.GaussianBlur(gain, (0, 0), 3) * 2.65, 0, 1)[..., None]
    paired = [(np.asarray(old, dtype=np.float32), np.asarray(new, dtype=np.float32)) for old, new in zip(maps, updated)]
    coverage = broaderPhoto[..., 3] / 255
    weight = cv2.GaussianBlur(coverage, (0, 0), 10)
    relativeLuma = cv2.GaussianBlur((broaderPhoto[..., :3] @ LUMA) * coverage, (0, 0), 10) / np.maximum(weight, .08)
    oxideShade = np.clip(((center @ LUMA) - relativeLuma) / 35, 0, 1)
    original, observed = paired[0]
    darkened = CalibrateColor(observed, (1 - .54 * oxideShade)[..., None])
    paired[0] = original, darkened
    return tuple(Rgb(old + (new - old) * blend) for old, new in paired)


def PhotoWear(swatch, axial=False):
    coverage = swatch[..., 3] / 255
    tone = np.log(np.maximum(swatch[..., :3] @ LUMA, 6))
    if axial:
        # Exposure changes along the shaft as it enters the illuminated end
        # of the plinth. Remove that column-wise change before taking wear.
        tone -= np.median(tone, axis=0)
    fine = cv2.GaussianBlur(tone * coverage, (0, 0), 0.9)
    fine /= np.maximum(cv2.GaussianBlur(coverage, (0, 0), 0.9), 0.08)
    illumination = cv2.GaussianBlur(tone * coverage, (0, 0), 19, sigmaY=13)
    illumination /= np.maximum(cv2.GaussianBlur(coverage, (0, 0), 19, sigmaY=13), 0.08)
    return np.clip(fine - illumination, -0.34, 0.43) * coverage, coverage


def CalibrateLeftSidePanel(maps, rect, photo, wear, coverage):
    left, top, width, height = rect
    box = (left, top, left + width, top + height)
    base, packed, normals = [np.asarray(image.crop(box), dtype=np.float32) for image in maps]
    tone = photo[..., :3] @ LUMA
    largeScale = cv2.GaussianBlur(tone * coverage, (0, 0), 58, sigmaY=22)
    largeScale /= np.maximum(cv2.GaussianBlur(coverage, (0, 0), 58, sigmaY=22), .07)
    polished = np.clip((largeScale - 61) / 79, 0, 1)
    polished = polished ** 2 * (3 - 2 * polished)

    # The lower band retains a smoother reflection in the rear photograph.
    # Keep its brightness in the light response, with fine wear in the color.
    u = np.linspace(0, 1, width, dtype=np.float32)
    v = np.linspace(0, 1, height, dtype=np.float32)[:, None]
    sheen = .86 * np.exp(-.5 * (((u - .41) / .22) ** 4 + ((v - .72) / .12) ** 4))
    microtexture = base - cv2.GaussianBlur(base, (0, 0), 4)
    color = np.float32((35, 38, 45)) - sheen[..., None]
    color += .25 * microtexture + wear[..., None] * np.float32((22, 26, 34))
    exposed = np.clip((wear - .025) * 2.5, 0, .8)
    dull = np.maximum(-wear, 0)
    rough = .58 - .16 * polished
    rough += (.37 - rough) * sheen
    packed[..., 1] = np.clip(rough + .12 * dull - .14 * exposed, .12, .95) * 255
    packed[..., 2] = np.clip(.80 - .01 * sheen + .14 * exposed - .13 * dull, .37, .99) * 255

    dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), .8))
    tangent = (normals / 127.5 - 1) * np.float32((.65, .65, 1))
    tangent[..., 0] -= dx * .6
    tangent[..., 1] += dy * .6
    tangent /= np.linalg.norm(tangent, axis=-1, keepdims=True)
    matteNormal = tangent + np.float32((-.10, -.17, 0))
    matteNormal /= np.linalg.norm(matteNormal, axis=-1, keepdims=True)
    normal = matteNormal + (tangent - matteNormal) * sheen[..., None]
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    for atlas, values in zip(maps, (color, packed, (normal + 1) * 127.5)):
        atlas.paste(Rgb(values), (left, top))


def BakeRearDetails(maps, guide, registration):
    if guide.size != (1280, 640):
        raise ValueError(f"Unexpected rear-wear guide size: {guide.size}")
    regions = {}
    for name, (rect, corner, baseRect) in REAR_REGIONS.items():
        x, y, width, height = rect
        sx, sy = corner
        photo = np.asarray(guide.crop((sx, sy, sx + width, sy + height)), dtype=np.float32)
        if not np.any(photo[..., 3] > 190):
            raise ValueError(f"The rear-wear guide has no usable pixels for {name}")
        axial = name == "RearLeg"
        wear, coverage = PhotoWear(photo, axial)
        if axial:
            mapX, mapY, visible = (registration[key] for key in ("mapX", "mapY", "coverage"))
            if not all(array.shape == wear.shape and np.all(np.isfinite(array)) for array in (mapX, mapY, visible)):
                raise ValueError("The rear-leg photo registration does not match the atlas region")
            wear = cv2.remap(wear, mapX, mapY, cv2.INTER_LINEAR) * visible
            coverage = cv2.remap(coverage, mapX, mapY, cv2.INTER_LINEAR) * visible
        color, packed, normal = [np.asarray(m.crop(baseRect).resize((width, height), Image.Resampling.LANCZOS),
                                            dtype=np.float32) for m in maps]
        if name != "RearLeg":
            # The rear plates have a relatively smooth finish under the
            # localized wear. Keep the microtexture from the generated tile.
            broad = cv2.GaussianBlur(color, (0, 0), 17)
            neutral = np.asarray((48, 50, 54) if name == "LeftSidePanel" else (40, 39, 37))
            color = neutral + 0.23 * (broad - np.median(broad.reshape(-1, 3), axis=0)) + 0.76 * (color - broad)
        # Preserve the Image 2.6 microtexture and give the captured abrasion
        # its own placement, color, and response to light.
        if axial:
            along = np.linspace(0, 1, width, dtype=np.float32)
            # The source shows stronger fine scratches near the sides of the
            # illuminated length. Adjust the color contrast of the registered
            # wear without transferring the broad illumination ramp.
            contrast = np.interp(along, (0, .32, .48, .65, .84, 1), (4.0, 4.0, 3.7, 2.85, 3.13, 2.98))
            color += (wear * contrast)[..., None] * np.array((44, 46, 49))
        else:
            color += wear[..., None] * np.array((22, 23, 25))
        exposed = np.clip((wear - 0.044) * 3.5, 0, 0.72)
        roughness = packed[..., 1] / 255 + np.maximum(-wear, 0) * 0.27 - exposed * 0.19
        metallic = packed[..., 2] / 255 + exposed * (0.48 if name == "RearLeg" else 0.24) - np.maximum(-wear, 0) * 0.15
        packed[..., 1] = np.clip(roughness, 0.21, 0.79) * 255
        packed[..., 2] = np.clip(metallic, 0, 1) * 255
        dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), 1.1))
        normal = normal / 127.5 - 1
        normal[..., 0] -= dx * 0.40 * coverage
        normal[..., 1] += dy * 0.40 * coverage
        normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 0.001)
        for destination, contents in zip(maps, (color, packed, (normal + 1) * 127.5)):
            destination.paste(Rgb(contents), (x, y))
        if name == "LeftSidePanel":
            CalibrateLeftSidePanel(maps, rect, photo, wear, coverage)
        regions[name] = rect
    return regions


def SamplePlanarRegion(maps, rect, baselineUv, matchEdges=False):
    # PhotoUv reserves seven pixels so the face does not meet the next region
    # when the renderer samples a filtered or scaled-down atlas.
    _, _, width, height = rect
    u, v = np.meshgrid((np.arange(width, dtype=np.float32) + 0.5 - 7) / (width - 14),
                       1 - (np.arange(height, dtype=np.float32) + 0.5 - 7) / (height - 14))
    if matchEdges:
        # Both texels at each bilinear footprint sample the original face edge.
        u[:, :8], u[:, -8:] = 0, 1
        v[:8], v[-8:] = 1, 0
    coordinates = np.stack((u, v, np.ones_like(u)), axis=-1) @ np.float32(baselineUv)
    mapX = coordinates[..., 0] * ATLAS_SIZE[0] - 0.5
    mapY = (1 - coordinates[..., 1]) * ATLAS_SIZE[1] - 0.5
    pixels = [cv2.remap(np.asarray(channel), mapX, mapY, cv2.INTER_LINEAR).astype(np.float32)
              for channel in maps]
    return pixels, u


def BakeVideoPanels(maps, guide, registration):
    if guide.size != (368, 432):
        raise ValueError(f"Unexpected video-wear guide size: {guide.size}")
    regions = {}
    for name, sourceY in (("RightSidePanel", 0), ("RightCradleCheek", 180)):
        data = registration[name]
        x, y, width, height = data["rect"]
        rgb = np.asarray(guide.crop((0, sourceY, width, sourceY + height)), dtype=np.float32)
        wear, coverage = PhotoWear(rgb)
        (color, packed, normal), u = SamplePlanarRegion(maps, data["rect"], data["baselineUv"])
        if "protectedFrontU" in data:
            coverage *= np.clip((u - data["protectedFrontU"]) / 0.12, 0, 1)
        support = cv2.GaussianBlur(coverage, (0, 0), 2.3)
        substrate = cv2.GaussianBlur(color, (0, 0), 12)
        neutral = np.median(color.reshape(-1, 3), axis=0)
        # Preserve the same base tone. The recorded steel faces have quiet
        # broad variation with smaller, stationary marks in the worn finish.
        observed = neutral + 0.25 * (substrate - neutral) + 0.77 * (color - substrate)
        observed += wear[..., None] * np.array((28, 28, 26))
        if name == "RightSidePanel":
            # Match the darker blued panel relative to the lower plate in
            # the continuous shot, where both share the frame exposure.
            observed = CalibrateColor(observed, (0.69, 0.72, 0.85))
        color += (observed - color) * (support * 0.85)[..., None]
        polished = np.clip((wear - 0.035) * 3.7, 0, 0.72) * support
        worn = np.maximum(-wear, 0) * support
        packed[..., 1] = np.clip(packed[..., 1] / 255 + worn * 0.12 - polished * 0.10, 0.19, 0.84) * 255
        packed[..., 2] = np.clip(packed[..., 2] / 255 + polished * 0.18 - worn * 0.08, 0, 1) * 255
        for atlas, pixels in zip(maps, (color, packed, normal)):
            atlas.paste(Rgb(pixels), (x, y))
        regions[name] = (x, y, width, height)
    return regions


def BakeReceiverTvFinish(maps, guideDir, photoRegions):
    registration = json.loads((guideDir / "Data_ReceiverFinishRegistration.json").read_text(encoding="utf-8"))
    for name, (palette, roughness, metallic) in RECEIVER_TV_FINISHES.items():
        data = registration[name]
        rect = tuple(data["rect"])
        x, y, w, h = rect
        with Image.open(guideDir / f"Reference_Type30{name}Tv.png") as guide:
            if guide.size != (w, h):
                raise ValueError(f"The receiver guide does not match the atlas region for {name}")
            photo = np.asarray(guide.convert("RGBA"), dtype=np.float32)
        wear, visibility = PhotoWear(photo)
        visible = visibility > .8
        if not np.any(visible):
            raise ValueError(f"The receiver guide has no visible coating for {name}")
        if tuple(photoRegions.get(name, ())) == rect:
            color, packed, normals = [np.asarray(image.crop((x, y, x + w, y + h)), dtype=np.float32) for image in maps]
        else:
            (color, packed, normals), _ = SamplePlanarRegion(maps, rect, data["baselineUv"])
            # The earlier chart's horizontal axis runs toward the front.
            normals[..., 0] = 255 - normals[..., 0]
        origin = (color.copy(), packed.copy(), normals)
        # The coating's channel ratios retain the local blue cast through an
        # exposure change. Use local contrast for pits and the rubbed edge.
        rgb = photo[..., :3]
        hue = rgb / np.maximum(rgb @ LUMA, 7)[..., None]
        local = cv2.GaussianBlur((hue - np.median(hue[visible], axis=0)) * visibility[..., None], (0, 0), 2)
        substrate = cv2.GaussianBlur(color, (0, 0), 5)
        color = np.float32(palette) * np.exp((wear * 1.27)[..., None]) + .23 * (color - substrate)
        color += np.clip(local, -.25, .25) * 19
        rubbed = np.clip((wear - .093) / .24, 0, 1)
        color += rubbed[..., None] * np.float32((16, 18, 21))
        dull = np.maximum(-wear, 0)
        finishRough = np.clip(roughness + .25 * dull - .14 * rubbed, .29, .83)
        finishMetal = np.clip(metallic - .20 * dull + .16 * rubbed, .32, .91)
        packed[..., 1] = finishRough * 255
        packed[..., 2] = finishMetal * 255
        dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), .7))
        normal = normals / 127.5 - 1
        detail = np.stack((-dx * .61, dy * .61, np.ones_like(dx)), axis=-1)
        normal = detail + (normal - np.float32((0, 0, 1))) * .23
        normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), .001)
        u = (np.arange(w, dtype=np.float32) + .5 - 7) / (w - 14)
        a, b = data["frontBlend"]
        if not 0 <= a < b <= 1:
            raise ValueError(f"The receiver transition falls outside the texture coordinates for {name}")
        transition = np.clip((u - a) / (b - a), 0, 1)[None, :]
        if "lowerSideBlend" in data:
            left, right, lower, upper = data["lowerSideBlend"]
            if not (0 <= left < right <= 1 and 0 <= lower < upper <= 1):
                raise ValueError(f"The lower receiver transition falls outside the texture coordinates for {name}")
            v = 1 - (np.arange(h, dtype=np.float32) + .5 - 7) / (h - 14)
            strip = np.clip((upper - v) / (upper - lower), 0, 1)
            transition = np.maximum(transition, strip[:, None] * np.clip((u - left) / (right - left), 0, 1))
        transition = (transition * transition * (3 - 2 * transition))[..., None]
        for image, original, pixels in zip(maps, origin, (color, packed, (normal + 1) * 127.5)):
            image.paste(Rgb(original + (pixels - original) * transition), (x, y))
        photoRegions[name] = rect


def BakeCradleTvFinish(maps, guideDir, photoRegions):
    part = "RightCradleCheek"
    spec = json.loads((guideDir / "Data_CradleExpandedRegistration.json").read_text(encoding="utf-8"))
    rect = tuple(spec["rect"])
    x, y, w, h = rect
    with Image.open(guideDir / "Reference_Type30CradleExpanded.png") as source:
        if source.size != (w, h):
            raise ValueError("The cradle coating reference does not match its atlas region")
        photo = np.asarray(source.convert("RGBA"), dtype=np.float32)
    wear, coverage = PhotoWear(photo)
    visible = coverage > .8
    if not np.any(visible):
        raise ValueError("The cradle coating reference has no visible steel")
    if tuple(photoRegions.get(part, ())) == rect:
        color, packed, normals = [np.asarray(image.crop((x, y, x + w, y + h)), dtype=np.float32) for image in maps]
    else:
        (color, packed, normals), _ = SamplePlanarRegion(maps, rect, spec["baselineUv"])
        normals[..., 0] = 255 - normals[..., 0]
    palette, roughness, metal, grain, shine = CRADLE_TV_FINISH
    rgb = photo[..., :3]
    hue = rgb / np.maximum(rgb @ LUMA, 7)[..., None]
    local = cv2.GaussianBlur((hue - np.median(hue[visible], axis=0)) * coverage[..., None], (0, 0), 1.4)
    broad = cv2.GaussianBlur(color, (0, 0), 5)
    color = np.float32(palette) * np.exp((wear * grain)[..., None]) + .10 * (color - broad)
    color += np.clip(local, -.32, .32) * 15
    polished = np.clip((wear - .047) * 2.9, 0, .8) * shine
    dull = np.maximum(-wear, 0)
    color += polished[..., None] * np.float32((11, 14, 16))
    packed[..., 1] = np.clip(roughness + dull * .27 - polished * .11, .19, .83) * 255
    packed[..., 2] = np.clip(metal - dull * .12 + polished * .22, .04, .93) * 255
    dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), .72))
    normal = (normals / 127.5 - 1 - np.float32((0, 0, 1))) * .20
    normal += np.stack((-dx * .43, dy * .43, np.ones_like(dx)), axis=-1)
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), .001)
    for image, value in zip(maps, (color, packed, (normal + 1) * 127.5)):
        image.paste(Rgb(value), (x, y))
    photoRegions[part] = rect


def BakeRearFootFinish(maps, guideDir, photoRegions):
    legRect = photoRegions.get("RearLeg")
    if legRect is None:
        raise ValueError("The heel guide requires the rear-leg photo registration")
    left, top, width, height = legRect
    spec = json.loads((guideDir / "Data_RearFootFinishRegistration.json").read_text(encoding="utf-8"))
    with Image.open(guideDir / "Reference_Type30RearHeel.png") as guide:
        if guide.size != (width, height):
            raise ValueError("The heel guide does not match the existing rear-leg atlas region")
        photo = np.asarray(guide.convert("RGBA"), dtype=np.float32)
    weight = photo[..., 3] / 255
    if not np.any(weight > .8):
        raise ValueError("The heel guide has no registered surface")
    # Use the photographed difference between the dark paint and the neutral
    # abrasion. Keep the existing finish outside the registered view.
    smoothWeight = np.maximum(cv2.GaussianBlur(weight, (0, 0), .43), .001)
    paint = cv2.GaussianBlur(photo[..., :3] * weight[..., None], (0, 0), .43) / smoothWeight[..., None]
    neutral = paint[..., 2] / np.maximum(paint[..., 1], 6)
    polished = np.clip((paint[..., 1] - 105) / 100, 0, 1) * np.clip((neutral - .82) / .15, 0, 1)
    gain = np.interp(polished, (0, .16, .42, .80, 1), (.31, .371, .476, .678, .87))
    blueCorrection = .01 - .052 * (1 - polished) ** 2
    color = paint * np.stack((gain, gain + .005, gain + blueCorrection), axis=-1)
    box = (left, top, left + width, top + height)
    base, packed, normal = [np.asarray(image.crop(box), dtype=np.float32) for image in maps]
    roughness = .64 - .16 * polished
    metalness = .23 + .48 * polished
    response = np.stack((packed[..., 0], roughness * 255, metalness * 255), axis=-1)
    signal = (paint @ LUMA) / 255
    fine = signal - cv2.GaussianBlur(signal, (0, 0), 2.6)
    dy, dx = np.gradient(fine)
    detail = np.stack((-dx * .62, dy * .62, np.ones_like(dx)), axis=-1)
    detail /= np.linalg.norm(detail, axis=-1, keepdims=True)
    mix = weight[..., None]
    for atlas, previous, target in zip(maps, (base, packed, normal), (color, response, (detail + 1) * 127.5)):
        atlas.paste(Rgb(previous * (1 - mix) + target * mix), (left, top))

    part = "RearFootTop"
    left, top, width, height = spec["footRect"]
    with Image.open(guideDir / "Reference_Type30RearFootPaint.png") as guide:
        if guide.size != (width, height):
            raise ValueError("The foot paint guide does not match its atlas region")
        paint = np.asarray(guide.convert("RGB"), dtype=np.float32)
    broad = cv2.GaussianBlur(paint, (0, 0), 3.3)
    grain = paint - broad
    tint = broad - np.median(broad.reshape(-1, 3), axis=0)
    color = np.float32((53, 58, 49)) + 1.48 * grain + .09 * tint
    signal = grain @ LUMA / 255
    packed = np.stack((np.ones_like(signal), .74 - .48 * signal, .17 + .49 * signal), axis=-1) * 255
    dy, dx = np.gradient(cv2.GaussianBlur(signal, (0, 0), .65))
    detail = np.stack((-dx * .82, dy * .82, np.ones_like(dx)), axis=-1)
    detail /= np.linalg.norm(detail, axis=-1, keepdims=True)
    for atlas, pixels in zip(maps, (color, packed, (detail + 1) * 127.5)):
        atlas.paste(Rgb(pixels), (left, top))
    photoRegions[part] = spec["footRect"]


def BakeJacketTvDetail(maps, guide, pigmentStrength=35, replacement=.46, tint=(0, 0, 0)):
    if guide.size != TILE_SIZE:
        raise ValueError(f"Unexpected water-jacket detail guide size: {guide.size}")
    wear, visible = PhotoWear(np.asarray(guide, dtype=np.float32))
    if not np.any(visible > 0.9):
        raise ValueError("The water-jacket video has no usable surface pixels")
    # Only the fine pattern is present here. The earlier coating colors and
    # broad bands remain independent of the TV camera's cool window light.
    tone = np.clip(wear - np.sum(wear, dtype=np.float64) / np.sum(visible) * visible, -0.28, 0.32)
    color, packed, originalNormal = [np.asarray(image, dtype=np.float32) for image in maps]
    color -= (color - cv2.GaussianBlur(color, (0, 0), 6.5)) * (visible * replacement)[..., None]
    color += tone[..., None] * pigmentStrength + visible[..., None] * np.float32(tint)
    detailReplacement = replacement * (.43 / .46)
    rough = packed[..., 1] / 255
    rough -= detailReplacement * visible * (rough - cv2.GaussianBlur(rough, (0, 0), 6.5))
    packed[..., 1] = np.clip(rough + np.maximum(-tone, 0) * 0.18
                              - np.maximum(tone, 0) * 0.11, 0.19, 0.84) * 255
    dy, dx = np.gradient(cv2.GaussianBlur(tone, (0, 0), 0.82))
    normal = originalNormal / 127.5 - 1
    detail = normal[..., :2] - cv2.GaussianBlur(normal[..., :2], (0, 0), 6.5)
    normal[..., :2] -= detail * (visible * detailReplacement)[..., None]
    normal[..., 0] -= dx * 0.60
    normal[..., 1] += dy * 0.60
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), 0.001)
    return Rgb(color), Rgb(packed), Rgb(np.where(visible[..., None] > 0, (normal + 1) * 127.5, originalNormal))


def BakeFrontJacketDetail(maps, guide):
    color, metallicRoughness, normal = BakeJacketTvDetail(maps, guide, pigmentStrength=44, replacement=.83)
    visible = np.asarray(guide, dtype=np.float32)[..., 3] / 255
    arc = (np.arange(guide.height, dtype=np.float32) + .5) / guide.height
    # The observed lower sector has a tighter reflection and a visible
    # diffuse component under weak bounce light.
    band = np.clip((arc - .131) / .046, 0, 1) * np.clip((.264 - arc) / .046, 0, 1)
    support = visible * band[:, None]
    packed = np.asarray(metallicRoughness, dtype=np.float32) / 255
    packed[..., 1] = np.clip(packed[..., 1] - support * .145, .19, .84)
    packed[..., 2] = np.clip(packed[..., 2] - support * .19, 0, 1)
    return color, Rgb(packed * 255), normal


def CorrectJacketFinish(maps, correctionPath):
    with np.load(correctionPath, allow_pickle=False) as guide:
        baseLogGain = np.asarray(guide["baseLogGain"], dtype=np.float32)
        circumferentialOffset = np.asarray(guide["circumferentialOffset"], dtype=np.float32)
    if any(field.shape != TILE_SIZE[::-1] or not np.isfinite(field).all()
           for field in (baseLogGain, circumferentialOffset)):
        raise ValueError("The jacket finish correction must match the water-jacket atlas tile")
    color, packed, originalNormal = maps
    adjusted = np.asarray(color, dtype=np.float32) * np.exp(baseLogGain[..., None])
    rawNormal = np.asarray(originalNormal, dtype=np.float32)
    normal = rawNormal / 127.5 - 1
    normal[..., 1] += circumferentialOffset
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), .001)
    encoded = np.where(circumferentialOffset[..., None] != 0, (normal + 1) * 127.5, rawNormal)
    return Rgb(adjusted), packed, Rgb(encoded)


def BakeRearJacketCap(maps, guide, rect):
    left, top, width, height = rect
    if guide.size != (width, height):
        raise ValueError("The rear jacket face guide does not match its atlas region")
    photo = np.asarray(guide, dtype=np.float32)
    wear, coverage = PhotoWear(photo)
    observed = coverage > .80
    if not np.any(observed):
        raise ValueError("The rear jacket face guide has no visible metal")
    # Ratios between the color channels retain the olive and amber spots
    # through an exposure change. Resolve pitting at small scales separately.
    rgb = photo[..., :3]
    luma = rgb @ LUMA
    chroma = rgb / np.maximum(luma, 7)[..., None]
    neutralChroma = np.median(chroma[observed], axis=0)
    support = cv2.GaussianBlur(coverage, (0, 0), 2.0)
    hue = cv2.GaussianBlur((chroma - neutralChroma) * coverage[..., None], (0, 0), 2.0)
    color = np.float32((132, 121, 91)) * np.exp(wear[..., None] * 1.42) + np.clip(hue, -.26, .26) * 57
    # The gray patch on the upper face is both darker and less yellow than
    # the surrounding brass. Use both cues so the broad room shadow stays out.
    yellow = chroma[..., 0] - chroma[..., 2]
    cleanYellow = np.median(yellow[observed])
    faded = np.clip((cleanYellow - yellow - .08) / .23, 0, 1)
    dark = np.clip((110 - luma) / 38, 0, 1)
    tarnish = cv2.GaussianBlur(faded * dark * coverage, (0, 0), 2.0)
    color *= 1 - tarnish[..., None] * np.float32((.40, .35, .08))
    dull = np.maximum(-wear, 0)
    burnished = np.maximum(wear, 0)
    rough = np.clip(.53 + dull * .25 - burnished * .18 + tarnish * .16, .37, .76)
    metal = np.clip(.67 - dull * .22 + burnished * .20 - tarnish * .15, .42, .83)
    # Keep the curved bevel's warm reflection subdued up to the thin lip
    # that catches the light in the close-up.
    u, v = np.meshgrid((np.arange(width, dtype=np.float32) + .5 - 7) / (width - 14) * 2 - 1,
                      (np.arange(height, dtype=np.float32) + .5 - 7) / (height - 14) * 2 - 1)
    radius = np.hypot(u, v)
    rim = np.clip((radius - .812) / .040, 0, 1) * np.clip((1.012 - radius) / .046, 0, 1)
    color *= 1 - rim[..., None] * np.float32((.31, .30, .44))
    rough += (.66 - rough) * rim
    metal += (.83 - metal) * rim
    packed = np.stack((np.ones_like(rough), rough, metal), axis=-1)
    dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), .82))
    normal = np.stack((-dx * .85 * support, dy * .85 * support, np.ones_like(dx)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    for destination, pixels in zip(maps, (color, packed * 255, (normal + 1) * 127.5)):
        destination.paste(Rgb(pixels), (left, top))
    return {"RearJacketCollarRearFace": rect}


def SampleTripodCylinder(maps, u, arc, phase):
    oldArc = np.mod(arc - phase, 1)
    oldUvX = (1.025 + 0.95 * oldArc) / 3
    oldUvY = (0.30 + 0.665 * np.clip(u, 0, 1)) / 2
    return [cv2.remap(np.asarray(image), oldUvX * ATLAS_SIZE[0] - .5,
                      (1 - oldUvY) * ATLAS_SIZE[1] - .5, cv2.INTER_LINEAR).astype(np.float32)
            for image in maps]


def BakeForelegTvDetail(maps, guide, winding):
    left, top, width, height = winding["rect"]
    part = winding["part"]
    if guide.size != (width, height) or part not in {"RightForwardLeg", "LeftForwardLeg"}:
        raise ValueError("The foreground-leg guide does not match the winding record")
    u, arc = np.meshgrid((np.arange(width, dtype=np.float32) + .5 - 7) / (width - 14),
                         (np.arange(height, dtype=np.float32) + .5 - 7) / (height - 14))
    sourcePhoto = cv2.remap(np.asarray(guide), u * (width - 1), arc * (height - 1), cv2.INTER_LINEAR)
    wear, visible = PhotoWear(sourcePhoto.astype(np.float32))
    if not np.any(visible > .9):
        raise ValueError("The foreground-leg video has no usable pixels")
    color, packed, normal = SampleTripodCylinder(maps, u, arc, winding["phase"])
    dull = np.maximum(-wear, 0)
    polished = np.clip((wear - .04) * 3.1, 0, .63)
    if part == "LeftForwardLeg":
        # The far shaft has a muted olive coating with smaller exposed marks
        # along its length. Use the video signal for the recorded wear.
        palette, roughness, metallic = FAR_FORELEG_FINISH
        tone = sourcePhoto[..., :3].astype(np.float32)
        chroma = tone / np.maximum(tone @ LUMA, 8)[..., None]
        midpoint = np.median(chroma[visible > .88], axis=0)
        hue = cv2.GaussianBlur((chroma - midpoint) * visible[..., None], (0, 0), 2)
        substrate = cv2.GaussianBlur(color, (0, 0), 5)
        color = np.float32(palette) * np.exp((wear * 1.04)[..., None]) + .09 * (color - substrate)
        color += np.clip(hue, -.21, .21) * 16
        packed[..., 1] = np.clip(roughness + dull * .21 - polished * .15, .26, .84) * 255
        packed[..., 2] = np.clip(metallic - dull * .16 + polished * .32, 0, .69) * 255
    else:
        color += wear[..., None] * np.array((107, 113, 122))
        packed[..., 1] = np.clip(packed[..., 1] / 255 + dull * .17 - polished * .13, .19, .84) * 255
        packed[..., 2] = np.clip(packed[..., 2] / 255 + polished * .24, 0, 1) * 255
    # Photo UVs run along the shaft and then around its circumference. Rotate
    # the inherited tangent-space normals to those axes before adding wear.
    normal = normal / 127.5 - 1
    normal = np.stack((normal[..., 1], -normal[..., 0], normal[..., 2]), axis=-1)
    if part == "LeftForwardLeg":
        normal[..., :2] *= .18
    dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), .85))
    normal[..., 0] -= dx * .72
    normal[..., 1] += dy * .72
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), .001)
    for destination, image in zip(maps, (color, packed, (normal + 1) * 127.5)):
        destination.paste(Rgb(image), (left, top))
    return {part: winding["rect"]}


def BakeStandCollarTv(maps, guideDir, photoRegions):
    registration = json.loads((guideDir / "Data_StandCollarRegistration.json").read_text(encoding="utf-8"))
    for part, (palette, roughness, metallic, grain) in STAND_COLLAR_FINISH.items():
        data = registration[part]
        x, y, w, h = data["rect"]
        u, arc = np.meshgrid((np.arange(w, dtype=np.float32) + .5 - 7) / (w - 14),
                             (np.arange(h, dtype=np.float32) + .5 - 7) / (h - 14))
        with Image.open(guideDir / f"Reference_Type30{part}Tv.png") as capture:
            if capture.size != (w, h):
                raise ValueError(f"The stand collar guide does not match its atlas region for {part}")
            photo = cv2.remap(np.asarray(capture.convert("RGBA")), u * (w - 1), arc * (h - 1), cv2.INTER_LINEAR)
        wear, visibility = PhotoWear(photo.astype(np.float32))
        observed = visibility > .80
        if not np.any(observed):
            raise ValueError(f"The stand collar guide has no visible metal for {part}")
        color, packed, normal = SampleTripodCylinder(maps, u, arc, data["phase"])
        rgb = photo[..., :3].astype(np.float32)
        hue = rgb / np.maximum(rgb @ LUMA, 7)[..., None]
        flecks = cv2.GaussianBlur((hue - np.median(hue[observed], axis=0)) * visibility[..., None], (0, 0), 1.2)
        foundation = cv2.GaussianBlur(color, (0, 0), 4)
        color = np.float32(palette) * np.exp((wear * grain)[..., None]) + .12 * (color - foundation)
        color += np.clip(flecks, -.26, .26) * 21
        polished = np.clip((wear - .046) * 3.2, 0, .68)
        dull = np.maximum(-wear, 0)
        packed[..., 1] = np.clip(roughness + dull * .19 - polished * .20, .19, .84) * 255
        packed[..., 2] = np.clip(metallic + polished * .40 - dull * .16, 0, .82) * 255
        normal = normal / 127.5 - 1
        normal = np.stack((normal[..., 1] * .22, -normal[..., 0] * .22, normal[..., 2]), axis=-1)
        dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), .69))
        normal[..., 0] -= dx * .61
        normal[..., 1] += dy * .61
        normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), .001)
        for image, pixels in zip(maps, (color, packed, (normal + 1) * 127.5)):
            image.paste(Rgb(pixels), (x, y))
        photoRegions[part] = data["rect"]


def BakeSwivelRingPaint(maps, guideDir, photoRegions):
    spec = json.loads((guideDir / "Data_Type30SwivelRingWinding.json").read_text(encoding="utf-8"))
    x, y, width, height = spec["rect"]
    with Image.open(guideDir / "Reference_Type30SwivelRingPaint.png") as source:
        if source.size != (width, height):
            raise ValueError("The swivel rim reference does not match its atlas region")
        photo = np.asarray(source.convert("RGBA"), dtype=np.float32)
    wear, coverage = PhotoWear(photo)
    visible = coverage > .8
    if not np.any(visible):
        raise ValueError("The swivel rim reference has no visible metal")
    arc, along = np.meshgrid((np.arange(width, dtype=np.float32) + .5 - 7) / (width - 14),
                             1 - (np.arange(height, dtype=np.float32) + .5 - 7) / (height - 14))
    priorArc = np.mod(arc - spec["phase"], 1)
    oldU = (1.025 + .95 * priorArc) / 3
    oldV = (.040 + .155 * np.clip(along, 0, 1)) / 2
    color, packed, normal = [cv2.remap(np.asarray(image), oldU * ATLAS_SIZE[0] - .5,
                                       (1 - oldV) * ATLAS_SIZE[1] - .5, cv2.INTER_LINEAR).astype(np.float32)
                             for image in maps]
    palette, roughness, metallic, rubbedStrength = SWIVEL_RING_FINISH
    # The raw rim has a localized pale area against the olive paint. Use the
    # loss of color along the rim to guide the metal response and local wear.
    rgb = photo[..., :3]
    luma = np.maximum(rgb @ LUMA, 8)
    tint = (rgb[..., 1] - rgb[..., 2]) / luma
    pale = np.clip((.240 - tint) / .18, 0, 1) * np.clip((luma - 78) / 48, 0, 1)
    rubbed = cv2.GaussianBlur(pale * coverage, (0, 0), 1.2) * rubbedStrength
    hue = rgb / luma[..., None]
    colors = cv2.GaussianBlur((hue - np.median(hue[visible], axis=0)) * coverage[..., None], (0, 0), 1.6)
    foundation = cv2.GaussianBlur(color, (0, 0), 4)
    color = np.float32(palette) * np.exp((wear * 1.42)[..., None]) + .13 * (color - foundation)
    color += np.clip(colors, -.28, .28) * 20
    color += rubbed[..., None] * np.float32((44, 49, 55))
    dull = np.maximum(-wear, 0)
    packed[..., 1] = np.clip(roughness + .18 * dull - .10 * rubbed, .22, .84) * 255
    packed[..., 2] = np.clip(metallic - .18 * dull + .36 * rubbed, 0, .89) * 255
    normal = normal / 127.5 - 1
    normal[..., :2] *= .24
    dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), .7))
    normal[..., 0] -= dx * .65
    normal[..., 1] += dy * .65
    normal /= np.maximum(np.linalg.norm(normal, axis=-1, keepdims=True), .001)
    for atlas, pixels in zip(maps, (color, packed, (normal + 1) * 127.5)):
        atlas.paste(Rgb(pixels), (x, y))
    photoRegions["SwivelRing"] = spec["rect"]


def BakeSwivelHousingPaint(maps, guideDir, photoRegions):
    spec = json.loads((guideDir / "Data_Type30SwivelHousingRegistration.json").read_text(encoding="utf-8"))
    rect = tuple(spec["rect"])
    x, y, width, height = rect
    arc, along = np.meshgrid((np.arange(width, dtype=np.float32) + .5 - 7) / (width - 14),
                             1 - (np.arange(height, dtype=np.float32) + .5 - 7) / (height - 14))
    wear = np.zeros((height, width), dtype=np.float32)
    rubbed = np.zeros_like(wear)
    visibleSectors = {}
    for angle in ("Front", "Rear"):
        with Image.open(guideDir / f"Reference_Type30SwivelHousing{angle}.png") as guide:
            if guide.size != (width, height):
                raise ValueError("The swivel housing guide does not match its atlas region")
            photo = np.asarray(guide.convert("RGBA"), dtype=np.float32)
        detail, coverage = PhotoWear(photo)
        if not np.any(coverage > .8):
            raise ValueError("The swivel housing guide has no exposed paint")
        visibleSectors[angle] = cv2.GaussianBlur(coverage.max(axis=0)[None, :], (0, 0), 4)
        wear += detail
        # The photographed lower lip catches light at the rear. The bright
        # worn patches influence roughness and metalness as well as color.
        intensity = photo[..., :3] @ LUMA
        rubbed += np.clip((detail - .042) * 2.6, 0, .8) * np.clip((intensity - 53) / 27, 0, 1)
    weight = np.clip((.435 - along) / .112, 0, 1)
    weight = weight * weight * (3 - 2 * weight)

    # Sample the shared chart in its original orientation above the swivel ring.
    mapX = (1.025 + .95 * np.clip(arc, 0, 1)) * 1280 - .5
    mapY = (1 - (.30 + .665 * np.clip(along, 0, 1)) / 2) * 2160 - .5
    base, packed, normal = [cv2.remap(np.asarray(atlas), mapX, mapY, cv2.INTER_LINEAR).astype(np.float32)
                            for atlas in maps]
    front = visibleSectors["Front"]
    rear = visibleSectors["Rear"]
    palette = np.float32(spec["palette"]) + front[..., None] * np.float32(spec.get("frontTint", (0, 0, 0)))
    higherPaint = np.clip((along - .117) / .125, 0, 1)
    paintFade = higherPaint * (front * spec.get("frontPaintFade", 0) + rear * spec.get("rearPaintFade", 0))
    lip = np.clip((.126 - along) / .071, 0, 1) * rear * spec.get("rearLipGain", 0)
    color = palette * np.exp((wear * spec["grain"])[..., None])
    color *= 1 - paintFade[..., None]
    color += rubbed[..., None] * np.float32((16, 17, 17))
    color += lip[..., None] * np.float32((14, 13, 10))
    target = packed.copy()
    target[..., 1] = np.clip(spec["roughness"] + .18 * np.maximum(-wear, 0) - .26 * rubbed - .14 * lip, .25, .94) * 255
    target[..., 2] = np.clip(spec["metalness"] + .44 * rubbed + .08 * lip, .03, .88) * 255
    dy, dx = np.gradient(cv2.GaussianBlur(wear, (0, 0), .72))
    relief = np.stack((-dx * .55, dy * .55, np.ones_like(dx)), axis=-1)
    relief /= np.linalg.norm(relief, axis=-1, keepdims=True)
    mix = weight[..., None]
    for atlas, old, new in zip(maps, (base, packed, normal), (color, target, (relief + 1) * 127.5)):
        atlas.paste(Rgb(old + (new - old) * mix), (x, y))
    photoRegions["TripodSwivel"] = spec["rect"]


def BakeUpperCoverVideoDetail(maps, guide, registration):
    left, top, width, height = registration["rect"]
    if guide.size != (width, height):
        raise ValueError("The upper-cover guide does not match its atlas region")
    photo = np.asarray(guide, dtype=np.float32)
    wear, coverage = PhotoWear(photo)
    exposed = coverage > .76
    if not np.any(exposed):
        raise ValueError("The upper-cover guide has no observable paint")
    (color, packed, normal), _ = SamplePlanarRegion(maps, registration["rect"], registration["baselineUv"])
    support = cv2.GaussianBlur(coverage, (0, 0), 2.0)
    photographed = np.median(photo[exposed, :3], axis=0)
    neutral = np.median(color[exposed], axis=0)
    # Use the measured blue-grey cast and keep the camera's broad highlight
    # out of the base color. Fine stable marks modulate the underlying finish.
    tint = photographed / max(photographed @ LUMA, 1) * (neutral @ LUMA) * .85
    substrate = cv2.GaussianBlur(color, (0, 0), 6)
    observed = tint * np.exp((wear * 1.65)[..., None]) + .24 * (color - substrate)
    color += (observed - color) * support[..., None]
    rubbed = np.clip((wear - .05) * 3, 0, .55) * support
    dull = np.maximum(-wear, 0) * support
    for index, variation in ((1, dull * .15 - rubbed * .15), (2, rubbed * .19 - dull * .11)):
        channel = packed[..., index]
        calm = cv2.GaussianBlur(channel, (0, 0), 6)
        packed[..., index] = np.clip(channel + (calm - channel) * support * .65 + variation * 255, 0, 255)
    for destination, pixels in zip(maps, (color, packed, normal)):
        destination.paste(Rgb(pixels), (left, top))
    return {"UpperCover": registration["rect"]}


def BakeBrassBandWear(maps, guide, registration):
    left, top, width, height = registration["rect"]
    if guide.size != (width, height):
        raise ValueError("The brass-band guide does not match its atlas region")
    photo = np.asarray(guide, dtype=np.float32)
    coverage = photo[..., 3] / 255
    referenceLuma = registration["brassLuma"]
    if not np.any(coverage > .76) or not 0 < referenceLuma <= 255:
        raise ValueError("The brass-band guide has no observable patina")
    (color, packed, normal), _ = SamplePlanarRegion(maps, registration["rect"], registration["baselineUv"])
    # The upper stain is visible in both warm and cold light. Use the nearby
    # brass as the exposure reference and leave light streaks in the rendering.
    luma = photo[..., :3] @ LUMA
    relative = luma / referenceLuma
    oxide = cv2.GaussianBlur(np.clip((.89 - relative) / .61, 0, 1) * coverage, (0, 0), 1.25)
    exposed = cv2.GaussianBlur(np.clip((relative - .68) / .37, 0, 1) * coverage, (0, 0), 1.25)
    warmth = (photo[..., 0] - photo[..., 2]) / np.maximum(luma, 7)
    warmBrass = cv2.GaussianBlur(np.clip((warmth - .70) / .46, 0, 1) * coverage, (0, 0), 1.25)
    color *= 1 - oxide[..., None] * np.float32((.43, .55, .79))
    color += exposed[..., None] * np.float32((28, 18, -4))
    color += warmBrass[..., None] * np.float32((31, 21, -13))
    packed[..., 1] += oxide * (174 - packed[..., 1])
    packed[..., 2] += oxide * (168 - packed[..., 2])
    for destination, pixels in zip(maps, (color, packed, normal)):
        destination.paste(Rgb(pixels), (left, top))
    return {"BrassFaceBand": registration["rect"]}


def CorrectRegisteredMetalFinish(maps, rect, correctionPath, roughnessCeiling=216):
    left, top, width, height = rect
    with np.load(correctionPath, allow_pickle=False) as data:
        gain = np.asarray(data["baseLogGain"], dtype=np.float32)
        offset = np.asarray(data["tangentOffset"], dtype=np.float32)
        roughness = np.asarray(data["roughnessAdjust"], dtype=np.float32)
        metallic = np.asarray(data["metallicAdjust"], dtype=np.float32)
    shape = (height, width)
    expected = ((gain, (*shape, 3)), (offset, (*shape, 2)), (roughness, shape), (metallic, shape))
    if any(field.shape != dimensions or not np.isfinite(field).all() for field, dimensions in expected):
        raise ValueError("The finish correction does not match its registered atlas region")
    box = (left, top, left + width, top + height)
    color, packed, normals = [np.asarray(image.crop(box), dtype=np.float32) for image in maps]
    color *= np.exp(gain)
    packed[..., 1] = np.where(roughness != 0, np.clip(packed[..., 1] + 255 * roughness, 35, roughnessCeiling),
                              packed[..., 1])
    packed[..., 2] = np.where(metallic != 0, np.clip(packed[..., 2] + 255 * metallic, 0, 255),
                              packed[..., 2])
    vector = normals / 127.5 - 1
    vector[..., :2] += offset
    vector /= np.maximum(np.linalg.norm(vector, axis=-1, keepdims=True), .001)
    normal = np.where(np.any(offset != 0, axis=-1, keepdims=True), (vector + 1) * 127.5, normals)
    for atlas, pixels in zip(maps, (color, packed, normal)):
        atlas.paste(Rgb(pixels), (left, top))


def CorrectBrassBandFinish(maps, rect, correctionPath):
    CorrectRegisteredMetalFinish(maps, rect, correctionPath)


def BakeSeparateFinish(maps, photoRegions, part, settings, finish, wrap=False, matchEdges=False, rotateNormal=False):
    x, y, width, height = rect = tuple(settings["rect"])
    if min(x, y) < 0 or min(width, height) <= 14 or x + width > ATLAS_SIZE[0] or y + height > ATLAS_SIZE[1]:
        raise ValueError(f"The {part} chart falls outside the atlas")
    if any(x < left + w and x + width > left and y < top + h and y + height > top
           for left, top, w, h in photoRegions.values()):
        raise ValueError(f"The {part} chart overlaps an existing photo chart")
    samples, _ = SamplePlanarRegion(maps, rect, settings["baselineUv"], matchEdges=matchEdges)
    if rotateNormal:
        # The packed UV uses the original bitangent as +U and the original -tangent as +V.
        normals = samples[2]
        oldX = normals[..., 0].copy()
        normals[..., 0] = normals[..., 1]
        normals[..., 1] = 255 - oldX
    for atlas, pixels in zip(maps, samples):
        atlas.paste(Rgb(pixels), (x, y))
    CorrectRegisteredMetalFinish(maps, rect, finish, roughnessCeiling=244)
    if wrap:
        SealAngularChart(maps, rect)
    photoRegions[part] = rect


def BakeForelegWear(maps, photoRegions, guideDir):
    settings = json.loads((guideDir / "Data_Type30ForwardLegWear.json").read_text(encoding="utf-8"))
    alongMin, alongMax = settings["along"]
    arcMin, arcMax = settings["arc"]
    if not (0 <= alongMin < alongMax <= 1 and 0 <= arcMin < arcMax <= 1):
        raise ValueError("The left foreleg wear chart must sample inside the leg chart")
    x, y, width, height = photoRegions["LeftForwardLeg"]
    sourceWidth, sourceHeight = width - 14, height - 14
    atlasWidth, atlasHeight = ATLAS_SIZE
    settings["baselineUv"] = (
        ((alongMax - alongMin) * sourceWidth / atlasWidth, 0),
        (0, (arcMax - arcMin) * sourceHeight / atlasHeight),
        ((x + 7 + alongMin * sourceWidth) / atlasWidth, 1 - (y + 7 + arcMax * sourceHeight) / atlasHeight),
    )
    BakeSeparateFinish(maps, photoRegions, "LeftForwardLegWear", settings, guideDir / "Data_Type30ForwardLegWear.npz",
                       matchEdges=True)
    return {key: settings[key] for key in ("along", "arc")}


def BakeForelegWearDetail(maps, photoRegions, detailDir):
    part = "LeftForwardLegWear"
    if part not in photoRegions:
        raise ValueError("The denser foreleg finish requires the registered wear chart")
    sourceX, sourceY, sourceWidth, sourceHeight = photoRegions[part]
    settings = json.loads((detailDir / "Data_Type30ForelegWearDetail.json").read_text(encoding="utf-8"))
    x, y, width, height = rect = tuple(settings["rect"])
    if (min(x, y) < 0 or min(width, height, sourceWidth, sourceHeight) <= 14
            or x + width > ATLAS_SIZE[0] or y + height > ATLAS_SIZE[1]):
        raise ValueError("The denser foreleg wear chart falls outside the atlas")
    if any(x < left + w and x + width > left and y < top + h and y + height > top
           for left, top, w, h in photoRegions.values()):
        raise ValueError("The denser foreleg wear chart overlaps an existing photo chart")
    density = (width - 14) / (sourceWidth - 14)
    if density <= 1 or density != (height - 14) / (sourceHeight - 14):
        raise ValueError("The foreleg wear detail must enlarge both axes by the same ratio")

    # PhotoUv places the visible surface between the seven-pixel borders.
    # Sample the old chart at equivalent texel centers, including the borders.
    rows, columns = np.indices((height, width), dtype=np.float32)
    u = 6.5 + (columns - 6.5) / density
    v = 6.5 + (rows - 6.5) / density
    left, top = np.floor(u).astype(np.int32), np.floor(v).astype(np.int32)
    du, dv = (u - left)[..., None], (v - top)[..., None]
    for atlas in maps:
        old = np.float32(atlas.crop((sourceX, sourceY, sourceX + sourceWidth, sourceY + sourceHeight)))
        expanded = ((1 - du) * (1 - dv) * old[top, left] + du * (1 - dv) * old[top, left + 1]
                    + (1 - du) * dv * old[top + 1, left] + du * dv * old[top + 1, left + 1])
        atlas.paste(Rgb(expanded), (x, y))
    CorrectRegisteredMetalFinish(maps, rect, detailDir / "Data_Type30ForelegPhotoWear.npz",
                                 roughnessCeiling=244)
    wearRefinement = detailDir / "Data_Type30ForelegWearRadiometry.npz"
    if wearRefinement.is_file():
        CorrectRegisteredMetalFinish(maps, rect, wearRefinement, roughnessCeiling=244)
    photoRegions[part] = rect


def SealAngularChart(maps, rect, axis=1):
    # The longitudinal sides of the chart meet at the angular UV seam.
    # Match both filter footprints and taper their transition into the band.
    x, y, width, height = rect
    box = (x, y, x + width, y + height)
    size = width if axis == 1 else height
    columns = np.arange(size, dtype=np.float32)
    inside = np.minimum(columns - 7, size - 8 - columns)
    blend = np.clip(inside / 4, 0, 1)[None, :, None]
    for atlas in maps:
        image = np.moveaxis(np.asarray(atlas.crop(box), dtype=np.float32), axis, 1)
        joint = image[:, [6, 7, size - 8, size - 7]].mean(axis=1, keepdims=True)
        atlas.paste(Rgb(np.moveaxis(joint + (image - joint) * blend, 1, axis)), (x, y))


def BakeFrontHardwareFinish(maps, photoRegions, guideDir):
    settings = json.loads((guideDir / "Data_Type30FrontHardware.json").read_text(encoding="utf-8"))
    for part in ("MuzzleExteriorSide", "FrontShoulderSide", "HoseFittingSide", "HoseFerruleSide"):
        chart = settings[part]
        axis = chart["angularAxis"]
        if axis not in (0, 1):
            raise ValueError(f"Unexpected angular axis for {part}")
        BakeSeparateFinish(maps, photoRegions, part, chart, guideDir / f"Data_Type30{part}Finish.npz")
        for suffix in ("Refine", "Glints", "Surface", "Optics"):
            refinement = guideDir / f"Data_Type30{part}{suffix}.npz"
            if refinement.is_file():
                CorrectRegisteredMetalFinish(maps, photoRegions[part], refinement, roughnessCeiling=244)
        SealAngularChart(maps, photoRegions[part], axis)


def BakeRearJacketSideFinish(maps, photoRegions, guideDir):
    settings = json.loads((guideDir / "Data_Type30RearJacketSide.json").read_text(encoding="utf-8"))
    BakeSeparateFinish(maps, photoRegions, "RearJacketCollarSide", settings,
                       guideDir / "Data_Type30RearJacketSideFinish.npz", wrap=True)


def BakeRearGripFinish(maps, photoRegions, guideDir):
    settings = json.loads((guideDir / "Data_Type30GripFinish.json").read_text(encoding="utf-8"))
    BakeSeparateFinish(maps, photoRegions, "RearGripCollarRearFace", settings["face"],
                       guideDir / "Data_Type30RearGripFaceFinish.npz")
    BakeSeparateFinish(maps, photoRegions, "RearGripCollarSide", settings["side"],
                       guideDir / "Data_Type30RearGripSideFinish.npz", wrap=True)
    CorrectRegisteredMetalFinish(maps, settings["woodRect"], guideDir / "Data_Type30WalnutGripFinish.npz",
                                 roughnessCeiling=244)


def CorrectStandCollarFinish(maps, photoRegions, guideDir):
    files = [(part, guideDir / f"Data_Type30{part}Finish.npz") for part in STAND_COLLAR_FINISH]
    available = [(part, path) for part, path in files if path.is_file()]
    if not available:
        raise ValueError("The stand collar finish directory contains no collar corrections")
    for part, path in available:
        if part not in photoRegions:
            raise ValueError(f"The finish correction requires the registered chart for {part}")
        CorrectRegisteredMetalFinish(maps, photoRegions[part], path, roughnessCeiling=244)


def CorrectFrontCapFinish(maps, photoRegions, correctionPath):
    with np.load(correctionPath, allow_pickle=False) as data:
        gain = np.asarray(data["baseLogGain"], dtype=np.float32)
        roughness = np.asarray(data["roughnessShift"], dtype=np.float32)
        metallic = np.asarray(data["metallicShift"], dtype=np.float32)
        sideRect = [int(value) for value in data["plugSideRect"]]
        faceRect = [int(value) for value in data["plugFaceRect"]]
    shape = TILE_SIZE[::-1]
    fields = ((gain, (*shape, 3)), (roughness, shape), (metallic, shape))
    if any(field.shape != dimensions or not np.isfinite(field).all() for field, dimensions in fields):
        raise ValueError("The front cap correction does not match its atlas tile")

    # The small raised disc originally shares the plate's chart. Copy its
    # existing swatches before applying the plate's photographed wear.
    for name, rect, scale in (("UpperFaceCapSide", sideRect, 1), ("UpperFaceCapFace", faceRect, .27 / .46)):
        inset = (1 - scale) / 2
        sourceUv = (
            (.95 * scale / 3, 0),
            (0, .952 * scale / 2),
            ((2.025 + .95 * inset) / 3, (1.024 + .952 * inset) / 2),
        )
        samples, _ = SamplePlanarRegion(maps, rect, sourceUv)
        for atlas, pixels in zip(maps, samples):
            atlas.paste(Rgb(pixels), rect[:2])
        photoRegions[name] = rect

    width, height = TILE_SIZE
    left = width * 2
    box = (left, 0, left + width, height)
    color, packed = (np.asarray(atlas.crop(box), dtype=np.float32) for atlas in maps[:2])
    color *= np.exp(gain)
    packed[..., 1] = np.where(roughness != 0,
                              np.clip(packed[..., 1] + roughness * 255, 35, 221), packed[..., 1])
    packed[..., 2] = np.where(metallic != 0,
                              np.clip(packed[..., 2] + metallic * 255, 0, 255), packed[..., 2])
    maps[0].paste(Rgb(color), (left, 0))
    maps[1].paste(Rgb(packed), (left, 0))


def BakeHoseVideoDetail(maps, guide, registration):
    left, top, width, height = registration["rect"]
    if min(guide.size) < 30 or guide.width < guide.height:
        raise ValueError("Expected the hose guide with its length along the horizontal axis")
    logLuma = np.log(np.maximum(np.asarray(guide, dtype=np.float32) @ LUMA, 6))
    detail = cv2.GaussianBlur(logLuma, (0, 0), .74) - cv2.GaussianBlur(logLuma, (0, 0), 6)
    along, around = np.meshgrid((np.arange(width, dtype=np.float32) + .5 - 7) / (width - 14),
                                1 - (np.arange(height, dtype=np.float32) + .5 - 7) / (height - 14))
    first, last = registration["visibleAlong"]
    start, end = registration["atlasDetailAlong"]
    if not (0 < first < last < 1 and 0 < start < end < 1):
        raise ValueError("The hose video length ranges must be inside the UV interval")
    modelAlong = np.interp(along, (0, start, end, 1), (0, first, last, 1)).astype(np.float32)
    lengthPhase = (modelAlong - first) / (last - first)
    arcPhase = (registration["photoArcCenter"] - around) * 4 + .5
    # Mirror the evidenced rib and weave pattern past the photographed edges.
    # Four angular repeats close the UV seam without a discontinuity.
    imageX = (1 - np.abs(np.mod(lengthPhase, 2) - 1)) * (guide.width - 13) + 6
    imageY = (1 - np.abs(np.mod(arcPhase, 2) - 1)) * (guide.height - 9) + 4
    grain = cv2.remap(detail, imageX, imageY, cv2.INTER_LINEAR)
    grain = np.clip(grain, -.25, .24)
    # The grey-blue surface is a dielectric. Keep the cold window highlight
    # out of its pigment and use small normal changes for the raised ribs.
    color = np.float32((34, 37, 44)) * np.exp((grain * 4.25)[..., None])
    roughness = np.clip(.70 - grain * .90, .49, .89)
    packed = np.stack((np.ones_like(grain), roughness, np.zeros_like(grain)), axis=-1)
    dy, dx = np.gradient(cv2.GaussianBlur(grain, (0, 0), .5))
    normal = np.stack((-dx * 1.50, dy * 1.50, np.ones_like(grain)), axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    for destination, pixels in zip(maps, (color, packed * 255, (normal + 1) * 127.5)):
        destination.paste(Rgb(pixels), (left, top))
    return {"HangingHose": registration["rect"]}


def BakeMaps(inputPath, outputDir, guidePath, capWearPath, rearWearPath=None, registrationPath=None,
             videoGuidePath=None, videoRegistrationPath=None, jacketVideoPath=None,
             forelegVideoPath=None, forelegWindingPath=None, capVideoWearPath=None,
             upperCoverVideoPath=None, hoseVideoPath=None, upperVideoRegistrationPath=None,
             brassBandWearPath=None, brassBandRegistrationPath=None, rearJacketGuideDir=None,
             receiverTvGuideDir=None, farForelegVideoPath=None, farForelegWindingPath=None,
             standCollarGuideDir=None, swivelRingGuideDir=None, cradleTvGuideDir=None, rearFootGuideDir=None,
             jacketFinishCorrectionPath=None, swivelHousingGuideDir=None, brassBandCorrectionPath=None,
             frontCapCorrectionPath=None, forelegWarmCorrectionPath=None, standCollarFinishDir=None,
             nearShaftFinishPath=None, frontJacketFinishPath=None, tvJacketFinishPath=None,
             swivelRingFinishPath=None, leftReceiverFinishPath=None, rightReceiverFinishDir=None,
             rearJacketCapFinishPath=None, mountFinishDir=None, rearLegFinishPath=None, rearPlateFinishPath=None,
             rearJacketSideFinishDir=None, rearGripFinishDir=None, cradlePinFinishDir=None, forelegRearFinishDir=None,
             forelegWearDir=None, frontHardwareFinishDir=None, leftCradleFinishDir=None, farJacketFinishPath=None,
             forelegWearFinishPath=None, nearForelegWearFinishPath=None, forelegWearDetailDir=None):
    with Image.open(inputPath) as atlas:
        if atlas.size != ATLAS_SIZE:
            raise ValueError(f"Expected native {ATLAS_SIZE} Image 2.6 atlas, received {atlas.size}")
        atlas = atlas.convert("RGB")
    with Image.open(guidePath) as guide:
        if guide.size != (1920, 1080):
            raise ValueError(f"Expected the 1920 × 1080 reference guide, received {guide.size}")
        guide = guide.convert("RGB")
    with Image.open(capWearPath) as capPhoto:
        capWear = np.asarray(capPhoto.convert("RGBA").resize(TILE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32)
    if not np.any(capWear[..., 3] > 184):
        raise ValueError("The cap wear guide has no usable pixels")
    channels = ("BaseColor", "MetallicRoughness", "Normal")
    maps = [Image.new("RGB", ATLAS_SIZE) for _ in channels]
    width, height = TILE_SIZE
    tvJacketFinishes = tvJacketFinishPath if isinstance(tvJacketFinishPath, (list, tuple)) else (tvJacketFinishPath,)
    for index, finish in enumerate(FINISHES):
        col, row = index % 3, index // 3
        generated, colorGuide = Tile(atlas, col, row, 24), Tile(guide, col, row)
        mapsForTile = BakeTile(generated, colorGuide, finish, capWear if finish[0] == "BrassFace" else None)
        if finish[0] == "BrassFace" and capVideoWearPath is not None:
            with Image.open(capVideoWearPath) as photo:
                widerCap = np.asarray(photo.convert("RGBA").resize(TILE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32)
            mapsForTile = BakeCapVideoDetail(mapsForTile, generated, colorGuide, finish, capWear, widerCap)
        if finish[0] == "WaterJacket":
            if jacketVideoPath is not None:
                with Image.open(jacketVideoPath) as jacketVideo:
                    mapsForTile = BakeFrontJacketDetail(mapsForTile, jacketVideo.convert("RGBA"))
            if rearJacketGuideDir is not None:
                with Image.open(rearJacketGuideDir / "Reference_Type30RearJacketWall.png") as rearJacketWall:
                    mapsForTile = BakeJacketTvDetail(mapsForTile, rearJacketWall.convert("RGBA"),
                                                    pigmentStrength=67, replacement=.72, tint=(0, 5, 14))
            if jacketFinishCorrectionPath is not None:
                mapsForTile = CorrectJacketFinish(mapsForTile, jacketFinishCorrectionPath)
            for correctionPath in (frontJacketFinishPath, *tvJacketFinishes):
                if correctionPath is not None:
                    CorrectRegisteredMetalFinish(mapsForTile, (0, 0, width, height), correctionPath,
                                                 roughnessCeiling=237)
        for destination, tile in zip(maps, mapsForTile):
            destination.paste(tile, (width * col, height * row))
    photoRegions = {}
    manifest = {"photoRegions": photoRegions}
    if rearWearPath is not None:
        if registrationPath is None:
            raise ValueError("The rear-wear guide requires its Blender UV registration")
        with Image.open(rearWearPath) as rear, np.load(registrationPath) as registration:
            photoRegions.update(BakeRearDetails(maps, rear.convert("RGBA"), registration))
    if videoGuidePath is not None:
        if videoRegistrationPath is None:
            raise ValueError("The side video guide requires its Blender UV registration")
        mapping = json.loads(videoRegistrationPath.read_text(encoding="utf-8"))
        with Image.open(videoGuidePath) as video:
            photoRegions.update(BakeVideoPanels(maps, video.convert("RGBA"), mapping))
    if forelegVideoPath is not None:
        if forelegWindingPath is None:
            raise ValueError("The foreground-leg video requires its Blender winding record")
        winding = json.loads(forelegWindingPath.read_text(encoding="utf-8"))
        if winding["part"] != "RightForwardLeg":
            raise ValueError("The foreground-leg winding must identify the right forward shaft")
        with Image.open(forelegVideoPath) as foreleg:
            photoRegions.update(BakeForelegTvDetail(maps, foreleg.convert("RGBA"), winding))
    if farForelegVideoPath is not None:
        if farForelegWindingPath is None:
            raise ValueError("The far foreleg guide requires its winding record")
        winding = json.loads(farForelegWindingPath.read_text(encoding="utf-8"))
        if winding["part"] != "LeftForwardLeg":
            raise ValueError("The far foreleg winding must identify the left forward shaft")
        with Image.open(farForelegVideoPath) as farForeleg:
            photoRegions.update(BakeForelegTvDetail(maps, farForeleg.convert("RGBA"), winding))
    if upperCoverVideoPath is not None or hoseVideoPath is not None:
        if upperVideoRegistrationPath is None:
            raise ValueError("The upper video guides require their Blender UV registration")
        upperRegistration = json.loads(upperVideoRegistrationPath.read_text(encoding="utf-8"))
        if upperCoverVideoPath is not None:
            with Image.open(upperCoverVideoPath) as cover:
                photoRegions.update(BakeUpperCoverVideoDetail(maps, cover.convert("RGBA"), upperRegistration["UpperCover"]))
        if hoseVideoPath is not None:
            hoseRegistration = upperRegistration["HangingHose"]
            with Image.open(hoseVideoPath) as hose:
                photoRegions.update(BakeHoseVideoDetail(maps, hose.convert("RGB"), hoseRegistration))
            manifest["hoseLongitudinalUv"] = {key: hoseRegistration[key] for key in ("visibleAlong", "atlasDetailAlong")}
    if brassBandWearPath is not None:
        if brassBandRegistrationPath is None:
            raise ValueError("The brass-band guide requires its Blender UV registration")
        brassBandRegistration = json.loads(brassBandRegistrationPath.read_text(encoding="utf-8"))
        with Image.open(brassBandWearPath) as band:
            photoRegions.update(BakeBrassBandWear(maps, band.convert("RGBA"), brassBandRegistration))
    if brassBandCorrectionPath is not None:
        if "BrassFaceBand" not in photoRegions:
            raise ValueError("The lower brass correction requires the registered brass band guide")
        brassBandFinishes = (brassBandCorrectionPath if isinstance(brassBandCorrectionPath, (list, tuple))
                             else (brassBandCorrectionPath,))
        for correctionPath in brassBandFinishes:
            CorrectBrassBandFinish(maps, photoRegions["BrassFaceBand"], correctionPath)
    if rearJacketGuideDir is not None:
        path = rearJacketGuideDir / "Data_Type30RearJacketRegistration.json"
        rearFaceRect = json.loads(path.read_text(encoding="utf-8"))["rearFaceRect"]
        with Image.open(rearJacketGuideDir / "Reference_Type30RearJacketCap.png") as rearJacketCap:
            photoRegions.update(BakeRearJacketCap(maps, rearJacketCap.convert("RGBA"), rearFaceRect))
    if receiverTvGuideDir is not None:
        BakeReceiverTvFinish(maps, receiverTvGuideDir, photoRegions)
    if standCollarGuideDir is not None:
        BakeStandCollarTv(maps, standCollarGuideDir, photoRegions)
    if swivelRingGuideDir is not None:
        BakeSwivelRingPaint(maps, swivelRingGuideDir, photoRegions)
    if swivelHousingGuideDir is not None:
        BakeSwivelHousingPaint(maps, swivelHousingGuideDir, photoRegions)
    if cradleTvGuideDir is not None:
        BakeCradleTvFinish(maps, cradleTvGuideDir, photoRegions)
    if rearFootGuideDir is not None:
        BakeRearFootFinish(maps, rearFootGuideDir, photoRegions)
    if frontCapCorrectionPath is not None:
        CorrectFrontCapFinish(maps, photoRegions, frontCapCorrectionPath)
    for part, correctionPath in (("LeftForwardLeg", forelegWarmCorrectionPath),
                                 ("RightForwardLeg", nearShaftFinishPath)):
        if correctionPath is None:
            continue
        if part not in photoRegions:
            raise ValueError(f"The warm foreleg correction requires the registered guide for {part}")
        legFinishes = correctionPath if isinstance(correctionPath, (list, tuple)) else (correctionPath,)
        for path in legFinishes:
            CorrectRegisteredMetalFinish(maps, photoRegions[part], path, roughnessCeiling=244)
    if standCollarFinishDir is not None:
        collarFinishes = (standCollarFinishDir if isinstance(standCollarFinishDir, (list, tuple))
                          else (standCollarFinishDir,))
        for guideDir in collarFinishes:
            CorrectStandCollarFinish(maps, photoRegions, guideDir)
    if swivelRingFinishPath is not None:
        if "SwivelRing" not in photoRegions:
            raise ValueError("The swivel rim correction requires the registered rim guide")
        CorrectRegisteredMetalFinish(maps, photoRegions["SwivelRing"], swivelRingFinishPath, roughnessCeiling=244)
    if leftReceiverFinishPath is not None:
        if "LeftSidePanel" not in photoRegions:
            raise ValueError("The left receiver correction requires the registered panel guide")
        leftReceiverFinishes = (leftReceiverFinishPath if isinstance(leftReceiverFinishPath, (list, tuple))
                                else (leftReceiverFinishPath,))
        for correctionPath in leftReceiverFinishes:
            CorrectRegisteredMetalFinish(maps, photoRegions["LeftSidePanel"], correctionPath, roughnessCeiling=244)
    if rightReceiverFinishDir is not None:
        for part in RECEIVER_TV_FINISHES:
            if part not in photoRegions:
                raise ValueError(f"The right receiver correction requires the registered chart for {part}")
            correctionPath = rightReceiverFinishDir / f"Data_Type30{part}Finish.npz"
            CorrectRegisteredMetalFinish(maps, photoRegions[part], correctionPath, roughnessCeiling=244)
    if rearJacketCapFinishPath is not None:
        if "RearJacketCollarRearFace" not in photoRegions:
            raise ValueError("The rear copper face correction requires the registered face guide")
        CorrectRegisteredMetalFinish(maps, photoRegions["RearJacketCollarRearFace"], rearJacketCapFinishPath,
                                     roughnessCeiling=244)
    if mountFinishDir is not None:
        for part in ("RightCradleCheek", "TripodSwivel"):
            if part not in photoRegions:
                raise ValueError(f"The mount finish correction requires the registered chart for {part}")
            path = mountFinishDir / f"Data_Type30{part}Finish.npz"
            CorrectRegisteredMetalFinish(maps, photoRegions[part], path, roughnessCeiling=244)
    # Apply the rear corrections after the cap copies its swatch to preserve the sampling gutter.
    for part, finishPath in (("RearLeg", rearLegFinishPath), ("RearPlate", rearPlateFinishPath)):
        if finishPath is None:
            continue
        if part not in photoRegions:
            raise ValueError(f"The rear finish correction requires the registered chart for {part}")
        corrections = finishPath if isinstance(finishPath, (list, tuple)) else (finishPath,)
        for correctionPath in corrections:
            CorrectRegisteredMetalFinish(maps, photoRegions[part], correctionPath, roughnessCeiling=244)
    if rearJacketSideFinishDir is not None:
        BakeRearJacketSideFinish(maps, photoRegions, rearJacketSideFinishDir)
    if rearGripFinishDir is not None:
        BakeRearGripFinish(maps, photoRegions, rearGripFinishDir)
    if cradlePinFinishDir is not None:
        settings = json.loads((cradlePinFinishDir / "Data_Type30CradleCrossPin.json").read_text(encoding="utf-8"))
        BakeSeparateFinish(maps, photoRegions, "CradleCrossPinSide", settings,
                           cradlePinFinishDir / "Data_Type30CradleCrossPinFinish.npz", wrap=True)
    if forelegRearFinishDir is not None:
        # The rear jacket collar samples its padding before this leg correction.
        for part in ("LeftForwardLeg", "RightForwardLeg"):
            if part not in photoRegions:
                raise ValueError(f"The rear-view foreleg correction requires the registered chart for {part}")
            correction = forelegRearFinishDir / f"Data_Type30{part}RearFinish.npz"
            CorrectRegisteredMetalFinish(maps, photoRegions[part], correction, roughnessCeiling=244)
    if forelegWearDir is not None:
        manifest["leftForelegWear"] = BakeForelegWear(maps, photoRegions, forelegWearDir)
    if frontHardwareFinishDir is not None:
        BakeFrontHardwareFinish(maps, photoRegions, frontHardwareFinishDir)
    if leftCradleFinishDir is not None:
        settings = json.loads((leftCradleFinishDir / "Data_Type30LeftCradleFinish.json").read_text(encoding="utf-8"))
        BakeSeparateFinish(maps, photoRegions, "LeftCradleCheek", settings,
                           leftCradleFinishDir / "Data_Type30LeftCradleFinish.npz", rotateNormal=True)
    if farJacketFinishPath is not None:
        # Detail charts have already sampled their padding from the shared atlas.
        farJacketFinishes = (farJacketFinishPath if isinstance(farJacketFinishPath, (list, tuple))
                             else (farJacketFinishPath,))
        for correctionPath in farJacketFinishes:
            CorrectRegisteredMetalFinish(maps, (0, 0, *TILE_SIZE), correctionPath, roughnessCeiling=237)
    for part, correctionPath in (("LeftForwardLegWear", forelegWearFinishPath),
                                 ("RightForwardLeg", nearForelegWearFinishPath)):
        if correctionPath is None:
            continue
        if part not in photoRegions:
            raise ValueError(f"The foreleg wear correction requires the {part} atlas chart")
        CorrectRegisteredMetalFinish(maps, photoRegions[part], correctionPath, roughnessCeiling=244)
    if forelegWearDetailDir is not None:
        BakeForelegWearDetail(maps, photoRegions, forelegWearDetailDir)
        for filename in ("Data_Type30ForelegPaintTransition.npz", "Data_Type30ForelegFullFinish.npz",
                         "Data_Type30ForelegSharedPatina.npz", "Data_Type30ForelegMeasuredSurface.npz",
                         "Data_Type30ForelegBrightWear.npz"):
            paintCorrection = forelegWearDetailDir / filename
            if paintCorrection.is_file():
                CorrectRegisteredMetalFinish(maps, photoRegions["LeftForwardLeg"], paintCorrection,
                                             roughnessCeiling=244)
    outputDir.mkdir(parents=True, exist_ok=True)
    for channel, image in zip(channels, maps):
        path = outputDir / f"Texture_Type30Hmg{channel}.png"
        image.save(path, compress_level=7)
        print(f"{path} · {image.width}x{image.height}")
    (outputDir / "Data_Type30HmgAtlas.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--guide", required=True, type=Path)
    parser.add_argument("--cap-wear", required=True, type=Path)
    parser.add_argument("--rear-wear", type=Path)
    parser.add_argument("--rear-registration", type=Path)
    parser.add_argument("--video-wear", type=Path)
    parser.add_argument("--video-registration", type=Path)
    parser.add_argument("--jacket-video-detail", type=Path)
    parser.add_argument("--foreleg-video-detail", type=Path)
    parser.add_argument("--foreleg-winding", type=Path)
    parser.add_argument("--cap-video-wear", type=Path)
    parser.add_argument("--upper-cover-video-detail", type=Path)
    parser.add_argument("--hose-video-detail", type=Path)
    parser.add_argument("--upper-video-registration", type=Path)
    parser.add_argument("--brass-band-wear", type=Path)
    parser.add_argument("--brass-band-registration", type=Path)
    parser.add_argument("--rear-jacket-guide-dir", type=Path)
    parser.add_argument("--rear-jacket-cap-finish-correction", type=Path,
                        help="Apply measured finish corrections to the rear copper face.")
    parser.add_argument("--rear-jacket-side-finish-dir", type=Path,
                        help="Bake the registered cylindrical finish next to the rear copper face.")
    parser.add_argument("--rear-grip-finish-dir", type=Path,
                        help="Apply the measured grip wood and adjacent metal finishes.")
    parser.add_argument("--cradle-pin-finish-dir", type=Path,
                        help="Bake the registered paint and wear on the upper cradle pin.")
    parser.add_argument("--foreleg-rear-finish-dir", type=Path,
                        help="Apply the rear-view paint and wear corrections to both forward legs.")
    parser.add_argument("--foreleg-wear-dir", type=Path,
                        help="Bake the higher density wear chart for the visible rear surface of the left foreleg.")
    parser.add_argument("--front-hardware-finish-dir", type=Path,
                        help="Bake the separate exterior metal finishes at the front of the prop.")
    parser.add_argument("--left-cradle-finish-dir", type=Path,
                        help="Bake the photographed finish on the left cradle plate.")
    parser.add_argument("--receiver-finish-guide-dir", type=Path)
    parser.add_argument("--left-receiver-finish-correction", type=Path, action="append",
                        help="Apply measured left panel corrections. Repeat to apply more corrections in order.")
    parser.add_argument("--right-receiver-finish-dir", type=Path,
                        help="Apply measured finish corrections to the three right receiver charts.")
    parser.add_argument("--far-foreleg-video-detail", type=Path)
    parser.add_argument("--far-foreleg-winding", type=Path)
    parser.add_argument("--stand-collar-guide-dir", type=Path)
    parser.add_argument("--swivel-ring-guide-dir", type=Path)
    parser.add_argument("--swivel-ring-finish-correction", type=Path,
                        help="Apply measured paint and reflection corrections to the swivel rim.")
    parser.add_argument("--cradle-finish-guide-dir", type=Path)
    parser.add_argument("--mount-finish-dir", type=Path,
                        help="Apply the measured cradle and swivel finish corrections.")
    parser.add_argument("--rear-foot-guide-dir", type=Path)
    parser.add_argument("--rear-leg-finish-correction", type=Path, action="append",
                        help="Apply measured paint and wear corrections to the rear leg chart. "
                             "Repeat to apply more corrections in order.")
    parser.add_argument("--rear-plate-finish-correction", type=Path,
                        help="Apply measured paint and reflection corrections to the rear plate chart.")
    parser.add_argument("--jacket-finish-correction", type=Path)
    parser.add_argument("--swivel-housing-guide-dir", type=Path)
    parser.add_argument("--brass-band-finish-correction", type=Path, action="append",
                        help="Apply a brass-band correction. Repeat to apply more corrections in order.")
    parser.add_argument("--front-cap-finish-correction", type=Path)
    parser.add_argument("--warm-foreleg-finish-correction", type=Path, action="append",
                        help="Apply a far foreleg correction. Repeat to apply more corrections in order.")
    parser.add_argument("--stand-collar-finish-dir", type=Path, action="append",
                        help="Apply corrections to the stand collars. Repeat to apply more corrections in order.")
    parser.add_argument("--warm-near-shaft-finish-correction", type=Path, action="append",
                        help="Apply a near foreleg correction. Repeat to apply more corrections in order.")
    parser.add_argument("--front-jacket-finish-correction", type=Path)
    parser.add_argument("--tv-jacket-finish-correction", type=Path, action="append",
                        help="Apply a jacket correction. Repeat to apply more corrections in order.")
    parser.add_argument("--jacket-surface-finish-correction", "--far-jacket-finish-correction",
                        dest="far_jacket_finish_correction", type=Path, action="append",
                        help="Apply a water-jacket surface correction after building the detail charts. "
                             "Repeat to apply more corrections in order.")
    parser.add_argument("--foreleg-wear-finish-correction", type=Path,
                        help="Apply a final color or finish correction to the registered foreleg wear chart.")
    parser.add_argument("--near-foreleg-wear-finish-correction", type=Path,
                        help="Apply a final finish correction to the near foreleg chart.")
    parser.add_argument("--foreleg-wear-detail-dir", type=Path,
                        help="Repack the finished foreleg wear chart at a higher density and apply its detail correction.")
    options = parser.parse_args()
    BakeMaps(options.input, options.output, options.guide, options.cap_wear, options.rear_wear, options.rear_registration,
             options.video_wear, options.video_registration, options.jacket_video_detail,
             options.foreleg_video_detail, options.foreleg_winding, options.cap_video_wear,
             options.upper_cover_video_detail, options.hose_video_detail, options.upper_video_registration,
             options.brass_band_wear, options.brass_band_registration, options.rear_jacket_guide_dir,
             options.receiver_finish_guide_dir, options.far_foreleg_video_detail, options.far_foreleg_winding,
             options.stand_collar_guide_dir, options.swivel_ring_guide_dir, options.cradle_finish_guide_dir,
             options.rear_foot_guide_dir, options.jacket_finish_correction, options.swivel_housing_guide_dir,
             options.brass_band_finish_correction, options.front_cap_finish_correction,
             options.warm_foreleg_finish_correction, options.stand_collar_finish_dir,
             options.warm_near_shaft_finish_correction, options.front_jacket_finish_correction,
             options.tv_jacket_finish_correction, options.swivel_ring_finish_correction,
             options.left_receiver_finish_correction, options.right_receiver_finish_dir,
             options.rear_jacket_cap_finish_correction, options.mount_finish_dir, options.rear_leg_finish_correction,
             options.rear_plate_finish_correction, options.rear_jacket_side_finish_dir, options.rear_grip_finish_dir,
             options.cradle_pin_finish_dir, options.foreleg_rear_finish_dir, options.foreleg_wear_dir,
             options.front_hardware_finish_dir, options.left_cradle_finish_dir, options.far_jacket_finish_correction,
             options.foreleg_wear_finish_correction, options.near_foreleg_wear_finish_correction,
             options.foreleg_wear_detail_dir)
