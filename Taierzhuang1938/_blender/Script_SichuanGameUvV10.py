"""Build a unique, audited second UV set on the V10 game hierarchy only.

BuildGameUv(root, reviewPath) preserves the first SurfaceUV layer byte for
byte.  High objects are never selected for editing.  UV coverage is checked
against actual 1024 pixel centres as well as exact triangle intersections.
"""
import array
import hashlib
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree


partNames = ('Pack_Bundle', 'Pack_Binding', 'Pack_Jacket', 'Pack_StrawMat', 'Pack_Sandals')


def UvHash(layer):
    values = array.array('f', [0]) * (len(layer.data)*2)
    layer.data.foreach_get('uv', values)
    return hashlib.sha256(values.tobytes()).hexdigest()


def Part(obj, root):
    owner = obj
    while owner.parent is not None and owner.parent != root:
        owner = owner.parent
    if owner.name not in partNames:
        raise RuntimeError('Game mesh has no canonical part: ' + obj.name)
    return owner.name


def SignedArea(points):
    return .5*sum(a[0]*b[1]-b[0]*a[1] for a, b in zip(points, points[1:]+points[:1]))


def IntersectionArea(subject, clip):
    if SignedArea(clip) < 0:
        clip = list(reversed(clip))
    points = subject
    for a, b in zip(clip, clip[1:]+clip[:1]):
        if not points:
            return 0.0
        result = []
        def Side(point):
            return (b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0])
        for p, q in zip(points, points[1:]+points[:1]):
            sp, sq = Side(p), Side(q)
            pin, qin = sp >= -1e-13, sq >= -1e-13
            if pin:
                result.append(p)
            if pin != qin and abs(sp-sq) > 1e-19:
                t = sp/(sp-sq)
                result.append((p[0]+(q[0]-p[0])*t, p[1]+(q[1]-p[1])*t))
        points = result
    return abs(SignedArea(points)) if len(points) >= 3 else 0.0


def PixelCovered(points, resolution=1024):
    """Find a pixel centre strictly inside the triangle, without a raster lib."""
    points = [(p[0]*resolution, p[1]*resolution) for p in points]
    low = max(0, math.ceil(min(p[1] for p in points)-.5))
    high = min(resolution-1, math.floor(max(p[1] for p in points)-.5))
    edges = list(zip(points, points[1:]+points[:1]))
    for y in range(low, high+1):
        py, cuts = y+.5, []
        for a, b in edges:
            if abs(b[1]-a[1]) < 1e-12:
                continue
            t = (py-a[1])/(b[1]-a[1])
            if 0 <= t <= 1:
                cuts.append(a[0]+t*(b[0]-a[0]))
        if len(cuts) >= 2:
            left, right = min(cuts), max(cuts)
            x = max(0, math.ceil(left-.5+1e-6))
            last=min(resolution-1,math.floor(right-.5-1e-6))
            for px in range(x,last+1):
                crosses=[(b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px+.5-a[0]) for a,b in edges]
                if all(value>1e-9 for value in crosses) or all(value < -1e-9 for value in crosses):
                    return True
    return False


def Rows(meshes, root):
    result = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        uv = obj.data.uv_layers['GameUV'].data
        part = Part(obj, root)
        for triangle in obj.data.loop_triangles:
            points = [tuple(uv[index].uv) for index in triangle.loops]
            result.append({'object': obj.name, 'part': part, 'polygon': triangle.polygon_index,
                           'uvBottom': points, 'uv': [[float(p[0]), float(1-p[1])] for p in points]})
    return result


def Audit(rows):
    grid, buckets, pairs = 64, {}, set()
    misses, degenerate, outside, overlap = set(), set(), set(), set()
    bounds = []
    minimumArea = float('inf')
    for index, row in enumerate(rows):
        points = row['uvBottom']
        key = (row['object'], row['polygon'])
        area = abs(SignedArea(points))
        minimumArea = min(minimumArea, area*1024*1024)
        if area <= 1e-15:
            degenerate.add(key)
        if any(not math.isfinite(value) or value < -1e-7 or value > 1+1e-7
               for point in points for value in point):
            outside.add(key)
        if not PixelCovered(points):
            misses.add(key)
        low = [min(point[axis] for point in points) for axis in (0, 1)]
        high = [max(point[axis] for point in points) for axis in (0, 1)]
        bounds.append((low, high))
        for x in range(max(0, int(low[0]*grid)), min(grid-1, int(high[0]*grid))+1):
            for y in range(max(0, int(low[1]*grid)), min(grid-1, int(high[1]*grid))+1):
                bucket = buckets.setdefault((x, y), [])
                pairs.update((other, index) for other in bucket)
                bucket.append(index)
    for a, b in pairs:
        lowA, highA = bounds[a]
        lowB, highB = bounds[b]
        if any(highA[axis] <= lowB[axis]+1e-11 or highB[axis] <= lowA[axis]+1e-11 for axis in (0, 1)):
            continue
        if IntersectionArea(rows[a]['uvBottom'], rows[b]['uvBottom']) > 1e-11:
            overlap.add((rows[a]['object'], rows[a]['polygon']))
            overlap.add((rows[b]['object'], rows[b]['polygon']))
    rawMisses={(row['object'],row['polygon'])for row in rows if not PixelCovered(row['uvBottom'],2048)}
    return {'misses': misses, 'rawMisses':rawMisses, 'degenerate': degenerate, 'outside': outside,
            'overlap': overlap, 'minimumTriangleAreaPixels': minimumArea}


