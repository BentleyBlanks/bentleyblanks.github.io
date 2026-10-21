"""Selected, real timber losses on editable FRAME_ source members.

DamageTimberMembers adds a few tapered edge losses and end checks. It does not
bevel every edge, displace wood with noise, change other bed components, start
Blender or save a project. The caller owns project checkpoints and the final
Game Frame rebuild/bake. Apply WeatherTimberFrame after this operation so new
cut surfaces receive its metric UVs while retaining WoodDamageData.

This geometry pass has an independent TimberDamageVersion. It never changes or
clears the older TimberGeometryVersion that guarded the original tiny chips.
"""

import hashlib
import json

import numpy as np


_Version = '20261021VisibleWoodDamageV3'
_PreserveGroup = 'TimberDamagePreserve'
_FaceMask = 'WoodExposedDamage'
_FaceDepth = 'WoodDamageDepth'
_FaceRegion = 'WoodDamageRegion'
_CornerData = 'WoodDamageData'
_MouthAttribute = 'WoodDamageMouth'


def _Hash(value):
    return hashlib.sha256(value).hexdigest()


def MemberFrame(worldPoints):
    """Return a stable long-axis basis for straight timber, in world metres."""
    points = np.asarray(worldPoints, dtype=np.float64)
    if points.ndim != 2 or points.shape[1] != 3 or len(points) < 4 or not np.isfinite(points).all():
        raise ValueError('Expected finite world-space member vertices')
    center = points.mean(axis=0)
    relative = points - center
    values, vectors = np.linalg.eigh(relative.T @ relative)
    longAxis = vectors[:, int(np.argmax(values))]
    if longAxis[np.argmax(np.abs(longAxis))] < 0:
        longAxis = -longAxis
    reference = np.asarray([0., 0., 1.])
    if abs(float(reference @ longAxis)) > .90:
        reference = np.asarray([0., 1., 0.])
    across = np.cross(longAxis, reference)
    across /= np.linalg.norm(across)
    other = np.cross(longAxis, across)
    axes = np.stack((longAxis, across, other), axis=1)
    local = relative @ axes
    return center, axes, local


def _SignedVolume(vertices, faces):
    value = 0.
    for face in faces:
        for index in range(1, len(face) - 1):
            a, b, c = vertices[[face[0], face[index], face[index + 1]]]
            value += float(a @ np.cross(b, c)) / 6
    return value


def _ClosedCutter(vertices, faces):
    vertices = np.asarray(vertices, dtype=np.float64)
    # Translate before volume calculation to avoid cancellation at large world
    # offsets; retain the exact requested world coordinates in the output.
    relative = vertices - vertices.mean(axis=0)
    volume = _SignedVolume(relative, faces)
    if volume < 0:
        faces = [tuple(reversed(face)) for face in faces]
        volume = -volume
    edges = {}
    for face in faces:
        for first, second in zip(face, face[1:] + face[:1]):
            key = tuple(sorted((first, second)))
            edges[key] = edges.get(key, 0) + 1
    if not np.isfinite(vertices).all() or volume <= 1e-12 or any(value != 2 for value in edges.values()):
        raise ValueError('Damage cutter must be closed, finite and positive-volume')
    return vertices, [tuple(face) for face in faces], float(volume)


def BuildCornerWedge(center, axes, corner, signs, alongCenter, lengthM, depthM, asymmetry=.43):
    """Closed nine-vertex cutter, tapered along grain and asymmetric in section.

    depthM is the deepest diagonal recession at a sharp outer corner. End
    sections remain outside the wood, so the loss closes to the old surface.
    """
    if lengthM <= 0 or depthM <= 0 or not .25 <= asymmetry <= .75:
        raise ValueError('Invalid local corner-wedge dimensions')
    margin = .0037
    reach = margin + np.sqrt(2) * depthM
    positions = [alongCenter - lengthM * asymmetry, alongCenter,
                 alongCenter + lengthM * (1 - asymmetry)]
    vertices = []
    for section, along in enumerate(positions):
        bite = reach if section == 1 else margin - .0011
        depthA = bite * (1.08 if section == 1 else 1.)
        depthB = bite * (.92 if section == 1 else 1.)
        for across, other in [(-depthA, margin), (margin, -depthB), (margin, margin)]:
            local = np.asarray([along, corner[0] + signs[0] * across,
                                corner[1] + signs[1] * other])
            vertices.append(np.asarray(center) + np.asarray(axes) @ local)
    faces = [(2, 1, 0), (6, 7, 8)]
    for section in range(2):
        for edge in range(3):
            following = (edge + 1) % 3
            faces.append((section * 3 + edge, section * 3 + following,
                          (section + 1) * 3 + following, (section + 1) * 3 + edge))
    return _ClosedCutter(vertices, faces)


