"""Bake the east track smoke and loose soil as animated optical density."""

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
SIZE = (192, 96, 32)
TILES = (3, 2, 1)
FRAME_COUNT = 6
BURST_SIZE = (30, 44, 24)
BURST_BOUNDS = (1.87, 2.32, 1.61)

# Short ascending roots connect the fire and the left source to the suspended
# density field. Each node is x, y, z, three radii and optical mass.
OUTLETS = (
    (-10.6,1.4,-44,1.4,1.5,2.8,.09),
    (-10.1,3.0,-46,2.4,1.9,4.1,.17),
    (-8.8,4.6,-49,3.5,2.2,5.2,.17),
    (-7,6.3,-53,4.9,2.7,5.7,.13),
    (-10,4.1,-37,1.37,1.18,2.71,.105),
    (-8.15,5.44,-40,1.92,1.67,2.65,.19),
    (-5.78,7.40,-44,2.12,1.41,3.10,.14),
    (15.3,1.7,-39,1.8,1.4,3.5,.13),
    (14.7,3.4,-42,2.8,2.1,4.5,.19),
    (14,5.5,-46,4.5,2.9,6.4,.20),
    (12.8,7.4,-50,5.7,3.4,7.7,.14),
)


def MeasureOpticalDepth(reference, clear=None, rendered=None, refine=False):
    target = ReadLuminance(reference)
    width, height = GUIDE_SIZE
    u, v = np.meshgrid((np.arange(width)+.5)/width, (np.arange(height)+.5)/height)
    # Exclude the tree and the ground when measuring the airborne soot.
    ridge = np.interp(u, [0,.16,.24,.33,.47,.59,.70,.83,.91,1],
        [.26,.32,.365,.370,.374,.368,.358,.371,.364,.357])
    last_sky_sample = np.minimum(ridge-.018,.341)
    sky_rows = [np.minimum(v,last_sky_sample)*height-.5, np.maximum(u,.165)*width-.5]

    def AboveRidge(data):
        return map_coordinates(data, sky_rows, order=1, mode="nearest", prefilter=False)

    # Continue the last clean smoke samples down into the distant surface mist.
    # The height in world space and the depth buffer trim the volume at the ground.
    window = Ease(u,.088,.147) * (1-Ease(v,ridge+.025,ridge+.080))
    incident = AboveRidge(ReadLuminance(clear)) if clear else 118 + 17*Ease(v,.06,.34)
    scattered = (59/255)**2.18

    def Transmission(luminance):
        response = (AboveRidge(luminance)/255)**2.18 - scattered
        return np.clip(response/np.maximum((incident/255)**2.18-scattered,.014), .057, 1)

    transmittance = Transmission(target)
    left_core = Ease(u,.235,.317)*Ease(1-u,.52,.57)*Ease(v,.11,.184)
    low_air = Ease(v,.291,.349)
    optical = -np.log(transmittance)*window*(1+.18*left_core+.22*low_air)
    if refine:
        optical = np.frombuffer(GUIDE.read_bytes(),dtype=np.uint8).reshape(height,width).astype(np.float32)*(2.6/255)
    if rendered:
        measured = Transmission(ReadLuminance(rendered))
        residual = gaussian_filter(np.clip(np.log(measured/transmittance),-.43,.61)*window, 1.35)
        optical += (.82 if refine else .66)*residual
    optical = gaussian_filter(optical, .34 if refine else .69)
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
    left_source = Ease(u,.234,.321)*Ease(1-u,.455,.56)*Ease(v,.105,.182)
    rim = Ease(ux,0,.085)*Ease(1-ux,0,.085)*Ease(uz,0,.12)*Ease(1-uz,0,.13)*Ease(uy,0,.033)*Ease(1-uy,0,.08)
    random = np.random.default_rng(19380612)
    tables = [random.uniform(-1,1,s).astype(np.float32) for s in [(9,18,28),(12,34,48),(21,63,102)]]
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
        offset = .0017 + .0025*Ease(y,2,13)
        optical = map_coordinates(guide, [(v+offset*curl)*height-.5,(u+offset*roll)*width-.5],
            order=1,mode="constant",prefilter=False)
        depth_pos = z + roll*3.4 + curl*1.12
        near = np.exp(-.5*((depth_pos-sheet_center)/sheet_width)**2)/(2.5066*sheet_width)
        far = np.exp(-.5*((depth_pos-sheet_center+17)/10.3)**2)/(2.5066*10.3)
        structure = 1 + .34*roll + .50*curl + .42*fine
        suspended = optical*(near*.78+far*.22)*3.38*structure*(1-.22*left_source)
        outlets = Nodes((x+roll*1.25,y+curl*.88,z+roll*1.8),OUTLETS)*(.77+.31*roll+.35*curl+.18*fine)
        distant = .022*np.exp(-.5*(((z+80+roll*4)/12)**2 + ((y-1.04-curl*.25)/.94)**2))
        density = np.clip(suspended+outlets+distant,0,1)*rim
        levels = np.rint(np.sqrt(density)*63)
        yield np.uint8(np.rint(levels*(255/63)))


