"""Compact original straw and append a matching real cotton underside.

Call AddCompactMatContact(quilt, foot, straw) on the six baked game objects,
before pivot translation, shell orientation and Cotton. No Blender process is
started here. Only this module's helpers without bpy can run in ordinary Python.
"""

import math
import heapq
import json
import warnings
from collections import Counter, deque

import numpy as np


_COLOUR = 'BR_original_low_frequency_color'
_X_BOUNDS = (-1., .94)
_Y_BOUNDS = (-.445, .445)
_DENSE_STEP = .01
_STEP = .045
_GAP = .00025
_CLEARANCE = .010
_MAX_ADDED = 4500


def GridAxis(low, high, step):
    count = max(1, math.ceil((high - low) / step))
    return np.linspace(low, high, count + 1)


def Window(values, radius, method='median'):
    """A bounded physical neighbourhood; missing samples never become zero."""
    height, width = values.shape
    padded = np.pad(values, radius, mode='constant', constant_values=np.nan)
    stack = np.stack([padded[y:y + height, x:x + width]
                      for y in range(2 * radius + 1) for x in range(2 * radius + 1)])
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)
        function = {'median': np.nanmedian, 'min': np.nanmin, 'max': np.nanmax,
                    'mean': np.nanmean}[method]
        result = function(stack, axis=0)
    return result, np.isfinite(stack).sum(axis=0)


def FillMeasured(values, stepX, stepY, maximumDistance):
    """Fill bounded gaps from real samples, recording every physical distance.

    This reconstructs the new compressed core inside the original outer weave;
    it does not assert that the sparse input already had a solid top surface.
    """
    height, width = values.shape
    distance = np.full(values.shape, np.inf)
    source = np.full(values.shape, -1, dtype=np.int64)
    queue = []
    for y, x in zip(*np.where(np.isfinite(values))):
        distance[y, x], source[y, x] = 0., y * width + x
        heapq.heappush(queue, (0., int(y), int(x)))
    directions = [(dx, dy, math.hypot(dx * stepX, dy * stepY))
                  for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]
    while queue:
        old, y, x = heapq.heappop(queue)
        if old != distance[y, x] or old > maximumDistance:
            continue
        for dx, dy, cost in directions:
            xx, yy = x + dx, y + dy
            new = old + cost
            if 0 <= xx < width and 0 <= yy < height and new < distance[yy, xx] and new <= maximumDistance:
                distance[yy, xx], source[yy, xx] = new, source[y, x]
                heapq.heappush(queue, (new, yy, xx))
    filled = values.copy()
    missing = ~np.isfinite(filled) & (source >= 0)
    filled[missing] = values.reshape(-1)[source[missing]]
    return filled, distance, missing


def Bilinear(values, xs, ys, points):
    points = np.asarray(points, dtype=np.float64)
    fx = (points[:, 0] - xs[0]) / (xs[-1] - xs[0]) * (len(xs) - 1)
    fy = (points[:, 1] - ys[0]) / (ys[-1] - ys[0]) * (len(ys) - 1)
    ix = np.clip(np.floor(fx).astype(int), 0, len(xs) - 2)
    iy = np.clip(np.floor(fy).astype(int), 0, len(ys) - 2)
    tx, ty = np.clip(fx - ix, 0, 1), np.clip(fy - iy, 0, 1)
    corners = np.stack((values[iy, ix], values[iy, ix + 1],
                        values[iy + 1, ix], values[iy + 1, ix + 1]), axis=1)
    weights = np.stack(((1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty), axis=1)
    valid = ((fx >= -1e-8) & (fx <= len(xs) - 1 + 1e-8)
             & (fy >= -1e-8) & (fy <= len(ys) - 1 + 1e-8)
             & np.isfinite(corners).all(axis=1))
    return np.sum(np.nan_to_num(corners) * weights, axis=1), valid


def LargestRectangle(mask, minimumRows=2):
    """Largest all-valid vertex rectangle, with deterministic tie-breaking."""
    heights = np.zeros(mask.shape[1], dtype=int)
    best, area = None, 0
    for row in range(mask.shape[0]):
        heights = np.where(mask[row], heights + 1, 0)
        stack = []
        for column in range(len(heights) + 1):
            current = int(heights[column]) if column < len(heights) else 0
            start = column
            while stack and stack[-1][1] > current:
                left, high = stack.pop()
                start = left
                candidate = (row - high + 1, row, left, column - 1)
                # Score actual cells, rather than a one-vertex-wide strip.
                cells = max(0, high - 1) * max(0, column - left - 1)
                if high >= minimumRows and (cells > area or (cells == area and cells and (best is None or candidate < best))):
                    best, area = candidate, cells
            if current and (not stack or stack[-1][1] < current):
                stack.append((start, current))
    if best is None:
        raise ValueError('No continuous supported rectangular contact domain')
    return best


def GridFaces(nx, ny):
    """One up-facing straw triangulation; Quilt uses the exact opposite faces."""
    faces = []
    for y in range(ny - 1):
        for x in range(nx - 1):
            a = y * nx + x
            b, c, d = a + 1, a + nx, a + nx + 1
            faces.extend(((a, b, d), (a, d, c)) if (x + y) % 2 == 0
                         else ((a, b, c), (b, d, c)))
    return faces


def SurfaceHeight(xs, ys, heights, points):
    """Exact piecewise-triangle height, not bilinear interpolation of the cap."""
    points = np.asarray(points, dtype=np.float64)
    fx = (points[:, 0] - xs[0]) / (xs[-1] - xs[0]) * (len(xs) - 1)
    fy = (points[:, 1] - ys[0]) / (ys[-1] - ys[0]) * (len(ys) - 1)
    valid = ((fx >= -1e-7) & (fx <= len(xs) - 1 + 1e-7)
             & (fy >= -1e-7) & (fy <= len(ys) - 1 + 1e-7))
    ix, iy = np.clip(np.floor(fx).astype(int), 0, len(xs) - 2), np.clip(np.floor(fy).astype(int), 0, len(ys) - 2)
    tx, ty = np.clip(fx - ix, 0, 1), np.clip(fy - iy, 0, 1)
    a, b, c, d = heights[iy, ix], heights[iy, ix + 1], heights[iy + 1, ix], heights[iy + 1, ix + 1]
    even = (ix + iy) % 2 == 0
    first = np.where(ty <= tx, a + (b - a) * tx + (d - b) * ty,
                     a + (d - c) * tx + (c - a) * ty)
    second = np.where(tx + ty <= 1, a + (b - a) * tx + (c - a) * ty,
                      d + (c - d) * (1 - tx) + (b - d) * (1 - ty))
    return np.where(even, first, second), valid


def BoundaryEdges(faces):
    counts = Counter(tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:] + face[:1]))
    return [(a, b) for face in faces for a, b in zip(face, face[1:] + face[:1])
            if counts[tuple(sorted((a, b)))] == 1]