def Islands(obj):
    """UV-continuous face components, independent of inherited seam flags."""
    mesh, uv = obj.data, obj.data.uv_layers['GameUV'].data
    edges, neighbors = {}, {face.index: set() for face in mesh.polygons}
    for face in mesh.polygons:
        loops = list(face.loop_indices)
        for a, b in zip(loops, loops[1:]+loops[:1]):
            va, vb = mesh.loops[a].vertex_index, mesh.loops[b].vertex_index
            if va > vb:
                va, vb, a, b = vb, va, b, a
            signature = ((round(uv[a].uv.x, 7), round(uv[a].uv.y, 7)),
                         (round(uv[b].uv.x, 7), round(uv[b].uv.y, 7)))
            key = (va, vb, signature)
            owners = edges.setdefault(key, [])
            for other in owners:
                neighbors[other].add(face.index)
                neighbors[face.index].add(other)
            owners.append(face.index)
    unseen, result = set(neighbors), []
    while unseen:
        seed = unseen.pop()
        island, stack = {seed}, [seed]
        while stack:
            for other in neighbors[stack.pop()]:
                if other in unseen:
                    unseen.remove(other)
                    island.add(other)
                    stack.append(other)
        result.append(island)
    return result


def WeightIslands(meshes, root):
    points, faces = [], []
    rootInverse = root.matrix_world.inverted_safe()
    for obj in meshes:
        transform = rootInverse @ obj.matrix_world
        offset = len(points)
        points.extend(transform @ vertex.co for vertex in obj.data.vertices)
        faces.extend(tuple(offset+index for index in face.vertices) for face in obj.data.polygons)
    tree = BVHTree.FromPolygons(points, faces, all_triangles=False)
    directions = [Vector(value) for value in ((0, -1, 0), (0, 1, 0), (1, 0, 0),
                                              (-1, 0, 0), (0, 0, 1), (0, 0, -1))]
    allocation = []
    for obj in meshes:
        part = Part(obj, root)
        transform = rootInverse @ obj.matrix_world
        normalTransform = transform.to_3x3().inverted_safe().transposed()
        priorities = {}
        for face in obj.data.polygons:
            center = transform @ face.center
            normal = (normalTransform @ face.normal).normalized()
            visible = []
            for index, direction in enumerate(directions):
                hit = tree.ray_cast(center+direction*.75, -direction, 1.5)[0]
                if hit is not None and (hit-center).length < .0010:
                    visible.append(index)
            if part == 'Pack_Jacket':
                priority = 1.65 if 0 in visible and center.y < -.095 else (.42 if visible else .28)
            elif part == 'Pack_Bundle':
                priority = (1.65 if 0 in visible and normal.y < -.3 else
                            .80 if 1 in visible and normal.y > .3 else
                            1.12 if visible else .40)
            elif part == 'Pack_Sandals':
                priority = 1.50 if visible else .90
            elif part == 'Pack_Binding':
                priority = 1.30 if visible else .65
            else:
                priority = 1.15 if visible else .65
            priorities[face.index] = priority
        uv = obj.data.uv_layers['GameUV'].data
        for island in Islands(obj):
            area = sum(obj.data.polygons[index].area for index in island)
            priority = sum(obj.data.polygons[index].area*priorities[index] for index in island)/max(area, 1e-15)
            if 'RepairPatch' in obj.name:
                priority *= 1.45
            if 'RepairStitch' in obj.name:
                priority *= 3.0
            if 'Spiral' in obj.name or 'RolledMatEndCaps' in obj.name:
                priority *= 1.8
            if 'BraidedRim' in obj.name:
                priority *= 2.5
            loopIds = {loop for index in island for loop in obj.data.polygons[index].loop_indices}
            center = sum((uv[index].uv for index in loopIds), Vector((0, 0)))/len(loopIds)
            for index in loopIds:
                uv[index].uv = center+(uv[index].uv-center)*priority
            allocation.append({'object': obj.name, 'part': part, 'faces': len(island),
                               'areaM2': area, 'linearPriority': priority})
    return allocation