def BuildEndCheck(center, axes, end, faceCoordinate, faceSign, acrossCenter,
                  lengthM=.039, widthM=.0032, depthM=.0038):
    """A shallow side-and-end-open V check; the structural core remains intact."""
    if min(lengthM, widthM, depthM) <= 0:
        raise ValueError('Invalid end-check dimensions')
    vertices = []
    for depth in (-depthM, .0033):
        for along, across in [(end + .0041, acrossCenter - widthM * .5),
                              (end + .0041, acrossCenter + widthM * .5),
                              (end - lengthM, acrossCenter + widthM * .075)]:
            local = np.asarray([along, faceCoordinate + faceSign * depth, across])
            vertices.append(np.asarray(center) + np.asarray(axes) @ local)
    faces = [(2, 1, 0), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (2, 0, 3, 5)]
    return _ClosedCutter(vertices, faces)


def _SectionBounds(coords, surfaceFaces, along):
    """Actual face/plane intersections, including tapered post cross sections."""
    if surfaceFaces is not None and len(surfaceFaces):
        triangles = coords[np.asarray(surfaceFaces, dtype=np.int32)]
        first = triangles.reshape(-1, 3)
        second = triangles[:, [1, 2, 0]].reshape(-1, 3)
        delta = second[:, 0] - first[:, 0]
        valid = np.abs(delta) > 1e-12
        parameter = np.zeros(len(delta))
        parameter[valid] = (along - first[valid, 0]) / delta[valid]
        valid &= (parameter >= -1e-9) & (parameter <= 1 + 1e-9)
        section = first[valid] + parameter[valid, None] * (second[valid] - first[valid])
        onPlane = first[np.abs(first[:, 0] - along) < 1e-9]
        if len(onPlane):
            section = np.concatenate((section, onPlane))
        if len(section) >= 4:
            return section[:, 1:].min(axis=0), section[:, 1:].max(axis=0), 'actual surface/long-axis-plane intersections'
    # Pure plans without triangle records still use nearby vertex rings, not
    # the wider foot/end bounds of a tapered member whenever a ring is present.
    distance = np.abs(coords[:, 0] - along)
    band = coords[distance <= max(.018, float(distance.min()) + .003)]
    if len(band) >= 4:
        return band[:, 1:].min(axis=0), band[:, 1:].max(axis=0), 'nearby source vertex ring fallback'
    return coords[:, 1:].min(axis=0), coords[:, 1:].max(axis=0), 'whole-member bound fallback'