def TriangleCount(mesh):
    return sum(len(face.vertices) - 2 for face in mesh.polygons)


def BmTriangleCount(bm):
    return sum(len(face.verts) - 2 for face in bm.faces)


def ContactGrassBudget(otherCounts, quiltTriangles, footTriangles, bodyTriangles,
                       cottonTriangles, wholeBedLimit=50000):
    """Budget actual validated geometry, without borrowing cleanup headroom."""
    remaining = (int(wholeBedLimit) - sum(int(value) for value in otherCounts.values())
                 - int(quiltTriangles) - int(footTriangles)
                 - int(bodyTriangles) - int(cottonTriangles))
    if remaining < 0:
        raise ValueError('Cotton and new compact body alone exhaust the whole-bed triangle budget')
    return remaining


def ValidateContactMeshData(mesh, label, matrixWorld=None):
    """Validate a private mesh and prove retained loop/face data are exact.

    The caller must not supply a live game/source mesh. Temporary identity
    layers survive native validation and geometric zero-area deletion, making
    removal distinguishable from corruption or movement. No role-based budget
    deletion happens here.
    """
    import bmesh
    faceKey, loopKey = 'ContactValidationFaceId', 'ContactValidationLoopId'
    if mesh.attributes.get(faceKey) or mesh.attributes.get(loopKey):
        raise ValueError('Contact validation identity layer already exists')
    beforeVertices = np.empty((len(mesh.vertices), 3), dtype=np.float32)
    mesh.vertices.foreach_get('co', beforeVertices.ravel())
    faceCount, loopCount = len(mesh.polygons), len(mesh.loops)
    uvBefore = {}
    for layer in mesh.uv_layers:
        values = np.empty((loopCount, 2), dtype=np.float32)
        layer.data.foreach_get('uv', values.ravel());uvBefore[layer.name] = values
    colorsBefore = {}
    for layer in mesh.color_attributes:
        if layer.domain != 'CORNER':
            continue
        values = np.empty((loopCount, 4), dtype=np.float32)
        layer.data.foreach_get('color', values.ravel());colorsBefore[layer.name] = values
    intsBefore = {}
    for layer in mesh.attributes:
        if layer.domain == 'FACE' and layer.data_type == 'INT':
            values = np.empty(faceCount, dtype=np.int32)
            layer.data.foreach_get('value', values);intsBefore[layer.name] = values
    mesh.attributes.new(name=faceKey, type='INT', domain='FACE').data.foreach_set('value', np.arange(1, faceCount + 1, dtype=np.int32))
    mesh.attributes.new(name=loopKey, type='INT', domain='CORNER').data.foreach_set('value', np.arange(1, loopCount + 1, dtype=np.int32))
    beforeTriangles = TriangleCount(mesh)
    nativeRepaired = mesh.validate(verbose=False, clean_customdata=False)
    mesh.update()
    # Native mesh validation handles bad indices/duplicate topology. Collinear
    # but distinct-index triangles additionally use the unchanged Pack world
    # gate; no nonzero-area simplification threshold is introduced.
    positions = np.empty((len(mesh.vertices), 3), dtype=np.float64)
    mesh.vertices.foreach_get('co', positions.ravel())
    matrix = np.eye(4) if matrixWorld is None else np.asarray(matrixWorld, dtype=np.float64)
    world = positions @ matrix[:3, :3].T + matrix[:3, 3]
    badFaces = []
    for polygon in mesh.polygons:
        if len(polygon.vertices) != 3:
            raise ValueError('Prepared contact mesh must already be triangulated')
        first, second, third = world[list(polygon.vertices)]
        if np.linalg.norm(np.cross(second - first, third - first)) < 1e-12:
            badFaces.append(polygon.index)
    if badFaces:
        bm = bmesh.new()
        try:
            bm.from_mesh(mesh);bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[bm.faces[index] for index in badFaces], context='FACES_ONLY')
            bm.to_mesh(mesh)
        finally:
            bm.free()
        mesh.update()
    if mesh.validate(verbose=False, clean_customdata=False):
        raise ValueError('Contact private mesh remains invalid after validation')
    afterVertices = np.empty((len(mesh.vertices), 3), dtype=np.float32)
    mesh.vertices.foreach_get('co', afterVertices.ravel())
    if not np.array_equal(beforeVertices, afterVertices):
        raise ValueError('Contact validation moved or reordered source vertices')
    faceIds = np.empty(len(mesh.polygons), dtype=np.int32)
    loopIds = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.attributes[faceKey].data.foreach_get('value', faceIds)
    mesh.attributes[loopKey].data.foreach_get('value', loopIds)
    if (np.any(faceIds < 1) or np.any(faceIds > faceCount) or len(np.unique(faceIds)) != len(faceIds)
            or np.any(loopIds < 1) or np.any(loopIds > loopCount) or len(np.unique(loopIds)) != len(loopIds)):
        raise ValueError('Contact validation lost unique face/corner identity')
    for name, values in uvBefore.items():
        layer = mesh.uv_layers.get(name)
        if layer is None:
            raise ValueError('Contact validation lost UV layer ' + name)
        after = np.empty((len(mesh.loops), 2), dtype=np.float32)
        layer.data.foreach_get('uv', after.ravel())
        if not np.array_equal(values[loopIds - 1], after):
            raise ValueError('Contact validation changed retained UV data: ' + name)
    for name, values in colorsBefore.items():
        layer = mesh.color_attributes.get(name)
        if layer is None or layer.domain != 'CORNER':
            raise ValueError('Contact validation lost corner colour layer ' + name)
        after = np.empty((len(mesh.loops), 4), dtype=np.float32)
        layer.data.foreach_get('color', after.ravel())
        if not np.array_equal(values[loopIds - 1], after):
            raise ValueError('Contact validation changed retained FLOAT/CORNER colour: ' + name)
    for name, values in intsBefore.items():
        layer = mesh.attributes.get(name)
        if layer is None or layer.domain != 'FACE' or layer.data_type != 'INT':
            raise ValueError('Contact validation lost source FACE INT layer ' + name)
        after = np.empty(len(mesh.polygons), dtype=np.int32)
        layer.data.foreach_get('value', after)
        if not np.array_equal(values[faceIds - 1], after):
            raise ValueError('Contact validation changed source lineage/role field: ' + name)
    removed = np.ones(faceCount, dtype=bool);removed[faceIds - 1] = False
    protected = intsBefore.get('StrawProtectedStructure', np.zeros(faceCount, dtype=np.int32))
    report = {'group': label, 'trianglesBefore': beforeTriangles, 'trianglesAfter': TriangleCount(mesh),
              'facesBefore': faceCount, 'facesAfter': len(mesh.polygons), 'nativeValidationRepaired': bool(nativeRepaired),
              'geometricZeroAreaFacesRemoved': len(badFaces), 'worldCrossMagnitudeThreshold': 1e-12,
              'protectedInvalidFacesRemovedByValidation': int(np.count_nonzero(removed & (protected > 0))),
              'invalidFaceRemovalIsBudgetPruning': False, 'vertexOrderAndPositionsExactlyUnchanged': True,
              'retainedUvsExactlyUnchanged': True, 'retainedFloatCornerColorsExactlyUnchanged': True,
              'retainedFaceIntLineageAndRolesExactlyUnchanged': True}
    mesh.attributes.remove(mesh.attributes[faceKey]);mesh.attributes.remove(mesh.attributes[loopKey])
    return report


