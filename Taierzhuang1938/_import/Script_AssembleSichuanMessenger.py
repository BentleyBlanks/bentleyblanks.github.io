"""Rebuild the messenger from five original Tripo GLBs and photo landmarks.

Run through scripts/Script_BlenderMcp.mjs start --batch. Set
MESSENGER_REVIEW_ONLY=1 to render the editable assembly before exporting.
"""
import os
import math
import json
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

sourceRoot = Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\33_川军传令兵')
projectRoot = Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\SichuanMessengerRebuild_20261112')
reviewRoot = projectRoot / 'Review'
reviewRoot.mkdir(parents=True, exist_ok=True)
exportEnabled = os.environ.get('MESSENGER_REVIEW_ONLY') != '1'
pixelSize = 1.75 / 631.0
floorPixel = 635.0
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene['BlenderMcpTask'] = 'SichuanMessengerRebuild_20261112'
scene.unit_settings.system = 'METRIC'
sourceCollection = bpy.data.collections.new('OriginalSources')
assemblyCollection = bpy.data.collections.new('EditableAssembly')
scene.collection.children.link(sourceCollection)
scene.collection.children.link(assemblyCollection)


def Coordinates(obj):
    values = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', values)
    return values.reshape(-1, 3)


def CornerNormals(obj):
    return np.array([normal.vector[:] for normal in obj.data.corner_normals])


def UpdateGeometry(obj, points, normals):
    obj.data.vertices.foreach_set('co', np.asarray(points).ravel())
    obj.data.update()
    normals = np.asarray(normals)
    normals /= np.linalg.norm(normals, axis=1, keepdims=True).clip(1e-10)
    obj.data.normals_split_custom_set(normals.tolist())


def DuplicatePart(source, role):
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = 'Part_' + role
    obj.data.name = 'Mesh_SichuanMessenger_' + role
    assemblyCollection.objects.link(obj)
    obj.hide_render = False
    obj.hide_set(False)
    return obj


def MirrorPart(source, role):
    points = Coordinates(source)
    points[:, 1] *= -1
    mesh = bpy.data.meshes.new('Mesh_SichuanMessenger_' + role)
    mesh.from_pydata(points.tolist(), [], [list(reversed(face.vertices)) for face in source.data.polygons])
    mesh.update()
    for material in source.data.materials:
        mesh.materials.append(material)
    for targetFace, sourceFace in zip(mesh.polygons, source.data.polygons):
        targetFace.material_index = sourceFace.material_index
        targetFace.use_smooth = sourceFace.use_smooth
    for sourceUv in source.data.uv_layers:
        targetUv = mesh.uv_layers.new(name=sourceUv.name)
        for targetFace, sourceFace in zip(mesh.polygons, source.data.polygons):
            for targetLoop, sourceLoop in zip(targetFace.loop_indices, reversed(sourceFace.loop_indices)):
                targetUv.data[targetLoop].uv = sourceUv.data[sourceLoop].uv
    sourceNormals = CornerNormals(source)
    normals = []
    for face in source.data.polygons:
        for index in reversed(face.loop_indices):
            normal = sourceNormals[index].copy()
            normal[1] *= -1
            normals.append(normal)
    mesh.normals_split_custom_set(normals)
    obj = bpy.data.objects.new('Part_' + role, mesh)
    assemblyCollection.objects.link(obj)
    return obj


sources = {}
for role in ['Body', 'HeadBald', 'LeftHand', 'LeftFoot', 'FieldCap']:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(sourceRoot / f'Model_SichuanMessenger_{role}_Source.glb'))
    obj = next(obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH')
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)
    obj.name = 'Source_' + role
    obj.data.name = 'Mesh_Source_' + role
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    sourceCollection.objects.link(obj)
    for material in obj.data.materials:
        material.name = 'Material_SichuanMessenger_' + role
        textureNodes = [node for node in material.node_tree.nodes if node.type == 'TEX_IMAGE']
        for node, suffix in zip(textureNodes, ['BaseColor', 'Orm', 'Normal']):
            node.name = 'Image_' + suffix
            node.image.name = f'Texture_SichuanMessenger_{role}_{suffix}'
    obj.hide_render = True
    obj.hide_set(True)
    obj.select_set(False)
    sources[role] = obj

