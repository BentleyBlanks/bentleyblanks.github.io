"""Fit the existing quilt underside to the existing straw support.

Blender construction coordinates are world metres: X long, Z up. Fit changes
positions only. Optional game refinement tessellates existing lower faces with
BMesh interpolation of existing UV/CORNER colours; it creates no new object or
mesh datablock. Call before pivot translation, then orient shell faces outwards.
"""
import heapq
import json
import math
import time


_GRID_STEP = .01
_STRAW_RANGE = (.56, .74)
_CONTACT_GAP = .0005
_FADE_DISTANCE = .015
_MIN_SHELL_THICKNESS = .003


def _SmoothStep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def _FitDisplacement(lower, upper, strawTop, height, fade=1.0, signed=False):
    thickness = upper - lower
    if thickness <= _MIN_SHELL_THICKNESS:
        return 0.0
    distance = lower - strawTop - _CONTACT_GAP
    if not signed:
        distance = max(0.0, distance)
    blend = _SmoothStep((upper - height) / thickness)
    return distance * blend * blend * max(0.0, min(1.0, fade))


def _GridCoordinates(low, high, step):
    count = max(1, math.ceil((high - low) / step))
    return [low + (high - low) * index / count for index in range(count + 1)]


def _DistanceToInvalid(mask, nx, ny, stepX, stepY):
    """Physical distance inside the supported mask, with eight-neighbour paths."""
    distance = [math.inf] * len(mask)
    queue = []
    for index, valid in enumerate(mask):
        if not valid:
            distance[index] = 0.0
            queue.append((0.0, index))
    if not queue:
        # The sampling rectangle normally includes an unsupported outer margin.
        # Still define a conservative boundary if a caller supplies a full mask.
        for iy in range(ny):
            for ix in range(nx):
                if ix in (0, nx - 1) or iy in (0, ny - 1):
                    index = iy * nx + ix
                    distance[index] = 0.0
                    queue.append((0.0, index))
    heapq.heapify(queue)
    directions = [(dx, dy, math.hypot(dx * stepX, dy * stepY))
                  for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy]
    while queue:
        old, index = heapq.heappop(queue)
        if old != distance[index]:
            continue
        ix, iy = index % nx, index // nx
        for dx, dy, cost in directions:
            jx, jy = ix + dx, iy + dy
            if 0 <= jx < nx and 0 <= jy < ny:
                other = jy * nx + jx
                candidate = old + cost
                if candidate < distance[other]:
                    distance[other] = candidate
                    heapq.heappush(queue, (candidate, other))
    return distance


def _WorldBvh(objects, depsgraph):
    from mathutils.bvhtree import BVHTree
    vertices, triangles = [], []
    low = [math.inf, math.inf, math.inf]
    high = [-math.inf, -math.inf, -math.inf]
    for obj in objects:
        if obj.type != 'MESH':
            raise TypeError(f'{obj.name} is not a mesh')
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            mesh.calc_loop_triangles()
            matrix, offset = evaluated.matrix_world, len(vertices)
            for vertex in mesh.vertices:
                point = matrix @ vertex.co
                if not all(math.isfinite(value) for value in point):
                    raise ValueError(f'Non-finite geometry in {obj.name}')
                vertices.append(point)
                for axis in range(3):
                    low[axis] = min(low[axis], point[axis])
                    high[axis] = max(high[axis], point[axis])
            triangles.extend(tuple(offset + index for index in triangle.vertices)
                             for triangle in mesh.loop_triangles)
        finally:
            evaluated.to_mesh_clear()
    if not triangles:
        raise ValueError('No triangles in supplied shell/support')
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True,
                               epsilon=1e-6), low, high, len(triangles)


