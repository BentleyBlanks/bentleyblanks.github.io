"""Retopologize the three actual HighV10 fold lips, retaining the game core.

The old global collapse reduced a clipped crown into three open fragments.
This pass samples current evaluated source vertices and their original ring
ordering.  It never constructs a substitute cylinder, changes a source, or
runs an object operator.  Game UV packing/baking must follow this pass.
"""
import array
import hashlib
import heapq

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generator = 'SichuanGameFoldEnvelopeV10'


def Components(mesh):
    adjacency = [[] for vertex in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    unseen, result = set(range(len(mesh.vertices))), []
    while unseen:
        first = unseen.pop()
        queue, component = [first], [first]
        while queue:
            vertex = queue.pop()
            for other in adjacency[vertex]:
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
                    component.append(other)
        result.append(sorted(component))
    return result, adjacency


def Bounds(mesh, component):
    points = [mesh.vertices[index].co for index in component]
    return [(min(point[axis] for point in points), max(point[axis] for point in points))
            for axis in range(3)]


def Triangles(mesh):
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def Digest(points):
    values = array.array('f', [value for point in points for value in point])
    return hashlib.sha256(values.tobytes()).hexdigest()


def CoarseTubeVertices(component, adjacency, expected):
    """Invert the applied one-level triangular Catmull-Clark connectivity."""
    color, queue = {component[0]: 0}, [component[0]]
    while queue:
        vertex = queue.pop()
        for other in adjacency[vertex]:
            if other not in color:
                color[other] = 1 - color[vertex]
                queue.append(other)
            elif color[other] == color[vertex]:
                raise RuntimeError('Expected the actual subdivided tube quad topology')
    faceCenters = [index for index in component if len(adjacency[index]) == 3]
    if not faceCenters:
        raise RuntimeError('No original triangular face centres in source fold')
    originalColor = color[faceCenters[0]]
    if any(color[index] != originalColor for index in faceCenters):
        raise RuntimeError('Ambiguous original fold vertex partition')
    original = sorted(index for index in component
                      if color[index] == originalColor and len(adjacency[index]) != 3)
    if len(original) != expected:
        raise RuntimeError('Actual source fold coarse-grid count changed: ' + str((len(original), expected)))
    return original


def IntervalError(rows, start, end):
    if end <= start + 1:
        return 0, None
    arc = [0.0]
    for index in range(start + 1, end + 1):
        center = sum(rows[index], Vector()) / len(rows[index])
        previous = sum(rows[index - 1], Vector()) / len(rows[index - 1])
        arc.append(arc[-1] + (center - previous).length)
    total = max(arc[-1], 1e-12)
    maximum, selected = 0, None
    for offset, index in enumerate(range(start + 1, end)):
        fraction = arc[offset + 1] / total
        error = max((point - a.lerp(b, fraction)).length
                    for point, a, b in zip(rows[index], rows[start], rows[end]))
        if error > maximum:
            maximum, selected = error, index
    return maximum, selected


def SelectRows(rows, stations, closed):
    samples = rows + [rows[0]] if closed else rows
    last = len(samples) - 1
    selected = {0, last}
    heap = []

    def Push(a, b):
        error, index = IntervalError(samples, a, b)
        if index is not None:
            heapq.heappush(heap, (-error, a, b, index))

    Push(0, last)
    limit = stations + (1 if closed else 0)
    while len(selected) < limit and heap:
        error, a, b, index = heapq.heappop(heap)
        selected.add(index)
        Push(a, index)
        Push(index, b)
    error = -heap[0][0] if heap else 0
    order = sorted(selected)
    if closed:
        order.remove(last)
    return order, error


def Topology(mesh):
    components, adjacency = Components(mesh)
    counts = {}
    for polygon in mesh.polygons:
        ids = list(polygon.vertices)
        for a, b in zip(ids, ids[1:] + ids[:1]):
            edge = tuple(sorted((a, b)))
            counts[edge] = counts.get(edge, 0) + 1
    return {'connectedComponents': len(components),
            'boundaryEdges': sum(count == 1 for count in counts.values()),
            'nonManifoldEdges': sum(count > 2 for count in counts.values()),
            'closed': bool(counts) and all(count == 2 for count in counts.values())}


def RefineFoldEnvelope(highPart, gamePart, rightStations=22, leftStations=12, crownStations=10, crossColumns=6,
                       rightColumns=None,leftColumns=None,crownColumns=None):
    """Replace fold lips on the actual game envelope; return measured evidence."""
    source = next((obj for obj in (highPart, *highPart.children_recursive)
                   if obj.type == 'MESH' and obj.get('PackSourceName', obj.name) in
                   ('Pack_Bundle', 'High_Pack_Bundle')), None)
    envelope = next((obj for obj in (gamePart, *gamePart.children_recursive)
                     if obj.type == 'MESH' and obj.name == 'Game_BundleEnvelopeV10'), None)
    if source is None or envelope is None:
        raise RuntimeError('Pass the actual high/game bundle assemblies')
    if envelope.modifiers:
        raise RuntimeError('Game envelope must have frozen geometry')
    pack = gamePart.parent
    if pack is None or pack.name != 'Pack_Root':
        raise RuntimeError('Game bundle must belong to the actual Pack_Root')
    packBefore = sum(Triangles(obj.data) for obj in pack.children_recursive if obj.type == 'MESH')
    old = envelope.data
    before = Triangles(old)
    lowComponents, _ = Components(old)
    cores = [component for component in lowComponents
             if Bounds(old, component)[0][1] - Bounds(old, component)[0][0] > .30
             and Bounds(old, component)[2][1] - Bounds(old, component)[2][0] > .25
             and max(old.vertices[index].co.y for index in component) > -.00001]
    if len(cores) != 1:
        raise RuntimeError('Cannot identify the retained game core without guessing')
    core = cores[0]
    coreSet = set(core)
    positions = [old.vertices[index].co.copy() for index in core]
    coreHash = Digest(positions)
    remap = {index: compact for compact, index in enumerate(core)}
    faces, faceUvs, faceMaterials = [], [], []
    oldUv = old.uv_layers.get('SurfaceUV') or old.uv_layers.active
    for polygon in old.polygons:
        if all(index in coreSet for index in polygon.vertices):
            faces.append(tuple(remap[index] for index in polygon.vertices))
            faceUvs.append([tuple(oldUv.data[index].uv) if oldUv else (0, 0)
                            for index in polygon.loop_indices])
            faceMaterials.append(polygon.material_index)
    coreTriangles = sum(len(face) - 2 for face in faces)
    deps = bpy.context.evaluated_depsgraph_get()
    evaluated = source.evaluated_get(deps)
    high = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=deps)
    temporaryMeshes = []
    replacementReports = []
    sampleColumnsByLabel={'RightFold':rightColumns or crossColumns,
                          'LeftFold':leftColumns or crossColumns,
                          'Crown':crownColumns or crossColumns}
    if any(not isinstance(value,int) or not 3<=value<=16 for value in sampleColumnsByLabel.values()):
        raise RuntimeError('Fold cross sections require 3 to 16 sampled columns')
    try:
        components, adjacency = Components(high)
        labels = {}
        for component in components:
            bounds = Bounds(high, component)
            if bounds[0][0] > .15 and bounds[2][1] - bounds[2][0] > .25:
                label = 'RightFold'
            elif bounds[0][1] < -.15 and bounds[2][1] - bounds[2][0] > .25:
                label = 'LeftFold'
            elif bounds[2][0] > .12 and bounds[0][1] - bounds[0][0] > .30:
                label = 'Crown'
            else:
                continue
            if label in labels:
                raise RuntimeError('Ambiguous actual high fold component: ' + label)
            labels[label] = component
        if set(labels) != {'RightFold', 'LeftFold', 'Crown'}:
            raise RuntimeError('Actual high fold components were not found: ' + str(list(labels)))
        specifications = [('RightFold', 37440, 520, 12, rightStations, True),
                          ('LeftFold', 19440, 270, 12, leftStations, True),
                          ('Crown', 2576, 161, 16, crownStations, False)]
        # A smaller crown remains a real sampled tube if the current full pack
        # uses more triangles elsewhere than the first reviewed candidate.
        crownCount=sampleColumnsByLabel['Crown']
        expected = (coreTriangles + rightStations*sampleColumnsByLabel['RightFold']*2
                    + leftStations*sampleColumnsByLabel['LeftFold']*2
                    + (crownStations-1)*crownCount*2 + (crownCount-2)*2)
        while packBefore - before + expected > 3000 and crownStations > 8:
            crownStations -= 1
            expected -= crownCount * 2
        specifications[-1] = ('Crown', 2576, 161, 16, crownStations, False)
        if packBefore - before + expected > 3000:
            raise RuntimeError('Fold repair would exceed the actual all-parts 3000 triangle limit')
        intoEnvelope = envelope.matrix_world.inverted_safe() @ evaluated.matrix_world
        sourceUv = high.uv_layers.get('UVMap') or high.uv_layers.active
        if sourceUv is None:
            raise RuntimeError('Actual high folds have no source UV')
        sourceIndices = {}
        for label, expectedVertices, rows, columns, stations, closed in specifications:
            component = labels[label]
            if len(component) != expectedVertices:
                raise RuntimeError('Actual source fold topology changed: ' + str((label, len(component), expectedVertices)))
            indices = CoarseTubeVertices(component, adjacency, rows * columns) if closed else component
            sourceIndices[label] = indices
        wanted = {index for indices in sourceIndices.values() for index in indices}
        sourceVertexUv = {}
        for loop in high.loops:
            if loop.vertex_index in wanted and loop.vertex_index not in sourceVertexUv:
                sourceVertexUv[loop.vertex_index] = tuple(sourceUv.data[loop.index].uv)
        for label, expectedVertices, rowCount, columns, stations, closed in specifications:
            sectionColumns=sampleColumnsByLabel[label]
            indices = sourceIndices[label]
            # Six columns come from the actual ring, interpolating its real
            # edges where the 16-column crown does not divide evenly by six.
            cross = [column * columns / sectionColumns for column in range(sectionColumns)]
            rows, rowUvs = [], []
            for row in range(rowCount):
                pointsAtRow, uvAtRow = [], []
                for column in cross:
                    first = int(column) % columns
                    second = (first + 1) % columns
                    fraction = column - int(column)
                    a, b = indices[row * columns + first], indices[row * columns + second]
                    pointsAtRow.append(intoEnvelope @ high.vertices[a].co.lerp(high.vertices[b].co, fraction))
                    uvAtRow.append(tuple(sourceVertexUv[a][axis] * (1-fraction) + sourceVertexUv[b][axis] * fraction for axis in (0,1)))
                rows.append(pointsAtRow)
                rowUvs.append(uvAtRow)
            ringDiameter = max(max((a - b).length for a in row for b in row) for row in rows)
            stepDistances = [(sum(b, Vector()) - sum(a, Vector())).length / sectionColumns
                             for a, b in zip(rows, rows[1:])]
            if ringDiameter > .040 or max(stepDistances, default=0) > .012:
                raise RuntimeError('Source ring ordering failed geometric validation: ' +
                                   str((label, ringDiameter, max(stepDistances, default=0))))
            order, curveError = SelectRows(rows, stations, closed)
            if curveError > .006:
                raise RuntimeError('Fold curve cannot meet this budget without losing shape: ' + str((label, curveError)))
            points = [rows[row][column] for row in order for column in range(sectionColumns)]
            uv = [rowUvs[row][column] for row in order for column in range(sectionColumns)]
            polygons = []
            intervals = len(order) if closed else len(order) - 1
            for row in range(intervals):
                following = (row + 1) % len(order)
                for column in range(sectionColumns):
                    nextColumn = (column + 1) % sectionColumns
                    polygons.append((row * sectionColumns + column, row * sectionColumns + nextColumn,
                                     following * sectionColumns + nextColumn, following * sectionColumns + column))
            if not closed:
                polygons.extend((tuple(reversed(range(sectionColumns))), tuple((len(order) - 1) * sectionColumns + index for index in range(sectionColumns))))
            mesh = bpy.data.meshes.new('Geometry_GameFoldSample_' + label)
            temporaryMeshes.append(mesh)
            mesh.from_pydata(points, [], polygons)
            mesh.update()
            layer = mesh.uv_layers.new(name='SurfaceUV')
            for loop in mesh.loops:
                layer.data[loop.index].uv = uv[loop.vertex_index]
            bm = bmesh.new()
            bm.from_mesh(mesh)
            bmesh.ops.triangulate(bm, faces=list(bm.faces))
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            if bm.calc_volume(signed=True) < 0:
                bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
            bm.to_mesh(mesh)
            bm.free()
            mesh.update()
            topology = Topology(mesh)
            if not topology['closed'] or topology['connectedComponents'] != 1 or topology['nonManifoldEdges']:
                raise RuntimeError('Resampled actual fold is not closed/manifold: ' + label)
            mesh.calc_loop_triangles()
            tree = BVHTree.FromPolygons([vertex.co.copy() for vertex in mesh.vertices],
                                       [tuple(triangle.vertices) for triangle in mesh.loop_triangles], all_triangles=True)
            distances = [tree.find_nearest(intoEnvelope @ high.vertices[index].co)[3]
                         for index in labels[label]]
            offset = len(positions)
            positions.extend(vertex.co.copy() for vertex in mesh.vertices)
            for polygon in mesh.polygons:
                faces.append(tuple(offset + index for index in polygon.vertices))
                faceUvs.append([tuple(mesh.uv_layers['SurfaceUV'].data[index].uv) for index in polygon.loop_indices])
                faceMaterials.append(0)
            replacementReports.append({'name': label, 'sourceVertices': expectedVertices,
                                       'sourceRows': rowCount, 'sourceColumns': columns,
                                       'sampleStations': len(order), 'sampleColumns': sectionColumns,
                                       'sampledSourceRowIndices': order, 'triangles': Triangles(mesh),
                                       'maxCurveErrorM': curveError,
                                       'maxSourceSurfaceDistanceM': max(distances, default=0),
                                       'meanSourceSurfaceDistanceM': sum(distances) / max(len(distances), 1),
                                       'surfaceDistanceSampleCount': len(distances),
                                       'surfaceDistanceSamples': 'Every actual evaluated source component vertex',
                                       **topology})
        result = bpy.data.meshes.new('Geometry_GameFoldEnvelopeV10')
        result.from_pydata(positions, [], faces)
        result.update()
        for material in old.materials:
            result.materials.append(material)
        layer = result.uv_layers.new(name='SurfaceUV')
        for polygon, uvs, materialIndex in zip(result.polygons, faceUvs, faceMaterials):
            polygon.material_index = materialIndex
            polygon.use_smooth = False
            for index, value in zip(polygon.loop_indices, uvs):
                layer.data[index].uv = value
        after = Triangles(result)
        packAfter = packBefore - before + after
        if packAfter > 3000:
            bpy.data.meshes.remove(result)
            raise RuntimeError('Measured final fold repair exceeds 3000 triangles: ' + str(packAfter))
        actualHash = Digest([vertex.co for vertex in result.vertices[:len(core)]])
        if actualHash != coreHash:
            bpy.data.meshes.remove(result)
            raise RuntimeError('Fold replacement changed retained game core coordinates')
        envelope.data = result
        envelope['FoldEnvelopeGenerator'] = generator
        envelope['SourceHighObject'] = source.name
        if old.users == 0:
            bpy.data.meshes.remove(old)
        return {'generator': generator, 'envelopeObject': envelope.name, 'sourceObject': source.name,
                'trianglesBefore': before, 'trianglesAfter': after,
                'packTrianglesBefore': packBefore, 'packTrianglesAfter': packAfter,
                'keptCore': {'triangles': coreTriangles, 'vertices': len(core),
                             'coordinateHashBefore': coreHash, 'coordinateHashAfter': actualHash,
                             'coordinatesUnchanged': True}, 'replacements': replacementReports,
                'envelopeTopology': Topology(result), 'sourceGeometryUnchanged': True,
                'frontLeafUnchanged': True, 'sourceUvsSampled': True, 'gameUvRepackRequired': True}
    finally:
        evaluated.to_mesh_clear()
        for mesh in temporaryMeshes:
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
