"""Bake the east track smoke as animated world-space optical density."""

import argparse
import gzip
import hashlib
import json
from pathlib import Path
import struct
import sys

import numpy as np
from scipy.ndimage import gaussian_filter, map_coordinates


HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / "GengjiazhuangEastSmoke"))
from Script_BakeEastSmokeBank import Ease, GUIDE_SIZE, Nodes, ReadLuminance

ASSET = "EastTrackSoot"
GUIDE = HERE / "Source_EastTrackOpticalDepth.bin"
BOUNDS = (116, 31, 86)
ORIGIN = (0, -.24, -62)
SIZE = (192, 80, 37)
TILES = (3, 2, 1)
FRAME_COUNT = 6

# Short ascending roots connect the fire and the left source to the suspended
# density field. Each node is x, y, z, three radii and optical mass.
OUTLETS = (
    (-10.6,1.4,-44,1.4,1.5,2.8,.09),
    (-10.1,3.0,-46,2.4,1.9,4.1,.17),
    (-8.8,4.6,-49,3.5,2.2,5.2,.17),
    (-7,6.3,-53,4.9,2.7,5.7,.13),
    (15.3,1.7,-39,1.8,1.4,3.5,.13),
    (14.7,3.4,-42,2.8,2.1,4.5,.19),
    (14,5.5,-46,4.5,2.9,6.4,.20),
    (12.8,7.4,-50,5.7,3.4,7.7,.14),
)


def MeasureOpticalDepth(reference, clear=None, rendered=None, refine=False):
    target = ReadLuminance(reference)
    width, height = GUIDE_SIZE
    u, v = np.meshgrid((np.arange(width)+.5)/width, (np.arange(height)+.5)/height)
    # Exclude the crop's tree, ridge and foreground. Closing and smoothing
    # remove the thin branches that cross the remaining sky.
    ridge = np.interp(u, [0,.16,.24,.33,.47,.59,.70,.83,.91,1],
        [.26,.32,.365,.370,.374,.368,.358,.371,.364,.357])
    window = Ease(u,.145,.205) * (1-Ease(v,ridge-.010,ridge+.004))
    clear_luminance = ReadLuminance(clear) if clear else 119 + 14*Ease(v,.05,.39)
    actual = ReadLuminance(rendered) if rendered else None
    # A moved ridge can expose more sky than the older clear frame contained.
    # The newer image is a lower bound for incident light on those rays.
    if actual is not None:
        near_ridge = Ease(v,.323,.356)
        clear_luminance += near_ridge*np.maximum(actual-clear_luminance,0)
    incident = np.clip(clear_luminance, 106, 182)
    linear = lambda n: (np.maximum(n,0)/255)**2.18
    scattered = linear(48)
    transmittance = np.clip((linear(target)-scattered)/(linear(incident)-scattered), .10, 1)
    optical = -np.log(transmittance)*window
    if refine:
        optical = np.frombuffer(GUIDE.read_bytes(),dtype=np.uint8).reshape(height,width).astype(np.float32)*(2.6/255)
    if actual is not None:
        measured = np.clip((linear(actual)-scattered)/(linear(incident)-scattered), .10, 1)
        # Correct the residual measured in the engine's current light. Blurring
        # it before baking keeps independent scenery silhouettes out of the smoke.
        residual = gaussian_filter(np.clip(np.log(measured/transmittance),-.40,.66)*window, 1.38)
        # The horizon has the strongest background light and needs more
        # attenuation than the higher authoring samples for the same display error.
        left_core = Ease(u,.25,.33)*Ease(1-u,.52,.57)*Ease(v,.102,.176)
        gain = .77 + .51*left_core + 1.33*Ease(v,.334,.356) if refine else .77
        optical += gain*residual
    optical = gaussian_filter(optical, .28 if refine else .86)
    GUIDE.write_bytes(np.uint8(np.rint(255*np.clip(optical/2.6,0,1))).tobytes())


