"""Restore the visible, roughly hand-sewn lower-right V9 blanket repair.

Import with runpy and call RestoreRepairPatch(root).  This is a high-model
construction pass: it does not execute on import, save a file or start Blender.
The existing visible SideFoldSeparation state is frozen once before removing
only the joined legacy repair faces (material slots >= 3) and unused vertices.
New geometry is fitted to the outermost actual blanket/front-leaf surface.
"""

import hashlib
import math
import random
import struct

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


generatorTag = 'SichuanRepairPatchV09'
legacyCleanTag = 'RepairPatchV9LegacyCleaned'
patchWidth = .0535
patchHeight = .054
patchMinX = .121
patchMinZ = -.137


def VertexDigest(mesh, facePredicate):
    used = set(index for polygon in mesh.polygons if facePredicate(polygon)
               for index in polygon.vertices)
    values = sorted(tuple(mesh.vertices[index].co) for index in used)
    digest = hashlib.sha256()
    for value in values:
        digest.update(struct.pack('<3f', *value))
    return digest.hexdigest(), len(used)


def UvDigest(mesh, facePredicate):
    # Include the attached position and material index, so an unchanged UV
    # value list reassigned to different parts would fail this comparison.
    layers = list(mesh.uv_layers)
    values = []
    for polygon in mesh.polygons:
        if not facePredicate(polygon):
            continue
        for index in polygon.loop_indices:
            position = tuple(mesh.vertices[mesh.loops[index].vertex_index].co)
            uv = tuple(value for layer in layers for value in layer.data[index].uv)
            values.append((polygon.material_index, *position, *uv))
    digest = hashlib.sha256()
    for value in sorted(values):
        digest.update(struct.pack('<i' + 'f' * (len(value) - 1), *value))
    return digest.hexdigest()


