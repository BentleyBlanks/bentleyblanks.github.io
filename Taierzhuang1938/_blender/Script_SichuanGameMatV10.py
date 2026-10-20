"""Retopologise the evaluated V10 rolled sheet and its two cotton retainers.

No Blender operations run on import.  BuildLowMat reads the current high source
without modifying it.  Dense interlacing and compressed winding faces are bake
sources; the low shell is sampled from those actual surfaces, not a cylinder.
"""
import math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generatorTag = 'SichuanGameMatV10'


def SourceName(obj):
    return obj.get('PackSourceName', obj.name)


def Source(highPart, name):
    found = [obj for obj in highPart.children_recursive
             if SourceName(obj) == name and obj.type == 'MESH']
    if len(found) != 1:
        raise RuntimeError('Expected one evaluated high mat source: ' + name)
    return found[0]


def Snapshot(obj, gamePart):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        transform = gamePart.matrix_world.inverted_safe() @ evaluated.matrix_world
        return ([transform @ vertex.co for vertex in mesh.vertices],
                [tuple(polygon.vertices) for polygon in mesh.polygons])
    finally:
        evaluated.to_mesh_clear()


def Material(region):
    name = 'Material_GameV10_' + region
    result = bpy.data.materials.get(name)
    if result is None:
        result = bpy.data.materials.new(name)
        result.diffuse_color = (.30, .25, .16, 1) if region == 'Straw' else (.20, .21, .18, 1)
        result.use_nodes = True
        shader = result.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = result.diffuse_color
        shader.inputs['Roughness'].default_value = .92
        shader.inputs['Metallic'].default_value = 0
    result['AtlasRegion'] = region.lower()
    return result


def Write(name, vertices, faces, parent, region, sources):
    mesh = bpy.data.meshes.new('Geometry_' + name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(Material(region))
    mesh.update()
    for face in mesh.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj[generatorTag] = True
    obj['BakeSourceNames'] = ','.join(sources)
    obj['Construction'] = 'Evaluated V10 source surface samples'
    return obj


def TriangleCount(obj):
    return sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)


