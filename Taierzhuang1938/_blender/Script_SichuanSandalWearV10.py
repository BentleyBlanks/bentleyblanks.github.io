"""Locally crush the raised crosswise straw bundles in the two V10 soles.

Call ApplySandalWear(root) after the existing V9/V10 straw assembly.  This pass
keeps all vertex/face indices, UVs, the curved sole centre-lines, rim plaits,
laces and parent controls.  Only the eight-sided tube sections near the sole
foundation are eligible.  A fake-user baseline makes repeat calls idempotent.
No scene is modified merely by importing this module.
"""

import array
import hashlib
import math

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


generatorTag = 'SichuanSandalLocalWearV10'
baselineProperty = 'SandalLocalWearV10Baseline'
frontNormal = Vector((.226, -.974, 0)).normalized()
widthAxis = Vector((.974, .226, 0)).normalized()


def CoordinateHash(mesh):
    values = array.array('f', [0]) * (len(mesh.vertices) * 3)
    mesh.vertices.foreach_get('co', values)
    return hashlib.sha256(values.tobytes()).hexdigest()


def UvHash(mesh):
    digest = hashlib.sha256()
    for layer in mesh.uv_layers:
        values = array.array('f', [0]) * (len(layer.data) * 2)
        layer.data.foreach_get('uv', values)
        digest.update(layer.name.encode('utf-8'))
        digest.update(values.tobytes())
    return digest.hexdigest()


def Baseline(obj):
    name = obj.get(baselineProperty)
    baseline = bpy.data.meshes.get(name) if name else None
    if baseline is None:
        baseline = obj.data.copy()
        baseline.name = 'Geometry_SandalWearV10Baseline_' + obj.name
        baseline.use_fake_user = True
        baseline['SandalWearGenerator'] = generatorTag
        baseline['SandalWearSourceObject'] = obj.name
        baseline['SandalWearCoordinateHash'] = CoordinateHash(baseline)
        obj[baselineProperty] = baseline.name
    assert baseline.get('SandalWearGenerator') == generatorTag
    assert baseline.get('SandalWearSourceObject') == obj.name
    assert len(baseline.vertices) == len(obj.data.vertices), 'Sandal topology changed since baseline'
    assert len(baseline.polygons) == len(obj.data.polygons)
    assert UvHash(baseline) == UvHash(obj.data), 'Sandal UV changed since baseline'
    assert CoordinateHash(baseline) == baseline['SandalWearCoordinateHash']
    return baseline


def Components(mesh):
    """Return vertex-index components and their eight-sided end-cap count."""
    parent = list(range(len(mesh.vertices)))

    def Find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for edge in mesh.edges:
        a, b = edge.vertices
        a, b = Find(a), Find(b)
        if a != b:
            parent[b] = a
    groups = {}
    for index in range(len(parent)):
        groups.setdefault(Find(index), []).append(index)
    caps = {}
    for polygon in mesh.polygons:
        if len(polygon.vertices) == 8:
            key = Find(polygon.vertices[0])
            caps[key] = caps.get(key, 0) + 1
    return [(indices, caps.get(key, 0)) for key, indices in groups.items()]


def FoundationTree(foundation, root):
    intoRoot = root.matrix_world.inverted_safe() @ foundation.matrix_world
    points = [intoRoot @ vertex.co for vertex in foundation.data.vertices]
    faces = [tuple(polygon.vertices) for polygon in foundation.data.polygons]
    return BVHTree.FromPolygons(points, faces, all_triangles=False)


