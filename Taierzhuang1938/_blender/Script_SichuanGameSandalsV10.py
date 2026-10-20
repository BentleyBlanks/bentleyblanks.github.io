"""Low game sandals sampled from the actual evaluated V10 shoes and twine.

Dense woven grass becomes baked surface detail.  Both original cupped soles,
four open lace routes per shoe, and the attached hanging-cord routes remain
geometry.  There are no scene mutations at import and no changes to high data.
"""
import math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generatorTag = 'SichuanGameSandalsV10'


def SourceName(obj):
    return obj.get('PackSourceName', obj.name)


def Source(highPart, name):
    matches = [obj for obj in highPart.children_recursive
               if SourceName(obj) == name and obj.type == 'MESH']
    if len(matches) != 1:
        raise RuntimeError('Expected one evaluated high sandal source: ' + name)
    return matches[0]


def Snapshot(obj, gamePart):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        transform = gamePart.matrix_world.inverted_safe() @ evaluated.matrix_world
        return ([transform @ vertex.co for vertex in mesh.vertices],
                [tuple(face.vertices) for face in mesh.polygons])
    finally:
        evaluated.to_mesh_clear()


def Material():
    name = 'Material_GameV10_Straw'
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        material.diffuse_color = (.30, .25, .16, 1)
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = material.diffuse_color
        shader.inputs['Roughness'].default_value = .92
        shader.inputs['Metallic'].default_value = 0
    material['AtlasRegion'] = 'straw'
    return material


