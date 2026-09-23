"""Bake a facial-bone skin into a shipped Lugou character GLB.

Generalized from Script_BakeNraFacial.py (NRA05, 2026-09-13). Runs inside Blender
on a facial source scene and writes Model/Character/Model_Lugou<Id>Facial.glb.
The shipped body GLB is kept byte-for-byte except: appended Face_* joints (same
names, Head-local centimetre convention and pose schema as the NRA05 review rig),
replacement skin weights on face vertices, one oral primitive (or the legacy three)
and, optionally, stripped images/animations (the runtime rebinds materials and
clips from the base GLB by name; see Script_CharacterModel.LoadAsset).

Call from Blender with a job dict, e.g. through
`node scripts/Script_BlenderMcp.mjs exec --file <wrapper.py>` where the wrapper does
    FACIAL_JOB = {...}; exec(compile(open(path).read(), path, 'exec'))
Script_AuthorCharacterFacial.py builds the source scenes and holds the job table.

Job keys
  repo          worktree root (the file is written to <repo>/Taierzhuang1938/Model/Character)
  scene, rig    Blender scene and armature object names
  headBone      Blender bone whose name is also the GLB head node (Bip002 Head / Bip001 Head)
  base          target body GLB file name, e.g. Model_LugouNra02.glb
  output        output file name, e.g. Model_LugouNra02Facial.glb
  action        Blender action holding the pose frames
  poseFrames    {"Rest": 1, "Open": 140, ...}
  weightMode    "kdtree": body object carries every deform group (the NRA05 review file);
                "index":  skin objects carry int prop glbPrim + int vertex attribute glbIndex
                          and only Face_* groups (the remaining weight keeps the GLB's own)
  body          kdtree mode: body mesh object name
  oralMode      "legacy": three unindexed category primitives (NRA05 2026-09-13 layout)
                "merged": one indexed primitive, COLOR_0 per category, one material
  transferFrom  optional GLB name whose head frame the Blender scene was authored on;
                bones/oral are carried rigidly Head-local to the target head (IJA02 -> IJA01)
  followPrims   {targetPrimIndex: maxDistanceCm}: prims whose vertices copy the face
                weights of the nearest face-weighted skin vertex (beard/moustache cards)
  stripImages, stripAnimations  booleans
  eyes          optional runtime gaze description written to extras.facialRig.eyes
  poseMask      {pose: [bone name prefixes]}: other bones take the Rest value in that pose
  source        source project label written to extras
"""
import bpy, json, struct, math, os
from mathutils import Matrix, Quaternion, Vector, kdtree

CONVERSION = Matrix.Rotation(-math.pi / 2, 4, 'X')  # Blender Z-up -> glTF Y-up
# Linear baseColor per oral category (legacy material factors, reused as COLOR_0).
ORAL_COLORS = {'Cavity': [.008, .001, .002, 1], 'Teeth': [.30, .255, .19, 1], 'Tongue': [.12, .022, .027, 1],
               'Gum': [.10, .018, .022, 1]}


def Trs(matrix):
    p, q, s = matrix.decompose()
    return {'translation': list(p), 'rotation': [q.x, q.y, q.z, q.w], 'scale': list(s)}


