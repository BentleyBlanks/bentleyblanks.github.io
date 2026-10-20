"""Game-only cotton lining fitted to real straw, appended to the Quilt mesh.

The source outer shell is retained. A single continuous downward-facing cloth
sheet has its narrow hem embedded in that shell. This is a cloth sheet with a
closed perimeter, not a claim that a separate new watertight cushion was made.
Call after game Fit, before OrientQuiltShell and ApplyCottonWeave.
"""
import hashlib
import math
from collections import Counter, defaultdict, deque
from pathlib import Path

import numpy as np


_X_BOUNDS = (-1.0, .94)
_Y_BOUNDS = (-.445, .445)
_GRID_STEP = .01
_LOWER_GAP = .00025
_UPPER_CLEARANCE = .002
_RIBBON_OFFSET = .00025
_COLOUR = 'BR_original_low_frequency_color'
_ADAPTIVE_TOLERANCE = .00075
_ADAPTIVE_DEPTH = 4
_MAX_LINING_TRIANGLES = 120000


def _Barycentric(point, triangle):
    a, b, c = np.asarray(triangle, dtype=np.float64)
    u, v, p = b - a, c - a, np.asarray(point, dtype=np.float64) - a
    uu, uv, vv = float(u @ u), float(u @ v), float(v @ v)
    denominator = uu * vv - uv * uv
    if denominator <= 1e-24:
        raise ValueError('Degenerate source triangle for lining interpolation')
    beta = (vv * float(p @ u) - uv * float(p @ v)) / denominator
    gamma = (uu * float(p @ v) - uv * float(p @ u)) / denominator
    weights = np.clip(np.array([1 - beta - gamma, beta, gamma]), 0, 1)
    return weights / weights.sum()


def _GridCoordinates(low, high, step):
    count = math.ceil((high - low) / step)
    return [low + (high - low) * index / count for index in range(count + 1)]


def _SheetFaces(nx, ny, valid):
    faces = []
    for iy in range(ny - 1):
        for ix in range(nx - 1):
            a = iy * nx + ix
            b, c, d = a + 1, a + nx, a + nx + 1
            if all(valid[index] for index in (a, b, c, d)):
                # Opposite XY winding: actual cotton underside normals point -Z.
                faces.extend(((a, d, b), (a, c, d)) if (ix + iy) % 2 == 0
                             else ((a, c, b), (b, c, d)))
    return faces


def _SheetTopology(faces):
    incidence = defaultdict(list)
    for index, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            incidence[tuple(sorted((a, b)))].append(index)
    neighbours = defaultdict(set)
    for faceIds in incidence.values():
        for first in faceIds:
            neighbours[first].update(other for other in faceIds if other != first)
    unseen = set(range(len(faces)))
    components = []
    while unseen:
        start = min(unseen)
        queue = deque([start])
        unseen.remove(start)
        component = []
        while queue:
            index = queue.popleft()
            component.append(index)
            for other in sorted(neighbours[index]):
                if other in unseen:
                    unseen.remove(other)
                    queue.append(other)
        components.append(component)
    boundary = [edge for edge, faceIds in incidence.items() if len(faceIds) == 1]
    degree = Counter(vertex for edge in boundary for vertex in edge)
    boundaryGraph = defaultdict(set)
    for first, second in boundary:
        boundaryGraph[first].add(second)
        boundaryGraph[second].add(first)
    unseenVertices = set(boundaryGraph)
    loops = 0
    while unseenVertices:
        loops += 1
        queue = [min(unseenVertices)]
        unseenVertices.remove(queue[0])
        while queue:
            current = queue.pop()
            for other in sorted(boundaryGraph[current]):
                if other in unseenVertices:
                    unseenVertices.remove(other)
                    queue.append(other)
    return {'components': components, 'boundaryEdges': boundary,
            'boundaryVertices': set(degree), 'boundaryLoops': loops,
            'boundaryDegreesValid': all(value == 2 for value in degree.values()),
            'nonManifoldEdges': sum(len(faceIds) > 2 for faceIds in incidence.values())}