def PlanTimberDamage(name, worldPoints, bedCenter=(0., 0., .45), strength=1., includeDrySplits=True, surfaceFaces=None):
    """Pure bounded plan for named posts and visible rails; no random field."""
    lower = name.lower()
    if not name.startswith('FRAME_'):
        return {'object': name, 'skip': 'outside explicit FRAME_ source scope', 'regions': []}
    protected = ('load slat', 'anti-rack', 'joint shoulder', 'lap block', 'mortise',
                 'dowel', 'peg', 'hand-forged', 'iron', 'open timber grain checks')
    if any(word in lower for word in protected):
        return {'object': name, 'skip': 'joinery, bracing, hidden load slat, hardware or existing check geometry protected', 'regions': []}
    isPost = 'head post' in lower or 'foot post' in lower
    isSide = 'long load bearing side rail' in lower
    isHeadRail = 'head upper rail' in lower
    if not (isPost or isSide or isHeadRail):
        return {'object': name, 'skip': 'not selected by the sparse visible-member plan', 'regions': []}
    if not np.isfinite(strength) or not .35 <= strength <= 1.25:
        raise ValueError('Damage strength must stay in .35..1.25')
    center, axes, coords = MemberFrame(worldPoints)
    low, high = coords.min(axis=0), coords.max(axis=0)
    span = high - low
    if span[0] < .24 or min(span[1:]) < .035:
        return {'object': name, 'skip': 'member too small for a bounded visible chip', 'regions': []}
    radial = center - np.asarray(bedCenter)
    radial[2] = 0
    signs = [1 if axes[:, axis] @ radial >= 0 else -1 for axis in (1, 2)]
    corner = [float(high[axis] if sign > 0 else low[axis]) for axis, sign in zip((1, 2), signs)]
    regions = []

    def Add(kind, vertices, faces, volume, **details):
        points = np.asarray(vertices)
        regions.append({'kind': kind, 'worldBoundsMin': points.min(axis=0).tolist(),
                        'worldBoundsMax': points.max(axis=0).tolist(),
                        'cutterVolumeM3': volume, 'cutterVerticesWorld': points.tolist(),
                        'cutterFaces': [list(face) for face in faces], **details})

    if isPost:
        # World up must follow the positive long end for this post-only rule.
        if axes[2, 0] < .85:
            return {'object': name, 'skip': 'post is not sufficiently vertical for a safe top-end plan', 'regions': []}
        front = center[1] < float(bedCenter[1])
        visibleFoot = lower.endswith('foot post.001')
        hiddenFoot = lower.endswith('foot post')
        length = (.045 if visibleFoot else .038 if front else .029) * strength
        along = float(high[0] - (.010 if visibleFoot else .009 if front else .007))
        sectionLow, sectionHigh, sectionMethod = _SectionBounds(coords, surfaceFaces, along)
        sectionSpan = sectionHigh - sectionLow
        corner = [float(sectionHigh[index] if sign > 0 else sectionLow[index]) for index, sign in enumerate(signs)]
        inset = .0015 * strength if visibleFoot else 0.
        corner = [value - sign * inset for value, sign in zip(corner, signs)]
        depth = min((.010 if visibleFoot else .0060 if front else .0041) * strength,
                    min(sectionSpan) * (.12 if visibleFoot else .075))
        vertices, faces, volume = BuildCornerWedge(center, axes, corner, signs, along, length, depth,
                                                   .61 if visibleFoot else .39 if center[0] > bedCenter[0] else .57)
        Add('ExposedPostTopCornerLoss', vertices, faces, volume, depthM=depth, lengthM=length,
            expectedSilhouetteChange=True,
            inwardOffsetM=inset, visibilityPriority='FrameJoin visible foot post' if visibleFoot else 'secondary existing wear',
            crossSectionMethod=sectionMethod, crossSectionSpanM=sectionSpan.tolist(),
            estimatedMaximumCrossSectionLossFraction=float(((depth + inset * np.sqrt(2)) * 1.2) ** 2 / np.prod(sectionSpan)))
        if includeDrySplits and (visibleFoot or (front and not hiddenFoot)):
            checkDepth = min((.0048 if visibleFoot else .0038) * strength, min(sectionSpan) * .055)
            across = corner[1] - signs[1] * min(.026 if visibleFoot else .019, sectionSpan[1] * .30)
            checkLength = min((.047 if visibleFoot else .039) * strength, .052)
            checkWidth = (.0038 if visibleFoot else .0032) * strength
            vertices, faces, volume = BuildEndCheck(center, axes, float(high[0]), corner[0], signs[0],
                                                    across, checkLength, checkWidth, checkDepth)
            Add('TopEndLongitudinalCheck', vertices, faces, volume, depthM=checkDepth,
                lengthM=checkLength, mouthWidthM=checkWidth, expectedSilhouetteChange=False,
                migratedToVisibleFootPost=visibleFoot,
                note='Secondary detail; the broader top-corner loss carries the visible silhouette change.')
    else:
        # Side rails lose an outer lower edge, preserving the bearing ledge.
        # The exposed head crossbar instead loses a small upper outside edge.
        verticalAxis = 1 if abs(axes[2, 1]) > abs(axes[2, 2]) else 2
        verticalIndex = verticalAxis - 1
        desiredVertical = 1 if isHeadRail else -1
        signs[verticalIndex] = desiredVertical * (1 if axes[2, verticalAxis] > 0 else -1)
        corner[verticalIndex] = float(high[verticalAxis] if signs[verticalIndex] > 0 else low[verticalAxis])
        front = center[1] < float(bedCenter[1])
        visibleSide = isSide and lower.endswith('side rail.001')
        positions = [.31, .73] if isSide and front else ([.57] if isSide else [.39])
        for index, fraction in enumerate(positions):
            length = (.044 if visibleSide else .061 if index == 0 else .043) * strength
            along = float(low[0] + span[0] * fraction)
            asymmetry = .61 if visibleSide else .46 if index == 0 else .62
            start, end = along - length * asymmetry, along + length * (1 - asymmetry)
            protectedEnd = min(.12, span[0] * .19)
            if start < low[0] + protectedEnd or end > high[0] - protectedEnd:
                continue
            sectionLow, sectionHigh, sectionMethod = _SectionBounds(coords, surfaceFaces, along)
            sectionSpan = sectionHigh - sectionLow
            corner = [float(sectionHigh[index] if sign > 0 else sectionLow[index]) for index, sign in enumerate(signs)]
            inset = .001 * strength if visibleSide else 0.
            corner = [value - sign * inset for value, sign in zip(corner, signs)]
            depth = min((.008 if visibleSide else .0048 if front else .0037) * strength,
                        min(sectionSpan) * (.14 if visibleSide else .075))
            vertices, faces, volume = BuildCornerWedge(center, axes, corner, signs, along, length, depth,
                                                       asymmetry)
            Add('ExposedHeadRailUpperEdgeLoss' if isHeadRail else 'OuterLowerRailSplinterLoss', vertices, faces, volume, depthM=depth, lengthM=length,
                fullCutterEndClearanceM=float(min(start - low[0], high[0] - end)),
                minimumProtectedEndClearanceM=float(protectedEnd), expectedSilhouetteChange=True,
                inwardOffsetM=inset, visibilityPriority='Frame visible outer lower rail' if visibleSide else 'secondary existing wear',
                crossSectionMethod=sectionMethod, crossSectionSpanM=sectionSpan.tolist(),
                estimatedMaximumCrossSectionLossFraction=float(((depth + inset * np.sqrt(2)) * 1.2) ** 2 / np.prod(sectionSpan)))
    return {'object': name, 'centerWorldM': center.tolist(), 'memberAxesWorld': axes.tolist(),
            'memberBoundsLocalMin': low.tolist(), 'memberBoundsLocalMax': high.tolist(),
            'memberSpanM': span.tolist(), 'regions': regions}