def CandidateComponents(source, obj, root, foundation, yaw):
    intoRoot = root.matrix_world.inverted_safe() @ obj.matrix_world
    acrossAxis = widthAxis * math.cos(yaw) + Vector((0, 0, -math.sin(yaw)))
    lengthAxis = -widthAxis * math.sin(yaw) + Vector((0, 0, -math.cos(yaw)))
    tree = FoundationTree(foundation, root)
    candidates = []
    skipped = {'notEightSidedTube': 0, 'notShortTransverseBundle': 0,
               'raisedRimOrLace': 0, 'narrowRow': 0}
    for indices, capCount in Components(source):
        if (capCount != 2 or len(indices) < 16 or len(indices) % 8 or
                indices[-1] - indices[0] + 1 != len(indices)):
            skipped['notEightSidedTube'] += 1
            continue
        rings = [indices[index:index+8] for index in range(0, len(indices), 8)]
        centres = [sum((intoRoot @ source.vertices[index].co for index in ring), Vector()) / 8
                   for ring in rings]
        widths = [point.dot(acrossAxis) for point in centres]
        lengths = [point.dot(lengthAxis) for point in centres]
        widthSpan, lengthSpan = max(widths) - min(widths), max(lengths) - min(lengths)
        # V9 divides each row into roughly 10.5 mm pieces.  Long row tubes
        # also work, but none may extend lengthwise like an edge/heel plait.
        if widthSpan < .004 or lengthSpan > .007 or widthSpan < lengthSpan * 1.25:
            skipped['notShortTransverseBundle'] += 1
            continue
        gaps = []
        for ringIndex in sorted(set((0, len(centres)//4, len(centres)//2,
                                     3*len(centres)//4, len(centres)-1))):
            point = centres[ringIndex]
            hit = tree.ray_cast(point + frontNormal * .030, -frontNormal, .060)
            if hit[0] is None:
                # The outermost 0.5--1 mm of a row intentionally extends past
                # the .95-width foundation.  Accept only a bounded adjacent
                # foundation edge; never substitute an arbitrary depth.
                nearest = tree.find_nearest(point)
                if nearest[0] is not None and nearest[3] < .006:
                    gaps.append((point-nearest[0]).dot(frontNormal))
                else:
                    gaps.append(float('inf'))
            else:
                gaps.append((point - hit[0]).dot(frontNormal))
        # Upper laces may share the same x/z extent as crosswise sole rows;
        # their lifted middle is many millimetres above the foundation.  This
        # explicit clearance test leaves all their vertices untouched.
        if max(gaps) > .0050 or min(gaps) < -.0015:
            skipped['raisedRimOrLace'] += 1
            continue
        candidates.append({'indices': indices, 'rings': rings, 'centres': centres,
                           'rowCoordinate': sum(lengths) / len(lengths),
                           'widthMin': min(widths), 'widthMax': max(widths)})

    # Require a broad sole-row group, rather than flattening an isolated short
    # decorative strand.  Correct for the shoe's yaw before clustering rows.
    rows = []
    for candidate in sorted(candidates, key=lambda item: item['rowCoordinate']):
        nearest = min(rows, key=lambda row: abs(row['mean'] - candidate['rowCoordinate']),
                      default=None)
        if nearest is None or abs(nearest['mean'] - candidate['rowCoordinate']) > .0018:
            rows.append({'mean': candidate['rowCoordinate'], 'parts': [candidate]})
        else:
            nearest['parts'].append(candidate)
            nearest['mean'] = sum(part['rowCoordinate'] for part in nearest['parts']) / len(nearest['parts'])
    selected = []
    broadRows = 0
    for row in rows:
        span = max(part['widthMax'] for part in row['parts']) - min(part['widthMin'] for part in row['parts'])
        if span < .024:
            skipped['narrowRow'] += len(row['parts'])
            continue
        broadRows += 1
        selected.extend(row['parts'])
    return selected, skipped, broadRows, intoRoot


def CrushSole(obj, foundation, root, number):
    source = Baseline(obj)
    uvBefore = UvHash(obj.data)
    originalParent = obj.parent
    originalWorld = obj.matrix_world.copy()
    selected, skipped, broadRows, intoRoot = CandidateComponents(
        source, obj, root, foundation, -.095 if number == 1 else .075)
    assert selected, 'No eligible transverse sole bundles in ' + obj.name
    intoLocal = intoRoot.inverted_safe()
    changed = set()
    maxMovement = 0
    compressionValues = []
    for componentIndex, component in enumerate(selected):
        phase = componentIndex * 1.937 + number * 1.41
        compression = .55 + .15 * (.5 + .5 * math.sin(phase))
        pressure = .00010 + .00010 * (.5 + .5 * math.sin(phase * 1.73 + .4))
        compressionValues.append(compression)
        for ringIndex, (ring, centre) in enumerate(zip(component['rings'], component['centres'])):
            # Preserve the full existing cup/curled-toe centreline.  Only the
            # section's front-normal thickness shrinks, with a tiny 0.1--0.2 mm
            # seating pressure and a gentle taper at the two original caps.
            t = ringIndex / max(1, len(component['rings']) - 1)
            seat = pressure * (.83 + .17 * math.sin(math.pi * t))
            for index in ring:
                original = intoRoot @ source.vertices[index].co
                thickness = (original - centre).dot(frontNormal)
                result = original - frontNormal * (thickness * (1-compression) + seat)
                obj.data.vertices[index].co = intoLocal @ result
                maxMovement = max(maxMovement, (result-original).length)
                changed.add(index)
    obj.data.update()
    assert UvHash(obj.data) == uvBefore
    assert obj.parent == originalParent and obj.matrix_world == originalWorld
    assert CoordinateHash(source) == source['SandalWearCoordinateHash'], 'Baseline mutated'
    obj['SandalWearGenerator'] = generatorTag
    return {'object': obj.name, 'baseline': source.name, 'baselineFakeUser': bool(source.use_fake_user),
            'selectedTransverseTubeComponents': len(selected), 'selectedBroadRows': broadRows,
            'changedVertices': len(changed), 'maxVertexMovementM': maxMovement,
            'thicknessRatioRange': [min(compressionValues), max(compressionValues)],
            'centrelineSeatingPressureM': [.00010, .00020], 'skippedComponents': skipped,
            'uvIndicesParentsUnchanged': True, 'rimAndLacesExcluded': True}


def ApplySandalWear(root):
    assert root is not None and root.name == 'Pack_Root'
    assert bpy.context.scene.get('BlenderMcpTask') == 'SichuanBlanketPack'
    descendants = set(root.children_recursive)
    reports = []
    for number in (1, 2):
        obj = bpy.data.objects.get('Pack_GrassSandal%02dBraidedWeave' % number)
        foundation = bpy.data.objects.get('Pack_GrassSandal%02dFoundation' % number)
        assert obj and foundation and obj in descendants and foundation in descendants
        reports.append(CrushSole(obj, foundation, root, number))
    root['SandalLocalWearV10'] = generatorTag
    return {'generator': generatorTag, 'parts': reports, 'geometryAdded': False,
            'cupShapePreserved': True, 'visualApproval': False}
