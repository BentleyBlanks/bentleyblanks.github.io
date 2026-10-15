"""Rebuild exact editable Dadao skin/weapon replay, with glTF bone-axis correction.

Required globals: FPS_GRIP_PROJECT_ROOT (Taierzhuang1938 directory) and
FPS_GRIP_SOURCE (the authorized OneDrive source folder of the open .blend).
Optional FPS_GRIP_TASK defaults to FpsGripConformity_20261015.
FPS_DADAO_SKIN_INPUT selects a final actual-runtime Data_Dadao.json export;
the default prefers Data_DadaoReplaySkin.json, then Data_Dadao.json beside the
source .blend. FPS_DADAO_REPLAY_INPUT selects the stamped camera-relative
animation; saved Data_DadaoReplayFrames.json beside the .blend takes precedence
over the project acceptance export. FPS_DADAO_REPLAY_SCRIPT optionally overrides
the source embedded in the .blend; by default this tracked script is embedded.
No runtime file is modified. Every vertex is checked in the static export and
all 121 animation frames against actual raw glTF LBS; .1mm is the hard limit.
"""
import bpy, base64, hashlib, json, math, re, struct
import numpy as np
from pathlib import Path
from mathutils import Matrix, Vector

root = Path(FPS_GRIP_PROJECT_ROOT).resolve()
folder = Path(FPS_GRIP_SOURCE).resolve()
task = globals().get('FPS_GRIP_TASK', 'FpsGripConformity_20261015')
assert Path(bpy.data.filepath).resolve().parent == folder
scene = bpy.data.scenes['Scene_FpsDadaoConformityStroke']
assert scene.get('BlenderMcpTask') == task
bpy.context.window.scene = scene
if bpy.context.mode != 'OBJECT':
    bpy.ops.object.mode_set(mode='OBJECT')
module = (root / 'Data_FpsDadaoSwing.mjs').read_text(encoding='utf-8')
stroke = json.loads(re.search(r'export const FPS_DADAO_SWING\s*=\s*(\{.*\});', module, re.S).group(1))
def InputPath(globalName, candidates):
    if globalName in globals():
        chosen = Path(globals()[globalName]).resolve()
        assert chosen.is_file(), globalName + ' does not name a saved input: ' + str(chosen)
        return chosen
    chosen = next((path for path in candidates if path.is_file()), None)
    assert chosen is not None, 'Save a reproducible OneDrive input or set ' + globalName + ': ' + ', '.join(map(str, candidates))
    return chosen.resolve()


inputPath = InputPath('FPS_DADAO_REPLAY_INPUT', [folder / 'Data_DadaoReplayFrames.json', folder / 'Data_DadaoSourceBake.json', root / '_shots/DadaoPower/Acceptance/Data_DadaoSourceBake.json'])
skinInput = InputPath('FPS_DADAO_SKIN_INPUT', [folder / 'Data_DadaoReplaySkin.json', folder / 'Data_Dadao.json'])
sourceScript = Path(globals().get('FPS_DADAO_REPLAY_SCRIPT', root / '_blender/Script_FpsDadaoConformityReplay.py')).resolve()
data = json.loads(inputPath.read_text(encoding='utf-8'))
pkg = json.loads(skinInput.read_text(encoding='utf-8'))
assert pkg['weapon'] == 'Dadao'
assert data.get('captureRole') == 'ProductionDadaoSwingTest', 'Capture this replay with the current production SwingTest'
assert isinstance(data.get('capturedAt'), str) and len(data['capturedAt']) >= 20, 'SourceBake capture timestamp is missing'
assert data.get('strokeControlSignature') == stroke['strokeControlSignature'], 'Replay is for a different stroke'
assert data.get('runtimeStroke') == stroke, 'Replay differs from current fitted elbows or action parameters; capture a fresh production SourceBake'
frames = data.get('sourceFrames', data.get('frames'))
assert len(frames) == 121
cameraData = data['camera']
assert len(cameraData['projectionMatrix']) == 16
convert = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
convertNp = np.array(convert, dtype=np.float64)


def M(values):
    return Matrix([values[i::4] for i in range(4)])


