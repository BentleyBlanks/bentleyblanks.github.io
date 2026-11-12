"""Assemble source-proportioned Sichuan messenger parts with spread fingers.

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
from Script_SichuanMessengerClothFit import BuildCalfWrap, FitCapBand, TrimSourcePart, WorldPoints

sourceRoot = Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\33_川军传令兵')
projectRoot = Path(os.environ.get('MESSENGER_PROJECT_DIR', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\SichuanMessengerRepair_20261112'))
reviewRoot = projectRoot / 'Review'
exportRoot = Path(os.environ.get('MESSENGER_OUTPUT_DIR', str(sourceRoot)))
reviewRoot.mkdir(parents=True, exist_ok=True)
exportRoot.mkdir(parents=True, exist_ok=True)
exportEnabled = os.environ.get('MESSENGER_REVIEW_ONLY') != '1'
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

# Source meshes keep their three-dimensional proportions. Pants cuffs and the
# hidden base of the head bust are trimmed along planes without moving surfaces.
body = DuplicatePart(sources['Body'], 'Body')
bodyScale = 1.4
pantsCutLocalZ = 0.14
pantsHemWorldZ = 0.420
bodyShiftZ = pantsHemWorldZ - pantsCutLocalZ * bodyScale
body.matrix_world = Matrix.Translation((0, 0, bodyShiftZ)) @ Matrix.Scale(bodyScale, 4)
bodyReport = TrimSourcePart(body, minimumWorldZ=pantsHemWorldZ)
bodyPointsWorld = WorldPoints(body)
bodyRaw = Coordinates(sources['Body'])
bodyCollarTop = bodyShiftZ + bodyRaw[:, 2].max() * bodyScale
frontCollar = bodyRaw[(bodyRaw[:, 0] > 0.01) & (np.abs(bodyRaw[:, 1]) < 0.08)]
frontCollarTop = bodyShiftZ + frontCollar[:, 2].max() * bodyScale

head = DuplicatePart(sources['HeadBald'], 'HeadBald')
headScale = 0.33
headCrownZ = bodyCollarTop + 0.222
headShiftZ = headCrownZ - Coordinates(head)[:, 2].max() * headScale
head.matrix_world = Matrix.Translation((0.012, 0, headShiftZ)) @ Matrix.Scale(headScale, 4)
neckTransitionZ = headShiftZ + 0.26 * headScale
headReport = TrimSourcePart(head, minimumWorldZ=neckTransitionZ)
neckBase = DuplicatePart(sources['HeadBald'], 'NeckBase')
neckBase.matrix_world = head.matrix_world.copy()
neckReport = TrimSourcePart(neckBase, maximumWorldZ=neckTransitionZ, halfWidth=0.066, minimumWorldX=-0.055)
modelHeight = headCrownZ + 0.045
pixelSize = modelHeight / 631.0

hand = DuplicatePart(sources['LeftHand'], 'Hand_L')
rawHand = Coordinates(hand)
sample = rawHand[rawHand[:, 1] > 0.10][:, [0, 2]]
sample -= sample.mean(0)
_, axes = np.linalg.eigh(sample.T @ sample)
dorsal = axes[:, 0]
if dorsal[0] < 0:
    dorsal *= -1
handRoll = math.atan2(-dorsal[0], dorsal[1])
handRotation = Matrix.Rotation(handRoll, 4, 'Y')
preparedHand = rawHand @ np.array(handRotation.to_3x3()).T
wrist = preparedHand[preparedHand[:, 1] < preparedHand[:, 1].min() + 0.025]
wristCenter = (wrist.min(0) + wrist.max(0)) / 2
cuff = bodyPointsWorld[bodyPointsWorld[:, 1] > bodyPointsWorld[:, 1].max() - 0.025]
cuffCenter = (cuff.min(0) + cuff.max(0)) / 2
targetWrist = cuffCenter.copy()
targetWrist[1] = bodyPointsWorld[:, 1].max() - 14.0 * pixelSize
handScale = 0.205
handTransform = Matrix.Translation(Vector(targetWrist - wristCenter * handScale)) @ handRotation @ Matrix.Scale(handScale, 4)
hand.matrix_world = handTransform
mirror = Matrix.Diagonal((1.0, -1.0, 1.0, 1.0))
rightHand = hand.copy()
rightHand.name = 'Part_Hand_R'
assemblyCollection.objects.link(rightHand)
rightHand.matrix_world = mirror @ handTransform

foot = DuplicatePart(sources['LeftFoot'], 'Foot_L')
rawFoot = Coordinates(foot)
footScale = 0.26
footRotation = Matrix.Rotation(math.radians(5), 4, 'Z')
scaledFoot = rawFoot @ np.array(footRotation.to_3x3()).T * footScale
top = scaledFoot[rawFoot[:, 2] > rawFoot[:, 2].max() - 0.06]
topCenter = (top.min(0) + top.max(0)) / 2
leg = bodyPointsWorld[(bodyPointsWorld[:, 1] > 0) & (bodyPointsWorld[:, 2] < pantsHemWorldZ + 0.03)]
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
capScale = 0.24
capRotation = Matrix.Rotation(math.radians(-10), 4, 'Y')
scaledCap = rawCap @ np.array(capRotation.to_3x3()).T * capScale
bill = scaledCap[(rawCap[:, 0] > 0.30) & (rawCap[:, 2] < 0.30)]
headNoseX = WorldPoints(head)[:, 0].max()
capShift = np.array([headNoseX + 0.025 - bill[:, 0].max(), 0, 0])
cap.matrix_world = Matrix.Translation(Vector(capShift)) @ capRotation @ Matrix.Scale(capScale, 4)
capReport = FitCapBand(cap, head, modelHeight)

report = {'body': bodyReport, 'head': headReport, 'neckBase': neckReport, 'modelHeightMeters': modelHeight,
          'handPose': 'OriginalSpreadFingers', 'calfWrap': wrapReport, 'capBand': capReport,
          'originalPartScaleChecks': {}}
for name, obj in [('Body', body), ('Head', head), ('Hand', hand), ('Foot', foot), ('Cap', cap)]:
    scales = np.linalg.svd(np.array(obj.matrix_world.to_3x3()), compute_uv=False)
    assert scales.max() - scales.min() < 1e-6
    report['originalPartScaleChecks'][name] = scales.tolist()
assert np.array_equal(Coordinates(hand), Coordinates(sources['LeftHand']))
assert np.array_equal(Coordinates(foot), Coordinates(sources['LeftFoot']))
report['handSourceMeshUnchanged'] = True
report['footSourceMeshUnchanged'] = True
handWorld = WorldPoints(hand)
mirroredHandWorld = handWorld.copy()
mirroredHandWorld[:, 1] *= -1
mirrorError = float(np.linalg.norm(mirroredHandWorld - WorldPoints(rightHand), axis=1).max())
assert mirrorError < 1e-5
report['handMirrorMaximumErrorMeters'] = mirrorError

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
wholeCenter = Vector((0, 0, 315)) * pixelSize
handCenter = Vector((handWorld.min(0) + handWorld.max(0)) / 2)
footWorld = WorldPoints(foot)
footCenter = Vector(((footWorld[:, 0].min() + footWorld[:, 0].max()) / 2, legCenter[1], wrapReport['topZ'] / 2))
headCenter = Vector((0.012, 0, (frontCollarTop + modelHeight) / 2))
views = [
    ('Front', wholeCenter, Vector((4, 0, 0)), 640 * pixelSize),
    ('LeftSide', wholeCenter, Vector((0, 4, 0)), 640 * pixelSize),
    ('Back', wholeCenter, Vector((-4, 0, 0)), 640 * pixelSize),
    ('ThreeQuarter', wholeCenter, Vector((4, 3, 0.5)), modelHeight * 1.10),
    ('HandTop', handCenter, Vector((0, 0, 4)), 0.36),
    ('WristFront', Vector(targetWrist) + Vector((0, 0.015, 0)), Vector((4, 0, 0)), 0.27),
    ('FootSide', footCenter, Vector((0, 4, 0)), 0.66),
    ('CapFront', headCenter, Vector((4, 0, 0)), 0.43),
    ('CapLeftSide', headCenter, Vector((0, 4, 0)), 0.43),
    ('CapBack', headCenter, Vector((-4, 0, 0)), 0.43),
]
for name, center, direction, span in views:
    camera.location = center + direction
    camera.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
    cameraData.ortho_scale = span
    if name == 'Front':
        frontRotation = camera.rotation_euler.to_quaternion()
    scene.render.filepath = str(reviewRoot / f'Preview_SichuanMessenger_{name}.png')
    bpy.ops.render.render(write_still=True)
sourceHand = sources['LeftHand']
sourceHand.matrix_world = hand.matrix_world
sourceHand.hide_render = False
for part in assemblyCollection.objects:
    part.hide_render = True
camera.location = handCenter + Vector((0, 0, 4))
camera.rotation_euler = Vector((0, 0, -4)).to_track_quat('-Z', 'Y').to_euler()
cameraData.ortho_scale = 0.36
scene.render.filepath = str(reviewRoot / 'Preview_SichuanMessenger_SourceHandTop.png')
bpy.ops.render.render(write_still=True)
sourceHand.matrix_world = Matrix.Identity(4)
sourceHand.hide_render = True
for part in assemblyCollection.objects:
    part.hide_render = False
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