def MakeFrames():
    nx, ny, nz = SIZE
    bx, by, bz = BOUNDS
    grid = (np.indices((nz,ny,nx),dtype=np.float32)+.5)/np.array([nz,ny,nx],dtype=np.float32)[:,None,None,None]
    uz, uy, ux = grid
    x, y, z = (ux-.5)*bx + ORIGIN[0], uy*by + ORIGIN[1], (uz-.5)*bz + ORIGIN[2]
    width, height = GUIDE_SIZE
    guide = np.frombuffer(GUIDE.read_bytes(),dtype=np.uint8).reshape(height,width).astype(np.float32)*(2.6/255)
    pitch, half_fov = np.deg2rad(-5.4), np.tan(np.deg2rad(38/2))
    eye_y = y-1.41
    depth = np.sin(pitch)*eye_y - np.cos(pitch)*z
    vertical = np.cos(pitch)*eye_y + np.sin(pitch)*z
    u, v = .5+x/(2*half_fov*depth*(16/9)), .5-vertical/(2*half_fov*depth)
    sheet_center = -58 + 11*Ease(u,.48,.91) - 7*Ease(1-v,.63,.96)
    sheet_width = 6.3 + 2.6*Ease(y,2,14)
    rim = Ease(ux,0,.085)*Ease(1-ux,0,.085)*Ease(uz,0,.12)*Ease(1-uz,0,.13)*Ease(uy,0,.033)*Ease(1-uy,0,.08)
    random = np.random.default_rng(19380612)
    tables = [random.uniform(-1,1,s).astype(np.float32) for s in [(12,18,28),(19,28,46),(33,49,81)]]
    samples = [grid*np.array(table.shape,dtype=np.float32)[:,None,None,None] for table in tables]
    for frame in range(FRAME_COUNT):
        time = frame * 2*np.pi/FRAME_COUNT
        fields = []
        for index, (table, positions) in enumerate(zip(tables,samples)):
            pos = positions.copy()
            pos[2] += np.sin(time + 1.7*index + uy*4.1)*(.48 + .11*index)
            pos[1] += np.cos(time + uz*4.3 + 2.1*index)*.37
            fields.append(map_coordinates(table,pos,order=1,mode="grid-wrap",prefilter=False))
        roll, curl, fine = fields
        offset = .0019 + .0038*Ease(y,2,13)
        optical = map_coordinates(guide, [(v+offset*curl)*height-.5,(u+offset*roll)*width-.5],
            order=1,mode="constant",prefilter=False)
        depth_pos = z + roll*3.4 + curl*1.12
        near = np.exp(-.5*((depth_pos-sheet_center)/sheet_width)**2)/(2.5066*sheet_width)
        far = np.exp(-.5*((depth_pos-sheet_center+17)/10.3)**2)/(2.5066*10.3)
        suspended = optical*(near*.78+far*.22)*(3.38 + .72*curl + .32*fine)
        outlets = Nodes((x+roll*.88,y+curl*.54,z+roll*.6),OUTLETS)*(.62+.22*roll+.23*curl)
        density = np.clip(suspended+outlets,0,1)*rim
        yield np.uint8(np.rint(np.sqrt(density)*127))*2


def Bake():
    folder = HERE.parents[1] / "Volume"
    output = folder / f"Volume_{ASSET}.bin.gz"
    nx, ny, nz = SIZE
    tx, ty, tz = TILES
    atlas = np.zeros((nz*tz,ny*ty,nx*tx),dtype=np.uint8)
    for frame, field in enumerate(MakeFrames()):
        left, bottom = (frame % tx)*nx, (frame//tx)*ny
        atlas[:,bottom:bottom+ny,left:left+nx] = field
    meta = dict(version=1, asset=ASSET, dimensions=SIZE, atlasTiles=TILES,
        frames=FRAME_COUNT, duration=7.2, channels=1, encoding="sqrt-unorm8",
        anchor=(.5,0,.5), sourceFrameIndices=list(range(FRAME_COUNT)), source="authored")
    header = json.dumps(meta,separators=(",",":")).encode("utf-8")
    out = gzip.compress(b"TVOL"+struct.pack("<I",len(header))+header+atlas.tobytes(), compresslevel=8, mtime=0)
    output.write_bytes(out)
    report = dict(meta, file=output.name, gpuBytes=atlas.nbytes, compressedBytes=len(out),
        boundsM=BOUNDS, anchorPositionM=ORIGIN, sha256=hashlib.sha256(out).hexdigest(),
        generator="_import/TanketteAdvanceEastTrack/Script_BakeEastTrackSmoke.py")
    output.with_name(f"Data_{ASSET}Volume.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(f"{ASSET}: {FRAME_COUNT} frames, {atlas.nbytes:,} GPU bytes, {len(out):,} compressed bytes")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--clear", type=Path)
    parser.add_argument("--rendered", type=Path)
    parser.add_argument("--refine", action="store_true")
    args = parser.parse_args()
    if args.clear and not args.reference:
        parser.error("--clear requires --reference")
    if args.rendered and not args.clear:
        parser.error("--rendered requires --clear")
    if args.refine and not args.rendered:
        parser.error("--refine requires --rendered")
    if args.reference:
        MeasureOpticalDepth(args.reference,args.clear,args.rendered,args.refine)
    Bake()