def N(values):
    return np.asarray(values, dtype=np.float64).reshape(4, 4).T


def Unit(matrix):
    p, q, scale = matrix.decompose()
    return Matrix.LocRotScale(p, q, Vector((1, 1, 1)))


def HashPositions(values):
    array = np.asarray(values, dtype='<f4').copy()
    array[array == 0] = 0  # JSON.stringify canonicalizes -0 to +0.
    return hashlib.sha256(array.tobytes()).hexdigest()


# Prove the source package contains the current runtime skin geometry. A stale
# package's old rest geometry must not validate a newer GLB by coincidence.
assetPath = root / 'Model/Model_FpsHanYangHands.glb'
assetRaw = assetPath.read_bytes()
assert len(assetRaw) >= 28 and struct.unpack_from('<III', assetRaw) == (0x46546C67, 2, len(assetRaw)), 'Invalid production GLB header'
jsonLength = struct.unpack_from('<I', assetRaw, 12)[0]
assert struct.unpack_from('<I', assetRaw, 16)[0] == 0x4E4F534A and jsonLength % 4 == 0
assetDoc = json.loads(assetRaw[20:20 + jsonLength])
binLength, binKind = struct.unpack_from('<II', assetRaw, 20 + jsonLength)
assert binKind == 0x004E4942 and 28 + jsonLength + binLength == len(assetRaw)
assetBinary = assetRaw[28 + jsonLength:]
assert len(assetDoc['buffers']) == 1 and 'uri' not in assetDoc['buffers'][0]
assert assetDoc['buffers'][0]['byteLength'] <= len(assetBinary)


def Accessor(index):
    accessor = assetDoc['accessors'][index]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[accessor['type']]
    dtype = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[accessor['componentType']]
    size = np.dtype(dtype).itemsize
    values = np.zeros((accessor['count'], width), dtype=dtype)
    if 'bufferView' in accessor:
        view = assetDoc['bufferViews'][accessor['bufferView']]
        assert view.get('buffer', 0) == 0
        begin = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', width * size)
        assert accessor.get('byteOffset', 0) + max(0, accessor['count'] - 1) * stride + width * size <= view['byteLength']
        values[:] = np.ndarray(values.shape, dtype=dtype, buffer=assetBinary, offset=begin, strides=(stride, size))
    if 'sparse' in accessor:
        sparse = accessor['sparse']
        descriptor = sparse['indices']; view = assetDoc['bufferViews'][descriptor['bufferView']]
        ids = np.frombuffer(assetBinary, dtype={5121: 'u1', 5123: '<u2', 5125: '<u4'}[descriptor['componentType']], count=sparse['count'], offset=view.get('byteOffset', 0) + descriptor.get('byteOffset', 0))
        descriptor = sparse['values']; view = assetDoc['bufferViews'][descriptor['bufferView']]
        values[ids] = np.frombuffer(assetBinary, dtype=dtype, count=sparse['count'] * width, offset=view.get('byteOffset', 0) + descriptor.get('byteOffset', 0)).reshape(-1, width)
    if accessor.get('normalized'):
        assert np.issubdtype(np.dtype(dtype), np.integer)
        values = np.maximum(values.astype(np.float64) / np.iinfo(dtype).max, -1)
    return values


