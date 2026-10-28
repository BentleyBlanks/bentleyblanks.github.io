"""Recreate the adopted bridge steel source from two retained imagegen inputs.

The result is a design material, not evidence of the historical bridge's paint.
Usage: python Script_PrepareBeishaheSteelSource.py --input-dir <References> --output <png>
"""
import argparse
import hashlib
from pathlib import Path

import numpy as np
from PIL import Image


SOURCES = (
    ("Source_BeishaheSteelV2.png", "fb409ff753924d06ea9b69ff2d00994902c4454ab87f3b79ce6b9a018a2617bc", 0.6),
    ("Source_BeishaheSteelV3.png", "fcd5acb020c3fca3942ee6bca957da49a20554d81a02ee6208b846a96c269d17", 0.4),
)
EXPECTED_OUTPUT_SHA256 = "18592624f6811914700767b38851996e69def6ee48824a62c7f6381bb9a4408c"


def Sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    images = []
    for name, expected, weight in SOURCES:
        path = args.input_dir / name
        if Sha256(path) != expected:
            raise SystemExit(f"Source hash mismatch: {path}")
        with Image.open(path) as image:
            images.append((np.asarray(image.convert("RGB"), dtype=np.float32), weight))
    if images[0][0].shape != images[1][0].shape:
        raise SystemExit("Source dimensions differ")
    blended = np.uint8(np.round(sum(image * weight for image, weight in images)))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(blended).save(args.output)
    digest = Sha256(args.output)
    if digest != EXPECTED_OUTPUT_SHA256:
        raise SystemExit(f"Output hash differs from retained source: {digest}")
    print(f"{args.output}: {digest}")


if __name__ == "__main__":
    main()
