"""Sparse, attached wear fibres for the approved high-poly Sichuan pack.

Call ``ApplyWearGeometry(bpy.data.objects['Pack_Root'])`` after the V8/V9
assemblies and their materials exist.  This module does not run on import,
edit source vertices, save a file, start Blender, or alter existing materials.
All coordinates and fibre lengths are metres.  Repeated calls replace only
this module's tagged children, so the operation is deterministic/idempotent.

The high model deliberately uses a few local tufts, rather than a uniform fur
coat: cotton breaks at exposed edges, battered straw at
the roll ends and the sandals' heel/toe/sole margins.  These are high-study
details, to be baked or selectively retained in the later game asset.
"""

import bisect
import hashlib
import math
import random

import bpy
from mathutils import Vector


wearTag = 'SichuanAttachedWearV09'
atlasOrigins = {'cloth': (.02, .52), 'binding': (.02, .02),
                'jacket': (.52, .02), 'straw': (.52, .52)}
fiberMaterials = {}


def StableSeed(label):
    return int.from_bytes(hashlib.sha256(label.encode('utf-8')).digest()[:8], 'little')


def SafeUnit(value, fallback=(0, 0, 1)):
    value = Vector(value)
    return value.normalized() if value.length_squared > 1e-16 else Vector(fallback)


def FiberMaterial(sourceMaterial, role):
    """Keep source colours, but give the fine broken fibres a matte response."""
    key = (sourceMaterial.name, role)
    if key in fiberMaterials:
        return fiberMaterials[key]
    name = 'Material_SichuanV9Fiber_' + role.title() + '_' + hashlib.sha256(
        sourceMaterial.name.encode('utf-8')).hexdigest()[:10]
    previous = bpy.data.materials.get(name)
    if previous is not None and previous.users == 0:
        bpy.data.materials.remove(previous)
    # Copy the current shader on every rebuild.  Reusing a prior fibre copy
    # after the source palette changed would recreate the very age mismatch
    # this pass is intended to repair.
    material = sourceMaterial.copy()
    material.name = name
    material['WearFiber'] = True
    material['AtlasRegion'] = role
    material['WearFiberSourceMaterial'] = sourceMaterial.name
    if material.use_nodes:
        for node in material.node_tree.nodes:
            if node.bl_idname == 'ShaderNodeBsdfPrincipled':
                for inputName, value in (('Metallic', 0), ('Roughness', .98),
                                         ('Specular IOR Level', .18),
                                         ('Sheen Weight', .035 if role != 'straw' else 0)):
                    if inputName not in node.inputs:
                        continue
                    socket = node.inputs[inputName]
                    for link in list(socket.links):
                        material.node_tree.links.remove(link)
                    socket.default_value = value
            elif node.bl_idname == 'ShaderNodeNormalMap':
                node.inputs['Strength'].default_value = .075
            elif role == 'straw' and node.bl_idname == 'ShaderNodeHueSaturation':
                node.inputs['Value'].default_value *= 1.26
                node.inputs['Saturation'].default_value *= .73
    fiberMaterials[key] = material
    return material