def EvaluatedRest(candidate, skin):
    """Reconstruct exported pre-skin POSITION in its original UV-split order."""
    base = candidate['positions'].astype(np.float64)
    expected = base.copy()
    names, targets = candidate['targetNames'], candidate['targets']
    state = skin.get('morphState')
    mapping, weights = {}, []
    if targets:
        assert len(names) == len(targets) and len(set(names)) == len(names), 'Production morph target names are ambiguous'
        assert isinstance(state, dict) and state.get('relative') is True, 'Runtime package is missing relative morph state'
        mapping, weights = state['names'], state['weights']
        assert set(mapping) == set(names) and len(weights) == len(names), 'Runtime morph inventory differs from current GLB'
        assert all(isinstance(i, int) and not isinstance(i, bool) for i in mapping.values())
        assert sorted(mapping.values()) == list(range(len(weights))), 'Runtime morph name/index map is not a bijection'
        assert np.isfinite(np.asarray(weights, dtype=np.float64)).all(), 'Runtime morph weights are not finite'
        for name, target in zip(names, targets):
            weight = float(weights[mapping[name]])
            if weight and 'POSITION' in target:
                delta = target['POSITION']
                assert delta.shape == base.shape and np.isfinite(delta).all()
                expected += delta.astype(np.float64) * weight
    else:
        assert not state or (not state.get('names') and not state.get('weights')), 'Runtime package has morphs absent from current GLB'
    if state and state.get('evaluation') == 'cpu-attributes':
        # RiggedModel sums Basis + all named deltas in double precision, then
        # writes POSITION to its Float32 attribute once before skinning. Keep
        # the same strict comparison below; GPU morph exports retain the
        # original double-precision reconstruction without this writeback.
        expected = expected.astype('<f4').astype(np.float64)
    actual = np.asarray(skin['rest'], dtype=np.float64).reshape(-1, 3)
    assert actual.shape == expected.shape and np.isfinite(actual).all(), 'Runtime evaluated rest has another vertex layout'
    error = float(np.max(np.abs(actual - expected))) if len(actual) else 0.0
    assert error <= 2e-12, 'Runtime evaluated-rest differs from current GLB morph POSITION in UV-split order: ' + skin['name'] + ' error=' + str(error)
    return {'skin': skin['name'], 'evaluatedPositionHash': HashPositions(expected), 'maximumEvaluatedRestError': error,
            'activeMorphWeights': {name: float(weights[mapping[name]]) for name in names if weights[mapping[name]]}}


normalize = lambda name: ''.join(c for c in name.lower() if c.isalnum())
assetSkins = []
for meshIndex, mesh in enumerate(assetDoc['meshes']):
    skinNode = next((node for node in assetDoc['nodes'] if node.get('mesh') == meshIndex and 'skin' in node), None)
    if skinNode is None:
        continue
    skinDoc = assetDoc['skins'][skinNode['skin']]
    names = [normalize(assetDoc['nodes'][index]['name']) for index in skinDoc['joints']]
    binds = Accessor(skinDoc['inverseBindMatrices'])
    for primitive in mesh['primitives']:
        attributes = primitive['attributes']
        # GLTFLoader.js calls SkinnedMesh.normalizeSkinWeights on import.
        # Reproduce its float64 L1 division and float32 attribute writeback.
        weights = Accessor(attributes['WEIGHTS_0']).astype(np.float64)
        sums = np.abs(weights).sum(1)
        weights[sums > 0] /= sums[sums > 0, None]
        weights[sums == 0] = (1, 0, 0, 0)
        positions = Accessor(attributes['POSITION'])
        targets = [{semantic: Accessor(index) for semantic, index in target.items()} for target in primitive.get('targets', [])]
        assetSkins.append({'positionHash': HashPositions(positions), 'positions': positions, 'names': names,
                           'targetNames': mesh.get('extras', {}).get('targetNames', []), 'targets': targets,
                           'uv': Accessor(attributes['TEXCOORD_0']) if 'TEXCOORD_0' in attributes else None,
                           'indices': Accessor(primitive['indices']).ravel() if 'indices' in primitive else None,
                           'joints': Accessor(attributes['JOINTS_0']), 'weights': weights.astype('<f4'), 'binds': binds})
skinHashes = [HashPositions(skin.get('baseRest', skin['rest'])) for skin in pkg['skin']]
evaluatedRestReports = []
for skin, positionHash in zip(pkg['skin'], skinHashes):
    names = [normalize(name) for name in skin['bones']]
    matched = False
    for candidate in assetSkins:
        if candidate['positionHash'] != positionHash or set(names) != set(candidate['names']):
            continue
        mapping = np.array([names.index(name) for name in candidate['names']])
        joints = mapping[candidate['joints'].astype(int)]
        binds = candidate['binds'][[candidate['names'].index(name) for name in names]]
        uvMatches = (candidate['uv'] is None and not skin.get('uv')) or (candidate['uv'] is not None and skin.get('uv') is not None and HashPositions(candidate['uv']) == HashPositions(skin['uv']))
        indexMatches = (candidate['indices'] is None and skin.get('idx') is None) or (candidate['indices'] is not None and skin.get('idx') is not None and np.array_equal(candidate['indices'], np.asarray(skin['idx'])))
        matched = (uvMatches and indexMatches and np.array_equal(joints.ravel(), np.asarray(skin['infl']))
                   and HashPositions(candidate['weights']) == HashPositions(skin['wts'])
                   and HashPositions(binds) == HashPositions(skin['inverseBinds']))
        if matched:
            evaluatedRestReports.append(EvaluatedRest(candidate, skin))
            break
    assert matched, 'Skin package Basis/UV order/indices/weights/inverse binds differ from current production GLB: ' + skin['name']

