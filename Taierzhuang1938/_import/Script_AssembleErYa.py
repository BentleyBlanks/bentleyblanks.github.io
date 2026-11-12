"""Assemble Er Ya's downloaded Tripo parts through BlenderMCP.

Run with scripts/Script_BlenderMcp.mjs exec --file, or start --batch.
Original downloads remain available in the hidden OriginalSources collection.
"""

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
scalpPixel = 16.0
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
scene['BlenderMcpTask'] = 'ErYaAssembly_20261112'
scene['ReferenceFit'] = 'Front proportions, left profile depth, back continuity'
scene['HeightAssumptionMeters'] = heightMeters
scene['ReferencePixelSizeMeters'] = pixelSize
scene.unit_settings.system = 'METRIC'
sourceCollection = bpy.data.collections.new('OriginalSources')
assemblyCollection = bpy.data.collections.new('ErYa_TPose')
reviewCollection = bpy.data.collections.new('ReviewSetup')
referenceCollection = bpy.data.collections.new('ReferenceImages_ToggleForComparison')
for collection in [sourceCollection, assemblyCollection, reviewCollection, referenceCollection]:
    scene.collection.children.link(collection)


def Coordinates(obj):
    values = np.empty(len(obj.data.vertices) * 3)
    obj.data.vertices.foreach_get('co', values)
    return values.reshape(-1, 3)


def Normals(obj):
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
    obj.name = 'Part_ErYa_' + role
    obj.data.name = 'Mesh_ErYa_' + role
    assemblyCollection.objects.link(obj)
    obj.hide_render = False
    obj.hide_set(False)
    obj.select_set(False)
    return obj


def MirrorPart(source, role):
    obj = DuplicatePart(source, role)
    reflection = Matrix.Diagonal((1.0, -1.0, 1.0, 1.0))
    obj.data.transform(reflection)
    # Reflection reverses winding. Preserve UVs and the reflected custom normals.
    import bmesh
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.reverse_faces(mesh, faces=list(mesh.faces))
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    sourceNormals = Normals(source)
    sourceNormals[:, 1] *= -1
    # BMesh reverses each polygon's loop order, including its first loop.
    mirroredNormals = np.empty_like(sourceNormals)
    for targetFace, sourceFace in zip(obj.data.polygons, source.data.polygons):
        normalByVertex = {source.data.loops[index].vertex_index: sourceNormals[index]
                          for index in sourceFace.loop_indices}
        for index in targetFace.loop_indices:
            mirroredNormals[index] = normalByVertex[obj.data.loops[index].vertex_index]
    obj.data.normals_split_custom_set(mirroredNormals.tolist())
    return obj


sources = {}
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
    sourceCollection.objects.link(obj)
    for material in obj.data.materials:
        material.name = 'Material_ErYa_' + role
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                node.image.name = 'Texture_ErYa_' + role + '_' + node.image.name
    obj.hide_render = True
    obj.hide_set(True)
    obj.select_set(False)
    sources[role] = obj

# +X is forward, +Y is the character's left, +Z is up.
# All fitting coordinates below use the 640-pixel front reference.
body = DuplicatePart(sources['Body'], 'Body')
rawBody = Coordinates(body)
bodyNormals = Normals(body)
bodyLoops = np.array([loop.vertex_index for loop in body.data.loops])
bodyHeights = np.array([0, .16, .36, .48, .70, .80, .86, rawBody[:, 2].max()])
bodyRows = np.array([602, 524, 421, 362, 253, 196, 160, 115])
bodyDepth = np.interp(rawBody[:, 2], [0, .40, .48, .70, .86, .9783],
                      [480, 480, 465, 430, 440, 420])
bodyOffset = np.interp(rawBody[:, 2], [0, .40, .48], [-8, -8, -2])
bodyPoints = rawBody * np.array([1.0, 491.0, 1.0])
bodyPoints[:, 0] = rawBody[:, 0] * bodyDepth + bodyOffset
bodyPoints[:, 1] -= 9.0
bodyPoints[:, 2] = floorPixel - np.interp(rawBody[:, 2], bodyHeights, bodyRows)
armWeight = np.clip((np.abs(rawBody[:, 1]) - .12) / .14, 0, 1)
armWeight *= np.clip((rawBody[:, 2] - .70) / .10, 0, 1)
bodyPoints[:, 0] -= 32.0 * armWeight
bodyPoints[:, 1] += 9.0 * armWeight
bodyPoints[:, 2] += 4.0 * armWeight
# The right trouser cuff sits farther from the centreline in the reference.
ankleWeight = np.clip((.24 - rawBody[:, 2]) / .20, 0, 1)
rightWeight = np.clip(-rawBody[:, 1] / .04, 0, 1)
bodyPoints[:, 1] -= 9.0 * ankleWeight * rightWeight
segments = np.clip(np.searchsorted(bodyHeights, rawBody[:, 2], side='right') - 1,
                   0, len(bodyHeights) - 2)
