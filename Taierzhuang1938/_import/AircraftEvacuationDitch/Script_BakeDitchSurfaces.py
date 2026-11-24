"""Bake the cut loess and rooted verge layers with the shared terrain PBR baker."""

import sys
from pathlib import Path


IMPORT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(IMPORT))
from Script_BakePbrTexture import Bake, ParseArgs


def Main():
    for layer, source, preset, tile, mean, contrast, relief, flatten, detail, fine in [
        ("DitchCutLoess", "AircraftEvacuationDitch/Source_CutBank.webp", "rammedEarth",
         "1.21", "0.448,0.391,0.341", "0.062", "0.0085", ".10", ".22", ".16"),
        ("DitchRootedVerge", "DugoutAidOpenFields/Source_RootedSod.webp", "drySoil",
         "1.55", "0.431,0.392,0.348", "0.060", "0.0048", ".065", ".5", ".28"),
    ]:
        options = ParseArgs([
            "--source", str(IMPORT / source),
            "--name", f"Terrain{layer}", "--preset", preset, "--tile-m", tile, "--mean", mean,
            "--contrast", contrast, "--relief-m", relief, "--rough", ".93", "--ao", ".21",
            "--normal-convention", "terrain", "--pack", "orh", "--size", "1024", "--data-size", "512",
            "--seamless", "blend", "--row-flatten", "on", "--flatten-sigma", flatten,
            "--detail-balance", detail,
            "--height-fine-weight", fine, "--base-quality", "77", "--data-quality", "83", "--strict",
        ])
        if Bake(options):
            raise SystemExit(f"Failed to bake {layer}")


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    Main()