def BuildLowMat(highPart, gamePart, budget=430):
    if budget < 300:
        raise ValueError('The evaluated roll and two hideable cotton retainers require at least 300 triangles')
    for obj in list(gamePart.children_recursive):
        if obj.get(generatorTag):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
    names = ('Pack_TrueRolledGrassSheet', 'Pack_InterlacedMatGrass',
             'Pack_CutGrassBundlesV10', 'Pack_InnerMatTuckV10')
    points, polygons = [], []
    sourceReports = []
    for name in names:
        obj = Source(highPart, name)
        vertices, faces = Snapshot(obj, gamePart)
        offset = len(points)
        points.extend(vertices)
        polygons.extend(tuple(offset + index for index in face) for face in faces)
        sourceReports.append({'source': SourceName(obj), 'evaluatedVertices': len(vertices),
                              'evaluatedFaces': len(faces)})
    surface = BVHTree.FromPolygons(points, polygons, all_triangles=False)
    sheet = Source(highPart, names[0])
    sheetPoints, _ = Snapshot(sheet, gamePart)
    # The original 601 x 49 coordinates remain first after Solidify.  Sampling
    # their final turn gives the actual roll centre and excludes tuft outliers.
    if len(sheet.data.vertices) != 601 * 49:
        raise RuntimeError('V10 sheet grid changed; retopology must be reviewed')
    lastTurn = sheetPoints[471 * 49:601 * 49]
    centerY = .5 * (min(point.y for point in lastTurn) + max(point.y for point in lastTurn))
    centerZ = .5 * (min(point.z for point in lastTurn) + max(point.z for point in lastTurn))
    xMin = sum(sheetPoints[row * 49].x for row in range(471, 601)) / 130
    xMax = sum(sheetPoints[row * 49 + 48].x for row in range(471, 601)) / 130
    axialSegments, around = (5, 24) if budget >= 376 else (4, 20)
    vertices, faces = [], []
    misses = 0
    for row in range(axialSegments + 1):
        # A small inset avoids missing individual ragged end fibres.  The cut
        # face below separately samples the evaluated end-bundle surface.
        x = xMin + .0007 + (xMax-xMin-.0014) * row / axialSegments
        for column in range(around):
            angle = math.tau * column / around
            direction = Vector((0, math.cos(angle), math.sin(angle)))
            origin = Vector((x, centerY, centerZ))
            hit = surface.ray_cast(origin + direction * .10, -direction, .15)[0]
            if hit is None:
                misses += 1
                near = surface.find_nearest(origin + direction * .034)
                if near[0] is None or near[3] > .020:
                    raise RuntimeError('Evaluated grass-roll surface cannot be sampled')
                hit = near[0]
            vertices.append(hit)
    for row in range(axialSegments):
        for column in range(around):
            nextColumn = (column + 1) % around
            a = row * around + column
            b = (row + 1) * around + column
            c = (row + 1) * around + nextColumn
            d = row * around + nextColumn
            faces.append((a, d, c, b))
    # A four-corner very narrow inner fissure retains the compressed core.
    # Every surrounding cap vertex is sampled along the real winding axis.
    # Normal/albedo baking supplies the many shallow flattened grass layers.
    for side, row in ((-1, 0), (1, axialSegments)):
        inner = []
        for index in range(4):
            angle = math.tau * (index + .5) / 4
            yz = Vector((0, centerY + .00090 * math.cos(angle),
                         centerZ + .00030 * math.sin(angle)))
            origin = Vector((xMin - .03 if side < 0 else xMax + .03, yz.y, yz.z))
            hit = surface.ray_cast(origin, Vector((-side, 0, 0)), .10)[0]
            x = hit.x if hit is not None else (xMin if side < 0 else xMax)
            inner.append(len(vertices))
            vertices.append(Vector((x, yz.y, yz.z)))
        for column in range(around):
            following = (column + 1) % around
            quadrant = min(3, column * 4 // around)
            nextQuadrant = min(3, (column + 1) * 4 // around) % 4
            # At the circular seam the next inner corner returns to zero.
            if column == around - 1:
                nextQuadrant = 0
            a, b = row * around + column, row * around + following
            tri = (a, b, inner[quadrant])
            faces.append(tri if side > 0 else tuple(reversed(tri)))
            if nextQuadrant != quadrant:
                tri = (b, inner[nextQuadrant], inner[quadrant])
                faces.append(tri if side > 0 else tuple(reversed(tri)))
    roll = Write('Pack_GameRolledGrassMatV10', vertices, faces, gamePart, 'Straw', names)
    # Do not synthesize tape cylinders: retain the evaluated wrapped strip and
    # four hanging tails, with the original high-grid boundaries and widths.
    tapeSource = Source(highPart, 'Pack_MatCottonRetainers')
    sourcePoints, _ = Snapshot(tapeSource, gamePart)
    if len(tapeSource.data.vertices) != 2 * (81 * 9 + 2 * 17 * 7):
        raise RuntimeError('V10 retaining-tape topology changed')
    tapeVertices, tapeFaces = [], []
    def Grid(offset, sourceRows, sourceColumns, rows, columns):
        first = len(tapeVertices)
        for row in range(rows + 1):
            sourceRow = round(row / rows * sourceRows)
            for column in range(columns + 1):
                sourceColumn = round(column / columns * sourceColumns)
                tapeVertices.append(sourcePoints[offset + sourceRow * (sourceColumns + 1) + sourceColumn])
        for row in range(rows):
            for column in range(columns):
                a = first + row * (columns + 1) + column
                tapeFaces.append((a, a + columns + 1, a + columns + 2, a + 1))
    for number in range(2):
        offset = number * (81 * 9 + 2 * 17 * 7)
        Grid(offset, 80, 8, 14 if budget >= 376 else 12, 1)
        offset += 81 * 9
        for tail in range(2):
            Grid(offset + tail * 17 * 7, 16, 6, 3, 1)
    tapes = Write('Pack_GameMatCottonRetainersV10', tapeVertices, tapeFaces,
                  gamePart, 'Binding', ('Pack_MatCottonRetainers',))
    total = TriangleCount(roll) + TriangleCount(tapes)
    if total > budget:
        raise RuntimeError('Mat triangle budget exceeded: %d > %d' % (total, budget))
    gamePart['LowMatV10Triangles'] = total
    return {'generator': generatorTag, 'objects': [roll.name, tapes.name],
            'triangles': total, 'budget': budget, 'sourceParts': sourceReports,
            'radialSampleFallbacks': misses, 'retainersFollowPartVisibility': True,
            'coreFissureOpen': True, 'highSourceModified': False}