def _Snapshot(obj):
    mesh = obj.data
    points = np.empty((len(mesh.vertices), 3), dtype=np.float64)
    mesh.vertices.foreach_get('co', points.ravel())
    matrix = np.asarray(obj.matrix_world, dtype=np.float64)
    world = points @ matrix[:3, :3].T + matrix[:3, 3]
    mesh.calc_loop_triangles()
    faces = [tuple(face.vertices) for face in mesh.loop_triangles]
    return {'world': world, 'faces': faces, 'triangles': len(faces), 'vertices': len(points)}


def _Integrity(mesh):
    import bmesh
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        return {'boundaryEdges': sum(edge.is_boundary for edge in bm.edges),
                'nonManifoldEdges': sum(not edge.is_manifold for edge in bm.edges),
                'looseVertices': sum(not vertex.link_faces for vertex in bm.verts)}
    finally:
        bm.free()


def _PrepareClosedMember(obj):
    """Sew imported coincident seams before asking Boolean for a solid loss."""
    import bmesh
    before = _Snapshot(obj)
    integrityBefore = _Integrity(obj.data)
    worldScale = max(float(np.linalg.norm(np.asarray(obj.matrix_world)[:3, :3], axis=0).max()), 1e-12)
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.000001 / worldScale)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    obj.data.update()
    after = _Snapshot(obj)
    integrityAfter = _Integrity(obj.data)
    if integrityAfter['boundaryEdges'] or integrityAfter['nonManifoldEdges']:
        raise ValueError('Source member is not closed after one-micron seam sewing')
    if after['triangles'] != before['triangles']:
        raise ValueError('Seam preparation unexpectedly changed source triangle count')
    volume = _SignedVolume(after['world'] - after['world'].mean(axis=0), after['faces'])
    if volume <= 1e-10:
        raise ValueError('Prepared source member lacks a positive closed volume')
    return {'worldSeamWeldToleranceM': .000001, 'verticesBefore': before['vertices'],
            'verticesAfter': after['vertices'], 'trianglesBefore': before['triangles'],
            'trianglesAfter': after['triangles'], 'integrityBefore': integrityBefore,
            'integrityAfter': integrityAfter, 'closedSignedVolumeM3': float(volume),
            'faceNormalsReorientedOutward': True, 'sourceCornerAttributesRetained': True}


