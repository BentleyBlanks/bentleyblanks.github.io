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


def build(stem: str, *, source_stem: str | None = None, normal_strength: float,
          metalness: int, rough_min: int, rough_max: int,
          base_quality: int = 90, map_quality: int = 92) -> None:
    source = SOURCE / f"Texture_{source_stem or stem}Source.png"
    base = _seamless(Image.open(source)).resize((512, 512), Image.Resampling.LANCZOS)
    base.save(TEXTURE / f"Texture_{stem}Base.webp", "WEBP", quality=base_quality, method=6)
    _normal_map(base, normal_strength).save(
        TEXTURE / f"Texture_{stem}Normal.webp", "WEBP", quality=map_quality, method=6
    )
    _orm(base, metalness=metalness, rough_min=rough_min, rough_max=rough_max).save(
        TEXTURE / f"Texture_{stem}Orm.webp", "WEBP", quality=map_quality, method=6
    )


def build_if_source(stem: str, **params) -> None:
    """Leave pre-existing maps alone when their high-res source is not tracked."""
    source_stem = params.get("source_stem", stem)
    if (SOURCE / f"Texture_{source_stem}Source.png").is_file():
        build(stem, **params)


def export_standalone_metallic_roughness(stem: str) -> None:
    """Export inspector-friendly PBR channels while runtime keeps compact ORM."""
    packed = TEXTURE / f"Texture_{stem}Orm.webp"
    if not packed.is_file():
        return
    orm = np.asarray(Image.open(packed).convert("RGB"))
    Image.fromarray(orm[:, :, 1], "L").save(
        TEXTURE / f"Texture_{stem}Roughness.webp", "WEBP", quality=92, method=6
    )
    Image.fromarray(orm[:, :, 2], "L").save(
        TEXTURE / f"Texture_{stem}Metallic.webp", "WEBP", quality=92, method=6
    )


if __name__ == "__main__":
    TEXTURE.mkdir(parents=True, exist_ok=True)
    build_if_source("WeaponSteelV2", source_stem="WeaponSteelV2", normal_strength=2.9,
                    metalness=245, rough_min=82, rough_max=166)
    build_if_source("WeaponWoodV2", source_stem="WeaponWoodV2", normal_strength=3.5,
                    metalness=0, rough_min=132, rough_max=214)
    # Image-generated, de-lit scans for the shared battlefield surfaces.  The
    # normal/ORM maps stay deterministic so every channel remains aligned.
    build_if_source("TreeBark", normal_strength=4.0, metalness=0, rough_min=176, rough_max=238)
    build_if_source("BrickWall", normal_strength=3.6, metalness=0, rough_min=158, rough_max=224)
    build_if_source("Ground", normal_strength=2.8, metalness=0, rough_min=178, rough_max=244)
    build_if_source("RoofTile", normal_strength=3.0, metalness=0, rough_min=126, rough_max=208)
    build_if_source("Sandbag", normal_strength=1.8, metalness=0, rough_min=208, rough_max=255)
    build_if_source("WattleFence", normal_strength=3.8, metalness=0, rough_min=192, rough_max=255)
    build_if_source("WoodCrate", normal_strength=2.3, metalness=0, rough_min=178, rough_max=238)
    build_if_source("BrickWallSooty", normal_strength=3.8, metalness=0, rough_min=172, rough_max=236)
    # 构件库的两档预建模战损。高分辨率 base color 由 imagegen 产出；这里统一
    # 做无缝偏移、浏览器尺寸压缩并推导对位的 normal / ORM，避免把原始 PNG
    # 直接塞进开机路径，也避免各编辑器各自解释一套表面状态。
    build_if_source("BuildingDamageEarly", normal_strength=4.0, metalness=0,
                    rough_min=184, rough_max=244, base_quality=84, map_quality=72)
    build_if_source("BuildingDamageSevere", normal_strength=5.2, metalness=0,
                    rough_min=196, rough_max=252, base_quality=84, map_quality=72)
    build_if_source("Adobe", normal_strength=3.2, metalness=0, rough_min=218, rough_max=255)
    build_if_source("Stone", normal_strength=3.1, metalness=0, rough_min=156, rough_max=226)
    # Dedicated gate surfaces.  These stay separate from the city-wide brick and
    # roof recipes because the four gate complexes are the closest, most often
    # framed landmarks: they need larger handmade units and stronger age cues
    # without making every house and kilometre of curtain wall equally noisy.
    build_if_source("GateBrick", normal_strength=4.1, metalness=0, rough_min=174, rough_max=238)
    build_if_source("GatePaintedWood", normal_strength=3.8, metalness=0,
                    rough_min=184, rough_max=246)
    build_if_source("GateRoofTile", normal_strength=4.0, metalness=0,
                    rough_min=158, rough_max=226)
    # 出川车厢那三套（BenchWood / FloorSteel / CeilingSteel）**不在这里生产** ——
    # 它们的法线与 ORM 是随 base 一起出的，不是从 base 推的，走
    # _import/Script_BakeCarriagePbr.py 从 1254px 源图降采样。这里原来挂着一条
    # build_if_source("CarriageBenchWood")，它要的 Source 图不在仓库里、从来没触发；
    # 留着只会在源图哪天回来时把那边的产物顶掉。一张图只许有一个生产者。
    # 「照城防示意图补全地标」预留 stem（Phase 0 插桩）：各工作包用 imagegen 出
    # _import/Source/Texture_<Stem>Source.png 后，本脚本才会真的构建；没有源图就跳过。
    build_if_source("StationBrick", normal_strength=3.4, metalness=0, rough_min=160, rough_max=226)
    build_if_source("PrisonBrick", normal_strength=3.6, metalness=0, rough_min=170, rough_max=232)
    build_if_source("TemplePlaster", normal_strength=3.0, metalness=0, rough_min=200, rough_max=252)
    build_if_source("ChurchPlaster", normal_strength=2.6, metalness=0, rough_min=190, rough_max=248)
    for stem in (
        "TreeBark", "BrickWall", "Ground", "RoofTile", "Sandbag", "WattleFence", "WoodCrate",
        "BrickWallSooty", "BuildingDamageEarly", "BuildingDamageSevere", "Adobe",
        "Stone", "GateBrick", "GatePaintedWood", "GateRoofTile",
    ):
        export_standalone_metallic_roughness(stem)
