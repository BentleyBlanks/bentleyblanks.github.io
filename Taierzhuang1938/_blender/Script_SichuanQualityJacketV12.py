"""Refine the real folded civilian jacket in an independent QualityV12 file.

No reduction, Catmull-Clark, scene operator, save or export runs here. The
original mesh is retained with a fake user. New body samples use simple 3D
edge subdivision and interpolation of every original UV layer. The approved
exposed corner and the separate, actual figure-eight button remain intact.
"""
import array
import collections
import hashlib
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


generator = 'SichuanQualityJacketV12'
keyName = 'QualityJacketSoftFoldsV12'
modifierName = 'QualityJacketCottonThicknessV12'


def Digest(mesh):
    result = hashlib.sha256()
    positions = array.array('f', [0.0]) * (len(mesh.vertices) * 3)
    mesh.vertices.foreach_get('co', positions)
    result.update(positions.tobytes())
    for polygon in mesh.polygons:
        result.update(array.array('i', [len(polygon.vertices), *polygon.vertices]).tobytes())
    for layer in mesh.uv_layers:
        result.update(layer.name.encode('utf-8'))
        values = array.array('f', [0.0]) * (len(layer.data) * 2)
        layer.data.foreach_get('uv', values)
        result.update(values.tobytes())
    return result.hexdigest()


def Counts(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        mesh.calc_loop_triangles()
        return {'vertices': len(mesh.vertices), 'polygons': len(mesh.polygons),
                'triangles': len(mesh.loop_triangles)}
    finally:
        evaluated.to_mesh_clear()


def CornerFace(ids, coordinates, points):
    for index, uv in zip(ids, coordinates):
        point = points[index]
        expected = .02 + .46 * (.90 + (point.z - .144) / .56)
        if not (.785 < uv[0] < .820 and abs(uv[1] - expected) < .010
                and point.x > .103 and point.z > .071):
            return False
    return True


def EdgeOwners(records, role):
    owners = collections.defaultdict(list)
    for index, record in enumerate(records):
        if record['role'] != role:
            continue
        a, b, c = record['ids']
        for first, second in ((a, b), (b, c), (c, a)):
            owners[tuple(sorted((first, second)))].append((index, first, second))
    return owners


def Child(record, ids, coordinates):
    return {'ids': tuple(ids), 'uv': tuple(tuple(layer[index] for index in coordinates) for layer in record['uv']),
            'material': record['material'], 'smooth': record['smooth'], 'role': record['role']}


def SimpleRefine(points, records, targetEdgeM):
    """Split shared long edges, with no relaxation or shrinkage of the source."""
    passes = 0
    while True:
        marked = {edge for edge in EdgeOwners(records, 'body')
                  if (points[edge[0]] - points[edge[1]]).length > targetEdgeM}
        if not marked:
            break
        midpoints = {}
        for edge in sorted(marked):
            midpoints[edge] = len(points)
            points.append((points[edge[0]] + points[edge[1]]) * .5)
        refined = []
        for record in records:
            if record['role'] != 'body':
                refined.append(record)
                continue
            ids = list(record['ids'])
            flags = [tuple(sorted((ids[index], ids[(index + 1) % 3]))) in marked for index in range(3)]
            count = sum(flags)
            if not count:
                refined.append(record)
                continue
            rotation = flags.index(True) if count == 1 else (flags.index(False) + 1) % 3 if count == 2 else 0
            ids = ids[rotation:] + ids[:rotation]
            uv = [list(layer[rotation:]) + list(layer[:rotation]) for layer in record['uv']]
            a, b, c = ids
            ab = midpoints.get(tuple(sorted((a, b))))
            bc = midpoints.get(tuple(sorted((b, c))))
            ca = midpoints.get(tuple(sorted((c, a))))
            for layer in uv:
                layer.extend((tuple((layer[0][axis] + layer[1][axis]) * .5 for axis in (0, 1)),
                              tuple((layer[1][axis] + layer[2][axis]) * .5 for axis in (0, 1)),
                              tuple((layer[2][axis] + layer[0][axis]) * .5 for axis in (0, 1))))
            template = dict(record, uv=tuple(tuple(layer) for layer in uv))
            if count == 1:
                specs = (((a, ab, c), (0, 3, 2)), ((ab, b, c), (3, 1, 2)))
            elif count == 2:
                specs = (((ab, b, bc), (3, 1, 4)), ((a, ab, c), (0, 3, 2)), ((ab, bc, c), (3, 4, 2)))
            else:
                specs = (((a, ab, ca), (0, 3, 5)), ((ab, b, bc), (3, 1, 4)),
                         ((ca, bc, c), (5, 4, 2)), ((ab, bc, ca), (3, 4, 5)))
            refined.extend(Child(template, child, coordinates) for child, coordinates in specs)
        records = refined
        passes += 1
        if passes > 20:
            raise RuntimeError('Actual jacket edge sampling failed to converge')
    return records, passes


def UvArea(records, layerIndex, role):
    area = 0.0
    for record in records:
        if record['role'] != role:
            continue
        a, b, c = record['uv'][layerIndex]
        area += abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) * .5
    return area


