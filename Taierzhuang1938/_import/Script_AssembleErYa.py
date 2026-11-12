"""Assemble Er Ya from original Tripo meshes using similarity transforms.

Run through scripts/Script_BlenderMcp.mjs exec --file or start --batch.
The editable parts retain the source mesh, topology, UVs and custom normals.
The head's white display base uses a visibility override in its assembled copy.
"""

import hashlib
import json
import math
import os
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

sourceRoot = Path(os.environ.get('ERYA_SOURCE_ROOT',
    r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\25_二丫'))
projectRoot = Path(os.environ.get('ERYA_PROJECT_ROOT',
    r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\ErYaAssembly_20261112'))
reviewRoot = projectRoot / 'Review'
reviewRoot.mkdir(parents=True, exist_ok=True)
floorPixel = 633.0
scalpPixel = 24.0
heightMeters = 1.30
pixelSize = heightMeters / (floorPixel - scalpPixel)
sourceFiles = {
    'Body': 'tripo_convert_de4e7855-00ac-4436-8ebb-6edc0dbbdd00.glb',
    'HeadBald': 'tripo_convert_7a6e9852-039d-426b-844d-71ca4cf415a6.glb',
    'LeftHand': 'tripo_convert_31a2c250-87ba-47a0-8a43-f02f8bc430ed.glb',
    'LeftFoot': 'tripo_convert_61bb1674-3f33-4981-a449-8e048bc8a9ec.glb',
}
for filename in sourceFiles.values():
    if not (sourceRoot / filename).is_file():
        raise FileNotFoundError(sourceRoot / filename)
if bpy.data.filepath and Path(bpy.data.filepath).parent != projectRoot:
    raise RuntimeError('Open the dedicated Er Ya project before rebuilding')
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for collection in list(bpy.data.collections):
    bpy.data.collections.remove(collection)
bpy.data.orphans_purge(do_recursive=True)
scene = bpy.context.scene
scene['BlenderMcpTask'] = 'ErYaOriginalReassembly_20261113'
scene['AssemblyMethod'] = 'Original meshes with uniform scale, rotation, translation and mirroring'
scene['ReferencePixelSizeMeters'] = pixelSize
scene['HeightAssumptionMeters'] = heightMeters
scene['ReferenceFit'] = 'Original parts placed against original front, profile and back references'
scene.unit_settings.system = 'METRIC'
collections = {}
for name in ['OriginalSources', 'ErYa_TPose', 'ReviewSetup', 'ReferenceImages_ToggleForComparison']:
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    collections[name] = collection
sources = {}
placements = {}


def Coordinates(obj):
    values = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', values)
    return values.reshape(-1, 3)


def BoundsCenter(points):
    return (points.min(0) + points.max(0)) / 2


def PlacePart(sourceRole, role, scalePixels, orientation, sourceAnchor, targetPixels):
    source = sources[sourceRole]
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = 'Part_ErYa_' + role
    obj.data.name = 'Mesh_ErYa_' + role
    collections['ErYa_TPose'].objects.link(obj)
    obj.hide_render = False
    obj.hide_set(False)
    obj.select_set(False)
    obj.matrix_world = (Matrix.Translation(Vector(targetPixels) * pixelSize)
                        @ orientation.to_4x4()
                        @ Matrix.Scale(scalePixels * pixelSize, 4)
                        @ Matrix.Translation(-Vector(sourceAnchor)))
    obj['SourceRole'] = sourceRole
    obj['AssemblyMethod'] = 'Similarity transform of original mesh'
    placements[role] = {'sourceRole': sourceRole, 'pixelsPerSourceUnit': scalePixels,
                        'sourceAnchor': list(sourceAnchor), 'targetPixels': list(targetPixels),
                        'orientation': [list(row) for row in orientation]}
    return obj


for role, filename in sourceFiles.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(sourceRoot / filename))
    obj = next(obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH')
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.name = 'Source_' + role
    obj.data.name = 'Mesh_ErYa_Source_' + role
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    collections['OriginalSources'].objects.link(obj)
    for material in obj.data.materials:
        material.name = 'Material_ErYa_' + role
    obj.hide_render = True
    obj.hide_set(True)
    obj.select_set(False)
    sources[role] = obj

# Pixel coordinates use +X forward, +Y towards the character's left, +Z up.
identity = Matrix.Identity(3)
reflection = Matrix.Diagonal((1.0, -1.0, 1.0))
rawBody = Coordinates(sources['Body'])
bodyScale = 500.0
bodyTranslation = np.array([-2.0, -5.0, floorPixel - 115 - rawBody[:, 2].max() * bodyScale])
body = PlacePart('Body', 'Body', bodyScale, identity, (0, 0, 0), bodyTranslation)
bodyPixels = rawBody * bodyScale + bodyTranslation

rawHead = Coordinates(sources['HeadBald'])
headScale = 126.0
headOrientation = Matrix.Rotation(math.radians(-8), 3, 'Y')
orientedHead = rawHead @ np.array(headOrientation).T
headTranslation = np.array([52 - orientedHead[:, 0].max() * headScale, -5.0,
    floorPixel - scalpPixel - orientedHead[:, 2].max() * headScale])
head = PlacePart('HeadBald', 'HeadBald', headScale, headOrientation, (0, 0, 0), headTranslation)

# Hide the head download's white display base in this assembled instance.
# Its geometry remains available in both the source and editable head meshes.
headMaterial = head.data.materials[0]
headShader = next(node for node in headMaterial.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
headImage = headShader.inputs['Base Color'].links[0].from_node.image
imageWidth, imageHeight = headImage.size[:]
headColors = np.array(headImage.pixels[:]).reshape(imageHeight, imageWidth, 4)
headUvs = head.data.uv_layers.active.data
headBaseFaces = []
for face in head.data.polygons:
    if face.center.z > .25:
        continue
    uv = sum((headUvs[index].uv for index in face.loop_indices), Vector((0, 0))) / len(face.loop_indices)
    column = min(imageWidth - 1, max(0, int(uv.x * (imageWidth - 1))))
    row = min(imageHeight - 1, max(0, int(uv.y * (imageHeight - 1))))
    color = headColors[row, column, :3]
    whiteBase = color.min() > .45 and color.max() - color.min() < .12
    belowBase = max(rawHead[index, 2] for index in face.vertices) < .08
    if whiteBase or belowBase:
        headBaseFaces.append(face.index)
baseMaterial = headMaterial.copy()
baseMaterial.name = 'Material_ErYa_DisplayBaseHidden'
baseShader = next(node for node in baseMaterial.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
for link in list(baseShader.inputs['Alpha'].links):
    baseMaterial.node_tree.links.remove(link)
baseShader.inputs['Alpha'].default_value = 0
head.data.materials.append(baseMaterial)
for faceIndex in headBaseFaces:
    head.data.polygons[faceIndex].material_index = len(head.data.materials) - 1
head['DisplayBaseHiddenFaces'] = len(headBaseFaces)

rawHand = Coordinates(sources['LeftHand'])
planeSample = rawHand[rawHand[:, 1] > 0][:, [0, 2]]
planeSample -= planeSample.mean(0)
_, axes = np.linalg.eigh(planeSample.T @ planeSample)
dorsal = axes[:, 0]
if dorsal[0] < 0:
    dorsal *= -1
handRoll = math.atan2(-dorsal[0], dorsal[1])
handOrientation = Matrix.Rotation(handRoll, 3, 'Y')
preparedHand = rawHand @ np.array(handOrientation).T
wristMask = rawHand[:, 1] < rawHand[:, 1].min() + .035
wristAnchor = np.array(handOrientation).T @ BoundsCenter(preparedHand[wristMask])
for role, direction, orientation in [('Hand_L', 1, handOrientation),
                                      ('Hand_R', -1, reflection @ handOrientation)]:
    cuffMask = rawBody[:, 1] * direction > (rawBody[:, 1] * direction).max() - .02
    target = BoundsCenter(bodyPixels[cuffMask])
    outerCuff = (rawBody[:, 1] * direction).max() * direction * bodyScale + bodyTranslation[1]
    target[1] = outerCuff - direction * 21
    PlacePart('LeftHand', role, 90.0, orientation, wristAnchor, target)

rawFoot = Coordinates(sources['LeftFoot'])
footOrientation = Matrix.Rotation(math.radians(5), 3, 'Z')
topMask = rawFoot[:, 2] > rawFoot[:, 2].max() - .06
for role, direction, orientation in [('Foot_L', 1, footOrientation),
                                      ('Foot_R', -1, reflection @ footOrientation)]:
    rotated = rawFoot @ np.array(orientation).T
    topCenter = BoundsCenter(rotated[topMask])
    legHeight = (topCenter[2] * 100 - bodyTranslation[2]) / bodyScale
    legMask = (rawBody[:, 1] * direction > 0) & (np.abs(rawBody[:, 2] - legHeight) < .015)
    legCenter = BoundsCenter(bodyPixels[legMask])
    translation = np.array([10.0, legCenter[1] - topCenter[1] * 100, -rotated[:, 2].min() * 100])
    PlacePart('LeftFoot', role, 100.0, orientation, (0, 0, 0), translation)

root = bpy.data.objects.new('Model_ErYa_Assembled', None)
collections['ErYa_TPose'].objects.link(root)
parts = [obj for obj in collections['ErYa_TPose'].objects if obj.type == 'MESH']
for obj in parts:
    obj.parent = root
    source = sources[obj['SourceRole']]
    assert np.array_equal(Coordinates(obj), Coordinates(source)), 'Source mesh coordinates changed'
    assert [loop.vertex_index for loop in obj.data.loops] == [loop.vertex_index for loop in source.data.loops]
    axes = np.linalg.svd(np.array(obj.matrix_world)[:3, :3], compute_uv=False)
    assert np.ptp(axes) < 1e-6, 'Part transform has nonuniform scale'
bpy.context.view_layer.update()
root['Pose'] = 'Original-body T-pose with original hand and foot geometry'
root['HeightMeters'] = heightMeters

scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('World_ErYaReview')
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .6
for name, position, energy in [('Key', (3, -2, 4), 220), ('Fill', (2, 3, 2), 170),
                                ('BackFill', (-3, -2, 3), 180)]:
    data = bpy.data.lights.new('Light_' + name, 'AREA')
    data.energy, data.size = energy, 4
    light = bpy.data.objects.new('Light_' + name, data)
    collections['ReviewSetup'].objects.link(light)
    light.location = position
    light.rotation_euler = (Vector((0, 0, .8)) - light.location).to_track_quat('-Z', 'Y').to_euler()
reviewCenter = Vector((0, pixelSize, (floorPixel - 320) * pixelSize))
for view, direction in [('Front', (4, 0, 0)), ('LeftSide', (0, 4, 0)), ('Back', (-4, 0, 0))]:
    data = bpy.data.cameras.new('Camera_' + view)
    camera = bpy.data.objects.new('Camera_' + view, data)
    collections['ReviewSetup'].objects.link(camera)
    data.type, data.ortho_scale = 'ORTHO', 640 * pixelSize
    center = reviewCenter.copy()
    if view == 'LeftSide':
        center.x = -20 * pixelSize
    camera.location = center + Vector(direction)
    camera.rotation_euler = (-Vector(direction)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    scene.render.filepath = str(reviewRoot / ('Preview_ErYa_' + view + '.png'))
    bpy.ops.render.render(write_still=True)
scene.camera = bpy.data.objects['Camera_Front']
referenceViews = [
    ('Front', (-.4, pixelSize, reviewCenter.z), ((0, 0, 1), (1, 0, 0), (0, 1, 0))),
    ('LeftSide', (-20 * pixelSize, -.4, reviewCenter.z), ((-1, 0, 0), (0, 0, 1), (0, 1, 0))),
    ('Back', (.4, -pixelSize, reviewCenter.z), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))),
]
for view, location, orientation in referenceViews:
    reference = bpy.data.objects.new('Reference_' + view, None)
    collections['ReferenceImages_ToggleForComparison'].objects.link(reference)
    reference.empty_display_type = 'IMAGE'
    reference.data = bpy.data.images.load(str(sourceRoot / ('Image_TPose' + view + '_2K.png')))
    reference.empty_display_size = 640 * pixelSize
    reference.empty_image_depth = 'BACK'
    reference.location, reference.rotation_euler = location, Matrix(orientation).to_euler()
    reference.hide_render = True
    reference.hide_set(True)
for obj in collections['ReviewSetup'].objects:
    obj.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_rotation = scene.camera.rotation_euler.to_quaternion()
            area.spaces.active.region_3d.view_location = reviewCenter
            area.spaces.active.region_3d.view_distance = 2.1
            area.spaces.active.region_3d.view_perspective = 'ORTHO'
            area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(projectRoot / 'Scene_ErYa_Assembled.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(sourceRoot / 'Model_ErYa_Assembled.glb'),
                          export_format='GLB', use_selection=True, export_apply=True)
report = {'schema': 'tengxian.originalPartsAssembly', 'version': 1,
          'heightMeters': heightMeters, 'metersPerReferencePixel': pixelSize,
          'sourceFiles': sourceFiles, 'placements': placements,
          'displayBaseHiddenFaces': len(headBaseFaces),
          'sourceSha256': {role: hashlib.sha256((sourceRoot / name).read_bytes()).hexdigest()
                           for role, name in sourceFiles.items()},
          'parts': {obj.name: {'sourceRole': obj['SourceRole'],
                     'sourceMeshMaxVertexError': float(np.abs(Coordinates(obj) - Coordinates(sources[obj['SourceRole']])).max()),
                     'worldMatrix': [list(row) for row in obj.matrix_world],
                     'triangles': sum(len(face.vertices) - 2 for face in obj.data.polygons)} for obj in parts}}
(projectRoot / 'Data_ErYaAssemblyFit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