class FiberMesh:
    """Tapered four-sided strands, sharing the source's material and UV region."""

    def __init__(self, source, role, label):
        self.source = source
        self.role = role
        self.label = label
        self.vertices = []
        self.faces = []
        self.uvs = []
        self.faceMaterials = []
        self.materials = []
        self.fiberCount = 0

    def MaterialIndex(self, material):
        material = FiberMaterial(material, self.role)
        if material not in self.materials:
            self.materials.append(material)
        return self.materials.index(material)

    def Strand(self, points, radius, normal, material, uv=None):
        points = [Vector(p) for p in points]
        if len(points) < 3:
            return
        materialIndex = self.MaterialIndex(material)
        first = len(self.vertices)
        sides = 4
        origin = atlasOrigins.get(self.role, atlasOrigins['cloth'])
        uv = tuple(uv) if uv is not None else (origin[0] + .231, origin[1] + .228)
        arc = 0
        previousSide = None
        for index, point in enumerate(points):
            if index:
                arc += (point - points[index - 1]).length
            tangent = SafeUnit(points[min(index + 1, len(points) - 1)] -
                               points[max(0, index - 1)])
            side = tangent.cross(Vector(normal))
            if side.length_squared < 1e-10:
                side = tangent.cross(Vector((1, 0, 0)))
            if side.length_squared < 1e-10:
                side = tangent.cross(Vector((0, 1, 0)))
            side.normalize()
            if previousSide is not None and side.dot(previousSide) < 0:
                side.negate()
            previousSide = side
            across = SafeUnit(tangent.cross(side))
            t = index / (len(points) - 1)
            taper = max(.045, (1 - t) ** .65)
            for corner in range(sides):
                angle = math.tau * corner / sides
                self.vertices.append(tuple(point + radius * taper *
                                           (math.cos(angle) * side + math.sin(angle) * across)))
                # Tiny, continuous physical-scale UV displacement; inherit
                # each anchor's atlas location instead of a bright flat tint.
                self.uvs.append((uv[0] + .46 * radius * math.cos(angle) / .08,
                                 uv[1] + .46 * arc / .08))
            if index:
                for corner in range(sides):
                    a = first + (index - 1) * sides + corner
                    b = first + (index - 1) * sides + (corner + 1) % sides
                    self.faces.append((a, b, b + sides, a + sides))
                    self.faceMaterials.append(materialIndex)
        self.faces.extend((tuple(reversed(range(first, first + sides))),
                           tuple(range(first + (len(points) - 1) * sides,
                                       first + len(points) * sides))))
        self.faceMaterials.extend((materialIndex, materialIndex))
        self.fiberCount += 1

    def Write(self):
        if not self.faces:
            return None
        name = 'WearV9_' + self.source.name + '_' + self.label
        mesh = bpy.data.meshes.new(name + 'Geometry')
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        for material in self.materials:
            mesh.materials.append(material)
        uvLayer = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            uvLayer.data[loop.index].uv = self.uvs[loop.vertex_index]
        for polygon, materialIndex in zip(mesh.polygons, self.faceMaterials):
            polygon.material_index = materialIndex
            polygon.use_smooth = True
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        # Points are in the exact source object's local space.  A direct
        # parent makes hiding/extracting the jacket, mat or sandals carry all
        # wear along, without changing any assembly pivot or transform.
        obj.parent = self.source
        obj.matrix_parent_inverse.identity()
        obj['WearGeometryGenerator'] = wearTag
        obj['AtlasRegion'] = self.role
        obj['WearSource'] = self.source.name
        obj['WearPattern'] = self.label
        obj['FiberCount'] = self.fiberCount
        obj['HighStudyOnly'] = True
        return obj


def MaterialForFace(source, polygon):
    if not source.data.materials:
        return None
    return source.data.materials[min(polygon.material_index, len(source.data.materials) - 1)]


def MeanUv(source, polygon):
    active = source.data.uv_layers.active
    if active is None or not polygon.loop_total:
        return None
    return sum((active.data[index].uv.copy() for index in polygon.loop_indices),
               Vector((0, 0))) / polygon.loop_total


def BoundarySegments(source, root, faceFilter=None, uvSides=False):
    """Find actual open/region edges, or width edges of a solidified ribbon."""
    mesh = source.data
    activeUv = mesh.uv_layers.active
    rootSpace = root.matrix_world.inverted() @ source.matrix_world
    accepted = []
    edgeFaces = {}
    minU, maxU = float('inf'), -float('inf')
    for polygon in mesh.polygons:
        material = MaterialForFace(source, polygon)
        if material is None or (faceFilter and not faceFilter(material)):
            continue
        accepted.append(polygon)
        if activeUv is not None:
            for index in polygon.loop_indices:
                u = activeUv.data[index].uv.x
                minU, maxU = min(minU, u), max(maxU, u)
        vertices = polygon.vertices
        for index, a in enumerate(vertices):
            b = vertices[(index + 1) % len(vertices)]
            key = (min(a, b), max(a, b))
            edgeFaces.setdefault(key, []).append(polygon.index)
    candidates = []
    seen = set()
    widthTolerance = max(.00003, (maxU - minU) * .003)
    for polygon in accepted:
        vertices = polygon.vertices
        material = MaterialForFace(source, polygon)
        for index, a in enumerate(vertices):
            b = vertices[(index + 1) % len(vertices)]
            key = (min(a, b), max(a, b))
            if key in seen:
                continue
            isEdge = len(edgeFaces[key]) == 1
            if uvSides and activeUv is not None:
                ua = activeUv.data[polygon.loop_start + index].uv.x
                ub = activeUv.data[polygon.loop_start + (index + 1) % polygon.loop_total].uv.x
                isEdge = isEdge or ((abs(ua - minU) < widthTolerance and abs(ub - minU) < widthTolerance)
                                    or (abs(ua - maxU) < widthTolerance and abs(ub - maxU) < widthTolerance))
            if not isEdge:
                continue
            pa = mesh.vertices[a].co.copy()
            pb = mesh.vertices[b].co.copy()
            length = (pb - pa).length
            if not .00008 < length < .10:
                continue
            mid = (pa + pb) * .5
            rootPoint = rootSpace @ mid
            # Nothing added to the character-contact face or buried rear
            # transfers; the approved flat back and its pivot remain clean.
            if rootPoint.y > -.006:
                continue
            normal = SafeUnit(polygon.normal, (0, -1, 0))
            tangent = SafeUnit(pb - pa)
            out = mid - polygon.center
            out -= normal * out.dot(normal)
            out -= tangent * out.dot(tangent)
            out = SafeUnit(out, normal.cross(tangent))
            uv = MeanUv(source, polygon)
            candidates.append({'a': pa, 'b': pb, 'normal': normal, 'tangent': tangent,
                               'out': out, 'material': material, 'uv': uv,
                               'weight': length, 'rootPoint': rootPoint})
            seen.add(key)
    return candidates


