"""Bake the sunken road's rolling mid-distance haze to the TVOL format."""

import argparse
import gzip
import hashlib
import json
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates


VOLUMES = Path(__file__).resolve().parents[2] / "Volume"
GUIDE = Path(__file__).with_name("Source_DitchHazeOpticalDepth.bin.gz")
GUIDE_SIZE = (320, 180)
ASSET = "SunkenRoadHaze"
BOUNDS = (96, 35, 48)
DIMENSIONS = (72, 44, 24)
TILES = (4, 3, 2)
FRAMES = math.prod(TILES)
DURATION = 8
ORIGIN = (11.2, .95, -62.4)
EXTINCTION = .408

# World-local metres from the base of the volume. Roll spreads downwind as it cools.
LOBES = [
    ((-24,  3.8,   8), ( 3.4, 3.6,  6.0), .18),
    ((-20,  6.8,   6), ( 4.6, 5.2,  6.4), .24),
    ((-15, 11.0,   4), ( 5.2, 5.6,  7.8), .29),
    ((-10, 14.1,   1), ( 6.5, 5.9,  8.6), .37),
    (( -5, 16.5,  -3), ( 8.3, 6.6, 10.5), .35),
    ((  4, 14.2,  -4), ( 9.0, 6.4, 12.4), .28),
    (( 13, 13.3,  -6), (11.7, 7.6, 13.4), .25),
    (( 23, 11.0,  -8), (12.7, 7.3, 12.1), .18),
    (( 28,  6.7,  -6), (12.5, 4.9, 12.4), .10),
    (( -2,  3.1,   6), (17.0, 2.7, 12.8), .07),
    (( 17,  3.0,   2), (22.8, 2.3, 14.7), .08),
]


