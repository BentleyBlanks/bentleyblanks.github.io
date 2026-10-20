"""Physically compress the V9 grass roll without changing its outer weave.

ApplyStrawCompression(root) reshapes existing sheet/end-bundle vertices.  It
does not add a cap, paint dark crevices, alter materials, touch the sandals,
save the file, or run Blender.  The outermost full turn, its woven strips and
cotton retainers stay fixed.  Each cut-end bundle remains an individual thick
flattened straw section with a small irregular gap to its neighbours.

Only V9's known 601 x 49 sheet topology is accepted.  Baseline mesh datablocks
are kept inside the source file so calling this function again is idempotent.
Run the attached wear-fibre pass afterwards to reattach the few cut-end tufts.
Dimensions are metres.
"""

import math

import bpy
from mathutils import Vector
from mathutils.kdtree import KDTree


tau = math.tau
half = .202
centerY = -.067
centerZ = .1805
innerRadius = .0035
outerRadius = .0285
total = 4.65 * tau
endAngle = -math.pi * .5
phase = endAngle - total
sheetRows = 600
sheetColumns = 48
baselineTag = 'SichuanCompressionV10Baseline'


def SmoothStep(value):
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def Radial(point):
    return Vector((0, (point.y - centerY) / 1.245,
                   (point.z - centerZ) / 1.025)).normalized()


def Compression(x):
    return 1 - .030 * sum(math.exp(-((x - band) / .017) ** 2)
                          for band in (-.103, .089))


def OriginalRadius(x, angle, radius):
    common = (1 + .055 * math.sin(angle * 2 + .7)
              + .028 * math.sin(angle * 3 - 1)
              + .012 * math.sin(angle * 5 + x * 21))
    loose = .00045 * math.sin(angle * 1.4 + x * 13) * min(1, radius / .014)
    return radius * Compression(x) * common + loose


def OriginalPoint(x, t):
    angle = phase + t
    radius = OriginalRadius(x, angle, innerRadius + (outerRadius - innerRadius) * t / total)
    depth = max(0, min(1, (radius - innerRadius) / (outerRadius - innerRadius)))
    dy = .00075 * math.sin(depth * 5.7 + .3) * (1 - depth * .35)
    dz = .00065 * math.sin(depth * 7.1 + 1.0) * (1 - depth * .30)
    flatten = .60 + .40 * min(1, t / (tau * .65))
    return Vector((x, centerY + dy + radius * 1.245 * math.cos(angle),
                   centerZ + dz + radius * 1.025 * math.sin(angle) * flatten))


def InnerDisplacement(x, t):
    """Reduce winding-to-winding drift, with no motion on the outer full lap."""
    angle = phase + t
    nominal = innerRadius + (outerRadius - innerRadius) * t / total
    radius = OriginalRadius(x, angle, nominal)
    depth = max(0, min(1, (radius - innerRadius) / (outerRadius - innerRadius)))
    blend = SmoothStep((total - t - tau) / (.8 * tau))
    if blend <= 0:
        return Vector((0, 0, 0))
    # All layers share the last turn's broad distortion at the same angle.
    # V9 used sin(1.4 * angle), so adjacent laps slipped up to 0.9 mm apart.
    outerAngle = endAngle - ((endAngle - angle) % tau)
    periodicLoose = .00045 * math.sin(outerAngle * 1.4 + x * 13) * min(1, nominal / .014)
    oldLoose = .00045 * math.sin(angle * 1.4 + x * 13) * min(1, nominal / .014)
    # The inner folded tip is pushed a fraction inward, not filled by a disk.
    coreTuck = .00065 * math.exp(-(t / (.65 * tau)) ** 2)
    changeRadius = (periodicLoose - oldLoose) * .85 * blend - coreTuck
    oldDy = .00075 * math.sin(depth * 5.7 + .3) * (1 - depth * .35)
    oldDz = .00065 * math.sin(depth * 7.1 + 1.0) * (1 - depth * .30)
    sharedDy = .00075 * math.sin(6.0) * .65
    sharedDz = .00065 * math.sin(8.1) * .70
    changeY = (sharedDy - oldDy) * .72 * blend
    changeZ = (sharedDz - oldDz) * .72 * blend
    flatten = .60 + .40 * min(1, t / (tau * .65))
    return Vector((0, changeY + changeRadius * 1.245 * math.cos(angle),
                   changeZ + changeRadius * 1.025 * math.sin(angle) * flatten))


