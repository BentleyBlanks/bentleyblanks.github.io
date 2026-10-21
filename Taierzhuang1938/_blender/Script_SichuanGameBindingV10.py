"""Sample the current V10 cloth binding into a budgeted game ribbon.

This reads the authored strip's existing mesh order and shape-key mix, then
projects those stations onto its *evaluated* rounded surface.  No old route is
reconstructed.  The game ribbon is deliberately two-sided, without spending
triangles on the sub-millimetre solidified wall that is baked from the source.
"""
import math
import heapq
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generator = 'SichuanGameBindingV10'


def SourceName(obj):
    return obj.get('PackSourceName', obj.name)


def TriangleCount(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def SimpleMaterial():
    material = bpy.data.materials.get('Material_GameSichuanBindingV10')
    if material is None:
        material = bpy.data.materials.new('Material_GameSichuanBindingV10')
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (.16, .155, .135, 1)
        bsdf.inputs['Roughness'].default_value = .95
        bsdf.inputs['Metallic'].default_value = 0
    material.use_backface_culling = False
    return material


def MixedCoordinates(obj):
    """Current relative shape keys, before the source's rounded subdivision."""
    keys = obj.data.shape_keys
    if keys is None:
        return [vertex.co.copy() for vertex in obj.data.vertices]
    assert keys.use_relative, 'The V10 strip must use relative shape keys'
    basis = keys.key_blocks[0]
    result = [point.co.copy() for point in basis.data]
    for key in keys.key_blocks[1:]:
        if key.mute or abs(key.value) < 1e-12:
            continue
        relative = key.relative_key
        for index, point in enumerate(key.data):
            result[index] += (point.co - relative.data[index].co) * key.value
    return result


def EvaluatedTree(obj, intoGame):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        points = [intoGame @ vertex.co for vertex in mesh.vertices]
        triangles = [tuple(triangle.vertices) for triangle in mesh.loop_triangles]
        return BVHTree.FromPolygons(points, triangles, all_triangles=True)
    finally:
        evaluated.to_mesh_clear()


def ConnectedComponents(mesh):
    adjacency = [[] for vertex in mesh.vertices]
    for edge in mesh.edges:
        a, b = edge.vertices
        adjacency[a].append(b)
        adjacency[b].append(a)
    unseen = set(range(len(mesh.vertices)))
    result = []
    while unseen:
        first = unseen.pop()
        component, queue = [first], [first]
        while queue:
            vertex = queue.pop()
            for other in adjacency[vertex]:
                if other in unseen:
                    unseen.remove(other)
                    component.append(other)
                    queue.append(other)
        result.append(sorted(component))
    return sorted(result, key=lambda component: component[0])


def RecoverStations(obj, gamePart, columns, component, tree, source):
    mesh = obj.data
    count = len(component)
    assert count % (2 * columns) == 0, (SourceName(obj), count, columns)
    startIndex = component[0]
    assert component == list(range(startIndex, startIndex + count)), (
        'Authored component vertex order was changed', startIndex, count)
    shellCount = count // 2
    rows = shellCount // columns
    assert rows >= 2
    originalIndices = set(component[:shellCount])
    topPolygons = [polygon for polygon in mesh.polygons
                   if all(index in originalIndices for index in polygon.vertices)]
    expectedCells = (rows - 1) * (columns - 1)
    assert len(topPolygons) in (expectedCells, 2 * expectedCells), (
        'Unexpected original strip topology', SourceName(obj), len(topPolygons), rows)
    # Solidify must have retained the original row-major sheet.  Verify it,
    # rather than interpreting an unrelated mesh as a longitudinal route.
    for polygon in topPolygons:
        ringRows = {(index - startIndex) // columns for index in polygon.vertices}
        assert max(ringRows) - min(ringRows) == 1
        assert max((index - startIndex) % columns for index in polygon.vertices) - min(
            (index - startIndex) % columns for index in polygon.vertices) == 1
    layer = mesh.uv_layers.get('SurfaceUV') or mesh.uv_layers.active
    assert layer is not None, 'Authored cloth UV is required'
    perVertex = {index: [] for index in originalIndices}
    for polygon in topPolygons:
        for loopIndex in polygon.loop_indices:
            perVertex[mesh.loops[loopIndex].vertex_index].append(
                layer.data[loopIndex].uv.copy())
    intoGame = gamePart.matrix_world.inverted_safe() @ obj.matrix_world
    stations, projectionErrors, uvRanges = [], [], []
    for row in range(rows):
        samples, coordinates, normals = [], [], []
        for column in (0, columns // 2, columns - 1):
            index = startIndex + row * columns + column
            original = intoGame @ source[index]
            nearest, normal, face, distance = tree.find_nearest(original)
            assert nearest is not None, 'Empty evaluated binding'
            samples.append(nearest.copy())
            normals.append(normal.copy())
            projectionErrors.append(float(distance))
            values = perVertex[index]
            assert values
            # At each repeated-texture seam one vertex has two loop UVs.
            # Keep both so incoming and outgoing segments retain their sides.
            coordinates.append((min(values, key=lambda uv: uv.y).copy(),
                                max(values, key=lambda uv: uv.y).copy()))
        stations.append((samples, coordinates, normals))
        uvRanges.append(max(pair[1].y - pair[0].y for pair in coordinates))
    return stations, uvRanges, max(projectionErrors, default=0)


def IntervalError(stations, start, end):
    if end <= start + 1:
        return 0, None
    # All three tracks contribute.  This retains twists at shoulder loops and
    # tight turns even when the middle line happens to be nearly straight.
    lengths = [0.0]
    for row in range(start + 1, end + 1):
        lengths.append(lengths[-1] + (
            stations[row][0][1] - stations[row - 1][0][1]).length)
    total = max(lengths[-1], 1e-12)
    maximum, maximumIndex = 0, None
    for offset, row in enumerate(range(start + 1, end)):
        t = lengths[offset + 1] / total
        error = max((stations[row][0][column] - stations[start][0][column].lerp(
            stations[end][0][column], t)).length for column in range(3))
        if error > maximum:
            maximum, maximumIndex = error, row
    return maximum, maximumIndex


def SelectStations(stations, mandatory, limit, tolerance):
    selected = set(mandatory)
    assert len(selected) <= limit, 'Binding UV seams exceed its vertex budget'
    heap = []

    def Push(start, end):
        error, index = IntervalError(stations, start, end)
        if index is not None:
            heapq.heappush(heap, (-error, start, end, index))

    order = sorted(selected)
    for start, end in zip(order, order[1:]):
        Push(start, end)
    while len(selected) < limit and heap and -heap[0][0] > tolerance:
        negativeError, start, end, index = heapq.heappop(heap)
        selected.add(index)
        Push(start, index)
        Push(index, end)
    order = sorted(selected)
    maximum = -heap[0][0] if heap else 0
    return order, maximum


def MakeRibbon(source, gamePart, stations, order, material, sourceLabel):
    positions, faces, faceUvs = [], [], []
    for row in order:
        samples, coordinates, normals = stations[row]
        positions.extend((tuple(samples[0]), tuple(samples[2])))
    for interval, (start, end) in enumerate(zip(order, order[1:])):
        a = interval * 2
        indices = (a, a + 1, a + 3, a + 2)
        startUvs = stations[start][1]
        endUvs = stations[end][1]
        # Outgoing seam starts at its lower V; incoming seam ends at upper V.
        coordinates = (startUvs[0][0], startUvs[2][0],
                       endUvs[2][1], endUvs[0][1])
        geometricNormal = (Vector(positions[a + 1]) - Vector(positions[a])).cross(
            Vector(positions[a + 3]) - Vector(positions[a]))
        highNormal = stations[start][2][1] + stations[end][2][1]
        if geometricNormal.dot(highNormal) < 0:
            indices = tuple(reversed(indices))
            coordinates = tuple(reversed(coordinates))
        faces.append(indices)
        faceUvs.append(coordinates)
    name = sourceLabel.replace('Pack_', 'Game_', 1)
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata(positions, [], faces)
    mesh.update()
    layer = mesh.uv_layers.new(name='SurfaceUV')
    for polygon, coordinates in zip(mesh.polygons, faceUvs):
        for loopIndex, uv in zip(polygon.loop_indices, coordinates):
            layer.data[loopIndex].uv = uv
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = gamePart
    obj.data.materials.append(material)
    obj['PackSourceName'] = sourceLabel
    obj['GameGenerator'] = generator
    obj['GameTwoSidedCloth'] = True
    obj['SourceHighObject'] = source.name
    return obj


def BuildLowBinding(highPart, gamePart, budget=354):
    """Read highPart; create only gamePart children; return a JSON-safe report."""
    assert isinstance(budget, int) and budget >= 100
    sources = {SourceName(obj): obj for obj in (highPart, *highPart.children_recursive)
               if obj.type == 'MESH'}
    names = ['Pack_ContinuousClothStrap', 'Pack_SoftKnotOver',
             'Pack_SoftKnotUnder', 'Pack_SoftKnotLoopLeft',
             'Pack_SoftKnotLoopRight', 'Pack_SoftKnotTail']
    assert names[0] in sources, list(sources)
    for obj in list(gamePart.children_recursive):
        if obj.get('GameGenerator') == generator:
            bpy.data.objects.remove(obj, do_unlink=True)
    recovered = {}
    # The persisted source was joined before the high-cloth refinements.  Its
    # six original strips are still six contiguous, disconnected components.
    # The main one is 748 by 7 by 2 vertices; the five actual knot sheets follow.
    joinedSource = sources[names[0]]
    components = ConnectedComponents(joinedSource.data)
    assert len(components) == 6, ('Unexpected joined binding components',
                                 [len(component) for component in components])
    intoGame = gamePart.matrix_world.inverted_safe() @ joinedSource.matrix_world
    tree = EvaluatedTree(joinedSource, intoGame)
    mixed = MixedCoordinates(joinedSource)
    for name, component in zip(names, components):
        recovered[name] = RecoverStations(joinedSource, gamePart,
                                          7 if name == names[0] else 3,
                                          component, tree, mixed)
    material = SimpleMaterial()
    objects, report = [], []
    # Reserve enough stations for every actual side-knot bend.  Knot pieces
    # remain separate surfaces of the same cloth tie, never metal hardware.
    knotLimit = min(48, max(20, budget // 12))
    knotToleranceM = .0012
    knotTriangles = 0
    for name in names[1:]:
        stations, ranges, projectionError = recovered[name]
        order, error = SelectStations(stations, (0, len(stations) - 1),
                                      knotLimit, knotToleranceM)
        assert error <= knotToleranceM, ('Side knot exceeded its measured curve tolerance', name, error)
        obj = MakeRibbon(joinedSource, gamePart, stations, order, material, name)
        triangles = TriangleCount(obj)
        knotTriangles += triangles
        objects.append(obj)
        report.append({'source': name, 'object': obj.name,
                       'sourceStations': len(stations), 'gameStations': len(order),
                       'triangles': triangles, 'maxRouteErrorM': error,
                       'allowedRouteErrorM': knotToleranceM,
                       'maxEvaluationProjectionM': projectionError})
    stations, ranges, projectionError = recovered[names[0]]
    mandatory = {0, len(stations) - 1}
    mandatory.update(index for index, span in enumerate(ranges) if span > .20)
    limit = (budget - knotTriangles) // 2 + 1
    order, error = SelectStations(stations, mandatory, limit, .0007)
    assert error <= .002, ('Insufficient binding budget for current route',
                            {'budget': budget, 'mainStations': len(order),
                             'sideKnotTriangles': knotTriangles, 'mainStationLimit': limit,
                             'sideKnotStations': [row['gameStations'] for row in report],
                             'maxRouteErrorM': error, 'allowedRouteErrorM': .002})
    obj = MakeRibbon(joinedSource, gamePart, stations, order, material, names[0])
    obj['ContinuousStrip'] = True
    obj['OuterGridPasses'] = [2, 2]
    obj['ShoulderLoops'] = 2
    obj['RouteOrigin'] = 'Current evaluated high strip; no historical-route rebuild'
    objects.insert(0, obj)
    report.insert(0, {'source': names[0], 'object': obj.name,
                     'sourceStations': len(stations), 'gameStations': len(order),
                     'uvSeamStations': len(mandatory) - 2,
                     'triangles': TriangleCount(obj), 'maxRouteErrorM': error,
                     'maxEvaluationProjectionM': projectionError})
    triangles = sum(TriangleCount(obj) for obj in objects)
    assert triangles <= budget, (triangles, budget)
    gamePart['ContinuousStrip'] = True
    gamePart['OuterGridPasses'] = [2, 2]
    gamePart['ShoulderLoops'] = 2
    return {'generator': generator, 'budget': budget, 'triangles': triangles,
            'objects': report, 'sourceUntouched': True,
            'routeErrorTargetM': .0007, 'allowedRouteErrorM': .002,
            'allowedSideKnotErrorM': knotToleranceM,
            'allocation': {'sideKnotTriangles': knotTriangles,
                           'mainTriangleBudget': budget-knotTriangles,
                           'mainStationLimit': limit, 'actualMainStations': len(order)},
            'currentEvaluatedRouteSampled': True, 'twoSidedThinCloth': True}