def Smooth(low, high, value):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def UpdateOpticalGuide(reference, clear, rendered):
    def Luminance(path):
        with Image.open(path) as image:
            sample = np.asarray(image.convert("L").resize(GUIDE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32)
        return (gaussian_filter(sample, 1.45) / 255) ** 2.18

    width, height = GUIDE_SIZE
    u, v = np.meshgrid((np.arange(width) + .5) / width, (np.arange(height) + .5) / height)
    # Limit the fit to open air. The farmhouse, trees, aircraft and road supply
    # their own geometry, so none of their outlines enter this density guide.
    fade = (Smooth(.29, .385, u) * (1 - Smooth(.747, .795, u))
            * Smooth(.35, .425, v) * (1 - Smooth(.688, .743, v)))
    scattered = (66 / 255) ** 2.18
    incident = np.maximum(Luminance(clear) - scattered, .008)
    target = np.clip((Luminance(reference) - scattered) / incident, .12, 1)
    actual = np.clip((Luminance(rendered) - scattered) / incident, .12, 1)
    correction = gaussian_filter(np.clip(np.log(actual / target), -.8, 1.2) * fade, 1.35)
    if GUIDE.exists():
        previous = np.frombuffer(gzip.decompress(GUIDE.read_bytes()), dtype=np.uint8).reshape(height, width) / 127.5 - .8
        correction = np.clip(previous + correction, -.8, 1.2)
    quantized = np.rint((correction + .8) * 127.5).astype(np.uint8).tobytes()
    GUIDE.write_bytes(gzip.compress(quantized, compresslevel=9, mtime=0))


def Bake(check):
    nx, ny, nz = DIMENSIONS
    tx, ty, tz = TILES
    wx, wy, wz = BOUNDS
    x, y, z = np.meshgrid(np.linspace(-wx / 2, wx / 2, nx, dtype=np.float32),
                          np.linspace(0, wy, ny, dtype=np.float32),
                          np.linspace(-wz / 2, wz / 2, nz, dtype=np.float32), indexing="ij")
    # The guide adjusts extinction, sampled into actual world-space depth
    # bands. The renderer receives a scalar field with no plate colors.
    width, height = GUIDE_SIZE
    guideBytes = gzip.decompress(GUIDE.read_bytes())
    guide = np.frombuffer(guideBytes, dtype=np.uint8).reshape(height, width).astype(np.float32) / 127.5 - .8
    eyeY, worldZ = y + ORIGIN[1] - 1.55, z + ORIGIN[2]
    pitch, halfFov = math.radians(15.3), math.tan(math.radians(57 / 2))
    depth = math.sin(pitch) * eyeY - math.cos(pitch) * worldZ
    vertical = math.cos(pitch) * eyeY + math.sin(pitch) * worldZ
    screenU = .5 + (x + ORIGIN[0]) / (2 * halfFov * depth * (16 / 9))
    screenV = .5 - vertical / (2 * halfFov * depth)

    def Gaussian(center, width):
        return np.exp(-.5 * ((worldZ - center) / width) ** 2) / (math.sqrt(math.tau) * width)

    sheet = (.69 * Gaussian(-56 - 12 * Smooth(.51, .76, screenU), 8.6)
             + .31 * Gaussian(-73, 8.1)) / EXTINCTION
    rng = np.random.default_rng(193805)
    lattices = [rng.random((n, n, n), dtype=np.float32) for n in (11, 21, 35)]
    atlas = np.zeros((nz * tz, ny * ty, nx * tx), dtype=np.uint8)
    # Vanish at the box boundary and below the ground surface.
    edge = np.minimum(np.minimum(wx / 2 - abs(x), wz / 2 - abs(z)), np.minimum(y, wy - y))
    edge = np.clip(edge / 5, 0, 1)
    edge *= edge * (3 - 2 * edge)
    for frame in range(FRAMES):
        angle = frame * math.tau / FRAMES
        co, si = math.cos(angle), math.sin(angle)
        noise = np.zeros_like(x)
        for grid, scale, amount in zip(lattices, (11.5, 5.3, 2.25), (.64, .29, .17), strict=True):
            coords = np.stack(((x + y * .24 + co * .7) / scale, (y + si * .6) / scale,
                               (z + x * .16 + co * .46) / scale))
            noise += amount * (map_coordinates(grid, coords, order=3, mode="grid-wrap") - .5)
        density = np.zeros_like(x)
        for index, ((cx, cy, cz), (rx, ry, rz), weight) in enumerate(LOBES):
            phase = index * .73 + angle
            u = (x - cx - math.cos(phase) * .78 - noise * 5.2) / rx
            v = (y - cy - math.sin(phase) * .41 - noise * 2.6 - u * ry * .18) / ry
            w = (z - cz + noise * 3.3) / rz
            density += weight * np.exp(-(u*u + v*v + w*w) * .66)
        density *= np.clip(.67 + 2.80 * noise, .05, 1.45)
        drift = noise * .009 + si * .0025
        correction = map_coordinates(guide, [(screenV + .63*drift)*height - .5, (screenU - drift)*width - .5],
                                     mode="nearest", order=1, prefilter=False)
        density = (density + correction * sheet) * edge
        encoded = np.rint(np.sqrt(np.clip(density, 0, 1)) * 255).astype(np.uint8).transpose(2, 1, 0)
        ix, iy, iz = frame % tx, frame // tx % ty, frame // (tx * ty)
        atlas[iz*nz:(iz+1)*nz, iy*ny:(iy+1)*ny, ix*nx:(ix+1)*nx] = encoded

    metadata = dict(version=1, asset=ASSET, dimensions=DIMENSIONS, atlasTiles=TILES, frames=FRAMES,
                    duration=DURATION, anchor=[.5, 0, .5], channels=1, encoding="sqrt-unorm8",
                    source="authored", sourceType="procedural", sourceFrameIndices=list(range(FRAMES)))
    header = json.dumps(metadata, separators=(",", ":")).encode("utf-8")
    payload = b"TVOL" + struct.pack("<I", len(header)) + header + atlas.tobytes()
    packed = gzip.compress(payload, compresslevel=9, mtime=0)
    output = VOLUMES / f"Volume_{ASSET}.bin.gz"
    report = dict(**metadata, boundsM=BOUNDS, file=output.name, compressedBytes=len(packed),
                  gpuBytes=atlas.nbytes, sha256=hashlib.sha256(packed).hexdigest(),
                  opticalGuideSha256=hashlib.sha256(guideBytes).hexdigest(),
                  recipe="_import/AircraftEvacuationDitch/Script_BakeDitchHaze.py")
    reportPath = VOLUMES / f"Data_{ASSET}Volume.json"
    reportBody = json.dumps(report, indent=2) + "\n"
    if check:
        if output.read_bytes() != packed or reportPath.read_text(encoding="utf-8") != reportBody:
            raise SystemExit("TVOL or sidecar differs from the haze recipe")
    else:
        output.write_bytes(packed)
        reportPath.write_text(reportBody, encoding="utf-8", newline="\n")
    print(f"{ASSET}: {FRAMES} frames, {len(packed):,} bytes transfer, {atlas.nbytes:,} bytes GPU")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--calibrate", type=Path, nargs=3, metavar=("REFERENCE", "CLEAR_RENDER", "LIVE_RENDER"))
    args = parser.parse_args()
    if args.calibrate:
        UpdateOpticalGuide(*args.calibrate)
    Bake(args.check)