verticalScales = -(np.diff(bodyRows) / np.diff(bodyHeights))[segments]
bodyNormals[:, 0] /= bodyDepth[bodyLoops]
bodyNormals[:, 1] /= 491.0
bodyNormals[:, 2] /= verticalScales[bodyLoops]
UpdateGeometry(body, bodyPoints * pixelSize, bodyNormals)

head = DuplicatePart(sources['HeadBald'], 'HeadBald')
rawHead = Coordinates(head)
headNormals = Normals(head)
headScales = np.array([104.0, 122.0, 135.0])
headPoints = rawHead * headScales
headPoints[:, 0] += 3.0
headPoints[:, 1] -= 5.0
headPoints[:, 2] += floorPixel - scalpPixel - rawHead[:, 2].max() * headScales[2]
headRows = floorPixel - headPoints[:, 2]
neckWeight = np.clip((headRows - 109.0) / 20.0, 0, 1)
neckCenter = np.array([-8.0, -5.0])
delta = headPoints[:, :2] - neckCenter
radius = np.sqrt(np.sum((delta / np.array([14.0, 14.0])) ** 2, axis=1))
neckScale = 1 - neckWeight + neckWeight * np.minimum(1, 1 / radius.clip(1e-9))
headPoints[:, :2] = neckCenter + delta * neckScale[:, None]
headPoints[:, 2] -= 5.0 * neckWeight
headNormals /= headScales
UpdateGeometry(head, headPoints * pixelSize, headNormals)

hand = DuplicatePart(sources['LeftHand'], 'Hand_L')
rawHand = Coordinates(hand)
handNormals = Normals(hand)
sample = rawHand[rawHand[:, 1] > 0][:, [0, 2]]
sample -= sample.mean(0)
_, axes = np.linalg.eigh(sample.T @ sample)
dorsal = axes[:, 0]
if dorsal[0] < 0:
    dorsal *= -1
handRoll = math.atan2(-dorsal[0], dorsal[1])
handRotation = np.array(Matrix.Rotation(handRoll, 3, 'Y'))
preparedHand = rawHand @ handRotation.T
handNormals = handNormals @ handRotation.T
closedHand = preparedHand.copy()
# Fit each distal branch around its own knuckle without thinning the fingers.
fingerSlopes = np.array([-1.10, -.60, -.23, .21])
fingerIntercepts = np.array([-.440, -.285, -.224, -.191])
fingerBaseY = np.array([-.08, .02, .10, .12])
fingerBaseX = fingerSlopes * fingerBaseY + fingerIntercepts
fingerTargetX = np.array([-.400, -.300, -.185, -.075])
lineDistances = np.abs(preparedHand[:, 0, None] -
    (preparedHand[:, 1, None] * fingerSlopes + fingerIntercepts))