def ValidatePreparedContactBMesh(bm, label, matrixWorld=None):
    """Return a validated replacement BMesh, leaving its owner transactional."""
    import bpy
    import bmesh
    mesh = bpy.data.meshes.new('Mesh_ContactBudgetValidationTemporary')
    try:
        bm.to_mesh(mesh)
        report = ValidateContactMeshData(mesh, label, matrixWorld)
        result = bmesh.new()
        result.from_mesh(mesh)
        result.verts.ensure_lookup_table();result.faces.ensure_lookup_table()
        return result, report
    finally:
        bpy.data.meshes.remove(mesh)


def ChooseGrassIslands(islands, preferredBudget=16000, maximumBudget=16000,
                       protectionAttributePresent=False):
    """Keep whole substantial islands; never move surviving grass vertices."""
    totalArea = sum(row['areaM2'] for row in islands)
    protected = {row['id'] for row in islands if row.get('protectedTriangles', 0) > 0}
    # Explicit source roles take precedence over geometry ranking. A short
    # binding can be visually essential even when its area/length score is tiny.
    mandatory = set(protected)
    if not protectionAttributePresent:
        mandatory.update(row['id'] for row in islands if row.get('silhouetteExtreme')
                         or row['areaM2'] >= max(totalArea * .02, 1e-12))
    byId = {row['id']: row for row in islands}
    mandatoryCost = sum(byId[index]['triangles'] for index in mandatory)
    if mandatoryCost > maximumBudget:
        raise ValueError('Protected grass structure exceeds remaining whole-bed budget; adjust source role budgets: '
                         + json.dumps({'mandatoryWholeComponentTriangles': mandatoryCost,
                                       'protectedTriangles': sum(row.get('protectedTriangles', 0) for row in islands),
                                       'unprotectedTriangles': sum(row['triangles'] - row.get('protectedTriangles', 0) for row in islands),
                                       'protectionAttributePresent': protectionAttributePresent,
                                       'maximumAvailableOriginalGrassBudget': maximumBudget,
                                       'mandatoryComponents': len(mandatory),
                                       'largestMandatoryIslands': sorted((byId[index] for index in mandatory), key=lambda row: (-row['triangles'], row['id']))[:24]}))
    limit = min(maximumBudget, max(preferredBudget, mandatoryCost))
    selected = set(mandatory)
    used = mandatoryCost
    ranked = sorted(islands, key=lambda row: (-row['areaM2'] * row['longAxisM'],
                                             -row['areaM2'], row['id']))
    for row in ranked:
        if row['id'] not in selected and used + row['triangles'] <= limit:
            selected.add(row['id'])
            used += row['triangles']
    removed = [row for row in ranked if row['id'] not in selected]
    removedProtected = sum(row.get('protectedTriangles', 0) for row in removed)
    if removedProtected:
        raise ValueError('Budget pruning attempted to remove protected source grass')
    removedArea = sum(row['areaM2'] for row in removed)
    return selected, {'method': 'Components containing source-tagged main weave/bindings are mandatory; only unprotected components may be ranked by area times length',
                      'protectionAttributePresent': protectionAttributePresent,
                      'protectedComponents': len(protected),
                      'protectedMandatoryWholeComponentTriangles': sum(byId[index]['triangles'] for index in protected),
                      'protectedTrianglesBefore': sum(row.get('protectedTriangles', 0) for row in islands),
                      'unprotectedTrianglesBefore': sum(row['triangles'] - row.get('protectedTriangles', 0) for row in islands),
                      'protectedTrianglesKept': sum(row.get('protectedTriangles', 0) for row in islands if row['id'] in selected),
                      'protectedTrianglesRemovedByBudget': removedProtected,
                      'unprotectedTrianglesRemovedByBudget': sum(row['triangles'] for row in removed),
                      'preferredOriginalGrassBudget': preferredBudget, 'maximumAvailableOriginalGrassBudget': maximumBudget,
                      'effectiveOriginalGrassBudget': limit, 'beforeIslands': len(islands),
                      'keptIslands': len(selected), 'removedIslandsCount': len(removed),
                      'beforeTriangles': sum(row['triangles'] for row in islands), 'keptTriangles': used,
                      'removedTriangles': sum(row['triangles'] for row in removed),
                      'beforeAreaM2': totalArea, 'removedAreaM2': removedArea,
                      'removedAreaFraction': removedArea / totalArea if totalArea else 0.,
                      'removedIslands': removed, 'keptIslandIds': sorted(selected),
                      'survivingVertexPositionsUnchanged': True}