def _SeparatePinchVertices(points, faces, minimumNewIndex=0):
    """Give disconnected one-ring fans their own coincident vertex IDs.

    Geometry is unchanged. Attribute lookup happens afterwards by coordinates,
    so the copied corners retain the same source colour/UV interpolation.
    A true edge with >2 incident faces is not a pinch and remains an error.
    """
    faces = [tuple(face) for face in faces]
    incidence = defaultdict(list)
    incidentFaces = defaultdict(list)
    for faceIndex, face in enumerate(faces):
        for vertex in face:
            incidentFaces[vertex].append(faceIndex)
        for a, b in zip(face, face[1:] + face[:1]):
            incidence[tuple(sorted((a, b)))].append(faceIndex)
    badEdges = [(edge, ids) for edge, ids in incidence.items() if len(ids) > 2]
    if badEdges:
        example = sorted(badEdges)[0]
        raise ValueError(f'True non-manifold adaptive edge {example[0]} has {len(example[1])} incident faces {example[1][:12]}; inspect shared-edge triangle splitting')
    boundaryDegree = Counter(vertex for edge, ids in incidence.items() if len(ids) == 1 for vertex in edge)
    candidates = sorted(vertex for vertex, degree in boundaryDegree.items() if degree > 2)
    nextIndex = max(max(points, default=-1) + 1, minimumNewIndex)
    duplicates = []
    for vertex in candidates:
        adjacentFaces = sorted(index for index in incidentFaces[vertex] if vertex in faces[index])
        neighbours = defaultdict(set)
        localEdges = defaultdict(list)
        for faceIndex in adjacentFaces:
            face = faces[faceIndex]
            for other in face:
                if other != vertex:
                    localEdges[other].append(faceIndex)
        for ids in localEdges.values():
            for first in ids:
                neighbours[first].update(other for other in ids if other != first)
        remaining = set(adjacentFaces)
        fans = []
        while remaining:
            first = min(remaining)
            queue = deque([first])
            remaining.remove(first)
            fan = []
            while queue:
                current = queue.popleft()
                fan.append(current)
                for other in sorted(neighbours[current]):
                    if other in remaining:
                        remaining.remove(other)
                        queue.append(other)
            fans.append(sorted(fan))
        fans.sort(key=lambda fan: (-len(fan), fan[0]))
        for fan in fans[1:]:
            copy = nextIndex
            nextIndex += 1
            points[copy] = tuple(points[vertex])
            for faceIndex in fan:
                faces[faceIndex] = tuple(copy if index == vertex else index for index in faces[faceIndex])
            duplicates.append({'originalVertex': vertex, 'copyVertex': copy,
                               'faces': len(fan), 'position': points[copy]})
    after = _SheetTopology(faces)
    if after['nonManifoldEdges'] or not after['boundaryDegreesValid']:
        raise ValueError('Adaptive one-ring fan separation did not produce valid degree-two boundary vertices')
    return points, faces, {'pinchedBoundaryVertices': len(candidates),
                          'duplicatedVertices': len(duplicates),
                          'separatedFans': duplicates,
                          'geometryMoved': False,
                          'trueNonManifoldEdges': after['nonManifoldEdges'],
                          'boundaryDegreesValidAfterSeparation': after['boundaryDegreesValid']}


