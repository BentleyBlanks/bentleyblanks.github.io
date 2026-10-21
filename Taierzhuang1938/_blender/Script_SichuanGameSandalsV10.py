"""Low game sandals sampled from the actual evaluated V10 shoes and twine.

Dense woven grass becomes baked surface detail.  Both original cupped soles,
four open lace routes per shoe, and the attached hanging-cord routes remain
geometry.  There are no scene mutations at import and no changes to high data.
"""
import math
import bisect
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


def AdaptiveClosedRoute(group, count):
    """Keep high-curve corners/rounded shoulders with a fixed station count."""
    points = group['centers']
    unique = len(points)-1 if (points[-1]-points[0]).length < 1e-7 else len(points)
    selected = {0, max(range(unique), key=lambda index: (points[index]-points[0]).length_squared)}
    def Worst():
        best = (-1.0, None)
        order = sorted(selected)
        for a, b in zip(order, order[1:]+order[:1]):
            edge = points[b]-points[a]
            indices = range(a+1, b) if b > a else [*range(a+1, unique), *range(0, b)]
            for index in indices:
                fraction = max(0, min(1, (points[index]-points[a]).dot(edge)/max(edge.length_squared, 1e-20)))
                error = (points[index]-(points[a]+fraction*edge)).length
                if error > best[0]:
                    best = (error, index)
        return best
    while len(selected) < count:
        error, index = Worst()
        if index is None:
            raise RuntimeError('Not enough distinct actual high rim points')
        selected.add(index)
    error = Worst()[0]
    return [index/(len(points)-1) for index in sorted(selected)], error


def AdaptiveSoleRows(foundation, count=7):
    """Preserve true toe/heel and cup profile at seven source-derived rows."""
    selected = {0, 60}
    protected = {28, 29}  # Keep the exact worn hole inside a single low cell.
    def Worst(includeProtected=False):
        best = (-1.0, None)
        order = sorted(selected)
        for a, b in zip(order, order[1:]):
            for row in range(a+1, b):
                if row in protected and not includeProtected:
                    continue
                fraction = (row-a)/(b-a)
                error = 0.0
                for layer in (0, 1):
                    for column in (0, 6, 12, 18):
                        offset = layer*61*19+column
                        actual = foundation[offset+row*19]
                        predicted = foundation[offset+a*19].lerp(foundation[offset+b*19], fraction)
                        error = max(error, (actual-predicted).length)
                if error > best[0]:
                    best = (error, row)
        return best
    while len(selected) < count:
        error, row = Worst()
        if row is None:
            raise RuntimeError('Insufficient original sole profile rows')
        selected.add(row)
    return sorted(selected), Worst(includeProtected=True)[0]


def SoleBoundaryRimParameter(sourceRow, columnFraction):
    """V9/V10 authored foundation perimeter -> the actual 70-guide rim route."""
    # The high uses 35 increasing-length right guides followed by 35
    # decreasing-length left guides, each with four Catmull-Rom samples.
    # The foundation uses the same length domain in sixty intervals. This
    # correspondence stays distinct around the tiny heel/toe crossing where
    # a global closest-point query can clamp several cup vertices to one tip.
    sideGuide = 34*sourceRow/60
    if sourceRow == 0:
        guide = 69+columnFraction
    elif sourceRow == 60:
        guide = 35-columnFraction
    elif columnFraction == 0:
        guide = 69-sideGuide
    elif columnFraction == 1:
        guide = sideGuide
    else:
        raise ValueError('Only source foundation perimeter samples map to the rim')
    return (guide/70) % 1


def RimRearShoulderPoint(vertices, parameters, progression):
    """Exact point on the four-sided low rim's shared longitudinal rear edge."""
    count = len(parameters)
    index = max(0, min(count-1, bisect.bisect_right(parameters, progression)-1))
    following = (index+1) % count
    end = parameters[following] if following else 1.0
    fraction = (progression-parameters[index])/(end-parameters[index])
    # Section corner two is -facing. It is shared by both rear shoulder
    # faces, so interpolation lies on the real low mesh irrespective of a
    # quad's later triangulation. Source t fixes the longitudinal position.
    return vertices[index*4+2].lerp(vertices[following*4+2], fraction)