def IsolateFace(obj, index, boost=1.8):
    """Give a failed thin/folded polygon its own adequately wide UV island."""
    mesh = obj.data
    face = mesh.polygons[index]
    uv = mesh.uv_layers['GameUV'].data
    loops = list(face.loop_indices)
    positions = [mesh.vertices[mesh.loops[loop].vertex_index].co for loop in loops]
    edges = [(b-a, a) for a, b in zip(positions, positions[1:]+positions[:1])]
    axis, origin = max(edges, key=lambda item: item[0].length_squared)
    axis = axis.normalized()
    vertical = face.normal.cross(axis).normalized()
    if vertical.length < .1 or face.area < 1e-17:
        raise RuntimeError('Game geometry contains an unrepresentable degenerate face: ' + obj.name)
    original = [tuple(uv[loop].uv) for loop in loops]
    density = math.sqrt(max(abs(SignedArea(original)), 2/(1024*1024))/max(face.area, 1e-17))
    coordinates = [((point-origin).dot(axis)*density, (point-origin).dot(vertical)*density) for point in positions]
    low = [min(point[axis] for point in coordinates) for axis in (0, 1)]
    span = [max(point[axis] for point in coordinates)-low[axis] for axis in (0, 1)]
    # This is a PRE-pack floor, not a promised final pixel width.  Global
    # packing can shrink a newly isolated face by several times.  Reserve
    # fourteen pre-pack texels on each narrow dimension, then prove coverage
    # again on the actual final atlas rather than oscillating around one pixel.
    scale = [max(boost, .014/max(value, 1e-14)) for value in span]
    offset = Vector((3+index*.021, 3+index*.013))
    for loop, point in zip(loops, coordinates):
        uv[loop].uv = offset+Vector(((point[0]-low[0])*scale[0], (point[1]-low[1])*scale[1]))


def AlignIsolatedPixelCenters(meshes, misses, resolution=1024):
    """Translate only singleton charts by <= half a texel on each axis.

    A thin triangle can miss the pixel lattice despite adequate area. Its
    centroid is interior, so aligning it to an actual texel centre resolves
    that phase issue without stretching the chart or changing a surface.
    The caller must rerun every overlap/outside/coverage gate afterwards.
    """
    changes=[]
    for obj in meshes:
        wanted={face for name,face in misses if name==obj.name}
        if not wanted:continue
        single={next(iter(island))for island in Islands(obj)if len(island)==1}
        uv=obj.data.uv_layers['GameUV'].data
        for index in sorted(wanted&single):
            face=obj.data.polygons[index]
            if len(face.vertices)!=3:raise RuntimeError('Pixel alignment requires explicit triangles')
            center=sum((uv[loop].uv for loop in face.loop_indices),Vector((0,0)))/3
            target=Vector(((math.floor(center.x*resolution)+.5)/resolution,
                           (math.floor(center.y*resolution)+.5)/resolution))
            shift=target-center
            if max(abs(value)for value in shift)>.50001/resolution:
                raise RuntimeError('Pixel-centre shift exceeds half a texel')
            for loop in face.loop_indices:uv[loop].uv+=shift
            changes.append({'object':obj.name,'polygon':index,'uvTranslation':list(shift),
                            'texelTranslation':[value*resolution for value in shift]})
    return changes


