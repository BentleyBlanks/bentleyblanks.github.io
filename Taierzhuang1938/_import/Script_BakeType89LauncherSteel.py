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
    "Barrel": (0, (163, 160, 151), (72, 67, 59), .63, (.205, .53), (.99, .68), .64),
    "Stem": (1, (155, 150, 138), (64, 56, 48), .57, (.31, .62), (.96, .48), .71),
    "Collar": (0, (180, 177, 164), (82, 72, 62), .50, (.215, .54), (.98, .53), .43),
    "Knurl": (3, (155, 154, 148), (63, 57, 49), .49, (.34, .64), (.95, .44), .79),
    "Sleeve": (1, (129, 125, 114), (48, 42, 37), .63, (.36, .65), (.94, .42), .62),
    "Saddle": (2, (119, 130, 136), (68, 60, 48), .59, (.48, .76), (.88, .34), .92),
    "Tab": (2, (154, 151, 141), (66, 57, 48), .53, (.35, .66), (.97, .43), .74),
    "SaddleBack": (2, (115, 119, 114), (62, 53, 44), .66, (.51, .78), (.88, .32), .86),
    "Edge": (0, (182, 179, 165), (71, 61, 50), .36, (.255, .59), (.98, .43), .49),
    "Neck": (2, (148, 144, 131), (60, 51, 43), .55, (.34, .70), (.94, .34), .77),
    "Recess": (1, (41, 39, 36), (24, 22, 20), .61, (.67, .85), (.32, .16), .28),
    "Stripe": (0, (154, 149, 134), (87, 78, 66), .23, (.62, .77), (.11, .07), .48),
    "Channel": (1, (73, 69, 60), (32, 28, 24), .58, (.49, .81), (.77, .22), .60),
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


def Engraving(size, center, width, height):
    """Shallow visible object serial 44023, as photographed near the collars."""
    paths = {
        "4": [[(.72, .06), (.05, .68), (.91, .68)], [(.70, .06), (.70, .94)]],
        "0": [[(.50, .06), (.22, .13), (.11, .38), (.11, .72), (.26, .92), (.51, .95),
               (.76, .88), (.88, .67), (.88, .32), (.72, .11), (.50, .06)]],
        "2": [[(.15, .23), (.24, .12), (.50, .08), (.76, .16), (.84, .31), (.77, .48),
               (.27, .72), (.12, .92), (.87, .92)]],
        "3": [[(.14, .18), (.32, .08), (.64, .09), (.83, .20), (.79, .36), (.58, .47),
               (.38, .49), (.63, .50), (.84, .65), (.85, .80), (.69, .91), (.38, .95), (.15, .84)]],
    }
    w, h = size
    image = Image.new("L", size)
    draw = ImageDraw.Draw(image)
    step = width * w / 5
    height *= h
    x, y = center[0] * w - 2.5 * step, center[1] * h - height * .5
    for index, digit in enumerate("44023"):
        for stroke in paths[digit]:
            closest = [(x + step * (index + px * .83), y + py * height) for px, py in stroke]
            draw.line(closest, fill=255, width=max(1, round(height * .063)), joint="curve")
    return np.asarray(image.filter(ImageFilter.GaussianBlur(max(.5, height * .022))), dtype=np.float32) / 255


