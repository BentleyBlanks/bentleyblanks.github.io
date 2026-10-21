"""Retopologise the evaluated V10 rolled sheet and its two cotton retainers.

No Blender operations run on import.  BuildLowMat reads the current high source
without modifying it.  Dense interlacing and compressed winding faces are bake
sources; the low shell is sampled from those actual surfaces, not a cylinder.
"""
import math
from numbers import Integral
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import tessellate_polygon


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


def EndCapGeometry(shellVertices, around):
    """Close the real shell outlines; winding/core relief is entirely baked."""
    vertices, faces, reports = [], [], []
    for sign, start in ((-1, 0), (1, len(shellVertices)-around)):
        contour = [point.copy() for point in shellVertices[start:start+around]]
        planeError = max(point.x for point in contour)-min(point.x for point in contour)
        if planeError > 1e-6:
            raise RuntimeError('The sampled mat endpoint is not a flat axial contour')
        first = len(vertices)
        vertices.extend(contour)
        indices = {tuple(point): index for index, point in enumerate(contour)}
        if len(indices) != around:
            raise RuntimeError('The real mat endpoint contains duplicate outline samples')
        triangles = tessellate_polygon([contour])
        if len(triangles) != around-2:
            raise RuntimeError('The real mat endpoint did not triangulate to n-2 faces')
        for triangle in triangles:
            # Blender 5.2 returns indices into the flattened input polygon;
            # older mathutils versions return the corresponding Vectors.
            # Resolve both forms against this actual outline, with no centre
            # vertex or inferred replacement circle.
            localFace = tuple(int(point) if isinstance(point, Integral) else indices[tuple(point)]
                              for point in triangle)
            if len(localFace) != 3 or any(index < 0 or index >= around for index in localFace):
                raise RuntimeError('Mat endpoint tessellation referenced a non-outline vertex')
            face = tuple(first+index for index in localFace)
            a, b, c = (vertices[index] for index in face)
            normal = (b-a).cross(c-a)
            if normal.length_squared < 1e-16:
                raise RuntimeError('The mat texture proxy contains a degenerate triangle')
            faces.append(face if normal.x*sign > 0 else tuple(reversed(face)))
        reports.append({'end': sign, 'outlineVertices': around, 'triangles': len(triangles),
                        'outlineMatchesShellEndpoint': True, 'maximumPlanarityErrorM': planeError,
                        'outwardAxis': [sign, 0, 0], 'internalSpiralTriangles': 0,
                        'construction': 'Flat texture proxy tessellated inside the actual 24-point low-shell endpoint; high cut grass, rolled sheet and inner tuck supply colour, normal and AO'})
    return vertices, faces, reports


def BuildLowMat(highPart, gamePart, budget=308):
    if budget < 308:
        raise ValueError('The sampled outer roll, two 24-point texture endcaps and cotton retainers require 308 triangles')
    # Sampling is in the unseated part frame.  Undo only this generator's
    # previous support adjustment before rebuilding, then reapply it once at
    # the end; otherwise a second rebuild cancels the intended six-mm seat.
    previousSeat = float(gamePart.get('SupportSeatOffsetM', 0.0))
    if previousSeat:
        gamePart.location.z -= previousSeat
        gamePart['SupportSeatOffsetM'] = 0.0
        bpy.context.view_layer.update()
    for obj in list(gamePart.children_recursive):
        if obj.get(generatorTag):
            mesh = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
    names = ('Pack_TrueRolledGrassSheet', 'Pack_InterlacedMatGrass',
             'Pack_CutGrassBundlesV10', 'Pack_InnerMatTuckV10')
    points, polygons = [], []
    outerNames = names[:2]
    sourceReports = []
    for name in names:
        obj = Source(highPart, name)
        vertices, faces = Snapshot(obj, gamePart)
        if name in outerNames:
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
    axialSegments, around = 4, 24
    vertices, faces = [], []
    misses = 0
    for row in range(axialSegments + 1):
        # A small inset avoids missing individual ragged end fibres. The two
        # texture endcaps reuse these exact endpoint contours without cracks.
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
                hit = near[0].copy()
                # Preserve an axial plane at either endpoint even when a
                # ragged high fibre requires nearest-surface fallback.
                if row in (0, axialSegments):
                    hit.x = x
            vertices.append(hit)
    for row in range(axialSegments):
        for column in range(around):
            nextColumn = (column + 1) % around
            a = row * around + column
            b = (row + 1) * around + column
            c = (row + 1) * around + nextColumn
            d = row * around + nextColumn
            faces.append((a, d, c, b))
    roll = Write('Pack_GameRolledGrassMatV10', vertices, faces, gamePart, 'Straw', outerNames)
    endVertices, endFaces, endReports = EndCapGeometry(vertices, around)
    ends = Write('Pack_GameRolledMatEndCapsV10', endVertices, endFaces, gamePart, 'Straw',
                 ('Pack_CutGrassBundlesV10', 'Pack_TrueRolledGrassSheet', 'Pack_InnerMatTuckV10'))
    for face in ends.data.polygons:
        face.use_smooth = False
    ends['Construction'] = 'Two flat 24-point real-shell texture proxies; internal winding and central recess are baked from the unchanged true high source'
    ends['EndCapOutlineVertices'] = around
    ends['EndCapTriangles'] = TriangleCount(ends)
    ends['InternalSpiralTriangles'] = 0
    ends['InternalWindingTextureOnly'] = True
    ends['OpenInterlayerGrooves'] = False
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
        Grid(offset, 80, 8, 12, 1)
        offset += 81 * 9
        for tail in range(2):
            Grid(offset + tail * 17 * 7, 16, 6, 3, 1)
    tapes = Write('Pack_GameMatCottonRetainersV10', tapeVertices, tapeFaces,
                  gamePart, 'Binding', ('Pack_MatCottonRetainers',))
    total = TriangleCount(roll) + TriangleCount(ends) + TriangleCount(tapes)
    if total > budget:
        raise RuntimeError('Mat triangle budget exceeded: %d > %d' % (total, budget))
    gamePart['LowMatV10Triangles'] = total
    gamePart.location.z += -.006
    gamePart['SupportSeatOffsetM'] = -.006
    return {'generator': generatorTag, 'objects': [roll.name, ends.name, tapes.name],
            'triangles': total, 'budget': budget, 'sourceParts': sourceReports,
            'radialSampleFallbacks': misses, 'retainersFollowPartVisibility': True,
            'axialSegments': axialSegments, 'circumferenceStations': around,
            'outerShellTriangles': TriangleCount(roll), 'endCapTriangles': TriangleCount(ends),
            'endCaps': endReports, 'solidEndCapTriangles': TriangleCount(ends),
            'internalSpiralTriangles': 0, 'internalWindingTextureOnly': True,
            'crossSectionAppearance': 'Actual high colour/normal/AO projection; no low internal coil geometry',
            'supportSeatOffsetM': -.006, 'coreFissureOpen': False,
            'coreFissureAppearance': 'Baked shadow and normal only', 'highSourceModified': False}