def TriangulateGameMesh(obj):
    """Make every polygon independently unwrap-safe without adding triangles.

    A nonplanar quad can fold over itself after planar UV isolation.  The
    renderer already tessellates it; make that tessellation explicit before
    hashing SurfaceUV.  BMesh copies every authored UV corner to its generated
    triangles rather than reprojecting or resetting the source layer.
    """
    mesh = obj.data
    mesh.calc_loop_triangles()
    beforeTriangles = len(mesh.loop_triangles)
    beforeFaces = len(mesh.polygons)
    source = mesh.uv_layers[0] if mesh.uv_layers else None
    beforeUv = UvHash(source) if source else None
    beforeLoops = len(mesh.loops)
    if any(len(face.vertices) != 3 for face in mesh.polygons):
        bm = bmesh.new()
        try:
            bm.from_mesh(mesh)
            bmesh.ops.triangulate(bm, faces=list(bm.faces),
                                  quad_method='BEAUTY', ngon_method='BEAUTY')
            bm.to_mesh(mesh)
        finally:
            bm.free()
        mesh.update()
    mesh.calc_loop_triangles()
    if len(mesh.loop_triangles) != beforeTriangles or any(len(face.vertices) != 3 for face in mesh.polygons):
        raise RuntimeError('Explicit game tessellation changed its triangle budget: ' + obj.name)
    return {'object': obj.name, 'facesBefore': beforeFaces, 'facesAfter': len(mesh.polygons),
            'trianglesBefore': beforeTriangles, 'trianglesAfter': len(mesh.loop_triangles),
            'sourceUvHashBeforeTessellation': beforeUv, 'sourceLoopsBefore': beforeLoops,
            'sourceLoopsAfter': len(mesh.loops),
            'sourceUvPreservation': 'BMesh copies authored UV corners to explicit triangles; atlas baseline hash is taken after tessellation'}


def SelectGameUvs(meshes):
    # The UV selection operator can require an Image Editor area.  Set only
    # this atlas layer's loop flags through the data API before entering edit
    # mode, so MCP's Text/3D editor context cannot leave islands unselected.
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    for obj in meshes:
        layer = obj.data.uv_layers['GameUV']
        for loop in layer.data:
            if hasattr(loop, 'select'):
                loop.select = True
                loop.select_edge = True


