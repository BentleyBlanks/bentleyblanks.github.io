"""Bake compact browser PBR maps from the purchased CGMOL dadao source.

The paid 4K PNGs stay outside the public repository. This deterministic baker
preserves the authored UV atlas, downsamples it to 1K, renormalizes the tangent-
space normal map, and packs AO/roughness/metalness into glTF ORM order.
"""

from pathlib import Path
import os

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
TEXTURE = ROOT / "Texture"


def _external_root() -> Path:
    configured = os.getenv("TZ1938_SOURCE_ASSETS")
    if configured and Path(configured).is_dir():
        return Path(configured)
    node = Path(__file__).resolve().parent
    for parent in (node, *node.parents):
        candidate = parent / "Taierzhuang1938SourceAssets" / "Weapons"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Taierzhuang1938SourceAssets/Weapons not found")


def _resize_rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS)


def _normal(path: Path) -> Image.Image:
    encoded = np.asarray(_resize_rgb(path), dtype=np.float32) / 255.0
    vector = encoded * 2.0 - 1.0
    length = np.maximum(np.linalg.norm(vector, axis=2, keepdims=True), 1e-6)
    vector /= length
    return Image.fromarray(np.uint8(np.clip((vector * 0.5 + 0.5) * 255.0, 0, 255)), "RGB")


def main() -> None:
    source = _external_root() / "CgmolDadao" / "tex"
    required = {
        "base": source / "None_Base_color.png",
        "normal": source / "None_Normal_OpenGL.png",
        "ao": source / "None_Mixed_AO.png",
        "roughness": source / "None_Roughness.png",
        "metallic": source / "None_Metallic.png",
    }
    missing = [str(path) for path in required.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("Missing CGMOL dadao textures: " + ", ".join(missing))

    TEXTURE.mkdir(parents=True, exist_ok=True)
    _resize_rgb(required["base"]).save(
        TEXTURE / "Texture_DadaoBase.webp", "WEBP", quality=94, method=6
    )
    _normal(required["normal"]).save(
        TEXTURE / "Texture_DadaoNormal.webp", "WEBP", quality=95, method=6
    )

    ao = np.asarray(Image.open(required["ao"]).convert("L").resize(
        (1024, 1024), Image.Resampling.LANCZOS
    ))
    roughness = np.asarray(Image.open(required["roughness"]).convert("L").resize(
        (1024, 1024), Image.Resampling.LANCZOS
    ))
    metallic = np.asarray(Image.open(required["metallic"]).convert("L").resize(
        (1024, 1024), Image.Resampling.LANCZOS
    ))
    Image.fromarray(np.dstack((ao, roughness, metallic)), "RGB").save(
        TEXTURE / "Texture_DadaoOrm.webp", "WEBP", quality=95, method=6
    )

    for stem in ("Base", "Normal", "Orm"):
        path = TEXTURE / f"Texture_Dadao{stem}.webp"
        print(f"ok   {path.name}  {path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
