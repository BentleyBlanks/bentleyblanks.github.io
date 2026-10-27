"""Save an independent V43-derived propeller source with fresh rigid-group AO."""
import array, ast, contextlib, hashlib, io, json, math, os, pathlib, re, shutil, struct, time
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

scriptPath = pathlib.Path(globals().get('__file__', 'Taierzhuang1938/_blender/Script_NakajimaKi4PropellerSectionUpdate.py')).resolve()
repo = scriptPath.parents[2]
asset = pathlib.Path(os.environ.get('KI4_PROPELLER_ASSET_ROOT', str(repo / 'tmp/NakajimaKi4/ReferenceV46_FullBladeOutline')))
recipePath = asset / 'Data_PropellerSectionParameters.json'
recipe = json.loads(recipePath.read_text(encoding='utf8'))
source = pathlib.Path(bpy.data.filepath)
sourceRoot = pathlib.Path(recipe['sourceRoot'])
assert source.resolve() == pathlib.Path(recipe['inputSource']).resolve()
assert hashlib.sha256(source.read_bytes()).hexdigest() == recipe['inputSourceSha256']
assert not sourceRoot.exists(), 'Use a new source directory and reopen the protected input before retrying'
root = bpy.data.objects['NakajimaKi4']
assert root['materialRevision'] == '20261027ReferenceV43RubberReflectance'
assert not bpy.context.scene.get('Ki4PropellerSectionMutationInProgress', False)
tree = ast.parse(scriptPath.with_name('Script_NakajimaKi4MainGearUpdate.py').read_text(encoding='utf8'))
function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'MeshFingerprint')
exec(compile(ast.Module(body=[function], type_ignores=[]), str(scriptPath), 'exec'), globals())
bpy.context.view_layer.update()
meshes = [obj for obj in root.children_recursive if obj.type == 'MESH']
assert len(meshes) == 928
before = {obj.name: MeshFingerprint(obj) for obj in meshes}
packedBefore = {image.name: hashlib.sha256(image.packed_file.data).hexdigest()
                for image in bpy.data.images if image.packed_file}
assert len(packedBefore) == 41
allowed = {'Propeller_Blade-1', 'Propeller_Blade1'}
protected = {name: value for name, value in before.items() if name not in allowed}
for folder in ['Textures', 'Scripts', 'Evidence', 'Exports']:
    (sourceRoot / folder).mkdir(parents=True, exist_ok=True)
bpy.context.scene['Ki4PropellerSectionMutationInProgress'] = True
modulePath = scriptPath.with_name('Script_NakajimaKi4PropellerSection.py')
namespace = {'__file__': str(modulePath)}
exec(compile(modulePath.read_text(encoding='utf8'), str(modulePath), 'exec'), namespace)
parts = namespace['BuildPropellerSections'](root, recipe)
blades = [bpy.data.objects[row['name']] for row in parts]
assert all(protected[name] == MeshFingerprint(bpy.data.objects[name]) for name in protected)

def WorldPoints(obj):
    return [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]

def Tree(obj):
    obj.data.calc_loop_triangles()
    return BVHTree.FromPolygons(WorldPoints(obj), [tuple(triangle.vertices) for triangle in obj.data.loop_triangles], all_triangles=True)

hubTree = Tree(bpy.data.objects['Propeller_Hub'])
rootConnections = []
for part, obj in zip(parts, blades):
    values = []
    for index in part['rootVertexIndices']:
        point = obj.matrix_world @ obj.data.vertices[index].co
        hit, normal, _, distance = hubTree.find_nearest(point)
        signed = normal.dot(point - hit)
        assert signed < -1e-5, (obj.name, index, signed)
        values.append(float(-signed))
    rootConnections.append({'name': obj.name, 'rootVerticesInsideHub': len(values),
                            'minimumInsertionM': min(values)})