def MakeBurstFrames():
    nx, ny, nz = BURST_SIZE
    z, y, x = (np.indices((nz,ny,nx), dtype=np.float32)+.5) / np.array([nz,ny,nx], dtype=np.float32)[:,None,None,None]
    rim = Ease(x,0,.09)*Ease(1-x,0,.09)*Ease(z,0,.11)*Ease(1-z,0,.11)*Ease(1-y,0,.08)
    rng = np.random.default_rng(19380529)
    noise = rng.random((10,16,11), dtype=np.float32)
    positions = np.array([z*10,y*16,x*11])
    for clock in np.linspace(0, 1.38, 8):
        rise = .12 + .85*(1-np.exp(-4.9*clock))
        spread = .57 + .51*rise + .43*Ease(clock,.58,1.24)
        billow = map_coordinates(noise, positions + np.array([.64,-clock*3.2,-clock*.96])[:,None,None,None],
            order=1, mode="grid-wrap", prefilter=False)
        side = (x-.5-.19*y-(billow-.5)*.108) / spread
        height = y / rise
        depth = (z-.5+.13*y+(billow-.5)*.084) / spread
        lobes = Nodes((side,height,depth), (
            (-.010,.10,.010,.245,.117,.245,.52),
            (-.025,.32,.035,.154,.294,.172,.48),
            (.079,.49,-.068,.171,.252,.173,.30),
            (-.122,.66,.046,.137,.196,.116,.33),
            (.115,.89,.055,.110,.171,.138,.27),
        ))
        strength = Ease(clock,0,.168)*(1-Ease(clock,.47,1.38))
        density = np.clip(lobes * (.39 + .98*billow) * strength * rim, 0, 1)
        yield np.uint8(np.rint(np.rint(np.sqrt(density)*31)*(255/31)))


def BakeVolume(asset, size, tiles, frames, duration, bounds, origin=None):
    folder = HERE.parents[1] / "Volume"
    output = folder / f"Volume_{asset}.bin.gz"
    nx, ny, nz = size
    tx, ty, tz = tiles
    atlas = np.zeros((nz*tz,ny*ty,nx*tx),dtype=np.uint8)
    for frame, field in enumerate(frames):
        left, bottom = (frame % tx)*nx, (frame//tx)*ny
        atlas[:,bottom:bottom+ny,left:left+nx] = field
    count = frame + 1
    meta = dict(version=1, asset=asset, dimensions=size, atlasTiles=tiles,
        frames=count, duration=duration, channels=1, encoding="sqrt-unorm8",
        anchor=(.5,0,.5), sourceFrameIndices=list(range(count)), source="authored")
    header = json.dumps(meta,separators=(",",":")).encode("utf-8")
    out = gzip.compress(b"TVOL"+struct.pack("<I",len(header))+header+atlas.tobytes(), compresslevel=8, mtime=0)
    output.write_bytes(out)
    report = dict(meta, file=output.name, gpuBytes=atlas.nbytes, compressedBytes=len(out),
        boundsM=bounds, sha256=hashlib.sha256(out).hexdigest(),
        generator="_import/TanketteAdvanceEastTrack/Script_BakeEastTrackSmoke.py")
    if origin is not None:
        report["anchorPositionM"] = origin
    output.with_name(f"Data_{asset}Volume.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(f"{asset}: {count} frames, {atlas.nbytes:,} GPU bytes, {len(out):,} compressed bytes")


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
    BakeVolume(ASSET, SIZE, TILES, MakeFrames(), 7.2, BOUNDS, ORIGIN)
    BakeVolume("EastTrackSoilBurst", BURST_SIZE, (4, 2, 1), MakeBurstFrames(), 1.38, BURST_BOUNDS)