def RemoveLegacyJoinedRepair(body):
    if body.get(legacyCleanTag, False):
        return {'alreadyCleaned': True, 'removedFaces': 0,
                'visibleStateFrozen': True, 'retainedCoordinatesUnchanged': True,
                'retainedUvAttachmentsUnchanged': True}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    visibleMesh = bpy.data.meshes.new_from_object(
        evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
    visibleMesh.name = 'Geometry_SichuanBundleVisibleFreezeV9'
    retained = lambda polygon: polygon.material_index < 3
    expectedCoordinates, expectedCount = VertexDigest(visibleMesh, retained)
    expectedUv = UvDigest(visibleMesh, retained)
    shapeValues = ({key.name: float(key.value) for key in body.data.shape_keys.key_blocks}
                   if body.data.shape_keys else {})
    modifierNames = [modifier.name for modifier in body.modifiers]
    originalFaces = len(visibleMesh.polygons)
    originalVertices = len(visibleMesh.vertices)
    bm = bmesh.new()
    try:
        bm.from_mesh(visibleMesh)
        obsolete = [face for face in bm.faces if face.material_index >= 3]
        removedFaces = len(obsolete)
        if obsolete:
            bmesh.ops.delete(bm, geom=obsolete, context='FACES')
        isolated = [vertex for vertex in bm.verts if not vertex.link_faces]
        if isolated:
            bmesh.ops.delete(bm, geom=isolated, context='VERTS')
        bm.to_mesh(visibleMesh)
        visibleMesh.update()
    finally:
        bm.free()
    actualCoordinates, actualCount = VertexDigest(visibleMesh, lambda polygon: True)
    actualUv = UvDigest(visibleMesh, lambda polygon: True)
    try:
        assert expectedCount == actualCount, 'Legacy removal changed a retained vertex count'
        assert expectedCoordinates == actualCoordinates, 'Legacy removal changed cloth coordinates'
        assert expectedUv == actualUv, 'Legacy removal changed attached UVs'
        assert all(polygon.material_index < 3 for polygon in visibleMesh.polygons)
    except Exception:
        bpy.data.meshes.remove(visibleMesh)
        raise
    previousMesh = body.data
    body.data = visibleMesh
    # new_from_object already contains the visible result of these modifiers;
    # leaving them active would evaluate the same deformation a second time.
    for modifier in list(body.modifiers):
        body.modifiers.remove(modifier)
    if previousMesh.users == 0:
        bpy.data.meshes.remove(previousMesh)
    body[legacyCleanTag] = True
    body['RepairPatchV9FrozenShapeValues'] = str(shapeValues)
    bpy.context.view_layer.update()
    return {'alreadyCleaned': False, 'removedFaces': removedFaces,
            'removedUnusedVertices': originalVertices - len(visibleMesh.vertices),
            'originalVisibleFaces': originalFaces, 'retainedFaces': len(visibleMesh.polygons),
            'retainedVertices': actualCount, 'frozenShapeValues': shapeValues,
            'frozenModifiers': modifierNames, 'shapeKeysRemovedIntentionally': bool(shapeValues),
            'visibleStateFrozen': True, 'retainedCoordinatesUnchanged': True,
            'retainedVertexCoordinateHash': actualCoordinates,
            'retainedUvAttachmentsUnchanged': True, 'retainedUvAttachmentHash': actualUv}


class BlanketSurface:
    def __init__(self, body, leaf):
        depsgraph = bpy.context.evaluated_depsgraph_get()
        self.surfaces = []
        self.fallbackQueries = 0
        self.queryCount = 0
        for source in (body, leaf):
            if source is None or source.type != 'MESH':
                continue
            intoSource = source.matrix_world.inverted() @ body.matrix_world
            intoBody = body.matrix_world.inverted() @ source.matrix_world
            self.surfaces.append((BVHTree.FromObject(source, depsgraph), intoSource, intoBody))

    def Hits(self, x, z):
        hits = []
        for tree, intoSource, intoBody in self.surfaces:
            origin = intoSource @ Vector((x, -.40, z))
            direction = intoSource.to_3x3() @ Vector((0, 1, 0))
            scale = direction.length
            if scale < 1e-12:
                continue
            hit = tree.ray_cast(origin, direction / scale, .80 * scale)
            if hit[0] is not None:
                hits.append(intoBody @ hit[0])
        return hits

    def Y(self, x, z):
        self.queryCount += 1
        hits = self.Hits(x, z)
        if hits:
            return min(point.y for point in hits)
        # Rounded lower-right corners may narrowly leave the leaf grid.  A
        # bounded inward neighbour is allowed only as a last resort; never
        # return a fixed guessed depth or a rear surface when no cloth exists.
        for radius in (.0005, .0010, .0020, .0030):
            nearby = []
            for dx, dz in ((-radius, 0), (0, radius), (-radius, radius),
                           (radius, 0), (0, -radius)):
                nearby.extend(self.Hits(x + dx, z + dz))
            if nearby:
                self.fallbackQueries += 1
                return min(point.y for point in nearby)
        raise RuntimeError('No blanket surface within 3 mm of repair sample: %.6f, %.6f' % (x, z))


def PatchXZ(u, v):
    # A slightly skewed hand-cut scrap, with irregular soft edges.  No sharp
    # saw teeth, regular noise, frame border, or padded inset are introduced.
    x = patchMinX + patchWidth * u + .00045 * v
    z = patchMinZ + patchHeight * v - .00055 * u
    x += ((1 - u) * (.00038 * math.sin(v * 13 + .3) + .00019 * math.sin(v * 27 + 1.2))
          + u * (.00039 * math.sin(v * 17 + 2.1) + .00015 * math.sin(v * 31 + .6)))
    z += ((1 - v) * (.00042 * math.sin(u * 15 + 1.1) + .00016 * math.sin(u * 29))
          + v * (.00032 * math.sin(u * 19 + .8) + .00017 * math.sin(u * 35 + 2.4)))
    return x, z


def PatchLift(u, v):
    edgeDistance = max(0, min(u * patchWidth, (1 - u) * patchWidth,
                              v * patchHeight, (1 - v) * patchHeight))
    curl = math.exp(-(edgeDistance / .0017) ** 2)
    uneven = .00032 + .00049 * (.5 + .5 * math.sin(u * 9.1 + v * 15.3 + .8))
    corners = math.exp(-((min(u, 1-u) * patchWidth) / .004) ** 2
                       -((min(v, 1-v) * patchHeight) / .004) ** 2)
    ripple = .00014 * math.sin(u * 10 + v * 6) * math.sin(math.pi * u) * math.sin(math.pi * v)
    return .00055 + curl * uneven + .00018 * corners + ripple


def PatchMaterial(body):
    name = 'Material_SichuanV9RepairPatch'
    material = bpy.data.materials.get(name)
    if material is None:
        source = (body.data.materials[3] if len(body.data.materials) > 3
                  else next((m for m in body.data.materials if m and m.get('AtlasRegion') == 'cloth'), None))
        if source is not None:
            material = source.copy()
            material.name = name
        else:
            material = bpy.data.materials.new(name)
            material.use_nodes = True
            shader = next(n for n in material.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
            shader.inputs['Base Color'].default_value = (.23, .21, .17, 1)
            shader.inputs['Roughness'].default_value = .98
    material['AtlasRegion'] = 'cloth'
    material['WearPatch'] = True
    material['FabricExtentM'] = [patchWidth, patchHeight]
    material['RepairPatchGenerator'] = generatorTag
    return material


def StitchMaterial():
    name = 'Material_SichuanV9RepairThread'
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
    material['AtlasRegion'] = 'cloth'
    material['WearFiber'] = True
    material['RepairPatchGenerator'] = generatorTag
    material['Construction'] = 'Dull dark grey-brown cotton hand-sewing thread'
    shader = next(n for n in material.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled')
    for inputName, value in (('Metallic', 0), ('Roughness', .99),
                             ('Specular IOR Level', .13), ('Sheen Weight', .035)):
        if inputName in shader.inputs:
            shader.inputs[inputName].default_value = value
    shader.inputs['Base Color'].default_value = (.085, .070, .050, 1)
    material.diffuse_color = (.085, .070, .050, 1)
    return material


class ThreadMesh:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.strandCount = 0

    def Add(self, path, radius, taper=False):
        first = len(self.vertices)
        sides = 7
        previousSide = None
        arc = 0
        for index, point in enumerate(path):
            point = Vector(point)
            if index:
                arc += (point - Vector(path[index-1])).length
            tangent = Vector(path[min(index+1, len(path)-1)]) - Vector(path[max(0, index-1)])
            tangent.normalize()
            side = tangent.cross(Vector((0, -1, 0)))
            if side.length_squared < 1e-12:
                side = tangent.cross(Vector((0, 0, 1)))
            side.normalize()
            if previousSide is not None and side.dot(previousSide) < 0:
                side.negate()
            previousSide = side
            across = tangent.cross(side).normalized()
            fraction = index / (len(path)-1)
            thickness = radius * (max(.09, (1-fraction)**.45) if taper else 1)
            for corner in range(sides):
                angle = corner / sides * math.tau
                self.vertices.append(tuple(point + thickness * (side * math.cos(angle) + across * math.sin(angle))))
                self.uvs.append((.23 + .001 * corner / sides, .75 + .46 * arc / .08))
            if index:
                for corner in range(sides):
                    a = first + (index-1) * sides + corner
                    b = first + (index-1) * sides + (corner+1) % sides
                    self.faces.append((a, b, b+sides, a+sides))
        self.faces.extend((tuple(reversed(range(first, first+sides))),
                           tuple(range(first+(len(path)-1)*sides, first+len(path)*sides))))
        self.strandCount += 1

    def Write(self, parent, material):
        mesh = bpy.data.meshes.new('Geometry_SichuanV9RepairThread')
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        mesh.materials.append(material)
        uv = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            uv.data[loop.index].uv = self.uvs[loop.vertex_index]
        for polygon in mesh.polygons:
            polygon.use_smooth = True
        obj = bpy.data.objects.new('Pack_V9RepairHandStitches', mesh)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = parent
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj['RepairPatchV9Generator'] = generatorTag
        obj['AtlasRegion'] = 'cloth'
        obj['WearFiber'] = True
        obj['ThreadDiameterRangeM'] = [.0006, .0009]
        return obj


def BuildHandStitches(patch, surface, material):
    rng = random.Random(19380919)
    threads = ThreadMesh()
    spacings = []
    stitchCount = 0

    def Point(u, v, arch=0):
        x, z = PatchXZ(u, v)
        within = 0 <= u <= 1 and 0 <= v <= 1
        offset = PatchLift(u, v) if within else .00020
        return Vector((x, surface.Y(x, z) - offset - .00028 - arch, z))

    for edge in range(4):
        length = patchWidth if edge < 2 else patchHeight
        distance = rng.uniform(.0023, .0042)
        while distance < length - .002:
            fraction = distance / length
            alongShift = rng.uniform(-.0010, .0014) / length
            inside = rng.uniform(.0017, .0026)
            outside = rng.uniform(.0010, .0016)
            if edge == 0:
                start, end = (fraction-alongShift*.5, inside/patchHeight), (fraction+alongShift*.5, -outside/patchHeight)
            elif edge == 1:
                start, end = (fraction-alongShift*.5, 1-inside/patchHeight), (fraction+alongShift*.5, 1+outside/patchHeight)
            elif edge == 2:
                start, end = (inside/patchWidth, fraction-alongShift*.5), (-outside/patchWidth, fraction+alongShift*.5)
            else:
                start, end = (1-inside/patchWidth, fraction-alongShift*.5), (1+outside/patchWidth, fraction+alongShift*.5)
            peak = rng.uniform(.00033, .00062)
            path = []
            for index in range(9):
                t = index/8
                u, v = start[0]*(1-t)+end[0]*t, start[1]*(1-t)+end[1]*t
                path.append(Point(u, v, peak * math.sin(math.pi*t)))
            threads.Add(path, rng.uniform(.00030, .00045))
            stitchCount += 1
            step = rng.uniform(.0062, .0083)
            spacings.append(step)
            distance += step

    # Two loose dark ends at different edges; each remains attached at its
    # first point and bends with gravity, rather than becoming regular tassels.
    for u, v, sign in ((.10, .018, -1), (.982, .76, 1)):
        base = Point(u, v, .00020)
        length = rng.uniform(.0042, .0062)
        path = [base + Vector((sign * length * .36 * t,
                              -length * .23 * math.sin(math.pi*t*.8),
                              -length * (.45*t + .30*t*t))) for t in (0, .16, .34, .55, .77, 1)]
        threads.Add(path, .00033, taper=True)
    obj = threads.Write(patch, material)
    return obj, {'visibleStitchCount': stitchCount, 'looseThreadEnds': 2,
                 'nominalNeedleSpacingRangeM': [min(spacings), max(spacings)],
                 'threadDiameterRangeM': [.0006, .0009]}


def RestoreRepairPatch(root):
    """Restore one visible repair and return a JSON-safe construction report."""
    assert root and root.name == 'Pack_Root', 'Expected Pack_Root'
    assert bpy.context.scene.get('BlenderMcpTask') == 'SichuanBlanketPack', 'Wrong Blender task'
    body = bpy.data.objects.get('Pack_Bundle')
    assert body is not None and body in root.children_recursive, 'Pack body is outside this task'
    cleanReport = RemoveLegacyJoinedRepair(body)
    leaf = bpy.data.objects.get('StudyV7_RelaxedFrontLeaf')
    surface = BlanketSurface(body, leaf)
    # Compute all patch positions before replacing a previous generated repair.
    vertices, faces, coordinates = [], [], []
    segments = 24
    for row in range(segments+1):
        v = row/segments
        for column in range(segments+1):
            u = column/segments
            x, z = PatchXZ(u, v)
            vertices.append((x, surface.Y(x, z)-PatchLift(u, v), z))
            coordinates.append((.02+.46*u, .52+.46*v))
    for row in range(segments):
        for column in range(segments):
            a = row*(segments+1)+column
            # +X cross +Z is -Y: the exposed front has outward normals.
            faces.append((a, a+1, a+segments+2, a+segments+1))
    replaced = []
    for obj in reversed(list(root.children_recursive)):
        if obj.get('RepairPatchV9Generator') != generatorTag:
            continue
        mesh = obj.data if obj.type == 'MESH' else None
        replaced.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh is not None and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    material = PatchMaterial(body)
    mesh = bpy.data.meshes.new('Geometry_SichuanV9RepairPatch')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(material)
    uv = mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:
        uv.data[loop.index].uv = coordinates[loop.vertex_index]
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    patch = bpy.data.objects.new('Pack_V9RepairPatch', mesh)
    bpy.context.scene.collection.objects.link(patch)
    patch.parent = body
    patch.matrix_parent_inverse = Matrix.Identity(4)
    patch['RepairPatchV9Generator'] = generatorTag
    patch['AtlasRegion'] = 'cloth'
    patch['WearPatch'] = True
    patch['NominalDimensionsM'] = [patchWidth, patchHeight]
    patch['Construction'] = 'Thin irregular homespun repair, separately hand-sewn over the blanket'
    solid = patch.modifiers.new('ThinRepairCloth', 'SOLIDIFY')
    solid.thickness = .00030
    solid.offset = -1
    solid.use_even_offset = True
    thread, stitchReport = BuildHandStitches(patch, surface, StitchMaterial())
    return {'generator': generatorTag, 'legacyCleanup': cleanReport,
            'patchObject': patch.name, 'stitchObject': thread.name,
            'patchGridQuads': [segments, segments], 'nominalDimensionsM': [patchWidth, patchHeight],
            'patchLocalBoundsM': [[min(p[0] for p in vertices), max(p[0] for p in vertices)],
                                 [min(p[2] for p in vertices), max(p[2] for p in vertices)]],
            'surfaceRule': 'minimum Y of body and relaxed front-leaf actual BVH hits',
            'surfaceQueries': surface.queryCount, 'boundedNeighbourFallbackQueries': surface.fallbackQueries,
            'maxTurnedEdgeLiftM': max(PatchLift(u, v) for u, v in ((0, 0), (0, .5), (0, 1), (1, 0), (1, .5), (1, 1), (.5, 0), (.5, 1))),
            'replacedGeneratedObjects': replaced, 'bodyTransformModified': False,
            'flatBackAndPivotModified': False, 'stitches': stitchReport, 'visualApproval': False}