pivot = bpy.data.objects['Pivot_Propeller']
rest = pivot.matrix_basis.copy()
cowlTree = Tree(bpy.data.objects['Cowl_AnnularRing'])
clearances = []
for angle in range(0, 360, 15):
    pivot.matrix_basis = rest @ Matrix.Rotation(math.radians(angle), 4, 'Y')
    bpy.context.view_layer.update()
    trees = [Tree(obj) for obj in blades]
    counts = [len(tree.overlap(cowlTree)) for tree in trees]
    mutual = len(trees[0].overlap(trees[1]))
    assert counts == [0, 0] and mutual == 0, (angle, counts, mutual)
    clearances.append({'angleDegrees': angle, 'bladeCowlTriangleIntersections': counts,
                       'bladeBladeTriangleIntersections': mutual})
pivot.matrix_basis = rest
bpy.context.view_layer.update()
material = blades[0].data.materials[0].copy()
material.name = 'Material_Ki4PropellerMachinedAluminum'
for obj in blades:
    obj.data.materials.clear()
    obj.data.materials.append(material)
material['surfaceScope'] = 'Metal class documented; machined aluminum finish and reconstructed section remain inferred'

# Bake only the propeller's rigid assembly against itself. Other moving/fixed
# parts cannot leave a permanent phase-dependent shadow in this atlas.
aoSettings = recipe['ao']
size = aoSettings['resolution']
image = bpy.data.images.new('Texture_Ki4PropellerGeometryAo', width=size, height=size,
                            alpha=False, float_buffer=True)
image.colorspace_settings.name = 'Non-Color'
image.generated_color = (1, 1, 1, 1)
pixels = np.ones(size * size * 4, dtype=np.float32)
image.pixels.foreach_set(pixels)
bakeMaterial = bpy.data.materials.new('Temp_Ki4PropellerAoBake')
bakeMaterial.use_nodes = True
nodes = bakeMaterial.node_tree.nodes
links = bakeMaterial.node_tree.links
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
emission = nodes.new('ShaderNodeEmission')
ao = nodes.new('ShaderNodeAmbientOcclusion')
ao.samples = aoSettings['nodeSamples']
ao.inputs['Distance'].default_value = aoSettings['distanceM']
ao.only_local = False
links.new(ao.outputs['AO'], emission.inputs['Color'])
links.new(emission.outputs['Emission'], output.inputs['Surface'])
target = nodes.new('ShaderNodeTexImage')
target.image = image
nodes.active = target
hide = {obj: obj.hide_render for obj in bpy.context.scene.objects}
rigidObjects = [obj for obj in pivot.children_recursive if obj.type == 'MESH']
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
scene.cycles.use_denoising = False
scene.render.threads_mode = 'FIXED'
scene.render.threads = aoSettings['cpuThreads']
for obj in scene.objects:
    if obj.type in ['MESH', 'CURVE']:
        obj.hide_render = obj not in rigidObjects
for obj in blades:
    obj.data.materials[0] = bakeMaterial
    obj.data.uv_layers.active_index = 1
bpy.ops.object.select_all(action='DESELECT')
for obj in blades:
    obj.select_set(True)
bpy.context.view_layer.objects.active = blades[0]
root['propellerAoPrepared'] = True
bpy.ops.wm.save_as_mainfile(filepath=str(sourceRoot / 'Scene_NakajimaKi4AoPrepared.blend'), copy=True)
started = time.time()
try:
    bpy.ops.object.bake(type='EMIT', use_clear=False, use_selected_to_active=False,
                        margin=4, uv_layer='GeometryAO')
finally:
    for obj, value in hide.items():
        obj.hide_render = value
    for obj in blades:
        obj.data.materials[0] = material
        obj.data.uv_layers.active_index = 0
        obj.data.uv_layers[0].active_render = True
    bpy.data.materials.remove(bakeMaterial)
