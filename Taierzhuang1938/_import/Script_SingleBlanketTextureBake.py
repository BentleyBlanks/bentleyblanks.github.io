"""Canonicalize the approved imagegen cloth atlas and bake its PBR/mask maps.

Python 3 + numpy + Pillow. This is an author UV atlas, never a repeating tile.
The source PNG is a physical 1.4 x 1.9 m rectangle encoded into square UV space;
that affine encoding restores the original yarn aspect ratio on the model.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

projectDir = Path(__file__).resolve().parents[1]
sourcePath = projectDir / "_import/Source/SingleBlanket/Texture_SingleBlanketSource.png"
referencePath = sourcePath.with_name("Texture_SingleBlanketApprovedReference.png")
alphaPath = sourcePath.with_name("Texture_SingleBlanketReferenceAlpha.png")


def ProjectApprovedReference():
    """UV material projection of the approved imagegen pixels; no repainting."""
    with Image.open(referencePath) as reference:
        color = reference.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)
    with Image.open(alphaPath) as originalAlpha:
        alpha = originalAlpha.convert("L").resize((1024, 1024), Image.Resampling.LANCZOS)
    color.putalpha(alpha)
    color.save(sourcePath, optimize=True)
    print(json.dumps({"referenceProjection": str(referencePath), "alpha": str(alphaPath), "atlas": str(sourcePath)}))


def PrepareSource(inputPath):
    with Image.open(inputPath) as sourceImage:
        rgba = np.asarray(sourceImage.convert("RGBA"))
    foreground = rgba[..., 3] > 24
    rows, columns = np.nonzero(foreground)
    if not len(rows):
        raise ValueError("Generated source has no visible cloth")
    cropBox = (int(columns.min()), int(rows.min()), int(columns.max()) + 1, int(rows.max()) + 1)
    atlasImage = Image.fromarray(rgba).crop(cropBox).resize((1024, 1024), Image.Resampling.LANCZOS)
    atlas = np.asarray(atlasImage).copy()
    # Keep invisible RGB neutral; black outside the alpha would contaminate the
    # derivative normal map, colour metrics and bilinear edge sampling.
    bodyRgb = np.median(atlas[atlas[..., 3] > 250, :3], axis=0).astype(np.uint8)
    atlas[atlas[..., 3] < 8, :3] = bodyRgb
    sourcePath.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas).save(sourcePath, optimize=True)
    print(json.dumps({"crop": cropBox, "canonicalSource": str(sourcePath), "size": [1024, 1024]}))


def BakeMask():
    # Image top is the head (-Y). Pelvis y=+0.05 maps to image y=0.5263.
    rng = np.random.default_rng(19380317)
    y, x = np.mgrid[0:1024, 0:1024] / 1023.0
    coarse = Image.fromarray(np.uint8(rng.random((64, 64)) * 255)).resize((1024, 1024), Image.Resampling.BICUBIC)
    noise = np.asarray(coarse, dtype=np.float64) / 255.0
    edge = np.minimum.reduce([x, 1-x, y, 1-y])
    mud = np.clip((0.15-edge) / 0.15, 0, 1) * (0.28 + 0.72*noise)
    mud = np.maximum(mud, np.exp(-((y-0.93)/0.15)**2) * (0.22+0.65*noise))
    blood = np.zeros_like(x)
    for centerX, centerY, radiusX, radiusY, amount in [
        (0.50, 0.52, 0.13, 0.09, 0.90),
        (0.49, 0.44, 0.16, 0.13, 1.00),
        (0.52, 0.33, 0.11, 0.11, 0.72),
    ]:
        blob = np.exp(-2.0*(((x-centerX)/radiusX)**2+((y-centerY)/radiusY)**2))
        blood = np.maximum(blood, amount*blob)
    blood = np.clip(blood * (0.63+0.52*noise), 0, 1)
    mask = np.stack([mud, blood, np.zeros_like(x)], axis=2)
    maskPath = projectDir / "Texture/Texture_SingleBlanketMask.webp"
    Image.fromarray(np.uint8(np.clip(mask, 0, 1)*255+0.5)).save(maskPath, lossless=True, method=6)
    print(json.dumps({"mask": str(maskPath), "channels": "R=mud G=blood B=0", "size": [1024, 1024]}))


def Blur(field, sigma):
    """Separable Gaussian with edge padding (numpy only)."""
    radius = int(3*sigma)+1
    kernel = np.exp(-np.arange(-radius, radius+1)**2/(2*sigma*sigma))
    kernel /= kernel.sum()
    for axis in (0, 1):
        field = np.apply_along_axis(lambda v: np.convolve(np.pad(v, radius, mode="edge"), kernel, "valid"), axis, field)
    return field


def FinishBase():
    """2026-10-23 cloth pass on the baked base colour (user: it reads as a hide, not cloth).

    1. The approved imagegen pixels carry a squiggly embossed light/shadow pattern (about 3-10 px) across
       the plain cloth; at close range it reads as leather/parchment. Keep the 5 px low-pass luminance
       (stains, wear, patch tone) and only 30% of the finer detail on the bright cloth body; the darker
       patches and their stitches keep full detail. Hue and saturation are untouched (RGB scaled by luminance).
    2. Opaque: the mesh is now a 1.4 cm shell with a rounded hem, so alpha cut-outs would show a hollow
       edge. The 3-4.5 cm frayed transparent border is filled by push-pull from the nearest cloth and becomes
       a folded hem: slightly darker band, a running stitch 1.5 cm in.
    """
    basePath = projectDir / "Texture/Texture_SingleBlanketBase.webp"
    with Image.open(basePath) as image:
        rgba = np.asarray(image.convert("RGBA")).astype(np.float64)/255
    rgb, alpha = rgba[..., :3], rgba[..., 3]
    weights = np.array([0.2126, 0.7152, 0.0722])
    luminance = rgb @ weights
    low = Blur(luminance, 5.0)
    body = np.clip((Blur(low, 6.0)-0.50)/0.05, 0, 1)
    keep = 0.30+0.70*(1-body)
    target = low+(luminance-low)*keep
    rgb = np.clip(rgb*((target+1e-4)/(luminance+1e-4))[..., None], 0, 1)
    # Push-pull fill of the transparent border from opaque cloth.
    solid = (alpha > 0.5).astype(np.float64)
    filled = rgb*solid[..., None]
    weight = solid.copy()
    for sigma in (2, 4, 8, 16, 32):
        blurredWeight = Blur(weight, sigma)
        blurred = np.stack([Blur(filled[..., k], sigma) for k in range(3)], -1)/np.maximum(blurredWeight, 1e-6)[..., None]
        hole = weight < 0.999
        filled[hole] = blurred[hole]*np.minimum(1, blurredWeight[hole]*4)[..., None] + filled[hole]*(1-np.minimum(1, blurredWeight[hole]*4))[..., None]
        weight = np.maximum(weight, np.minimum(1, blurredWeight*4))
    rgb = rgb*solid[..., None]+filled*(1-solid[..., None])
    # Hem: distance to the UV edge in metres (U spans 1.4 m, V spans 1.9 m).
    size = rgb.shape[0]
    v, u = (np.mgrid[0:size, 0:size]+0.5)/size
    edgeM = np.minimum.reduce([u*1.40, (1-u)*1.40, v*1.90, (1-v)*1.90])
    wobble = Blur(np.random.default_rng(19381023).random((size, size)), 3.0)
    hem = np.clip((0.028+0.004*(wobble-0.5)/0.08-edgeM)/0.008, 0, 1)
    rgb *= (1-0.06*hem)[..., None]
    along = np.where(np.minimum(u*1.40, (1-u)*1.40) < np.minimum(v*1.90, (1-v)*1.90), v*1.90, u*1.40)
    stitch = np.exp(-0.5*((edgeM-0.017)/0.0011)**2)*(np.sin(along/0.009*np.pi) > 0.1)
    rgb = rgb*(1-0.12*stitch[..., None])+np.array([0.78, 0.74, 0.68])*0.12*stitch[..., None]
    out = np.dstack([rgb, np.ones_like(alpha)])
    Image.fromarray(np.uint8(np.clip(out, 0, 1)*255+0.5)).convert("RGB").save(basePath, quality=90, method=6)
    return {"base": basePath.relative_to(projectDir).as_posix(), "fineDetailKeptOnBody": 0.30, "alpha": "opaque",
            "hem": {"widthM": 0.028, "darken": 0.06, "stitchFromEdgeM": 0.017, "stitchPitchM": 0.018}}


def BakeDetailNormal():
    """Tiling cloth detail normal (2026-10-23): 0.25 m square, soft crease ridges + ~2 mm plain weave.

    The cloth solver moves 216 bones 11-13 cm apart, so creases finer than that can only come from the
    shading. The material repeats this map with KHR_texture_transform (5.6 x 7.6 across the 1.4 x 1.9 m UV).
    OpenGL convention (+Y up), lossless.
    """
    size, tileM = 512, 0.25
    pixelM = tileM/size
    rng = np.random.default_rng(19380317)
    y, x = np.mgrid[0:size, 0:size].astype(np.float64)
    height = np.zeros((size, size))
    for _ in range(110):
        centerX, centerY = rng.random()*size, rng.random()*size
        angle = rng.choice([0.25, 1.75])+rng.normal(0, 0.35)
        length = rng.uniform(0.025, 0.09)/pixelM
        width = rng.uniform(0.0025, 0.007)/pixelM
        amount = rng.uniform(0.25, 0.7)*0.001*rng.choice([1, -1], p=[0.6, 0.4])
        bend = rng.normal(0, 0.3)
        c, s = np.cos(angle), np.sin(angle)
        dx = (x-centerX+size/2) % size-size/2
        dy = (y-centerY+size/2) % size-size/2
        along = dx*c+dy*s
        across = -dx*s+dy*c-0.004*along*along/width*bend
        taper = np.clip(1-(along/(length/2))**2, 0, 1)**1.5
        height += amount*taper*np.exp(-0.5*(across/width)**2)
    pitch = 4
    over = (x//pitch+y//pitch) % 2 == 0
    warp = np.sin(np.pi*((x % pitch)+0.5)/pitch)*np.sin(np.pi*((y % (2*pitch))+0.5)/(2*pitch))
    weft = np.sin(np.pi*((y % pitch)+0.5)/pitch)*np.sin(np.pi*((x % (2*pitch))+0.5)/(2*pitch))
    height += np.where(over, warp, weft)*0.00010
    gradX = (np.roll(height, -1, 1)-np.roll(height, 1, 1))/(2*pixelM)
    gradY = (np.roll(height, -1, 0)-np.roll(height, 1, 0))/(2*pixelM)
    normal = np.stack([-gradX, gradY, np.ones_like(height)], -1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    path = projectDir / "Texture/Texture_SingleBlanketDetailNormal.webp"
    Image.fromarray(np.uint8(np.clip(normal*0.5+0.5, 0, 1)*255+0.5)).save(path, lossless=True, method=6)
    slope = np.degrees(np.arccos(normal[..., 2]))
    return {"detailNormal": path.relative_to(projectDir).as_posix(), "size": [size, size], "tileM": tileM,
            "creases": 110, "weavePitchM": pitch*pixelM, "slopeDegP95": round(float(np.percentile(slope, 95)), 2), "convention": "gl"}


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Optional alternate imagegen RGBA; default projects the committed approved reference and alpha")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.source:
        PrepareSource(args.source)
    elif not args.dry_run:
        ProjectApprovedReference()
    if not sourcePath.exists():
        raise FileNotFoundError(sourcePath)
    command = [sys.executable, str(projectDir / "_import/Script_BakePbrTexture.py"),
        "--source", str(sourcePath), "--name", "SingleBlanket", "--preset", "singleBlanketAtlas",
        "--tile-m", "1.630950643", "--size", "1024", "--data-size", "1024",
        "--pack", "orm", "--seamless", "none", "--no-flatten", "--keep-alpha",
        # Approved V3 cloth crop's display palette: warm gray-brown, without
        # the previous cool/green bias. These are image sRGB statistics, not
        # a measured historical albedo. Full strength avoids source mean leak.
        "--mean", "0.655,0.601,0.548", "--contrast", "0.075", "--tone-strength", "1.0",
        "--normal-convention", "gl", "--relief-m", "0.00006", "--normal-strength", "0.8",
        "--rough", "0.92", "--rough-var", "0.006", "--rough-min", "0.85", "--ao", "0.04", "--metal", "0",
        "--base-quality", "90", "--data-quality", "90", "--data-lossless",
        "--uv-atlas-reason", "One non-repeating 1.4x1.9m worn sheet, five user-approved repair patches; square UV encoding compensates the physical cloth aspect ratio",
        "--strict"]
    if args.dry_run:
        command.append("--dry-run")
    subprocess.run(command, check=True)
    if not args.dry_run:
        if not args.source:
            recordPath = projectDir / "_import/TextureBakes/Texture_SingleBlanket.json"
            record = json.loads(recordPath.read_text(encoding="utf-8"))
            record["referenceProjection"] = {
                "colorSource": referencePath.relative_to(projectDir).as_posix(),
                "colorSha256": hashlib.sha256(referencePath.read_bytes()).hexdigest(),
                "alphaSource": alphaPath.relative_to(projectDir).as_posix(),
                "alphaSha256": hashlib.sha256(alphaPath.read_bytes()).hexdigest(),
                "method": "Approved imagegen RGB projected into square UV; prior edge alpha retained; no repainting"}
            record["clothPass20261023"] = {"base": FinishBase(), "detailNormal": BakeDetailNormal()}
            # Output records describe the files as shipped (after the cloth pass).
            # The detail normal is its own manifest entry (SingleBlanketDetailNormal); it is recorded here, not in outputs.
            for name, channel in (("Texture_SingleBlanketBase.webp", "Base"), ("Texture_SingleBlanketDetailNormal.webp", "DetailNormal")):
                data = (projectDir / "Texture" / name).read_bytes()
                with Image.open(projectDir / "Texture" / name) as image:
                    entry = {"channel": channel, "file": name, "width": image.width, "height": image.height,
                             "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                if channel == "Base":
                    record["outputs"] = [entry if o["file"] == name else o for o in record["outputs"]]
                else:
                    record["clothPass20261023"]["detailNormal"]["file"] = entry
            record["totalBytes"] = sum(o["bytes"] for o in record["outputs"])
            recordPath.write_text(json.dumps(record, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
            print(json.dumps(record["clothPass20261023"]))
        BakeMask()


if __name__ == "__main__":
    Main()