def BuildGameUv(root, reviewPath, resumeExisting=False):
    if root is None or root.name != 'Pack_Root' or root.get('PackSourceName'):
        raise RuntimeError('Pass the low game Pack_Root only')
    meshes = sorted([obj for obj in root.children_recursive if obj.type == 'MESH'], key=lambda obj: obj.name)
    if not meshes or any(obj.name.startswith('High_') for obj in meshes):
        raise RuntimeError('High meshes must not occur below the game root')
    if any(Part(obj, root) not in partNames for obj in meshes):
        raise RuntimeError('Unknown game part')
    if bpy.context.mode != 'OBJECT':
        raise RuntimeError('BuildGameUv must start in Object mode to protect unrelated edit data')
    reviewPath = Path(reviewPath)
    reviewPath.mkdir(parents=True, exist_ok=True)
    viewLayer = bpy.context.view_layer
    selectedBefore = list(bpy.context.selected_objects)
    activeBefore = viewLayer.objects.active
    owned = [root, *root.children_recursive]
    hiddenBefore = [(obj, obj.hide_get(), obj.hide_viewport) for obj in owned]
    sourceHashes, createdSource, triangulation = {}, [], []
    history, allocation = [], []
    try:
        for obj in selectedBefore:
            obj.select_set(False)
        for obj in owned:
            obj.hide_viewport = False
            obj.hide_set(False)
        for obj in meshes:
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            triangulation.append(TriangulateGameMesh(obj))
            layers = obj.data.uv_layers
            if not layers:
                layers.new(name='SurfaceUV')
                createdSource.append(obj.name)
            # Builders currently supply one authored source layer.  Preserve
            # it, and replace only our previous second atlas on repeat calls.
            first = layers[0]
            if first.name != 'SurfaceUV':
                first.name = 'SurfaceUV'
            for layer in list(layers)[1:]:
                if layer.name != 'GameUV':
                    raise RuntimeError('Unexpected extra source UV layer: ' + obj.name)
                if not resumeExisting:layers.remove(layer)
            sourceHashes[obj.name] = UvHash(first)
            if resumeExisting and (len(layers)!=2 or layers.get('GameUV')is None):
                raise RuntimeError('Resume requires the actual existing second atlas')
            atlas = layers.get('GameUV') if resumeExisting else layers.new(name='GameUV', do_init=False)
            layers.active_index = 1
            atlas.active_render = True
            obj.select_set(True)
        viewLayer.objects.active = meshes[0]
        bpy.context.view_layer.update()
        override = {'scene': bpy.context.scene, 'view_layer': viewLayer,
                    'object': meshes[0], 'active_object': meshes[0],
                    'selected_objects': meshes, 'selected_editable_objects': meshes}
        if bpy.context.window is not None:
            override['window'] = bpy.context.window
        if resumeExisting:
            previous=json.loads((reviewPath/'Data_GameUvV10.json').read_text(encoding='utf-8'))
            if previous['preservedSurfaceUvHashes']!=sourceHashes:raise RuntimeError('Resume source UVs differ from the actual previous atlas audit')
            allocation=json.loads((reviewPath/'Data_UvVisibilityAllocation.json').read_text(encoding='utf-8'))
            history=previous['history']
        startIteration=len(history)
        with bpy.context.temp_override(**override):
            if not resumeExisting:
                SelectGameUvs(meshes)
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.uv.smart_project(angle_limit=math.radians(62), island_margin=.001,
                                         area_weight=.4, correct_aspect=True, scale_to_bounds=False)
                bpy.ops.uv.average_islands_scale()
                bpy.ops.object.mode_set(mode='OBJECT')
                allocation = WeightIslands(meshes, root)
            byName = {obj.name: obj for obj in meshes}
            for iteration in range(16):
                SelectGameUvs(meshes)
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.uv.pack_islands(rotate=True, merge_overlap=False, margin=.0035,
                                         margin_method='FRACTION', shape_method='CONVEX')
                bpy.ops.object.mode_set(mode='OBJECT')
                rows = Rows(meshes, root)
                audit = Audit(rows)
                aligned=AlignIsolatedPixelCenters(meshes,audit['misses'])
                if aligned:
                    rows=Rows(meshes,root)
                    audit=Audit(rows)
                history.append({'iteration': startIteration+iteration, 'triangles': len(rows),
                                'noPixelFaces': len(audit['misses']), 'overlappingFaces': len(audit['overlap']),
                                'noRawPixelFaces':len(audit['rawMisses']),
                                'degenerateFaces': len(audit['degenerate']), 'outsideFaces': len(audit['outside']),
                                'minimumTriangleAreaPixels': audit['minimumTriangleAreaPixels'],
                                'singletonPixelPhaseAlignments':aligned})
                print('GAME_UV_AUDIT', json.dumps(history[-1]), flush=True)
                if not any(audit[key] for key in ('misses','rawMisses', 'overlap', 'degenerate', 'outside')):
                    break
                failures = set().union(*(audit[key] for key in ('misses','rawMisses', 'overlap', 'degenerate', 'outside')))
                for name, face in failures:
                    IsolateFace(byName[name], face, boost=1.8+iteration*.4)
            else:
                raise RuntimeError('Game UV audit still fails after sixteen actual packing attempts: ' + json.dumps(history[-1]))
        for obj in meshes:
            if UvHash(obj.data.uv_layers['SurfaceUV']) != sourceHashes[obj.name]:
                raise RuntimeError('Source SurfaceUV changed during atlas creation: ' + obj.name)
            if obj.data.uv_layers[1].name != 'GameUV':
                raise RuntimeError('GameUV must export as TEXCOORD_1')
            obj.data.uv_layers.active_index = 1
            obj.data.uv_layers['GameUV'].active_render = True
        outputRows = [{key: value for key, value in row.items() if key != 'uvBottom'} for row in rows]
        (reviewPath/'Data_SurfaceUv.json').write_text(json.dumps(outputRows, separators=(',', ':'))+'\n', encoding='utf-8')
        (reviewPath/'Data_UvVisibilityAllocation.json').write_text(json.dumps(allocation, indent=2)+'\n', encoding='utf-8')
        report = {'generator': 'Script_SichuanGameUvV10.py', 'uvSet': 'GameUV', 'texCoord': 1,
                  'resolutionAudited': [1024, 1024], 'objects': len(meshes), 'triangles': len(rows),
                  'exactTriangleOverlapFree': True, 'everyTriangleContains1024PixelCenter': True,
                  'everyTriangleContains2048PixelCenter':True,'resumedExistingAtlas':resumeExisting,
                  'preservedSurfaceUvHashes': sourceHashes, 'createdBlankSourceUv': createdSource,
                  'explicitGameTriangulation': triangulation,
                  'packing': 'Global smart projection; physical-area island scale; six-direction actual game visibility priorities; conservative convex island packing with 0.0035 fractional margin; exact overlap and 1024 pixel-centre audits',
                  'history': history, 'highMeshesModified': False}
        (reviewPath/'Data_GameUvV10.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
        root['GameUvPacking'] = report['packing']
        return report
    finally:
        if bpy.context.mode != 'OBJECT' and viewLayer.objects.active in meshes:
            bpy.ops.object.mode_set(mode='OBJECT')
        for obj in meshes:
            obj.select_set(False)
        for obj, hidden, viewportHidden in hiddenBefore:
            obj.hide_set(hidden)
            obj.hide_viewport = viewportHidden
        for obj in selectedBefore:
            if obj.name in viewLayer.objects:
                obj.select_set(True)
        if activeBefore is not None and activeBefore.name in viewLayer.objects:
            viewLayer.objects.active = activeBefore