def _SplitTriangle(face, midpoints):
    """Conforming red/green split: all neighbours share the same edge midpoint."""
    a, b, c = face
    ab = midpoints.get(tuple(sorted((a, b))))
    bc = midpoints.get(tuple(sorted((b, c))))
    ca = midpoints.get(tuple(sorted((c, a))))
    count = sum(value is not None for value in (ab, bc, ca))
    if count == 0:
        return [face]
    if count == 3:
        return [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
    if count == 1:
        if ab is not None:
            return [(a, ab, c), (ab, b, c)]
        if bc is not None:
            return [(b, bc, a), (bc, c, a)]
        return [(c, ca, b), (ca, a, b)]
    if ab is not None and bc is not None:
        return [(b, bc, ab), (a, ab, c), (ab, bc, c)]
    if bc is not None and ca is not None:
        return [(c, ca, bc), (b, bc, a), (bc, ca, a)]
    return [(a, ab, ca), (c, ca, b), (ca, ab, b)]


def _HeightScan(points, faces, sample, tolerance):
    bad, invalid, worst = [], [], []
    for index, face in enumerate(faces):
        a, b, c = (points[vertex] for vertex in face)
        centre = tuple((a[axis] + b[axis] + c[axis]) / 3 for axis in range(3))
        middle = lambda first, second: tuple((first[axis] + second[axis]) * .5 for axis in range(3))
        probes = [centre, middle(a, b), middle(b, c), middle(c, a),
                  middle(a, centre), middle(b, centre), middle(c, centre)]
        maximum = 0.0
        missing = False
        for probe in probes:
            actual = sample(float(probe[0]), float(probe[1]))
            if actual is None:
                missing = True
                continue
            error = float(probe[2] - actual)
            maximum = max(maximum, abs(error))
            if abs(error) > tolerance:
                worst.append({'face': index, 'x': float(probe[0]),
                              'y': float(probe[1]), 'errorM': error})
        if missing:
            invalid.append(index)
        if missing or maximum > tolerance:
            bad.append((math.inf if missing else maximum, index))
    return sorted(bad, key=lambda row: (-row[0], row[1])), invalid, sorted(worst, key=lambda row: (-abs(row['errorM']), row['face'], row['x'], row['y']))


def _AdaptiveSupport(points, faces, sampleSupport, tolerance=_ADAPTIVE_TOLERANCE,
                     maxDepth=_ADAPTIVE_DEPTH, maxTriangles=_MAX_LINING_TRIANGLES):
    """Refine the explicit Straw height field, never the pathological old shell.

    Shared edge midpoint splitting also splits its neighbour (green triangles),
    so no T-junction is introduced. Exact S is sampled at every inserted point.
    Budget accounting reserves two return-ribbon triangles per boundary edge.
    """
    cache = {}
    def Sample(x, y):
        key = (round(x, 11), round(y, 11))
        if key not in cache:
            cache[key] = sampleSupport(x, y)
        return cache[key]
    originalFaces = len(faces)
    rounds = []
    budgetLimited = False
    for depth in range(maxDepth):
        bad, invalid, worst = _HeightScan(points, faces, Sample, tolerance)
        if not bad:
            break
        incidence = Counter(tuple(sorted((a, b))) for face in faces
                            for a, b in zip(face, face[1:] + face[:1]))
        boundaryCount = sum(count == 1 for count in incidence.values())
        available = maxTriangles - len(faces) - 2 * boundaryCount
        selected = set()
        cost = 0
        for _, faceIndex in bad:
            face = faces[faceIndex]
            keys = {tuple(sorted((a, b))) for a, b in zip(face, face[1:] + face[:1])}
            new = keys - selected
            additional = sum(incidence[key] + (2 if incidence[key] == 1 else 0) for key in new)
            if cost + additional <= available:
                selected.update(new)
                cost += additional
            else:
                budgetLimited = True
        if not selected:
            break
        midpointIds = {}
        invalidPoints = set()
        nextIndex = max(points) + 1
        for key in sorted(selected):
            a, b = points[key[0]], points[key[1]]
            x, y = (a[0] + b[0]) * .5, (a[1] + b[1]) * .5
            height = Sample(x, y)
            midpointIds[key] = nextIndex
            points[nextIndex] = (x, y, height if height is not None else (a[2] + b[2]) * .5)
            if height is None:
                invalidPoints.add(nextIndex)
            nextIndex += 1
        refined = [child for face in faces for child in _SplitTriangle(face, midpointIds)
                   if not any(index in invalidPoints for index in child)]
        rounds.append({'depth': depth + 1, 'beforeTriangles': len(faces),
                       'afterTriangles': len(refined), 'badTriangles': len(bad),
                       'selectedEdges': len(selected), 'invalidSupportVertices': len(invalidPoints),
                       'maxMeasuredErrorM': abs(worst[0]['errorM']) if worst else 0.0})
        faces = refined
    remaining, invalid, worst = _HeightScan(points, faces, Sample, tolerance)
    # A real no-support sample is a footprint boundary, not a surface to bridge.
    invalidSet = set(invalid)
    faces = [face for index, face in enumerate(faces) if index not in invalidSet]
    used = {index for face in faces for index in face}
    points = {index: point for index, point in points.items() if index in used}
    finalBad, _, finalWorst = _HeightScan(points, faces, Sample, tolerance)
    return points, faces, {'initialTriangles': originalFaces,
                          'finalBearingTriangles': len(faces), 'rounds': rounds,
                          'maximumDepth': maxDepth, 'toleranceM': tolerance,
                          'maximumLiningTrianglesIncludingRibbon': maxTriangles,
                          'budgetLimited': budgetLimited,
                          'noSupportTrianglesRemoved': len(invalid),
                          'remainingOverToleranceTriangles': len(finalBad),
                          'maximumSampledErrorM': abs(finalWorst[0]['errorM']) if finalWorst else 0.0,
                          'worstSamples': finalWorst[:20], 'uniqueHeightQueries': len(cache),
                          'method': 'Exact Straw height; centre/edge/quarter tests; deterministic shared-edge red-green refinement, no T-junctions'}


def _AddHemRibbon(points, faces, lowerHeights, upperHeights, nextIndex):
    """Extend outside the sheet boundary; never raise an existing bearing point."""
    topology = _SheetTopology(faces)
    boundaryKeys = set(topology['boundaryEdges'])
    oriented = {}
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            key = tuple(sorted((a, b)))
            if key in boundaryKeys:
                oriented[key] = (a, b)
    outgoing = {a: b for a, b in oriented.values()}
    # Down-facing source faces have clockwise XY boundaries. Their left-hand
    # side is outside the existing contact sheet.
    outward = defaultdict(lambda: np.zeros(2, dtype=np.float64))
    for a, b in oriented.values():
        delta = np.array(points[b][:2]) - np.array(points[a][:2])
        length = float(np.linalg.norm(delta))
        if length > 1e-12:
            normal = np.array([-delta[1], delta[0]]) / length
            outward[a] += normal
            outward[b] += normal
    tops = {}
    for index in sorted(topology['boundaryVertices']):
        height = min(lowerHeights[index] + .0005, upperHeights[index] - _UPPER_CLEARANCE)
        if height - points[index][2] <= .00005:
            tops[index] = index
            continue
        direction = outward[index]
        length = float(np.linalg.norm(direction))
        shift = direction / length * _RIBBON_OFFSET if length > 1e-12 else direction
        tops[index] = nextIndex
        points[nextIndex] = (points[index][0] + float(shift[0]),
                             points[index][1] + float(shift[1]), height)
        nextIndex += 1
    addedFaces, ribbonUvs = [], {}
    remaining = set(outgoing)
    while remaining:
        first = min(remaining)
        current, arc = first, 0.0
        while current in remaining:
            remaining.remove(current)
            following = outgoing[current]
            length = math.hypot(points[following][0] - points[current][0],
                                points[following][1] - points[current][1])
            uvByVertex = {}
            for index, u in ((current, arc / .19627),
                             (following, (arc + length) / .19627)):
                for vertexIndex in (index, tops[index]):
                    uvByVertex[vertexIndex] = np.array([u, (points[vertexIndex][2] - .55) / .19627])
            # Reverse the original boundary edge so the ribbon and contact face
            # share it consistently. A collapsed zero-height half is omitted.
            for triangle in ((following, current, tops[current]),
                             (following, tops[current], tops[following])):
                if len(set(triangle)) != 3:
                    continue
                a, b, c = (np.array(points[index]) for index in triangle)
                if float(np.linalg.norm(np.cross(b - a, c - a))) < 1e-12:
                    continue
                faceIndex = len(faces) + len(addedFaces)
                addedFaces.append(triangle)
                ribbonUvs[faceIndex] = [uvByVertex[index] for index in triangle]
            arc += length
            current = following
    return faces + addedFaces, ribbonUvs, {'addedRibbonVertices': sum(a != b for a, b in tops.items()),
                                         'addedRibbonTriangles': len(addedFaces),
                                         'maximumOutwardOffsetM': _RIBBON_OFFSET}


def _BaseImage(material):
    principled = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
    if principled is None:
        raise ValueError('BS material has no Principled shader')
    pending = [link.from_node for link in principled.inputs['Base Color'].links]
    seen, images = set(), {}
    while pending:
        node = pending.pop()
        if node.as_pointer() in seen:
            continue
        seen.add(node.as_pointer())
        if node.type == 'TEX_IMAGE' and node.image:
            images[node.image.as_pointer()] = node.image
        for socket in node.inputs:
            pending.extend(link.from_node for link in socket.links)
    if len(images) != 1:
        raise ValueError('Expected one authored BS Base image in the actual Base Color graph')
    return next(iter(images.values()))


def _FootBaseMean(foot):
    import bpy
    import tempfile
    from Script_PatchedTimberBedCotton import ReadRgbPng, ToLinear
    image = _BaseImage(foot.data.materials[0])
    imageFile = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
    if imageFile and imageFile.is_file() and imageFile.suffix.lower() == '.png':
        pixels = ReadRgbPng(imageFile)
    elif image.packed_file and bytes(image.packed_file.data).startswith(b'\x89PNG\r\n\x1a\n'):
        with tempfile.TemporaryDirectory(prefix='BedLiningBase') as directory:
            temporary = Path(directory) / 'Texture_BsBase.png'
            temporary.write_bytes(bytes(image.packed_file.data))
            pixels = ReadRgbPng(temporary)
    else:
        raise ValueError('BS Base must retain its exact source/packed PNG from Prepare for explicit sRGB mean decoding')
    linear = ToLinear(pixels.astype(np.float64) / 255)
    mean = linear.mean(axis=(0, 1))
    return mean, {'image': image.name, 'dimensions': [pixels.shape[1], pixels.shape[0]],
                  'linearRgbMean': mean.tolist(),
                  'rgb8Sha256': hashlib.sha256(pixels.tobytes()).hexdigest(),
                  'method': 'Exact PNG RGB8 -> explicit sRGB inverse transfer -> linear channel mean'}


def _LowerAttributeBvh(objects, envelope, foot, footMean):
    from mathutils.bvhtree import BVHTree
    vertices, triangles, records = [], [], []
    for obj in objects:
        mesh, matrix = obj.data, obj.matrix_world
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers.get('UVMap')
        colour = mesh.color_attributes.get(_COLOUR)
        if uv is None or colour is None or colour.domain != 'CORNER' or colour.data_type != 'FLOAT_COLOR':
            raise ValueError(f'{obj.name} lacks native UVMap / explicit CORNER colour')
        for triangle in mesh.loop_triangles:
            points = [matrix @ mesh.vertices[index].co for index in triangle.vertices]
            centre = (points[0] + points[1] + points[2]) / 3
            sample = envelope.At(float(centre.x), float(centre.y), allowJitter=True)
            if sample is None or abs(centre.z - sample[0]) > .0005:
                continue
            uvValues = np.array([uv.data[index].uv[:] for index in triangle.loops], dtype=np.float64)
            colours = np.array([colour.data[index].color[:] for index in triangle.loops], dtype=np.float64)
            if obj == foot:
                colours[:, :3] *= footMean
            start = len(vertices)
            vertices.extend(points)
            triangles.append((start, start + 1, start + 2))
            records.append({'points': np.array([point[:] for point in points]),
                            'uv': uvValues, 'colour': colours, 'source': obj.name,
                            'isFoot': obj == foot})
    if not triangles:
        raise ValueError('No certified original lower triangles for lining attributes')
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=1e-6), records


