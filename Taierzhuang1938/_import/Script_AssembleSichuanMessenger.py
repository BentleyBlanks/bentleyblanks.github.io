"""Repair and assemble the original Sichuan messenger parts against the photos.

Run with scripts/Script_BlenderMcp.mjs start --batch. MESSENGER_OUTPUT_DIR
selects a staging export directory. MESSENGER_REVIEW_ONLY=1 skips file exports.
"""
import os
import sys
import math
import json
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from Script_SichuanMessengerHandPose import BuildHandPose
from Script_SichuanMessengerClothFit import BuildCalfWrap, FitCapBand

sourceRoot = Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\33_川军传令兵')
projectRoot = Path(r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\SichuanMessengerRepair_20261112')
reviewRoot = projectRoot / 'Review'
exportRoot = Path(os.environ.get('MESSENGER_OUTPUT_DIR', str(sourceRoot)))
reviewRoot.mkdir(parents=True, exist_ok=True)
exportRoot.mkdir(parents=True, exist_ok=True)
exportEnabled = os.environ.get('MESSENGER_REVIEW_ONLY') != '1'
pixelSize = 1.75 / 631.0
floorPixel = 635.0
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene['BlenderMcpTask'] = 'SichuanMessengerRepair_20261112'
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

rigCollection = bpy.data.collections.new('HandPoseRigs')
scene.collection.children.link(rigCollection)
hand, rig, handReport, preparedHand = BuildHandPose(sources['LeftHand'], assemblyCollection, rigCollection)
bodyPointsWorld = Coordinates(body)
cuff = bodyPointsWorld[bodyPointsWorld[:, 1] > bodyPointsWorld[:, 1].max() - 0.025]
cuffCenter = (cuff.min(0) + cuff.max(0)) / 2
wrist = preparedHand[preparedHand[:, 1] < preparedHand[:, 1].min() + 0.025]
wristCenter = (wrist.min(0) + wrist.max(0)) / 2
targetWrist = cuffCenter.copy()
targetWrist[1] = bodyPointsWorld[:, 1].max() - 14.0 * pixelSize
handScale = 0.205
handTransform = Matrix.Translation(Vector(targetWrist - wristCenter * handScale)) @ Matrix.Scale(handScale, 4)
hand.matrix_world = handTransform
rig.matrix_world = handTransform
mirror = Matrix.Diagonal((1.0, -1.0, 1.0, 1.0))
rightRig = rig.copy()
rightRig.data = rig.data.copy()
rightRig.name = 'Rig_HandPose_R'
rigCollection.objects.link(rightRig)
rightRig.matrix_world = mirror @ handTransform
for name in rig.pose.bones.keys():
    rightRig.pose.bones[name].rotation_quaternion = rig.pose.bones[name].rotation_quaternion
rightHand = hand.copy()
rightHand.name = 'Part_Hand_R'
assemblyCollection.objects.link(rightHand)
rightHand.matrix_world = mirror @ handTransform
rightHand.modifiers.get('PoseWithVolumePreservation').object = rightRig

foot = DuplicatePart(sources['LeftFoot'], 'Foot_L')
rawFoot = Coordinates(foot)
footScale = 0.26
footRotation = Matrix.Rotation(math.radians(5), 4, 'Z')
scaledFoot = rawFoot @ np.array(footRotation.to_3x3()).T * footScale
top = scaledFoot[rawFoot[:, 2] > rawFoot[:, 2].max() - 0.06]
topCenter = (top.min(0) + top.max(0)) / 2
leg = bodyPointsWorld[(bodyPointsWorld[:, 1] > 0) & (bodyPointsWorld[:, 2] < bodyPointsWorld[:, 2].min() + 0.03)]
legCenter = (leg.min(0) + leg.max(0)) / 2
footShift = np.array([legCenter[0] - topCenter[0], legCenter[1] - topCenter[1], -scaledFoot[:, 2].min()])
foot.matrix_world = Matrix.Translation(Vector(footShift)) @ footRotation @ Matrix.Scale(footScale, 4)
rightFoot = foot.copy()
rightFoot.name = 'Part_Foot_R'
assemblyCollection.objects.link(rightFoot)
rightFoot.matrix_world = mirror @ foot.matrix_world
wrapLeft, wrapRight, wrapReport = BuildCalfWrap(foot, body, assemblyCollection)

cap = DuplicatePart(sources['FieldCap'], 'FieldCap')
rawCap = Coordinates(cap)
capScale = 0.23
capRotation = Matrix.Rotation(math.radians(-10), 4, 'Y')
scaledCap = rawCap @ np.array(capRotation.to_3x3()).T * capScale
bill = scaledCap[(rawCap[:, 0] > 0.30) & (rawCap[:, 2] < 0.30)]
capShift = np.array([58.0 * pixelSize - bill[:, 0].max() - 0.012,
                     -pixelSize, (floorPixel - 42.0) * pixelSize - bill[:, 2].min() + 0.002])
cap.matrix_world = Matrix.Translation(Vector(capShift)) @ capRotation @ Matrix.Scale(capScale, 4)
capReport = FitCapBand(cap, head)

depsgraph = bpy.context.evaluated_depsgraph_get()
bpy.context.view_layer.update()
leftHandWorld = np.array([(hand.matrix_world @ vertex.co)[:] for vertex in hand.evaluated_get(depsgraph).data.vertices])
rightHandWorld = np.array([(rightHand.matrix_world @ vertex.co)[:] for vertex in rightHand.evaluated_get(depsgraph).data.vertices])
mirroredLeft = leftHandWorld.copy()
mirroredLeft[:, 1] *= -1
mirrorError = float(np.linalg.norm(mirroredLeft - rightHandWorld, axis=1).max())
assert mirrorError < 1e-5
footWorld = np.array([(foot.matrix_world @ vertex.co)[:] for vertex in foot.data.vertices])
rng = np.random.default_rng(1938)
first = rng.integers(0, len(rawFoot), 1200)
second = rng.integers(0, len(rawFoot), 1200)
sourceDistances = np.linalg.norm(rawFoot[first] - rawFoot[second], axis=1)
targetDistances = np.linalg.norm(footWorld[first] - footWorld[second], axis=1)
valid = sourceDistances > 1e-5
footRatios = targetDistances[valid] / sourceDistances[valid]
assert np.max(np.abs(footRatios - footScale)) < 1e-5
report = {'hand': handReport, 'handMirrorMaximumErrorMeters': mirrorError,
          'footUniformScale': footScale, 'footDistanceScaleStd': float(footRatios.std()),
          'calfWrap': wrapReport, 'capBand': capReport}

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
views = [
    ('Front', (0, 0, 315), (4, 0, 0), 640),
    ('LeftSide', (0, 0, 315), (0, 4, 0), 640),
    ('Back', (0, 0, 315), (-4, 0, 0), 640),
    ('HandTop', (10, 275, 493), (0, 0, 4), 130),
    ('WristFront', (10, 245, 493), (4, 0, 0), 90),
    ('FootSide', (5, 0, 85), (0, 4, 0), 230),
    ('CapFront', (0, 0, 570), (4, 0, 0), 150),
    ('CapLeftSide', (5, 0, 570), (0, 4, 0), 150),
    ('CapBack', (0, 0, 570), (-4, 0, 0), 150),
]
for name, centerPixels, directionTuple, span in views:
    center = Vector(centerPixels) * pixelSize
    direction = Vector(directionTuple)
    camera.location = center + direction
    camera.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    cameraData.ortho_scale = span * pixelSize
    if name == 'Front':
        frontRotation = camera.rotation_euler.to_quaternion()
    scene.render.filepath = str(reviewRoot / f'Preview_SichuanMessenger_{name}.png')
    bpy.ops.render.render(write_still=True)
for rigObject in rigCollection.objects:
    rigObject.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_rotation = frontRotation
            area.spaces.active.region_3d.view_location = Vector((0, 0, 315)) * pixelSize
            area.spaces.active.region_3d.view_distance = 2.5
            area.spaces.active.region_3d.view_perspective = 'ORTHO'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(projectRoot / 'Scene_SichuanMessenger.blend'), compress=True)