# One world coordinate system corresponds to the 640-pixel reference image.
# +X is forward, +Y is the character's left, and +Z is up.
body = DuplicatePart(sources['Body'], 'Body')
rawBody = Coordinates(body)
bodyNormals = CornerNormals(body)
bodyLoops = np.array([loop.vertex_index for loop in body.data.loops])
sourceHeights = np.array([0.0, 0.16, 0.37, 0.45, 0.70, 0.814, 0.9380395412445068])
photoRows = np.array([485.0, 430.0, 380.0, 330.0, 205.0, 137.0, 98.0])
bodyPoints = rawBody.copy()
bodyPoints[:, 0] = rawBody[:, 0] * 360.0 + 5.0
bodyPoints[:, 1] = rawBody[:, 1] * 512.0 - 1.0
bodyPoints[:, 2] = floorPixel - np.interp(rawBody[:, 2], sourceHeights, photoRows)
backWeight = np.clip((-rawBody[:, 0] + 0.01) / 0.10, 0, 1)
neckWeight = np.clip((0.15 - np.abs(rawBody[:, 1])) / 0.07, 0, 1)
upperWeight = np.clip((rawBody[:, 2] - 0.87) / 0.068, 0, 1)
bodyPoints[:, 2] += 8.0 * backWeight * neckWeight * upperWeight
segments = np.clip(np.searchsorted(sourceHeights, rawBody[:, 2], side='right') - 1, 0, len(sourceHeights) - 2)
verticalScales = -(np.diff(photoRows) / np.diff(sourceHeights))[segments]
bodyNormals[:, 0] /= 360.0
bodyNormals[:, 1] /= 512.0
bodyNormals[:, 2] /= verticalScales[bodyLoops]
UpdateGeometry(body, bodyPoints * pixelSize, bodyNormals)

head = DuplicatePart(sources['HeadBald'], 'HeadBald')
rawHead = Coordinates(head)
headNormals = CornerNormals(head)
headPoints = rawHead * np.array([108.0, 124.0, 124.0])
headPoints[:, 0] += 8.0
headPoints[:, 1] -= 1.0
headPoints[:, 2] += floorPixel - 17.0 - rawHead[:, 2].max() * 124.0
photoY = floorPixel - headPoints[:, 2]
hiddenWeight = np.clip((photoY - 103.0) / 15.0, 0, 1)
neckCenter = np.array([3.0, -1.0])
delta = headPoints[:, :2] - neckCenter
radius = np.sqrt(np.sum((delta / np.array([15.0, 15.0])) ** 2, axis=1))
factor = 1.0 - hiddenWeight + hiddenWeight * np.minimum(1.0, 1.0 / radius.clip(1e-9))
headPoints[:, :2] = neckCenter + delta * factor[:, None]
headNormals /= np.array([108.0, 124.0, 124.0])
UpdateGeometry(head, headPoints * pixelSize, headNormals)

cap = DuplicatePart(sources['FieldCap'], 'FieldCap')
rawCap = Coordinates(cap)
capNormals = CornerNormals(cap)
capX = rawCap[:, 0] * 95.0 + 12.0
billMask = (rawCap[:, 0] > 0.30) & (rawCap[:, 2] < 0.30)
lowerScale, upperScale = 20.0, 100.0
for iteration in range(40):
    capVerticalScale = (lowerScale + upperScale) / 2
    capZ = rawCap[:, 2] * capVerticalScale + 0.05 * (capX - 58.0)
    if capZ.max() - capZ[billMask].min() > 38.0:
        upperScale = capVerticalScale
    else:
        lowerScale = capVerticalScale
capZ += floorPixel - 4.0 - capZ.max()
capPoints = np.column_stack([capX, rawCap[:, 1] * 83.0 - 3.0, capZ])
capLinear = np.array([[95, 0, 0], [0, 83, 0], [4.75, 0, capVerticalScale]])
UpdateGeometry(cap, capPoints * pixelSize, capNormals @ np.linalg.inv(capLinear))

hand = DuplicatePart(sources['LeftHand'], 'Hand_L')
rawHand = Coordinates(hand)
handNormals = CornerNormals(hand)
sample = rawHand[rawHand[:, 1] > 0.10][:, [0, 2]]
sample -= sample.mean(0)
_, axes = np.linalg.eigh(sample.T @ sample)
dorsal = axes[:, 0]
if dorsal[0] < 0:
    dorsal *= -1
handRoll = math.atan2(-dorsal[0], dorsal[1])
handRotation = np.array(Matrix.Rotation(handRoll, 3, 'Y'))
preparedHand = rawHand @ handRotation.T
handNormals = handNormals @ handRotation.T

