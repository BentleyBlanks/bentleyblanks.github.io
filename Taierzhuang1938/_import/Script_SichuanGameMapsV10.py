"""Encode actual V10 high-to-low bakes without replacing missed surface rays.

All four raw 2048 RGBA images use the same measured hit mask. An unbaked
surface interior is an error, never a material median or a synthetic pigment.
Only the one-pixel raster boundary and outward texture padding are dilated.
"""
import argparse
from datetime import datetime
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image


RAW_SIZE = 2048
RUNTIME_SIZE = 1024
PADDING_PIXELS = 16
RUNTIME_FOOTPRINT_MAX_DISTANCE = 24
RUNTIME_FOOTPRINT_HALO = 6
PART_NAMES = (
    'Pack_Bundle', 'Pack_Binding', 'Pack_Sandals', 'Pack_StrawMat', 'Pack_Jacket'
)


def Progress(stage, **detail):
    print('SICHUAN_GAME_MAPS_V10 ' + json.dumps(
        {'stage': stage, **detail}, ensure_ascii=False), flush=True)


def FileEvidence(filePath):
    filePath = Path(filePath).resolve()
    payload = filePath.read_bytes()
    return {
        'path': str(filePath), 'bytes': len(payload),
        'sha256': hashlib.sha256(payload).hexdigest()
    }


def ImageEvidence(filePath):
    result = FileEvidence(filePath)
    with Image.open(filePath) as image:
        result['width'], result['height'] = image.size
    return result


def ResolveEvidence(projectPath, value):
    filePath = Path(value)
    return (filePath if filePath.is_absolute() else projectPath / filePath).resolve()


def Require(ok, message):
    if not ok:
        raise RuntimeError(message)


def ReadRaw(reviewPath, channel):
    filePath = reviewPath / ('Bake_' + channel + '.png')
    with Image.open(filePath) as image:
        Require(image.size == (RAW_SIZE, RAW_SIZE),
                str(filePath) + ' must be the actual 2048-square bake')
        Require('A' in image.getbands(),
                str(filePath) + ' must retain the raw bake alpha channel')
        pixels = np.asarray(image.convert('RGBA'), dtype=np.uint8).copy()
    return pixels, ImageEvidence(filePath)


def TrianglePixels(uv, size):
    triangle = np.asarray(uv, dtype=np.float64) * size
    Require(triangle.shape == (3, 2) and np.isfinite(triangle).all(),
            'Every surface row must contain three finite UV coordinates')
    Require(triangle.min() >= -1e-5 and triangle.max() <= size + 1e-5,
            'Target UVs must be within the unique 0..1 atlas')
    low = np.maximum(0, np.floor(triangle.min(axis=0)).astype(int))
    high = np.minimum(size - 1, np.ceil(triangle.max(axis=0)).astype(int))
    if np.any(high < low):
        return None
    a, b, c = triangle
    ab, ac = b - a, c - a
    determinant = ab[0] * ac[1] - ab[1] * ac[0]
    Require(abs(determinant) > 1e-12, 'Target triangle has degenerate UV area')
    yy, xx = np.mgrid[low[1]:high[1] + 1, low[0]:high[0] + 1]
    dx, dy = xx + .5 - a[0], yy + .5 - a[1]
    u = (dx * ac[1] - dy * ac[0]) / determinant
    v = (ab[0] * dy - ab[1] * dx) / determinant
    inside = (u >= -1e-8) & (v >= -1e-8) & (u + v <= 1 + 1e-8)
    return low, high, inside


def Rasterize(rows, size):
    mask = np.zeros((size, size), dtype=bool)
    for row in rows:
        raster = TrianglePixels(row['uv'], size)
        if raster is None:
            continue
        low, high, inside = raster
        mask[low[1]:high[1] + 1, low[0]:high[0] + 1] |= inside
    return mask


def NeighborSlices(dy, dx, height, width):
    # dest(y,x) reads source(y+dy,x+dx); image boundaries never wrap.
    y0, y1 = max(0, -dy), min(height, height - dy)
    x0, x1 = max(0, -dx), min(width, width - dx)
    return (slice(y0, y1), slice(x0, x1)), (
        slice(y0 + dy, y1 + dy), slice(x0 + dx, x1 + dx))


