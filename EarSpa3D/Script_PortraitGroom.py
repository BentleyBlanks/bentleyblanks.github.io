"""Rebuild the existing portrait groom from the shipped GLB, without touching anatomy.

Run in this worktree's independently started Blender through Script_BlenderMcp.mjs:
  from pathlib import Path
  ns = {'__file__': r'<worktree>/EarSpa3D/Script_PortraitGroom.py'}
  exec(compile(Path(ns['__file__']).read_text(encoding='utf-8'), ns['__file__'], 'exec'), ns)
  ns['Build']()  # stages outside the repository for a route-injected preview
  ns['Build'](publish=True)  # after visual verification, writes the runtime model

The first run snapshots the runtime GLB and imports it into a new baseline blend.
Later runs always use that snapshot. Only the two groom meshes are rebuilt; the
opaque native scalp/undercoat and every other node retain their original GLB data.
The original GLB is spliced after Blender export so importer/exporter round trips
cannot change skin colours, UVs, tool geometry, transforms, materials or metadata.
Source blends and the baseline remain outside the site repository.
"""
import copy
import hashlib
import json
import math
import random
import struct
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
SOURCE = Path('C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/PortraitRendering20261022')
BASELINE = SOURCE / 'Baseline_ImmersiveEar.glb'
BASELINE_BLEND = SOURCE / 'Model_PortraitGroom_Baseline.blend'
BLEND = SOURCE / 'Model_PortraitGroom.blend'
MODEL = ROOT / 'Models/Model_ImmersiveEar.glb'
STAGED = SOURCE / 'Model_PortraitGroom_Staged.glb'
REPORT = ROOT / '_dev/Report_PortraitGroom.json'
CHANGED = {'Model_ProfileHairStrands', 'Model_ProfileHairWisps'}
HAIR = CHANGED | {'Model_ProfileHair'}
CENTER = Vector((-6.0, 35.0, 58.70739288330078))
DEPTH_OFFSET = -6.292607116699219


def V(p):
    return Vector((p[0], -p[2], p[1]))


def Game(p):
    return Vector((p[0], p[2], -p[1]))


def ReadGlb(path):
    data = path.read_bytes()
    assert data[:4] == b'glTF'
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    return doc, data[28 + length:]


def WriteGlb(path, doc, binary):
    text = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    text += b' ' * (-len(text) % 4)
    binary += b'\0' * (-len(binary) % 4)
    data = struct.pack('<III', 0x46546c67, 2, 28 + len(text) + len(binary))
    data += struct.pack('<II', len(text), 0x4e4f534a) + text
    data += struct.pack('<II', len(binary), 0x004e4942) + binary
    path.write_bytes(data)


def AccessorBytes(doc, binary, index):
    accessor = doc['accessors'][index]
    assert 'sparse' not in accessor, 'Sparse accessors need a separate preservation check'
    view = doc['bufferViews'][accessor['bufferView']]
    sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    counts = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
    size = sizes[accessor['componentType']] * counts[accessor['type']]
    step = view.get('byteStride', size)
    offset = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    return b''.join(binary[offset + i * step:offset + i * step + size] for i in range(accessor['count']))


def AccessorRecord(doc, binary, index):
    descriptor = {k: v for k, v in doc['accessors'][index].items() if k not in {'bufferView', 'byteOffset'}}
    return {'descriptor': descriptor, 'sha256': hashlib.sha256(AccessorBytes(doc, binary, index)).hexdigest()}


def NodeRecord(doc, binary, node):
    result = {'node': copy.deepcopy(node)}
    if 'mesh' not in node:
        return result
    mesh = copy.deepcopy(doc['meshes'][node['mesh']])
    for primitive in mesh['primitives']:
        primitive['attributes'] = {key: AccessorRecord(doc, binary, value) for key, value in primitive['attributes'].items()}
        if 'indices' in primitive:
            primitive['indices'] = AccessorRecord(doc, binary, primitive['indices'])
        assert 'targets' not in primitive
    result['mesh'] = mesh
    return result


