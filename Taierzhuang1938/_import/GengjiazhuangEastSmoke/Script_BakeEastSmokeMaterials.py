"""Rebuild the EastSmokeField layers from the retained orthographic material scans."""

from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent))
from Script_BakePbrTexture import Bake, ParseArgs


LAYERS = (
    ("CutLoam", "1.65", "0.390,0.343,0.288", "0.085", "0.024", "0.30"),
    ("StubbleSoil", "2.4", "0.385,0.350,0.310", "0.099", "0.017", "0.38"),
)


def Main():
    for name, tile, mean, contrast, relief, fine in LAYERS:
        args = ParseArgs([
            "--source", str(HERE / f"Source_{name}.webp"), "--name", f"TerrainEastSmoke{name}",
            "--preset", "drySoil", "--tile-m", tile, "--mean", mean, "--contrast", contrast,
            "--normal-convention", "terrain", "--pack", "orh", "--relief-m", relief,
            "--height-fine-weight", fine, "--rough", "0.94", "--rough-var", "0.051",
            "--ao", "0.49", "--row-flatten", "on", "--flatten-sigma", "0.19",
            "--base-quality", "73", "--data-quality", "72", "--strict",
        ])
        if Bake(args):
            raise RuntimeError(f"Terrain layer did not pass the texture bake checks: {name}")


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    Main()
