"""Build aligned, periodic PBR maps from ImageGen wall-material sources.

The ImageGen files provide authored colour and large-scale material character.
This script makes the edges mathematically periodic, then derives Normal and
ORM from that exact Base Color so mortar, chips, and compacted-earth bands stay
registered in every channel.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


MATERIALS = {
    "Brick": {
        "invert_height": True,
        "normal_strength": 5.0,
        "roughness": (0.76, 0.96),
        "ao_strength": 0.34,
    },
    "Core": {
        "invert_height": False,
        "normal_strength": 3.2,
        "roughness": (0.82, 0.98),
        "ao_strength": 0.25,
    },
    "Stone": {
        "invert_height": True,
        "normal_strength": 3.8,
        "roughness": (0.70, 0.92),
        "ao_strength": 0.28,
    },
}


def MakePeriodic(image: Image.Image, band: int) -> Image.Image:
    """Feather opposite edge pairs to identical values without mirroring a tile."""
    data = np.asarray(image.convert("RGB"), dtype=np.float32)
    height, width, _ = data.shape
    band = max(16, min(band, width // 4, height // 4))
    for offset in range(band):
        alpha = 0.5 * (1.0 + np.cos(np.pi * offset / max(1, band - 1)))
        left = data[:, offset].copy()
        right = data[:, width - 1 - offset].copy()
        average = (left + right) * 0.5
        data[:, offset] = left * (1.0 - alpha) + average * alpha
        data[:, width - 1 - offset] = right * (1.0 - alpha) + average * alpha
    for offset in range(band):
        alpha = 0.5 * (1.0 + np.cos(np.pi * offset / max(1, band - 1)))
        top = data[offset].copy()
        bottom = data[height - 1 - offset].copy()
        average = (top + bottom) * 0.5
        data[offset] = top * (1.0 - alpha) + average * alpha
        data[height - 1 - offset] = bottom * (1.0 - alpha) + average * alpha
    return Image.fromarray(np.clip(data, 0, 255).astype(np.uint8), "RGB")


def HeightField(base: Image.Image, invert: bool) -> np.ndarray:
    gray = ImageOps.grayscale(base).filter(ImageFilter.GaussianBlur(radius=1.25))
    height = np.asarray(ImageOps.autocontrast(gray, cutoff=1.0), dtype=np.float32) / 255.0
    if invert:
        height = 1.0 - height
    # Preserve the generated macro material but reserve headroom for stable normals.
    return np.clip(0.18 + height * 0.64, 0.0, 1.0)


def NormalMap(height: np.ndarray, strength: float) -> Image.Image:
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    normal = np.dstack((-dx, dy, np.ones_like(height)))
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    encoded = np.clip((normal * 0.5 + 0.5) * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(encoded, "RGB")


def OrmMap(height: np.ndarray, roughness_range: tuple[float, float],
        ao_strength: float) -> Image.Image:
    low, high = roughness_range
    local = np.abs(height - (
        np.roll(height, 1, 0) + np.roll(height, -1, 0)
        + np.roll(height, 1, 1) + np.roll(height, -1, 1)) * 0.25)
    local /= max(float(local.max()), 1e-6)
    roughness = np.clip(low + local * (high - low), 0.0, 1.0)
    cavities = np.clip((0.55 - height) * 2.2, 0.0, 1.0)
    ao = np.clip(1.0 - cavities * ao_strength, 0.0, 1.0)
    metallic = np.zeros_like(height)
    orm = np.dstack((ao, roughness, metallic))
    return Image.fromarray(np.clip(orm * 255.0, 0, 255).astype(np.uint8), "RGB")


def EdgeError(image: Image.Image) -> float:
    data = np.asarray(image.convert("RGB"), dtype=np.float32)
    horizontal = np.abs(data[:, 0] - data[:, -1]).mean()
    vertical = np.abs(data[0] - data[-1]).mean()
    return float(max(horizontal, vertical))


def BuildOne(kind: str, source_path: Path, output_directory: Path, size: int) -> None:
    spec = MATERIALS[kind]
    source = Image.open(source_path).convert("RGB")
    source = ImageOps.fit(source, (size, size), method=Image.Resampling.LANCZOS)
    # ImageGen already aims for a periodic composition.  Keep the correction
    # narrow so it closes the exact GPU seam without washing out a full brick
    # course along every edge.
    base = MakePeriodic(source, max(24, size // 32))
    height = HeightField(base, spec["invert_height"])
    # Derivatives at the duplicated first/last texel can differ even when the
    # height itself is periodic.  A narrow second feather keeps the tangent
    # field and packed channels continuous under GPU repeat filtering.
    normal = MakePeriodic(NormalMap(height, spec["normal_strength"]), max(16, size // 64))
    orm = MakePeriodic(OrmMap(height, spec["roughness"], spec["ao_strength"]),
        max(16, size // 64))

    output_directory.mkdir(parents=True, exist_ok=True)
    prefix = output_directory / f"Texture_CityWall{kind}"
    base.save(prefix.with_name(prefix.name + "Base.webp"), "WEBP", quality=90, method=6)
    normal.save(prefix.with_name(prefix.name + "Normal.webp"), "WEBP", quality=92, method=6)
    orm.save(prefix.with_name(prefix.name + "Orm.webp"), "WEBP", quality=92, method=6)

    errors = {"base": EdgeError(base), "normal": EdgeError(normal), "orm": EdgeError(orm)}
    if max(errors.values()) > 0.75:
        raise RuntimeError(f"{kind} edge continuity failed: {errors}")
    print({"material": kind, "size": size, "edge_error": errors})


def Main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--brick", type=Path, required=True)
    parser.add_argument("--core", type=Path, required=True)
    parser.add_argument("--stone", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--size", type=int, default=1024)
    args = parser.parse_args()
    for kind, source in (("Brick", args.brick), ("Core", args.core), ("Stone", args.stone)):
        BuildOne(kind, source, args.output, args.size)


if __name__ == "__main__":
    Main()
