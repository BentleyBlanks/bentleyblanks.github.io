"""Bake CC0 OpenVDB sequences to bounded, time-varying 3D scalar textures.

Run with a Python containing numpy and openvdb (Blender's bundled Python works).
Raw simulations stay outside the repository. Output is a gzip-compressed TVOL:
magic, little-endian JSON length, JSON metadata, then x-fast interleaved R/G bytes.
R is sqrt(density / densityScale); G is sqrt(flames / flameScale).
No RGB lighting is baked, and no camera projection is used.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import struct
import tempfile
import zipfile
import re
import subprocess
from contextlib import contextmanager

if os.name == 'nt':
    blender = Path(os.environ.get('BLENDER_ROOT', 'C:/Program Files/Blender Foundation/Blender 5.2'))
    if blender.is_dir():
        dllDirectory = os.add_dll_directory(str(blender))
import numpy as np
import openvdb


@contextmanager
def OpenArchive(path):
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            yield archive
    elif path.suffix.lower() == '.rar':
        # Read selected members through stdout, never extract untrusted paths.
        names = subprocess.check_output(['tar', '-tf', str(path)]).decode('utf-8').splitlines()
        class RarReader:
            def namelist(self):
                return names
            def read(self, name):
                if name not in names:
                    raise KeyError(name)
                return subprocess.check_output(['tar', '-xOf', str(path), name])
        yield RarReader()
    else:
        raise ValueError('Expected a ZIP or RAR source archive')


def NaturalKey(name):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r'(\d+)', name)]


def AtlasTiles(dimensions, frames):
    candidates = []
    for x in range(1, frames + 1):
        for y in range(1, (frames + x - 1)//x + 1):
            z = (frames + x*y - 1)//(x*y)
            size = [a*b for a, b in zip(dimensions, [x, y, z])]
            candidates.append(((x*y*z-frames, max(size), max(size)-min(size)), [x, y, z]))
    return min(candidates)[1]


def ResampleAxis(array, count, axis):
    """Exact area average of source voxel cells; preserves thin plume mass."""
    source = array.shape[axis]
    if source == count:
        return array
    integral = np.concatenate([np.zeros_like(np.take(array, [0], axis=axis)),
                               np.cumsum(array, axis=axis, dtype=np.float32)], axis=axis)
    edges = np.linspace(0, source, count + 1)
    lower = np.minimum(edges.astype(np.int32), source)
    upper = np.minimum(lower + 1, source)
    shape = [1] * array.ndim
    shape[axis] = count + 1
    fraction = (edges - lower).astype(np.float32).reshape(shape)
    samples = np.take(integral, lower, axis=axis) * (1 - fraction) + np.take(integral, upper, axis=axis) * fraction
    return np.diff(samples, axis=axis) / (source / count)


def Bake(args):
    dimensions = [int(v) for v in args.size.split(',')]
    if len(dimensions) != 3 or min(dimensions) < 8 or max(dimensions) > 256:
        raise ValueError('size must contain three dimensions in [8,256]')
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    archivePath = Path(args.source)
    with archivePath.open('rb') as stream:
        archiveHash = hashlib.file_digest(stream, 'sha256').hexdigest()
    with OpenArchive(archivePath) as archive, tempfile.TemporaryDirectory(prefix='TengxianVolume_') as temporary:
        frames = sorted((name for name in archive.namelist() if name.lower().endswith('.vdb')), key=NaturalKey)
        if not frames:
            raise ValueError('No VDB frames')
        # Read the actual asset's permission evidence, not a third-party description.
        licenseText = archive.read('LICENSE.txt').decode('utf-8')
        if 'CC0' not in licenseText:
            raise ValueError('Expected the verified JangaFX CC0 archive')
        end = min(len(frames) - 1, args.end if args.end is not None else len(frames) - 1)
        indices = np.linspace(args.start, end, args.frames).round().astype(int).tolist()
        if len(set(indices)) != args.frames:
            raise ValueError('Need enough distinct source frames')
        local = []
        boundsMin = np.array([2**30] * 3)
        boundsMax = -boundsMin
        times = []
        for index in indices:
            target = Path(temporary) / ('Frame_%04d.vdb' % index)
            target.write_bytes(archive.read(frames[index]))
            metadata = openvdb.readAllGridMetadata(str(target))
            selected = next(grid for grid in metadata if grid.name == args.bounds_grid)
            boundsMin = np.minimum(boundsMin, selected.metadata['file_bbox_min'])
            boundsMax = np.maximum(boundsMax, selected.metadata['file_bbox_max'])
            times.append(float(selected.metadata.get('simulation_time', index / 60)))
            local.append(target)
        # Shared bounds across the whole sequence prevent time-dependent rescaling.
        padding = np.maximum(2, np.ceil((boundsMax - boundsMin + 1) * .025).astype(int))
        boundsMin -= padding
        boundsMax += padding
        nativeShape = boundsMax - boundsMin + 1
        nx, ny, nz = dimensions
        # VDB is Z-up; game is Y-up. Source Y becomes game Z.
        sourceTarget = [nx, nz, ny]
        tileX, tileY, tileZ = AtlasTiles(dimensions, args.frames)
        atlas = np.zeros((tileZ * nz, tileY * ny, tileX * nx, 2), dtype=np.uint8)
        stats = []
        anchorWeight = np.zeros((nz, nx), dtype=np.float64)
        for frame, file in enumerate(local):
            grids, _ = openvdb.readAll(str(file))
            byName = {grid.name: grid for grid in grids}
            fields = []
            for name, scale in [('density', args.density_scale), ('flames', args.flame_scale)]:
                if name not in byName or byName[name].activeVoxelCount() == 0:
                    fields.append(np.zeros(tuple(sourceTarget), dtype=np.uint8))
                    stats.append({'frame': frame, 'channel': name, 'sourceMass': 0., 'occupied': 0, 'max': 0.})
                    continue
                native = np.zeros(tuple(nativeShape), dtype=np.float32)
                if name in byName:
                    byName[name].copyToArray(native, tuple(int(n) for n in boundsMin))
                sourceMass = float(native.sum())
                for axis in sorted(range(3), key=lambda a: sourceTarget[a] / nativeShape[a]):
                    native = ResampleAxis(native, sourceTarget[axis], axis)
                fields.append(np.rint(np.sqrt(np.clip(native / scale, 0, 1)) * 255).astype(np.uint8))
                stats.append({'frame': frame, 'channel': name, 'sourceMass': sourceMass,
                              'occupied': int(np.count_nonzero(native)), 'max': float(native.max())})
            encoded = np.stack(fields, axis=-1).transpose(1, 2, 0, 3)
            rootChannel = 1 if args.bounds_grid == 'flames' else 0
            anchorWeight += np.square(encoded[:, :max(3, ny//8), :, rootChannel].astype(np.float64)).sum(axis=1)
            tx, ty, tz = frame % tileX, (frame // tileX) % tileY, frame // (tileX*tileY)
            atlas[tz*nz:(tz+1)*nz, ty*ny:(ty+1)*ny, tx*nx:(tx+1)*nx] = encoded
            print(json.dumps({'frame': frame + 1, 'frames': args.frames, 'source': indices[frame]}), flush=True)
        if not np.any(atlas):
            raise ValueError('Empty volume')
        if not np.any(atlas[..., 1]):
            atlas = np.ascontiguousarray(atlas[..., :1])
        mass = max(1., anchorWeight.sum())
        anchor = [float((anchorWeight.sum(axis=0) * (np.arange(nx)+.5)).sum()/mass/nx),
                  float(padding[2]/nativeShape[2]),
                  float((anchorWeight.sum(axis=1) * (np.arange(nz)+.5)).sum()/mass/nz)]
        sourceStep = np.median(np.diff(times)/np.diff(indices))
        voxelAspect = nativeShape[[0, 2, 1]] / nativeShape[2]
        metadata = {'version': 1, 'asset': args.asset, 'dimensions': dimensions,
                    'atlasTiles': [tileX, tileY, tileZ], 'frames': args.frames,
                    'duration': float((indices[-1]-indices[0])*args.frames/(args.frames-1)/args.fps),
                    'sourceFps': args.fps, 'simulationDuration': float(sourceStep*(indices[-1]-indices[0])),
                    'sourceFrameIndices': indices, 'sourceTimeRange': [times[0], times[-1]],
                    'sourceBounds': [boundsMin.tolist(), boundsMax.tolist()],
                    'voxelAspect': voxelAspect.tolist(), 'anchor': anchor,
                    'channels': int(atlas.shape[-1]), 'encoding': 'sqrt-unorm8',
                    'densityScale': args.density_scale, 'flameScale': args.flame_scale,
                    'sourceSha256': archiveHash, 'sourceUrl': args.source_url,
                    'license': 'CC0-1.0', 'author': 'JangaFX LLC', 'sourceUp': 'Z', 'runtimeUp': 'Y'}
        header = json.dumps(metadata, separators=(',', ':')).encode('utf-8')
        payload = b'TVOL' + struct.pack('<I', len(header)) + header + atlas.tobytes()
        output.write_bytes(gzip.compress(payload, compresslevel=9, mtime=0))
        report = {**metadata, 'file': output.name, 'compressedBytes': output.stat().st_size,
                  'gpuBytes': atlas.nbytes, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'samples': stats}
        output.with_name('Data_'+args.asset+'Volume.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({key: report[key] for key in ['asset', 'compressedBytes', 'gpuBytes', 'duration', 'voxelAspect']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--source-url', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--asset', required=True)
    parser.add_argument('--size', default='64,96,64')
    parser.add_argument('--frames', type=int, default=48)
    parser.add_argument('--fps', type=float, default=30, help='Playback FPS of the source sequence (author preview: 30)')
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--end', type=int)
    parser.add_argument('--bounds-grid', default='density')
    parser.add_argument('--density-scale', type=float, default=.5)
    parser.add_argument('--flame-scale', type=float, default=.4)
    Bake(parser.parse_args())
