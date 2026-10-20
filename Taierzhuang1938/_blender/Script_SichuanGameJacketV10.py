"""Keep the complete folded civilian garment and its actual V10 cloth knot.

The exposed corner is reduced separately, so its high tessellation cannot
consume the concealed torso, collar and sleeves.  The source assembly is read
only.  All output vertices use the receiving game part's local space.
"""
import math
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generator = 'SichuanGameJacketV10'


def SourceName(obj):
    return obj.get('PackSourceName', obj.name)


def TriangleCount(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def SimpleMaterial(button=False):
    name = 'Material_GameSichuanClothButtonV10' if button else 'Material_GameSichuanJacketV10'
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (.09, .115, .13, 1) if button else (.065, .095, .12, 1)
        bsdf.inputs['Roughness'].default_value = .96
        bsdf.inputs['Metallic'].default_value = 0
    material.use_backface_culling = False
    return material


def EvaluatedData(source, gamePart):
    evaluated = source.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        transform = gamePart.matrix_world.inverted_safe() @ source.matrix_world
        positions = [transform @ vertex.co for vertex in mesh.vertices]
        layer = mesh.uv_layers.get('SurfaceUV') or mesh.uv_layers.active
        assert layer is not None, 'The jacket must retain its authored surface UV'
        polygons = []
        for polygon in mesh.polygons:
            polygons.append((tuple(polygon.vertices), [layer.data[index].uv.copy()
                                                      for index in polygon.loop_indices]))
        return positions, polygons
    finally:
        evaluated.to_mesh_clear()


def CreateMesh(name, positions, polygons, gamePart, material, source):
    used = sorted({index for vertices, uv in polygons for index in vertices})
    remap = {index: compact for compact, index in enumerate(used)}
    mesh = bpy.data.meshes.new(name + 'Mesh')
    mesh.from_pydata([positions[index] for index in used], [], [
        tuple(remap[index] for index in vertices) for vertices, uv in polygons])
    mesh.update()
    layer = mesh.uv_layers.new(name='SurfaceUV')
    for polygon, (_, coordinates) in zip(mesh.polygons, polygons):
        for loopIndex, uv in zip(polygon.loop_indices, coordinates):
            layer.data[loopIndex].uv = uv
        polygon.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = gamePart
    mesh.materials.append(material)
    obj['PackSourceName'] = SourceName(source)
    obj['GameGenerator'] = generator
    obj['SourceHighObject'] = source.name
    return obj


def DissolveCoplanar(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(.75),
                            verts=list(bm.verts), edges=list(bm.edges),
                            use_dissolve_boundaries=False, delimit={'MATERIAL'})
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def LimitTriangles(obj, target):
    """Collapse only this freshly created game mesh, never the source mesh."""
    before = TriangleCount(obj)
    if before <= target:
        return before
    assert target >= 4
    modifier = obj.modifiers.new('GameGarmentReduction', 'DECIMATE')
    modifier.decimate_type = 'COLLAPSE'
    modifier.use_collapse_triangulate = True
    # Search the actual evaluated triangle result instead of assuming ratio
    # times polygon count equals exported triangles for the original n-gons.
    lower, upper = 0.0, 1.0
    best = None
    for iteration in range(12):
        ratio = target / before if iteration == 0 else (lower + upper) * .5
        modifier.ratio = max(.0001, min(.9999, ratio))
        bpy.context.view_layer.update()
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True,
                                              depsgraph=bpy.context.evaluated_depsgraph_get())
        mesh.calc_loop_triangles()
        triangles = len(mesh.loop_triangles)
        if triangles <= target and triangles > 0:
            lower = ratio
            if best is not None:
                bpy.data.meshes.remove(best)
            best = mesh
        else:
            upper = ratio
            bpy.data.meshes.remove(mesh)
        if triangles == target:
            break
    obj.modifiers.remove(modifier)
    assert best is not None, (obj.name, target)
    old = obj.data
    obj.data = best
    if old.users == 0:
        bpy.data.meshes.remove(old)
    if obj.data.uv_layers.get('SurfaceUV'):
        obj.data.uv_layers.active = obj.data.uv_layers['SurfaceUV']
    return TriangleCount(obj)


def IsExposedCorner(vertices, coordinates, positions):
    for index, uv in zip(vertices, coordinates):
        point = positions[index]
        expectedV = .02 + .46 * (.90 + (point.z - .144) / .56)
        if not (.785 < uv.x < .820 and abs(uv.y - expectedV) < .010
                and point.x > .103 and point.z > .071):
            return False
    return True