# Close each finger around its own knuckle while keeping finger thickness.
# The four axes come from the separate distal branches of the original mesh.
fingerSlopes = np.array([-0.69938293, -0.35432458, -0.06592974, 0.26445656])
fingerIntercepts = np.array([-0.51921436, -0.36072850, -0.27628045, -0.17883320])
targetRoots = np.array([-0.48, -0.38, -0.28, -0.18])
lineDistances = np.abs(preparedHand[:, 0, None] - (preparedHand[:, 1, None] * fingerSlopes + fingerIntercepts))
fingerIds = np.argmin(lineDistances, axis=1)
fingerWeight = np.clip((preparedHand[:, 1] + 0.06) / 0.21, 0, 1)
fingerWeight = fingerWeight * fingerWeight * (3 - 2 * fingerWeight)
thumbExclusion = np.clip((preparedHand[:, 0] + 0.05) / 0.15, 0, 1) * np.clip((0.15 - preparedHand[:, 1]) / 0.15, 0, 1)
fingerWeight *= 1.0 - thumbExclusion
fingerAngles = np.arctan(fingerSlopes[fingerIds]) * fingerWeight
rootX = fingerSlopes[fingerIds] * 0.05 + fingerIntercepts[fingerIds]
dx = preparedHand[:, 0] - rootX
dy = preparedHand[:, 1] - 0.05
closedHand = preparedHand.copy()
closedHand[:, 0] = rootX + np.cos(fingerAngles) * dx - np.sin(fingerAngles) * dy
closedHand[:, 1] = 0.05 + np.sin(fingerAngles) * dx + np.cos(fingerAngles) * dy
closedHand[:, 0] += (targetRoots[fingerIds] - rootX) * fingerWeight
thumbWeight = np.clip((preparedHand[:, 0] + 0.12) / 0.22, 0, 1)
thumbWeight *= preparedHand[:, 1] < 0.15
thumbAngles = np.deg2rad(25.0) * thumbWeight
thumbDelta = closedHand[:, :2] - np.array([-0.12, -0.25])
closedHand[:, 0] = -0.12 + np.cos(thumbAngles) * thumbDelta[:, 0] - np.sin(thumbAngles) * thumbDelta[:, 1]
closedHand[:, 1] = -0.25 + np.sin(thumbAngles) * thumbDelta[:, 0] + np.cos(thumbAngles) * thumbDelta[:, 1]
handLoopVertices = np.array([loop.vertex_index for loop in hand.data.loops])
normalAngles = (fingerAngles + thumbAngles)[handLoopVertices]
normalX, normalY = handNormals[:, 0].copy(), handNormals[:, 1].copy()
handNormals[:, 0] = np.cos(normalAngles) * normalX - np.sin(normalAngles) * normalY
handNormals[:, 1] = np.sin(normalAngles) * normalX + np.cos(normalAngles) * normalY
wristMask = preparedHand[:, 1] < preparedHand[:, 1].min() + 0.025
wristCenter = (closedHand[wristMask].min(0) + closedHand[wristMask].max(0)) / 2
cuffMask = rawBody[:, 1] > rawBody[:, 1].max() - 0.02
cuffCenter = (bodyPoints[cuffMask].min(0) + bodyPoints[cuffMask].max(0)) / 2
handScale = 61.0 / (closedHand[:, 1].max() - wristCenter[1])
handTarget = np.array([cuffCenter[0], bodyPoints[:, 1].max() - 3.0, cuffCenter[2]])
handPoints = (closedHand - wristCenter) * handScale + handTarget
coveredStem = np.clip((preparedHand[:, 1].min() + 0.15 - preparedHand[:, 1]) / 0.15, 0, 1)
coveredStem = coveredStem * coveredStem * (3 - 2 * coveredStem)
handPoints[:, 1] -= 20.0 * coveredStem
UpdateGeometry(hand, handPoints * pixelSize, handNormals)
MirrorPart(hand, 'Hand_R')