def PickClusters(candidates, count, rng, separation):
    if not candidates:
        return []
    accumulated = []
    total = 0
    for candidate in candidates:
        total += candidate['weight']
        accumulated.append(total)
    chosen = []
    # Sparse clusters leave long untouched stretches.  A spatial exclusion
    # avoids multiple draws from the same dense high-subdivision corner.
    for unused in range(count * 35):
        candidate = candidates[min(len(candidates) - 1,
                                   bisect.bisect_left(accumulated, rng.random() * total))]
        p = candidate['a'].lerp(candidate['b'], rng.uniform(.12, .88))
        if any((p - previous[1]).length < separation for previous in chosen):
            continue
        chosen.append((candidate, p))
        if len(chosen) >= count:
            break
    return chosen


def AddTuft(builder, candidate, anchor, rng, straw=False, long=False):
    normal, tangent, outward = candidate['normal'], candidate['tangent'], candidate['out']
    material, uv = candidate['material'], candidate['uv']
    count = rng.randint(3, 7) if straw else rng.randint(2, 5)
    sourceGravity = SafeUnit(builder.source.matrix_world.inverted().to_3x3() @ Vector((0, 0, -1)))
    clusterSpread = .0013 if straw else .00065
    sharedLength = rng.uniform(.0032, .0072) if straw else rng.uniform(.0014, .0036)
    if long:
        sharedLength *= 1.55
    for unused in range(count):
        length = sharedLength * rng.uniform(.50, 1.22)
        radius = rng.uniform(.00013, .00025) if straw else rng.uniform(.000060, .000105)
        base = anchor + tangent * rng.gauss(0, clusterSpread) - normal * radius * .3
        direction = SafeUnit(outward * rng.uniform(.5, 1) + tangent * rng.uniform(-.55, .55))
        sag = rng.uniform(.15, .50)
        lift = rng.uniform(.10, .34) if straw else rng.uniform(.13, .38)
        points = []
        wave = rng.uniform(-.4, .4)
        for index in range(6):
            t = index / 5
            point = (base + direction * length * t + normal * length * lift * math.sin(t * math.pi * .75)
                     + sourceGravity * length * sag * t * t + tangent * length * wave * t * t * .20)
            points.append(point)
        builder.Strand(points, radius, normal, material, uv)


def BoundaryWear(source, root, label, clusters, role, faceFilter=None, uvSides=False):
    candidates = BoundarySegments(source, root, faceFilter, uvSides)
    builder = FiberMesh(source, role, label)
    rng = random.Random(StableSeed(label + source.name))
    for candidate, anchor in PickClusters(candidates, clusters, rng, .012 if role != 'binding' else .025):
        AddTuft(builder, candidate, anchor, rng)
    return builder.Write()