def CornerDigest(points, records):
    result = hashlib.sha256()
    for record in records:
        if record['role'] == 'corner':
            for index in record['ids']:
                result.update(array.array('f', points[index]).tobytes())
            for layer in record['uv']:
                result.update(array.array('f', [value for uv in layer for value in uv]).tobytes())
    return result.hexdigest()


def SmoothStep(low, high, values):
    t = np.clip((values - low) / (high - low), 0, 1)
    return t * t * (3 - 2 * t)


def SoftFoldPositions(points, records, creaseSegments):
    original = np.asarray([tuple(point) for point in points], dtype=np.float64)
    output = original.copy()
    body = sorted({index for record in records if record['role'] == 'body' for index in record['ids']})
    corner = {index for record in records if record['role'] == 'corner' for index in record['ids']}
    owners = EdgeOwners(records, 'body')
    boundary = {index for edge, faces in owners.items() if len(faces) == 1 for index in edge}
    near = np.full(len(points), np.inf)
    for a, b in creaseSegments:
        start, end = np.asarray(tuple(a)), np.asarray(tuple(b))
        delta = end - start
        parameter = np.clip(((original - start) @ delta) / max(float(delta @ delta), 1e-20), 0, 1)
        distance = np.linalg.norm(original - start - parameter[:, None] * delta, axis=1)
        near = np.minimum(near, distance)
    weight = (1 - SmoothStep(.002, .008, near)) * .38
    allowed = np.zeros(len(points), dtype=bool)
    allowed[body] = True
    allowed[list(boundary | corner)] = False
    weight[~allowed] = 0
    edges = np.asarray(list(owners), dtype=np.int32)
    degrees = np.zeros(len(points), dtype=np.float64)
    np.add.at(degrees, edges[:, 0], 1)
    np.add.at(degrees, edges[:, 1], 1)
    for iteration in range(18):
        total = np.zeros_like(output)
        np.add.at(total, edges[:, 0], output[edges[:, 1]])
        np.add.at(total, edges[:, 1], output[edges[:, 0]])
        average = np.divide(total, degrees[:, None], out=output.copy(), where=degrees[:, None] > 0)
        candidate = output + (average - output) * weight[:, None]
        shift = candidate - original
        length = np.linalg.norm(shift, axis=1)
        shift *= np.minimum(1, .003 / np.maximum(length, 1e-20))[:, None]
        output = original + shift
    rounding = np.linalg.norm(output - original, axis=1)
    x, z = original[:, 0], original[:, 2]
    # All folded layers receive the same broad field in X/Z, preserving the
    # source's layer separation instead of pushing adjacent layers together.
    relief = np.zeros(len(points), dtype=np.float64)
    paths = (((-.110, .087), (-.050, .061), (.024, .071), .0026, .015),
             ((-.078, -.077), (-.010, -.091), (.080, -.060), .0020, .019),
             ((.031, .112), (.080, .085), (.130, .093), .0024, .013))
    xz = original[:, (0, 2)]
    for a, b, c, amplitude, width in paths:
        a, b, c = np.asarray(a), np.asarray(b), np.asarray(c)
        nearest = np.full(len(points), np.inf)
        across = np.zeros(len(points))
        along = np.zeros(len(points))
        for t in np.linspace(0, 1, 43):
            center = (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c
            tangent = 2 * (1 - t) * (b - a) + 2 * t * (c - b)
            tangent /= max(float(np.linalg.norm(tangent)), 1e-20)
            delta = xz - center
            squared = np.sum(delta * delta, axis=1)
            replace = squared < nearest
            nearest[replace] = squared[replace]
            across[replace] = delta[replace] @ np.asarray((-tangent[1], tangent[0]))
            along[replace] = t
        relief += amplitude * np.sin(math.pi * along) ** 1.4 * np.exp(-(across / width) ** 2)
    bodyBounds = original[body]
    edgeDistance = np.minimum.reduce((x - bodyBounds[:, 0].min(), bodyBounds[:, 0].max() - x,
                                     z - bodyBounds[:, 2].min(), bodyBounds[:, 2].max() - z))
    relief *= SmoothStep(.003, .018, edgeDistance)
    relief[~np.isin(np.arange(len(points)), body)] = 0
    relief[list(corner)] = 0
    output[:, 1] -= relief
    shift = output - original
    magnitude = np.linalg.norm(shift, axis=1)
    shift *= np.minimum(1, .004 / np.maximum(magnitude, 1e-20))[:, None]
    output = original + shift
    output[list(corner)] = original[list(corner)]
    return [Vector(point) for point in output], {
        'method': 'Simple source samples; localized crease-only fairing plus three broad tapered fold fields',
        'originalCreaseSegments': len(creaseSegments), 'roundingBandM': [.002, .008],
        'localRoundingIterations': 18, 'maximumLocalRoundingDisplacementM': float(rounding.max(initial=0)),
        'broadFoldPaths': len(paths), 'maximumBroadFoldOutwardM': float(relief.max(initial=0)),
        'maximumCombinedDisplacementM': float(np.linalg.norm(output - original, axis=1).max(initial=0)),
        'combinedDisplacementHardLimitM': .004, 'affectedVertices': int(np.count_nonzero(np.linalg.norm(output - original, axis=1) > 1e-7)),
        'sourceBoundaryVerticesPinnedDuringRounding': len(boundary),
        'cornerVerticesPinned': len(corner), 'globalCatmullClarkUsed': False}


def BoundaryPath(seed, owners, points, targetLength=.018):
    neighbors = collections.defaultdict(set)
    for edge, faces in owners.items():
        if len(faces) == 1:
            a, b = edge
            neighbors[a].add(b)
            neighbors[b].add(a)
    path = list(seed)
    length = (points[path[1]] - points[path[0]]).length
    turn = 0
    while length < targetLength:
        options = []
        for end in (0, 1):
            tip, previous = (path[0], path[1]) if end == 0 else (path[-1], path[-2])
            direction = (points[tip] - points[previous]).normalized()
            for other in neighbors[tip] - set(path):
                delta = points[other] - points[tip]
                if delta.length > 1e-10:
                    options.append((direction.dot(delta.normalized()), end, other, delta.length))
        if not options:
            break
        preferred = [option for option in options if option[1] == turn % 2]
        score, end, other, distance = max(preferred or options)
        if end == 0:
            path.insert(0, other)
        else:
            path.append(other)
        length += distance
        turn += 1
    if len(path) < 2 or length < .002:
        raise RuntimeError('Cannot locate a real jacket boundary for the hidden cloth connection')
    return path, length


def PathFractions(path, points):
    lengths = [0.0]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1] + (points[b] - points[a]).length)
    return [length / lengths[-1] for length in lengths]