def BaselineMesh(obj):
    name = obj.get(baselineTag)
    if name:
        baseline = bpy.data.meshes.get(name)
        if baseline is None or len(baseline.vertices) != len(obj.data.vertices):
            raise RuntimeError('V10 baseline/topology mismatch: ' + obj.name)
        return baseline
    baseline = obj.data.copy()
    baseline.name = 'Geometry_V10Original_' + obj.name
    baseline.use_fake_user = True
    obj[baselineTag] = baseline.name
    return baseline


def EndLayouts(sign):
    """Mirror V9's edge segmentation, without rebuilding any object."""
    edge = [OriginalPoint(sign * (half + .00055), i / sheetRows * total)
            for i in range(sheetRows + 1)]
    lengths = [0.0]
    for a, b in zip(edge, edge[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    first = 0
    bundle = 0
    layouts = []
    while first < sheetRows:
        goal = lengths[first] + .0062 + .0043 * (.5 + .5 * math.sin(bundle * 2.371 + sign))
        last = first + 2
        while last < sheetRows and lengths[last] < goal:
            last += 1
        a = max(0, first - 1)
        b = min(sheetRows, last + 1)
        layouts.append((sign, bundle, a, b, max(5, b - a)))
        first = last
        bundle += 1
    return layouts, edge


def CutBundleRanges(mesh):
    # Only V9's flattened end sections have ten-sided end caps.  Outer weave
    # tubes have eight; the short split fibres have five.  Each bundle is a
    # contiguous row-major component, bounded by its two ten-sided caps.
    caps = [sorted(poly.vertices) for poly in mesh.polygons if len(poly.vertices) == 10]
    if len(caps) % 2:
        raise RuntimeError('Unpaired V9 cut-bundle end caps')
    result = []
    for first, last in zip(caps[::2], caps[1::2]):
        start = first[0]
        stop = last[-1] + 1
        if first != list(range(start, start + 10)) or last != list(range(stop - 10, stop)):
            raise RuntimeError('Unexpected V9 cut-bundle cap topology')
        if (stop - start) % 10:
            raise RuntimeError('Unexpected V9 cut-bundle row count')
        result.append((start, stop))
    return result


def NearestEdgeParameter(point, edge, tree):
    _, closest, _ = tree.find(point)
    bestDistance = float('inf')
    bestParameter = closest
    for index in range(max(0, closest - 2), min(sheetRows, closest + 2)):
        a, b = edge[index:index + 2]
        segment = b - a
        fraction = max(0, min(1, (point - a).dot(segment) / segment.length_squared))
        squared = (point - (a + fraction * segment)).length_squared
        if squared < bestDistance:
            bestDistance = squared
            bestParameter = index + fraction
    return bestParameter / sheetRows * total


def ApplyStrawCompression(root):
    sheet = bpy.data.objects.get('Pack_TrueRolledGrassSheet')
    weave = bpy.data.objects.get('Pack_InterlacedMatGrass')
    matRoot = bpy.data.objects.get('Pack_StrawMat')
    if not all((sheet, weave, matRoot)) or matRoot.parent != root:
        raise RuntimeError('This module requires the task-owned V9 straw assembly')
    if sheet.parent != matRoot or weave.parent != matRoot:
        raise RuntimeError('Unexpected straw mesh parents')
    sheetBase = BaselineMesh(sheet)
    weaveBase = BaselineMesh(weave)
    expected = (sheetRows + 1) * (sheetColumns + 1)
    if len(sheetBase.vertices) != expected:
        raise RuntimeError('This module accepts only the V9 601 x 49 rolled sheet')
    # Confirm the original analytic construction before relying on its rows.
    for row in (0, 97, 299, 487, 600):
        vertex = sheetBase.vertices[row * (sheetColumns + 1) + sheetColumns // 2].co
        if (vertex - OriginalPoint(0, row / sheetRows * total)).length > .000002:
            raise RuntimeError('V9 sheet coordinates were changed; inspect before compression')
    for row in range(sheetRows + 1):
        t = row / sheetRows * total
        for column in range(sheetColumns + 1):
            index = row * (sheetColumns + 1) + column
            x = -half + 2 * half * column / sheetColumns
            sheet.data.vertices[index].co = sheetBase.vertices[index].co + InnerDisplacement(x, t)
    thick = sheet.modifiers.get('GrassSheetThickness')
    if thick is None or thick.type != 'SOLIDIFY':
        raise RuntimeError('The original grass-sheet thickness modifier is required')
    # Preserve the outward surface (+2.325 mm).  The extra grass volume is
    # genuinely inward, between adjacent windings, so strips/tapes stay clear.
    thick.thickness = .00525
    thick.offset = 2 * .002325 / thick.thickness - 1
    leftLayouts, leftEdge = EndLayouts(-1)
    rightLayouts, rightEdge = EndLayouts(1)
    layouts = leftLayouts + rightLayouts
    ranges = CutBundleRanges(weaveBase)
    if len(layouts) != len(ranges):
        raise RuntimeError('Cut-bundle count does not match the V9 edge construction')
    for vertex, original in zip(weave.data.vertices, weaveBase.vertices):
        vertex.co = original.co
    bundleIndices = set()
    for (start, stop), (sign, bundle, a, b, steps) in zip(ranges, layouts):
        if stop - start != (steps + 1) * 10:
            raise RuntimeError('V9 cut-bundle segmentation changed')
        bundleIndices.update(range(start, stop))
        for row in range(steps + 1):
            fraction = row / steps
            vertexStart = start + row * 10
            points = [weaveBase.vertices[vertexStart + j].co for j in range(10)]
            center = sum(points, Vector()) / 10
            radial = Radial(center)
            t = (a + (b - a) * fraction) / sheetRows * total
            movedCenter = center + InnerDisplacement(sign * (half + .00055), t)
            oldTip = .67 + .33 * math.sin(math.pi * fraction) ** .45
            # Unequal tips retain a hand-cut silhouette, but no longer pinch
            # to skinny wedges exposing the large black gaps seen in V9.
            tipFloor = .855 + .025 * math.sin(bundle * 1.73 + sign)
            newTip = tipFloor + (1 - tipFloor) * math.sin(math.pi * fraction) ** .45
            radialScale = (3.95 / 3.70) * newTip / oldTip
            for j, original in enumerate(points):
                relative = original - center
                expanded = relative + radial * (relative.dot(radial) * (radialScale - 1))
                weave.data.vertices[vertexStart + j].co = movedCenter + expanded
    # Keep the original split fibres physically attached to their rolled
    # layer.  This does not move any external woven strand: its nearest lap
    # is the untouched outermost turn, where InnerDisplacement is zero.
    trees = {}
    for sign, edge in ((-1, leftEdge), (1, rightEdge)):
        tree = KDTree(len(edge))
        for index, point in enumerate(edge):
            tree.insert(point, index)
        tree.balance()
        trees[sign] = (edge, tree)
    movedSplitVertices = 0
    for vertex in weaveBase.vertices:
        if vertex.index in bundleIndices or abs(vertex.co.x) < half - .003:
            continue
        sign = -1 if vertex.co.x < 0 else 1
        edge, tree = trees[sign]
        t = NearestEdgeParameter(vertex.co, edge, tree)
        displacement = InnerDisplacement(sign * (half + .00055), t)
        if displacement.length > 1e-10:
            weave.data.vertices[vertex.index].co = vertex.co + displacement
            movedSplitVertices += 1
    sheet.data.update()
    weave.data.update()
    matRoot['ConstructionV10'] = ('Compressed real sheet and flattened end bundles; '
                                 'outer full turn, weave and tapes retained; no end cap')
    report = {'stage': 'V10PhysicalStrawCompression', 'sheetThicknessM': thick.thickness,
              'outwardSheetSurfaceM': .002325, 'cutBundles': len(ranges),
              'movedSplitVertices': movedSplitVertices, 'outermostTurnMoved': False,
              'sandalsChanged': False, 'materialsChanged': False}
    matRoot['StrawCompressionV10Report'] = str(report)
    return report
