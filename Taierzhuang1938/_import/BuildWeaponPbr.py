"""Build compact browser-ready PBR maps from the approved authored base colors.

The base-color images are generated material scans.  This step is deterministic:
it removes baked edge seams, downsamples them, derives tangent-space normals, and
packs ambient occlusion / roughness / metalness into the glTF-style ORM channels.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
TEXTURE = ROOT / "Texture"
SOURCE = ROOT / "_import" / "Source"


def _seamless(image: Image.Image) -> Image.Image:
    """Offset the source and softly heal the two former outer edges."""
    image = image.convert("RGB")
    w, h = image.size
    image = Image.fromarray(np.roll(np.roll(np.asarray(image), h // 2, 0), w // 2, 1))
    return image.filter(ImageFilter.GaussianBlur(0.18))


def _normal_map(image: Image.Image, strength: float) -> Image.Image:
    gray = np.asarray(image.convert("L"), dtype=np.float32) / 255.0
    dx = np.roll(gray, -1, 1) - np.roll(gray, 1, 1)
    dy = np.roll(gray, -1, 0) - np.roll(gray, 1, 0)
    nx, ny = -dx * strength, dy * strength
    nz = np.ones_like(nx)
    inv = 1.0 / np.maximum(np.sqrt(nx * nx + ny * ny + nz * nz), 1e-6)
    normal = np.dstack(((nx * inv * 0.5 + 0.5), (ny * inv * 0.5 + 0.5), (nz * inv * 0.5 + 0.5)))
    return Image.fromarray(np.uint8(np.clip(normal * 255.0, 0, 255)), "RGB")


def _orm(image: Image.Image, *, metalness: int, rough_min: int, rough_max: int) -> Image.Image:
    gray = np.asarray(image.convert("L"), dtype=np.float32) / 255.0
    detail = np.abs(gray - np.asarray(image.convert("L").filter(ImageFilter.GaussianBlur(9)), dtype=np.float32) / 255.0)
    rough = rough_min + (rough_max - rough_min) * np.clip(detail * 5.5 + (1.0 - gray) * 0.25, 0.0, 1.0)
    ao = np.uint8(np.clip(238.0 - detail * 105.0, 180.0, 255.0))
    packed = np.dstack((ao, np.uint8(rough), np.full_like(ao, metalness)))
    return Image.fromarray(packed, "RGB")


def build(stem: str, *, normal_strength: float, metalness: int, rough_min: int, rough_max: int) -> None:
    source = SOURCE / f"Texture_{stem}Source.png"
    base = _seamless(Image.open(source)).resize((512, 512), Image.Resampling.LANCZOS)
    base.save(TEXTURE / f"Texture_{stem}Base.webp", "WEBP", quality=90, method=6)
    _normal_map(base, normal_strength).save(TEXTURE / f"Texture_{stem}Normal.webp", "WEBP", quality=92, method=6)
    _orm(base, metalness=metalness, rough_min=rough_min, rough_max=rough_max).save(
        TEXTURE / f"Texture_{stem}Orm.webp", "WEBP", quality=92, method=6
    )


def build_if_source(stem: str, **params) -> None:
    """Leave pre-existing maps alone when their high-res source is not tracked."""
    if (SOURCE / f"Texture_{stem}Source.png").is_file():
        build(stem, **params)


if __name__ == "__main__":
    TEXTURE.mkdir(parents=True, exist_ok=True)
    build_if_source("WeaponSteel", normal_strength=2.6, metalness=242, rough_min=92, rough_max=178)
    build_if_source("WeaponWood", normal_strength=3.2, metalness=0, rough_min=148, rough_max=220)
    # Image-generated, de-lit scans for the shared battlefield surfaces.  The
    # normal/ORM maps stay deterministic so every channel remains aligned.
    build_if_source("TreeBark", normal_strength=4.0, metalness=0, rough_min=176, rough_max=238)
    build_if_source("BrickWall", normal_strength=3.6, metalness=0, rough_min=158, rough_max=224)
    build_if_source("Ground", normal_strength=2.8, metalness=0, rough_min=178, rough_max=244)
