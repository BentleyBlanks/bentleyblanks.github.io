"""Prepare small agent previews and render numbered review marks on a copy."""
import json
import sys

from PIL import Image, ImageDraw, ImageFont, ImageOps


def Prepare(job):
    with Image.open(job["source"], formats=["PNG", "JPEG", "WEBP"]) as original:
        original.load()
        image = ImageOps.exif_transpose(original).convert("RGB")
    width, height = image.size
    if job.get("preview"):
        image.thumbnail((640, 640), Image.Resampling.LANCZOS)
        image.save(job["preview"], quality=82)
    if job.get("marked"):
        draw = ImageDraw.Draw(image)
        weight = max(3, round(max(image.size) / 180))
        font = ImageFont.load_default(size=max(18, 4 * weight))
        for index, (x0, y0, x1, y1) in job["boxes"]:
            x0, x1 = (round(value * (image.width - 1)) for value in (x0, x1))
            y0, y1 = (round(value * (image.height - 1)) for value in (y0, y1))
            draw.rectangle((x0, y0, x1, y1), outline="#e33d35", width=weight)
            draw.text((x0 + weight, y0 + weight), str(index), font=font, fill="white",
                      stroke_width=max(2, weight // 2), stroke_fill="#a41c19")
        image.save(job["marked"], format="PNG")
    return {"width": width, "height": height}


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as request:
        print(json.dumps([Prepare(job) for job in json.load(request)]))