class _Envelope:
    def __init__(self, quiltBvh, strawBvh, quiltLow, quiltHigh):
        from mathutils import Vector
        self.quilt = quiltBvh
        self.straw = strawBvh
        self.up = Vector((0, 0, 1))
        self.down = Vector((0, 0, -1))
        # Real quilt peaks exceed .74 m. The .56..74 bearing range constrains straw;
        # the shell uses its full geometry so its actual top remains fixed.
        self.rayLow = min(.3, quiltLow[2] - .01)
        self.rayHigh = max(.9, quiltHigh[2] + .01)
        self.cache = {}
        self.strawCache = {}
        self.jitterCache = {}
        self.jitterQueries = 0
        self.jitterExamples = []
        self.exactQueries = 0

    def StrawTop(self, x, y):
        from mathutils import Vector
        key = (round(float(x), 7), round(float(y), 7))
        if key not in self.strawCache:
            point = self.straw.ray_cast(Vector((x, y, _STRAW_RANGE[1])), self.down,
                                       _STRAW_RANGE[1] - _STRAW_RANGE[0])[0]
            self.strawCache[key] = float(point.z) if point is not None else None
        return self.strawCache[key]

    def _RawAt(self, x, y):
        from mathutils import Vector
        lower = self.quilt.ray_cast(Vector((x, y, self.rayLow)), self.up,
                                   self.rayHigh - self.rayLow)[0]
        upper = self.quilt.ray_cast(Vector((x, y, self.rayHigh)), self.down,
                                   self.rayHigh - self.rayLow)[0]
        support = self.StrawTop(x, y)
        # Envelope thickness, not the -.08 normal test, identifies the
        # underside. A steep real lower face such as normalZ=-.068 is valid.
        if lower is None or upper is None or support is None or upper.z - lower.z <= _MIN_SHELL_THICKNESS:
            return None
        return (float(lower.z), float(upper.z), support)

    def At(self, x, y, allowJitter=False):
        key = (round(float(x), 7), round(float(y), 7))
        if key not in self.cache:
            self.cache[key] = self._RawAt(x, y)
            self.exactQueries += 1
        sample = self.cache[key]
        if sample is not None or not allowJitter:
            return sample
        if key not in self.jitterCache:
            # Only a failed exact vertex query gets a 2 micrometre retry. This
            # resolves float32 edge/vertex ray misses without a millimetre-scale
            # projection or changing any independent contact-test threshold.
            candidates = []
            for dx, dy in ((-.000002, 0), (.000002, 0),
                           (0, -.000002), (0, .000002)):
                nearby = self._RawAt(x + dx, y + dy)
                self.jitterQueries += 1
                if nearby is not None:
                    candidates.append((dx * dx + dy * dy, nearby[0], dx, dy, nearby))
            candidates.sort()
            result = candidates[0][-1] if candidates else None
            self.jitterCache[key] = result
            if result is not None and len(self.jitterExamples) < 16:
                self.jitterExamples.append({'x': float(x), 'y': float(y),
                                            'offsetX': candidates[0][2],
                                            'offsetY': candidates[0][3]})
        return self.jitterCache[key]


def _SampleGrid(envelope, quiltLow, quiltHigh, strawLow, strawHigh):
    import numpy as np
    xLow, xHigh = max(quiltLow[0], strawLow[0]), min(quiltHigh[0], strawHigh[0])
    yLow, yHigh = max(quiltLow[1], strawLow[1]), min(quiltHigh[1], strawHigh[1])
    if xLow >= xHigh or yLow >= yHigh:
        raise ValueError('Quilt and straw have no overlapping XY footprint')
    xs = _GridCoordinates(xLow - 2 * _GRID_STEP, xHigh + 2 * _GRID_STEP, _GRID_STEP)
    ys = _GridCoordinates(yLow - 2 * _GRID_STEP, yHigh + 2 * _GRID_STEP, _GRID_STEP)
    samples = [envelope.At(x, y) for y in ys for x in xs]
    valid = [sample is not None for sample in samples]
    # The footprint belongs to the real Straw, independently of whether a
    # coarse Quilt grid ray found a complete L/U pair. Quilt holes must not
    # create artificial "unsupported" fade islands inside the mattress.
    bearing = [envelope.StrawTop(x, y) is not None for y in ys for x in xs]
    if not any(valid):
        raise ValueError('No supported quilt lower/upper pairs in the actual geometry')
    distance = _DistanceToInvalid(bearing, len(xs), len(ys), xs[1] - xs[0], ys[1] - ys[0])
    halfCell = .5 * min(xs[1] - xs[0], ys[1] - ys[0])
    fade = [_SmoothStep(max(0.0, value - halfCell) / _FADE_DISTANCE) if support else 0.0
            for value, support in zip(distance, bearing)]
    values = np.array([sample if sample is not None else (0, 0, 0) for sample in samples], dtype=np.float64)
    return {'xs': xs, 'ys': ys, 'values': values, 'valid': np.array(valid, dtype=np.float64),
            'bearingMask': np.array(bearing, dtype=np.float64),
            'fade': np.array(fade, dtype=np.float64), 'supportedSamples': sum(valid),
            'bearingSamples': sum(bearing),
            'sampleCount': len(samples)}


