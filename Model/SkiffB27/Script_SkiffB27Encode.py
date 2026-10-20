"""Encode three native PNG bakes as WebP, with lossless Normal/ORM channels."""

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image


def EncodeEndGrain(directory, quality=90, imageBudget=600000, setBudget=1000000):
    directory = Path(directory).resolve()
    roles = ("Base", "Normal", "Orm")
    qualities = sorted({quality, *(value for value in (86, 82, 78, 74, 70, 65, 60)
                                   if value < quality)}, reverse=True)
    if not 1 <= quality <= 100 or min(imageBudget, setBudget) <= 0:
        raise ValueError("Invalid WebP quality or byte budget")
    images = {}
    encoded = {}
    indices = {}
    products = {}
    trials = {role: [] for role in roles}
    try:
        for role in roles:
            pngPath = directory / ("Texture_SkiffB27EndGrain" + role + "_Bake.png")
            image = Image.open(pngPath)
            image.load()
            images[role] = image
            expectedSize = (1024, 1024) if role == "Base" else (512, 512)
            if image.format != "PNG" or image.size != expectedSize:
                raise ValueError(role + " requires the expected native PNG bake dimensions")
            if image.mode not in {"RGB", "RGBA"}:
                raise ValueError(role + " requires RGB or RGBA; pixel conversion is not permitted")
            products[role] = {"path": str(directory / ("Texture_SkiffB27EndGrain" + role + ".webp")),
                              "pngPath": str(pngPath), "size": list(image.size),
                              "lossless": role != "Base",
                              "encoder": "Pillow WebP format encoding only; no pixel operations"}

        def Encode(role, index):
            buffer = io.BytesIO()
            images[role].save(buffer, format="WEBP", quality=qualities[index],
                              lossless=role != "Base", method=6, exact=True)
            data = buffer.getvalue()
            with Image.open(io.BytesIO(data)) as decoded:
                decoded.load()
                if decoded.format != "WEBP" or decoded.size != images[role].size:
                    raise ValueError("WebP read-back failed for " + role)
                if role != "Base":
                    # Canonical RGBA is used only for comparison; the encoder
                    # receives the original image without any pixel operation.
                    if decoded.convert("RGBA").tobytes() != images[role].convert("RGBA").tobytes():
                        raise ValueError("Data-map pixels changed during lossless encoding")
            encoded[role] = data
            indices[role] = index
            trials[role].append({"quality": qualities[index], "bytes": len(data)})

        for role in roles:
            for index in range(len(qualities)):
                Encode(role, index)
                if len(encoded[role]) <= imageBudget:
                    break
            if len(encoded[role]) > imageBudget:
                raise ValueError(role + " exceeds the per-image byte budget")
        while sum(map(len, encoded.values())) > setBudget:
            candidates = [role for role in roles if indices[role] + 1 < len(qualities)]
            if not candidates:
                raise ValueError("End-grain textures exceed the set byte budget")
            role = max(candidates, key=lambda candidate: len(encoded[candidate]))
            Encode(role, indices[role] + 1)
        if any(len(data) > imageBudget for data in encoded.values()):
            raise ValueError("Encoded image exceeds the per-image byte budget")
        for role in roles:
            data = encoded[role]
            Path(products[role]["path"]).write_bytes(data)
            products[role].update(bytes=len(data), quality=qualities[indices[role]],
                                  sha256=hashlib.sha256(data).hexdigest(),
                                  qualityTrials=trials[role])
        return products
    finally:
        for image in images.values():
            image.close()


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--quality", type=int, default=90)
    parser.add_argument("--image-budget", type=int, default=600000)
    parser.add_argument("--set-budget", type=int, default=1000000)
    args = parser.parse_args()
    result = EncodeEndGrain(args.directory, args.quality, args.image_budget, args.set_budget)
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    Main()
