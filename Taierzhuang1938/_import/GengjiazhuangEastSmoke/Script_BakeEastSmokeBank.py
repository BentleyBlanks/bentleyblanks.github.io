"""Bake the advecting soot canopy and its porous edges as a TVOL density sequence."""

import argparse
import gzip
import hashlib
import json
from math import pi
from pathlib import Path
import struct

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, grey_closing, map_coordinates, median_filter


ASSET = "EastSmokeBank"
SOURCE = Path(__file__).resolve().parent
OUTPUT = SOURCE.parents[1] / "Volume"
GUIDE = SOURCE / "Source_EastSmokeOpticalDepth.bin"
GUIDE_SIZE = (320, 180)
SIZE = (240, 112, 52)
TILES = (2, 2, 1)
BOUNDS = (184, 65, 112)
ORIGIN = (0, 0, -69)
FRAME_COUNT = 4

# World metres. Each row is x, y, z, three Gaussian radii and optical mass.
# Keep the primary outlet short and narrow, then spread overlapping rolls
# downwind. The other traces feed the broad canopy at different distances.
OUTLET = (
    (14.1, 4.4, -53, 1.5, 1.2, 2.3, .48),
    (14.9, 6.0, -56, 2.4, 1.9, 2.9, .53),
    (17.4, 8.6, -59, 3.3, 2.5, 3.8, .62),
    (21.3, 10.9, -62, 4.5, 3.4, 5.3, .66),
    (26.6, 13.9, -65, 6.0, 4.3, 6.2, .67),
    (32.5, 17.7, -71, 7.2, 4.4, 7.2, .73),
    (39.0, 21.1, -76, 9.1, 5.0, 7.8, .75),
    (47.1, 23.4, -80, 10.5, 5.3, 8.9, .73),
    (58.5, 27.1, -88, 11.5, 6.4, 10.7, .64),
    (68.2, 32.0, -96, 14.7, 7.7, 12.2, .63),
    (82.4, 34.4, -105, 16.5, 9.5, 13.2, .47),
)
VILLAGE = (
    (-8.7, 3.25, -66, 2.8, 1.1, 2.4, .33),
    (-6.7, 6.6, -69, 4.7, 2.8, 4.8, .41),
    (-2.0, 9.2, -74, 6.1, 3.5, 6.5, .45),
    (6.5, 13.6, -81, 9.1, 5.2, 7.4, .46),
    (16.2, 17.8, -88, 13.4, 6.7, 10.0, .42),
    (28.8, 20.6, -95, 15.3, 7.4, 12.4, .47),
    (42.1, 24.0, -103, 18.0, 7.9, 12.7, .41),
)
DISTANT = (
    (-56, 3.9, -103, 17, 3.2, 7.3, .12),
    (-43, 6.5, -101, 16, 4.6, 8.0, .17),
    (-30, 11.9, -96, 12, 4.5, 8.7, .25),
    (-18, 17.6, -93, 12.3, 5.2, 8.1, .22),
    (-7, 23.1, -93, 18, 5.8, 9.8, .20),
    (7, 28.0, -103, 21, 7.9, 11.3, .22),
    (23, 33.5, -105, 24, 8.6, 12.4, .29),
    (45, 39.4, -103, 27, 9.8, 15.5, .31),
    (65, 44.1, -102, 28, 10.5, 14.7, .38),
    (24, 49, -114, 24, 9.0, 10.5, .18),
)


