"""Rasterize the simplified museum-visible maker's lettering for PBR baking."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent
fontPath = Path("C:/Windows/Fonts/arial.ttf")
output = root / "Source/Zb26/Texture_ReceiverStampMask.png"


def Main():
    # A source mask, never a runtime font or an extra material draw.
    image = Image.new("L", (1024, 256), 0)
    draw = ImageDraw.Draw(image)
    for text, y, size in (("ČESKOSLOVENSKÁ ZBROJOVKA", 56, 46), ("BRNO", 134, 42)):
        font = ImageFont.truetype(str(fontPath), size)
        bounds = draw.textbbox((0, 0), text, font=font)
        width = bounds[2] - bounds[0]
        draw.text(((1024-width)/2, y-bounds[1]), text, font=font, fill=255)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)
    print(output, flush=True)


if __name__ == "__main__":
    Main()