def _ApplyCutter(obj, region):
    import bpy
    cutterMesh = bpy.data.meshes.new('Mesh_TemporaryTimberLossCutter')
    cutterMesh.from_pydata(region['cutterVerticesWorld'], [], region['cutterFaces'])
    cutterMesh.update()
    cutter = bpy.data.objects.new('Object_TemporaryTimberLossCutter', cutterMesh)
    bpy.context.scene.collection.objects.link(cutter)
    modifier = None
    try:
        cutter.hide_render = True
        modifier = obj.modifiers.new('LocalizedTimberLoss', 'BOOLEAN')
        modifier.operation = 'DIFFERENCE';modifier.solver = 'EXACT';modifier.object = cutter
        bpy.ops.object.select_all(action='DESELECT')
        obj.hide_set(False);obj.select_set(True);bpy.context.view_layer.objects.active = obj
        bpy.context.view_layer.update()
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        modifier = None
        obj.data.update()
    finally:
        if modifier is not None:
            obj.modifiers.remove(modifier)
        bpy.data.objects.remove(cutter, do_unlink=True)
        if cutterMesh.users == 0:
            bpy.data.meshes.remove(cutterMesh)


def _Layer(mesh, name, dataType, domain):
    layer = mesh.attributes.get(name)
    if layer is not None and (layer.domain != domain or layer.data_type != dataType):
        raise ValueError('Incompatible timber damage attribute: ' + name)
    return layer or mesh.attributes.new(name=name, type=dataType, domain=domain)


def _MaximumNewCutDepth(original, result, region):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons(original['world'].tolist(), original['faces'], all_triangles=True)
    low = np.asarray(region['worldBoundsMin']) - .0005
    high = np.asarray(region['worldBoundsMax']) + .0005
    maximum = 0.
    for face in result['faces']:
        point = result['world'][list(face)].mean(axis=0)
        if np.all(point >= low) and np.all(point <= high):
            maximum = max(maximum, float(tree.find_nearest(Vector(point))[3]))
    return maximum