fingerIds = np.argmin(lineDistances, axis=1)
fingerWeight = np.clip((preparedHand[:, 1] - fingerBaseY[fingerIds]) / .13, 0, 1)
fingerWeight = fingerWeight * fingerWeight * (3 - 2 * fingerWeight)
thumbWeight = np.clip((preparedHand[:, 0] + .10) / .16, 0, 1)
thumbWeight *= np.clip((.22 - preparedHand[:, 1]) / .10, 0, 1)
fingerWeight *= 1 - thumbWeight
fingerAngles = np.arctan(fingerSlopes[fingerIds]) * fingerWeight
dx = preparedHand[:, 0] - fingerBaseX[fingerIds]
dy = preparedHand[:, 1] - fingerBaseY[fingerIds]
closedHand[:, 0] = fingerBaseX[fingerIds] + np.cos(fingerAngles) * dx - np.sin(fingerAngles) * dy
closedHand[:, 1] = fingerBaseY[fingerIds] + np.sin(fingerAngles) * dx + np.cos(fingerAngles) * dy
closedHand[:, 0] += (fingerTargetX[fingerIds] - fingerBaseX[fingerIds]) * fingerWeight
thumbAngles = math.radians(35) * thumbWeight
thumbDelta = closedHand[:, :2] - np.array([-.10, -.18])
closedHand[:, 0] = -.10 + np.cos(thumbAngles) * thumbDelta[:, 0] - np.sin(thumbAngles) * thumbDelta[:, 1]
closedHand[:, 1] = -.18 + np.sin(thumbAngles) * thumbDelta[:, 0] + np.cos(thumbAngles) * thumbDelta[:, 1]
handLoops = np.array([loop.vertex_index for loop in hand.data.loops])
normalAngles = (fingerAngles + thumbAngles)[handLoops]
normalX, normalY = handNormals[:, 0].copy(), handNormals[:, 1].copy()
handNormals[:, 0] = np.cos(normalAngles) * normalX - np.sin(normalAngles) * normalY
handNormals[:, 1] = np.sin(normalAngles) * normalX + np.cos(normalAngles) * normalY
wristMask = preparedHand[:, 1] < preparedHand[:, 1].min() + .035
wristCenter = (closedHand[wristMask].min(0) + closedHand[wristMask].max(0)) / 2
cuffMask = rawBody[:, 1] > rawBody[:, 1].max() - .02
cuffCenter = (bodyPoints[cuffMask].min(0) + bodyPoints[cuffMask].max(0)) / 2
handScales = np.array([65.0, 93.0, 70.0])
handTarget = np.array([cuffCenter[0], bodyPoints[:, 1].max() - 21, cuffCenter[2] - 3])
handPoints = (closedHand - wristCenter) * handScales + handTarget
handNormals /= handScales
UpdateGeometry(hand, handPoints * pixelSize, handNormals)
rightHand = MirrorPart(hand, 'Hand_R')

foot = DuplicatePart(sources['LeftFoot'], 'Foot_L')
rawFoot = Coordinates(foot)
footNormals = Normals(foot)
footHeights = np.array([0, .08, .20, .35, .60, rawFoot[:, 2].max()])
footRows = np.array([633, 625, 607, 599, 591, 581])
footPoints = rawFoot.copy()
footPoints[:, 0] = rawFoot[:, 0] * 100.0 + 10.0
shinWeight = np.clip((rawFoot[:, 2] - .18) / .50, 0, 1)
footPoints[:, 0] += 12.0 * shinWeight
footWidth = 120.0 - 34.0 * np.clip((rawFoot[:, 2] - .15) / .25, 0, 1)
footPoints[:, 1] *= footWidth
footPoints[:, 2] = floorPixel - np.interp(rawFoot[:, 2], footHeights, footRows)
legMask = (rawBody[:, 1] > 0) & (rawBody[:, 2] < .025)
legCenter = (bodyPoints[legMask].min(0) + bodyPoints[legMask].max(0)) / 2
topMask = rawFoot[:, 2] > rawFoot[:, 2].max() - .06
topCenter = (footPoints[topMask].min(0) + footPoints[topMask].max(0)) / 2
footPoints[:, 1] += legCenter[1] - topCenter[1]
shoeWeight = np.clip((.30 - rawFoot[:, 2]) / .15, 0, 1)
footPoints[:, 1] += 14.0 * shoeWeight
footSegments = np.clip(np.searchsorted(footHeights, rawFoot[:, 2], side='right') - 1,
                       0, len(footHeights) - 2)
footVerticalScales = -(np.diff(footRows) / np.diff(footHeights))[footSegments]
footLoopVertices = np.array([loop.vertex_index for loop in foot.data.loops])
footNormals[:, 0] /= 100.0
footNormals[:, 1] /= footWidth[footLoopVertices]
footNormals[:, 2] /= footVerticalScales[footLoopVertices]
UpdateGeometry(foot, footPoints * pixelSize, footNormals)
rightFoot = MirrorPart(foot, 'Foot_R')
rightLegMask = (rawBody[:, 1] < 0) & (rawBody[:, 2] < .025)
rightLegCenter = (bodyPoints[rightLegMask].min(0) + bodyPoints[rightLegMask].max(0)) / 2
rightFoot.data.transform(Matrix.Translation((0, (rightLegCenter[1] + legCenter[1]) * pixelSize, 0)))

root = bpy.data.objects.new('Model_ErYa_Assembled', None)
assemblyCollection.objects.link(root)
for obj in list(assemblyCollection.objects):
    if obj != root:
        obj.parent = root
root['Pose'] = 'Bald T-pose'
root['HeightMeters'] = heightMeters
root['SourceDirectory'] = str(sourceRoot)

scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = True
scene.view_settings.view_transform = 'Standard'
scene.world = bpy.data.worlds.new('World_ErYaReview')
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .6
for name, position, energy in [('Key', (3, -2, 4), 220), ('Fill', (2, 3, 2), 170),
                                ('BackFill', (-3, -2, 3), 180)]:
    lightData = bpy.data.lights.new('Light_' + name, 'AREA')
    lightData.energy = energy
    lightData.shape = 'DISK'
    lightData.size = 4
    light = bpy.data.objects.new('Light_' + name, lightData)
    reviewCollection.objects.link(light)
    light.location = position
    light.rotation_euler = (Vector((0, 0, .8)) - light.location).to_track_quat('-Z', 'Y').to_euler()
reviewCenter = Vector((0, pixelSize, (floorPixel - 320) * pixelSize))
frontRotation = None
for view, direction in [('Front', (4, 0, 0)), ('LeftSide', (0, 4, 0)), ('Back', (-4, 0, 0))]:
    cameraData = bpy.data.cameras.new('Camera_' + view)
    camera = bpy.data.objects.new('Camera_' + view, cameraData)
    reviewCollection.objects.link(camera)
    cameraData.type = 'ORTHO'
    cameraData.ortho_scale = 640 * pixelSize
    cameraCenter = reviewCenter.copy()
    if view == 'LeftSide':
        # In the side reference, the longitudinal origin is column 300.
        cameraCenter.x = -20 * pixelSize
    camera.location = cameraCenter + Vector(direction)
    camera.rotation_euler = (-Vector(direction)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    scene.render.filepath = str(reviewRoot / ('Preview_ErYa_' + view + '.png'))
    bpy.ops.render.render(write_still=True)
    if view == 'Front':
        frontCamera = camera
        frontRotation = camera.rotation_euler.to_quaternion()
scene.camera = frontCamera
referenceViews = [
    ('Front', (-.4, pixelSize, reviewCenter.z), ((0, 0, 1), (1, 0, 0), (0, 1, 0))),
    ('LeftSide', (-20 * pixelSize, -.4, reviewCenter.z), ((-1, 0, 0), (0, 0, 1), (0, 1, 0))),
    ('Back', (.4, -pixelSize, reviewCenter.z), ((0, 0, -1), (-1, 0, 0), (0, 1, 0))),
]
for view, position, rotation in referenceViews:
    reference = bpy.data.objects.new('Reference_' + view, None)
    referenceCollection.objects.link(reference)
    reference.empty_display_type = 'IMAGE'
    reference.data = bpy.data.images.load(str(sourceRoot / ('Image_TPose' + view + '_2K.png')),
                                         check_existing=True)
    reference.empty_display_size = 640 * pixelSize
    reference.empty_image_depth = 'BACK'
    reference.empty_image_side = 'FRONT'
    reference.color[3] = .45
    reference.location = position
    reference.rotation_euler = Matrix(rotation).to_euler()
    reference.hide_render = True
    reference.hide_set(True)
for obj in reviewCollection.objects:
    obj.hide_set(True)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_rotation = frontRotation
            area.spaces.active.region_3d.view_location = reviewCenter
            area.spaces.active.region_3d.view_distance = 2.1
            area.spaces.active.region_3d.view_perspective = 'ORTHO'
            area.spaces.active.shading.type = 'MATERIAL'
bpy.ops.object.select_all(action='DESELECT')
parts = [obj for obj in assemblyCollection.objects if obj.type == 'MESH']
for part in parts:
    part.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(projectRoot / 'Scene_ErYa_Assembled.blend'), compress=True)
bpy.ops.export_scene.gltf(filepath=str(sourceRoot / 'Model_ErYa_Assembled.glb'),
                          export_format='GLB', use_selection=True, export_apply=True)
report = {
    'schema': 'tengxian.characterAssemblyFit', 'version': 1,
    'character': 'ErYa', 'heightMeters': heightMeters,
    'heightBasis': 'Working scale assumption, no measured height in references',
    'referenceFrame': {'width': 640, 'height': 640, 'floorRow': floorPixel,
                       'scalpRow': scalpPixel, 'metersPerPixel': pixelSize},
    'bodySourceHeights': bodyHeights.tolist(), 'bodyReferenceRows': bodyRows.tolist(),
    'handRollDegrees': math.degrees(handRoll), 'sourceFiles': sourceFiles,
    'parts': {obj.name: {'min': Coordinates(obj).min(0).tolist(),
                        'max': Coordinates(obj).max(0).tolist(),
                        'triangles': sum(len(face.vertices) - 2 for face in obj.data.polygons)}
              for obj in parts},
}
(projectRoot / 'Data_ErYaAssemblyFit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report))