image.pixels.foreach_get(pixels)
pixels = pixels.reshape(size, size, 4)
seamPath = scriptPath.with_name('Script_NakajimaKi4AoSeams.py')
seamNamespace = {'__file__': str(seamPath)}
exec(compile(seamPath.read_text(encoding='utf8'), str(seamPath), 'exec'), seamNamespace)
seams = seamNamespace['StitchAoSeams'](blades, pixels, protectedStrip=0.)
assert np.isfinite(pixels).all() and pixels[:, :, :3].min() >= 0 and pixels[:, :, :3].max() <= 1.00001
image.pixels.foreach_set(pixels.ravel())
image.update()
image.file_format = 'PNG'
image.filepath_raw = str(sourceRoot / 'Textures/Texture_Ki4PropellerGeometryAo.png')
image.save()
image.pack()
aoRecord = {'state': 'ActualNewPropellerRigidGroupAoBaked', 'resolution': [size, size],
            'nodeSamples': aoSettings['nodeSamples'], 'distanceM': aoSettings['distanceM'],
            'rigidCasters': [obj.name for obj in rigidObjects], 'receivers': [obj.name for obj in blades],
            'seconds': time.time() - started, 'seams': seams,
            'meanIncludingUnusedWhite': float(pixels[:, :, 0].mean()),
            'minimum': float(pixels[:, :, 0].min()),
            'imageSha256': hashlib.sha256(image.packed_file.data).hexdigest(),
            'scope': 'Only same-pivot assembly occludes the new blades; no frozen cowl/body/ground shadows.'}
nodes = material.node_tree.nodes
links = material.node_tree.links
uv = nodes.new('ShaderNodeUVMap')
uv.uv_map = 'GeometryAO'
texture = nodes.new('ShaderNodeTexImage')
texture.image = image
separate = nodes.new('ShaderNodeSeparateColor')
links.new(uv.outputs['UV'], texture.inputs['Vector'])
links.new(texture.outputs['Color'], separate.inputs['Color'])
settings = next(node for node in nodes if node.type == 'GROUP' and node.node_tree
                and node.node_tree.name == 'glTF Material Output')
links.new(separate.outputs['Red'], settings.inputs['Occlusion'])
material['geometryAoUv'] = 'Fresh propeller rigid-group atlas; UV1 only'
assert all(protected[name] == MeshFingerprint(bpy.data.objects[name]) for name in protected)
for name, digest in packedBefore.items():
    assert hashlib.sha256(bpy.data.images[name].packed_file.data).hexdigest() == digest
assert len([im for im in bpy.data.images if im.packed_file]) == 42
root['version'] = recipe['version']
root['propellerSectionScope'] = recipe['scope']
root['referenceFidelityPassed'] = False
root['geometryAoPendingForChangedGeometry'] = True
root['propellerGeometryAoFresh'] = True
root['propellerPhotographicShapeParametersJson'] = json.dumps(recipe['parameters'])
root['propellerMaximumRotationRadiusM'] = max(math.hypot(p[0], p[1]) for part in parts for p in part['sampledLocalGltf'])
root['propellerDiameterM'] = 2 * root['propellerMaximumRotationRadiusM']
scene['Ki4PropellerSectionMutationInProgress'] = False
allPoints = []
graph = bpy.context.evaluated_depsgraph_get()
triangles = 0
for obj in meshes:
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.to_mesh()
    mesh.calc_loop_triangles()
    triangles += len(mesh.loop_triangles)
    allPoints.extend(tuple(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices)
    evaluated.to_mesh_clear()
points = np.array(allPoints)
dimensionsBlender = points.max(0) - points.min(0)
dimensions = dimensionsBlender[[0, 2, 1]]
assert np.all(abs(dimensions - [12, 3.31, 8.25]) <= [.002, .04, .05]), dimensions
fingerprints = {obj.name: MeshFingerprint(obj) for obj in meshes}
for path in [scriptPath, modulePath, seamPath, scriptPath.with_name('Script_NakajimaKi4AoQuantize.py')]:
    text = bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name)
    text.clear()
    text.write(path.read_text(encoding='utf8'))
    text.use_fake_user = True
    shutil.copy2(path, sourceRoot / 'Scripts' / path.name)
shutil.copy2(recipePath, sourceRoot / 'Scripts' / recipePath.name)
targetSource = sourceRoot / 'Scene_NakajimaKi4.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(targetSource))
sourceSha = hashlib.sha256(targetSource.read_bytes()).hexdigest()
assert hashlib.sha256(source.read_bytes()).hexdigest() == recipe['inputSourceSha256']

