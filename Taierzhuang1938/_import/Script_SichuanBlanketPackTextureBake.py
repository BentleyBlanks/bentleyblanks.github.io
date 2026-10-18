"""Bake the independent Sichuan blanket pack's four-quadrant imagegen atlas.

The persistent source and original prompt stay beside the Blender source under
OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/Source. The shared
baker writes the WebP maps and its reproducible SHA-256 bake record.
This is an authored UV atlas, so no tiling blend, colour matching or flattening
may mix the light blanket, straw, grey straps and indigo jacket quadrants.
"""

import argparse
from pathlib import Path
import shutil
import subprocess
import sys


ATLAS_REASON = (
    "Authored four-material UV atlas for the independent 1938 Sichuan blanket "
    "pack: upper-left worn off-white homespun blanket, upper-right straw weave, "
    "lower-left grey cloth straps, lower-right civilian indigo homespun jacket. "
    "The quadrants deliberately differ in albedo and do not tile into one "
    "another; the source has flat diffuse illumination without cast shadows."
)


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    projectPath = Path(__file__).resolve().parent.parent
    outputPath = projectPath / "Model/SichuanBlanketPack"
    command = [
        sys.executable, str(Path(__file__).with_name("Script_BakePbrTexture.py")),
        "--source", str(args.source.resolve()),
        "--name", "SichuanBlanketPack", "--preset", "sichuanBlanketPackAtlas",
        "--tile-m", "0.76", "--size", "1024", "--data-size", "1024",
        "--seamless", "none", "--row-flatten", "off", "--no-flatten",
        "--keep-tone", "--height-fine-weight", "0.9",
        "--normal-convention", "gl", "--normal-strength", "0.65",
        "--rough-min", "0.86", "--data-lossless", "--base-quality", "86",
        "--out", str(outputPath),
        "--uv-atlas-reason", ATLAS_REASON, "--strict",
    ]
    if args.dry_run:
        command.append("--dry-run")
    result = subprocess.run(command, check=False)
    if result.returncode == 0 and not args.dry_run:
        # Independent model authoring maps are not Texture/ runtime requests.
        # Keep their source prompt and machine record together, outside the
        # shared Texture manifest's Prompts/TextureBakes ownership directories.
        recordPath = projectPath / "_import/SichuanBlanketPack/Data_SichuanBlanketPackTextureBake.json"
        recordPath.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(
            str(projectPath / "_import/TextureBakes/Texture_SichuanBlanketPack.json"),
            str(recordPath),
        )
        print(f"Independent model texture record: {recordPath}")
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(Main())