def SampleTile(sample, width, height, index):
    # Select different crops inside each sample and keep the original broad
    # variation continuous across a region.
    edge = sample.width // 6
    if index:
        x, y = index * 97 % edge, index * 73 % edge
        sample = sample.crop((x, y, x + sample.width - edge, y + sample.height - edge))
    return np.asarray(sample.resize((width, height), Image.Resampling.LANCZOS), dtype=np.float32) / 255


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
    srgb = SampleTile(sample[0 if name == "Knurl" else sourceIndex], width, height, index)
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
    if name == "Barrel":
        evidence = ReferenceField(reference, xx, vv, "relativeLuminance")
        heat = ReferenceField(reference, xx, vv, "relativeWarmth")
        oxidation += np.clip(-evidence / 183, -.13, .13) + np.clip(heat / 161, -.08, .08)
        tonalDelta += evidence * .39
        tonalDelta += 1.7 * np.sin(2 * np.pi * (177 * vv + .12 * medium))
        warmth += heat / 330
        # The photographed barrel retains a mottled blue-gray finish across the
        # middle of the visible arc and worn-through steel outside that patch.
        blue = np.exp(-(((xx - .397) / .14) ** 2 + ((vv - .46) / .47) ** 2))
        oxidation += .090 * blue
        warmth -= .021 * blue
    if name in ("Saddle", "SaddleBack"):
        # The reference shoe has warmer wear toward its lower corner and a
        # more graphite-colored center. Neither is a painted shadow.
        warmth += .06 * np.exp(-(((xx - .74) / .24) ** 2 + ((yy - .28) / .29) ** 2))
        oxidation += .11 * np.exp(-(((xx - .76) / .23) ** 2 + ((yy - .31) / .25) ** 2))
    if name == "Sleeve":
        # The thin brown residue at the stem-side shoulder is visible on the
        # overall and side close-ups of the same object.
        shoulder = np.exp(-((vv - .101) / .032) ** 2)
        warmth += .108 * shoulder
        oxidation += .13 * shoulder

    heightField = strength * (.23 * detail + .17 * medium - .22 * pits)
    if name == "Knurl":
        left = np.abs(np.sin(np.pi * (54 * xx + 25 * vv)))
        right = np.abs(np.sin(np.pi * (54 * xx - 25 * vv)))
        diamonds = np.minimum(left, right) ** .84
        tonalDelta += (diamonds - .38) * 10.0
        heightField += diamonds * .88
        oxidation += (.38 - diamonds) * .17
    if name == "Channel":
        shadowRibs = np.maximum(0, np.cos(2 * np.pi * (44 * vv + xx * .18))) ** 7
        tonalDelta += 18 * shadowRibs
        heightField += .31 * shadowRibs
    if name in ("Barrel", "Neck"):
        stamp = (Engraving(size, (.398, .190), .245, .026) if name == "Barrel"
                 else Engraving(size, (.424, .55), .23, .072))
        rim = GaussianPeriodic(stamp, 1.5) - stamp * .54
        heightField -= .57 * stamp
        tonalDelta += 6 * rim - 10 * stamp
        oxidation += .15 * stamp

    oxidation = np.clip(oxidation, .025, .964)
    mix = oxidation[..., None].astype(np.float32)
    clean = SrgbToLinear(np.asarray(metalColor, dtype=np.float32) / 255)
    oxide = SrgbToLinear(np.asarray(oxideColor, dtype=np.float32) / 255)
    base = LinearToSrgb((1 - mix) * clean + mix * oxide)
    base += tonalDelta[..., None] / 255 + warmth[..., None] * np.array([.39, .055, -.27])
    rough = roughness[0] + (roughness[1] - roughness[0]) * oxidation + .028 * medium + .020 * pits
    metal = metalness[0] + (metalness[1] - metalness[0]) * oxidation
    ao = 1 - .019 * pits - (.087 if name in ("Recess", "Channel") else .016) * oxidation
    heightField = np.clip(heightField * (.54 + .46 * oxidation), -1.5, 1.5)
    if name in ("Barrel", "Collar", "Knurl", "Sleeve", "Neck"):
        base = SeamBlend(base)
        heightField = SeamBlend(heightField[..., None])[..., 0]
        rough, metal, ao = np.moveaxis(SeamBlend(np.stack([rough, metal, ao], axis=-1)), -1, 0)
    normal = NormalFromHeight(GaussianPeriodic(heightField, .72), .00012, .12, 1.0, "gl") * .5 + .5
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
        tile = BakeRegion(name, quadrants, (width, height), index, reference)
        for atlas, pixels in zip(maps, tile):
            atlas[y:y + height, x:x + width] = pixels

    for channel, pixels, outputSize, quality in zip(("Base", "Normal", "Orm"), maps, (2048, 2048, 1024), (84, 88, 87)):
        image = Image.fromarray(pixels)
        if outputSize != size:
            image = image.resize((outputSize, outputSize), Image.Resampling.BOX)
        image.save(HERE.parent / "Texture" / f"Texture_{STEM}{channel}.webp", method=6, quality=quality)
    subprocess.run([sys.executable, str(HERE / "Script_BakePbrTexture.py"), "--audit", "--name", STEM], check=True)
    recordPath = HERE / "TextureBakes" / f"Texture_{STEM}.json"
    record = json.loads(recordPath.read_text(encoding="utf-8"))
    record["source"] = {"path": SOURCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(SOURCE)}
    record["reference"] = {"path": REFERENCE.relative_to(HERE.parent).as_posix(), "sha256": Sha256(REFERENCE)}
    recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    Bake()