def Write(name, vertices, faces, parent, sources):
    mesh = bpy.data.meshes.new('Geometry_' + name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(Material())
    mesh.update()
    for face in mesh.polygons:
        face.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = parent
    obj[generatorTag] = True
    obj['BakeSourceNames'] = ','.join(sources)
    obj['Construction'] = 'Current evaluated V10 cup and tube-ring samples'
    return obj


def TriangleCount(obj):
    return sum(len(face.vertices) - 2 for face in obj.data.polygons)


def CappedTubeRanges(points, faces, sides):
    caps = [sorted(face) for face in faces if len(face) == sides]
    if len(caps) % 2:
        raise RuntimeError('Unpaired source tube caps')
    result = []
    for first, last in zip(caps[::2], caps[1::2]):
        start, stop = first[0], last[-1] + 1
        if first != list(range(start, start+sides)) or last != list(range(stop-sides, stop)):
            raise RuntimeError('Source tube cap indices changed')
        if (stop-start) % sides:
            raise RuntimeError('Source tube ring layout changed')
        result.append((start, stop, sides))
    return result


def Components(points, faces, sides):
    parent = list(range(len(points)))
    def Find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index
    used = set()
    for face in faces:
        anchor = Find(face[0])
        for index in face:
            used.add(index)
            target = Find(index)
            if target != anchor:
                parent[target] = anchor
    groups = {}
    for index in sorted(used):
        groups.setdefault(Find(index), []).append(index)
    result = []
    for indices in sorted(groups.values(), key=lambda item: item[0]):
        if indices[-1] - indices[0] + 1 != len(indices) or len(indices) % sides:
            raise RuntimeError('Hanging-twine component is no longer contiguous rings')
        result.append((indices[0], indices[-1]+1, sides))
    return result


def RingGroup(points, triplet):
    counts = [(stop-start)//sides for start, stop, sides in triplet]
    if len(triplet) != 3 or len(set(counts)) != 1:
        raise RuntimeError('A braided route must have three corresponding strands')
    centers, sections = [], []
    for ring in range(counts[0]):
        section = []
        for start, stop, sides in triplet:
            section.extend(points[start+ring*sides:start+(ring+1)*sides])
        centers.append(sum(section, Vector()) / len(section))
        sections.append(section)
    return {'centers': centers, 'sections': sections, 'rings': counts[0]}


def SampleGroup(group, progression):
    position = max(0, min(1, progression)) * (len(group['centers'])-1)
    low = min(len(group['centers'])-2, int(position))
    fraction = position-low
    center = group['centers'][low].lerp(group['centers'][low+1], fraction)
    # An actual section of all three strands supplies the braid envelope.
    # Its fine alternating over/under relief belongs in the normal bake.
    section = group['sections'][min(len(group['sections'])-1, round(position))]
    sectionCenter = group['centers'][min(len(group['centers'])-1, round(position))]
    return center, [point-sectionCenter for point in section]


def AddTube(vertices, faces, group, segments, normal, closed=False):
    first = len(vertices)
    ringCount = segments if closed else segments+1
    for row in range(ringCount):
        t = row/segments
        center, offsets = SampleGroup(group, t)
        before = SampleGroup(group, max(0, t-.012))[0]
        after = SampleGroup(group, min(1, t+.012))[0]
        tangent = (after-before).normalized()
        facing = normal-tangent*normal.dot(tangent)
        if facing.length < .05:
            facing = tangent.cross(Vector((1, 0, 0)))
        facing.normalize()
        across = tangent.cross(facing).normalized()
        width = max(abs(offset.dot(across)) for offset in offsets)
        depth = max(abs(offset.dot(facing)) for offset in offsets)
        for column in range(3):
            angle = math.tau*column/3
            vertices.append(center + across*(width*math.sin(angle)) + facing*(depth*math.cos(angle)))
    for row in range(segments):
        nextRow = (row+1) % ringCount
        for column in range(3):
            following = (column+1) % 3
            faces.append((first+row*3+column, first+nextRow*3+column,
                          first+nextRow*3+following, first+row*3+following))
    # Tube ends are embedded in the soles/attachment, so no hidden cap faces.


def BuildLowSandals(highPart, gamePart, budget=650):
    if budget < 584:
        raise ValueError('Two V10 cupped soles, open laces and hanging twine require at least 584 triangles')
    for obj in list(gamePart.children_recursive):
        if obj.get(generatorTag):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data.users == 0:
                bpy.data.meshes.remove(data)
    transform = (gamePart.matrix_world.inverted_safe() @ highPart.matrix_world).to_3x3()
    normal = (transform @ Vector((.226, -.974, 0))).normalized()
    rows = 9 if budget >= 648 else (8 if budget >= 616 else 7)
    columns = 3
    objects, reports = [], []
    for number in (1, 2):
        baseName = 'Pack_GrassSandal%02dFoundation' % number
        weaveName = 'Pack_GrassSandal%02dBraidedWeave' % number
        base = Source(highPart, baseName)
        woven = Source(highPart, weaveName)
        foundation, baseFaces = Snapshot(base, gamePart)
        wovenPoints, wovenFaces = Snapshot(woven, gamePart)
        if len(base.data.vertices) != 2 * 61 * 19:
            raise RuntimeError('The current V10 cupped foundation grid is required')
        tubeRanges = CappedTubeRanges(wovenPoints, wovenFaces, 8)
        rims = [item for item in tubeRanges if (item[1]-item[0])//item[2] > 150]
        laceRanges = [item for item in tubeRanges if 24 <= (item[1]-item[0])//item[2] <= 60]
        if len(rims) != 3 or len(laceRanges) != 12:
            raise RuntimeError('Expected the current three-strand rim and four open lace routes')
        rim = RingGroup(wovenPoints, rims)
        laceGroups = [RingGroup(wovenPoints, laceRanges[index:index+3]) for index in range(0, 12, 3)]
        if [group['rings'] for group in laceGroups] != [41, 41, 33, 25]:
            raise RuntimeError('V10 cross/heel/instep route topology changed')
        excluded = set()
        for start, stop, sides in rims+laceRanges:
            excluded.update(range(start, stop))
        soleFaces = [face for face in wovenFaces if not any(index in excluded for index in face)]
        soleTree = BVHTree.FromPolygons(wovenPoints, soleFaces, all_triangles=False)
        def Foundation(layer, row, column):
            # Bilinear interpolation of the original evaluated cup, including
            # its asymmetric yaw, width, raised edge and curled toe profile.
            r = row/rows*60
            c = column/columns*18
            ri, ci = min(59, int(r)), min(17, int(c))
            rf, cf = r-ri, c-ci
            start = layer*61*19
            a = foundation[start+ri*19+ci].lerp(foundation[start+ri*19+ci+1], cf)
            b = foundation[start+(ri+1)*19+ci].lerp(foundation[start+(ri+1)*19+ci+1], cf)
            return a.lerp(b, rf)
        vertices, faces = [], []
        layerSize = (rows+1)*(columns+1)
        for layer in (0, 1):
            for row in range(rows+1):
                for column in range(columns+1):
                    point = Foundation(layer, row, column)
                    if layer == 1:
                        if column in (0, columns):
                            rimPoint = min(rim['centers'], key=lambda candidate: (candidate-point).length_squared)
                            # Retain the actual curled rim path, but seat its
                            # upper edge slightly lower for the requested
                            # thinner worn shoe border.  This changes no high.
                            point = point.lerp(rimPoint, .72) + normal*.0008
                        else:
                            hit = soleTree.ray_cast(point+normal*.020, -normal, .040)[0]
                            if hit is not None:
                                point = hit
                    vertices.append(point)
            for row in range(rows):
                for column in range(columns):
                    a = layer*layerSize+row*(columns+1)+column
                    face = (a, a+columns+1, a+columns+2, a+1)
                    faces.append(face if layer == 1 else tuple(reversed(face)))
        for row in range(rows):
            for column in (0, columns):
                a = row*(columns+1)+column
                b = a+columns+1
                face = (a, b, b+layerSize, a+layerSize)
                faces.append(face if column == 0 else tuple(reversed(face)))
        for row in (0, rows):
            for column in range(columns):
                a = row*(columns+1)+column
                b = a+1
                face = (a, b, b+layerSize, a+layerSize)
                faces.append(tuple(reversed(face)) if row == 0 else face)
        sole = Write('Pack_GameGrassSandal%02dSoleV10' % number, vertices, faces,
                     gamePart, (baseName, weaveName))
        objects.append(sole)
        laceVertices, laceFaces = [], []
        for group, segments in zip(laceGroups, (6, 6, 6, 4)):
            AddTube(laceVertices, laceFaces, group, segments, normal)
        laces = Write('Pack_GameGrassSandal%02dOpenLacesV10' % number,
                      laceVertices, laceFaces, gamePart, (weaveName,))
        objects.append(laces)
        reports.append({'sandal': number, 'foundationEvaluatedVertices': len(foundation),
                        'sourceRimRings': rim['rings'], 'sourceLaceRings': [group['rings'] for group in laceGroups],
                        'soleTriangles': TriangleCount(sole), 'laceTriangles': TriangleCount(laces),
                        'cupSampleGrid': [rows+1, columns+1], 'borderSeatedToHighRimFraction': .72})
    cordName = 'Pack_ThinSandalHangingTwine'
    sourceCord = Source(highPart, cordName)
    cordPoints, cordFaces = Snapshot(sourceCord, gamePart)
    cordComponents = Components(cordPoints, cordFaces, 6)
    if len(cordComponents) != 12:
        raise RuntimeError('Expected loop, tiny knot, and two three-strand hanging routes')
    groups = [RingGroup(cordPoints, cordComponents[index:index+3]) for index in range(0, 12, 3)]
    cordVertices, lowCordFaces = [], []
    AddTube(cordVertices, lowCordFaces, groups[0], 4, normal, closed=True)
    for group in groups[2:]:
        AddTube(cordVertices, lowCordFaces, group, 4, normal)
    cord = Write('Pack_GameThinSandalTwineV10', cordVertices, lowCordFaces,
                 gamePart, (cordName,))
    objects.append(cord)
    total = sum(TriangleCount(obj) for obj in objects)
    if total > budget:
        raise RuntimeError('Sandal budget exceeded: %d > %d' % (total, budget))
    gamePart['LowSandalsV10Triangles'] = total
    return {'generator': generatorTag, 'objects': [obj.name for obj in objects],
            'triangles': total, 'budget': budget, 'sandals': reports,
            'hangingCordTriangles': TriangleCount(cord), 'shoeCount': 2,
            'smallCordKnotBaked': True, 'highSourceModified': False}