def InteriorMask(mask):
    # All eight one-pixel neighbors must remain inside the UV union. This
    # removes the <=1px island boundary without eroding internal triangle edges.
    core = mask.copy()
    height, width = mask.shape
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1),
                   (-1, -1), (-1, 1), (1, -1), (1, 1)):
        neighbor = np.zeros_like(mask)
        dest, source = NeighborSlices(dy, dx, height, width)
        neighbor[dest] = mask[source]
        core &= neighbor
    return core


def FailPixels(mask, label):
    count = int(mask.sum())
    if count:
        examples = np.argwhere(mask)[:12][:, ::-1].tolist()
        raise RuntimeError(label + ': ' + str(count) +
                           ' pixels; first raw [x,y] = ' + json.dumps(examples))


def DilateNeighbors(values, valid, iterations):
    """Copy one common measured neighbor for all channels, one shell per pass."""
    height, width = valid.shape
    addedByIteration = []
    for _ in range(iterations):
        previous = valid.copy()
        nextValid = valid.copy()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1),
                       (-1, -1), (-1, 1), (1, -1), (1, 1)):
            dest, source = NeighborSlices(dy, dx, height, width)
            fill = ~nextValid[dest] & previous[source]
            if fill.any():
                values[dest][fill] = values[source][fill]
                nextValid[dest][fill] = True
        added = int(nextValid.sum() - valid.sum())
        addedByIteration.append(added)
        valid = nextValid
        if not added:
            break
    return values, valid, addedByIteration


def RuntimeTriangleOwner(rows, x, y, runtimeSize):
    """Find the actual triangle at the runtime pixel centre in top-left UVs."""
    point = np.asarray(((x + .5) / runtimeSize, (y + .5) / runtimeSize))
    candidates = []
    for rowIndex, row in enumerate(rows):
        a, b, c = np.asarray(row['uv'], dtype=np.float64)
        ab, ac, delta = b - a, c - a, point - a
        determinant = ab[0] * ac[1] - ab[1] * ac[0]
        if abs(determinant) < 1e-16:
            continue
        u = (delta[0] * ac[1] - delta[1] * ac[0]) / determinant
        v = (ab[0] * delta[1] - ab[1] * delta[0]) / determinant
        margin = min(u, v, 1 - u - v)
        if margin >= -1e-8:
            candidates.append((margin, rowIndex))
    Require(candidates, 'Runtime footprint has no actual top-left UV owner: ' +
            json.dumps([x, y]))
    # Shared triangle edges may have two owners. Prefer the more interior
    # barycentric point and then the earlier source row deterministically.
    return max(candidates, key=lambda item: (item[0], -item[1]))[1]