def PathSample(path, fractions, points, fraction):
    for index in range(len(path) - 1):
        if fraction <= fractions[index + 1] + 1e-12:
            amount = (fraction - fractions[index]) / max(fractions[index + 1] - fractions[index], 1e-20)
            return points[path[index]].lerp(points[path[index + 1]], amount)
    return points[path[-1]].copy()


def ConnectHiddenCorner(points, deformed, records):
    bodyOwners, cornerOwners = EdgeOwners(records, 'body'), EdgeOwners(records, 'corner')
    bodyEdges = [edge for edge, faces in bodyOwners.items() if len(faces) == 1]
    cornerEdges = [edge for edge, faces in cornerOwners.items() if len(faces) == 1]
    if not bodyEdges or not cornerEdges:
        raise RuntimeError('The actual jacket/corner lacks open cloth edges to reconnect')
    # Limit the corner attachment to its folded upper/left return, hidden by
    # the blanket tuck. The opposite exposed tip is never selected or moved.
    selected = [edge for edge in cornerEdges
                if sum(points[index].x for index in edge) * .5 < .156
                and sum(points[index].z for index in edge) * .5 > .112]
    if not selected:
        raise RuntimeError('The approved corner does not retain its actual hidden return edge')
    bodyCenters = np.asarray([tuple((points[a] + points[b]) * .5) for a, b in bodyEdges])
    best = None
    for edge in selected:
        center = np.asarray(tuple((points[edge[0]] + points[edge[1]]) * .5))
        index = int(np.argmin(np.sum((bodyCenters - center) ** 2, axis=1)))
        distance = float(np.linalg.norm(bodyCenters[index] - center))
        if best is None or distance < best[0]:
            best = (distance, bodyEdges[index], edge)
    distance, bodySeed, cornerSeed = best
    if distance > .08:
        raise RuntimeError('A hidden real-cloth connection would span more than eight centimetres')
    bodyPath, bodyLength = BoundaryPath(bodySeed, bodyOwners, points)
    cornerPath, cornerLength = BoundaryPath(cornerSeed, cornerOwners, points)
    straight = (points[bodyPath[0]] - points[cornerPath[0]]).length + (points[bodyPath[-1]] - points[cornerPath[-1]]).length
    crossed = (points[bodyPath[0]] - points[cornerPath[-1]]).length + (points[bodyPath[-1]] - points[cornerPath[0]]).length
    if crossed < straight:
        cornerPath.reverse()
    bodyT, cornerT = PathFractions(bodyPath, points), PathFractions(cornerPath, points)

    def BoundaryUvs(path, owners):
        values = []
        for number, vertex in enumerate(path):
            edge = tuple(sorted((vertex, path[number + 1] if number + 1 < len(path) else path[number - 1])))
            record = records[owners[edge][0][0]]
            local = record['ids'].index(vertex)
            values.append(tuple(layer[local] for layer in record['uv']))
        return values

    bodyUvs, cornerUvs = BoundaryUvs(bodyPath, bodyOwners), BoundaryUvs(cornerPath, cornerOwners)

    def UvSample(values, fractions, fraction):
        for index in range(len(values) - 1):
            if fraction <= fractions[index + 1] + 1e-12:
                amount = (fraction - fractions[index]) / max(fractions[index + 1] - fractions[index], 1e-20)
                return tuple(tuple(values[index][layer][axis] * (1 - amount) + values[index + 1][layer][axis] * amount
                                   for axis in (0, 1)) for layer in range(len(values[index])))
        return values[-1]

    layers = len(records[0]['uv'])
    rows, parameters, rowUvs = [bodyPath], [bodyT], [bodyUvs]
    columns, steps = max(len(bodyPath), len(cornerPath), 7), 14
    for row in range(1, steps):
        along = row / steps
        ids, uvRow = [], []
        for column in range(columns):
            across = column / (columns - 1)
            a = PathSample(bodyPath, bodyT, points, across)
            b = PathSample(cornerPath, cornerT, points, across)
            da = PathSample(bodyPath, bodyT, deformed, across)
            db = PathSample(cornerPath, cornerT, deformed, across)
            inward = Vector((0, .004 * math.sin(math.pi * along), -.0015 * math.sin(math.pi * along)))
            ids.append(len(points))
            points.append(a.lerp(b, along) + inward)
            deformed.append(da.lerp(db, along) + inward)
            uva, uvb = UvSample(bodyUvs, bodyT, across), UvSample(cornerUvs, cornerT, across)
            uvRow.append(tuple(tuple(uva[layer][axis] * (1 - along) + uvb[layer][axis] * along
                                     for axis in (0, 1)) for layer in range(layers)))
        rows.append(ids)
        parameters.append([column / (columns - 1) for column in range(columns)])
        rowUvs.append(uvRow)
    rows.append(cornerPath)
    parameters.append(cornerT)
    rowUvs.append(cornerUvs)
    material = records[cornerOwners[tuple(sorted(cornerSeed))][0][0]]['material']
    added = 0
    for row in range(len(rows) - 1):
        a, b, at, bt = rows[row], rows[row + 1], parameters[row], parameters[row + 1]
        i, j = 0, 0
        while i < len(a) - 1 or j < len(b) - 1:
            advanceA = j == len(b) - 1 or (i < len(a) - 1 and at[i + 1] <= bt[j + 1])
            corners = ((row, i), (row, i + 1), (row + 1, j)) if advanceA else ((row, i), (row + 1, j + 1), (row + 1, j))
            ids = tuple(rows[r][index] for r, index in corners)
            coordinates = tuple(tuple(rowUvs[r][index][layer] for r, index in corners) for layer in range(layers))
            records.append({'ids': ids, 'uv': coordinates, 'material': material, 'smooth': True, 'role': 'bridge'})
            added += 1
            if advanceA:
                i += 1
            else:
                j += 1
    return {'method': 'Curved same-material cloth strip sharing actual body and corner boundary vertex indices',
            'bodyBoundaryVerticesReused': len(bodyPath), 'cornerBoundaryVerticesReused': len(cornerPath),
            'bodyBoundaryLengthM': bodyLength, 'cornerBoundaryLengthM': cornerLength,
            'nearestBoundarySpanM': distance, 'longitudinalRows': steps + 1,
            'newTriangles': added, 'materialSlot': material,
            'separateFakeFloatingPanel': False, 'exposedTipMoved': False}