# Import only to obtain the current embedded PBR materials. Its bone objects
# are never posed: Blender's importer changes their axes. Deformation below is
# built from raw production inverse binds and corrected Blender rest axes.
oldObjects, oldMaterials = set(bpy.data.objects), set(bpy.data.materials)
bpy.ops.import_scene.gltf(filepath=str(assetPath))
imported = set(bpy.data.objects) - oldObjects
importMaterials = set(bpy.data.materials) - oldMaterials
materialMap = {}
for skin in pkg['skin']:
    for name in skin['materialNames']:
        sourceName = name.removesuffix('_FirstPerson')
        material = next((mat for mat in importMaterials if mat.name == sourceName or mat.name.startswith(sourceName + '.')), None)
        assert material, 'Missing current PBR material ' + name
        materialMap[name] = material
        shader = next((node for node in material.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None) if material.use_nodes else None
        if shader:
            shader.inputs['Metallic'].default_value = 0
            shader.inputs['Roughness'].default_value = max(.78, shader.inputs['Roughness'].default_value)
for obj in imported:
    bpy.data.objects.remove(obj, do_unlink=True)
for obj in list(scene.objects):
    if obj.get('FpsDadaoReplayOwner') == task:
        bpy.data.objects.remove(obj, do_unlink=True)


def Own(obj):
    obj['FpsDadaoReplayOwner'] = task
    scene.collection.objects.link(obj)
    return obj


first = M(frames[0]['weapon']).to_3x3()
gram = first @ first.transposed()
viewScale = [math.sqrt(gram[i][i]) for i in range(3)]
carrier = Own(bpy.data.objects.new('Scene_FpsDadaoConformityViewScale', None))
carrier.matrix_world = convert @ Matrix.Diagonal((*viewScale, 1))
inverseCarrier = carrier.matrix_world.inverted()
armData = bpy.data.armatures.new('Model_FpsDadaoConformitySkeleton')
arm = Own(bpy.data.objects.new('Model_FpsDadaoConformityArms', armData))
arm.parent = carrier
arm.matrix_parent_inverse = Matrix.Identity(4)
inverseBind = {name: M(values) for name, values in zip(pkg['skin'][0]['bones'], pkg['skin'][0]['inverseBinds'])}
rawBind = {name: matrix.inverted() for name, matrix in inverseBind.items()}
unitBind = {name: Unit(matrix) for name, matrix in rawBind.items()}
bindScale = {name: [matrix.to_3x3().col[j].length for j in range(3)] for name, matrix in rawBind.items()}
parents = dict(zip(pkg['boneNames'], pkg['boneParents']))
assert set(data['boneNames']) == set(pkg['boneNames'])
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name in pkg['boneNames']:
    bone = armData.edit_bones.new(name)
    bone.head = unitBind[name].translation
    children = [child for child, parent in parents.items() if parent == name]
    tail = unitBind[children[0]].translation if children else bone.head + unitBind[name].to_3x3() @ Vector((.018, 0, 0))
    bone.tail = tail if (tail - bone.head).length >= .001 else bone.head + Vector((0, .01, 0))
for name, parent in parents.items():
    if parent:
        armData.edit_bones[name].parent = armData.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
# Full inverseBind includes the bind scale. This is the exact form of the
# mature Studio's rawBind/unit-axis correction, with no average-scale loss:
# B_pose * B_rest^-1 = cameraFromCarrier * RawPose * RawInverseBind.
correction = {name: inverseBind[name] @ armData.bones[name].matrix_local for name in pkg['boneNames']}
for bone in arm.pose.bones:
    bone.rotation_mode = 'QUATERNION'
meshes = []
for skin in pkg['skin']:
    bind = M(skin['bindMatrix'])
    vertices = [bind @ Vector(skin['rest'][i:i + 3]) for i in range(0, len(skin['rest']), 3)]
    indices = skin['idx'] or list(range(len(vertices)))
    mesh = bpy.data.meshes.new('Mesh_FpsDadaoConformity_' + skin['name'])
    mesh.from_pydata(vertices, [], [indices[i:i + 3] for i in range(0, len(indices), 3)])
    mesh.update()
    obj = Own(bpy.data.objects.new(mesh.name, mesh))
    obj.parent = arm
    obj.matrix_parent_inverse = Matrix.Identity(4)
    for name in skin['materialNames']:
        mesh.materials.append(materialMap[name])
    if skin['uv']:
        uv = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            uv.data[loop.index].uv = (skin['uv'][loop.vertex_index * 2], 1 - skin['uv'][loop.vertex_index * 2 + 1])
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    if skin.get('normals'):
        normalMatrix = bind.to_3x3().inverted().transposed()
        mesh.normals_split_custom_set_from_vertices([(normalMatrix @ Vector(skin['normals'][i:i + 3])).normalized() for i in range(0, len(skin['normals']), 3)])
    groups = [obj.vertex_groups.new(name=name) for name in skin['bones']]
    for i in range(len(vertices)):
        for k in range(4):
            weight = skin['wts'][4 * i + k]
            if weight > 0:
                groups[skin['infl'][4 * i + k]].add([i], weight, 'REPLACE')
    modifier = obj.modifiers.new('Armature_FpsProduction', 'ARMATURE')
    modifier.object = arm
    rest = np.c_[np.asarray(skin['rest']).reshape(-1, 3), np.ones(len(vertices))]
    meshes.append({'object': obj, 'skin': skin, 'rest': rest, 'weights': np.asarray(skin['wts']).reshape(-1, 4), 'joints': np.asarray(skin['infl']).reshape(-1, 4),
                   'inverseBinds': np.asarray([N(v) for v in skin['inverseBinds']]), 'bind': N(skin['bindMatrix'])})


def Pose(rawMatrices, names, frame=None):
    values = dict(zip(names, rawMatrices))
    for name in pkg['boneNames']:
        bone = arm.pose.bones[name]
        bone.matrix = inverseCarrier @ convert @ M(values[name]) @ correction[name]
        bpy.context.view_layer.update()
        if frame is not None:
            for channel in ['location', 'rotation_quaternion', 'scale']:
                bone.keyframe_insert(channel, frame=frame)


def Validate(rawMatrices, names, static=False):
    values = {name: N(matrix) for name, matrix in zip(names, rawMatrices)}
    deps = bpy.context.evaluated_depsgraph_get()
    worst = 0
    for entry in meshes:
        skin, obj = entry['skin'], entry['object']
        evaluated = obj.evaluated_get(deps)
        mesh = evaluated.to_mesh()
        actual = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
        mesh.vertices.foreach_get('co', actual)
        actual = np.c_[actual.reshape(-1, 3), np.ones(len(mesh.vertices))] @ np.array(evaluated.matrix_world, dtype=np.float64).T
        matrices = np.asarray([values[name] for name in skin['bones']]) @ entry['inverseBinds'] @ entry['bind']
        expected = np.einsum('nkij,nj->nki', matrices[entry['joints']], entry['rest']) * entry['weights'][:, :, None]
        expected = expected.sum(1) @ convertNp.T
        error = float(np.linalg.norm(actual[:, :3] - expected[:, :3], axis=1).max())
        if static:
            cameraFromWeapon = N(pkg['cameraMatrix'])
            cameraFromWeapon = np.linalg.inv(cameraFromWeapon) @ N(pkg['weaponMatrix'])
            exported = np.c_[np.asarray(skin['pos']).reshape(-1, 3), np.ones(len(mesh.vertices))] @ (convertNp @ cameraFromWeapon).T
            error = max(error, float(np.linalg.norm(actual[:, :3] - exported[:, :3], axis=1).max()))
        worst = max(worst, error)
        evaluated.to_mesh_clear()
    assert worst < .0001, f'Skin replay differs from actual runtime by {worst * 1000:.6f} mm'
    return worst


C = N(pkg['cameraMatrix'])
staticMatrices = [(np.linalg.inv(C) @ N(values)).T.ravel().tolist() for values in pkg['boneMatrices']]
Pose(staticMatrices, pkg['boneNames'])
staticError = Validate(staticMatrices, pkg['boneNames'], True)
errors = []
for i, entry in enumerate(frames):
    scene.frame_set(i + 1)
    Pose(entry['bones'], data['boneNames'], i + 1)
    errors.append(Validate(entry['bones'], data['boneNames']))
    if i % 20 == 0:
        print(json.dumps({'replayFrame': i, 'maximumSkinErrorMm': errors[-1] * 1000}), flush=True)
for layer in arm.animation_data.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = 'LINEAR'

weapon = Own(bpy.data.objects.new('Model_FpsDadaoConformityWeapon', None))
weapon.parent = carrier
weapon.matrix_parent_inverse = Matrix.Identity(4)
weapon.rotation_mode = 'QUATERNION'
asset = json.loads((root / 'Model/Model_Dadao.tzm.json').read_text(encoding='utf-8'))
exec(compile((root / '_blender/Script_MeleeWeaponMaterials.py').read_text(encoding='utf-8'), 'Script_MeleeWeaponMaterials.py', 'exec'))


def Decode(text, code):
    binary = base64.b64decode(text)
    return struct.unpack('<' + code * (len(binary) // struct.calcsize(code)), binary)


for block in asset['meshes']:
    positions, uvs, normals = Decode(block['pos'], 'H'), Decode(block['uv'], 'H'), Decode(block['nrm'], 'b')
    indices = Decode(block['idx'], 'I' if block['idxBits'] == 32 else 'H')
    points = [[block['posMin'][j] + positions[i * 3 + j] * block['posScale'][j] for j in range(3)] for i in range(block['count'])]
    texcoords = [[block['uvMin'][j] + uvs[i * 2 + j] * block['uvScale'][j] for j in range(2)] for i in range(block['count'])]
    normalVectors = [Vector(normals[i:i + 3]).normalized() for i in range(0, len(normals), 3)]
    mesh = bpy.data.meshes.new('Mesh_FpsDadaoConformityBlade')
    mesh.from_pydata(points, [], [indices[i:i + 3] for i in range(0, len(indices), 3)])
    mesh.update()
    SetMeleeMeshSurface(mesh, texcoords, normalVectors)
    mesh.materials.append(MeleeDadaoMaterial(root))
    obj = Own(bpy.data.objects.new(mesh.name, mesh))
    obj.parent = weapon
    obj.rotation_euler = stroke['modelRotation']
weaponErrors = []
for i, entry in enumerate(frames):
    scene.frame_set(i + 1)
    expected = convert @ M(entry['weapon'])
    weapon.matrix_world = expected
    bpy.context.view_layer.update()
    weaponErrors.append(max(abs(weapon.matrix_world[r][c] - expected[r][c]) for r in range(4) for c in range(4)))
    for channel in ['location', 'rotation_quaternion', 'scale']:
        weapon.keyframe_insert(channel, frame=i + 1)
assert max(weaponErrors) < 2e-5, 'Weapon affine layer lost rotation/scale'
for layer in weapon.animation_data.action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:
                    key.interpolation = 'LINEAR'
# Re-seek the baked actions without assigning any bone matrices. This proves
# the editable keyframes themselves replay the source, including parent axes.
keyframedErrors = [0.0] * len(frames)
for i in reversed(range(len(frames))):
    scene.frame_set(i + 1)
    bpy.context.view_layer.update()
    keyframedErrors[i] = Validate(frames[i]['bones'], data['boneNames'])
    expected = convert @ M(frames[i]['weapon'])
    weaponErrors.append(max(abs(weapon.matrix_world[r][c] - expected[r][c]) for r in range(4) for c in range(4)))
assert max(weaponErrors) < 2e-5, 'Keyframed weapon replay differs from runtime'
camera = Own(bpy.data.objects.new('Camera_FpsDadaoConformity', bpy.data.cameras.new('Camera_FpsDadaoConformity')))
camera.matrix_world = convert
camera.data.type = 'PERSP'
camera.data.sensor_fit = 'HORIZONTAL'
aspect = cameraData['viewport']['width'] / cameraData['viewport']['height']
verticalFov = 2 * math.atan(1 / cameraData['projectionMatrix'][5])
camera.data.lens = camera.data.sensor_width / (2 * aspect * math.tan(verticalFov / 2))
camera.data.clip_start = .01
scene.camera = camera
scene.render.resolution_x = cameraData['viewport']['width']
scene.render.resolution_y = cameraData['viewport']['height']
scene.render.resolution_percentage = 100
scene.render.fps, scene.render.fps_base = 120, .65
scene.render.engine = 'CYCLES'
scene.cycles.samples = 16
if scene.world is None:
    scene.world = bpy.data.worlds.new('World_FpsDadaoConformity')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.18, .22, .28, 1)
for name, location, energy, size in [('Key', (-2, -2, 3), 450, 3), ('Fill', (2, 0, 2), 250, 3)]:
    obj = Own(bpy.data.objects.new('Scene_FpsDadaoConformity' + name, bpy.data.lights.new('Scene_FpsDadaoConformity' + name, 'AREA')))
    obj.location = location
    obj.data.energy, obj.data.shape, obj.data.size = energy, 'DISK', size
    obj.rotation_euler = (Vector((0, .5, 0)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
for image in bpy.data.images:
    if image.source == 'FILE' and image.has_data and not image.packed_file:
        image.pack()
validation = {'assetSha256': hashlib.sha256(assetRaw).hexdigest(), 'skinPositionHashes': skinHashes,
              'sourceAssetInfluencesVerified': True,
              'sourceAssetEvaluatedRestVerified': True, 'sourceAssetUvSplitOrderVerified': True,
              'evaluatedRest': evaluatedRestReports, 'skinInput': str(skinInput), 'replayInput': str(inputPath),
              'strokeControlSignature': stroke['strokeControlSignature'], 'staticSkinErrorM': staticError,
              'maximumAnimatedSkinErrorM': max(errors), 'animatedSkinErrorsM': errors,
              'maximumKeyframedSkinErrorM': max(keyframedErrors), 'keyframedSkinErrorsM': keyframedErrors,
              'maximumWeaponMatrixError': max(weaponErrors), 'frames': 121,
              'verticesPerFrame': sum(len(skin['rest']) // 3 for skin in pkg['skin']), 'bindScale': bindScale}
(folder / 'Data_DadaoReplayValidation.json').write_text(json.dumps(validation, indent=2), encoding='utf-8')
(folder / 'Data_DadaoReplaySkin.json').write_text(json.dumps(pkg, separators=(',', ':')), encoding='utf-8')
(folder / 'Data_DadaoReplayFrames.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
text = bpy.data.texts.get('Script_FpsDadaoConformityReplay.py') or bpy.data.texts.new('Script_FpsDadaoConformityReplay.py')
text.clear()
text.write(sourceScript.read_text(encoding='utf-8'))
scene['ReplayStrokeControlSignature'] = stroke['strokeControlSignature']
scene['ReplayMaximumSkinErrorM'] = max(staticError, max(errors), max(keyframedErrors))
scene.frame_set(44)
bpy.ops.wm.save_as_mainfile(filepath=str(folder / 'Animation_FpsGripConformity.blend'), compress=True)
print(json.dumps({'source': bpy.data.filepath, 'replayFrames': 121, 'verticesPerFrame': validation['verticesPerFrame'],
                  'staticSkinErrorMm': staticError * 1000, 'maximumAnimatedSkinErrorMm': max(errors) * 1000,
                  'maximumKeyframedSkinErrorMm': max(keyframedErrors) * 1000,
                  'maximumWeaponMatrixError': max(weaponErrors), 'strokeControlSignature': stroke['strokeControlSignature']}))