def PruneGrassIslands(bm, matrix, preferredBudget, maximumBudget):
    import bmesh
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()
    protectedLayer = bm.faces.layers.int.get('StrawProtectedStructure')
    faces = list(bm.faces)
    usedVertices = {vertex for face in faces for vertex in face.verts}
    world = {vertex: np.asarray((matrix @ vertex.co)[:], dtype=np.float64) for vertex in usedVertices}
    if not faces:
        return {'beforeIslands': 0, 'keptTriangles': 0, 'removedTriangles': 0, 'removedAreaFraction': 0.,
                'protectionAttributePresent': protectedLayer is not None, 'protectedTrianglesRemovedByBudget': 0}
    low = np.min(np.asarray(list(world.values())), axis=0)
    high = np.max(np.asarray(list(world.values())), axis=0)
    unseen = set(faces)
    groups, summaries = [], []
    while unseen:
        start = min(unseen, key=lambda face: face.index)
        unseen.remove(start)
        queue, component = deque([start]), []
        while queue:
            face = queue.popleft()
            component.append(face)
            neighbours = {other for edge in face.edges for other in edge.link_faces if other in unseen}
            for other in sorted(neighbours, key=lambda item: item.index):
                unseen.remove(other)
                queue.append(other)
        vertices = {vertex for face in component for vertex in face.verts}
        points = np.asarray([world[vertex] for vertex in vertices])
        minimum, maximum = points.min(axis=0), points.max(axis=0)
        area = 0.
        for face in component:
            triangle = np.asarray([world[vertex] for vertex in face.verts])
            area += .5 * float(np.linalg.norm(np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])))
        index = len(groups)
        groups.append(component)
        summaries.append({'id': index, 'triangles': len(component), 'areaM2': area,
                          'protectedTriangles': sum(int(face[protectedLayer] > 0) for face in component) if protectedLayer is not None else 0,
                          'longAxisM': float(np.max(maximum - minimum)),
                          'boundsMin': minimum.tolist(), 'boundsMax': maximum.tolist(),
                          'silhouetteExtreme': bool(np.any(np.abs(minimum - low) < 1e-7)
                                                    or np.any(np.abs(maximum - high) < 1e-7))})
    keep, stats = ChooseGrassIslands(summaries, preferredBudget, maximumBudget,
                                    protectionAttributePresent=protectedLayer is not None)
    discarded = [face for index, group in enumerate(groups) if index not in keep for face in group]
    if protectedLayer is not None and any(face[protectedLayer] > 0 for face in discarded):
        raise ValueError('Protected visible Straw face reached the budget deletion list')
    if discarded:
        bmesh.ops.delete(bm, geom=discarded, context='FACES_ONLY')
    return stats


def RawBvh(objects):
    from mathutils.bvhtree import BVHTree
    vertices, triangles = [], []
    for obj in objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        start = len(vertices)
        vertices.extend(obj.matrix_world @ vertex.co for vertex in mesh.vertices)
        triangles.extend(tuple(start + index for index in face.vertices) for face in mesh.loop_triangles)
    if not triangles:
        raise ValueError('Contact inputs have no triangles')
    points = np.array([point[:] for point in vertices], dtype=np.float64)
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=1e-7), points.min(axis=0), points.max(axis=0)


class Envelope:
    def __init__(self, quiltTree, strawTree, low, high):
        from mathutils import Vector
        self.quilt, self.straw = quiltTree, strawTree
        self.low, self.high = min(.3, float(low[2]) - .02), max(.9, float(high[2]) + .02)
        self.up, self.down = Vector((0, 0, 1)), Vector((0, 0, -1))

    def Query(self, x, y):
        from mathutils import Vector
        top = self.quilt.ray_cast(Vector((x, y, self.high)), self.down, self.high - self.low)[0]
        bottom = self.quilt.ray_cast(Vector((x, y, self.low)), self.up, self.high - self.low)[0]
        support = self.straw.ray_cast(Vector((x, y, .74)), self.down, .22)[0]
        return (float(bottom.z) if bottom else math.nan,
                float(top.z) if top else math.nan,
                float(support.z) if support else math.nan)