def AddTube(vertices, faces, group, segments, normal, closed=False, rimProfile=False,
            sampleParameters=None, crossSectionSides=3):
    if crossSectionSides not in (3, 4):
        raise ValueError('Low braid sections must have three or four sides')
    first = len(vertices)
    ringCount = segments if closed else segments+1
    widths, depths = [], []
    for row in range(ringCount):
        t = sampleParameters[row] if sampleParameters is not None else row/segments
        center, offsets = SampleGroup(group, t)
        before = SampleGroup(group, (t-.012) % 1 if closed else max(0, t-.012))[0]
        after = SampleGroup(group, (t+.012) % 1 if closed else min(1, t+.012))[0]
        tangent = (after-before).normalized()
        facing = normal-tangent*normal.dot(tangent)
        if facing.length < .05:
            facing = tangent.cross(Vector((1, 0, 0)))
        facing.normalize()
        across = tangent.cross(facing).normalized()
        width = max(abs(offset.dot(across)) for offset in offsets)
        depth = max(abs(offset.dot(facing)) for offset in offsets)
        if rimProfile:
            # Preserve the whole real loose-plait envelope. Low triangular or
            # diamond sections are inscribed, so a modest allowance retains
            # the volume of the original loose grass braid between corners.
            width *= 1.10
            depth *= 1.10
        widths.append(width)
        depths.append(depth)
        for column in range(crossSectionSides):
            angle = math.tau*column/crossSectionSides
            vertices.append(center + across*(width*math.sin(angle)) + facing*(depth*math.cos(angle)))
    for row in range(segments):
        nextRow = (row+1) % ringCount
        for column in range(crossSectionSides):
            following = (column+1) % crossSectionSides
            # across = tangent x facing makes increasing section angle run
            # counterclockwise down the path.  Traverse the section before
            # advancing the path so the tube normals face OUT of the braid.
            faces.append((first+row*crossSectionSides+column, first+row*crossSectionSides+following,
                          first+nextRow*crossSectionSides+following, first+nextRow*crossSectionSides+column))
    # Tube ends are embedded in the soles/attachment, so no hidden cap faces.
    return {'widthRadiusM': [min(widths), max(widths)], 'depthRadiusM': [min(depths), max(depths)],
            'crossSectionSides': crossSectionSides}


