"""Export-only continuous tube charts for native InterlacedMatGrass.

No import-time operations. BuildInterlacedTubeUv changes only a separate target
UV layer. The authored source UV and native geometry stay byte-for-byte intact.
Each disconnected native tube receives one continuous side strip and two real
planar end charts, packed into an explicitly reserved pixel window.
"""
import array
import hashlib
import math

import bpy
from mathutils import Vector


generator = 'SichuanQualityTubeUvV12'
supportedSource = 'Pack_InterlacedMatGrass'
sourceUOrigin = .52
sourceUPeriod = .46


def UvRaw(layer):
    values = array.array('f', [0.0])*(len(layer.data)*2)
    layer.data.foreach_get('uv', values)
    return values


def GeometryHash(mesh):
    digest = hashlib.sha256()
    values = array.array('f', [0.0])*(len(mesh.vertices)*3)
    mesh.vertices.foreach_get('co', values)
    digest.update(values.tobytes())
    indices = array.array('i', [0])*len(mesh.loops)
    mesh.loops.foreach_get('vertex_index', indices)
    digest.update(indices.tobytes())
    for name in ('loop_start', 'loop_total', 'material_index'):
        indices = array.array('i', [0])*len(mesh.polygons)
        mesh.polygons.foreach_get(name, indices)
        digest.update(indices.tobytes())
    return digest.hexdigest()


def Components(mesh):
    parent = list(range(len(mesh.vertices)))
    def Find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index
    for face in mesh.polygons:
        indices = list(face.vertices)
        anchor = Find(indices[0])
        for index in indices[1:]:
            other = Find(index)
            if other != anchor:
                parent[other] = anchor
    groups = {}
    for face in mesh.polygons:
        key = Find(face.vertices[0])
        group = groups.setdefault(key, {'faces': [], 'vertices': set()})
        group['faces'].append(face.index)
        group['vertices'].update(face.vertices)
    return sorted(groups.values(), key=lambda group: min(group['vertices']))


def PackRectangles(charts, width, height, padding, scale):
    rectangles = []
    for index, chart in enumerate(charts):
        minimum = 8 if chart['kind'] != 'Side' else 4
        w = max(minimum, math.ceil(chart['physicalWidthM']*scale))
        h = max(minimum, math.ceil(chart['physicalHeightM']*scale))
        rectangles.append((index, w+2*padding, h+2*padding, w, h))
    rectangles.sort(key=lambda row: (-max(row[1], row[2]), -row[1]*row[2], row[0]))
    free, placed = [(0, 0, width, height)], {}
    for index, w, h, contentW, contentH in rectangles:
        best = None
        for fi, (x, y, fw, fh) in enumerate(free):
            for rw, rh, rotated in ((w, h, False), (h, w, True)):
                if rw <= fw and rh <= fh:
                    score = (min(fw-rw, fh-rh), max(fw-rw, fh-rh), y, x, int(rotated))
                    if best is None or score < best[0]:
                        best = (score, x, y, rw, rh, rotated)
        if best is None:
            return None
        _, x, y, rw, rh, rotated = best
        placed[index] = {'outer': [x, y, rw, rh], 'rotated': rotated,
                         'content': [x+padding, y+padding,
                                     contentH if rotated else contentW,
                                     contentW if rotated else contentH]}
        split = []
        for fx, fy, fw, fh in free:
            if x >= fx+fw or x+rw <= fx or y >= fy+fh or y+rh <= fy:
                split.append((fx, fy, fw, fh))
                continue
            if x > fx:
                split.append((fx, fy, x-fx, fh))
            if x+rw < fx+fw:
                split.append((x+rw, fy, fx+fw-x-rw, fh))
            if y > fy:
                split.append((fx, fy, fw, y-fy))
            if y+rh < fy+fh:
                split.append((fx, y+rh, fw, fy+fh-y-rh))
        unique = list(dict.fromkeys(rect for rect in split if rect[2] > 0 and rect[3] > 0))
        free = [rect for i, rect in enumerate(unique)
                if not any(i != j and rect[0] >= other[0] and rect[1] >= other[1]
                           and rect[0]+rect[2] <= other[0]+other[2]
                           and rect[1]+rect[3] <= other[1]+other[3]
                           for j, other in enumerate(unique))]
    return placed


def PackCharts(charts, width, height, padding):
    area = sum(chart['physicalWidthM']*chart['physicalHeightM'] for chart in charts)
    if area <= 0:
        raise RuntimeError('The actual tube charts have no physical area')
    low, high = 0.0, math.sqrt(width*height/area)
    best = PackRectangles(charts, width, height, padding, 0)
    if best is None:
        raise RuntimeError('The reserved window cannot fit the minimum tube chart pixels and padding')
    for iteration in range(12):
        trial = .5*(low+high)
        packed = PackRectangles(charts, width, height, padding, trial)
        if packed is None:
            high = trial
        else:
            low, best = trial, packed
    return best, low