def CompactGrid(envelope, strawLow, strawHigh):
    lowX, highX = max(_X_BOUNDS[0], strawLow[0] + .01), min(_X_BOUNDS[1], strawHigh[0] - .01)
    lowY, highY = max(_Y_BOUNDS[0], strawLow[1] + .020), min(_Y_BOUNDS[1], strawHigh[1] - .020)
    if highX - lowX < 1.4 or highY - lowY < .75:
        raise ValueError('The actual Straw footprint is too small for the compact body')
    denseXs, denseYs = GridAxis(lowX, highX, _DENSE_STEP), GridAxis(lowY, highY, _DENSE_STEP)
    samples = np.asarray([envelope.Query(x, y) for y in denseYs for x in denseXs]).reshape(len(denseYs), len(denseXs), 3)
    lower, upper, straw = samples[:, :, 0], samples[:, :, 1], samples[:, :, 2]
    stepX, stepY = denseXs[1] - denseXs[0], denseYs[1] - denseYs[0]
    upperFilled, upperDistance, upperMissing = FillMeasured(upper, stepX, stepY, .025)
    # Sparse ribbon input covers only part of the hidden mattress footprint.
    # Build the authorised real core from measured height, without extrapolating
    # beyond 150mm of real Straw or across an upper-cloth opening over 25mm.
    measured = straw[np.isfinite(straw)]
    if len(measured) < 20:
        raise ValueError('Insufficient actual Straw measurements for a continuous core')
    lowQuantile, highQuantile = np.quantile(measured, [.10, .90])
    broadInput = np.where(np.isfinite(straw), np.clip(straw, lowQuantile, highQuantile), np.nan)
    strawFilled, strawDistance, strawMissing = FillMeasured(broadInput, stepX, stepY, .15)
    median, count = Window(strawFilled, 2)
    smooth, _ = Window(median, 1, 'mean')
    largeEnvelope, _ = Window(straw, 2, 'max')
    largeEnvelope, _, _ = FillMeasured(largeEnvelope, stepX, stepY, .15)
    # Compress below the existing broad envelope, rather than inflate a board.
    height = np.minimum(smooth - .0015, largeEnvelope - .0005)
    # Only credible lower-shell samples constrain compression; a low hanging
    # apron must not pull the mattress down by tens of centimetres.
    credibleLower = np.where((upper - lower > .003) & (lower >= strawFilled - .025), lower, np.nan)
    lowerCeiling, _ = Window(credibleLower, math.ceil(_STEP / _DENSE_STEP), 'min')
    height = np.where(np.isfinite(lowerCeiling), np.minimum(height, lowerCeiling - _GAP - .0005), height)
    upperCeiling, _ = Window(upperFilled, 2, 'min')
    height = np.minimum(height, upperCeiling - _CLEARANCE - _GAP)
    height[(count < 5) | ~np.isfinite(upperFilled) | ~np.isfinite(strawFilled)] = np.nan
    xs, ys = GridAxis(lowX, highX, _STEP), GridAxis(lowY, highY, _STEP)
    xy = np.asarray([(x, y) for y in ys for x in xs])
    values, valid = Bilinear(height, denseXs, denseYs, xy)
    rawUpper = np.array([envelope.Query(x, y)[1] for x, y in xy])
    interpolatedUpper, upperValid = Bilinear(upperFilled, denseXs, denseYs, xy)
    rawUpper = np.where(np.isfinite(rawUpper), rawUpper, np.where(upperValid, interpolatedUpper, np.nan))
    valid &= np.isfinite(rawUpper) & (rawUpper - values - _GAP >= _CLEARANCE - 1e-7)
    # Preserve the actual mattress body's broad cross-section. A long narrow
    # strip under the foot apron is not a replacement for the wide main body.
    minimumRows = min(len(ys), math.ceil(.85 / (ys[1] - ys[0])) + 1)
    firstY, lastY, firstX, lastX = LargestRectangle(valid.reshape(len(ys), len(xs)), minimumRows)
    heights = values.reshape(len(ys), len(xs))[firstY:lastY + 1, firstX:lastX + 1].copy()
    xs, ys = xs[firstX:lastX + 1], ys[firstY:lastY + 1]
    if xs[-1] - xs[0] < 1.4 or ys[-1] - ys[0] < .75:
        raise ValueError('No broad real bearing domain with a protected upper shell')
    xy = np.asarray([(x, y) for y in ys for x in xs])
    distance = np.minimum.reduce((xy[:, 0] - xs[0], xs[-1] - xy[:, 0], xy[:, 1] - ys[0], ys[-1] - xy[:, 1]))
    parameter = np.clip(distance / .035, 0, 1)
    edgeDrop = .0025 * (1 - parameter * parameter * (3 - 2 * parameter))
    heights -= edgeDrop.reshape(heights.shape)
    # Validate actual upper clearance at every corner/centre/edge midpoint.
    probes = [(x, y) for y in ys for x in xs]
    probes += [((xs[x] + xs[x + 1]) * .5, (ys[y] + ys[y + 1]) * .5)
               for y in range(len(ys) - 1) for x in range(len(xs) - 1)]
    probes += [((xs[x] + xs[x + 1]) * .5, y) for y in ys for x in range(len(xs) - 1)]
    probes += [(x, (ys[y] + ys[y + 1]) * .5) for x in xs for y in range(len(ys) - 1)]
    z, _ = SurfaceHeight(xs, ys, heights, probes)
    envelopeHeights, envelopeValid = Bilinear(largeEnvelope, denseXs, denseYs, probes)
    if not envelopeValid.all():
        raise ValueError('Compact cap extends beyond the measured broad Straw envelope')
    excess = max(0., float((z - envelopeHeights).max()))
    if excess:
        # Only the adjacent coarse corners move down; an isolated low edge
        # measurement must not lower the entire mattress by centimetres.
        probesArray = np.asarray(probes)
        ix = np.clip(np.floor((probesArray[:, 0] - xs[0]) / (xs[-1] - xs[0]) * (len(xs) - 1)).astype(int), 0, len(xs) - 2)
        iy = np.clip(np.floor((probesArray[:, 1] - ys[0]) / (ys[-1] - ys[0]) * (len(ys) - 1)).astype(int), 0, len(ys) - 2)
        needed = np.maximum(0, z - envelopeHeights + .00025)
        needed[z <= envelopeHeights] = 0
        reductions = np.zeros(heights.size)
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            np.maximum.at(reductions, (iy + dy) * len(xs) + ix + dx, needed)
        heights -= reductions.reshape(heights.shape)
        z, _ = SurfaceHeight(xs, ys, heights, probes)
    clearances = []
    upperAtProbes, upperAtProbesValid = Bilinear(upperFilled, denseXs, denseYs, probes)
    bridgedUpperProbes = 0
    for probeIndex, ((x, y), heightValue) in enumerate(zip(probes, z)):
        top = envelope.Query(x, y)[1]
        if not math.isfinite(top) and upperAtProbesValid[probeIndex]:
            top = upperAtProbes[probeIndex]
            bridgedUpperProbes += 1
        if not math.isfinite(top) or top - heightValue - _GAP < .008:
            raise ValueError('A compact cap sample lacks 8mm clearance below real visible cloth')
        clearances.append(top - heightValue - _GAP)
    return xs, ys, heights, {'denseGrid': [len(denseXs), len(denseYs)],
                            'grid': [len(xs), len(ys)], 'boundsX': [float(xs[0]), float(xs[-1])],
                            'boundsY': [float(ys[0]), float(ys[-1])],
                            'minimumActualUpperClearanceM': float(min(clearances)),
                            'maximumAboveSampledLargeStrawEnvelopeM': max(0., float((z - envelopeHeights).max())),
                            'envelopeSafetyLoweringM': excess + .00025 if excess else 0.,
                            'measuredStrawSamples': int(np.isfinite(straw).sum()),
                            'coreReconstructedGapSamples': int(strawMissing.sum()),
                            'maximumReconstructedStrawGapDistanceM': float(strawDistance[strawMissing].max()) if strawMissing.any() else 0.,
                            'upperRayHoleSamplesBridged': int(upperMissing.sum()),
                            'maximumUpperHoleDistanceM': float(upperDistance[upperMissing].max()) if upperMissing.any() else 0.,
                            'upperProbeHolesBridged': bridgedUpperProbes,
                            'edgeRoundDownM': .0025, 'edgeTransitionM': .035}


def AttributeBvh(objects, envelope=None, foot=None, footMean=None):
    from mathutils.bvhtree import BVHTree
    vertices, faces, records = [], [], []
    for obj in objects:
        mesh, matrix = obj.data, obj.matrix_world
        mesh.calc_loop_triangles()
        for face in mesh.loop_triangles:
            points = [matrix @ mesh.vertices[index].co for index in face.vertices]
            normal = (points[1] - points[0]).cross(points[2] - points[0])
            if normal.length < 1e-12:
                continue
            if envelope is not None:
                center = (points[0] + points[1] + points[2]) / 3
                lower, upper, _ = envelope.Query(center.x, center.y)
                if normal.normalized().z > -.20 or not math.isfinite(lower) or abs(center.z - lower) > .001:
                    continue
            uv = np.asarray([mesh.uv_layers['UVMap'].data[index].uv[:] for index in face.loops])
            color = np.asarray([mesh.color_attributes[_COLOUR].data[index].color[:] for index in face.loops])
            if obj == foot:
                color[:, :3] *= footMean
            start = len(vertices)
            vertices.extend(points)
            faces.append((start, start + 1, start + 2))
            records.append((np.array([p[:] for p in points]), uv, color))
    if not faces:
        raise ValueError('No certified original surface for compact-contact attributes')
    return BVHTree.FromPolygons(vertices, faces, all_triangles=True, epsilon=1e-7), records


def AttributeAt(tree, records, point):
    from mathutils import Vector
    from Script_PatchedTimberBedLining import _Barycentric
    location, _, index, distance = tree.find_nearest(Vector(point))
    if location is None:
        raise ValueError('No original UV/colour at compact-contact point')
    triangle, uv, color = records[index]
    weights = _Barycentric(location[:], triangle)
    return weights @ uv, np.clip(weights @ color, 0, 1)


