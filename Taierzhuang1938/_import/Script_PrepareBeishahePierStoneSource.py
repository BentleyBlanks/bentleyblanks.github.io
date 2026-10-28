"""Recreate the adopted stone material source from retained imagegen inputs.

The blended appearance is authored, not a historical observation.
Usage: python Script_PrepareBeishahePierStoneSource.py --input-dir <References> --output <png>
"""
import argparse
import hashlib
from pathlib import Path

from PIL import Image

SOURCES = (
    ("Source_BeishahePierStone.png", "87931161c756ec23597c7c32a15431b735dd8e99612e18e401357c9860a9c95d"),
    ("Source_BeishahePierStoneV2.png", "910b71f49d328620647fdcc3be739bef917f52e50a24e61f927fc9cef8c01a89"),
)
EXPECTED_OUTPUT_SHA256 = "07b6f5401f493ace8cc482474cbbcefc73b978d5672ca630782b5ac4b1da4758"


def Sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    images = []
    for name, expected in SOURCES:
        path = args.input_dir / name
        if Sha256(path) != expected:
            raise SystemExit(f"Source hash mismatch: {path}")
        with Image.open(path) as image:
            images.append(image.convert("RGB"))
    if images[0].size != images[1].size:
        raise SystemExit("Source dimensions differ")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    Image.blend(images[0], images[1], .4).save(args.output)
    digest = Sha256(args.output)
    if digest != EXPECTED_OUTPUT_SHA256:
        raise SystemExit(f"Output hash differs from retained source: {digest}")
    print(f"{args.output}: {digest}")


if __name__ == "__main__":
    main()
