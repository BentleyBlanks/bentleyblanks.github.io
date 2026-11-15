"""Rebuild Er Ya from the user's weathered Tripo parts through BlenderMCP."""

import hashlib
import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

sourceRoot = Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\25_二丫\Dirty')
projectRoot = Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\ErYaDirtyAssembly_20261115')
reviewRoot = projectRoot / 'Review'
reviewRoot.mkdir(parents=True, exist_ok=True)
sourceFiles = {
    'Body': 'tripo_convert_8bd12f70-643f-4d44-a814-50d91f2c0471.glb',
    'HeadBald': 'tripo_convert_c74919d4-d7a4-41bf-9c71-beea75b72095.glb',
    'LeftHand': 'tripo_convert_ef5f79c9-8369-492a-bc59-dc5eb5a6319b.glb',
    'LeftFoot': 'tripo_convert_8ef4ebb5-68ae-4f54-8c0d-aab9d1d0257e.glb',
}
assert Path(bpy.data.filepath).parent == projectRoot, 'Select the owned Er Ya dirty project'
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)
for collection in list(bpy.data.collections):
    bpy.data.collections.remove(collection)
bpy.data.orphans_purge(do_recursive=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene['BlenderMcpTask'] = 'ErYaDirtyAssembly_20261115'
scene['ProportionReference'] = 'Accepted Er Ya original assembly and original front, side and back images'
scene['HeightMeters'] = 1.30
collections = {}
for name in ['OriginalSources', 'ErYaDirty_TPose', 'ReviewSetup']:
    collection = bpy.data.collections.new(name)
    scene.collection.children.link(collection)
    collections[name] = collection
sources = {}
placements = {}
pixelSize = 1.30 / (633 - 24)


def Coordinates(obj):
    points = np.empty(len(obj.data.vertices) * 3, dtype=np.float64)
    obj.data.vertices.foreach_get('co', points)
    return points.reshape(-1, 3)


def Center(points):
    return (points.min(0) + points.max(0)) / 2


def Place(sourceRole, role, scale, orientation, sourceAnchor, destination):
    source = sources[sourceRole]
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = 'Part_ErYaDirty_' + role
    obj.data.name = 'Mesh_ErYaDirty_' + role
    collections['ErYaDirty_TPose'].objects.link(obj)
    obj.hide_render = False
    obj.hide_set(False)
    obj.matrix_world = (Matrix.Translation(Vector(destination)) @ orientation.to_4x4()
                        @ Matrix.Scale(scale, 4) @ Matrix.Translation(-Vector(sourceAnchor)))
    obj['SourceRole'] = sourceRole
    placements[role] = {'sourceRole': sourceRole, 'uniformScale': scale,
                        'orientation': [list(row) for row in orientation],
                        'sourceAnchor': list(sourceAnchor), 'destinationMeters': list(destination)}
    return obj


def ExportFbx(parts):
    textureRoot = projectRoot / 'Textures' / 'Fbx'
    textureRoot.mkdir(parents=True, exist_ok=True)
    originals = {obj: list(obj.data.materials) for obj in parts}
    copies = {}
    for materials in originals.values():
        for original in materials:
            if original in copies:
                continue
            material = original.copy()
            material.name = original.name + '_Fbx'
            copies[original] = material
            nodes, links = material.node_tree.nodes, material.node_tree.links
            shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
            for channelName in ['Roughness', 'Metallic']:
                socket = shader.inputs[channelName]
                if not socket.is_linked:
                    continue
                connection = socket.links[0]
                separator = connection.from_node
                assert separator.type == 'SEPARATE_COLOR'
                sourceImage = separator.inputs[0].links[0].from_node.image
                index = list(separator.outputs).index(connection.from_socket)
                values = np.empty(len(sourceImage.pixels), dtype=np.float32)
                sourceImage.pixels.foreach_get(values)
                values = values.reshape(-1, 4)[:, index]
                if float(np.ptp(values)) < 1e-6:
                    links.remove(connection)
                    socket.default_value = float(values[0])
                    continue
                image = bpy.data.images.new(material.name + '_' + channelName,
                                            width=sourceImage.size[0], height=sourceImage.size[1])
                image.colorspace_settings.name = 'Non-Color'
                pixels = np.ones((len(values), 4), dtype=np.float32)
                pixels[:, :3] = values[:, None]
                image.pixels.foreach_set(pixels.ravel())
                image.filepath_raw = str(textureRoot / (image.name + '.png'))
                image.file_format = 'PNG'
                image.save()
                image.pack()
                texture = nodes.new('ShaderNodeTexImage')
                texture.image = image
                links.new(texture.outputs['Color'], socket)
    try:
        for obj, materials in originals.items():
            for index, material in enumerate(materials):
                obj.data.materials[index] = copies[material]
        bpy.ops.export_scene.fbx(filepath=str(sourceRoot / 'Model_ErYa_DirtyAssembled.fbx'),
                                  use_selection=True, object_types={'MESH'},
                                  apply_unit_scale=True, bake_anim=False,
                                  path_mode='COPY', embed_textures=True, use_mesh_modifiers=False)
    finally:
        for obj, materials in originals.items():
            for index, material in enumerate(materials):
                obj.data.materials[index] = material
        for material in copies.values():
            bpy.data.materials.remove(material)


for role, filename in sourceFiles.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(sourceRoot / filename))
    imported = [obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH']
    assert len(imported) == 1
    obj = imported[0]
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.name = 'Source_' + role
    obj.data.name = 'Mesh_ErYaDirty_Source_' + role
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    collections['OriginalSources'].objects.link(obj)
    for index, material in enumerate(obj.data.materials):
        material.name = 'Material_ErYaDirty_' + role + '_' + str(index)
    obj.hide_render = True
    obj.hide_set(True)
    sources[role] = obj

identity = Matrix.Identity(3)
reflection = Matrix.Diagonal((1.0, -1.0, 1.0))
rawBody = Coordinates(sources['Body'])
bodyScale = 500 * pixelSize
bodyOffset = np.array([-2 * pixelSize, -5 * pixelSize,
                       (633 - 115) * pixelSize - rawBody[:, 2].max() * bodyScale])
body = Place('Body', 'Body', bodyScale, identity, (0, 0, 0), bodyOffset)
bodyPoints = rawBody * bodyScale + bodyOffset

rawHead = Coordinates(sources['HeadBald'])
headScale = 126 * pixelSize
headOrientation = Matrix.Identity(3)
headOffset = np.array([52 * pixelSize - rawHead[:, 0].max() * headScale,
                       bodyOffset[1], 1.30 - rawHead[:, 2].max() * headScale])
headOffset[0] += .025
head = Place('HeadBald', 'HeadBald', headScale, headOrientation, (0, 0, 0), headOffset)

rawHand = Coordinates(sources['LeftHand'])
planeSample = rawHand[rawHand[:, 1] > 0][:, [0, 2]]
planeSample -= planeSample.mean(0)
_, axes = np.linalg.eigh(planeSample.T @ planeSample)
dorsal = axes[:, 0]
if dorsal[0] < 0:
    dorsal *= -1
handRoll = math.atan2(-dorsal[0], dorsal[1])
handOrientation = Matrix.Rotation(handRoll, 3, 'Y')
rotatedHand = rawHand @ np.array(handOrientation).T
wristMask = rawHand[:, 1] < rawHand[:, 1].min() + .035
wristAnchor = np.array(handOrientation).T @ Center(rotatedHand[wristMask])
for role, direction, orientation in [('Hand_L', 1, handOrientation),
                                      ('Hand_R', -1, reflection @ handOrientation)]:
    cuffMask = rawBody[:, 1] * direction > (rawBody[:, 1] * direction).max() - .025
    destination = Center(bodyPoints[cuffMask])
    outerCuff = (rawBody[:, 1] * direction).max() * direction * bodyScale + bodyOffset[1]
    destination[1] = outerCuff - direction * 21 * pixelSize
    Place('LeftHand', role, 90 * pixelSize, orientation, wristAnchor, destination)

rawFoot = Coordinates(sources['LeftFoot'])
shoeSample = rawFoot[(rawFoot[:, 2] > .04) & (rawFoot[:, 2] < .32)]
_, shoeAxes = np.linalg.eigh(np.cov(shoeSample[:, :2].T))
shoeAxis = shoeAxes[:, -1]
if shoeAxis[0] < 0:
    shoeAxis *= -1
sourceFootYaw = math.atan2(shoeAxis[1], shoeAxis[0])
footOrientation = Matrix.Rotation(math.radians(5) - sourceFootYaw, 3, 'Z')
footScale = 100 * pixelSize
topMask = rawFoot[:, 2] > rawFoot[:, 2].max() - .06
for role, direction, orientation in [('Foot_L', 1, footOrientation),
                                      ('Foot_R', -1, reflection @ footOrientation)]:
    rotatedFoot = rawFoot @ np.array(orientation).T
    topCenter = Center(rotatedFoot[topMask])
    floorOffset = -rotatedFoot[:, 2].min() * footScale
    legHeight = (topCenter[2] * footScale + floorOffset - bodyOffset[2]) / bodyScale
    legMask = (rawBody[:, 1] * direction > 0) & (np.abs(rawBody[:, 2] - legHeight) < .015)
    legCenter = Center(bodyPoints[legMask])
    offset = np.array([legCenter[0] - topCenter[0] * footScale,
                       legCenter[1] - topCenter[1] * footScale, floorOffset])
    Place('LeftFoot', role, footScale, orientation, (0, 0, 0), offset)

parts = [obj for obj in collections['ErYaDirty_TPose'].objects if obj.type == 'MESH']
bpy.context.view_layer.update()
for obj in parts:
    source = sources[obj['SourceRole']]
    assert np.array_equal(Coordinates(obj), Coordinates(source)), 'Protected original coordinates changed'
    assert [tuple(face.vertices) for face in obj.data.polygons] == [tuple(face.vertices) for face in source.data.polygons]
    assert np.array_equal(np.array([uv.uv[:] for uv in obj.data.uv_layers.active.data]),
                          np.array([uv.uv[:] for uv in source.data.uv_layers.active.data]))
    assert np.array_equal(np.array([normal.vector[:] for normal in obj.data.corner_normals]),
                          np.array([normal.vector[:] for normal in source.data.corner_normals]))
    singularValues = np.linalg.svd(np.array(obj.matrix_world)[:3, :3], compute_uv=False)
    assert np.ptp(singularValues) < 1e-6, 'Unequal axis scaling'

scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new('World_ErYaDirtyReview')
world.use_nodes = True
world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .6
scene.world = world
for name, position, energy in [('Key', (3, -2, 4), 220), ('Fill', (2, 3, 2), 170),
                                ('Back', (-3, -2, 3), 180)]:
    data = bpy.data.lights.new('Light_' + name, 'AREA')
    data.energy, data.size = energy, 4
    light = bpy.data.objects.new('Light_' + name, data)
    collections['ReviewSetup'].objects.link(light)
    light.location = position
    light.rotation_euler = (Vector((0, 0, .8)) - light.location).to_track_quat('-Z', 'Y').to_euler()
cameraData = bpy.data.cameras.new('Camera_ErYaDirty')
cameraData.type, cameraData.ortho_scale = 'ORTHO', 1.48
camera = bpy.data.objects.new('Camera_ErYaDirty', cameraData)
collections['ReviewSetup'].objects.link(camera)
scene.camera = camera
for view, direction in [('Front', (4, 0, 0)), ('ThreeQuarter', (4, -3, .7))]:
    camera.location = Vector((0, 0, .65)) + Vector(direction)
    camera.rotation_euler = (-Vector(direction)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(reviewRoot / ('Preview_ErYaDirty_' + view + '.png'))
    bpy.ops.render.render(write_still=True)

for obj in collections['OriginalSources'].objects:
    obj.hide_set(True)
for obj in collections['ReviewSetup'].objects:
    obj.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            space = area.spaces.active
            space.shading.type = 'MATERIAL'
            space.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
            space.region_3d.view_location = Vector((0, 0, .65))
            space.region_3d.view_distance = 2.1
            space.region_3d.view_perspective = 'ORTHO'
bpy.ops.object.select_all(action='DESELECT')
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(projectRoot / 'Scene_ErYa_DirtyAssembled.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(sourceRoot / 'Model_ErYa_DirtyAssembled.glb'),
                          export_format='GLB', use_selection=True, export_apply=True)
ExportFbx(parts)
worldPoints = np.concatenate([Coordinates(obj) @ np.array(obj.matrix_world)[:3, :3].T
                              + np.array(obj.matrix_world)[:3, 3] for obj in parts])
report = {'schema': 'tengxian.eryaDirtyAssembly', 'version': 1, 'sourceFiles': sourceFiles,
          'referenceRegistration': {'metersPerPixel': pixelSize, 'groundPixel': 633,
                                    'scalpPixel': 24, 'heightMeters': 1.30},
          'neckAlignmentForwardShiftMeters': .025,
          'sourceFootYawDegrees': math.degrees(sourceFootYaw), 'targetFootYawDegrees': 5,
          'sourceSha256': {role: hashlib.sha256((sourceRoot / filename).read_bytes()).hexdigest()
                           for role, filename in sourceFiles.items()},
          'placements': placements, 'parts': {obj.name: {'sourceRole': obj['SourceRole'],
              'vertices': len(obj.data.vertices), 'triangles': sum(len(face.vertices) - 2 for face in obj.data.polygons),
              'worldMatrix': [list(row) for row in obj.matrix_world]} for obj in parts},
          'boundsMeters': {'min': worldPoints.min(0).tolist(), 'max': worldPoints.max(0).tolist(),
                           'size': np.ptp(worldPoints, axis=0).tolist()},
          'originalMeshCoordinatesAndTopologyPreserved': True,
          'originalUvsAndCornerNormalsPreserved': True,
          'originalPbrMaterialsPreserved': True}
(projectRoot / 'Data_ErYaDirtyAssembly.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