def Ease(value, low, high):
    t = np.clip((value - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def Nodes(coordinates, bubbles):
    x, y, z = coordinates
    field = np.zeros(x.shape, dtype=np.float32)
    for ox, oy, oz, sx, sy, sz, mass in bubbles:
        d2 = ((x-ox)/sx)**2 + ((y-oy)/sy)**2 + ((z-oz)/sz)**2
        field += mass * np.exp(-.72*d2) * (1 - Ease(d2, 1.60, 3.25))
    return field


def ReadLuminance(path):
    with Image.open(path) as image:
        luminance = np.asarray(image.convert("L").resize(GUIDE_SIZE, Image.Resampling.LANCZOS), dtype=np.float32)
    return gaussian_filter(grey_closing(median_filter(luminance, size=3), size=(3, 3)), .62)


def UpdateOpticalGuide(reference, calibration=None):
    """Measure smoke contrast aloft, excluding people, roofs and tree branches."""
    width, height = GUIDE_SIZE
    luminance = ReadLuminance(reference)
    x = (np.arange(width) + .5)/width
    y = (np.arange(height) + .5)/height
    # Below the last useful visible sky sample the silhouette is provided by
    # the spatial smoke outlets. Keep bare branches out of the density guide.
    horizon = np.interp(x, [0,.12,.17,.26,.33,.44,.54,.62,.68,.75,.82,.89,1],
        [.493,.482,.444,.440,.466,.448,.453,.440,.432,.452,.429,.459,.433])
    taper = 1 - Ease(y[:, None] - horizon[None, :], -.019, .002)
    unobscured = 132 + 18*Ease(y, .03, .38)
    # Use luminance only for a target optical depth. Runtime never copies
    # any plate color or pixels into the game camera.
    linear = lambda code: (np.maximum(code, 0)/255)**2.18
    scattered = linear(43)
    transmittance = np.clip((linear(luminance)-scattered)/(linear(unobscured[:, None])-scattered), .08, 1)
    opticalDepth = -np.log(transmittance)
    if calibration:
        clear, rendered = (ReadLuminance(path) for path in calibration)
        scattered = linear(53)
        incident = np.maximum(linear(clear) - scattered, .008)
        target = np.clip((linear(luminance) - scattered) / incident, .10, 1)
        actual = np.clip((linear(rendered) - scattered) / incident, .10, 1)
        # Fit the density residual in the renderer's recorded light. Keep the
        # correction coarse so branches and silhouette pixels cannot seed smoke.
        delta = np.clip(np.log(actual / target), -.66, .86)
        opticalDepth += gaussian_filter(delta * taper, sigma=1.55) * 1.12
    opticalDepth *= taper
    GUIDE.write_bytes((np.clip(opticalDepth/2.6, 0, 1)*255+.5).astype(np.uint8).tobytes())


def GenerateFrames():
    nx, ny, nz = SIZE
    bx, by, bz = BOUNDS
    _, _, originZ = ORIGIN
    pixels = np.indices((nz, ny, nx), dtype=np.float32)
    uz, uy, ux = (pixels[0]+.5)/nz, (pixels[1]+.5)/ny, (pixels[2]+.5)/nx
    x, y, z = (ux-.5)*bx, uy*by, (uz-.5)*bz+originZ
    radius = Ease(y, 4, 28)
    edges = Ease(ux, 0, .13)*Ease(1-ux, 0, .095)*Ease(uz, 0, .105)*Ease(1-uz, 0, .135)
    edges *= Ease(y, .2, 3.7)*Ease(1-uy, 0, .06)
    rng = np.random.default_rng(0x193807C)
    scales = ((22, 16, 29), (34, 24, 52), (58, 49, 91))
    fields = [[rng.uniform(-1, 1, size).astype(np.float32) for _ in range(3)] for size in scales]
    coordinates = np.stack((uz, uy, ux))
    width, height = GUIDE_SIZE
    guide = np.frombuffer(GUIDE.read_bytes(), dtype=np.uint8).reshape(height, width).astype(np.float32) * (2.6/255)
    pitch = -.4*pi/180
    halfFov = np.tan(43*pi/360)
    eyeY = y - 1.45
    depth = np.sin(pitch)*eyeY - np.cos(pitch)*z
    vertical = np.cos(pitch)*eyeY + np.sin(pitch)*z
    screenU = .5+x/(2*halfFov*depth*(16/9))
    screenV = .5-vertical/(2*halfFov*depth)
    # Put dense curls closer on the right and spread thin smoke along
    # a second, deeper air layer. Integrating both gives the guided shape.
    downwind = Ease(screenU, .26, .78)
    loft = Ease(1-screenV, .48, .96)
    centerZ = -98 + 29*downwind - 10*loft
    depthSpread = 10.5 + 3*loft
    secondaryZ = centerZ - 15 + 9*loft

    def Noise(level, channel, time):
        table = fields[level][channel]
        sample = coordinates*np.array(table.shape, np.float32)[:, None, None, None]
        sample[2] -= .52*np.sin(time + 1.12*channel) + .18*np.cos(2*time + uy*5)
        sample[1] -= .28*np.cos(time + uz*3 + channel)
        return map_coordinates(table, sample, order=1, mode="grid-wrap", prefilter=False)

    for frame in range(FRAME_COUNT):
        time = frame * 2*pi / FRAME_COUNT
        billows = [Noise(0, i, time) for i in range(3)]
        eddies = [Noise(1, i, time) for i in range(2)]
        grain = Noise(2, 0, time)
        point = (x + billows[0]*(.6 + 8.5*radius) + eddies[0]*(.40+2.30*radius),
                 y + billows[1]*(.41 + 6.1*radius) + eddies[1]*(.31+2.1*radius),
                 z + billows[2]*(.68 + 7.2*radius) + grain*(.24+1.7*radius))
        outlet, outletShoulder, village, distant = (
            Nodes(point, group) for group in (OUTLET[:5], OUTLET[5:], VILLAGE, DISTANT))
        roll = .8 + .82*billows[2] + .59*eddies[0] + .19*grain
        distantMix = .23 + .84*Ease(eddies[1] + .64*billows[0], -.31, .38)
        # Each density sample lives in world space. A small deforming offset
        # fans out the reference footprint over two depths in the smoke bank.
        vel = (.0008 + .0027*radius)
        guideU = screenU + vel*(billows[0]+.72*np.sin(time + uz*2))
        guideV = screenV + vel*(billows[1]-.35*np.cos(time + uz*3))
        optical = map_coordinates(guide, [guideV*height-.5,guideU*width-.5], order=1, mode="nearest", prefilter=False)
        foreground = np.exp(-.5*((point[2]-centerZ)/depthSpread)**2)/(depthSpread*2.5066)
        background = np.exp(-.5*((point[2]-secondaryZ)/15)**2)/(15*2.5066)
        guided = optical*(foreground*.77 + background*.23)*(.79 + .30*Ease(eddies[0]+grain*.43,-.65,.55))
        native = (outlet*.50 + outletShoulder*.18 + village*.07 + distant*distantMix*.015)*np.maximum(.13, roll)
        guidedStrength = .77 + .18*Ease(screenV,.18,.40) + .09*downwind
        density = np.clip(guided*3.4*guidedStrength + native, 0, 1) * edges
        yield ((np.sqrt(density)*127 + .5).astype(np.uint8)*2)


def Build():
    nx, ny, nz = SIZE
    tx, ty, tz = TILES
    atlas = np.zeros((nz*tz, ny*ty, nx*tx), dtype=np.uint8)
    for i, frame in enumerate(GenerateFrames()):
        x, y, z = (i % tx)*nx, ((i//tx) % ty)*ny, (i//(tx*ty))*nz
        atlas[z:z+nz, y:y+ny, x:x+nx] = frame
    metadata = {
        "version": 1, "asset": ASSET, "source": "authored", "encoding": "sqrt-unorm8",
        "dimensions": list(SIZE), "atlasTiles": list(TILES), "channels": 1,
        "frames": FRAME_COUNT, "duration": 8, "sourceFrameIndices": list(range(FRAME_COUNT)),
        "anchor": [.5, 0, .5],
    }
    header = json.dumps(metadata, separators=(",", ":")).encode()
    data = gzip.compress(b"TVOL" + struct.pack("<I", len(header)) + header + atlas.tobytes(), compresslevel=8, mtime=0)
    (OUTPUT / f"Volume_{ASSET}.bin.gz").write_bytes(data)
    report = {**metadata, "boundsM": BOUNDS, "anchorPositionM": ORIGIN, "gpuBytes": atlas.nbytes,
              "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    (OUTPUT / f"Data_{ASSET}Volume.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(ASSET, len(data), "bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--calibrate", nargs=2, type=Path, metavar=("CLEAR", "SMOKE"))
    args = parser.parse_args()
    if args.calibrate and not args.reference:
        parser.error("--calibrate requires --reference")
    if args.reference:
        UpdateOpticalGuide(args.reference, args.calibrate)
    Build()
