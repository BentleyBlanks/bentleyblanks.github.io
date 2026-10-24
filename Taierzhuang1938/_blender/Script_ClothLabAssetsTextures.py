"""Deterministic cloth-lab texture preparation; Python + Pillow + numpy.

The quilt uses a dedicated fine cotton recipe; the other studies retain their sources.
New packed 1024 px textures stay beside the editable Blender source, outside Git.
The banner is an artistic study, not a facsimile of a museum object.
"""
import json
import sys
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
    # Faded blue cotton, not a tinted reuse of the old mottled hide-like atlas.
    # Wear is broad and quiet; yarn and short fibres live in the fine normal map.
    quilt = Cotton(1924, (112, 136, 150))
    quilt += (3.8*np.sin(u*5.7+v*3.1)+2.0*np.cos(v*8.9-u*2))[..., None]
    fade = np.exp(-edge/.055)
    quilt += fade[..., None]*np.array((8, 8, 6))
    # UV image X is reversed relative to the mesh's +X coordinate.
    meshU = 1-u
    quiltSeam = np.zeros_like(u)
    stitch = np.zeros_like(u)
    for n, center in enumerate((0.22, 0.49, 0.77)):
        curve = center+0.013*np.sin(v*8+n*1.8)+0.005*np.sin(v*25+0.3*n)
        line = np.exp(-((meshU-curve)/0.0015)**2)
        quiltSeam = np.maximum(quiltSeam, np.exp(-((meshU-curve)/0.007)**2))
        stitch = np.maximum(stitch, line*(np.sin(v*2*np.pi*126+n) > 0.12))
    for n, center in enumerate((0.16, 0.38, 0.64, 0.84)):
        curve = center+0.009*np.sin(meshU*10+n)+0.003*np.sin(meshU*27)
        line = np.exp(-((v-curve)/0.0013)**2)
        quiltSeam = np.maximum(quiltSeam, np.exp(-((v-curve)/0.006)**2))
        stitch = np.maximum(stitch, line*(np.sin(meshU*2*np.pi*96+n) > 0.12))
    # Soft woven binding and two rows of modest running stitch, not leather piping.
    binding = np.exp(-((edge-.018)/.010)**4)
    hemStitch = np.exp(-((edge-.030)/.0015)**2)*(np.sin((u*1.4+v*1.9)*2*np.pi/.018) > .2)
    stitch = np.maximum(stitch, hemStitch)
    quilt *= (1-.12*quiltSeam-.10*binding)[..., None]
    quilt = quilt*(1-.50*stitch[..., None])+np.array((174, 184, 182))*.50*stitch[..., None]
    Save("DongguaQuiltTopBase", quilt)
    bottom = Cotton(1938, (176, 170, 153))
    bottom += (2.3*np.sin(u*5+v*7))[..., None]
    bottom *= (1-.10*quiltSeam-.035*fade)[..., None]
    bottom = bottom*(1-.32*stitch[..., None])+np.array((204, 196, 177))*.32*stitch[..., None]
    Save("DongguaQuiltBottomBase", bottom)
    # A tileable sub-millimetre plain weave. No broad cracked/pebbled normal relief.
    yy, xx = np.mgrid[0:size, 0:size]/size
    phaseX, phaseY = xx*2*np.pi*192, yy*2*np.pi*192
    weave = .22*np.cos(phaseX)*(.72+.28*np.sin(phaseY/2)) + .22*np.cos(phaseY)*(.72-.28*np.sin(phaseX/2))
    fibres = .020*np.sin(xx*2*np.pi*401+yy*2*np.pi*8)+.014*np.sin(yy*2*np.pi*377-xx*2*np.pi*13)
    height = weave+fibres
    du = (np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*.5
    dv = (np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*.5
    normals = np.stack((-du, dv, np.ones_like(du)), axis=-1)
    normals /= np.linalg.norm(normals,axis=-1)[...,None]
    Save("DongguaCottonDetailNormal", (normals*.5+.5)*255)
    quiltRecipe = {"version": "20261025SoftCottonV4", "source": "Deterministic procedural cotton; no old atlas pixels",
                   "palette": "faded grey blue face / warm grey cotton lining", "resolution": [size,size],
                   "detailTileM": .18, "yarnSpacingM": .18/192,
                   "textures": ["Texture_DongguaQuiltTopBase.png", "Texture_DongguaQuiltBottomBase.png", "Texture_DongguaCottonDetailNormal.png"]}
    (sourceDir/"Data_DongguaQuiltTextureRecipe.json").write_text(json.dumps(quiltRecipe,indent=2),encoding="utf-8")
    if "--only-quilt" in sys.argv:
        print(json.dumps(quiltRecipe))
        return
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
        "sourceCotton": "Deterministic procedural cotton",
        "normal": {"quilt": "Texture_DongguaCottonDetailNormal.png", "others": "Texture/Texture_SingleBlanketDetailNormal.webp"},
        "classification": "Artistic reconstruction; no historical dimensions or exact inscription claimed",
        "files": sorted(path.name for path in textureDir.glob("*.png"))}
    (sourceDir / "Data_TextureRecipe.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    Main()
