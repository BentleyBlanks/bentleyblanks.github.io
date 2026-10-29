"""Recreate the authored damp-pier source from retained imagegen inputs.

The weathered appearance is a visual design study, not evidence of the
historical bridge's waterline or stone condition.
Usage: python Script_PrepareBeishahePierDampSource.py --input-dir <References> --output <png>
"""
import argparse
import hashlib
from pathlib import Path

from PIL import Image

SOURCES = (
    ("Source_BeishahePierStoneBlend40.png", "07b6f5401f493ace8cc482474cbbcefc73b978d5672ca630782b5ac4b1da4758"),
    ("Source_BeishahePierDampWeatherV1.png", "353362ff95c1e1b6151aaddef24d1643b4a18140bbc815d3c971316b98d571af"),
)
EXPECTED_OUTPUT_SHA256 = "df20f4fd7d7925634f7880f03f60988ff3a90fee23b244afe7055a3c76fea6c3"


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
    Image.blend(images[0], images[1], .2).save(args.output)
    digest = Sha256(args.output)
    if digest != EXPECTED_OUTPUT_SHA256:
        raise SystemExit(f"Output hash differs from retained source: {digest}")
    print(f"{args.output}: {digest}")


if __name__ == "__main__":
    main()
