"""Make compact, aligned game PBR maps from the five imagegen albedo sources.

The imagegen originals live beside the private Blender project. Run once with
``python Script_OxCartPbrBake.py --source-dir <Iteration07 preview directory>``.
The generated maps are checked in so Script_OxCartBake.py needs no Pillow.
"""

import argparse
from pathlib import Path

from PIL import Image, ImageFilter


MATERIALS = {
    "Elm": ("Texture_ElmSource.png", 0.83, 0.0, 0.75),
    "OxCoat": ("Texture_OxCoatSource.png", 0.88, 0.0, 0.40),
    "HorseCoat": ("Texture_HorseCoatSource.png", 0.79, 0.0, 0.35),
    "HarnessLeather": ("Texture_HarnessLeatherSource.png", 0.74, 0.0, 0.55),
    "ForgedIron": ("Texture_ForgedIronSource.png", 0.70, 0.88, 0.65),
}
SIZE = 256
FEATHER = 22


def seamless(image):
    """Feather only the outside rim, preserving the imagegen interior."""
    image = image.resize((SIZE, SIZE), Image.Resampling.LANCZOS).convert("RGB")
    pixels = image.load()
    for y in range(SIZE):
        for offset in range(FEATHER):
            left, right = pixels[offset, y], pixels[SIZE - 1 - offset, y]
            amount = 0.5 * (1 - offset / FEATHER)
            pixels[offset, y] = tuple(round(a * (1 - amount) + b * amount) for a, b in zip(left, right))
            pixels[SIZE - 1 - offset, y] = tuple(round(b * (1 - amount) + a * amount) for a, b in zip(left, right))
    for x in range(SIZE):
        for offset in range(FEATHER):
            top, bottom = pixels[x, offset], pixels[x, SIZE - 1 - offset]
            amount = 0.5 * (1 - offset / FEATHER)
            pixels[x, offset] = tuple(round(a * (1 - amount) + b * amount) for a, b in zip(top, bottom))
            pixels[x, SIZE - 1 - offset] = tuple(round(b * (1 - amount) + a * amount) for a, b in zip(top, bottom))
    for y in range(SIZE):
        shared = tuple(round((a + b) / 2) for a, b in zip(pixels[0, y], pixels[SIZE - 1, y]))
        pixels[0, y] = pixels[SIZE - 1, y] = shared
    for x in range(SIZE):
        shared = tuple(round((a + b) / 2) for a, b in zip(pixels[x, 0], pixels[x, SIZE - 1]))
        pixels[x, 0] = pixels[x, SIZE - 1] = shared
    return image


def build_maps(color, roughness, metallic, normal_strength):
    value = color.convert("L").filter(ImageFilter.GaussianBlur(0.6))
    broad = value.filter(ImageFilter.GaussianBlur(6))
    value_pixels = value.load()
    broad_pixels = broad.load()
    normal = Image.new("RGB", (SIZE, SIZE))
    metal_rough = Image.new("RGB", (SIZE, SIZE))
    normal_pixels = normal.load()
    metal_rough_pixels = metal_rough.load()
    for y in range(SIZE):
        for x in range(SIZE):
            def height(px, py):
                px %= SIZE
                py %= SIZE
                return (value_pixels[px, py] - broad_pixels[px, py]) / 255

            dx = (height(x + 1, y) - height(x - 1, y)) * normal_strength
            dy = (height(x, y + 1) - height(x, y - 1)) * normal_strength
            length = (dx * dx + dy * dy + 1) ** 0.5
            normal_pixels[x, y] = (
                round(127.5 * (1 - dx / length)),
                round(127.5 * (1 - dy / length)),
                round(127.5 * (1 + 1 / length)),
            )
            local_value = (value_pixels[x, y] - broad_pixels[x, y]) / 255
            surface_roughness = min(1, max(0, roughness - 0.15 * local_value))
            metal_rough_pixels[x, y] = (255, round(255 * surface_roughness), round(255 * metallic))
    for pixels in (normal_pixels, metal_rough_pixels):
        for y in range(SIZE):
            shared = tuple(round((a + b) / 2) for a, b in zip(pixels[0, y], pixels[SIZE - 1, y]))
            pixels[0, y] = pixels[SIZE - 1, y] = shared
        for x in range(SIZE):
            shared = tuple(round((a + b) / 2) for a, b in zip(pixels[x, 0], pixels[x, SIZE - 1]))
            pixels[x, 0] = pixels[x, SIZE - 1] = shared
    return normal, metal_rough


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "Texture" / "OxCart"
    output.mkdir(parents=True, exist_ok=True)
    for name, (filename, roughness, metallic, normal_strength) in MATERIALS.items():
        with Image.open(args.source_dir / filename) as source:
            color = seamless(source)
        normal, metal_rough = build_maps(color, roughness, metallic, normal_strength)
        for suffix, image in (("BaseColor", color), ("Normal", normal), ("MetallicRoughness", metal_rough)):
            destination = output / f"Texture_{name}{suffix}.png"
            image.save(destination, optimize=True)
            print(f"{destination}: {destination.stat().st_size} bytes")


if __name__ == "__main__":
    main()