def PrimitiveAccessors(doc):
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            yield primitive, 'indices'
            for key in primitive['attributes']:
                yield primitive['attributes'], key
            for target in primitive.get('targets', []):
                for key in target:
                    yield target, key
    for animation in doc.get('animations', []):
        for sampler in animation['samplers']:
            yield sampler, 'input'
            yield sampler, 'output'
    for skin in doc.get('skins', []):
        yield skin, 'inverseBindMatrices'


def ValidateGroom(doc, binary):
    report = {}
    for name, componentsExpected, triangleLimit, tipV in [
            ('Model_ProfileHairStrands', 120, 10560, 1.0),
            ('Model_ProfileHairWisps', 90, 2880, .86)]:
        node = next(n for n in doc['nodes'] if n.get('name') == name)
        primitive = doc['meshes'][node['mesh']]['primitives'][0]
        attributes = primitive['attributes']
        assert '_GROOMDEPTH' in attributes, 'Measured groom clearance must survive export'
        assert primitive.get('mode', 4) == 4

        def Values(index):
            accessor = doc['accessors'][index]
            code = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[accessor['componentType']]
            size = struct.calcsize(code)
            data = AccessorBytes(doc, binary, index)
            return struct.unpack('<' + code * (len(data) // size), data)

        positions = Values(attributes['POSITION'])
        normals = Values(attributes['NORMAL'])
        uv = Values(attributes['TEXCOORD_0'])
        depth = Values(attributes['_GROOMDEPTH'])
        indices = Values(primitive['indices'])
        assert all(math.isfinite(x) for x in (*positions, *normals, *uv, *depth))
        assert len(indices) // 3 <= triangleLimit
        assert min(depth) >= .07999 and max(depth) <= 1.00001
        count = len(positions) // 3
        parents = list(range(count))

        def Find(i):
            while parents[i] != i:
                parents[i] = parents[parents[i]]
                i = parents[i]
            return i

        minimumArea = float('inf')
        for i in range(0, len(indices), 3):
            a, b, c = indices[i:i + 3]
            assert 0 <= min(a, b, c) and max(a, b, c) < count
            parents[Find(b)] = Find(a)
            parents[Find(c)] = Find(a)
            pa, pb, pc = [Vector(positions[k * 3:k * 3 + 3]) for k in (a, b, c)]
            area = (pb - pa).cross(pc - pa).length * .5
            minimumArea = min(minimumArea, area)
        components = {}
        for i in range(count):
            components.setdefault(Find(i), []).append(i)
        assert len(components) == componentsExpected
        for group in components.values():
            v = [uv[i * 2 + 1] for i in group]
            assert abs(min(v)) < .00001 and abs(max(v) - tipV) < .00001
        assert minimumArea > 1e-9, ('Degenerate groom triangle', name, minimumArea)
        report[name] = {'components': len(components), 'vertices': count,
                        'triangles': len(indices) // 3, 'minimumTriangleAreaMm2': minimumArea,
                        'uvRootToTip': [0, tipV], 'groomDepthRange': [min(depth), max(depth)]}
    return report


def SpliceGroom(exported, destination):
    """Insert new hair accessors, then compact only unreachable geometry payloads."""
    original, originalBinary = ReadGlb(BASELINE)
    generated, generatedBinary = ReadGlb(exported)
    doc = copy.deepcopy(original)
    binary = bytearray(originalBinary)
    viewMap, accessorMap = {}, {}

    def CopyAccessor(index):
        if index in accessorMap:
            return accessorMap[index]
        accessor = copy.deepcopy(generated['accessors'][index])
        assert 'sparse' not in accessor
        viewIndex = accessor['bufferView']
        if viewIndex not in viewMap:
            view = copy.deepcopy(generated['bufferViews'][viewIndex])
            begin = view.get('byteOffset', 0)
            payload = generatedBinary[begin:begin + view['byteLength']]
            binary.extend(b'\0' * (-len(binary) % 4))
            view['byteOffset'] = len(binary)
            view['buffer'] = 0
            binary.extend(payload)
            viewMap[viewIndex] = len(doc['bufferViews'])
            doc['bufferViews'].append(view)
        accessor['bufferView'] = viewMap[viewIndex]
        accessorMap[index] = len(doc['accessors'])
        doc['accessors'].append(accessor)
        return accessorMap[index]

    for name in sorted(CHANGED):
        targetNode = next(n for n in doc['nodes'] if n.get('name') == name)
        sourceNode = next(n for n in generated['nodes'] if n.get('name') == name)
        # Exported coordinates must use the original identity node frame.
        assert not any(k in sourceNode for k in ('matrix', 'translation', 'rotation', 'scale'))
        targetMesh = doc['meshes'][targetNode['mesh']]
        oldMaterial = targetMesh['primitives'][0].get('material')
        newPrimitives = copy.deepcopy(generated['meshes'][sourceNode['mesh']]['primitives'])
        for primitive in newPrimitives:
            primitive['attributes'] = {k: CopyAccessor(v) for k, v in primitive['attributes'].items()}
            if 'indices' in primitive:
                primitive['indices'] = CopyAccessor(primitive['indices'])
            primitive['material'] = oldMaterial
        targetMesh['primitives'] = newPrimitives

    references = list(PrimitiveAccessors(doc))
    usedAccessors = sorted({owner[key] for owner, key in references if key in owner})
    remap = {old: new for new, old in enumerate(usedAccessors)}
    doc['accessors'] = [doc['accessors'][i] for i in usedAccessors]
    for owner, key in references:
        if key in owner:
            owner[key] = remap[owner[key]]
    # This is already a compact runtime GLB: no texture payload may be reintroduced.
    assert not original.get('images') and not original.get('textures')
    usedViews = sorted({a['bufferView'] for a in doc['accessors']})
    remap = {old: new for new, old in enumerate(usedViews)}
    packed, views = bytearray(), []
    for index in usedViews:
        view = copy.deepcopy(doc['bufferViews'][index])
        begin = view.get('byteOffset', 0)
        payload = binary[begin:begin + view['byteLength']]
        packed.extend(b'\0' * (-len(packed) % 4))
        view['byteOffset'] = len(packed)
        packed.extend(payload)
        views.append(view)
    packed.extend(b'\0' * (-len(packed) % 4))
    for accessor in doc['accessors']:
        accessor['bufferView'] = remap[accessor['bufferView']]
    doc['bufferViews'] = views
    doc['buffers'] = [{'byteLength': len(packed)}]
    assert doc['nodes'] == original['nodes']
    assert doc['materials'] == original['materials']
    preserved = []
    for node in original['nodes']:
        if node.get('name') in CHANGED:
            continue
        current = next(n for n in doc['nodes'] if n.get('name') == node.get('name'))
        assert NodeRecord(original, originalBinary, node) == NodeRecord(doc, packed, current), node.get('name')
        preserved.append(node.get('name'))
    validation = ValidateGroom(doc, packed)
    if destination.resolve() == MODEL.resolve():
        current, currentBinary = ReadGlb(MODEL)
        assert current['nodes'] == original['nodes'], 'Runtime nodes changed after this task baseline'
        assert current['materials'] == original['materials'], 'Runtime materials changed after this task baseline'
        for node in original['nodes']:
            if node.get('name') not in CHANGED:
                currentNode = next(n for n in current['nodes'] if n.get('name') == node.get('name'))
                assert NodeRecord(original, originalBinary, node) == NodeRecord(current, currentBinary, currentNode), 'Refusing to overwrite newer non-groom geometry: ' + node.get('name', '')
    WriteGlb(destination, doc, bytes(packed))
    return preserved, validation


def Prepare():
    SOURCE.mkdir(parents=True, exist_ok=True)
    if bpy.data.filepath:
        assert Path(bpy.data.filepath).resolve().parent == SOURCE.resolve(), 'Refusing to replace an unrelated Blender scene'
    if not BASELINE.exists():
        BASELINE.write_bytes(MODEL.read_bytes())
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Clear orphan names to keep export mesh names deterministic across rebuilds.
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    bpy.ops.import_scene.gltf(filepath=str(BASELINE))
    if not BASELINE_BLEND.exists():
        bpy.ops.wm.save_as_mainfile(filepath=str(BASELINE_BLEND))


def Catmull(a, b, c, d, t):
    return (b * 2 + (c - a) * t + (a * 2 - b * 5 + c * 4 - d) * t * t + (-a + b * 3 - c * 3 + d) * t ** 3) * .5


def MakeMesh(name, vertices, faces, uvs, material):
    # Surface projection can collapse an edge exactly onto the cap boundary.
    # Exclude only zero-area triangles; retain the visible ribbon topology.
    triangles = []
    for face in faces:
        for i in range(1, len(face) - 1):
            triangle = (face[0], face[i], face[i + 1])
            a, b, c = [Vector(vertices[k]) for k in triangle]
            if (b - a).cross(c - a).length > 2e-9:
                triangles.append(triangle)
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([V(p) for p in vertices], [], triangles)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    mesh.materials.append(material)
    uv = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        polygon.use_smooth = True
        for loop in polygon.loop_indices:
            uv.data[loop].uv = uvs[mesh.loops[loop].vertex_index]
    return obj


def Build(publish=False):
    Prepare()
    rng = random.Random(20261022)
    head = bpy.data.objects['Model_Temple']
    scalp = bpy.data.objects['Model_ProfileHair']
    material = bpy.data.objects['Model_ProfileHairStrands'].data.materials[0]
    for name in CHANGED:
        bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)

    # The preserved object contains a native cap plus two curtain hemispheres.
    # Front roots must sample the native cap, not jump between those shells.
    parents = list(range(len(scalp.data.vertices)))

    def Find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    for polygon in scalp.data.polygons:
        for i in polygon.vertices[1:]:
            parents[Find(i)] = Find(polygon.vertices[0])
    components = {}
    for vertex in scalp.data.vertices:
        components.setdefault(Find(vertex.index), []).append(vertex.index)
    nativeId = next(key for key, group in components.items() if min(scalp.data.vertices[i].co.z for i in group) > -50)
    nativeFaces = [list(p.vertices) for p in scalp.data.polygons if Find(p.vertices[0]) == nativeId]
    nativeCap = BVHTree.FromPolygons([v.co for v in scalp.data.vertices], nativeFaces, all_triangles=True)

    def Project(direction, lift=0, allowHead=False, nativeOnly=False):
        direction = direction.normalized()
        targets = [nativeCap if nativeOnly else scalp] + ([head] if allowHead else [])
        for target in targets:
            if target == nativeCap:
                point, normal, index, distance = target.ray_cast(V(CENTER + direction * 300), V(-direction))
                hit = point is not None
            else:
                hit, point, normal, index = target.ray_cast(V(CENTER + direction * 300), V(-direction))
            if not hit:
                continue
            p = Game(point)
            if hit and (p - CENTER).dot(direction) > 15:
                normal = Game(normal).normalized()
                if normal.dot(direction) < 0:
                    normal.negate()
                return p + normal * lift, normal
        return None

    def Direction(side, azimuth, elevation):
        return Vector((-math.cos(azimuth) * math.cos(elevation), math.sin(elevation), side * math.sin(azimuth) * math.cos(elevation)))

    def Hairline(side, azimuth):
        low, high = .06, 1.18
        assert Project(Direction(side, azimuth, high), nativeOnly=True)
        for iteration in range(18):
            middle = (low + high) * .5
            if Project(Direction(side, azimuth, middle), nativeOnly=True):
                high = middle
            else:
                low = middle
        return high

    def Flow(side, u, t, lift):
        """Preserved silhouette flow; individual cards use disjoint local intervals."""
        u = max(.001, min(.999, u))
        angle = u * math.pi
        wrap = math.sqrt(max(0, 1 - u * u))
        controls = [Vector((side * .055 * wrap, 6.988, .45 - .23 * u)),
                    Vector((side * .55 * wrap, 6.83, .42 + .58 * math.cos(angle))),
                    Vector((side * .77 * wrap, 6.30, .36 + .40 * math.cos(angle))),
                    Vector((side * .78 * wrap, 5.96, .37 - .48 * u)),
                    Vector((side * .77 * wrap, 5.74, .29 - .68 * u)),
                    Vector((side * .79 * wrap, 5.20, .35 - .80 * u)),
                    Vector((side * .82 * wrap, 4.25 + .035 * math.sin(u * 7), .36 - .86 * u))]
        at = min(.999999, t) * 6
        index, q = min(5, int(at)), at - min(5, int(at))
        p = Catmull(controls[max(0, index - 1)], controls[index], controls[index + 1], controls[min(6, index + 2)], q)
        p.x += side * lift / 100 * wrap
        game = Vector((-(p.z - .50) * 100 - 3.5, (p.y - 5.79) * 100 + .8, (p.x + .65) * 100 + DEPTH_OFFSET))
        if game.y > -15:
            direction = (game - Vector((-6, 35, 60))).normalized()
            hit, point, normal, index = head.ray_cast(V(Vector((-6, 35, 60)) + direction * 280), V(-direction))
            if hit:
                surface = Game(point) + direction * (2.1 + lift * min(1, t * 18))
                weight = max(0, min(1, (game.y + 15) / 35))
                game = game.lerp(surface, weight * weight * (3 - 2 * weight))
        return game

    vertices, faces, uvs = [], [], []
    cardRecords = []

    def AddCard(path, width, projectEdges=False, phase=0):
        begin = len(vertices)
        samples = []
        for row in range(23):
            t = row / 22
            p, normal = path(t)
            before = path(max(0, t - .001))[0]
            after = path(min(1, t + .001))[0]
            tangent = (after - before).normalized()
            across = normal.cross(tangent).normalized()
            # Narrow roots and pointed tips keep staggered local patches from
            # exposing a straight rectangular end against the undercoat.
            rootTaper = .12 + .88 * (1 - math.exp(-t * 24))
            tipTaper = max(.035, 1 - t ** 5)
            taper = rootTaper * tipTaper * (1 + .08 * math.sin(t * 7 + phase))
            samples.append(tuple(p))
            for col in range(3):
                edge = (col / 2 - .5) * width * taper
                location = p + across * edge + normal * (.16 * math.sin(col / 2 * math.pi) * math.sin(t * math.pi))
                if projectEdges:
                    projected = Project(location - CENTER, .28 + .30 * math.sin(t * math.pi), False, True)
                    if projected:
                        location = projected[0]
                    else:
                        hit, point, edgeNormal, index = scalp.closest_point_on_mesh(V(location))
                        assert hit
                        location = Game(point) + Game(edgeNormal).normalized() * .28
                vertices.append(tuple(location))
                # Blender exports a V flip; runtime therefore receives root=0/tip=1.
                uvs.append((col / 2, 1 - t))
                if row < 22 and col < 2:
                    k = begin + row * 3 + col
                    faces.append((k, k + 3, k + 4, k + 1))
        return samples

    def AddFlowCard(side, center, width, startT, endT, lift, bend, phase):
        """Every column follows the original fitted surface, not a tangent plane."""
        begin = len(vertices)
        samples = []
        width = min(width, center * 1.98, (1 - center) * 1.98)
        for row in range(23):
            t = row / 22
            tt = startT + (endT - startT) * t
            drift = bend * math.sin(t * math.pi) * math.sin(phase + t * 1.8)
            widthAt = width * (1 - .26 * t ** 7)
            # Stable separated sheets avoid intersecting each other when their
            # row samples and start/end positions are intentionally staggered.
            liftAt = lift
            samples.append(tuple(Flow(side, center + drift, tt, liftAt)))
            for col in range(3):
                u = center + widthAt * (col / 2 - .5) + drift
                p = Flow(side, u, tt, liftAt + .09 * math.sin(col / 2 * math.pi) * math.sin(t * math.pi))
                # Match the actual shipped undercoat rather than relying on the
                # old analytic flow's slightly different surface sampling.
                hit, surface, surfaceNormal, index = scalp.closest_point_on_mesh(V(p))
                assert hit
                surface, surfaceNormal = Game(surface), Game(surfaceNormal).normalized()
                if surfaceNormal.dot(p - CENTER) < 0:
                    surfaceNormal.negate()
                p = surface + surfaceNormal * liftAt
                vertices.append(tuple(p))
                uvs.append((col / 2, 1 - t))
                if row < 22 and col < 2:
                    k = begin + row * 3 + col
                    # Opposite hemispheres share the original wrap orientation.
                    face = (k, k + 1, k + 4, k + 3)
                    faces.append(face if side == -1 else tuple(reversed(face)))
        return samples

    for side in [-1, 1]:
        # Short root sheets cover the actual native forehead cap that the old
        # shared seven-point flow never reached (a 32 mm uncovered band).
        for card in range(12):
            azimuth = .015 + (card + rng.uniform(.1, .9)) / 12 * .82
            elevation = Hairline(side, azimuth) + rng.uniform(.009, .035)
            endAzimuth = azimuth + rng.uniform(.32, .48)
            endElevation = elevation + rng.uniform(.08, .14)
            phase = rng.uniform(0, math.tau)

            def Path(t, azimuth=azimuth, elevation=elevation, endAzimuth=endAzimuth, endElevation=endElevation, phase=phase):
                az = azimuth + (endAzimuth - azimuth) * t + .025 * math.sin(t * math.pi) * math.sin(phase)
                el = elevation * (1 - t) + endElevation * t + .055 * math.sin(t * math.pi)
                el = max(el, Hairline(side, az) + .018)
                result = Project(Direction(side, az, el), .28 + .30 * math.sin(t * math.pi), False, True)
                assert result, ('front projection', side, az, el)
                return result

            samples = AddCard(Path, rng.uniform(7.0, 11.5), True, phase)
            cardRecords.append({'side': side, 'group': 'forehead', 'start': samples[0], 'end': samples[-1]})

        for group, count in [('middle', 34), ('tail', 14)]:
            for card in range(count):
                center = (card + rng.uniform(.18, .82)) / count
                startT = rng.uniform(.008, .034) if group == 'middle' else rng.uniform(.43, .61)
                endT = rng.uniform(.925, .999) if group == 'middle' else rng.uniform(.95, .999)
                lift = (.78 if card % 2 == 0 else 1.58) if group == 'middle' else 1.16
                phase = rng.uniform(0, math.tau)
                width = rng.uniform(2.0, 2.5) / count if group == 'middle' else rng.uniform(1.25, 1.6) / count
                bend = rng.uniform(.0015, .0045)
                samples = AddFlowCard(side, center, width, startT, endT, lift, bend, phase)
                cardRecords.append({'side': side, 'group': group, 'start': samples[0], 'end': samples[-1]})

    cards = MakeMesh('Model_ProfileHairStrands', vertices, faces, uvs, material)
    cards['hairCards'] = 120
    cards['groomRegionsPerSide'] = '12 forehead / 34 continuous crown-to-tail / 14 nape overlays'
    cards['rootToTip'] = 'glTF UV.y: 0 to 1'

    vertices, faces, uvs = [], [], []
    wispRecords = []
    for side in [-1, 1]:
        for strand in range(45):
            phase = rng.uniform(0, math.tau)
            width = rng.uniform(.023, .052)
            if strand < 18:
                az = rng.uniform(.03, 1.12)
                el = Hairline(side, az)
                length = rng.uniform(.035, .075)

                def WispPath(t, az=az, el=el, length=length, phase=phase):
                    direction = Direction(side, az + length * t, el + .012 - .012 * t + .012 * math.sin(t * math.pi))
                    p, normal = Project(direction, .25 + .65 * math.sin(t * math.pi), True, True)
                    return p + normal * (.20 * math.sin(t * math.pi + phase)), normal
                region = 'hairline'
            else:
                if strand < 24:
                    center = rng.uniform(.002, .018)
                    startT = rng.uniform(.335, .435)
                    endT = startT + rng.uniform(.009, .018)
                    region = 'temple-edge'
                elif strand < 30:
                    center = rng.uniform(.025, .70)
                    startT = rng.uniform(.26, .35)
                    endT = min(.44, startT + rng.uniform(.055, .11))
                    region = 'temple'
                else:
                    center = rng.uniform(.005, .10) if strand % 3 else rng.uniform(.80, .98)
                    startT = rng.uniform(.57, .84)
                    endT = min(.995, startT + rng.uniform(.035, .075))
                    region = 'tail'
                lift = rng.uniform(.75, 2.2)

                def WispPath(t, center=center, startT=startT, endT=endT, lift=lift, phase=phase, region=region):
                    tt = startT + (endT - startT) * t
                    u = center + .012 * math.sin(t * math.pi) * math.sin(phase + t * 2.4)
                    p = Flow(side, u, tt, lift + 1.4 * math.sin(t * math.pi))
                    normal = (p - CENTER).normalized()
                    p.x += 1.1 * math.sin(t * math.pi) * math.sin(phase)
                    if region == 'temple-edge':
                        p.x -= 1.45 * math.sin(t * math.pi) ** 1.2
                    return p, normal

            begin = len(vertices)
            samples = []
            for row in range(17):
                t = row / 16
                p, normal = WispPath(t)
                tangent = WispPath(min(1, t + .001))[0] - WispPath(max(0, t - .001))[0]
                across = normal.cross(tangent).normalized()
                samples.append(tuple(p))
                for edge in [-1, 1]:
                    vertices.append(tuple(p + across * (edge * width * (1 - .88 * t))))
                    uvs.append((.5 + edge * .08, 1 - t * .86))
                if row < 16:
                    k = begin + row * 2
                    faces.append((k, k + 2, k + 3, k + 1))
            lengthMm = sum((Vector(b) - Vector(a)).length for a, b in zip(samples, samples[1:]))
            if region in {'hairline', 'temple-edge'}:
                assert 3 <= lengthMm <= 8, ('Short silhouette strand length', region, lengthMm)
            wispRecords.append({'side': side, 'region': region, 'lengthMm': lengthMm})
    wisps = MakeMesh('Model_ProfileHairWisps', vertices, faces, uvs, material)
    wisps['silhouetteHairs'] = 90
    wisps['groomRegionsPerSide'] = '18 short hairline / 6 short temple edge / 6 temple / 15 tail'

    for obj in [cards, wisps]:
        obj['outerFitShifted'] = True
        obj['conchaAligned'] = True
        # A scalar from measured clearance, never from the strand's length group.
        # glTF custom attributes keep their underscore and are uppercased.
        depth = obj.data.attributes.new(name='_groomdepth', type='FLOAT', domain='POINT')
        for vertex in obj.data.vertices:
            hit, point, normal, index = scalp.closest_point_on_mesh(vertex.co)
            assert hit
            clearance = (vertex.co - point).length
            depth.data[vertex.index].value = max(.08, min(1, clearance / 3.2))
    bpy.context.scene['portraitGroom'] = '20261022 native cap roots / continuous crown-to-tail sheets / nape overlays / short silhouette arcs'
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    bpy.ops.object.select_all(action='DESELECT')
    cards.select_set(True)
    wisps.select_set(True)
    exported = SOURCE / 'Export_PortraitGroom.glb'
    bpy.ops.export_scene.gltf(filepath=str(exported), export_format='GLB', use_selection=True,
                             export_yup=True, export_apply=True, export_cameras=False,
                             export_lights=False, export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                             export_attributes=True)
    destination = MODEL if publish else STAGED
    preserved, validation = SpliceGroom(exported, destination)
    triangles = {o.name: sum(len(p.vertices) - 2 for p in o.data.polygons) for o in [scalp, cards, wisps]}
    assert triangles['Model_ProfileHairStrands'] <= 10560
    assert triangles['Model_ProfileHairWisps'] <= 2880
    report = {'baseline': str(BASELINE), 'sourceBlend': str(BLEND), 'model': str(destination),
              'unchangedNodes': preserved, 'unchangedNodeCount': len(preserved),
              'preservation': 'Original node/material metadata and all non-groom accessor descriptors plus SHA-256 payloads identical',
              'triangles': triangles, 'validation': validation, 'cards': cardRecords, 'wisps': wispRecords,
              'cardMinX': min(v.co.x for v in cards.data.vertices),
              'scalpMinX': min(v.co.x for v in scalp.data.vertices),
              'groomDepth': 'Exported _GROOMDEPTH float: closest distance to preserved scalp/undercoat divided by 3.2 mm, clamped .08 to 1',
              'modelBytes': destination.stat().st_size}
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in {'cards', 'wisps', 'unchangedNodes'}}))