def PadRuntimeFootprints(values, actualValid, padded, rows, runtimeMask,
                         maxDistance=RUNTIME_FOOTPRINT_MAX_DISTANCE,
                         halo=RUNTIME_FOOTPRINT_HALO):
    """Extend a missed 2x2 filter footprint from its own raw triangle only.

    The common 16px dilation stays intact. This narrowly handles runtime
    centres inside a very thin UV tip whose four raw pixel centres are outside
    the triangle. Actual raw surface samples are never overwritten. Every
    additional eight-channel sample comes from an original valid pixel inside
    the runtime owner's triangle, not a neighboring material or padded value.
    """
    height, width = actualValid.shape
    runtimeHeight, runtimeWidth = runtimeMask.shape
    Require(height == width == runtimeHeight * 2 == runtimeWidth * 2,
            'Same-triangle footprint padding requires the actual 2:1 square downsample')
    required = np.repeat(np.repeat(runtimeMask, 2, axis=0), 2, axis=1)
    missing = required & ~padded
    missingRuntime = np.unique(np.argwhere(missing) // 2, axis=0)
    report = {
        'method': 'Same-triangle original-valid nearest sample for missed runtime filter footprints',
        'uvOrigin': 'Top-left; Data_SurfaceUv.json is used without V flipping',
        'distanceLimitMetric': 'Chebyshev raw-pixel grid radius, matching the existing eight-neighbor dilation',
        'nearestSourceSelectionMetric': 'Euclidean distance among same-triangle original-valid candidates inside the Chebyshev limit',
        'maxChebyshevDistanceRawPixels': maxDistance, 'lanczosHaloRawPixels': halo,
        'requiredRuntimePixels': int(runtimeMask.sum()),
        'requiredRawFootprintPixels': int(required.sum()),
        'initialUncoveredRequiredRawPixels': int(missing.sum()),
        'criticalRuntimePixels': [], 'trace': [],
        'centralPaddingCopies': 0, 'haloPaddingCopies': 0,
        'newPaddingPixels': 0, 'reassignedExistingPaddingPixels': 0,
        'rawSurfaceSamplesWritten': 0, 'syntheticSurfaceFillPixels': 0
    }
    if not len(missingRuntime):
        report.update(uncoveredRequiredRawPixelsAfter=0,
                      allRequiredFootprintsCovered=True,
                      originalValidSamplesUnchanged=True,
                      maximumCopyEuclideanDistanceRawPixels=0,
                      maximumCopyChebyshevDistanceRawPixels=0)
        return values, padded, report
    actualHashBefore = hashlib.sha256(values[actualValid].tobytes()).hexdigest()
    sourceCache = {}
    critical = []
    for y, x in missingRuntime:
        x, y = int(x), int(y)
        rowIndex = RuntimeTriangleOwner(rows, x, y, runtimeWidth)
        row = rows[rowIndex]
        if rowIndex not in sourceCache:
            raster = TrianglePixels(row['uv'], width)
            Require(raster is not None, 'Runtime owner has no raw raster bounds')
            low, high, inside = raster
            ownValid = inside & actualValid[low[1]:high[1] + 1, low[0]:high[0] + 1]
            points = np.argwhere(ownValid)
            Require(len(points) > 0, 'Runtime triangle has no measured raw source samples: ' +
                    json.dumps({'object': row['object'], 'row': rowIndex,
                                'polygon': row.get('polygon')}))
            sourceCache[rowIndex] = points + np.asarray((low[1], low[0]))
        owner = {'runtimeXY': [x, y], 'ownerRowIndex': rowIndex,
                 'object': row['object'], 'part': row['part'],
                 'polygon': row.get('polygon'), 'ownerUvTopLeft': row['uv'],
                 'originalValidOwnerSamples': len(sourceCache[rowIndex])}
        report['criticalRuntimePixels'].append(owner)
        critical.append((x, y, owner, sourceCache[rowIndex]))

    def CopyMeasured(x, y, owner, sourcePoints, purpose, mandatory):
        if actualValid[y, x]:
            return
        delta = sourcePoints - np.asarray((y, x))
        gridDistances = np.max(np.abs(delta), axis=1)
        eligible = np.flatnonzero(gridDistances <= maxDistance)
        distances2 = np.sum(delta.astype(np.float64) ** 2, axis=1)
        if not len(eligible):
            Require(not mandatory, 'Same-triangle raw footprint exceeds the measured-padding distance limit: ' +
                    json.dumps({'runtimeXY': owner['runtimeXY'], 'object': owner['object'],
                                'polygon': owner['polygon'], 'rawDestinationXY': [x, y],
                                'nearestChebyshevRawPixels': int(gridDistances.min()),
                                'metric': 'Chebyshev', 'limit': maxDistance}))
            return
        nearest = int(eligible[np.argmin(distances2[eligible])])
        distance = float(np.sqrt(distances2[nearest]))
        gridDistance = int(gridDistances[nearest])
        sy, sx = (int(value) for value in sourcePoints[nearest])
        Require(actualValid[sy, sx], 'Footprint source is not an original measured sample')
        wasPadded = bool(padded[y, x])
        sample = values[sy, sx].copy()
        values[y, x] = sample
        padded[y, x] = True
        report['trace'].append({
            'purpose': purpose, 'runtimeXY': owner['runtimeXY'],
            'ownerRowIndex': owner['ownerRowIndex'], 'object': owner['object'],
            'part': owner['part'], 'polygon': owner['polygon'],
            'rawDestinationXY': [x, y], 'rawSourceXY': [sx, sy],
            'euclideanDistanceRawPixels': distance,
            'chebyshevDistanceRawPixels': gridDistance, 'previouslyPadded': wasPadded,
            'sourceIsOriginalValid': True, 'sourceInsideOwnerTriangle': True,
            'channels': ['BaseR', 'BaseG', 'BaseB', 'NormalR', 'NormalG', 'NormalB', 'AO', 'Roughness'],
            'sourceValues': [int(round(value)) for value in sample]
        })
        report['centralPaddingCopies' if purpose == 'required2x2' else 'haloPaddingCopies'] += 1
        report['reassignedExistingPaddingPixels' if wasPadded else 'newPaddingPixels'] += 1

    # Resolve every critical central footprint before optional halos. Existing
    # padding at those centres is rebound to the same triangle if necessary;
    # measured raw-valid samples remain immutable even there.
    for x, y, owner, points in critical:
        for rawY in (2 * y, 2 * y + 1):
            for rawX in (2 * x, 2 * x + 1):
                CopyMeasured(rawX, rawY, owner, points, 'required2x2', True)
    for x, y, owner, points in critical:
        for rawY in range(max(0, 2 * y - halo), min(height, 2 * y + 2 + halo)):
            for rawX in range(max(0, 2 * x - halo), min(width, 2 * x + 2 + halo)):
                # Do not broaden or recolor the original global padding.
                if padded[rawY, rawX] or actualValid[rawY, rawX]:
                    continue
                CopyMeasured(rawX, rawY, owner, points, 'lanczosHalo', False)
    actualHashAfter = hashlib.sha256(values[actualValid].tobytes()).hexdigest()
    Require(actualHashBefore == actualHashAfter,
            'Same-triangle padding changed an actual raw surface sample')
    report.update(originalValidSamplesSha256Before=actualHashBefore,
                  originalValidSamplesSha256After=actualHashAfter,
                  originalValidSamplesUnchanged=True,
                  uncoveredRequiredRawPixelsAfter=int((required & ~padded).sum()),
                  maximumCopyEuclideanDistanceRawPixels=max((item['euclideanDistanceRawPixels'] for item in report['trace']), default=0),
                  maximumCopyChebyshevDistanceRawPixels=max((item['chebyshevDistanceRawPixels'] for item in report['trace']), default=0))
    FailPixels(required & ~padded,
               'Runtime production UV has an uncovered raw 2x2 filter footprint')
    report['allRequiredFootprintsCovered'] = True
    return values, padded, report


def ResizeFloat(channel, resample=Image.Resampling.BOX):
    return np.asarray(Image.fromarray(channel.astype(np.float32), mode='F').resize(
        (RUNTIME_SIZE, RUNTIME_SIZE), resample), dtype=np.float32)


def SavePng(image, filePath):
    filePath.parent.mkdir(parents=True, exist_ok=True)
    temporary = filePath.with_suffix('.tmp')
    image.save(temporary, format='PNG')
    temporary.replace(filePath)


def SaveWebp(image, filePath):
    filePath.parent.mkdir(parents=True, exist_ok=True)
    temporary = filePath.with_suffix('.tmp')
    image.save(temporary, format='WEBP', lossless=True, quality=100, method=6)
    with Image.open(temporary) as decoded:
        Require(np.array_equal(np.asarray(image), np.asarray(decoded.convert('RGB'))),
                'Lossless WebP round trip changed actual ' + filePath.name + ' bytes')
    temporary.replace(filePath)


def SaveJson(value, filePath):
    filePath.parent.mkdir(parents=True, exist_ok=True)
    temporary = filePath.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n',
                         encoding='utf-8')
    temporary.replace(filePath)