# Save the author with original pending AO nodes intact. Neutralize only those
# old atlases transiently for a diagnostic export; preserve the fresh prop AO.
neutralized = []
for mat in bpy.data.materials:
    if not mat.use_nodes:
        continue
    for node in list(mat.node_tree.nodes):
        oldImage = getattr(node, 'image', None)
        if oldImage is None or oldImage == image or not re.search(r'GeometryAo|HardwareAo|TireAo|ShoeAo|SkidAo', oldImage.name, re.I):
            continue
        outgoing = [link for link in mat.node_tree.links if link.from_node == node]
        if not outgoing:
            continue
        white = mat.node_tree.nodes.new('ShaderNodeRGB')
        white.label = 'DiagnosticOnly_OtherGeometryAoPending'
        white.outputs[0].default_value = (1, 1, 1, 1)
        for link in outgoing:
            socket = link.to_socket
            mat.node_tree.links.remove(link)
            mat.node_tree.links.new(white.outputs[0], socket)
        neutralized.append({'material': mat.name, 'image': oldImage.name})
bpy.ops.object.select_all(action='DESELECT')
for obj in [root] + list(root.children_recursive):
    obj.select_set(True)
bpy.context.view_layer.objects.active = root
options = dict(export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
               export_extras=True, export_normals=True, export_tangents=True,
               export_materials='EXPORT', export_animations=False, export_cameras=False, export_lights=False)
pbrPath = asset / 'Model_NakajimaKi4HighPbr.glb'
bpy.ops.export_scene.gltf(filepath=str(pbrPath), **options)
originalMaterials = {obj: list(obj.data.materials) for obj in meshes}
gray = bpy.data.materials.new('Material_Propeller44GrayDiagnostic')
gray.use_nodes = True
bsdf = next(node for node in gray.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value = (.32, .33, .32, 1)
bsdf.inputs['Roughness'].default_value = .77
for obj in meshes:
    if any(mat and 'Windscreen' in mat.name for mat in obj.data.materials):
        continue
    for index in range(len(obj.data.materials)):
        obj.data.materials[index] = gray
grayPath = asset / 'Model_NakajimaKi4HighGray.glb'
bpy.ops.export_scene.gltf(filepath=str(grayPath), **options)
for obj, mats in originalMaterials.items():
    for index, mat in enumerate(mats):
        obj.data.materials[index] = mat
assert hashlib.sha256(targetSource.read_bytes()).hexdigest() == sourceSha
proof = {'state': 'IndependentClosedPropellerSourceSaved_NativeReferenceChecksPending',
         'version': recipe['version'], 'inputSourcePath': str(source),
         'inputSourceSha256': recipe['inputSourceSha256'], 'sourcePath': str(targetSource),
         'sourceSha256': sourceSha, 'pbrExportPath': str(pbrPath),
         'pbrExportSha256': hashlib.sha256(pbrPath.read_bytes()).hexdigest(),
         'grayExportPath': str(grayPath), 'grayExportSha256': hashlib.sha256(grayPath.read_bytes()).hexdigest(),
         'sourceMeshFingerprints': fingerprints, 'protectedUnchangedMeshes': len(protected),
         'changedMeshes': sorted(allowed), 'sourceMeshes': 928,
         'originalPackedImagesRetained': packedBefore, 'sourcePackedImages': 42,
         'newImageName': image.name, 'newImageSha256': hashlib.sha256(image.packed_file.data).hexdigest(),
         'nominalDimensionsGltfM': dimensions.tolist(), 'evaluatedTriangles': triangles,
         'propellerParts': parts, 'rootConnections': rootConnections,
         'sourcePropellerClearance24Phases': clearances, 'freshPropellerAo': aoRecord,
         'otherGeometryAoNeutralizedOnlyInDiagnosticExport': neutralized,
         'allOriginal926OtherMeshFingerprintsRetained': True, 'canonicalPromoted': False,
         'referenceFidelityPassed': False, 'scope': recipe['scope']}
for path in [asset / 'Evidence/Data_PropellerSectionAuthor.json', sourceRoot / 'Evidence/Data_PropellerSectionAuthor.json']:
    path.write_text(json.dumps(proof, indent=2), encoding='utf8')
result = {key: proof[key] for key in ['state', 'sourceSha256', 'pbrExportSha256',
                                    'grayExportSha256', 'evaluatedTriangles', 'sourcePackedImages']}
print(json.dumps(result))