def _MarkExposedCuts(obj, original, regions):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    mesh = obj.data
    result = _Snapshot(obj)
    oldTree = BVHTree.FromPolygons(original['world'].tolist(), original['faces'], all_triangles=True)
    newTree = BVHTree.FromPolygons(result['world'].tolist(), result['faces'], all_triangles=True)
    depths = np.zeros(len(mesh.polygons), dtype=np.float32)
    masks = np.zeros(len(mesh.polygons), dtype=np.int32)
    ids = np.zeros(len(mesh.polygons), dtype=np.int32)
    for face in mesh.polygons:
        point = result['world'][list(face.vertices)].mean(axis=0)
        distance = float(oldTree.find_nearest(Vector(point))[3])
        if distance <= .00015:
            continue
        for index, region in enumerate(regions, 1):
            low = np.asarray(region['worldBoundsMin']) - .001
            high = np.asarray(region['worldBoundsMax']) + .001
            if np.all(point >= low) and np.all(point <= high):
                masks[face.index], depths[face.index], ids[face.index] = 1, distance, index
                break
    _Layer(mesh, _FaceMask, 'INT', 'FACE').data.foreach_set('value', masks)
    _Layer(mesh, _FaceDepth, 'FLOAT', 'FACE').data.foreach_set('value', depths)
    _Layer(mesh, _FaceRegion, 'INT', 'FACE').data.foreach_set('value', ids)
    # New fracture planes should read as a few wood facets, not inherit a
    # rounded exterior's interpolated custom normals across the cut mouth.
    for face in mesh.polygons:
        if masks[face.index]:
            face.use_smooth = False
    if mesh.has_custom_normals:
        mesh.normals_split_custom_set(np.zeros((len(mesh.loops), 3), dtype=np.float32))
    colors = np.ones((len(mesh.loops), 4), dtype=np.float32)
    loopFaces = np.repeat(np.arange(len(mesh.polygons)), [face.loop_total for face in mesh.polygons])
    colors[:, 0], colors[:, 1], colors[:, 2] = masks[loopFaces], depths[loopFaces], ids[loopFaces] / 32
    layer = mesh.color_attributes.get(_CornerData)
    if layer is None:
        layer = mesh.color_attributes.new(name=_CornerData, type='FLOAT_COLOR', domain='CORNER')
    layer.data.foreach_set('color', colors.ravel())
    adjacent = [[] for _ in mesh.edges]
    for face in mesh.polygons:
        for loopIndex in face.loop_indices:
            adjacent[mesh.loops[loopIndex].edge_index].append(face.index)
    mouth = np.asarray([int(any(masks[index] for index in faces) and not all(masks[index] for index in faces))
                        for faces in adjacent], dtype=np.int32)
    _Layer(mesh, _MouthAttribute, 'INT', 'EDGE').data.foreach_set('value', mouth)
    protected = set()
    for face in mesh.polygons:
        if masks[face.index]:
            protected.update(face.vertices)
    rim = set(protected)
    for face in mesh.polygons:
        if any(index in rim for index in face.vertices):
            protected.update(face.vertices)
    group = obj.vertex_groups.get(_PreserveGroup) or obj.vertex_groups.new(name=_PreserveGroup)
    if len(mesh.vertices):
        group.remove(list(range(len(mesh.vertices))))
    if protected:
        group.add(sorted(protected), 1., 'REPLACE')
    forward = [float(oldTree.find_nearest(Vector(point))[3]) for point in result['world']]
    reverse = [float(newTree.find_nearest(Vector(point))[3]) for point in original['world']]
    return {'exposedCutFaces': int(masks.sum()), 'mouthEdges': int(mouth.sum()),
            'flatShadedExposedFaces': int(masks.sum()),
            'protectedDamageVertices': len(protected), 'maximumCutFaceDepthM': float(depths.max(initial=0)),
            'maximumNewVertexDistanceToOriginalSurfaceM': max(forward, default=0.),
            'maximumOriginalVertexDistanceToNewSurfaceM': max(reverse, default=0.),
            'maximumVertexDisplacementM': max(max(forward + reverse, default=0.), float(depths.max(initial=0))),
            'displacementMetric': 'Nearest-surface change sampled bidirectionally at vertices and at result cut-face centres; not one-to-one vertex correspondence after topology changes.'}