foot = DuplicatePart(sources['LeftFoot'], 'Foot_L')
rawFoot = Coordinates(foot)
footNormals = CornerNormals(foot)
footRows = np.array([635.0, 622.0, 600.0, 588.0, 472.0])
footSourceZ = np.array([0.0, 0.10, 0.25, 0.35, rawFoot[:, 2].max()])
footPoints = rawFoot.copy()
footPoints[:, 0] *= 93.0
footPoints[:, 1] *= 104.0
footPoints[:, 2] = floorPixel - np.interp(rawFoot[:, 2], footSourceZ, footRows)
toeRotation = np.array(Matrix.Rotation(math.radians(5.0), 3, 'Z'))
footPoints = footPoints @ toeRotation.T
legMask = (rawBody[:, 1] > 0) & (rawBody[:, 2] < 0.025)
legCenter = (bodyPoints[legMask].min(0) + bodyPoints[legMask].max(0)) / 2
topMask = rawFoot[:, 2] > rawFoot[:, 2].max() - 0.06
topCenter = (footPoints[topMask].min(0) + footPoints[topMask].max(0)) / 2
footPoints[:, :2] += legCenter[:2] - topCenter[:2]
footSegments = np.clip(np.searchsorted(footSourceZ, rawFoot[:, 2], side='right') - 1, 0, len(footSourceZ) - 2)
footVerticalScales = -(np.diff(footRows) / np.diff(footSourceZ))[footSegments]
footLoopVertices = np.array([loop.vertex_index for loop in foot.data.loops])
footNormals[:, 0] /= 93.0
footNormals[:, 1] /= 104.0
footNormals[:, 2] /= footVerticalScales[footLoopVertices]
footNormals = footNormals @ toeRotation.T
UpdateGeometry(foot, footPoints * pixelSize, footNormals)
MirrorPart(foot, 'Foot_R')

# The review cameras use the reference's 640 by 640 frame without perspective tilt.
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = True
scene.world = bpy.data.worlds.new('ReviewWorld')
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0.35
for name, position, energy, size in [('Key', (3, -2, 4), 420, 4), ('Fill', (-2, 3, 2), 220, 4)]:
    lightData = bpy.data.lights.new(name, 'AREA')
    lightData.energy = energy
    lightData.shape = 'DISK'
    lightData.size = size
    light = bpy.data.objects.new(name, lightData)
    scene.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (Vector((0, 0, 0.9)) - light.location).to_track_quat('-Z', 'Y').to_euler()
cameraData = bpy.data.cameras.new('ReviewCamera')
camera = bpy.data.objects.new('ReviewCamera', cameraData)
scene.collection.objects.link(camera)
scene.camera = camera
cameraData.type = 'ORTHO'
cameraData.ortho_scale = 640.0 * pixelSize
reviewCenter = Vector((0, 0, (floorPixel - 320.0) * pixelSize))
for view, direction in [('Front', Vector((4, 0, 0))), ('LeftSide', Vector((0, 4, 0))), ('Back', Vector((-4, 0, 0)))]:
    camera.location = reviewCenter + direction
    camera.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    if view == 'Front':
        frontRotation = camera.rotation_euler.to_quaternion()
    scene.render.filepath = str(reviewRoot / f'Preview_SichuanMessenger_{view}.png')
    bpy.ops.render.render(write_still=True)

report = {'referencePixelSize': pixelSize, 'bodySourceHeights': sourceHeights.tolist(),
          'bodyPhotoRows': photoRows.tolist(), 'handRollDegrees': math.degrees(handRoll),
          'handPixelsPerSourceUnit': handScale, 'capVerticalPixelsPerSourceUnit': capVerticalScale,
          'parts': {obj.name: {'min': Coordinates(obj).min(0).tolist(),
                              'max': Coordinates(obj).max(0).tolist(),
                              'triangles': sum(len(face.vertices) - 2 for face in obj.data.polygons)}
                    for obj in assemblyCollection.objects}}
(projectRoot / 'Data_AssemblyFit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_rotation = frontRotation
            area.spaces.active.region_3d.view_location = reviewCenter
            area.spaces.active.region_3d.view_distance = 2.5
            area.spaces.active.region_3d.view_perspective = 'ORTHO'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(projectRoot / 'Scene_SichuanMessenger.blend'), compress=True)
if exportEnabled:
    bpy.ops.object.select_all(action='DESELECT')
    exportParts = []
    for part in assemblyCollection.objects:
        exportPart = part.copy()
        exportPart.data = part.data.copy()
        scene.collection.objects.link(exportPart)
        exportPart.select_set(True)
        exportParts.append(exportPart)
    bpy.context.view_layer.objects.active = exportParts[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = 'Model_SichuanMessenger_Assembled'
    joined.data.name = 'Mesh_SichuanMessenger_Assembled'
    bpy.ops.export_scene.gltf(filepath=str(sourceRoot / 'Model_SichuanMessenger_Assembled.glb'), export_format='GLB', use_selection=True, export_apply=True)
    bpy.ops.export_scene.fbx(filepath=str(sourceRoot / 'Model_SichuanMessenger_Assembled.fbx'), use_selection=True, path_mode='COPY', embed_textures=True, add_leaf_bones=False)
print(json.dumps(report))