def RefineQualityJacket(root, repo, targetEdgeM=.006, thicknessM=.00065):
    """Refine only this QualityV12 jacket; return actual provenance/counts."""
    scene = bpy.context.scene
    path = Path(bpy.data.filepath)
    if root is None or root.name != 'Pack_Root' or scene.get('BlenderMcpTask') != 'SichuanBlanketPack':
        raise RuntimeError('Pass this task\'s native Pack_Root')
    if not bpy.data.filepath or 'QualityV12' not in path.parts:
        raise RuntimeError('Save an independent QualityV12 project before jacket refinement')
    if not .003 <= targetEdgeM <= .010 or not .0005 <= thicknessM <= .0008:
        raise RuntimeError('Use 3–10 mm simple body sampling and .5–.8 mm cloth thickness')
    part = next((obj for obj in root.children if obj.name == 'Pack_Jacket'), None)
    if part is None:
        raise RuntimeError('The actual independently extractable Pack_Jacket is missing')
    garment = next((obj for obj in part.children_recursive if obj.type == 'MESH'
                    and obj.name in ('Pack_IndigoShortJacket', 'Pack_ClothButtonLoop')), None)
    button = next((obj for obj in part.children_recursive if obj.type == 'MESH'
                   and obj.name == 'StudyV7_ClothKnotButton'), None)
    if garment is None or button is None:
        raise RuntimeError('The actual full folded garment and figure-eight button are required')
    if any(modifier.name != modifierName for modifier in garment.modifiers):
        raise RuntimeError('Review unexpected existing garment modifiers before quality refinement')
    buttonHash, buttonCounts = Digest(button.data), Counts(button)
    beforeCounts = Counts(garment)
    originalParent, originalWorld = garment.parent, garment.matrix_world.copy()
    originalMaterials = [slot.material for slot in garment.material_slots]
    baselineName = garment.get('QualityJacketOriginalMesh', '')
    baseline = bpy.data.meshes.get(baselineName) if baselineName else garment.data
    if baseline is None or baseline.shape_keys is not None:
        raise RuntimeError('The original jacket baseline must be a retained static source mesh')
    baseline.use_fake_user = True
    baselineHash = Digest(baseline)
    uvNames = [layer.name for layer in baseline.uv_layers]
    sourceLayer = baseline.uv_layers.get('UVMap') or baseline.uv_layers.active
    if sourceLayer is None:
        raise RuntimeError('Preserve the original source UVs before jacket refinement')
    sourceIndex = uvNames.index(sourceLayer.name)
    transform = root.matrix_world.inverted_safe() @ garment.matrix_world
    inverse = transform.inverted_safe()
    points = [transform @ vertex.co for vertex in baseline.vertices]
    baseline.calc_loop_triangles()
    records, removed = [], []
    seamUvs = ((.6028, .1212), (.8972, .1212), (.8972, .1396), (.6028, .1396))
    for triangle in baseline.loop_triangles:
        ids = tuple(triangle.vertices)
        coordinates = tuple(tuple(tuple(layer.data[index].uv) for index in triangle.loops) for layer in baseline.uv_layers)
        role = 'corner' if CornerFace(ids, coordinates[sourceIndex], points) else 'body'
        # The old pattern builder capped the flattened cuff and hem volumes.
        # Remove only its exact canonical seam-UV triangles at those endpoints;
        # Solidify below will rim cloth thickness, without sealing the opening.
        seam = all(any(math.dist(uv, expected) < 2e-6 for expected in seamUvs) for uv in coordinates[sourceIndex])
        p = [points[index] for index in ids]
        cuff = (max(q.x for q in p) - min(q.x for q in p) < 1e-6
                and min(abs(sum(q.x for q in p) / 3 - value) for value in (-.085, .115)) < .0003
                and min(q.z for q in p) > -.080 and max(q.z for q in p) < -.040)
        hem = max(q.z for q in p) - min(q.z for q in p) < 1e-6 and abs(sum(q.z for q in p) / 3 - .1345) < .001
        if role == 'body' and seam and (cuff or hem):
            removed.append({'sourcePolygon': triangle.polygon_index, 'kind': 'CuffOpening' if cuff else 'HemOpening'})
            continue
        polygon = baseline.polygons[triangle.polygon_index]
        records.append({'ids': ids, 'uv': coordinates, 'material': polygon.material_index,
                        'smooth': polygon.use_smooth, 'role': role})
    bodyBefore = sum(record['role'] == 'body' for record in records)
    cornerBefore = sum(record['role'] == 'corner' for record in records)
    if bodyBefore < 80 or not cornerBefore:
        raise RuntimeError('Original full jacket/corner identification failed')
    cornerHash = CornerDigest(points, records)
    # Join exactly coincident paper/seam coordinates, retaining UV discontinuity
    # per loop. Different folded layers are never proximity-merged.
    cornerVertices = {index for record in records if record['role'] == 'corner' for index in record['ids']}
    bodyVertices = {index for record in records if record['role'] == 'body' for index in record['ids']}
    exact, remap = {}, {}
    for index in sorted(bodyVertices - cornerVertices):
        key = tuple(round(value, 9) for value in points[index])
        remap[index] = exact.setdefault(key, index)
    for record in records:
        if record['role'] == 'body':
            record['ids'] = tuple(remap.get(index, index) for index in record['ids'])
            if len(set(record['ids'])) != 3:
                raise RuntimeError('Exact source seam welding would collapse a body triangle')
    creaseSegments = []
    for edge, owners in EdgeOwners(records, 'body').items():
        if len(owners) != 2:
            continue
        normals = []
        for index, a, b in owners:
            a, b, c = (points[vertex] for vertex in records[index]['ids'])
            normal = (b - a).cross(c - a)
            normals.append(normal.normalized() if normal.length > 1e-14 else Vector((0, 0, 0)))
        if normals[0].dot(normals[1]) < math.cos(math.radians(55)):
            creaseSegments.append((points[edge[0]].copy(), points[edge[1]].copy()))
    sourceAreas = {name: UvArea(records, index, 'body') for index, name in enumerate(uvNames)}
    records, passes = SimpleRefine(points, records, targetEdgeM)
    refinedAreas = {name: UvArea(records, index, 'body') for index, name in enumerate(uvNames)}
    if any(abs(refinedAreas[name] - sourceAreas[name]) > max(1e-9, sourceAreas[name] * 1e-6) for name in uvNames):
        raise RuntimeError('Simple jacket subdivision changed the actual source UV footprint')
    deformed, foldReport = SoftFoldPositions(points, records, creaseSegments)
    if CornerDigest(deformed, records) != cornerHash:
        raise RuntimeError('Quality body refinement moved the approved exposed corner or its UVs')
    bridge = ConnectHiddenCorner(points, deformed, records)
    if CornerDigest(deformed, records) != cornerHash:
        raise RuntimeError('Hidden connection altered the approved corner')
    mesh = bpy.data.meshes.new('Geometry_QualityFoldedCivilianJacketV12')
    mesh.from_pydata([inverse @ point for point in points], [], [record['ids'] for record in records])
    mesh.update()
    for material in baseline.materials:
        mesh.materials.append(material)
    for name, index in zip(uvNames, range(len(uvNames))):
        layer = mesh.uv_layers.new(name=name)
        for polygon, record in zip(mesh.polygons, records):
            for loop, uv in zip(polygon.loop_indices, record['uv'][index]):
                layer.data[loop].uv = uv
    mesh.uv_layers.active = mesh.uv_layers[sourceLayer.name]
    mesh.uv_layers[sourceLayer.name].active_render = True
    roleAttribute = mesh.attributes.new('QualityJacketSurfaceRoleV12', 'INT', 'FACE')
    for polygon, record, attribute in zip(mesh.polygons, records, roleAttribute.data):
        polygon.material_index = record['material']
        polygon.use_smooth = record['smooth'] if record['role'] == 'corner' else True
        attribute.value = {'body': 0, 'corner': 1, 'bridge': 2}[record['role']]
    if any(not math.isfinite(value) for point in deformed for value in point):
        bpy.data.meshes.remove(mesh)
        raise RuntimeError('Quality jacket generated a non-finite point')
    if Digest(baseline) != baselineHash or Digest(button.data) != buttonHash:
        bpy.data.meshes.remove(mesh)
        raise RuntimeError('Quality refinement changed an original baseline or the real button')
    old = garment.data
    garment.data = mesh
    garment.shape_key_add(name='Basis', from_mix=False)
    key = garment.shape_key_add(name=keyName, from_mix=False)
    for value, point in zip(key.data, deformed):
        value.co = inverse @ point
    key.value = 1.0
    key.slider_min, key.slider_max = 0.0, 1.0
    if garment.modifiers.get(modifierName):
        garment.modifiers.remove(garment.modifiers[modifierName])
    solid = garment.modifiers.new(modifierName, 'SOLIDIFY')
    solid.thickness = thicknessM
    solid.offset = -1.0
    solid.use_rim = True
    solid.use_even_offset = False
    solid.use_quality_normals = True
    garment['QualityJacketGenerator'] = generator
    garment['QualityJacketOriginalMesh'] = baseline.name
    garment['QualityJacketOriginalMeshSha256'] = baselineHash
    garment['QualityJacketShapeKey'] = keyName
    garment['QualityJacketFullFoldedPattern'] = True
    garment['QualityJacketExposedCornerUnchanged'] = True
    garment['QualityJacketClothThicknessM'] = thicknessM
    if old != baseline and old.users == 0:
        bpy.data.meshes.remove(old)
    if garment.parent != originalParent or garment.matrix_world != originalWorld:
        raise RuntimeError('Quality refinement changed parent or material coordinate placement')
    if [slot.material for slot in garment.material_slots] != originalMaterials:
        raise RuntimeError('Quality refinement changed actual material assignments')
    afterCounts = Counts(garment)
    roles = collections.Counter(record['role'] for record in records)
    part['QualityJacketGenerator'] = generator
    part['FullCivilianGarment'] = True
    part['Control'] = 'Hide or translate this complete folded civilian garment, including its connected exposed corner and true cloth button'
    script = Path(repo) / 'Taierzhuang1938/_blender/Script_SichuanQualityJacketV12.py'
    return {'generator': generator, 'project': str(path), 'part': part.name, 'garment': garment.name,
            'baselineMesh': baseline.name, 'baselineMeshSha256': baselineHash,
            'baselineRetainedWithFakeUser': baseline.use_fake_user,
            'visibleGarmentCountsBefore': beforeCounts, 'visibleGarmentCountsAfter': afterCounts,
            'sourceBodyTrianglesBeforeOpeningRepair': bodyBefore + len(removed),
            'sourceBodyTrianglesAfterOpeningRepair': bodyBefore,
            'sourceCornerTriangles': cornerBefore, 'newBaseSurfaceTrianglesByRole': dict(roles),
            'removedOldClosedEndpointTriangles': removed, 'simpleSubdivisionPasses': passes,
            'targetBodyEdgeLengthM': targetEdgeM,
            'actualMaximumBodyEdgeLengthM': max((points[a] - points[b]).length for a, b in EdgeOwners(records, 'body')),
            'bodyUvAreasBefore': sourceAreas, 'bodyUvAreasAfterSimpleSubdivision': refinedAreas,
            'uvLayersPreserved': uvNames, 'uvMethod': 'Every original loop UV is interpolated on its actual source triangle; no UV-space geometry reconstruction',
            'approvedCornerCoordinateAndUvSha256Before': cornerHash,
            'approvedCornerCoordinateAndUvSha256After': CornerDigest(deformed, records),
            'approvedCornerLayoutUnchanged': True, 'softFoldGeometry': foldReport,
            'hiddenConnection': bridge, 'clothThicknessM': thicknessM,
            'clothThicknessModifier': modifierName, 'thicknessOffset': -1.0,
            'cornerOriginalOuterSurfaceKept': True, 'figureEightButton': button.name,
            'figureEightButtonCountsBefore': buttonCounts, 'figureEightButtonCountsAfter': Counts(button),
            'figureEightButtonSha256Before': buttonHash, 'figureEightButtonSha256After': Digest(button.data),
            'figureEightButtonUnchanged': True, 'parentAndTransformsUnchanged': True,
            'actualMaterialAssignmentsAndCoordinateAnchorsUnchanged': True,
            'foldedFullSizePatternRetained': True, 'unfoldAnimationAdded': False,
            'globalCatmullClarkUsed': False, 'lowOrFormalAssetsModified': False,
            'rebuildScript': str(script), 'rebuildScriptSha256': hashlib.sha256(script.read_bytes()).hexdigest(),
            'undo': 'Remove the quality thickness modifier and reassign the retained baselineMesh; shape key value 0 disables only the new soft-fold displacement'}