def DamageTimberMembers(frameObjects, maximumMembers=7, maximumAddedTriangles=1200,
                        gameTriangleTarget=7200, strength=1., includeDrySplits=True):
    """Apply sparse source damage and return a JSON-safe, stage-local receipt."""
    import bpy
    objects = list(frameObjects)
    if not objects or any(obj.type != 'MESH' or not obj.name.startswith('FRAME_') for obj in objects):
        raise ValueError('DamageTimberMembers accepts only explicit FRAME_ source meshes')
    if not 1 <= maximumMembers <= 10 or maximumAddedTriangles < 0 or not 6000 <= gameTriangleTarget <= 7500:
        raise ValueError('Invalid bounded timber-damage budget')
    config = {'maximumMembers': maximumMembers, 'maximumAddedTriangles': maximumAddedTriangles,
              'gameTriangleTarget': gameTriangleTarget, 'strength': strength, 'includeDrySplits': includeDrySplits}
    configHash = _Hash(json.dumps(config, sort_keys=True).encode('utf-8'))
    snapshots = {obj: _Snapshot(obj) for obj in objects}
    allPoints = np.concatenate([item['world'] for item in snapshots.values()])
    bedCenter = (allPoints.min(axis=0) + allPoints.max(axis=0)) * .5
    selected = list(bpy.context.selected_objects)
    active = bpy.context.view_layer.objects.active
    visibility = {obj: (obj.hide_get(), obj.hide_render) for obj in objects}
    rows, changedMembers, addedTriangles, alreadyApplied = [], 0, 0, 0
    try:
        for obj in sorted(objects, key=lambda item: item.name):
            original = snapshots[obj]
            if obj.get('TimberDamageVersion') == _Version:
                if obj.get('TimberDamageConfigHash') != configHash:
                    raise ValueError('Restore the undamaged source before changing damage settings: ' + obj.name)
                alreadyApplied += 1
                rows.append({'object': obj.name, 'skipped': 'this independent damage version already applied'})
                continue
            plan = PlanTimberDamage(obj.name, original['world'], bedCenter, strength, includeDrySplits)
            if not plan['regions'] or changedMembers >= maximumMembers:
                rows.append({'object': obj.name, 'skipped': plan.get('skip', 'sparse member cap reached')})
                continue
            if len(obj.modifiers):
                rows.append({'object': obj.name, 'skipped': 'existing modifier stack must be resolved explicitly before source damage'})
                continue
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            memberBackup = obj.data.copy()
            try:
                seamPreparation = _PrepareClosedMember(obj)
                preparedSource = _Snapshot(obj)
                plan = PlanTimberDamage(obj.name, preparedSource['world'], bedCenter, strength,
                                        includeDrySplits, preparedSource['faces'])
            except Exception as error:
                failed = obj.data;obj.data = memberBackup
                if failed.users == 0:
                    bpy.data.meshes.remove(failed)
                rows.append({'object': obj.name, 'skipped': 'solid source preparation failed',
                             'reason': str(error), 'meshAndAttributesRestored': True})
                continue
            complete, rejected = [], []
            baselineIntegrity = _Integrity(obj.data)
            for region in plan['regions']:
                backup = obj.data.copy()
                beforeCut = _Snapshot(obj)
                beforeCount = beforeCut['triangles']
                try:
                    _ApplyCutter(obj, region)
                    current = _Snapshot(obj)
                    integrity = _Integrity(obj.data)
                    delta = current['triangles'] - beforeCount
                    if current['triangles'] < max(4, beforeCount * .70):
                        raise ValueError('Loss would remove an excessive part of the member')
                    if integrity['boundaryEdges'] > baselineIntegrity['boundaryEdges'] or integrity['nonManifoldEdges'] > baselineIntegrity['nonManifoldEdges']:
                        raise ValueError('Loss would increase boundary/non-manifold edges')
                    if addedTriangles + delta > maximumAddedTriangles:
                        raise ValueError('Source added-triangle cap reached')
                    if np.any(current['world'].min(axis=0) < original['world'].min(axis=0) - 1e-6) or np.any(current['world'].max(axis=0) > original['world'].max(axis=0) + 1e-6):
                        raise ValueError('Subtractive loss unexpectedly expanded the original bounds')
                    actualCutDepth = _MaximumNewCutDepth(beforeCut, current, region)
                    if actualCutDepth < min(.00025, region['depthM'] * .10):
                        raise ValueError('Cutter did not produce a measurable interior cut surface')
                    complete.append({**region, 'trianglesAdded': delta, 'maximumNewTriangleCenterDepthM': actualCutDepth, 'result': 'PASS'})
                    addedTriangles += delta
                    bpy.data.meshes.remove(backup)
                except Exception as error:
                    failed = obj.data;obj.data = backup
                    if failed.users == 0:
                        bpy.data.meshes.remove(failed)
                    rejected.append({'kind': region['kind'], 'reason': str(error), 'meshAndAttributesRestored': True})
            if complete:
                try:
                    marks = _MarkExposedCuts(obj, original, complete)
                except Exception:
                    failed = obj.data;obj.data = memberBackup
                    if failed.users == 0:
                        bpy.data.meshes.remove(failed)
                    raise
                obj['TimberDamageVersion'] = _Version;obj['TimberDamageConfigHash'] = configHash
                changedMembers += 1
                result = _Snapshot(obj)
                rows.append({'object': obj.name, 'trianglesBefore': original['triangles'], 'trianglesAfter': result['triangles'],
                             'regions': complete, 'rejectedRegions': rejected, 'memberAxesWorld': plan['memberAxesWorld'],
                             'solidSourcePreparation': seamPreparation,
                             'integrityBefore': baselineIntegrity, 'integrityAfter': _Integrity(obj.data), **marks})
                bpy.data.meshes.remove(memberBackup)
            else:
                failed = obj.data;obj.data = memberBackup
                if failed.users == 0:
                    bpy.data.meshes.remove(failed)
                rows.append({'object': obj.name, 'skipped': 'no safe cutter completed', 'rejectedRegions': rejected})
    finally:
        bpy.ops.object.select_all(action='DESELECT')
        for obj, (hidden, hideRender) in visibility.items():
            obj.hide_set(hidden);obj.hide_render = hideRender
        for obj in selected:
            if bpy.data.objects.get(obj.name) == obj:
                obj.select_set(True)
        if active is not None and bpy.data.objects.get(active.name) == active:
            bpy.context.view_layer.objects.active = active
    beforeTotal = sum(item['triangles'] for item in snapshots.values())
    afterTotal = sum(_Snapshot(obj)['triangles'] for obj in objects)
    return {'result': 'PASS' if changedMembers or alreadyApplied else 'NO_NEW_DAMAGE', 'version': _Version,
            'geometryVersionIndependentOfTimberV1': True, 'frameSourceObjects': len(objects),
            'damagedMembers': changedMembers, 'alreadyAppliedMembers': alreadyApplied,
            'geometryChangedThisPass': changedMembers > 0,
            'completedRegions': sum(len(row.get('regions', [])) for row in rows),
            'sourceTrianglesBefore': beforeTotal, 'sourceTrianglesAfter': afterTotal,
            'addedSourceTriangles': afterTotal - beforeTotal, 'maximumAddedSourceTriangles': maximumAddedTriangles,
            'maximumVertexDisplacementM': max((row.get('maximumVertexDisplacementM', 0.) for row in rows), default=0.),
            'onlyFrameObjectsTouched': True, 'temporaryCuttersRemaining': 0,
            'recommendedGameFrameTriangles': gameTriangleTarget, 'gameFrameHardTriangleLimit': 7500,
            'preserveVertexGroup': _PreserveGroup,
            'damageAttributes': {'faceMask': _FaceMask, 'faceDepthMeters': _FaceDepth, 'faceRegion': _FaceRegion,
                                 'cornerData': _CornerData, 'cornerChannels': 'R=cut-face mask, G=depth metres, B=region/32, A=1',
                                 'mouthEdges': _MouthAttribute},
            'integration': 'Damage High FRAME_ sources, then WeatherTimberFrame. Preserve cut faces, mouth and one-ring neighbours during Game reduction; verify each major loss on the final low mesh. Other five game components must remain frozen.',
            'limitation': 'Stage-local geometric bounds do not certify structural engineering or final low-mesh visibility; this module does not impose the complete-bed 50000-triangle gate.',
            'objects': rows}