def StrawSurfaceCandidates(source, root, matEnds=False):
    mesh = source.data
    rootSpace = root.matrix_world.inverted() @ source.matrix_world
    points = [rootSpace @ Vector(corner) for corner in source.bound_box]
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    center = (low + high) * .5
    candidates = []
    # Sample polygon centres, not every individual micro-fibre vertex.  The
    # deterministic offset avoids tying the marks to the weave's even grid.
    stride = max(1, len(mesh.polygons) // 4500)
    for polygonIndex in range(stride // 3, len(mesh.polygons), stride):
        polygon = mesh.polygons[polygonIndex]
        material = MaterialForFace(source, polygon)
        if material is None or material.get('AtlasRegion', 'straw') != 'straw':
            continue
        p = polygon.center.copy()
        rp = rootSpace @ p
        normal = SafeUnit(polygon.normal, (0, -1, 0))
        if matEnds:
            endDistance = min(abs(rp.x - low.x), abs(high.x - rp.x))
            if endDistance > .005:
                continue
            rootOut = Vector((-1 if rp.x < center.x else 1, 0, 0))
            weight = 1.5 if rp.z < center.z else .7
        else:
            toe = rp.z < low.z + .026
            heel = rp.z > high.z - .025
            side = rp.x < low.x + .006 or rp.x > high.x - .006
            if not (toe or heel or side):
                continue
            rootOut = SafeUnit(Vector(((rp.x - center.x) * .6, -.001,
                                       (rp.z - center.z) * .32)), (0, 0, -1))
            weight = 2.2 if toe else .6 if heel else 1.1
        out = SafeUnit(rootSpace.to_3x3().inverted() @ rootOut)
        tangent = SafeUnit(normal.cross(out), (0, 0, 1))
        uv = MeanUv(source, polygon)
        candidates.append({'a': p, 'b': p, 'normal': normal, 'tangent': tangent,
                           'out': out, 'material': material, 'uv': uv,
                           'weight': weight, 'rootPoint': rp})
    return candidates


def StrawWear(source, root, matEnds=False):
    label = 'BrokenRollEndGrass' if matEnds else 'AbradedSandalGrass'
    builder = FiberMesh(source, 'straw', label)
    rng = random.Random(StableSeed(label + source.name))
    candidates = StrawSurfaceCandidates(source, root, matEnds)
    clusters = 13 if matEnds else 8
    for candidate, anchor in PickClusters(candidates, clusters, rng, .009):
        AddTuft(builder, candidate, anchor, rng, straw=True)
    return builder.Write()


def ApplyWearGeometry(root):
    """Return a JSON-safe report; add wear only under existing pack components.

    Existing geometry, transforms, names, visibility, root/contact pivot, and
    source materials are untouched.  Fibres receive matte copies marked
    WearFiber=True.  Call after a material replacement when possible so they
    inherit the final V9 palette immediately.  Patch/stitch restoration is a
    separate pass; this module deliberately leaves that area alone.
    """
    assert root is not None and root.name == 'Pack_Root', 'Expected the pack task root'
    assert bpy.context.scene.get('BlenderMcpTask') == 'SichuanBlanketPack', 'Wrong Blender task'
    fiberMaterials.clear()
    removed = []
    for obj in list(root.children_recursive):
        if obj.get('WearGeometryGenerator') != wearTag:
            continue
        mesh = obj.data if obj.type == 'MESH' else None
        removed.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh is not None and mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    # Snapshot only original source objects; newly generated children never
    # become inputs on this or the next call.
    sources = {obj.name: obj for obj in root.children_recursive if obj.type == 'MESH'}
    created = []

    def Add(obj):
        if obj is not None:
            created.append(obj)

    for name, source in sources.items():
        if name == 'Pack_ContinuousClothStrap':
            Add(BoundaryWear(source, root, 'BrokenTapeSelvedge', 16, 'binding', uvSides=True))
        elif name.startswith('Pack_SoftKnot') and ('Tail' in name or 'Loop' in name):
            Add(BoundaryWear(source, root, 'KnotLooseThreads', 2, 'binding', uvSides=True))
        elif name == 'Pack_MatCottonRetainers':
            Add(BoundaryWear(source, root, 'RetainerCottonFray', 5, 'binding', uvSides=True))
        elif name in ('StudyV7_TurnedTopLeaf', 'StudyV7_JacketTuckLip'):
            Add(BoundaryWear(source, root, 'TurnedCottonEdge', 4, 'cloth'))
        elif name == 'StudyV7_RelaxedFrontLeaf':
            Add(BoundaryWear(source, root, 'SparseBlanketEdgeFray', 9, 'cloth'))
        elif name == 'Pack_InterlacedMatGrass':
            Add(StrawWear(source, root, matEnds=True))
        elif name.startswith('Pack_GrassSandal') and name.endswith('BraidedWeave'):
            Add(StrawWear(source, root, matEnds=False))

    report = {'generator': wearTag, 'seedMethod': 'SHA256 of semantic source name',
              'createdObjects': [obj.name for obj in created],
              'fiberCount': sum(int(obj['FiberCount']) for obj in created),
              'triangles': sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in created),
              'replacedWearObjects': removed, 'sourceGeometryModified': False,
              'sourceMaterialsModified': False, 'newMaterialsTaggedWearFiber': True,
              'sourceSpace': 'metres, local to original component',
              'visualApproval': False}
    root['WearGeometryV9'] = wearTag
    return report