def RingButton(source, gamePart):
    """Sample both existing closed cloth tubes, including the actual knot eye."""
    positions, polygons = EvaluatedData(source, gamePart)
    # The V7 rounded cloth knot remains the V10 source.  Its figure-eight tube
    # has 72 by 12 vertices; its loop eye has 40 by 10.  Verify before reading.
    assert len(positions) == 72 * 12 + 40 * 10, (
        'Unexpected current cloth-knot topology', len(positions))
    resultPositions, resultPolygons = [], []
    offset = 0
    for ringCount, columns, samples in ((72, 12, 8), (40, 10, 6)):
        start = len(resultPositions)
        rowIndices = [round(index * ringCount / samples) % ringCount
                      for index in range(samples)]
        columnIndices = [round(index * columns / 3) % columns for index in range(3)]
        for row in rowIndices:
            resultPositions.extend(positions[offset + row * columns + column].copy()
                                   for column in columnIndices)
        for row in range(samples):
            for column in range(3):
                ids = (start + row * 3 + column,
                       start + row * 3 + (column + 1) % 3,
                       start + ((row + 1) % samples) * 3 + (column + 1) % 3,
                       start + ((row + 1) % samples) * 3 + column)
                coordinates = []
                for index in ids:
                    point = resultPositions[index]
                    coordinates.append(Vector((.70 + point.x - .15,
                                               .45 + point.z - .12)))
                resultPolygons.append((ids, coordinates))
        offset += ringCount * columns
    obj = CreateMesh('Game_ClothKnotButton', resultPositions, resultPolygons,
                     gamePart, SimpleMaterial(True), source)
    obj['ClosedClothKnot'] = True
    obj['SourceTubes'] = 2
    return obj


def MaximumSurfaceDistance(points, obj):
    obj.data.calc_loop_triangles()
    tree = BVHTree.FromPolygons([vertex.co.copy() for vertex in obj.data.vertices],
                               [tuple(triangle.vertices) for triangle in obj.data.loop_triangles],
                               all_triangles=True)
    values = [tree.find_nearest(point)[3] for point in points]
    assert all(value is not None for value in values)
    return max(values, default=0)


def BuildLowJacket(highPart, gamePart, budget=250):
    assert isinstance(budget, int) and budget >= 150
    sources = {SourceName(obj): obj for obj in (highPart, *highPart.children_recursive)
               if obj.type == 'MESH'}
    garmentName = next((name for name in ('Pack_IndigoShortJacket', 'Pack_ClothButtonLoop')
                        if name in sources), None)
    assert garmentName is not None, list(sources)
    assert 'StudyV7_ClothKnotButton' in sources
    for obj in list(gamePart.children_recursive):
        if obj.get('GameGenerator') == generator:
            bpy.data.objects.remove(obj, do_unlink=True)
    # The V6 save joined the full jacket into the active button-loop object;
    # V7 removed the old button faces, retaining this historical object name.
    source = sources[garmentName]
    positions, polygons = EvaluatedData(source, gamePart)
    bodyPolygons, cornerPolygons = [], []
    for vertices, uv in polygons:
        target = cornerPolygons if IsExposedCorner(vertices, uv, positions) else bodyPolygons
        target.append((vertices, uv))
    assert bodyPolygons and cornerPolygons, (len(bodyPolygons), len(cornerPolygons))
    material = SimpleMaterial()
    body = CreateMesh('Game_IndigoShortJacket', positions, bodyPolygons,
                      gamePart, material, source)
    corner = CreateMesh('Game_JacketExposedCorner', positions, cornerPolygons,
                        gamePart, material, source)
    bodySource = [vertex.co.copy() for vertex in body.data.vertices]
    cornerSource = [vertex.co.copy() for vertex in corner.data.vertices]
    beforeBody, beforeCorner = TriangleCount(body), TriangleCount(corner)
    button = RingButton(sources['StudyV7_ClothKnotButton'], gamePart)
    buttonTriangles = TriangleCount(button)
    DissolveCoplanar(body)
    DissolveCoplanar(corner)
    # Preserve the full garment first; use remaining geometry on the exposed
    # corner's broad, shallow wrinkle.  Cloth microrelief is a normal-map task.
    remaining = budget - buttonTriangles
    cornerReserve = min(96, max(48, remaining - 100))
    bodyTarget = max(60, remaining - cornerReserve)
    bodyTriangles = LimitTriangles(body, bodyTarget)
    cornerTriangles = LimitTriangles(corner, remaining - bodyTriangles)
    bodyError = MaximumSurfaceDistance(bodySource, body)
    cornerError = MaximumSurfaceDistance(cornerSource, corner)
    assert bodyError <= .004, ('Full folded garment lost shape', bodyError)
    assert cornerError <= .0025, ('Exposed jacket corner lost shape', cornerError)
    total = bodyTriangles + cornerTriangles + buttonTriangles
    assert total <= budget, (total, budget)
    for obj in (body, corner):
        obj['GameTwoSidedCloth'] = True
    body['FullCivilianGarment'] = True
    body['RetainedParts'] = 'Folded torso, sleeves, collar, front placket, hem'
    gamePart['Control'] = 'Hide or translate this independent full garment to withdraw it'
    gamePart['FullCivilianGarment'] = True
    for key in ('PatternDimensionsM', 'TorsoWidthM', 'Construction', 'Garment'):
        if key in highPart:
            gamePart[key] = highPart[key]
    return {'generator': generator, 'budget': budget, 'triangles': total,
            'fullGarmentRetained': True, 'sourceUntouched': True,
            'objects': [{'object': body.name, 'sourceTriangles': beforeBody,
                         'triangles': bodyTriangles, 'maxSourceSurfaceDistanceM': bodyError},
                        {'object': corner.name, 'sourceTriangles': beforeCorner,
                         'triangles': cornerTriangles, 'maxSourceSurfaceDistanceM': cornerError},
                        {'object': button.name, 'triangles': buttonTriangles,
                         'closedClothTubes': 2}],
            'independentRoot': gamePart.name, 'twoSidedThinCloth': True}
