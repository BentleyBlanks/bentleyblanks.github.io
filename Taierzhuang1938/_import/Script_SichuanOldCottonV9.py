"""Resize the unique V9 imagegen cotton albedo and derive restrained PBR maps.

The source is a unique blanket panel, not a tile. Its broad sweat, mud, and
washed-pale marks are intentionally kept intact. Only the technical normal map
uses a high-pass signal, so a stain is never interpreted as a large cloth bump.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def Sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def PrepareOldCotton(source: Path, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as sourceImage:
        sourceSize = list(sourceImage.size)
        # No albedo flattening, de-staining, tiling, contrast, or tint operation.
        baseImage = sourceImage.convert("RGB").resize(
            (1024, 1024), Image.Resampling.LANCZOS
        )

    grayImage = baseImage.convert("L")
    gray = np.asarray(grayImage, dtype=np.float32) / 255.0
    blurred = np.asarray(
        grayImage.filter(ImageFilter.GaussianBlur(3.5)), dtype=np.float32
    ) / 255.0
    fibreHeight = gray - blurred
    slopeY, slopeX = np.gradient(fibreHeight)
    # OpenGL tangent normal: image rows run down; tangent +Y runs up.
    normal = np.stack(
        (-slopeX * 1.5, slopeY * 1.5, np.ones_like(slopeX)), axis=-1
    )
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    normalPixels = np.rint(np.clip(normal * 0.5 + 0.5, 0, 1) * 255).astype(np.uint8)

    # Very matte old cotton, with only subtle fibre variation. Broad albedo marks
    # are not turned into glossy stains or exaggerated roughness contrast.
    roughness = np.clip(0.955 + fibreHeight * 0.09, 0.925, 0.98)
    roughnessPixels = np.rint(roughness * 255).astype(np.uint8)

    paths = {
        "baseColor": output / "Texture_SichuanOldCottonV09Base.png",
        "normal": output / "Texture_SichuanOldCottonV09Normal.png",
        "roughness": output / "Texture_SichuanOldCottonV09Roughness.png",
    }
    baseImage.save(paths["baseColor"])
    Image.fromarray(normalPixels).save(paths["normal"])
    Image.fromarray(roughnessPixels).save(paths["roughness"])

    mapInfo = {}
    for role, path in paths.items():
        with Image.open(path) as checkImage:
            checkImage.load()
            if checkImage.size != (1024, 1024):
                raise ValueError(f"Unexpected size for {path}")
            mapInfo[role] = {
                "file": path.name,
                "sha256": Sha256(path),
                "resolution": list(checkImage.size),
                "mode": checkImage.mode,
                "colorSpace": "sRGB" if role == "baseColor" else "Non-Color",
            }

    data = {
        "generator": "Built-in image_gen__imagegen",
        "source": str(source.resolve()),
        "sourceSha256": Sha256(source),
        "sourceResolution": sourceSize,
        "preparationScript": "Script_SichuanOldCottonV9.py",
        "preparationScriptSha256": Sha256(Path(__file__)),
        "resolution": [1024, 1024],
        "layout": "Unique non-tiling entire blanket front; 0.38 m wide by 0.30 m tall",
        "albedoPreparation": "RGB conversion and Lanczos resize only; all broad dirt and faded marks preserved",
        "normalPreparation": {
            "convention": "OpenGL tangent-space +Y",
            "heightSignal": "Luminance minus Gaussian blur; fibre detail only",
            "gaussianRadiusPx": 3.5,
            "gradientScale": 1.5,
            "normalLengthMin": float(np.linalg.norm(normal, axis=-1).min()),
        },
        "roughnessPreparation": {
            "base": 0.955,
            "fibreVariationScale": 0.09,
            "clamp": [0.925, 0.98],
            "observedRange": [float(roughness.min()), float(roughness.max())],
        },
        "metallic": 0,
        "maps": mapInfo,
        "gameBakeComplete": False,
    }
    metadataPath = output / "Data_SichuanOldCottonV09.json"
    metadataPath.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return data


def Main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = PrepareOldCotton(args.source, args.output)
    print(json.dumps({"status": "V9_COTTON_PBR_PREPARED", "maps": result["maps"]}, indent=2))


if __name__ == "__main__":
    Main()
