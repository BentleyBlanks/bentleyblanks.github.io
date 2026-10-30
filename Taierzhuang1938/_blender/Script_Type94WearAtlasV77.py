"""Resample V68 maps to non-rotated, weighted islands without a shader rebake."""
from pathlib import Path
import hashlib, json, os
import numpy as np
from PIL import Image

root = Path(os.environ.get('TYPE94_WEAR_ROOT', r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV77'))
folder = root / 'Textures/HighSurfaceV77Preview'
data = np.load(root / 'Acceptance/Data_AtlasTransferV77.npz')
size = 4096
source, outputs = {}, {}
preparation = json.loads((root / 'Acceptance/Data_WearPreparationV77.json').read_text())
for channel in ['Base', 'Orm', 'Normal']:
    file = folder / ('Texture_Type94Paint' + channel + 'Input.png')
    archived = folder / ('Texture_Type94Paint' + channel + 'LegacyV68.png')
    expected = preparation['inputs']['Paint' + channel]['sha256']
    if not archived.exists():
        assert hashlib.sha256(file.read_bytes()).hexdigest() == expected
        archived.write_bytes(file.read_bytes())
    assert hashlib.sha256(archived.read_bytes()).hexdigest() == expected
    value = np.asarray(Image.open(archived).convert('RGB'), dtype=np.float32) / 255
    if channel == 'Base':
        value = np.where(value <= .04045, value / 12.92, ((value + .055) / 1.055) ** 2.4)
    source[channel] = value
    outputs[channel] = np.zeros((size, size, 3), dtype=np.float32)
occupied = np.zeros((size, size), dtype=bool)
density = np.zeros((size, size), dtype=np.float32)
for a, b, points in zip(data['oldUv'], data['newUv'], data['positions']):
    pixels = b * [size, -size] + [-.5, size - .5]
    matrix = np.column_stack((pixels[1] - pixels[0], pixels[2] - pixels[0]))
    det = np.linalg.det(matrix)
    if abs(det) < 1e-9:
        continue
    lo = np.maximum(0, np.ceil(pixels.min(axis=0)).astype(int))
    hi = np.minimum(size - 1, np.floor(pixels.max(axis=0)).astype(int))
    if np.any(hi < lo):
        continue
    inverse = np.linalg.inv(matrix)
    area = np.linalg.norm(np.cross(points[1] - points[0], points[2] - points[0])) / 2
    texelDensity = np.sqrt(abs(det) / max(area * 2, 1e-15))
    for first in range(lo[1], hi[1] + 1, 128):
        yy, xx = np.mgrid[first:min(first + 128, hi[1] + 1), lo[0]:hi[0] + 1]
        q = np.stack((xx - pixels[0, 0], yy - pixels[0, 1]), axis=-1) @ inverse.T
        inside = (q[:, :, 0] >= -1e-7) & (q[:, :, 1] >= -1e-7) & (q.sum(axis=-1) <= 1 + 1e-7)
        if not inside.any():
            continue
        y, x = yy[inside], xx[inside]
        weights = q[inside]
        uv = a[0] + weights[:, :1] * (a[1] - a[0]) + weights[:, 1:] * (a[2] - a[0])
        sx = np.clip(uv[:, 0] * size - .5, 0, size - 1)
        sy = np.clip((1 - uv[:, 1]) * size - .5, 0, size - 1)
        x0, y0 = np.floor(sx).astype(int), np.floor(sy).astype(int)
        x1, y1 = np.minimum(size - 1, x0 + 1), np.minimum(size - 1, y0 + 1)
        fx, fy = (sx - x0)[:, None], (sy - y0)[:, None]
        for channel, image in source.items():
            outputs[channel][y, x] = (image[y0, x0] * (1 - fx) + image[y0, x1] * fx) * (1 - fy) + (image[y1, x0] * (1 - fx) + image[y1, x1] * fx) * fy
        occupied[y, x] = True
        density[y, x] = texelDensity

# Index propagation supplies eight texels of gutters. Source values never
# change at occupied pixels, and no third-party imaging dependency is needed.
indices = np.arange(size * size, dtype=np.int32).reshape(size, size)
indices[~occupied] = -1
for step in range(8):
    previous = indices.copy()
    for axis, direction in [(0, 1), (0, -1), (1, 1), (1, -1)]:
        neighbour = np.roll(previous, direction, axis=axis)
        if axis == 0:
            neighbour[0 if direction == 1 else -1, :] = -1
        else:
            neighbour[:, 0 if direction == 1 else -1] = -1
        take = (indices < 0) & (neighbour >= 0)
        indices[take] = neighbour[take]
filled = indices >= 0
records = {}
for channel, values in outputs.items():
    if channel == 'Base':
        values = np.where(values <= .0031308, values * 12.92, 1.055 * np.maximum(values, 0) ** (1 / 2.4) - .055)
    image = np.rint(np.clip(values, 0, 1) * 255).astype(np.uint8)
    image[filled] = image.reshape(-1, 3)[indices[filled]]
    file = folder / ('Texture_Type94Paint' + channel + 'Input.png')
    Image.fromarray(image).save(file)
    records[channel] = dict(file=str(file), sha256=hashlib.sha256(file.read_bytes()).hexdigest())
density[filled] = density.reshape(-1)[indices[filled]]
np.save(root / 'Acceptance/Data_AtlasDensityV77.npy', density)
Image.fromarray(occupied.astype(np.uint8) * 255).save(root / 'Acceptance/Texture_AtlasCoverageV77.png')
report = dict(occupiedFraction=float(occupied.mean()), gutterPixels=8, gutterFraction=float(filled.mean()), preservedIslandDirections=True, maps=records, baseInterpolation='linear-light bilinear', dataInterpolation='bilinear', changedGeometry=False)
(root / 'Acceptance/Data_AtlasRasterV77.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
