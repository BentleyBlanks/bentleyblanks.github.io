"""Deterministic cloth-lab texture preparation; Python + Pillow + numpy.

This reuses the existing cotton atlas and detail normal without changing either.
New packed 1024 px textures stay beside the editable Blender source, outside Git.
The banner is an artistic study, not a facsimile of a museum object.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

projectDir = Path(__file__).resolve().parents[1]
sourceDir = Path("C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ClothLab")
textureDir = sourceDir / "Textures"
size = 1024


def Save(name, pixels):
    image = Image.fromarray(np.uint8(np.clip(pixels, 0, 255)))
    image.save(textureDir / f"Texture_{name}.png", optimize=True)


def Cotton(seed, base):
    rng = np.random.default_rng(seed)
    field = Image.fromarray(np.uint8(rng.random((32, 32))*255)).resize((size, size), Image.Resampling.BICUBIC)
    grain = rng.normal(0, 1.6, (size, size))
    y, x = np.mgrid[0:size, 0:size]
    yarn = 1.8*np.sin(x*np.pi/1.8)+1.4*np.cos(y*np.pi/2.4)
    noise = (np.asarray(field).astype(float)-128)*0.07+grain+yarn
    return np.array(base)[None, None, :]+noise[..., None]


def Main():
    textureDir.mkdir(parents=True, exist_ok=True)
    v, u = np.mgrid[0:size, 0:size]/(size-1)
    edge = np.minimum.reduce((u*1.4, (1-u)*1.4, v*1.9, (1-v)*1.9))
    with Image.open(projectDir / "Texture/Texture_SingleBlanketBase.webp") as image:
        original = np.asarray(image.convert("RGB").resize((size, size)), dtype=float)
    quilt = original*np.array((0.81, 0.76, 0.67))
    quilt += (Cotton(1924, (0, 0, 0)))*0.35
    # Sparse hand quilting. UV image X is reversed relative to the mesh's +X
    # coordinate, so the sewn lines must use meshU to sit in the actual grooves.
    meshU = 1-u
    quiltSeam = np.zeros_like(u)
    stitch = np.zeros_like(u)
    for n, center in enumerate((0.23, 0.51, 0.78)):
        curve = center+0.009*np.sin(v*11+n*1.8)+0.006*np.sin(v*29+0.3*n)
        line = np.exp(-((meshU-curve)/0.0022)**2)
        quiltSeam = np.maximum(quiltSeam, np.exp(-((meshU-curve)/0.0065)**2))
        stitch = np.maximum(stitch, line*(np.sin(v*2*np.pi*105+n) > 0.30))
    for n, center in enumerate((0.18, 0.46, 0.77)):
        curve = center+0.006*np.sin(meshU*12+n)+0.003*np.sin(meshU*32)
        line = np.exp(-((v-curve)/0.0018)**2)
        quiltSeam = np.maximum(quiltSeam, np.exp(-((v-curve)/0.0055)**2))
        stitch = np.maximum(stitch, line*(np.sin(meshU*2*np.pi*80+n) > 0.25))
    quilt *= 1-0.23*quiltSeam[..., None]
    quilt = quilt*(1-0.62*stitch[..., None])+np.array((167, 154, 129))*0.62*stitch[..., None]
    Save("DongguaQuiltTopBase", quilt)
    bottom = Cotton(1938, (131, 121, 100))
    wear = np.exp(-edge/0.07)*12
    bottom -= wear[..., None]
    bottom *= 1-0.09*quiltSeam[..., None]
    Save("DongguaQuiltBottomBase", bottom)
    curtain = Cotton(1942, (127, 119, 92))
    seams = np.maximum.reduce([np.exp(-((u-(n/4+0.004*np.sin(v*9+n)))/0.002)**2) for n in range(1, 4)])
    curtain *= 1-0.11*seams[..., None]
    curtain -= np.clip((v-0.71)/0.29, 0, 1)[..., None]*np.array((21, 20, 15))
    curtain *= 1-0.16*(edge < 0.03)[..., None]
    # A modest repaired lower corner in the same coarse cotton.
    patch = (u > 0.69)&(u < 0.88)&(v > 0.73)&(v < 0.87)
    curtain[patch] *= np.array((0.82, 0.84, 0.85))
    Save("DoorCurtainBase", curtain)
    banner = Cotton(1937, (220, 211, 186))
    edgePx = np.minimum.reduce((u, 1-u, v, 1-v))*size
    banner *= 1-0.07*np.exp(-edgePx/38)[..., None]
    # Red border and diagonal fabric bands are a deliberately simplified study.
    border = edgePx < 28
    diagonal = (np.abs(v-u) < 0.020)|(np.abs(v+u-1) < 0.020)
    red = Cotton(1939, (118, 37, 29))
    banner[border|diagonal] = red[border|diagonal]
    glyph = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(glyph)
    font = ImageFont.truetype("C:/Windows/Fonts/simkai.ttf", 730)
    bbox = draw.textbbox((0, 0), "死", font=font)
    draw.text(((size-(bbox[2]-bbox[0]))/2-bbox[0], (size-(bbox[3]-bbox[1]))/2-bbox[1]), "死", font=font, fill=255)
    inkMask = np.asarray(glyph, dtype=float)/255
    ink = Cotton(1940, (24, 23, 20))
    banner = banner*(1-inkMask[..., None])+ink*inkMask[..., None]
    Save("SichuanBannerBase", banner)
    report = {"resolution": [size, size], "font": "Windows simkai.ttf (rasterized single glyph; font not redistributed)",
        "sourceCotton": "Texture/Texture_SingleBlanketBase.webp", "normal": "Texture/Texture_SingleBlanketDetailNormal.webp",
        "classification": "Artistic reconstruction; no historical dimensions or exact inscription claimed",
        "files": sorted(path.name for path in textureDir.glob("*.png"))}
    (sourceDir / "Data_TextureRecipe.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    Main()