def BakeWorldPart(part):
    evaluated = part.evaluated_get(bpy.context.evaluated_depsgraph_get())
    evaluatedMesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
    matrix = part.matrix_world
    linear = np.array(matrix.to_3x3())
    reverse = matrix.determinant() < 0
    vertices = [(matrix @ vertex.co)[:] for vertex in evaluatedMesh.vertices]
    faces = [list(reversed(face.vertices)) if reverse else list(face.vertices) for face in evaluatedMesh.polygons]
    mesh = bpy.data.meshes.new('Mesh_Export_' + part.name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for material in evaluatedMesh.materials:
        mesh.materials.append(material)
    for targetFace, sourceFace in zip(mesh.polygons, evaluatedMesh.polygons):
        targetFace.material_index = sourceFace.material_index
        targetFace.use_smooth = sourceFace.use_smooth
    for sourceUv in evaluatedMesh.uv_layers:
        targetUv = mesh.uv_layers.new(name=sourceUv.name)
        for targetFace, sourceFace in zip(mesh.polygons, evaluatedMesh.polygons):
            sourceLoops = list(sourceFace.loop_indices)
            if reverse:
                sourceLoops.reverse()
            for targetLoop, sourceLoop in zip(targetFace.loop_indices, sourceLoops):
                targetUv.data[targetLoop].uv = sourceUv.data[sourceLoop].uv
    sourceNormals = np.array([normal.vector[:] for normal in evaluatedMesh.corner_normals]) @ np.linalg.inv(linear)
    sourceNormals /= np.linalg.norm(sourceNormals, axis=1, keepdims=True).clip(1e-9)
    normals = []
    for face in evaluatedMesh.polygons:
        loops = list(face.loop_indices)
        if reverse:
            loops.reverse()
        normals.extend(sourceNormals[loops])
    mesh.normals_split_custom_set(normals)
    obj = bpy.data.objects.new('Export_' + part.name, mesh)
    scene.collection.objects.link(obj)
    bpy.data.meshes.remove(evaluatedMesh)
    return obj


if exportEnabled:
    bpy.ops.object.select_all(action='DESELECT')
    exportParts = []
    for part in assemblyCollection.objects:
        exportPart = BakeWorldPart(part)
        exportPart.select_set(True)
        exportParts.append(exportPart)
    bpy.context.view_layer.objects.active = exportParts[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = 'Model_SichuanMessenger_Assembled'
    joined.data.name = 'Mesh_SichuanMessenger_Assembled'
    report['exportTriangles'] = sum(len(face.vertices) - 2 for face in joined.data.polygons)
    report['exportMaterials'] = [material.name for material in joined.data.materials]
    bpy.ops.export_scene.gltf(filepath=str(exportRoot / 'Model_SichuanMessenger_Assembled.glb'), export_format='GLB', use_selection=True, export_apply=True)
    bpy.ops.export_scene.fbx(filepath=str(exportRoot / 'Model_SichuanMessenger_Assembled.fbx'), use_selection=True, path_mode='COPY', embed_textures=True, add_leaf_bones=False)
(projectRoot / 'Data_RepairVerification.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