def _InterpolateGrid(grid, points):
    import numpy as np
    xs, ys = grid['xs'], grid['ys']
    nx, ny = len(xs), len(ys)
    fx = (points[:, 0] - xs[0]) / (xs[-1] - xs[0]) * (nx - 1)
    fy = (points[:, 1] - ys[0]) / (ys[-1] - ys[0]) * (ny - 1)
    inside = (fx >= 0) & (fx <= nx - 1) & (fy >= 0) & (fy <= ny - 1)
    ix = np.clip(np.floor(fx).astype(np.int64), 0, nx - 2)
    iy = np.clip(np.floor(fy).astype(np.int64), 0, ny - 2)
    tx, ty = np.clip(fx - ix, 0, 1), np.clip(fy - iy, 0, 1)
    base = iy * nx + ix
    values = np.zeros((len(points), 3), dtype=np.float64)
    total = np.zeros(len(points), dtype=np.float64)
    fade = np.zeros(len(points), dtype=np.float64)
    for indices, weight in ((base, (1 - tx) * (1 - ty)),
                            (base + 1, tx * (1 - ty)),
                            (base + nx, (1 - tx) * ty),
                            (base + nx + 1, tx * ty)):
        supportedWeight = weight * grid['valid'][indices]
        values += grid['values'][indices] * supportedWeight[:, None]
        total += supportedWeight
        fade += grid['fade'][indices] * weight
    supported = inside & (total > 1e-8)
    values[supported] /= total[supported, None]
    # A missing interpolated Quilt pair must not erase the independent Straw
    # footprint; game mode will still make an exact query at this actual vertex.
    fade[~inside] = 0
    return values, supported, fade


def _ExactGameField(envelope, points, values, supported, fade):
    import numpy as np
    for index in np.flatnonzero(fade > 0):
        sample = envelope.At(float(points[index, 0]), float(points[index, 1]),
                             allowJitter=True)
        if sample is None:
            supported[index] = False
            fade[index] = 0
        else:
            supported[index] = True
            values[index] = sample
    return values, supported, fade


def _GridFadeAt(grid, x, y):
    """Scalar form of the exact same continuous support-boundary fade."""
    xs, ys = grid['xs'], grid['ys']
    nx, ny = len(xs), len(ys)
    fx = (x - xs[0]) / (xs[-1] - xs[0]) * (nx - 1)
    fy = (y - ys[0]) / (ys[-1] - ys[0]) * (ny - 1)
    if not (0 <= fx <= nx - 1 and 0 <= fy <= ny - 1):
        return 0.0
    ix, iy = min(nx - 2, int(math.floor(fx))), min(ny - 2, int(math.floor(fy)))
    tx, ty = fx - ix, fy - iy
    base = iy * nx + ix
    return float(grid['fade'][base] * (1 - tx) * (1 - ty)
                 + grid['fade'][base + 1] * tx * (1 - ty)
                 + grid['fade'][base + nx] * (1 - tx) * ty
                 + grid['fade'][base + nx + 1] * tx * ty)