def ValidateProjection(record, rows, projectPath):
    source = record.get('sourceBlend')
    Require(isinstance(source, dict) and source.get('path'),
            'Data_BakeProjection.json must record sourceBlend path/bytes/sha256')
    actual = FileEvidence(ResolveEvidence(projectPath, source['path']))
    Require(actual['bytes'] == source.get('bytes') and
            actual['sha256'] == source.get('sha256'),
            'Retained high-source Blender file changed after projection was recorded')
    Require(actual['path'].lower().endswith('.blend'), 'Projection source must be .blend')
    sources = record.get('sources', [])
    Require(isinstance(sources, list) and len(sources) > 0,
            'Projection record lacks actual source object/material socket evidence')
    names = set()
    for source in sources:
        name = source.get('name')
        Require(isinstance(name, str) and name and name not in names,
                'Projection source object names must be nonempty and unique')
        names.add(name)
        Require(source.get('materials'), 'Source ' + name + ' lacks its material records')
        for material in source['materials']:
            Require(isinstance(material.get('name'), str) and material['name'] and
                    isinstance(material.get('roughnessLinked'), bool) and
                    isinstance(material.get('roughnessDefault'), (int, float)) and
                    0 <= material['roughnessDefault'] <= 1,
                    'Invalid roughness socket record on source ' + name)
    projection = record.get('projection', [])
    Require(isinstance(projection, list) and len(projection) > 0,
            'Projection record lacks actual source-to-target operations')
    for operation in projection:
        Require(isinstance(operation.get('target'), str) and operation['target'] and
                operation.get('selectedToActive') is True and
                operation.get('bakeType') == 'EMIT' and operation.get('sources') and
                all(name in names for name in operation['sources']),
                'Invalid roughness projection operation: ' + json.dumps(operation))
    for part in PART_NAMES:
        Require(any(item.get('part') == part for item in projection),
                part + ' has no recorded source roughness projection')
    for target in {row['object'] for row in rows}:
        Require(any(item['target'] == target for item in projection),
                target + ' has UV geometry but no recorded source roughness projection')


