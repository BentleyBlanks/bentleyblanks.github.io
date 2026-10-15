"""Encode Blender's approved, delit original-UV atlases and audit their channels."""
from pathlib import Path
import argparse
import os
import subprocess
import sys
from PIL import Image

project = Path(__file__).resolve().parents[1]
defaultSource = Path(os.environ.get("ZB26_SOURCE_DIR", "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Zb26/Iterations/Manufacture20261015")) / "SourceMaps"


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=defaultSource)
    args = parser.parse_args()
    for stem in ("Zb26VeteranSteel", "Zb26VeteranWood"):
        for channel in ("Base", "Normal", "Orm"):
            source = args.source / ("Texture_" + stem + channel + "Source.png")
            target = project / "Texture" / ("Texture_" + stem + channel + ".webp")
            with Image.open(source) as image:
                image = image.convert("RGB")
                # Spatial ORM tolerates modest scalar quantization; keep tangent
                # normals at high quality so grazing highlights remain smooth.
                # Final UV-covered steel albedo measures 41.49 dB at q88; retain q95
                # for the 2K normal map carrying the shallow maker's stamp.
                quality = (88 if stem == "Zb26VeteranSteel" else 90) if channel == "Base" else 82 if channel == "Orm" else 95
                image.save(target, "WEBP", quality=quality, method=6)
            print(target.name, target.stat().st_size, flush=True)
        # Preserve Cycles' baked tangent normals and spatial roughness/metalness;
        # inferring these from the albedo would turn bluing wear into false bumps.
        subprocess.run([sys.executable, str(project / "_import/Script_BakePbrTexture.py"),
                        "--audit", "--name", stem, "--normal-convention", "gl"], check=True)


if __name__ == "__main__":
    Main()
