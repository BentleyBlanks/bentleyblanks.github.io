"""Bake the three terrain layers and the packed shoring material."""

from pathlib import Path
import sys

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))
from Script_BakePbrTexture import Bake, ParseArgs


def MixedRoad(work, old):
    """Mix rotated patches in world scale so the scuffs never read as parallel rows."""
    size = 1024
    photo = np.asarray(Image.open(HERE / "Source_BattleLoam.webp").convert("RGB").resize((size,size)), dtype=np.float32)
    compacted = np.asarray(Image.open(old).convert("RGB").resize((size,size)), dtype=np.float32)
    y, x = np.meshgrid(np.arange(size)/size, np.arange(size)/size, indexing="ij")
    patch = .80 + .134 * np.sin(8*np.pi*x+4*np.pi*y) * np.cos(6*np.pi*y-2*np.pi*x)
    direction = .49 + .39 * np.cos(4*np.pi*x+6*np.pi*y) * np.sin(6*np.pi*x-2*np.pi*y)
    turn = np.roll(np.rot90(photo), (231, 119), axis=(0,1))
    textured = photo * direction[:,:,None] + turn * (1-direction[:,:,None])
    road = textured * patch[:,:,None] + compacted * (1-patch[:,:,None])
    file = work / "Source_MixedEastTrackRoad.png"
    work.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.uint8(np.clip(road,0,255))).save(file)
    return file


def ElmAtlas(work, textures, sap_source):
    """Bake continuous fractures in the bark UVs, including torn fibers at the edges."""
    width, height = 1024, 1536
    bark = np.asarray(Image.open(textures / "Texture_TreeBarkBase.webp").convert("RGB").resize((512,512)), dtype=np.float32)
    normal = np.asarray(Image.open(textures / "Texture_TreeBarkNormal.webp").convert("RGB").resize((512,512)), dtype=np.float32)
    sap = np.asarray(Image.open(sap_source).convert("RGB").resize((512,512)), dtype=np.float32)
    v, u = np.meshgrid(1 - np.arange(height)/(height-1), np.arange(width)/width, indexing="ij")
    turn = np.arctan2(np.sin(2*np.pi*u+np.pi/2), np.cos(2*np.pi*u+np.pi/2))
    rag = .062*np.sin(v*72) + .034*np.sin(v*163+turn*20) + .020*np.cos(v*296-turn*37)
    upper = (v-.358)*.76 - np.abs(turn - 1.18 - .12*np.sin(v*9) - rag)
    lower_shape = .265 * np.maximum(0, np.sin(np.pi*np.clip((v-.115)/.35,0,1)))
    lower = lower_shape - np.abs(turn - .90 + .26*v - rag)
    mask = np.clip(np.maximum(upper,lower)*15.0,0,1)
    sap_rgb = np.tile(sap, (3,2,1))[:height] * np.array([.70,.744,.78]) + np.array([18,16,14])
    bark_rgb = np.tile(bark, (3,2,1))[:height] * np.array([.81,.80,.80])
    atlas = bark_rgb * (1-mask[:,:,None]) + sap_rgb * mask[:,:,None]
    normal_map = np.tile(normal,(3,2,1))[:height] * (1-mask[:,:,None]) + np.array([128,128,255]) * mask[:,:,None]
    stem = work / "Texture_EastTrackElmAtlas"
    Image.fromarray(np.uint8(np.clip(atlas,0,255))).save(str(stem)+"Base.webp", quality=88)
    Image.fromarray(np.uint8(np.clip(normal_map,0,255))).resize((512,768)).save(str(stem)+"Normal.webp", quality=90)


def Main():
    sources = HERE.parent / "DugoutAidOpenFields"
    work = PROJECT.parent / "tmp" / "TanketteAdvanceEastTrack" / "Materials"
    textures = PROJECT / "Texture"
    road = MixedRoad(work, textures / "Texture_TerrainCartTrackBase.webp")
    ElmAtlas(work, textures, sources / "Source_SplitElm.webp")
    # Each terrain row emits standard Base, Normal and AO/roughness/height slices.
    recipes = [
        ("TerrainEastTrackRoad", road, textures, "drySoil",
         1.47, ".413,.373,.333", .091, .0088, .92, "orh"),
        ("TerrainEastTrackStubble", sources / "Source_RootedSod.webp", textures, "drySoil",
         1.35, ".370,.335,.300", .104, .013, .95, "orh"),
        ("TerrainEastTrackCut", sources / "Source_CutLoess.webp", textures, "rammedEarth",
         1.16, ".377,.332,.295", .096, .0108, .95, "orh"),
        ("EastTrackWeatheredElm", HERE / "Source_WeatheredElm.webp", work, "weatheredWood",
         1.06, ".373,.347,.310", .094, .0038, .94, "orm"),
    ]
    for name, source, output, preset, tile, mean, contrast, relief, rough, pack in recipes:
        terrain = pack == "orh"
        args = ParseArgs([
            "--name", name, "--source", str(source), "--preset", preset, "--out", str(output),
            "--tile-m", str(tile), "--mean", mean, "--contrast", str(contrast), "--relief-m", str(relief),
            "--rough", str(rough), "--rough-var", ".065", "--ao", ".42" if terrain else ".30",
            "--pack", pack, "--normal-convention", "terrain" if terrain else "gl",
            "--size", "512" if terrain else "1024", "--data-size", "256" if terrain else "512", "--base-quality", "92",
            "--data-quality", "90", "--height-fine-weight", ".55" if terrain else ".49",
            "--row-flatten", "on" if terrain else "off",
            "--seamless", "blend" if terrain else "weld", "--flatten-sigma", ".14",
            *(["--no-record"] if not terrain else []),
        ])
        if Bake(args):
            raise RuntimeError(f"Could not bake {name}.")
    with Image.open(work / "Texture_EastTrackWeatheredElmBase.webp") as image:
        boards = np.asarray(image.convert("RGB").resize((384,384), Image.Resampling.LANCZOS), dtype=np.float32)
    boards *= np.array([.81,.772,.714], dtype=np.float32)
    Image.fromarray(np.uint8(boards)).save(work / "Texture_EastTrackRevetmentBase.webp", quality=88, method=6)


if __name__ == "__main__":
    Main()