def Main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--review', type=Path, required=True)
    args = parser.parse_args()
    projectPath, reviewPath = args.project.resolve(), args.review.resolve()
    modelPath = projectPath / 'Model/SichuanBlanketPack'
    projectionPath = reviewPath / 'Data_BakeProjection.json'
    uvPath = reviewPath / 'Data_SurfaceUv.json'
    record = json.loads(projectionPath.read_text(encoding='utf-8-sig'))
    rows = json.loads(uvPath.read_text(encoding='utf-8-sig'))
    Require(isinstance(rows, list) and rows, 'Surface UV record is empty')
    Require(all(row.get('object') and row.get('part') in PART_NAMES for row in rows),
            'Every UV triangle must retain its actual mesh object and named part')
    ValidateProjection(record, rows, projectPath)
    Progress('ReadingRawImages', triangles=len(rows))
    images, rawEvidence = {}, {}
    for channel in ('Base', 'Normal', 'Roughness', 'Ao'):
        images[channel], rawEvidence[channel] = ReadRaw(reviewPath, channel)
    mask = Rasterize(rows, RAW_SIZE)
    core = InteriorMask(mask)
    Require(core.any(), 'Target UVs have no raster-resolvable surface interior')
    Progress('CheckingRawSurface', occupiedPixels=int(mask.sum()), corePixels=int(core.sum()))
    alphaHit = np.logical_and.reduce([pixels[..., 3] > 0 for pixels in images.values()])
    baseHit = images['Base'][..., :3].max(axis=-1) > 3
    normalRgb = images['Normal'][..., :3].astype(np.float32)
    normalVector = normalRgb / 127.5 - 1
    normalLength = np.linalg.norm(normalVector, axis=-1)
    normalHit = (normalRgb[..., 2] >= 120) & (normalLength >= .80) & (normalLength <= 1.20)
    FailPixels(core & ~alphaHit, 'Raw projection has alpha-zero surface interiors')
    FailPixels(core & ~baseHit, 'Raw projection has black/unbaked albedo surface interiors')
    FailPixels(core & ~normalHit, 'Raw projection has invalid or inward normal surface interiors')
    scalarHit = np.ones(mask.shape, dtype=bool)
    for channel in ('Roughness', 'Ao'):
        rgb = images[channel][..., :3]
        gray = rgb.max(axis=-1).astype(np.int16) - rgb.min(axis=-1).astype(np.int16) <= 1
        FailPixels(core & ~gray, 'Raw ' + channel + ' bake is not a scalar on the surface')
        scalarHit &= gray
    rough = images['Roughness'][..., 0]
    FailPixels(core & (rough < 200), 'Raw projected roughness falls below the dry-fibre range')
    valid = mask & alphaHit & baseHit & normalHit & scalarHit & (rough >= 200)
    # A fully missed tiny island must not borrow another island's padding.
    missingRows = []
    for rowIndex, row in enumerate(rows):
        raster = TrianglePixels(row['uv'], RAW_SIZE)
        if raster is None:
            continue
        low, high, inside = raster
        if inside.any() and not (valid[low[1]:high[1] + 1, low[0]:high[0] + 1] & inside).any():
            missingRows.append({'triangle': rowIndex, 'object': row['object'],
                                'part': row['part'], 'rasterPixels': int(inside.sum())})
    Require(not missingRows, 'Completely unbaked raster-resolvable UV triangles: ' +
            json.dumps(missingRows[:16]))
    # Values outside the common measured mask are explicitly zero until they
    # obtain an actual neighboring sample; no synthetic surface fallback exists.
    values = np.concatenate((images['Base'][..., :3].astype(np.float32), normalRgb,
                             images['Ao'][..., 0:1].astype(np.float32),
                             rough[..., None].astype(np.float32)), axis=-1)
    values[~valid] = 0
    initialHits = int(valid.sum())
    Progress('DilatingMeasuredBoundary', actualCommonHitPixels=initialHits,
             invalidBoundaryPixels=int((mask & ~valid).sum()), paddingPixels=PADDING_PIXELS)
    values, padded, dilationCounts = DilateNeighbors(values, valid, PADDING_PIXELS)
    FailPixels(mask & ~padded, 'Measured-neighbor dilation did not cover the UV raster boundary')
    runtimeMask = Rasterize(rows, RUNTIME_SIZE)
    Progress('PaddingRuntimeFootprints', maximumChebyshevRawDistance=RUNTIME_FOOTPRINT_MAX_DISTANCE,
             localLanczosHalo=RUNTIME_FOOTPRINT_HALO)
    values, padded, footprintReport = PadRuntimeFootprints(values, valid, padded, rows, runtimeMask)
    footprintReport['rawBakeEvidence'] = rawEvidence
    footprintReport['surfaceUvRecord'] = FileEvidence(uvPath)
    footprintReportPath = reviewPath / 'Data_RuntimeFootprintPaddingV10.json'
    SaveJson(footprintReport, footprintReportPath)
    # Neutral values exist only beyond measured texture padding, never on UVs.
    values[~padded, 3:6] = [127.5, 127.5, 255]
    values[~padded, 6:8] = [255, 255]
    Progress('Downsampling', rawResolution=RAW_SIZE, runtimeResolution=RUNTIME_SIZE)
    base = Image.fromarray(np.clip(np.rint(values[..., :3]), 0, 255).astype(np.uint8))
    base = base.resize((RUNTIME_SIZE, RUNTIME_SIZE), Image.Resampling.LANCZOS)
    vectors = np.stack([ResizeFloat(values[..., index]) for index in range(3, 6)], axis=-1)
    vectors = vectors / 127.5 - 1
    # Only nearly horizontal normals (raw B>=120) reach this stage. Clamp their
    # tiny negative Z to the tangent plane; never flip an inward projection.
    vectors[..., 2] = np.maximum(vectors[..., 2], 0)
    lengths = np.linalg.norm(vectors, axis=-1, keepdims=True)
    FailPixels(runtimeMask & (lengths[..., 0] < .05),
               'Normal downsampling cancels a production surface vector')
    vectors[lengths[..., 0] < .05] = [0, 0, 1]
    vectors /= np.maximum(np.linalg.norm(vectors, axis=-1, keepdims=True), 1e-8)
    normalPixels = np.clip(np.rint((vectors * .5 + .5) * 255), 0, 255).astype(np.uint8)
    Require(int(normalPixels[..., 2].min()) >= 128,
            'Normal encoder produced an inward hemisphere pixel')
    ao = np.clip(np.rint(ResizeFloat(values[..., 6])), 0, 255).astype(np.uint8)
    runtimeRough = np.clip(np.rint(ResizeFloat(values[..., 7])), 0, 255).astype(np.uint8)
    Require(int(runtimeRough.min()) >= 200,
            'Projected runtime roughness contains values below the dry-fibre range')
    surfaceRough = runtimeRough[runtimeMask]
    Require(int(surfaceRough.max()) - int(surfaceRough.min()) >= 8,
            'Actual projected surface roughness is effectively constant')
    FailPixels(runtimeMask & (np.asarray(base).max(axis=-1) <= 3),
               'Downsampled production UV contains black albedo holes')
    ormPixels = np.zeros((RUNTIME_SIZE, RUNTIME_SIZE, 3), dtype=np.uint8)
    ormPixels[..., 0], ormPixels[..., 1] = ao, runtimeRough
    runtimePath = reviewPath / 'RuntimeRoughness.png'
    SavePng(Image.fromarray(runtimeRough, mode='L'), runtimePath)
    outputs = []
    Progress('WritingLosslessPbrMaps')
    for channel, image in (('Base', base), ('Normal', Image.fromarray(normalPixels)),
                           ('Orm', Image.fromarray(ormPixels))):
        filePath = modelPath / ('Texture_SichuanBlanketPack' + channel + '.webp')
        SaveWebp(image.convert('RGB'), filePath)
        outputs.append({'channel': channel, **ImageEvidence(filePath),
                        'path': filePath.relative_to(projectPath).as_posix()})
    date = datetime.now().astimezone().date().isoformat()
    roughnessBake = {
        'method': 'selected-to-active-emission',
        'sourceProperty': 'Principled BSDF.Roughness',
        'sourceBlend': record['sourceBlend'],
        'sources': record['sources'], 'projection': record['projection'],
        'raw': rawEvidence['Roughness'], 'runtime': ImageEvidence(runtimePath)
    }
    surfaceBake = {
        'generator': 'Script_SichuanGameMapsV10.py@2',
        'date': date, 'resolution': [RUNTIME_SIZE, RUNTIME_SIZE],
        'intermediateResolution': [RAW_SIZE, RAW_SIZE],
        'uv': 'Unique non-overlapping GameUV / TEXCOORD_1',
        'colourSource': 'Actual high-to-low Base Color emission projection',
        'normalSource': 'Actual high-to-low tangent normal projection; BOX downsample and vector renormalization, no inward-normal flipping',
        'ao': 'Actual scalar AO projection retained in ORM.R',
        'roughness': 'Actual high-source Principled BSDF roughness socket projection retained in ORM.G',
        'metallicPixels': [0, 0],
        'roughnessPixels': [int(runtimeRough.min()), int(runtimeRough.max())],
        'surfaceRoughnessPixels': [int(surfaceRough.min()), int(surfaceRough.max())],
        'aoRange': [int(ao.min()), int(ao.max())],
        'padding': {
            'method': 'Common-mask eight-neighbor measured sample copy, at most one raw-pixel shell per iteration',
            'iterations': PADDING_PIXELS, 'addedPixelsPerIteration': dilationCounts,
            'rawActualCommonHitPixels': initialHits,
            'rawUvPixels': int(mask.sum()), 'rawCorePixels': int(core.sum()),
            'runtimeFootprintPadding': {
                'record': FileEvidence(footprintReportPath),
                'criticalRuntimePixels': len(footprintReport['criticalRuntimePixels']),
                'newPaddingPixels': footprintReport['newPaddingPixels'],
                'reassignedExistingPaddingPixels': footprintReport['reassignedExistingPaddingPixels'],
                'distanceLimitMetric': footprintReport['distanceLimitMetric'],
                'maximumCopyChebyshevDistanceRawPixels': footprintReport['maximumCopyChebyshevDistanceRawPixels'],
                'maximumCopyEuclideanDistanceRawPixels': footprintReport['maximumCopyEuclideanDistanceRawPixels'],
                'originalValidSamplesUnchanged': footprintReport['originalValidSamplesUnchanged'],
                'allRequiredFootprintsCovered': footprintReport['allRequiredFootprintsCovered']
            },
            'syntheticSurfaceFillPixels': 0
        },
        'coreFailurePolicy': 'Alpha-zero, black albedo, inward or invalid normal and fully missed raster triangles abort encoding',
        'normalEncoding': 'Lossless WebP; every final blue byte >=128',
        'dataEncoding': 'Lossless WebP; all ORM metallic bytes zero'
    }
    bakeRecord = {
        'generator': 'Script_SichuanGameMapsV10.py@2', 'date': date,
        'name': 'SichuanBlanketPack', 'sourceBlend': record['sourceBlend'],
        'projectionRecord': FileEvidence(projectionPath),
        'surfaceUvRecord': FileEvidence(uvPath),
        'rawBakes': rawEvidence, 'roughnessBake': roughnessBake,
        'surfaceBake': surfaceBake, 'outputs': outputs,
        'totalBytes': sum(item['bytes'] for item in outputs),
        'sourceProjection': record
    }
    recordPath = projectPath / '_import/SichuanBlanketPack/Data_SichuanBlanketPackTextureBake.json'
    SaveJson(bakeRecord, recordPath)
    atlas = {
        'layout': 'unique-surface-uv', 'uvOrigin': 'bottom-left',
        'uvSet': 'GameUV', 'texCoord': 1,
        'bakeResolution': [RAW_SIZE, RAW_SIZE],
        'runtimeResolution': [RUNTIME_SIZE, RUNTIME_SIZE],
        'packing': record.get('uvPacking', 'Actual GameUV islands recorded by Data_SurfaceUv.json')
    }
    manifest = {
        'schema': 'tengxian-model-textures-v2', 'id': 'SichuanBlanketPack',
        'date': date, 'pathsRelativeTo': 'Taierzhuang1938/',
        'scope': 'Independent high-to-low V10 game asset; all five components share one production atlas',
        'source': {'highBlend': record['sourceBlend'],
                   'materialSources': record.get('materialSources', []),
                   'projectionRecord': FileEvidence(projectionPath)},
        'bakeRecord': '_import/SichuanBlanketPack/Data_SichuanBlanketPackTextureBake.json',
        'surfaceEncoder': '_import/Script_SichuanGameMapsV10.py',
        'embeddedAsset': 'Model/SichuanBlanketPack/Model_SichuanBlanketPack.glb',
        'normalConvention': 'gl',
        'normalMeaning': surfaceBake['normalSource'],
        'atlas': atlas,
        'atlasReason': 'High-source materials and geometric relief are projected onto unique production UVs; source material tiles are not runtime atlas quadrants',
        'files': [{
            **{key: item[key] for key in ('channel', 'width', 'height', 'bytes', 'sha256')},
            'path': 'Model/SichuanBlanketPack/' + Path(item['path']).name,
            'colorSpace': 'sRGB' if item['channel'] == 'Base' else 'linear',
            'encoding': 'lossless WebP'
        } for item in outputs],
        'totalBytes': bakeRecord['totalBytes'],
        'physicalMeaning': 'Dry nonmetal natural fibres. ORM.R is actual projected AO, ORM.G is actual projected high-source roughness, ORM.B is zero.',
        'verification': {
            'allMaps1024': True, 'allMetalZero': True,
            'projectedRuntimeRoughnessMatchesOrmGreen': True,
            'roughnessRange': surfaceBake['roughnessPixels'],
            'surfaceRoughnessRange': surfaceBake['surfaceRoughnessPixels'],
            'rawCoreMisses': 0, 'syntheticSurfaceFillPixels': 0,
            'completeLosslessImageRoundTrips': True
        }
    }
    manifestPath = modelPath / 'Data_SichuanBlanketPackTextures.json'
    SaveJson(manifest, manifestPath)
    Progress('Complete', manifest=str(manifestPath), bakeRecord=str(recordPath),
             totalBytes=bakeRecord['totalBytes'],
             roughnessRange=surfaceBake['roughnessPixels'],
             surfaceRoughnessRange=surfaceBake['surfaceRoughnessPixels'])


if __name__ == '__main__':
    Main()