def HiddenFaces(obj, envelope, xs, ys, heights):
    selected = []
    for face in obj.data.polygons:
        points = [obj.matrix_world @ obj.data.vertices[index].co for index in face.vertices]
        if len(points) != 3:
            raise ValueError('Contact expects the triangulated baked game meshes')
        normal = (points[1] - points[0]).cross(points[2] - points[0])
        if normal.length < 1e-12 or normal.normalized().z > -.45:
            continue
        probes = points + [(points[0] + points[1] + points[2]) / 3]
        probes += [(points[i] + points[(i + 1) % 3]) * .5 for i in range(3)]
        if any(min(p.x - xs[0], xs[-1] - p.x, p.y - ys[0], ys[-1] - p.y) < .003 for p in probes):
            continue
        accepted = True
        for point in probes:
            lower, upper, _ = envelope.Query(point.x, point.y)
            if not (math.isfinite(lower) and math.isfinite(upper)
                    and abs(point.z - lower) < .001 and upper - point.z > .008):
                accepted = False
                break
        if accepted:
            selected.append(face.index)
    return selected


def AddCompactMatContact(quilt, foot, straw, validateBeforeBudget=False):
    """Return audits; edit only original Straw interior and hidden cotton faces."""
    import bpy
    import bmesh
    from mathutils import Vector
    from Script_PatchedTimberBedLining import _FootBaseMean

    objects = (quilt, foot, straw)
    for obj in objects:
        if obj.type != 'MESH' or len(obj.data.materials) != 1 or obj.data.users > 1:
            raise ValueError('Contact inputs must be single-user, single-material baked meshes')
        color = obj.data.color_attributes.get(_COLOUR)
        if obj.data.uv_layers.get('UVMap') is None or color is None or color.domain != 'CORNER' or color.data_type != 'FLOAT_COLOR':
            raise ValueError(f'{obj.name} lacks native UVMap / CORNER colour')
        if obj.get('CompactMatContactAdded', False) or obj.get('GameQuiltLiningAdded', False):
            raise ValueError('Build compact contact from the base low meshes, not an existing lining')
    bpy.context.view_layer.update()
    quiltTree, quiltLow, quiltHigh = RawBvh([quilt, foot])
    strawTree, strawLow, strawHigh = RawBvh([straw])
    envelope = Envelope(quiltTree, strawTree, quiltLow, quiltHigh)
    xs, ys, heights, profileStats = CompactGrid(envelope, strawLow, strawHigh)
    faces = GridFaces(len(xs), len(ys))
    supportPoints = [(float(x), float(y), float(heights[j, i]))
                     for j, y in enumerate(ys) for i, x in enumerate(xs)]
    cottonPoints = [(x, y, z + _GAP) for x, y, z in supportPoints]
    cottonFaces = [tuple(reversed(face)) for face in faces]
    boundary = BoundaryEdges(cottonFaces)
    # The new compact body has a real underside, not a zero-thickness plate.
    # Its bottom stays inside the original mat's broad 35mm construction depth.
    bottomZ = min(float(np.quantile(heights, .10)) - .035, float(heights.min()) - .008)
    supportBoundary = BoundaryEdges(faces)
    bottomIds = {}
    for index in sorted({i for edge in supportBoundary for i in edge}):
        bottomIds[index] = len(supportPoints)
        supportPoints.append((supportPoints[index][0], supportPoints[index][1], bottomZ))
    bottomCenter = len(supportPoints)
    supportPoints.append(((float(xs[0]) + float(xs[-1])) * .5,
                          (float(ys[0]) + float(ys[-1])) * .5, bottomZ))
    bodyFaces = list(faces)
    for a, b in supportBoundary:
        ba, bb = bottomIds[a], bottomIds[b]
        bodyFaces.extend(((b, a, ba), (b, ba, bb), (bottomCenter, bb, ba)))
    footMean, footAudit = _FootBaseMean(foot)
    cottonTree, cottonRecords = AttributeBvh([quilt, foot], envelope, foot, footMean)
    strawAttrTree, strawRecords = AttributeBvh([straw])
    # A narrow, hidden return enters the retained original lower shell. All
    # bearing triangles themselves keep the exact paired 0.25mm separation.
    hemIds = {}
    for index in sorted({i for edge in boundary for i in edge}):
        x, y, z = cottonPoints[index]
        dx = -1 if abs(x - xs[0]) < 1e-7 else 1 if abs(x - xs[-1]) < 1e-7 else 0
        dy = -1 if abs(y - ys[0]) < 1e-7 else 1 if abs(y - ys[-1]) < 1e-7 else 0
        norm = math.hypot(dx, dy)
        hx, hy = x + .0015 * dx / norm, y + .0015 * dy / norm
        lower, upper, _ = envelope.Query(hx, hy)
        if not math.isfinite(upper):
            neighbours = [envelope.Query(hx + dx, hy + dy) for dx, dy in
                          ((-.01, 0), (.01, 0), (0, -.01), (0, .01), (-.02, 0), (.02, 0), (0, -.02), (0, .02))]
            neighbours = [sample for sample in neighbours if math.isfinite(sample[1])]
            if not neighbours:
                raise ValueError('The contact hem extends outside real original cloth')
            upper = min(sample[1] for sample in neighbours)
            if not math.isfinite(lower):
                lower = min((sample[0] for sample in neighbours if math.isfinite(sample[0])), default=z + .001)
        target = max(z + .001, lower + .0005) if math.isfinite(lower) else z + .002
        target = min(target, upper - .008)
        if target < z:
            raise ValueError('A hidden return hem would reach the upper cloth')
        hemIds[index] = len(cottonPoints)
        cottonPoints.append((hx, hy, target))
    for a, b in boundary:
        cottonFaces.extend(((b, a, hemIds[a]), (b, hemIds[a], hemIds[b])))
    before = {obj.name: TriangleCount(obj.data) for obj in objects}
    removed = {obj: HiddenFaces(obj, envelope, xs, ys, heights) for obj in (quilt, foot)}
    original = {obj: np.asarray([vertex.co[:] for vertex in obj.data.vertices], dtype=np.float32) for obj in objects}
    prepared = {}
    stats = {}
    try:
        for obj in objects:
            bm = bmesh.new()
            prepared[obj] = bm
            bm.from_mesh(obj.data)
            bm.verts.ensure_lookup_table()
            bm.faces.ensure_lookup_table()
            if obj in removed:
                bmesh.ops.delete(bm, geom=[bm.faces[index] for index in removed[obj]], context='FACES_ONLY')
        sbm = prepared[straw]
        matrix, inverse = straw.matrix_world.copy(), straw.matrix_world.inverted()
        originalStrawVertices = list(sbm.verts)
        originalStrawVertexSet = set(originalStrawVertices)
        lineage = sbm.faces.layers.int.new('ContactSourceFace')
        protectedLayer = sbm.faces.layers.int.get('StrawProtectedStructure')
        sourceProtection = {}
        for index, face in enumerate(sbm.faces):
            face[lineage] = index + 1
            if protectedLayer is not None:
                sourceProtection[index + 1] = int(face[protectedLayer] > 0)
        # Cut at the footprint and real body's bottom. Original pieces outside
        # the new body retain their coordinates; only fully hidden inner layers
        # are removed, instead of retaining 24k collapsed disconnected ribbons.
        for axis, value in ((0, xs[0]), (0, xs[-1]), (1, ys[0]), (1, ys[-1]), (2, bottomZ)):
            worldNormal = Vector(tuple(1 if i == axis else 0 for i in range(3)))
            worldPoint = Vector(tuple(value if i == axis else 0 for i in range(3)))
            localNormal = matrix.to_3x3().transposed() @ worldNormal
            if axis == 2:
                # The four previous cuts isolate the footprint. There is no
                # reason to split long visible grass on the rest of the bed at
                # the compact body's bottom height.
                chosenFaces = []
                for face in sbm.faces:
                    center = matrix @ face.calc_center_median()
                    if xs[0] - 1e-7 <= center.x <= xs[-1] + 1e-7 and ys[0] - 1e-7 <= center.y <= ys[-1] + 1e-7:
                        chosenFaces.append(face)
                chosenEdges = {edge for face in chosenFaces for edge in face.edges}
                chosenVertices = {vertex for face in chosenFaces for vertex in face.verts}
                geometry = list(chosenVertices) + list(chosenEdges) + chosenFaces
            else:
                geometry = list(sbm.verts) + list(sbm.edges) + list(sbm.faces)
            bmesh.ops.bisect_plane(sbm, geom=geometry,
                                  dist=1e-7, plane_co=inverse @ worldPoint, plane_no=localNormal,
                                  clear_inner=False, clear_outer=False)
        def InsideFace(face):
            center = matrix @ face.calc_center_median()
            return xs[0] - 1e-7 <= center.x <= xs[-1] + 1e-7 and ys[0] - 1e-7 <= center.y <= ys[-1] + 1e-7

        hiddenStraw = [face for face in sbm.faces if InsideFace(face)
                       and (matrix @ face.calc_center_median()).z >= bottomZ - 1e-7]
        removedInnerStrawFaces = len(hiddenStraw)
        removedHiddenProtected = sum(sourceProtection.get(face[lineage], 0) for face in hiddenStraw)
        bmesh.ops.delete(sbm, geom=hiddenStraw, context='FACES_ONLY')
        # Reassemble fragments of each original triangle before final
        # triangulation. UVs and CORNER colours on an original triangle are
        # affine, so removing an internal coplanar edge changes no surface.
        sbm.normal_update()
        internalEdges = [edge for edge in sbm.edges if len(edge.link_faces) == 2
                         and edge.link_faces[0][lineage] > 0
                         and edge.link_faces[0][lineage] == edge.link_faces[1][lineage]
                         and edge.link_faces[0].normal.dot(edge.link_faces[1].normal) > 1 - 1e-6]
        if internalEdges:
            bmesh.ops.dissolve_edges(sbm, edges=internalEdges, use_verts=False, use_face_split=False)
        dissolvedCutVertices = 0
        # Keep every original vertex. Only redundant newly introduced straight
        # edge points may disappear, preserving all old outline positions.
        for _ in range(3):
            redundant = []
            for vertex in sbm.verts:
                if vertex in originalStrawVertexSet or len(vertex.link_edges) != 2:
                    continue
                a, b = [edge.other_vert(vertex).co - vertex.co for edge in vertex.link_edges]
                product = a.length * b.length
                if product > 1e-20 and a.dot(b) < 0 and a.cross(b).length <= product * 1e-6:
                    redundant.append(vertex)
            if not redundant:
                break
            dissolvedCutVertices += len(redundant)
            bmesh.ops.dissolve_verts(sbm, verts=redundant, use_face_split=False, use_boundary_tear=False)
        outsideMove = 0.
        # Every original vertex strictly outside the rectangle stays fixed.
        for vertex, old in zip(originalStrawVertices, original[straw]):
            if vertex.is_valid:
                worldOld = matrix @ Vector(old)
                outside = not (xs[0] - 1e-6 <= worldOld.x <= xs[-1] + 1e-6 and ys[0] - 1e-6 <= worldOld.y <= ys[-1] + 1e-6)
                if outside:
                    outsideMove = max(outsideMove, float((matrix.to_3x3() @ (vertex.co - Vector(old))).length))
        if outsideMove > 1e-7:
            raise ValueError('Visible outer Straw geometry moved')
        bmesh.ops.triangulate(sbm, faces=list(sbm.faces))
        restoredProtection = 0
        # Bisect/dissolve/triangulate must retain original source roles even if
        # an operator defaults an INT field on a newly allocated face. Lineage
        # identifies its unambiguous original triangle; never infer by area.
        if protectedLayer is not None:
            for face in sbm.faces:
                expected = sourceProtection.get(face[lineage])
                if expected is None:
                    raise ValueError('A Straw fragment lost its source protection lineage')
                if face[protectedLayer] != expected:
                    face[protectedLayer] = expected
                    restoredProtection += 1
        preBudgetValidation = []
        if validateBeforeBudget:
            for obj in objects:
                old = prepared[obj]
                replacement, report = ValidatePreparedContactBMesh(old, obj.name, obj.matrix_world)
                prepared[obj] = replacement
                old.free()
                preBudgetValidation.append(report)
            sbm = prepared[straw]
            lineage = sbm.faces.layers.int.get('ContactSourceFace')
            protectedLayer = sbm.faces.layers.int.get('StrawProtectedStructure')
            if lineage is None:
                raise ValueError('Pre-budget validation lost original Straw face lineage')
            for face in sbm.faces:
                expected = sourceProtection.get(face[lineage])
                if expected is None or (protectedLayer is not None and face[protectedLayer] != expected):
                    raise ValueError('Pre-budget validation changed Straw source protection')
        otherBefore = {name: bpy.data.objects.get(name) for name in ('Frame', 'Pillow', 'Sewing')}
        otherBeforeCounts = {name: TriangleCount(obj.data) for name, obj in otherBefore.items()
                             if obj is not None and obj.type == 'MESH'}
        maximumOldGrass = 16000
        if len(otherBeforeCounts) == 3:
            maximumOldGrass = ContactGrassBudget(otherBeforeCounts, BmTriangleCount(prepared[quilt]),
                                                 BmTriangleCount(prepared[foot]), len(bodyFaces), len(cottonFaces))
        grassPruning = PruneGrassIslands(sbm, matrix, min(16000, maximumOldGrass), maximumOldGrass)
        surviving = Counter()
        for face in sbm.faces:
            if face[lineage] <= 0:
                raise ValueError('Straw cut lost original-face lineage for budget audit')
            surviving[face[lineage]] += len(face.verts) - 2
        cutTriangles = sum(max(0, count - 1) for count in surviving.values())
        removedOriginalStrawTriangles = before[straw.name] - len(surviving)
        sbm.faces.layers.int.remove(lineage)

        def Append(obj, bm, points, triangles, tree, records):
            inv = obj.matrix_world.inverted()
            vertices = [bm.verts.new(inv @ Vector(point)) for point in points]
            uvLayer = bm.loops.layers.uv.get('UVMap')
            colorLayer = bm.loops.layers.float_color.get(_COLOUR)
            extras = [layer for layer in bm.loops.layers.uv.values() if layer != uvLayer]
            attributes = [AttributeAt(tree, records, point) for point in points]
            for indices in triangles:
                face = bm.faces.new([vertices[index] for index in indices])
                face.material_index, face.smooth = 0, True
                values = [attributes[index][0] for index in indices]
                first, second = values[1] - values[0], values[2] - values[0]
                if abs(float(first[0] * second[1] - first[1] * second[0])) < 1e-12:
                    triangle = np.asarray([points[index] for index in indices])
                    normal = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
                    dropAxis = int(np.argmax(np.abs(normal)))
                    axes = [axis for axis in range(3) if axis != dropAxis]
                    values = [np.asarray(points[index])[axes] / .19627 for index in indices]
                for loop, index, uv in zip(face.loops, indices, values):
                    loop[uvLayer].uv, loop[colorLayer] = tuple(uv), tuple(attributes[index][1])
                    for layer in extras:
                        loop[layer].uv = tuple(uv)

        Append(straw, sbm, supportPoints, bodyFaces, strawAttrTree, strawRecords)
        Append(quilt, prepared[quilt], cottonPoints, cottonFaces, cottonTree, cottonRecords)
        added = len(bodyFaces) + len(cottonFaces) + max(0, cutTriangles)
        # Prove every old Quilt/Foot vertex, including all shared visible ones,
        # is unchanged. Faces alone were culled, never their shared vertices.
        visibleMove = 0.
        for obj in (quilt, foot):
            current = list(prepared[obj].verts)
            if len(current) < len(original[obj]):
                raise ValueError('A preserved original cotton vertex was deleted')
            for vertex, old in zip(current[:len(original[obj])], original[obj]):
                visibleMove = max(visibleMove, float((obj.matrix_world.to_3x3() @ (vertex.co - Vector(old))).length))
        if visibleMove > 1e-7:
            raise ValueError('Original visible cloth or skirt vertices moved')
        after = {obj.name: BmTriangleCount(prepared[obj]) for obj in objects}
        others = {name: bpy.data.objects.get(name) for name in ('Frame', 'Pillow', 'Sewing')}
        otherCounts = {name: TriangleCount(obj.data) for name, obj in others.items() if obj is not None and obj.type == 'MESH'}
        total = sum(after.values()) + sum(otherCounts.values()) if len(otherCounts) == 3 else None
        budgetAudit = {'before': before, 'after': after, 'otherGameTriangles': otherCounts,
                       'predictedWholeBedTriangles': total, 'wholeBedLimit': 50000,
                       'removedHiddenCottonFaces': {obj.name: len(ids) for obj, ids in removed.items()},
                       'removedOriginalStrawTriangles': removedOriginalStrawTriangles,
                       'survivingOriginalStrawFragments': sum(surviving.values()),
                       'newStrawBodyTriangles': len(bodyFaces), 'newCottonTriangles': len(cottonFaces),
                       'remainingCutExtraTriangles': cutTriangles, 'grossAddedTriangles': added}
        if (total is not None and total > 50000) or (total is None and after[straw.name] > 15000):
            raise ValueError('Compact contact exceeds final game budget: ' + json.dumps(budgetAudit))
        # Commit only after all three independent BMeshes pass validation.
        for obj in objects:
            bm = prepared[obj]
            bm.normal_update()
            bm.to_mesh(obj.data)
            obj.data.update()
            obj.data.color_attributes.active_color = obj.data.color_attributes[_COLOUR]
            obj['CompactMatContactAdded'] = True
        stats = {'method': 'One compacted original Straw top and real Quilt underside share identical low-frequency triangle topology',
                 'targetGapM': _GAP, **profileStats, 'supportTriangles': len(faces),
                 'supportBodyTriangles': len(bodyFaces), 'supportBottomZM': bottomZ,
                 'cottonBearingTriangles': len(faces), 'cottonHemTriangles': len(cottonFaces) - len(faces),
                 'cutStrawExtraTriangles': cutTriangles, 'grossAddedContactTriangles': added,
                 'estimatedAddedContactGoal': _MAX_ADDED, 'withinEstimatedAddedGoal': added <= _MAX_ADDED,
                 'coplanarCutEdgesDissolved': len(internalEdges), 'collinearNewCutVerticesDissolved': dissolvedCutVertices,
                 'beforeTriangles': before, 'afterTriangles': after, 'budgetAudit': budgetAudit,
                 'removedHiddenFaces': {obj.name: len(ids) for obj, ids in removed.items()},
                 'originalCottonAndSkirtMaximumVertexDisplacementM': visibleMove,
                 'outerStrawMaximumVertexDisplacementM': outsideMove,
                 'removedInnerStrawFaceFragments': removedInnerStrawFaces,
                 'removedHiddenProtectedStrawFaceFragments': removedHiddenProtected,
                 'protectedTagFragmentsRestoredFromLineage': restoredProtection,
                 'removedOriginalStrawTriangles': removedOriginalStrawTriangles,
                 'retainedOriginalStrawTriangleFragments': sum(surviving.values()),
                 'grassIslandReduction': grassPruning,
                 'preBudgetMeshValidationEnabled': bool(validateBeforeBudget),
                 'preBudgetMeshValidation': preBudgetValidation,
                 'sameTrianglePairing': True, 'newMaterials': 0, 'newObjects': 0, 'newMeshDatablocks': 0,
                 'footBaseForNewCottonColour': footAudit,
                 'limitation': 'The paired cap gap is exact; retained old faces and outer fibres still require the independent unchanged contact and visual checks.'}
    finally:
        for bm in prepared.values():
            if bm.is_valid:
                bm.free()
    return stats