class Glb:
    def __init__(self, path):
        data = open(path, 'rb').read()
        length = struct.unpack_from('<I', data, 12)[0]
        self.doc = json.loads(data[20:20 + length])
        self.binary = bytearray(data[28 + length:])
        self.parents = {c: i for i, n in enumerate(self.doc['nodes']) for c in n.get('children', [])}
        self.byName = {n.get('name'): i for i, n in enumerate(self.doc['nodes'])}
        self.worlds = {}

    def World(self, index):
        if index in self.worlds: return self.worlds[index]
        node = self.doc['nodes'][index]
        if 'matrix' in node:
            local = Matrix([node['matrix'][i:i + 4] for i in range(0, 16, 4)]).transposed()
        else:
            x, y, z, w = node.get('rotation', [0, 0, 0, 1])
            local = Matrix.LocRotScale(Vector(node.get('translation', [0, 0, 0])), Quaternion((w, x, y, z)),
                                       Vector(node.get('scale', [1, 1, 1])))
        self.worlds[index] = self.World(self.parents[index]) @ local if index in self.parents else local
        return self.worlds[index]

    def Read(self, index):
        a = self.doc['accessors'][index]; v = self.doc['bufferViews'][a['bufferView']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
        size = struct.calcsize(fmt) * count; start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = v.get('byteStride', size)
        rows = [struct.unpack_from('<' + fmt * count, self.binary, start + i * stride) for i in range(a['count'])]
        if a.get('normalized') and fmt != 'f':
            scale = float({'H': 65535, 'B': 255}[fmt]); rows = [tuple(x / scale for x in r) for r in rows]
        return rows

    def Write(self, values, kind, component=5126, target=None):
        binary = self.binary
        while len(binary) % 4: binary.append(0)
        offset = len(binary); fmt = {5126: 'f', 5123: 'H', 5125: 'I'}[component]
        for row in values: binary.extend(struct.pack('<' + fmt * len(row), *row))
        view = {'buffer': 0, 'byteOffset': offset, 'byteLength': len(binary) - offset}
        if target: view['target'] = target
        self.doc['bufferViews'].append(view)
        result = {'bufferView': len(self.doc['bufferViews']) - 1, 'componentType': component, 'count': len(values), 'type': kind}
        if kind == 'VEC3':
            result['min'] = [min(row[k] for row in values) for k in range(3)]
            result['max'] = [max(row[k] for row in values) for k in range(3)]
        self.doc['accessors'].append(result)
        return len(self.doc['accessors']) - 1

    def StripImages(self):
        doc = self.doc
        for material in doc.get('materials', []):
            pbr = material.get('pbrMetallicRoughness', {})
            for key in ('baseColorTexture', 'metallicRoughnessTexture'): pbr.pop(key, None)
            for key in ('normalTexture', 'occlusionTexture', 'emissiveTexture'): material.pop(key, None)
            # Material extensions (KHR_materials_specular...) may point at textures too;
            # the runtime replaces these materials by name, so only the name matters.
            material.pop('extensions', None)
        for key in ('images', 'textures', 'samplers'): doc.pop(key, None)
        for key in ('extensionsUsed', 'extensionsRequired'):
            if key in doc:
                doc[key] = [e for e in doc[key] if not e.startswith(('EXT_texture', 'KHR_texture', 'KHR_materials'))]
                if not doc[key]: doc.pop(key)

    def Compact(self):
        """Drop accessors/buffer views nothing references any more (stripped images/animations)."""
        doc = self.doc
        live = set()
        for mesh in doc['meshes']:
            for p in mesh['primitives']:
                live.update(p['attributes'].values())
                if 'indices' in p: live.add(p['indices'])
                for t in p.get('targets', []): live.update(t.values())
        for skin in doc.get('skins', []):
            if 'inverseBindMatrices' in skin: live.add(skin['inverseBindMatrices'])
        for anim in doc.get('animations', []):
            for s in anim['samplers']: live.update((s['input'], s['output']))
        order = sorted(live); accessorMap = {old: new for new, old in enumerate(order)}
        accessors = [doc['accessors'][i] for i in order]
        used = sorted({a['bufferView'] for a in accessors if 'bufferView' in a} |
                      {i['bufferView'] for i in doc.get('images', []) if 'bufferView' in i})
        viewMap = {}; binary = bytearray(); views = []
        for old in used:
            v = dict(doc['bufferViews'][old])
            while len(binary) % 4: binary.append(0)
            start = v.get('byteOffset', 0); binary.extend(self.binary[start:start + v['byteLength']])
            v['byteOffset'] = len(binary) - v['byteLength']; viewMap[old] = len(views); views.append(v)
        for a in accessors:
            if 'bufferView' in a: a['bufferView'] = viewMap[a['bufferView']]
        for i in doc.get('images', []):
            if 'bufferView' in i: i['bufferView'] = viewMap[i['bufferView']]
        for mesh in doc['meshes']:
            for p in mesh['primitives']:
                p['attributes'] = {k: accessorMap[v] for k, v in p['attributes'].items()}
                if 'indices' in p: p['indices'] = accessorMap[p['indices']]
                if 'targets' in p: p['targets'] = [{k: accessorMap[v] for k, v in t.items()} for t in p['targets']]
        for skin in doc.get('skins', []):
            if 'inverseBindMatrices' in skin: skin['inverseBindMatrices'] = accessorMap[skin['inverseBindMatrices']]
        for anim in doc.get('animations', []):
            for s in anim['samplers']: s['input'] = accessorMap[s['input']]; s['output'] = accessorMap[s['output']]
        doc['accessors'] = accessors; doc['bufferViews'] = views; self.binary = binary

    def Encode(self):
        self.doc['buffers'][0]['byteLength'] = len(self.binary)
        encoded = json.dumps(self.doc, separators=(',', ':')).encode()
        encoded += b' ' * ((-len(encoded)) % 4); binary = self.binary + b'\0' * ((-len(self.binary)) % 4)
        return (struct.pack('<5I', 0x46546c67, 2, 28 + len(encoded) + len(binary), len(encoded), 0x4e4f534a)
                + encoded + struct.pack('<2I', len(binary), 0x004e4942) + binary)


def Bake(job):
    directory = os.path.join(job['repo'], 'Taierzhuang1938', 'Model', 'Character')
    scene = bpy.data.scenes[job['scene']]
    if bpy.context.window: bpy.context.window.scene = scene
    rig = scene.objects[job['rig']]
    headName = job['headBone']
    names = [b.name for b in rig.data.bones if b.name.startswith('Face_')]
    assert names and all(rig.data.bones[n].parent for n in names)
    screen = bpy.context.screen
    playing = bool(screen and screen.is_animation_playing)
    if playing: bpy.ops.screen.animation_play()
    frame = scene.frame_current
    if not rig.animation_data: rig.animation_data_create()
    previous = rig.animation_data.action
    rig.animation_data.action = bpy.data.actions[job['action']]

    # Only the authored facial channels are sampled; body/head motion stays with game clips.
    poses = {}
    for label, f in job['poseFrames'].items():
        scene.frame_set(f); bpy.context.view_layer.update()
        poses[label] = {n: Trs(rig.pose.bones[n].parent.matrix.inverted() @ rig.pose.bones[n].matrix) for n in names}
    rig.animation_data.action = None
    for bone in rig.pose.bones: bone.matrix_basis.identity()
    bpy.context.view_layer.update()
    # A pose only moves the bones it is about (the NRA05 talk clip's Blink frame also
    # had the jaw ajar; its Open frame lifted the brows): the rest keep their Rest value.
    for label, prefixes in (job.get('poseMask') or {}).items():
        if label in poses and 'Rest' in poses:
            for n in names:
                if not any(n.startswith(p) for p in prefixes): poses[label][n] = dict(poses['Rest'][n])

    glb = Glb(os.path.join(directory, job['base'])); doc = glb.doc
    skin = doc['skins'][0]
    targetHead = glb.World(glb.byName[headName])
    sourceHead = CONVERSION @ rig.matrix_world @ rig.data.bones[headName].matrix_local
    transfer = job.get('transferFrom')
    if transfer:
        # Authored on another GLB's head (same head mesh and vertex order): carry the rig rigidly.
        source = Glb(os.path.join(directory, transfer))
        sourceHeadGlb = source.World(source.byName[headName])
        headError = max(abs(sourceHeadGlb[i][j] - sourceHead[i][j]) for i in range(4) for j in range(4))
        carry = targetHead @ sourceHead.inverted()
    else:
        headError = max(abs(targetHead[i][j] - sourceHead[i][j]) for i in range(4) for j in range(4))
        carry = Matrix.Identity(4)
    assert headError < 1e-4, ('Head bind changed', headError)
    toMesh = carry @ CONVERSION  # Blender world -> target GLB world metres

    ibm = glb.Read(skin['inverseBindMatrices'])
    for name in names:
        bone = rig.data.bones[name]; parent = glb.byName[bone.parent.name]
        world = carry @ CONVERSION @ rig.matrix_world @ bone.matrix_local
        node = {'name': name, **Trs(glb.World(parent).inverted() @ world)}
        index = len(doc['nodes']); doc['nodes'].append(node); glb.byName[name] = index; glb.worlds[index] = world
        doc['nodes'][parent].setdefault('children', []).append(index)
        skin['joints'].append(index)
        inverse = world.inverted()
        ibm.append(tuple(inverse[row][col] for col in range(4) for row in range(4)))
    skin['inverseBindMatrices'] = glb.Write(ibm, 'MAT4')
    jointByName = {doc['nodes'][node]['name']: i for i, node in enumerate(skin['joints'])}
    faceJoints = {jointByName[n] for n in names}

    def GroupWeights(obj, vertex, faceOnly=False):
        items = [(jointByName[obj.vertex_groups[g.group].name], g.weight) for g in vertex.groups
                 if obj.vertex_groups[g.group].name in jointByName and g.weight > 1e-7]
        return [(j, w) for j, w in items if j in faceJoints] if faceOnly else items

    def Top4(items):
        merged = {}
        for j, w in items: merged[j] = merged.get(j, 0) + w
        items = sorted(merged.items(), key=lambda x: -x[1])[:4]
        assert items
        total = sum(w for _, w in items)
        return tuple([i for i, _ in items] + [0] * (4 - len(items))), tuple([w / total for _, w in items] + [0] * (4 - len(items)))

    def Blend(face, original):
        """Face weights take their share; the GLB's own weights keep the remainder."""
        total = sum(w for _, w in face)
        if total > 1: face = [(j, w / total) for j, w in face]; total = 1
        return Top4(face + [(j, w * (1 - total)) for j, w in original if w > 0])

    primitives = doc['meshes'][0]['primitives']
    stats = {'matchedVertices': 0, 'maxVertexMatchDistance': 0.0, 'faceVertices': 0}
    body = scene.objects.get(job.get('body', ''))
    if job['weightMode'] == 'kdtree':
        tree = kdtree.KDTree(len(body.data.vertices))
        for v in body.data.vertices: tree.insert(toMesh @ body.matrix_world @ v.co, v.index)
        tree.balance()
        for primitive in primitives:
            js = []; ws = []
            for point in glb.Read(primitive['attributes']['POSITION']):
                _, index, distance = tree.find(Vector(point))
                stats['maxVertexMatchDistance'] = max(stats['maxVertexMatchDistance'], distance)
                assert distance < .001, ('Source vertex unmatched', point, distance)
                vertex = body.data.vertices[index]
                j, w = Top4(GroupWeights(body, vertex)); js.append(j); ws.append(w)
                stats['matchedVertices'] += 1
                if GroupWeights(body, vertex, True): stats['faceVertices'] += 1
            primitive['attributes']['JOINTS_0'] = glb.Write(js, 'VEC4', 5123)
            primitive['attributes']['WEIGHTS_0'] = glb.Write(ws, 'VEC4')
    else:
        facePoints = []  # (Head-local point, face weights) for follow prims
        headInverse = targetHead.inverted()
        for obj in scene.objects:
            if obj.type != 'MESH' or 'glbPrim' not in obj: continue
            primitive = primitives[int(obj['glbPrim'])]
            points = glb.Read(primitive['attributes']['POSITION'])
            joints = glb.Read(primitive['attributes']['JOINTS_0']); weights = glb.Read(primitive['attributes']['WEIGHTS_0'])
            order = [d.value for d in obj.data.attributes['glbIndex'].data]
            sourceTriangles = len(glb.Read(primitive['indices'])) // 3 if 'indices' in primitive else len(points) // 3
            # Authoring may cut the sealed lips (extra vertices) or drop interior faces:
            # then every attribute is re-emitted in Blender vertex order and the
            # triangles come from the Blender faces (winding preserved).
            rebuild = len(order) != len(points) or len(obj.data.polygons) != sourceTriangles
            if rebuild:
                for key, accessor in list(primitive['attributes'].items()):
                    if key in ('JOINTS_0', 'WEIGHTS_0'): continue
                    rows = glb.Read(accessor)
                    primitive['attributes'][key] = glb.Write([rows[i] for i in order], doc['accessors'][accessor]['type'])
                triangles = []
                for poly in obj.data.polygons:
                    assert len(poly.vertices) == 3, ('Non-triangle face', obj.name, poly.index)
                    triangles.extend((v,) for v in poly.vertices)
                primitive['indices'] = glb.Write(triangles, 'SCALAR', 5123 if len(order) < 65536 else 5125, target=34963)
                js = [joints[i] for i in order]; ws = [weights[i] for i in order]
                stats['rebuiltPrim%d' % int(obj['glbPrim'])] = {'vertices': len(order), 'triangles': len(triangles) // 3,
                                                                'sourceVertices': len(points), 'sourceTriangles': sourceTriangles}
            else:
                assert order == list(range(len(points))), ('Vertex order differs from GLB prim', obj.name)
                js = list(joints); ws = list(weights)
            for vertex in obj.data.vertices:
                i = order[vertex.index]; k = vertex.index if rebuild else i
                distance = ((toMesh @ obj.matrix_world @ vertex.co) - Vector(points[i])).length
                stats['maxVertexMatchDistance'] = max(stats['maxVertexMatchDistance'], distance)
                # Transfers (IJA02 -> IJA01) share the head mesh within a few millimetres.
                assert distance < (.005 if transfer else .0001), ('Vertex moved', obj.name, i, distance)
                stats['matchedVertices'] += 1
                face = GroupWeights(obj, vertex, faceOnly=True)
                if not face: continue
                stats['faceVertices'] += 1
                js[k], ws[k] = Blend(face, list(zip(joints[i], weights[i])))
                facePoints.append((headInverse @ Vector(points[i]), face))
            primitive['attributes']['JOINTS_0'] = glb.Write(js, 'VEC4', 5123)
            primitive['attributes']['WEIGHTS_0'] = glb.Write(ws, 'VEC4')
        if job.get('followPrims'):
            tree = kdtree.KDTree(len(facePoints))
            for k, (p, _) in enumerate(facePoints): tree.insert(p, k)
            tree.balance()
            for prim, maxDistance in job['followPrims'].items():
                primitive = primitives[int(prim)]
                points = glb.Read(primitive['attributes']['POSITION'])
                joints = glb.Read(primitive['attributes']['JOINTS_0']); weights = glb.Read(primitive['attributes']['WEIGHTS_0'])
                js = list(joints); ws = list(weights); followed = 0
                for i, point in enumerate(points):
                    _, k, distance = tree.find(headInverse @ Vector(point))
                    if distance > maxDistance: continue
                    followed += 1
                    js[i], ws[i] = Blend(facePoints[k][1], list(zip(joints[i], weights[i])))
                primitive['attributes']['JOINTS_0'] = glb.Write(js, 'VEC4', 5123)
                primitive['attributes']['WEIGHTS_0'] = glb.Write(ws, 'VEC4')
                stats['followedPrim%s' % prim] = followed

    # Oral surfaces: evaluated at rest, weighted by their own groups.
    legacy = job['oralMode'] == 'legacy'
    oral = {}
    for obj in scene.objects:
        if obj.type != 'MESH' or obj == body or 'glbPrim' in obj or obj.hide_render: continue
        if 'facialOral' in obj: category = obj['facialOral']
        elif job.get('legacyOralNames', legacy):
            category = 'Teeth' if obj.name.startswith('Mesh_Tooth') else 'Tongue' if obj.name == 'Mesh_Tongue' else 'Cavity'
        else: continue
        oral.setdefault(category, []).append(obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()

    def Triangles(obj):
        ev = obj.evaluated_get(depsgraph); data = ev.to_mesh(); data.calc_loop_triangles()
        matrix = toMesh @ ev.matrix_world; normalMatrix = matrix.to_3x3().inverted().transposed()
        # Evaluated meshes (bevel) keep vertex groups; weights come from the evaluated data.
        out = []
        for tri in data.loop_triangles:
            corners = []
            for loop, index in zip(tri.loops, tri.vertices):
                vertex = data.vertices[index]
                normal = vertex.normal if legacy else data.corner_normals[loop].vector
                j, w = Top4(GroupWeights(obj, vertex))
                corners.append((tuple(matrix @ vertex.co), tuple((normalMatrix @ normal).normalized()), j, w))
            out.append(corners)
        ev.to_mesh_clear()
        return out

    oralTriangles = 0
    if legacy:
        for category, objects in oral.items():
            pos = []; norm = []; js = []; ws = []
            for obj in objects:
                for tri in Triangles(obj):
                    for p, n, j, w in tri: pos.append(p); norm.append(n); js.append(j); ws.append(w)
            # Keep a regular PBR material so the game's unified G-buffer/velocity paths apply.
            doc['materials'].append({'name': 'Material_Facial' + category, 'pbrMetallicRoughness': {
                'baseColorFactor': ORAL_COLORS[category], 'metallicFactor': 0, 'roughnessFactor': .85}, 'doubleSided': True})
            primitives.append({'attributes': {'POSITION': glb.Write(pos, 'VEC3'), 'NORMAL': glb.Write(norm, 'VEC3'),
                'JOINTS_0': glb.Write(js, 'VEC4', 5123), 'WEIGHTS_0': glb.Write(ws, 'VEC4')},
                'material': len(doc['materials']) - 1, 'mode': 4})
            oralTriangles += len(pos) // 3
    elif oral:
        # One draw per pass: every oral surface in one indexed primitive, colour per vertex.
        index = {}; pos = []; norm = []; col = []; js = []; ws = []; ids = []
        for category, objects in sorted(oral.items()):
            color = tuple(ORAL_COLORS[category])
            for obj in objects:
                for tri in Triangles(obj):
                    oralTriangles += 1
                    for p, n, j, w in tri:
                        key = (tuple(round(x, 6) for x in p), tuple(round(x, 3) for x in n), j,
                               tuple(round(x, 4) for x in w), color)
                        if key not in index:
                            index[key] = len(pos); pos.append(p); norm.append(n); col.append(color); js.append(j); ws.append(w)
                        ids.append((index[key],))
        assert len(pos) < 65536
        doc['materials'].append({'name': 'Material_FacialOral', 'pbrMetallicRoughness': {
            'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': .8}, 'doubleSided': True})
        primitives.append({'attributes': {'POSITION': glb.Write(pos, 'VEC3'), 'NORMAL': glb.Write(norm, 'VEC3'),
            'COLOR_0': glb.Write(col, 'VEC4'), 'JOINTS_0': glb.Write(js, 'VEC4', 5123), 'WEIGHTS_0': glb.Write(ws, 'VEC4')},
            'indices': glb.Write(ids, 'SCALAR', 5123, target=34963), 'material': len(doc['materials']) - 1, 'mode': 4})
        stats['oralVertices'] = len(pos)

    meshNode = next(i for i, n in enumerate(doc['nodes']) if n.get('mesh') == 0)
    doc['nodes'][meshNode].setdefault('extras', {})['facialSource'] = job['source']
    schema = job.get('schema', 1 if legacy else 2)
    rigInfo = {'schema': schema, 'source': job.get('sourceFile', job['source']), 'bones': names, 'poses': poses}
    if schema >= 2:
        rigInfo['materialsFrom'] = 'base' if job.get('stripImages') else 'self'
        rigInfo['animationsFrom'] = 'base' if job.get('stripAnimations') else 'self'
        if job.get('eyes'): rigInfo['eyes'] = job['eyes']
    doc.setdefault('extras', {})['facialRig'] = rigInfo
    if job.get('stripAnimations'): doc.pop('animations', None)
    if job.get('stripImages'): glb.StripImages()
    if job.get('stripImages') or job.get('stripAnimations'): glb.Compact()
    result = glb.Encode()
    target = job.get('outputPath') or os.path.join(directory, job['output'])
    open(target, 'wb').write(result)
    rig.animation_data.action = previous; scene.frame_set(frame)
    if playing: bpy.ops.screen.animation_play()
    report = {'output': target, 'bytes': len(result), 'faceBones': len(names), 'headBindError': headError,
              'oralTriangles': oralTriangles, **stats}
    print(json.dumps(report))
    return report


if 'FACIAL_JOB' in globals():
    FACIAL_RESULT = Bake(FACIAL_JOB)