def BuildLowSandals(highPart, gamePart, budget=820):
    if budget < 820:
        raise ValueError('Two cupped soles with real wear holes, four-sided plait rims, open laces and hanging twine require 820 triangles')
    for obj in list(gamePart.children_recursive):
        if obj.get(generatorTag):
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data.users == 0:
                bpy.data.meshes.remove(data)
    transform = (gamePart.matrix_world.inverted_safe() @ highPart.matrix_world).to_3x3()
    normal = (transform @ Vector((.226, -.974, 0))).normalized()
    rows = 6
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
        if rim['rings'] != 281:
            raise RuntimeError('The authored 70-guide, four-sample closed high rim is required')
        rimParameters, rimRouteError = AdaptiveClosedRoute(rim, 18)
        rimVertices, rimFaces = [], []
        rimRadii = AddTube(rimVertices, rimFaces, rim, 18, normal, closed=True, rimProfile=True,
                           sampleParameters=rimParameters, crossSectionSides=4)
        shoulderDistances = []
        sourceRows, soleProfileError = AdaptiveSoleRows(foundation, rows+1)
        laceGroups = [RingGroup(wovenPoints, laceRanges[index:index+3]) for index in range(0, 12, 3)]
        if [group['rings'] for group in laceGroups] != [41, 41, 33, 25]:
            raise RuntimeError('V10 cross/heel/instep route topology changed')
        excluded = set()
        for start, stop, sides in rims+laceRanges:
            excluded.update(range(start, stop))
        soleFaces = [face for face in wovenFaces if not any(index in excluded for index in face)]
        soleTree = BVHTree.FromPolygons(wovenPoints, soleFaces, all_triangles=False)
        def SourceRow(row):
            interval = min(rows-1, max(0, int(row)))
            fraction = row-interval
            return sourceRows[interval]*(1-fraction)+sourceRows[interval+1]*fraction
        def Foundation(layer, row, column):
            # Bilinear interpolation of the original evaluated cup, including
            # its asymmetric yaw, width, raised edge and curled toe profile.
            r = SourceRow(row)
            c = column/columns*18
            ri, ci = min(59, int(r)), min(17, int(c))
            rf, cf = r-ri, c-ci
            start = layer*61*19
            a = foundation[start+ri*19+ci].lerp(foundation[start+ri*19+ci+1], cf)
            b = foundation[start+(ri+1)*19+ci].lerp(foundation[start+(ri+1)*19+ci+1], cf)
            return a.lerp(b, rf)
        def SurfacePoint(layer, row, column):
            point = Foundation(layer, row, column)
            if layer == 1:
                if column in (0, columns) or row in (0, rows):
                    sourceT = SoleBoundaryRimParameter(SourceRow(row), column/columns)
                    shoulder = RimRearShoulderPoint(rimVertices, rimParameters, sourceT)
                    distance = (shoulder-point).length
                    if distance > .025:
                        raise RuntimeError('The actual four-sided rim rear shoulder cannot meet the source cup perimeter')
                    shoulderDistances.append(distance)
                    point = shoulder
                else:
                    hit = soleTree.ray_cast(point+normal*.020, -normal, .040)[0]
                    if hit is not None:
                        point = hit
            return point
        vertices, faces = [], []
        layerSize = (rows+1)*(columns+1)
        holeRow, holeColumn = 28, 7
        def LowRow(highRow):
            interval = max(0, min(rows-1, bisect.bisect_right(sourceRows, highRow)-1))
            return interval+(highRow-sourceRows[interval])/(sourceRows[interval+1]-sourceRows[interval])
        highLayerSize = 61*19
        actualHole = (holeRow*19+holeColumn, (holeRow+1)*19+holeColumn,
                      (holeRow+1)*19+holeColumn+1, holeRow*19+holeColumn+1)
        if any(set(face) == set(actualHole) or set(face) == {index+highLayerSize for index in actualHole} for face in baseFaces):
            raise RuntimeError('The selected worn hole is not open in the actual foundation source')
        holeCell = (int(LowRow(holeRow)), int(holeColumn/18*columns))
        holeLayers = {}
        toeRows = [row for row in reversed(range(rows)) if (row, 1) != holeCell]
        toeRefinements = {(1, toeRows[0], 1), (1, toeRows[1], 1), (0, toeRows[0], 1)}
        for layer in (0, 1):
            for row in range(rows+1):
                for column in range(columns+1):
                    vertices.append(SurfacePoint(layer, row, column))
        for layer in (0, 1):
            for row in range(rows):
                for column in range(columns):
                    a = layer*layerSize+row*(columns+1)+column
                    face = (a, a+columns+1, a+columns+2, a+1)
                    def AddFace(values):
                        faces.append(values if layer == 1 else tuple(reversed(values)))
                    if (row, column) == holeCell:
                        inner = []
                        for highRow, highColumn in ((holeRow, holeColumn), (holeRow+1, holeColumn),
                                                    (holeRow+1, holeColumn+1), (holeRow, holeColumn+1)):
                            inner.append(len(vertices))
                            vertices.append(SurfacePoint(layer, LowRow(highRow), highColumn/18*columns))
                        holeLayers[layer] = inner
                        for index in range(4):
                            following = (index+1) % 4
                            AddFace((face[index], face[following], inner[following], inner[index]))
                    elif (layer, row, column) in toeRefinements:
                        # Interior-only refinement adds no boundary T-junction.
                        center = len(vertices)
                        vertices.append(SurfacePoint(layer, row+2/3, column+1/3))
                        for values in ((face[0], face[1], center), (face[1], face[2], center),
                                       (face[2], face[0], center), (face[0], face[2], face[3])):
                            AddFace(values)
                    else:
                        AddFace(face)
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
        for index in range(4):
            following = (index+1) % 4
            faces.append((holeLayers[0][index], holeLayers[1][index],
                          holeLayers[1][following], holeLayers[0][following]))
        sole = Write('Pack_GameGrassSandal%02dSoleV10' % number, vertices, faces,
                     gamePart, (baseName, weaveName))
        objects.append(sole)
        laceVertices, laceFaces = [], []
        for group, segments in zip(laceGroups, (4, 4, 4, 4)):
            AddTube(laceVertices, laceFaces, group, segments, normal)
        laces = Write('Pack_GameGrassSandal%02dOpenLacesV10' % number,
                      laceVertices, laceFaces, gamePart, (weaveName,))
        objects.append(laces)
        rimObject = Write('Pack_GameGrassSandal%02dBraidedRimV10' % number,
                          rimVertices, rimFaces, gamePart, (weaveName,))
        rimObject['Construction'] = 'Open-centred closed grass-braid tube following the actual 281-ring high rim centre route'
        rimObject['SourceRimCenterlineRings'] = rim['rings']
        rimObject['RimStations'] = 18
        rimObject['RimSampling'] = 'Actual closed high-route maximum chord-error refinement'
        rimObject['RimRouteMaximumErrorM'] = rimRouteError
        rimObject['RimCrossSectionSides'] = 4
        rimObject['RimWidthRadiusM'] = rimRadii['widthRadiusM']
        rimObject['RimDepthRadiusM'] = rimRadii['depthRadiusM']
        rimObject['RealSourcePlaitEnvelopeScale'] = 1.10
        rimObject['ClosedRimLoop'] = True
        objects.append(rimObject)
        reports.append({'sandal': number, 'foundationEvaluatedVertices': len(foundation),
                        'sourceRimRings': rim['rings'], 'sourceLaceRings': [group['rings'] for group in laceGroups],
                        'soleTriangles': TriangleCount(sole), 'laceTriangles': TriangleCount(laces),
                        'raisedRimTriangles': TriangleCount(rimObject), 'rimRadii': rimRadii,
                        'realSourcePlaitEnvelopeScale': 1.10, 'realFoundationHoleCell': [holeRow, holeColumn],
                        'openWornHoleCount': 1, 'toeInteriorRefinements': 3,
                        'adaptiveRimParameters': rimParameters, 'rimRouteMaximumErrorM': rimRouteError,
                        'adaptiveSourceSoleRows': sourceRows, 'soleProfileMaximumErrorM': soleProfileError,
                        'wornHoleLowRowBounds': [LowRow(holeRow), LowRow(holeRow+1)],
                        'rimSampleStations': 18, 'rimOpenCentre': True,
                        'rimCrossSectionSides': 4,
                        'cupSampleGrid': [rows+1, columns+1], 'borderMeetsActualRimRearShoulder': True,
                        'cupPerimeterAttachment': 'Authored source row/column correspondence to the actual low four-section rear edge at the same rim parameter',
                        'cupPerimeterSourceOutlineGuides': 70,
                        'cupPerimeterUsesGlobalNearest': False,
                        'cupPerimeterShoulderDistancesM': [min(shoulderDistances), max(shoulderDistances)]})
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
            'smallCordKnotBaked': True, 'tubeNormalsOutward': True, 'highSourceModified': False}
