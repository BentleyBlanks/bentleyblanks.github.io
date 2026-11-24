"""Bake the fire plume and rolling mid-distance haze to the TVOL format."""

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
FIRE_GUIDE = Path(__file__).with_name("Source_DitchFireOpticalDepth.bin.gz")
GUIDE_SIZE = (320, 180)
ASSET = "SunkenRoadHaze"
BOUNDS = (96, 35, 48)
DIMENSIONS = (72, 44, 24)
TILES = (4, 3, 2)
FRAMES = math.prod(TILES)
DURATION = 8
ORIGIN = (11.2, .95, -62.4)
EXTINCTION = .378
FIRE_ASSET = "DitchFireSmoke"
FIRE_ORIGIN = (-12.0, .2, -23.0)
FIRE_BOUNDS = (41, 32, 36)
FIRE_DIMENSIONS = (64, 72, 48)
FIRE_TILES = (4, 3, 1)
FIRE_EXTINCTION = .69

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


def Luminance(path):
    with Image.open(path) as image:
        sample = np.asarray(image.convert("L").resize(GUIDE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32)
    return (gaussian_filter(sample, 1.45) / 255) ** 2.18


def UpdateOpticalGuide(reference, clear, rendered):
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


def UpdateFireGuide(reference, clear):
    width, height = GUIDE_SIZE
    u, v = np.meshgrid((np.arange(width) + .5) / width, (np.arange(height) + .5) / height)
    roofline = np.interp(u, [.0, .022, .037, .076, .097, .14, .23, .40],
                        [.44, .52, .69, .717, .71, .688, .641, .655])
    fade = Smooth(.02, .14, v) * (1 - Smooth(.35, .438, u))
    fade *= 1 - Smooth(-.023, .002, v - roofline)
    scattered = (48 / 255) ** 2.18
    incident = np.maximum(Luminance(clear) - scattered, .005)
    target = np.clip((Luminance(reference) - scattered) / incident, .12, 1)
    optical = gaussian_filter(-np.log(target) * fade, 1.07)
    quantized = np.rint(np.clip(optical / 2.2, 0, 1) * 255).astype(np.uint8).tobytes()
    FIRE_GUIDE.write_bytes(gzip.compress(quantized, compresslevel=9, mtime=0))


def BakeFire(check):
    nx, ny, nz = FIRE_DIMENSIONS
    tx, ty, tz = FIRE_TILES
    width, height = GUIDE_SIZE
    wx, wy, wz = FIRE_BOUNDS
    ox, oy, oz = FIRE_ORIGIN
    guideBytes = gzip.decompress(FIRE_GUIDE.read_bytes())
    opticalGuide = np.frombuffer(guideBytes, dtype=np.uint8).reshape(height, width).astype(np.float32) * (2.2 / 255)
    z, y, x = np.meshgrid(np.linspace(oz - wz / 2, oz + wz / 2, nz, dtype=np.float32),
                          np.linspace(oy, oy + wy, ny, dtype=np.float32),
                          np.linspace(ox - wx / 2, ox + wx / 2, nx, dtype=np.float32), indexing="ij")
    pitch, halfFov = math.radians(15.3), math.tan(math.radians(57 / 2))
    sin, cos = math.sin(pitch), math.cos(pitch)
    eye = y - 1.55
    depth = sin * eye - cos * z
    vertical = cos * eye + sin * z
    u, v = .5 + x / (2 * halfFov * depth * (16 / 9)), .5 - vertical / (2 * halfFov * depth)
    loft = Smooth(.18, .74, 1 - v)
    center = -13.2 - loft * 11
    spread = 1.51 + loft * 4.4
    core = np.exp(-.5 * ((z - center) / spread) ** 2) / (math.sqrt(math.tau) * spread)
    veil = np.exp(-.5 * ((z - center + 7.6) / 5.4) ** 2) / (math.sqrt(math.tau) * 5.4)
    fades = (Smooth(0, 2.1, wx / 2 - abs(x - ox)) * Smooth(0, 2.1, wz / 2 - abs(z - oz))
             * Smooth(.1, .95, y - oy) * Smooth(0, 2, oy + wy - y))
    # Dense curls rise from the physical fire position into larger rolls. The
    # guide distributes extinction over both depths around these moving rolls.
    bubbles = [
        (-10.75, 1.7, -12.50, .39, .62, .67, .19),
        (-11.45, 2.6, -13.4, .63, .75, .91, .29),
        (-12.63, 3.6, -15.2, .92, 1.02, 1.44, .31),
        (-13.83, 4.9, -17.22, 1.48, 1.38, 1.88, .34),
        (-13.96, 6.63, -18.6, 1.87, 1.73, 2.35, .37),
        (-14.53, 8.11, -20.17, 1.61, 1.88, 2.58, .33),
        (-15.25, 10.28, -22.8, 3.27, 2.37, 3.48, .29),
        (-14.37, 11.57, -23.80, 2.93, 1.73, 2.67, .37),
        (-15.79, 13.41, -23.4, 2.91, 2.42, 3.49, .27),
        (-14.59, 15.8, -26.31, 4.10, 2.77, 4.05, .26),
        (-15.42, 17.83, -26.8, 3.23, 2.61, 4.31, .24),
        (-13.91, 19.61, -28.9, 3.05, 2.64, 3.53, .17),
    ]
    random = np.random.default_rng(19380501)
    coarse = random.uniform(-1, 1, (19, 13, 22)).astype(np.float32)
    fine = random.uniform(-1, 1, (35, 24, 38)).astype(np.float32)
    frames = math.prod(FIRE_TILES)
    atlas = np.zeros((nz * tz, ny * ty, nx * tx), dtype=np.uint8)
    for frame in range(frames):
        angle = frame * math.tau / frames
        roll = map_coordinates(coarse, [(z + math.sin(angle)*.69) / 1.51,
                                         (y + math.cos(angle)*.62) / 1.31, (x - .25*y) / 1.57],
                               order=3, mode="grid-wrap")
        eddy = map_coordinates(fine, [z / .78, (y + math.sin(angle)*.38) / .74,
                                       (x + math.cos(angle)*.40) / .89], order=1, mode="grid-wrap")
        footprint = .0059*roll + .0016*eddy
        optical = map_coordinates(opticalGuide, [(v + .7*footprint)*height - .5, (u + footprint)*width - .5],
                                  order=1, mode="nearest", prefilter=False)
        density = optical * (.76*core + .24*veil) * (.86 + roll*.29 + eddy*.12) / FIRE_EXTINCTION
        for index, (cx, cy, cz, sx, sy, sz, mass) in enumerate(bubbles):
            phase = angle + index * 1.37
            dx = (x - cx - .15*math.sin(phase) - roll*sx*.32) / sx
            dy = (y - cy - .17*math.cos(phase) + eddy*sy*.23) / sy
            dz = (z - cz - roll*sz*.38) / sz
            curl = dx*dx + dy*dy + dz*dz
            density += mass * .65 * np.exp(-.72*curl) * (1 - Smooth(1.55, 3.1, curl)) * (.85 + roll*.33)
        encoded = np.rint(np.sqrt(np.clip(density*fades, 0, 1)) * 255).astype(np.uint8)
        ix, iy, iz = frame % tx, frame // tx % ty, frame // (tx * ty)
        atlas[iz*nz:(iz+1)*nz, iy*ny:(iy+1)*ny, ix*nx:(ix+1)*nx] = encoded

    WriteVolume(FIRE_ASSET, FIRE_DIMENSIONS, FIRE_TILES, 6, FIRE_BOUNDS, atlas, guideBytes, check)


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
        density *= np.clip(.67 + 3.95 * noise, .05, 1.65)
        drift = noise * .009 + si * .0025
        correction = map_coordinates(guide, [(screenV + .63*drift)*height - .5, (screenU - drift)*width - .5],
                                     mode="nearest", order=1, prefilter=False)
        density = (density + correction * sheet) * edge
        encoded = np.rint(np.sqrt(np.clip(density, 0, 1)) * 255).astype(np.uint8).transpose(2, 1, 0)
        ix, iy, iz = frame % tx, frame // tx % ty, frame // (tx * ty)
        atlas[iz*nz:(iz+1)*nz, iy*ny:(iy+1)*ny, ix*nx:(ix+1)*nx] = encoded

    WriteVolume(ASSET, DIMENSIONS, TILES, DURATION, BOUNDS, atlas, guideBytes, check)


def WriteVolume(asset, dimensions, tiles, duration, bounds, atlas, guideBytes, check):
    frames = math.prod(tiles)
    metadata = dict(version=1, asset=asset, dimensions=dimensions, atlasTiles=tiles, frames=frames,
                    duration=duration, anchor=[.5, 0, .5], channels=1, encoding="sqrt-unorm8",
                    source="authored", sourceType="procedural", sourceFrameIndices=list(range(frames)))
    header = json.dumps(metadata, separators=(",", ":")).encode("utf-8")
    payload = b"TVOL" + struct.pack("<I", len(header)) + header + atlas.tobytes()
    packed = gzip.compress(payload, compresslevel=9, mtime=0)
    output = VOLUMES / f"Volume_{asset}.bin.gz"
    report = dict(**metadata, boundsM=bounds, file=output.name, compressedBytes=len(packed),
                  gpuBytes=atlas.nbytes, sha256=hashlib.sha256(packed).hexdigest(),
                  opticalGuideSha256=hashlib.sha256(guideBytes).hexdigest(),
                  recipe="_import/AircraftEvacuationDitch/Script_BakeDitchHaze.py")
    reportPath = VOLUMES / f"Data_{asset}Volume.json"
    reportBody = json.dumps(report, indent=2) + "\n"
    if check:
        if output.read_bytes() != packed or reportPath.read_text(encoding="utf-8") != reportBody:
            raise SystemExit("TVOL or sidecar differs from the haze recipe")
    else:
        output.write_bytes(packed)
        reportPath.write_text(reportBody, encoding="utf-8", newline="\n")
    print(f"{asset}: {frames} frames, {len(packed):,} bytes transfer, {atlas.nbytes:,} bytes GPU")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--calibrate", type=Path, nargs=3, metavar=("REFERENCE", "CLEAR_RENDER", "LIVE_RENDER"))
    mode.add_argument("--fire-guide", type=Path, nargs=2, metavar=("REFERENCE", "CLEAR_RENDER"))
    args = parser.parse_args()
    if args.calibrate:
        UpdateOpticalGuide(*args.calibrate)
    if args.fire_guide:
        UpdateFireGuide(*args.fire_guide)
    BakeFire(args.check)
    Bake(args.check)