def AddGameQuiltLining(quilt, foot, straw):
    """Append the actual cotton lining to Quilt; return geometry/attribute audits."""
    import bpy
    import bmesh
    from mathutils import Vector
    from Script_PatchedTimberBedFit import _WorldBvh, _Envelope
    if any(obj.type != 'MESH' for obj in (quilt, foot, straw)):
        raise TypeError('Quilt, BS foot and original low Straw must be real meshes')
    if quilt.get('GameQuiltLiningAdded', False):
        raise ValueError('Rebuild from the six base game meshes rather than adding a second lining')
    if len(quilt.data.materials) != 1 or quilt.data.materials[0] is None:
        raise ValueError('Lining must share the one native Quilt material/draw')
    if quilt.data.color_attributes.get('CottonSourceLowFrequencyColor') is not None:
        raise ValueError('Add lining before ApplyCottonWeave, while native low-frequency colours are unmodified')
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    qTree, qLow, qHigh, _ = _WorldBvh([quilt, foot], depsgraph)
    sTree, _, _, _ = _WorldBvh([straw], depsgraph)
    envelope = _Envelope(qTree, sTree, qLow, qHigh)
    xs = _GridCoordinates(*_X_BOUNDS, _GRID_STEP)
    ys = _GridCoordinates(*_Y_BOUNDS, _GRID_STEP)
    nx, ny = len(xs), len(ys)
    samples = [envelope.At(x, y, allowJitter=True) for y in ys for x in xs]
    valid = [sample is not None and sample[1] - (sample[2] + _LOWER_GAP) >= _UPPER_CLEARANCE
             for sample in samples]
    faces = _SheetFaces(nx, ny, valid)
    if not faces:
        raise ValueError('No thick quilt and actual Straw footprint with 2mm upper clearance')
    originalTopology = _SheetTopology(faces)
    # A lining is one continuous cloth, not isolated floating scraps over loose
    # straw tips. Keep the largest edge-connected bearing component only.
    largest = max(originalTopology['components'], key=lambda part: (len(part), -min(part)))
    discardedFaces = len(faces) - len(largest)
    faces = [faces[index] for index in sorted(largest)]
    topology = _SheetTopology(faces)
    if topology['nonManifoldEdges'] or not topology['boundaryDegreesValid']:
        raise ValueError('The real lining footprint has a pinched/non-manifold perimeter')
    used = sorted({index for face in faces for index in face})
    points = {}
    lowerHeights, upperHeights = {}, {}
    oldPenetration = []
    for index in used:
        lower, upper, support = samples[index]
        # Every real bearing point stays fitted, including the last boundary
        # row. The return hem is a separate extension outside this surface.
        height = support + _LOWER_GAP
        if upper - height < _UPPER_CLEARANCE:
            raise ValueError('A lining surface would reach the visible upper quilt')
        points[index] = (xs[index % nx], ys[index // nx], height)
        lowerHeights[index], upperHeights[index] = lower, upper
        if lower - support < -.002:
            oldPenetration.append((xs[index % nx], ys[index // nx], lower - support))
    def SampleHeight(x, y):
        support = envelope.StrawTop(x, y)
        if support is None:
            return None
        # Refinement follows the unambiguous Straw height field. It does not
        # depend on the old Quilt's pathological lower-pair holes. Only the real
        # upper surface remains a physical visibility/safety constraint.
        upper = qTree.ray_cast(Vector((x, y, envelope.rayHigh)), envelope.down,
                              envelope.rayHigh - envelope.rayLow)[0]
        if upper is None or upper.z - (support + _LOWER_GAP) < _UPPER_CLEARANCE:
            return None
        return support + _LOWER_GAP
    points, faces, adaptiveStats = _AdaptiveSupport(points, faces, SampleHeight)
    if not faces:
        raise ValueError('No supported lining remains after adaptive footprint validation')
    points, faces, cleanupStats = _SeparatePinchVertices(points, faces, minimumNewIndex=nx * ny)
    adaptiveTopology = _SheetTopology(faces)
    largest = max(adaptiveTopology['components'], key=lambda part: (len(part), -min(part)))
    cleanupStats['discardedDisconnectedFaces'] = len(faces) - len(largest)
    discardedFaces += cleanupStats['discardedDisconnectedFaces']
    faces = [faces[index] for index in sorted(largest)]
    usedSet = {index for face in faces for index in face}
    points = {index: point for index, point in points.items() if index in usedSet}
    topology = _SheetTopology(faces)
    if topology['nonManifoldEdges'] or not topology['boundaryDegreesValid']:
        raise ValueError('Adaptive support lining has a pinched/non-manifold perimeter')
    footMean, baseAudit = _FootBaseMean(foot)
    attrTree, attrRecords = _LowerAttributeBvh([quilt, foot], envelope, foot, footMean)
    for index in sorted(topology['boundaryVertices']):
        if index in lowerHeights:
            continue
        x, y, z = points[index]
        sample = envelope.At(x, y, allowJitter=True)
        if sample is not None:
            lowerHeights[index], upperHeights[index] = sample[:2]
        else:
            nearest = attrTree.find_nearest(Vector((x, y, z)))[0]
            upper = qTree.ray_cast(Vector((x, y, envelope.rayHigh)), envelope.down,
                                  envelope.rayHigh - envelope.rayLow)[0]
            if nearest is None or upper is None:
                raise ValueError('An adaptive boundary lacks an actual source hem attachment')
            lowerHeights[index] = min(float(nearest.z), float(upper.z) - .0031)
            upperHeights[index] = float(upper.z)
    bearingFaceCount = len(faces)
    bearingPointCount = len(points)
    faces, ribbonUvs, ribbonStats = _AddHemRibbon(points, faces, lowerHeights, upperHeights, max(points) + 1)
    if len(faces) > _MAX_LINING_TRIANGLES:
        raise ValueError(f'Adaptive lining plus return ribbon exceeds {_MAX_LINING_TRIANGLES} triangles')
    topology = _SheetTopology(faces)
    if topology['nonManifoldEdges'] or not topology['boundaryDegreesValid']:
        raise ValueError('Return hem did not retain a single valid cloth perimeter')
    used = sorted(points)
    attributes = {}
    mappedToFoot = 0
    maxSourceDistance = 0.0
    for index in used:
        nearest, _, triangleIndex, sourceDistance = attrTree.find_nearest(Vector(points[index]))
        if nearest is None:
            raise ValueError('No original lower surface for a lining vertex attribute')
        record = attrRecords[triangleIndex]
        weights = _Barycentric(nearest[:], record['points'])
        uv = weights @ record['uv']
        colour = weights @ record['colour']
        if not np.isfinite(uv).all() or not np.isfinite(colour).all() or np.any(colour < -1e-6) or np.any(colour > 1.000001):
            raise ValueError('Invalid interpolated lining UV/colour')
        attributes[index] = (uv, np.clip(colour, 0, 1))
        mappedToFoot += int(record['isFoot'])
        maxSourceDistance = max(maxSourceDistance, float(sourceDistance))
    mesh = quilt.data
    oldVertices, oldFaces, oldLoops = len(mesh.vertices), len(mesh.polygons), len(mesh.loops)
    beforePositions = np.empty(oldVertices * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', beforePositions)
    beforeUv = np.empty(oldLoops * 2, dtype=np.float32)
    mesh.uv_layers['UVMap'].data.foreach_get('uv', beforeUv)
    beforeColour = np.empty(oldLoops * 4, dtype=np.float32)
    mesh.color_attributes[_COLOUR].data.foreach_get('color', beforeColour)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uvLayer = bm.loops.layers.uv.get('UVMap')
    colourLayer = bm.loops.layers.float_color.get(_COLOUR)
    if uvLayer is None or colourLayer is None:
        bm.free()
        raise ValueError('Existing native UV/colour layers were not preserved by BMesh')
    extraUvs = [layer for layer in bm.loops.layers.uv.values() if layer != uvLayer]
    inverse = quilt.matrix_world.inverted()
    newVertices = {index: bm.verts.new(inverse @ Vector(points[index])) for index in used}
    fallbackUvTriangles = 0
    for faceIndex, indices in enumerate(faces):
        face = bm.faces.new([newVertices[index] for index in indices])
        face.material_index = 0
        face.smooth = True
        uvs = ribbonUvs.get(faceIndex, [attributes[index][0] for index in indices])
        first, second = uvs[1] - uvs[0], uvs[2] - uvs[0]
        if abs(float(first[0] * second[1] - first[1] * second[0])) < 1e-12:
            # Nearest projections may meet at a source seam/corner. Preserve
            # colour while giving only that new triangle a real physical UV.
            uvs = [np.array(points[index][:2]) / .19627 for index in indices]
            fallbackUvTriangles += 1
        for loop, index, uv in zip(face.loops, indices, uvs):
            loop[uvLayer].uv = tuple(uv)
            loop[colourLayer] = tuple(attributes[index][1])
            for layer in extraUvs:
                loop[layer].uv = tuple(uv)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    afterPositions = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
    mesh.vertices.foreach_get('co', afterPositions)
    afterUv = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers['UVMap'].data.foreach_get('uv', afterUv)
    afterColour = np.empty(len(mesh.loops) * 4, dtype=np.float32)
    mesh.color_attributes[_COLOUR].data.foreach_get('color', afterColour)
    if not (np.array_equal(beforePositions, afterPositions[:oldVertices * 3])
            and np.array_equal(beforeUv, afterUv[:oldLoops * 2])
            and np.array_equal(beforeColour, afterColour[:oldLoops * 4])):
        raise ValueError('An original Quilt position/UV0/CORNER colour changed while appending lining')
    quilt['GameQuiltLiningAdded'] = True
    stats = {'method': 'Actual game cotton lining: every bearing point stays on original Straw+0.5mm; separate outward return ribbon enters retained old shell',
             'grid': [nx, ny], 'maximumGridStepM': _GRID_STEP,
             'boundsX': _X_BOUNDS, 'boundsY': _Y_BOUNDS,
             'targetLowerGapM': _LOWER_GAP, 'upperClearanceM': _UPPER_CLEARANCE,
             'addedVertices': len(used), 'addedTriangles': len(faces),
             'oldVertices': oldVertices, 'oldFaces': oldFaces,
             'finalFaces': len(mesh.polygons),
             'bearingVertices': bearingPointCount, 'bearingTriangles': bearingFaceCount,
             'bearingSurfaceNeverRaisedForHem': True,
             'ribbon': ribbonStats,
             'adaptiveSupport': adaptiveStats,
             'adaptiveTopologyCleanup': cleanupStats,
             'discardedDisconnectedFaces': discardedFaces,
             'boundaryLoops': topology['boundaryLoops'],
             'boundaryVertices': len(topology['boundaryVertices']),
             'boundaryDegreesValid': topology['boundaryDegreesValid'],
             'nonManifoldLiningEdges': topology['nonManifoldEdges'],
             'topologicalType': 'One edge-connected cloth disk/patch with closed hem perimeter(s) embedded in original shell; single layer, not a separately water-tight solid',
             'normals': 'Bearing cloth faces point downward; return ribbon faces point outward/downward; reorient original shell afterwards',
             'oldPositionsUv0ColourPreservedExactly': True,
             'newAttributeMethod': 'Nearest certified lower triangle, barycentric UV0 and linear CORNER colour; BS colour multiplied by exact BS Base linear mean',
             'footMappedVertices': mappedToFoot, 'footBase': baseAudit,
             'maximumAttributeSourceDistanceM': maxSourceDistance,
             'physicalUvFallbackTriangles': fallbackUvTriangles,
             'oldLowerBelowStrawOver2mm': len(oldPenetration),
             'worstExistingOldPenetrations': sorted(oldPenetration, key=lambda row: row[2])[:12],
             'addedObjects': 0, 'addedMaterials': 0, 'finalDrawsUnchanged': True}
    return stats