def PixelCovered(points):
    low = math.ceil(min(point[1] for point in points)-.5)
    high = math.floor(max(point[1] for point in points)-.5)
    edges = list(zip(points, points[1:]+points[:1]))
    for row in range(low, high+1):
        y, cuts = row+.5, []
        for a, b in edges:
            if abs(b[1]-a[1]) < 1e-12:
                continue
            fraction = (y-a[1])/(b[1]-a[1])
            if 0 <= fraction <= 1:
                cuts.append(a[0]+fraction*(b[0]-a[0]))
        if len(cuts) >= 2:
            left, right = min(cuts), max(cuts)
            column = math.ceil(left-.5+1e-6)
            if column+.5 < right-1e-6:
                return True
    return False


def BuildInterlacedTubeUv(obj, targetUV='QualityUV', resolution=4096,
                          windowPixels=None, paddingPixels=4, sourceUV=None):
    sourceObject = obj.get('QualityExportOriginalName', obj.get('QualityTubeUvSourceObject', obj.name))
    if obj.type != 'MESH' or sourceObject != supportedSource:
        raise RuntimeError('This helper supports only the actual native Pack_InterlacedMatGrass')
    mesh = obj.data
    targetName = targetUV if isinstance(targetUV, str) else targetUV.name
    sourceName = sourceUV if isinstance(sourceUV, str) else sourceUV.name if sourceUV is not None else None
    if sourceName is None:
        preferred = obj.get('QualitySourceUvName', '')
        sourceName = preferred if preferred and preferred != targetName else next(
            (layer.name for layer in mesh.uv_layers if layer.name != targetName), None)
    if sourceName is None or sourceName == targetName or mesh.uv_layers.get(sourceName) is None:
        raise RuntimeError('Pass a distinct preserved authored source UV layer')
    # Copy every source float before allocating a target: Blender 5.2 CustomData
    # allocation can invalidate an earlier RNA UV-layer wrapper.
    sourceRaw = UvRaw(mesh.uv_layers[sourceName])
    sourceHash = hashlib.sha256(sourceRaw.tobytes()).hexdigest()
    geometryBefore = GeometryHash(mesh)
    width, height = (int(resolution), int(resolution)) if isinstance(resolution, int) else tuple(map(int, resolution))
    window = [0, 0, width, height] if windowPixels is None else list(map(int, windowPixels))
    if len(window) != 4 or min(window[2:]) <= 0 or min(window[:2]) < 0 or window[0]+window[2] > width or window[1]+window[3] > height:
        raise ValueError('windowPixels must be an in-image [x, y, width, height] rectangle')
    padding = int(paddingPixels)
    if padding < 0:
        raise ValueError('Tube chart padding cannot be negative')
    groups = Components(mesh)
    localUvs = array.array('f', [0.0])*(len(mesh.loops)*2)
    loopCharts = array.array('i', [-1])*len(mesh.loops)
    charts, componentReports = [], []
    transform = obj.matrix_world
    for ci, group in enumerate(groups):
        indices = sorted(group['vertices'])
        first, stop = indices[0], indices[-1]+1
        if stop-first != len(indices):
            raise RuntimeError('An actual tube component is not sequential source rings')
        vertexUv = {}
        for fi in group['faces']:
            for li in mesh.polygons[fi].loop_indices:
                vi = mesh.loops[li].vertex_index
                value = (sourceRaw[li*2], sourceRaw[li*2+1])
                previous = vertexUv.setdefault(vi, value)
                if max(abs(a-b) for a, b in zip(previous, value)) > 1e-6:
                    raise RuntimeError('The authored tube UV has unexpected per-vertex discontinuities')
        levels = sorted({round(value[0], 6) for value in vertexUv.values()})
        sides = len(levels)
        if sides not in (4, 8) or len(indices) % sides:
            raise RuntimeError('Expected native eight-sided weave tubes or original four-sided short end fibres')
        if any(abs(value-(sourceUOrigin+sourceUPeriod*j/sides)) > 2e-6 for j, value in enumerate(levels)):
            raise RuntimeError('The actual tube source U grid does not match StrawMesh.Tube/Write')
        rings = len(indices)//sides
        if rings < 2:
            raise RuntimeError('A native tube must retain at least two source rings')
        ringVs = [vertexUv[first+row*sides][1] for row in range(rings)]
        if any(b <= a for a, b in zip(ringVs, ringVs[1:])):
            raise RuntimeError('The native tube source arc coordinate is not strictly increasing')
        lowV, highV = ringVs[0], ringVs[-1]
        world = {index: transform @ mesh.vertices[index].co for index in indices}
        centers = [sum((world[first+row*sides+j] for j in range(sides)), Vector())/sides
                   for row in range(rings)]
        length = sum((b-a).length for a, b in zip(centers, centers[1:]))
        sideFaces, endFaces = [], {0: [], 1: []}
        area = 0.0
        for fi in group['faces']:
            face = mesh.polygons[fi]
            vs = [sourceRaw[li*2+1] for li in face.loop_indices]
            if max(vs)-min(vs) < 1e-7:
                end = 0 if abs(vs[0]-lowV) <= abs(vs[0]-highV) else 1
                if abs(vs[0]-(lowV if end == 0 else highV)) > 1e-6:
                    raise RuntimeError('A constant-V source face is not at an actual tube end')
                endFaces[end].append(fi)
            else:
                sideFaces.append(fi)
                polygon = [world[index] for index in face.vertices]
                area += sum(.5*(polygon[j]-polygon[0]).cross(polygon[j+1]-polygon[0]).length
                            for j in range(1, len(polygon)-1))
        if not sideFaces or not all(endFaces.values()) or length <= 1e-9 or area <= 1e-12:
            raise RuntimeError('A native tube lacks its actual sides or paired end caps')
        def Chart(kind, physicalWidth, physicalHeight, faceIds, values):
            chartIndex = len(charts)
            charts.append({'component': ci, 'kind': kind, 'physicalWidthM': physicalWidth,
                           'physicalHeightM': physicalHeight, 'faceCount': len(faceIds)})
            for fi in faceIds:
                for li in mesh.polygons[fi].loop_indices:
                    u, v = values(fi, li)
                    if not math.isfinite(u+v) or min(u, v) < -1e-5 or max(u, v) > 1+1e-5:
                        raise RuntimeError('A continuous tube chart escaped its local rectangle')
                    localUvs[li*2], localUvs[li*2+1] = max(0, min(1, u)), max(0, min(1, v))
                    loopCharts[li] = chartIndex
        seamFaces = set()
        for fi in sideFaces:
            us = [sourceRaw[li*2] for li in mesh.polygons[fi].loop_indices]
            if max(us)-min(us) > .23:
                seamFaces.add(fi)
        def SideUv(fi, li):
            u = sourceRaw[li*2]
            if fi in seamFaces and u < sourceUOrigin+sourceUPeriod*.5:
                u += sourceUPeriod
            return ((u-sourceUOrigin)/sourceUPeriod, (sourceRaw[li*2+1]-lowV)/(highV-lowV))
        Chart('Side', area/length, length, sideFaces, SideUv)
        for end, faceIds in endFaces.items():
            ringStart = first+(0 if end == 0 else rings-1)*sides
            ring = [world[ringStart+j] for j in range(sides)]
            center = sum(ring, Vector())/sides
            normal = sum(((point-center).cross(ring[(j+1)%sides]-center)
                          for j, point in enumerate(ring)), Vector())
            if normal.length < 1e-12:
                raise RuntimeError('The actual native tube end has no usable plane')
            normal.normalize()
            a, b = max(((a, b) for a in ring for b in ring), key=lambda pair: (pair[1]-pair[0]).length_squared)
            axisU = (b-a).normalized()
            axisV = normal.cross(axisU).normalized()
            projected = {index: ((world[index]-center).dot(axisU), (world[index]-center).dot(axisV))
                         for index in range(ringStart, ringStart+sides)}
            x0, x1 = min(p[0] for p in projected.values()), max(p[0] for p in projected.values())
            y0, y1 = min(p[1] for p in projected.values()), max(p[1] for p in projected.values())
            if min(x1-x0, y1-y0) <= 1e-9:
                raise RuntimeError('The actual cap projection collapsed an axis')
            def EndUv(fi, li):
                x, y = projected[mesh.loops[li].vertex_index]
                return ((x-x0)/(x1-x0), (y-y0)/(y1-y0))
            Chart('StartCap' if end == 0 else 'EndCap', x1-x0, y1-y0, faceIds, EndUv)
        componentReports.append({'component': ci, 'sourceVertexRange': [first, stop], 'sectionSides': sides,
                                 'rings': rings, 'sourceFaceCount': len(group['faces']),
                                 'sideFaceCount': len(sideFaces), 'endFaceCounts': [len(endFaces[0]), len(endFaces[1])],
                                 'sourceArcVRange': [lowV, highV], 'actualCenterlineLengthM': length,
                                 'actualSideAreaM2': area, 'repairedSeamFaceCount': len(seamFaces)})
    if any(index < 0 for index in loopCharts):
        raise RuntimeError('The tube-chart builder left a real native face unmapped')
    placements, scale = PackCharts(charts, window[2], window[3], padding)
    targetRaw = array.array('f', [0.0])*len(sourceRaw)
    for li, chartIndex in enumerate(loopCharts):
        row = placements[chartIndex]
        x, y, w, h = row['content']
        u, v = localUvs[li*2], localUvs[li*2+1]
        if row['rotated']:
            u, v = v, 1-u
        targetRaw[li*2] = (window[0]+x+u*w)/width
        targetRaw[li*2+1] = (window[1]+y+v*h)/height
    target = mesh.uv_layers.get(targetName) or mesh.uv_layers.new(name=targetName, do_init=False)
    target.data.foreach_set('uv', targetRaw)
    mesh.calc_loop_triangles()
    stats = {'triangles': len(mesh.loop_triangles), 'sourceZeroAreaTriangles': 0,
             'targetZeroAreaTriangles': 0, 'nonfiniteTriangles': 0, 'pixelCentreMisses': 0,
             'minimumTriangleAreaPixels2': float('inf'), 'summedTriangleAreaPixels2': 0.0,
             'missExamples': [], 'missesByChartKind': {}}
    for triangle in mesh.loop_triangles:
        loops = triangle.loops
        before = [(sourceRaw[index*2], sourceRaw[index*2+1]) for index in loops]
        after = [(targetRaw[index*2]*width, targetRaw[index*2+1]*height) for index in loops]
        def Area(values):
            a, b, c = values
            return .5*abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
        if Area(before) <= 1e-15:
            stats['sourceZeroAreaTriangles'] += 1
        area = Area(after)
        stats['minimumTriangleAreaPixels2'] = min(stats['minimumTriangleAreaPixels2'], area)
        stats['summedTriangleAreaPixels2'] += area
        if area <= 1e-12:
            stats['targetZeroAreaTriangles'] += 1
        if not all(math.isfinite(value) for point in after for value in point):
            stats['nonfiniteTriangles'] += 1
        elif not PixelCovered(after):
            stats['pixelCentreMisses'] += 1
            chart = charts[loopCharts[loops[0]]]
            kind = chart['kind']
            stats['missesByChartKind'][kind] = stats['missesByChartKind'].get(kind, 0)+1
            if len(stats['missExamples']) < 24:
                stats['missExamples'].append({'polygon': triangle.polygon_index,
                                               'component': chart['component'], 'kind': kind,
                                               'areaPixels2': area})
    freshSource = hashlib.sha256(UvRaw(mesh.uv_layers[sourceName]).tobytes()).hexdigest()
    geometryAfter = GeometryHash(mesh)
    if freshSource != sourceHash or geometryAfter != geometryBefore:
        raise RuntimeError('Tube chart preparation changed protected native source UV/geometry')
    stats['windowTriangleAreaFraction'] = stats['summedTriangleAreaPixels2']/(window[2]*window[3])
    for index, chart in enumerate(charts):
        chart['placement'] = placements[index]
    return {'generator': generator, 'sourceObject': sourceObject, 'object': obj.name,
            'sourceUV': sourceName, 'targetUV': targetName, 'resolution': [width, height],
            'windowPixels': window, 'paddingPixels': padding, 'componentCount': len(groups),
            'eightSidedTubeCount': sum(row['sectionSides'] == 8 for row in componentReports),
            'fourSidedShortFibreCount': sum(row['sectionSides'] == 4 for row in componentReports),
            'chartCount': len(charts), 'physicalTexelsPerMetre': scale,
            'sourceUvSha256Before': sourceHash, 'sourceUvSha256After': freshSource,
            'geometrySha256Before': geometryBefore, 'geometrySha256After': geometryAfter,
            'sourceUvCoordinatesUnchanged': True, 'nativeGeometryUnchanged': True,
            'coverage': stats, 'components': componentReports, 'charts': charts,
            'method': 'Actual connected tube side strips with source-U seam repair, separately projected actual end rings, deterministic non-overlapping rectangle packing',
            'uvPackingOverlapPolicy': 'Distinct padded rectangles; each side chart follows monotone source arc and each cap its actual planar ring',
            'smartProjectUsed': False, 'pixelPaintingUsed': False,
            'coverageIsMeasuredNotAssumed': True}


BuildQualityTubeUv = BuildInterlacedTubeUv
