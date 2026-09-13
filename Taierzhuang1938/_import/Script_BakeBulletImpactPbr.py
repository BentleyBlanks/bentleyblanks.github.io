"""Bake three imagegen bullet-impact sources into a runtime PBR decal atlas.

Atlas columns are rifle A, rifle B, and the machine-gun-only variant. The base
map keeps authored alpha and neutral fracture values so Script_Vfx can tint the
same physical mark for brick, earth, wood, metal, and sandbag surfaces.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent
REPO_SOURCE_DIR = HERE / "Source" / "Texture_BulletImpactPbr"
LOCAL_SOURCE_DIR = Path.home() / "Documents" / "Program" / "Taierzhuang1938SourceAssets" / "Vfx" / "BulletImpactPbr"
CELL_SIZE = 512
SOURCE_NAMES = (
    "Texture_BulletImpactRifleA_Source.png",
    "Texture_BulletImpactRifleB_Source.png",
    "Texture_BulletImpactMachineGun_Source.png",
)
OUTPUTS = {
    "base": PROJECT / "Texture" / "Texture_BulletImpactPbrAtlasBase.webp",
    "normal": PROJECT / "Texture" / "Texture_BulletImpactPbrAtlasNormal.webp",
    "orm": PROJECT / "Texture" / "Texture_BulletImpactPbrAtlasOrm.webp",
}


def normalized_luminance(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    luminance = rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722
    visible = luminance[alpha > 0.08]
    if visible.size == 0:
        raise ValueError("source has no visible bullet-impact pixels")
    low, high = np.percentile(visible, (1.5, 98.5))
    return np.clip((luminance - low) / max(high - low, 1e-5), 0.0, 1.0)


def bake_cell(source: Path) -> tuple[Image.Image, Image.Image, Image.Image]:
    image = Image.open(source).convert("RGBA")
    alpha_extrema = image.getchannel("A").getextrema()
    if alpha_extrema[0] != 0 or alpha_extrema[1] != 255:
        raise ValueError(f"{source.name}: expected genuine 0..255 alpha, got {alpha_extrema}")
    image = image.resize((CELL_SIZE, CELL_SIZE), Image.Resampling.LANCZOS)
    rgba = np.asarray(image, dtype=np.float32) / 255.0
    # imagegen leaves alpha=1/255 compression residue in otherwise transparent
    # scanlines. Remove only that invisible residue, then remap the real edge
    # coverage so the fracture dust still antialiases cleanly.
    alpha = np.clip((rgba[..., 3] - 12.0 / 255.0) / (1.0 - 12.0 / 255.0), 0.0, 1.0)
    luminance = normalized_luminance(rgba[..., :3], alpha)

    # A neutral albedo lets the runtime palette supply the receiving material's
    # colour while retaining the imagegen cavity/rim/debris microstructure.
    neutral = 0.08 + luminance * 0.86
    base_rgb = np.repeat(neutral[..., None], 3, axis=2)
    # Hidden RGB from the generated PNG can contain encoder scanline residue.
    # Canonicalise it so bilinear filtering at transparent edges cannot pull in
    # arbitrary bright or dark bands.
    base_rgb[alpha < 0.005] = (0.5, 0.5, 0.5)
    base_rgba = np.dstack((base_rgb, alpha))

    # Reconstruct a shallow height field from authored fracture luminance. The
    # transparent exterior returns to the undamaged plane (0.5); bright chips
    # rise and the dark cavity recedes. A small blur removes quantisation noise
    # without erasing the hairline cracks.
    height = 0.5 * (1.0 - alpha) + (0.08 + luminance * 0.88) * alpha
    height_image = Image.fromarray(np.uint8(np.clip(height * 255.0, 0, 255)), "L")
    height = np.asarray(height_image.filter(ImageFilter.GaussianBlur(0.65)), dtype=np.float32) / 255.0
    gradient_y, gradient_x = np.gradient(height)
    normal = np.dstack((-gradient_x * 15.0, gradient_y * 15.0, np.ones_like(height)))
    normal /= np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-5)
    normal_rgb = normal * 0.5 + 0.5
    normal_rgb[alpha < 0.005] = (0.5, 0.5, 1.0)

    # ORM: occlusion follows cavity depth, all fracture material stays rough,
    # and impacts are dielectric. Outside values are harmless but canonical.
    ao = np.clip(0.28 + height * 0.78, 0.22, 1.0)
    roughness = np.clip(0.72 + (1.0 - luminance) * 0.25, 0.72, 0.97)
    metallic = np.zeros_like(height)
    ao[alpha < 0.005] = 1.0
    roughness[alpha < 0.005] = 1.0
    orm_rgb = np.dstack((ao, roughness, metallic))

    def rgb_image(array: np.ndarray) -> Image.Image:
        return Image.fromarray(np.uint8(np.clip(array * 255.0 + 0.5, 0, 255)), "RGB")

    base = Image.fromarray(np.uint8(np.clip(base_rgba * 255.0 + 0.5, 0, 255)), "RGBA")
    return base, rgb_image(normal_rgb), rgb_image(orm_rgb)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=None,
                        help="directory containing the three imagegen RGBA sources")
    args = parser.parse_args()
    source_dir = args.source_dir or (REPO_SOURCE_DIR if REPO_SOURCE_DIR.is_dir() else LOCAL_SOURCE_DIR)
    sources = tuple(source_dir / name for name in SOURCE_NAMES)
    missing = [source for source in sources if not source.is_file()]
    if missing:
        raise FileNotFoundError("missing imagegen source(s): " + ", ".join(map(str, missing)))

    cells = [bake_cell(source) for source in sources]
    atlases = {
        "base": Image.new("RGBA", (CELL_SIZE * len(cells), CELL_SIZE), (0, 0, 0, 0)),
        "normal": Image.new("RGB", (CELL_SIZE * len(cells), CELL_SIZE), (128, 128, 255)),
        "orm": Image.new("RGB", (CELL_SIZE * len(cells), CELL_SIZE), (255, 255, 0)),
    }
    for column, (base, normal, orm) in enumerate(cells):
        x = column * CELL_SIZE
        atlases["base"].paste(base, (x, 0))
        atlases["normal"].paste(normal, (x, 0))
        atlases["orm"].paste(orm, (x, 0))

    for key, output in OUTPUTS.items():
        output.parent.mkdir(parents=True, exist_ok=True)
        atlases[key].save(output, "WEBP", lossless=True, method=6)
        with Image.open(output) as check:
            if check.size != (CELL_SIZE * 3, CELL_SIZE):
                raise ValueError(f"{output.name}: unexpected size {check.size}")
        print(f"{output.relative_to(PROJECT)} {output.stat().st_size} bytes")


if __name__ == "__main__":
    main()