def FitQuiltUnderside(quiltObjects, strawObjects, affectedObjects=None, mode='high'):
    """Lower the original underside continuously onto original straw; return stats.

    high: 10 mm bilinear L/U/S field with exact no-support checks near its edge.
    game: exact original lower/upper/straw BVH rays at every affected vertex XY.
    Both use a 15 mm continuous transition at the support footprint boundary.
    The displacement is d * SmoothStep((U-z)/(U-L))**2. High clamps d>=0;
    game uses signed d=L-S-.0005 so an already-low underside can rise to straw.
    Only world Z changes; the highest original upper envelope has zero movement.
    """
    import bpy
    import numpy as np
    if mode not in ('high', 'game'):
        raise ValueError("mode must be 'high' or 'game'")
    quiltObjects, strawObjects = list(quiltObjects), list(strawObjects)
    affectedObjects = list(quiltObjects if affectedObjects is None else affectedObjects)
    # Deduplicate object identities without changing caller order.
    affectedObjects = list({obj.as_pointer(): obj for obj in affectedObjects}.values())
    if not quiltObjects or not strawObjects or not affectedObjects:
        raise ValueError('Real quilt, original straw and affected objects are required')
    if any(obj.type != 'MESH' for obj in affectedObjects):
        raise TypeError('Every affected object must be an existing mesh')
    for obj in affectedObjects:
        # Do not silently deform a hidden archive copy or another instance via a
        # shared mesh datablock, and do not create a replacement mesh here.
        if obj.data.users > 1:
            users = [other for other in bpy.data.objects if other.type == 'MESH' and other.data == obj.data]
            if len(users) > 1:
                raise ValueError(f'{obj.name} has shared geometry; caller must select a single-user working mesh before fitting')
    started = time.perf_counter()
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    quiltBvh, quiltLow, quiltHigh, quiltTriangles = _WorldBvh(quiltObjects, depsgraph)
    strawBvh, strawLow, strawHigh, strawTriangles = _WorldBvh(strawObjects, depsgraph)
    envelope = _Envelope(quiltBvh, strawBvh, quiltLow, quiltHigh)
    grid = _SampleGrid(envelope, quiltLow, quiltHigh, strawLow, strawHigh)
    rows = []
    prepared = []
    for obj in affectedObjects:
        count = len(obj.data.vertices)
        original = np.empty(count * 3, dtype=np.float64)
        obj.data.vertices.foreach_get('co', original)
        original = original.reshape(-1, 3)
        matrix = np.array(obj.matrix_world, dtype=np.float64)
        world = original @ matrix[:3, :3].T + matrix[:3, 3]
        if not np.isfinite(world).all():
            raise ValueError(f'Non-finite affected vertices in {obj.name}')
        values, supported, fade = _InterpolateGrid(grid, world)
        if mode == 'game':
            # All geometry queries use the immutable pre-fit BVHs, including the
            # sewing after the quilt itself has been prepared for displacement.
            values, supported, fade = _ExactGameField(envelope, world, values, supported, fade)
        else:
            # No-hit overhangs must remain still even in a partly covered grid
            # cell. The interior uses the continuous field without noisy per-
            # vertex grass-fibre rays, while the footprint edge gets real tests.
            for index in np.flatnonzero(supported & (fade > 0) & (fade < .999999)):
                if envelope.StrawTop(float(world[index, 0]), float(world[index, 1])) is None:
                    supported[index] = False
                    fade[index] = 0
        lower, upper, straw = values.T
        thickness = upper - lower
        valid = supported & (thickness > _MIN_SHELL_THICKNESS)
        ratio = np.zeros(count, dtype=np.float64)
        ratio[valid] = np.clip((upper[valid] - world[valid, 2]) / thickness[valid], 0, 1)
        weight = ratio * ratio * (3 - 2 * ratio)
        distance = lower - straw - _CONTACT_GAP
        if mode == 'high':
            distance = np.maximum(0, distance)
        movement = np.where(valid, distance * weight * weight * fade, 0)
        if not np.isfinite(movement).all() or (mode == 'high' and np.any(movement < 0)):
            raise ValueError('Invalid underside displacement')
        upperBand = valid & (np.abs(world[:, 2] - upper) <= np.minimum(.0015, np.maximum(thickness, 0) * .05))
        maxUpper = float(np.abs(movement[upperBand]).max()) if np.any(upperBand) else 0.0
        if maxUpper > .0001:
            raise ValueError(f'{obj.name} upper-shell movement {maxUpper:.6f} m exceeds 0.1 mm protection')
        moved = world.copy()
        moved[:, 2] -= movement
        inverse = np.linalg.inv(matrix)
        local = moved @ inverse[:3, :3].T + inverse[:3, 3]
        if not np.isfinite(local).all():
            raise ValueError('Invalid fitted local coordinates')
        row = {'object': obj.name, 'vertices': count,
               'movedVertices': int(np.count_nonzero(np.abs(movement) > 1e-8)),
               'downwardVertices': int(np.count_nonzero(movement > 1e-8)),
               'upwardVertices': int(np.count_nonzero(movement < -1e-8)),
               'supportedVertices': int(np.count_nonzero(valid)),
               'unsupportedOrUnprovenVertices': int(np.count_nonzero(~valid)),
               'maxDisplacementM': float(np.abs(movement).max()) if count else 0.0,
               'maxDownwardDisplacementM': max(0.0, float(movement.max())) if count else 0.0,
               'maxUpwardDisplacementM': max(0.0, float(-movement.min())) if count else 0.0,
               'upperEnvelopeVerticesChecked': int(np.count_nonzero(upperBand)),
               'maxUpperShellDisplacementM': maxUpper,
               'worldXyUnchanged': True, 'uvColourAndTopologyUnchanged': True}
        prepared.append((obj, local, row))
        rows.append(row)
    # Commit positions only after every object passes validation. A failure
    # above leaves all supplied source meshes unchanged.
    for obj, local, row in prepared:
        obj.data.vertices.foreach_set('co', np.ascontiguousarray(local).ravel())
        obj.data.update()
        obj['QuiltUndersideFitStats'] = json.dumps(row, separators=(',', ':'))
    stats = {'method': 'Original quilt lower shell fitted to original straw; no added support geometry',
             'mode': mode, 'gridStepM': _GRID_STEP,
             'grid': [len(grid['xs']), len(grid['ys'])],
             'gridSamples': grid['sampleCount'], 'supportedGridSamples': grid['supportedSamples'],
             'bearingGridSamples': grid['bearingSamples'],
             'fadeMask': 'Actual Straw bearing hits only; independent of Quilt L/U pairing',
             'supportHeightRange': _STRAW_RANGE, 'targetLowerGapM': _CONTACT_GAP,
             'unsupportedBoundaryFadeM': _FADE_DISTANCE,
             'quiltInputTriangles': quiltTriangles, 'strawInputTriangles': strawTriangles,
             'exactEnvelopeQueries': envelope.exactQueries,
             'uniqueStrawQueries': len(envelope.strawCache),
             'vertexRayJitter': {'maximumOffsetM': .000002,
                                'retryQueries': envelope.jitterQueries,
                                'recoveredVerticesXy': sum(sample is not None for sample in envelope.jitterCache.values()),
                                'examples': envelope.jitterExamples},
             'affectedVertices': sum(row['vertices'] for row in rows),
             'movedVertices': sum(row['movedVertices'] for row in rows),
             'upwardVertices': sum(row['upwardVertices'] for row in rows),
             'downwardVertices': sum(row['downwardVertices'] for row in rows),
             'maxDisplacementM': max(row['maxDisplacementM'] for row in rows),
             'maxUpperShellDisplacementM': max(row['maxUpperShellDisplacementM'] for row in rows),
             'upperClassification': 'Original vertex within min(1.5mm,5% shell thickness) of local original upper envelope; grid in high, exact rays in game',
             'addedObjects': 0, 'addedMeshes': 0, 'addedOrRemovedFaces': 0,
             'objects': rows, 'seconds': time.perf_counter() - started}
    return stats
