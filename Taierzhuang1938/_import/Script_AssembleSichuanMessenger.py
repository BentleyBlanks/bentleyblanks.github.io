"""Fit original head/hand parts and the cap to the messenger's turnarounds.

Run with scripts/Script_BlenderMcp.mjs start --batch. MESSENGER_PROJECT_DIR and
MESSENGER_OUTPUT_DIR select review/staging directories. MESSENGER_REVIEW_ONLY=1
skips exports. MESSENGER_PREVIEW_VIEWS selects comma-separated review views.
"""
import os
import math
import json
import hashlib
import runpy
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sourceRoot = Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\33_川军传令兵')
projectRoot = Path(os.environ.get('MESSENGER_PROJECT_DIR', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\SichuanMessengerRearCapFix_V5_20261114'))
exportRoot = Path(os.environ.get('MESSENGER_OUTPUT_DIR', str(sourceRoot)))
reviewRoot = projectRoot / 'Review'
reviewRoot.mkdir(parents=True, exist_ok=True)
exportRoot.mkdir(parents=True, exist_ok=True)
exportEnabled = os.environ.get('MESSENGER_REVIEW_ONLY') != '1'
bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
scene = bpy.context.scene
scene['BlenderMcpTask'] = 'SichuanMessengerRearCapFix_V5_20261114'
scene.unit_settings.system = 'METRIC'
sourcesCollection = bpy.data.collections.new('OriginalSources')
assembly = bpy.data.collections.new('OriginalPartsAssembly')
scene.collection.children.link(sourcesCollection)
scene.collection.children.link(assembly)


def MeshFingerprint(mesh):
    digest = hashlib.sha256()
    vertices = np.array([vertex.co[:] for vertex in mesh.vertices], dtype=np.float32)
    digest.update(vertices.tobytes())
    digest.update(np.array([loop.vertex_index for loop in mesh.loops], dtype=np.int32).tobytes())
    digest.update(np.array([(face.loop_start, face.loop_total) for face in mesh.polygons], dtype=np.int32).tobytes())
    for layer in mesh.uv_layers:
        digest.update(np.array([item.uv[:] for item in layer.data], dtype=np.float32).tobytes())
    digest.update(np.array([normal.vector[:] for normal in mesh.corner_normals], dtype=np.float32).tobytes())
    return digest.hexdigest()


def WorldPoints(obj):
    return np.array([(obj.matrix_world @ vertex.co)[:] for vertex in obj.data.vertices])


def Part(role, name, placement):
    source = sources[role]
    obj = source.copy()
    obj.name = 'Part_' + name
    assembly.objects.link(obj)
    obj.matrix_world = placement @ source.matrix_world
    obj.hide_render = False
    obj.hide_set(False)
    partRoles[obj.name] = role
    return obj


sources, sourceReport, partRoles = {}, {}, {}
# Fingerprints are captured directly after import and checked through export.
# Protected head and hand parts reference the imported mesh datablocks.
for role in ['Body', 'HeadBald', 'LeftHand', 'LeftFoot', 'FieldCap']:
    path = sourceRoot / f'Model_SichuanMessenger_{role}_Source.glb'
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    source = next(obj for obj in bpy.data.objects if obj not in before and obj.type == 'MESH')
    source.name = 'Source_' + role
    source.data.name = 'Mesh_Original_' + role
    for collection in list(source.users_collection):
        collection.objects.unlink(source)
    sourcesCollection.objects.link(source)
    for material in source.data.materials:
        material.name = 'Material_SichuanMessenger_' + role
    sourceReport[role] = {'file': path.name, 'fileSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                          'meshSha256': MeshFingerprint(source.data),
                          'vertices': len(source.data.vertices),
                          'triangles': sum(len(face.vertices)-2 for face in source.data.polygons)}
    source.hide_render = True
    source.hide_set(True)
    source.select_set(False)
    sources[role] = source

footScale = 0.26
footRotation = Matrix.Rotation(math.radians(8), 4, 'Z')
sourceFoot = WorldPoints(sources['LeftFoot'])
scaledFoot = sourceFoot @ np.array(footRotation.to_3x3()).T * footScale
bodyScale = 1.4
sourceBody = WorldPoints(sources['Body'])
bodyBottom = scaledFoot[:, 2].max() - 0.016
bodyCenterY = (sourceBody[:, 1].min()+sourceBody[:, 1].max())/2
bodyPlacement = Matrix.Translation((0, -bodyCenterY*bodyScale, bodyBottom-sourceBody[:, 2].min()*bodyScale)) @ Matrix.Scale(bodyScale, 4)
body = Part('Body', 'Body', bodyPlacement)
bodyPoints = WorldPoints(body)
leg = bodyPoints[(bodyPoints[:, 1] > 0) & (bodyPoints[:, 2] < bodyBottom+0.025)]
legCenter = (leg.min(0)+leg.max(0))/2
topFoot = scaledFoot[sourceFoot[:, 2] > sourceFoot[:, 2].max()-0.06]
footTopCenter = (topFoot.min(0)+topFoot.max(0))/2
footShift = Vector((legCenter[0]-footTopCenter[0], legCenter[1]-footTopCenter[1], -scaledFoot[:, 2].min()))
footPlacement = Matrix.Translation(footShift) @ footRotation @ Matrix.Scale(footScale, 4)
foot = Part('LeftFoot', 'Foot_L', footPlacement)
mirror = Matrix.Diagonal((1.0,-1.0,1.0,1.0))
Part('LeftFoot', 'Foot_R', mirror @ footPlacement)

headScale = 0.335
headX = 0.012
headZ = 1.370
sourceHead = WorldPoints(sources['HeadBald'])
headPlacement = Matrix.Translation((headX, 0, headZ)) @ Matrix.Scale(headScale, 4)
head = Part('HeadBald', 'HeadBald', headPlacement)
bodyBvh = BVHTree.FromPolygons([Vector(point) for point in bodyPoints], [tuple(face.vertices) for face in body.data.polygons])
shoulderMask = ((np.abs(sourceHead[:,1])>0.18) | (sourceHead[:,0]<-0.26)) & (sourceHead[:,2]<0.24)
headFaceCenters = np.array([sourceHead[list(face.vertices)].mean(0) for face in head.data.polygons])
centerMask = ((np.abs(headFaceCenters[:,1])>0.18) | (headFaceCenters[:,0]<-0.26)) & (headFaceCenters[:,2]<0.24)
shoulderPoints = np.vstack([sourceHead[shoulderMask],headFaceCenters[centerMask]])
headFinalExposure = 0.0
for point in shoulderPoints*headScale+np.array([headX,0,headZ]):
    for axis in [0,1]:
        origin = Vector(point)
        origin[axis] = -1
        direction = Vector((0,0,0))
        direction[axis] = 1
        lower = bodyBvh.ray_cast(origin,direction,2)[0]
        origin[axis] = 1
        direction[axis] = -1
        upper = bodyBvh.ray_cast(origin,direction,2)[0]
        assert lower is not None and upper is not None
        headFinalExposure = max(headFinalExposure,lower[axis]+0.002-point[axis],point[axis]-upper[axis]+0.002)
assert headFinalExposure < 0.0005

sourceHand = WorldPoints(sources['LeftHand'])
sample = sourceHand[sourceHand[:, 1] > 0.1][:, [0,2]]
sample -= sample.mean(0)
_, axes = np.linalg.eigh(sample.T @ sample)
dorsal = axes[:, 0]
if dorsal[0] < 0:
    dorsal *= -1
roll = math.atan2(-dorsal[0], dorsal[1])
handRotation = Matrix.Rotation(roll, 4, 'Y')
preparedHand = sourceHand @ np.array(handRotation.to_3x3()).T
wrist = preparedHand[preparedHand[:, 1] < preparedHand[:, 1].min()+0.025]
wristCenter = (wrist.min(0)+wrist.max(0))/2
cuff = bodyPoints[bodyPoints[:, 1] > bodyPoints[:, 1].max()-0.025]
cuffCenter = (cuff.min(0)+cuff.max(0))/2
handScale = 0.205
targetWrist = cuffCenter.copy()
targetWrist[1] = bodyPoints[:, 1].max()-0.040
handPlacement = Matrix.Translation(Vector(targetWrist-wristCenter*handScale)) @ handRotation @ Matrix.Scale(handScale, 4)
hand = Part('LeftHand', 'Hand_L', handPlacement)
Part('LeftHand', 'Hand_R', mirror @ handPlacement)

# Seat the complete original crown with the rear band lowered above the ears.
# Equal Y/Z scale preserves the proportions of the two front buttons.
capScales = (0.260,0.220,0.220)
capPitch = -10.0
capX,capZ = 0.034,1.585
capPlacement = Matrix.Translation((capX,0,capZ)) @ Matrix.Rotation(math.radians(capPitch),4,'Y') @ Matrix.Diagonal((*capScales,1.0))
cap = Part('FieldCap','FieldCap',capPlacement)
helperPath = Path(globals().get('__file__','Taierzhuang1938/_import/Script_AssembleSichuanMessenger.py')).with_name('Script_SichuanMessengerReferenceFit.py')
helpers = runpy.run_path(str(helperPath))
rearHemFit = helpers['FitCapRearHem'](cap,head,WorldPoints(sources['FieldCap']))
(projectRoot/'Data_RearHemFit_V5.json').write_text(json.dumps(rearHemFit,indent=2),encoding='utf-8')

headPoints = WorldPoints(head)
capPoints = WorldPoints(cap)
capBvh = BVHTree.FromPolygons([Vector(point) for point in capPoints],[tuple(face.vertices) for face in cap.data.polygons])
headNormals = np.array([vertex.normal[:] for vertex in head.data.vertices]) @ np.linalg.inv(np.array(head.matrix_world.to_3x3()))
headCenters = np.array([headPoints[list(face.vertices)].mean(0) for face in head.data.polygons])
headCenterNormals = np.array([face.normal[:] for face in head.data.polygons]) @ np.linalg.inv(np.array(head.matrix_world.to_3x3()))
scalpPoints = np.vstack([headPoints,headCenters])
scalpNormals = np.vstack([headNormals,headCenterNormals])
scalpNormals /= np.linalg.norm(scalpNormals,axis=1,keepdims=True).clip(1e-8)
scalpSource = np.vstack([sourceHead,headFaceCenters])
inCapSource = np.array([(sources['FieldCap'].matrix_world @ (cap.matrix_world.inverted() @ Vector(point)))[:] for point in scalpPoints])
scalpSelection = np.where((scalpSource[:,2]>.80)&(inCapSource[:,2]>.25))[0]
scalpClearances = []
uncoveredScalp = []
for index in scalpSelection:
    normal = Vector(scalpNormals[index])
    location,hitNormal,face,distance = capBvh.ray_cast(Vector(scalpPoints[index])+normal*1e-5,normal,.15)
    if location is None:
        uncoveredScalp.append(int(index))
    else:
        scalpClearances.append(float(distance))
assert not uncoveredScalp, f'Scalp exposed through cap: {uncoveredScalp}'
capWearReport = {'scalpVertexAndFaceCenterTests':len(scalpSelection),'uncoveredScalpSamples':uncoveredScalp,
                 'outwardClothClearanceMeters':{'minimum':min(scalpClearances),'median':float(np.median(scalpClearances)),'maximum':max(scalpClearances)},
                 'inspectionViews':['Front','LeftSide','Back','HeadThreeQuarter','UnderBrim','CapTop']}
(projectRoot/'Data_CapWearCoverage_V5.json').write_text(json.dumps(capWearReport,indent=2),encoding='utf-8')

report = {'assemblyMode':'OriginalPartsWithLocalRearCapRepair','version':5,'sources':sourceReport,'parts':{},
          'headRigidFit':{'uniformScale':float(headScale),'translationX':float(headX),'translationZ':float(headZ),
                          'finalShoulderExposureMeters':float(headFinalExposure)},
          'capWearFit':{'axisScales':capScales,'pitchDegrees':capPitch,'translation':[capX,0,capZ],
                         'meshMode':'OriginalCrownWithLocalRearHemFit','coverage':capWearReport,'rearHemFit':rearHemFit},
          'references':{name:hashlib.sha256((sourceRoot/f'Image_TPose{name}_2K.png').read_bytes()).hexdigest() for name in ['Front','LeftSide','Back']}}
for obj in assembly.objects:
    role = partRoles[obj.name]
    meshUnmodified = MeshFingerprint(obj.data) == sourceReport[role]['meshSha256']
    relative = obj.matrix_world @ sources[role].matrix_world.inverted()
    scales = np.linalg.svd(np.array(relative.to_3x3()),compute_uv=False)
    if role != 'FieldCap':
        assert obj.data is sources[role].data and meshUnmodified
        assert scales.max()-scales.min() < 1e-6
    report['parts'][obj.name] = {'sourceRole':role,'meshSha256':MeshFingerprint(obj.data),'meshUnmodified':meshUnmodified,'axisScaleMagnitudes':scales.tolist(),'modifiers':len(obj.modifiers)}
    assert len(obj.modifiers)==0
height = max(WorldPoints(obj)[:,2].max() for obj in assembly.objects)
report['heightMeters'] = float(height)
report['sourceTriangleTotal'] = sum(sum(len(face.vertices)-2 for face in obj.data.polygons) for obj in assembly.objects)
pixelSize = height/631.0
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
for name,position,energy,size in [('Key',(3,-2,4),420,4),('Fill',(-2,3,2),220,5)]:
    data = bpy.data.lights.new(name,'AREA')
    data.energy,data.shape,data.size = energy,'DISK',size
    obj = bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector((0,0,0.9))-obj.location).to_track_quat('-Z','Y').to_euler()
cameraData = bpy.data.cameras.new('ReviewCamera')
camera = bpy.data.objects.new('ReviewCamera',cameraData)
scene.collection.objects.link(camera)
scene.camera = camera
cameraData.type = 'ORTHO'
wholeCenter = Vector((0,0,315*pixelSize))
headPoints = WorldPoints(head)
headCenter = Vector((0.012,0,(headPoints[:,2].min()+WorldPoints(cap)[:,2].max())/2))
handPoints = WorldPoints(hand)
handCenter = Vector((handPoints.min(0)+handPoints.max(0))/2)
views = [('Front',wholeCenter,Vector((4,0,0)),640*pixelSize),
         ('LeftSide',wholeCenter,Vector((0,4,0)),640*pixelSize),
         ('Back',wholeCenter,Vector((-4,0,0)),640*pixelSize),
         ('ThreeQuarter',wholeCenter,Vector((4,3,0.5)),height*1.10),
         ('HeadFront',headCenter,Vector((4,0,0)),0.48),
         ('HeadSide',headCenter,Vector((0,4,0)),0.48),
         ('HeadBack',headCenter,Vector((-4,0,0)),0.48),
         ('HeadThreeQuarter',Vector((.015,0,1.563)),Vector((4,3,1)),0.40),
         ('UnderBrim',Vector((.015,0,1.563)),Vector((4,1,-.7)),0.40),
         ('CapTop',Vector((.015,0,1.563)),Vector((0,0,4)),0.40),
         ('RearLeft',Vector((-.055,0,1.603)),Vector((-3,3,.1)),0.22),
         ('RearRight',Vector((-.055,0,1.603)),Vector((-3,-3,.1)),0.22),
         ('HandTop',handCenter,Vector((0,0,4)),0.36)]
previewNames = set(os.environ['MESSENGER_PREVIEW_VIEWS'].split(',')) if os.environ.get('MESSENGER_PREVIEW_VIEWS') else None
for name,center,direction,span in views:
    if previewNames and name not in previewNames:
        continue
    camera.location = center+direction
    camera.rotation_euler = (-direction).to_track_quat('-Z','Y').to_euler()
    cameraData.ortho_scale = span
    scene.render.filepath = str(reviewRoot/f'Preview_OriginalAssembly_{name}.png')
    bpy.ops.render.render(write_still=True)
for name,role,placed,center,direction,span in [
    ('SourceHeadFront','HeadBald',head,headCenter,Vector((4,0,0)),0.48),
    ('SourceHandTop','LeftHand',hand,handCenter,Vector((0,0,4)),0.36)]:
    for part in assembly.objects:
        part.hide_render=True
    source=sources[role]
    originalMatrix=source.matrix_world.copy()
    source.matrix_world=placed.matrix_world
    source.hide_render=False
    camera.location=center+direction
    camera.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
    cameraData.ortho_scale=span
    scene.render.filepath=str(reviewRoot/f'Preview_OriginalAssembly_{name}.png')
    bpy.ops.render.render(write_still=True)
    source.matrix_world=originalMatrix
    source.hide_render=True
    for part in assembly.objects:
        part.hide_render=False
frontRotation = Vector((-4,0,0)).to_track_quat('-Z','Y')
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_rotation = frontRotation
            area.spaces.active.region_3d.view_location = wholeCenter
            area.spaces.active.region_3d.view_distance = 2.5
            area.spaces.active.region_3d.view_perspective = 'ORTHO'
for role in sources:
    assert MeshFingerprint(sources[role].data)==sourceReport[role]['meshSha256']
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(projectRoot/'Scene_SichuanMessengerRearCapFix_V5.blend'),compress=True)
(projectRoot/'Data_OriginalMeshVerification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')


def WorldBake(part):
    source = part.data
    matrix = part.matrix_world
    reverse = matrix.determinant()<0
    mesh = bpy.data.meshes.new('Mesh_Export_'+part.name)
    mesh.from_pydata([(matrix@vertex.co)[:] for vertex in source.vertices],[],[list(reversed(face.vertices)) if reverse else list(face.vertices) for face in source.polygons])
    mesh.update()
    for material in source.materials:
        mesh.materials.append(material)
    for targetFace,sourceFace in zip(mesh.polygons,source.polygons):
        targetFace.material_index = sourceFace.material_index
        # Explicit corner normals carry both flat and smooth source shading.
        targetFace.use_smooth = True
    for sourceUv in source.uv_layers:
        targetUv=mesh.uv_layers.new(name=sourceUv.name)
        for targetFace,sourceFace in zip(mesh.polygons,source.polygons):
            indices=list(sourceFace.loop_indices)
            if reverse:
                indices.reverse()
            for targetLoop,sourceLoop in zip(targetFace.loop_indices,indices):
                targetUv.data[targetLoop].uv = sourceUv.data[sourceLoop].uv
    normals=np.array([normal.vector[:] for normal in source.corner_normals])@np.linalg.inv(np.array(matrix.to_3x3()))
    normals/=np.linalg.norm(normals,axis=1,keepdims=True).clip(1e-9)
    output=[]
    for face in source.polygons:
        indices=list(face.loop_indices)
        if reverse:
            indices.reverse()
        output.extend(normals[indices])
    preservedNormals = mesh.attributes.new('nrm','FLOAT_VECTOR','CORNER')
    preservedNormals.data.foreach_set('vector',np.array(output,dtype=np.float32).ravel())
    mesh.normals_split_custom_set(output)
    obj=bpy.data.objects.new('Export_'+part.name,mesh)
    scene.collection.objects.link(obj)
    return obj


if exportEnabled:
    bpy.ops.object.select_all(action='DESELECT')
    baked=[]
    for part in assembly.objects:
        obj = WorldBake(part)
        obj.select_set(True)
        baked.append(obj)
    bpy.context.view_layer.objects.active=baked[0]
    bpy.context.view_layer.update()
    with bpy.context.temp_override(active_object=baked[0],object=baked[0],selected_objects=baked,selected_editable_objects=baked):
        bpy.ops.object.join()
    joined=baked[0]
    joined.name='Model_SichuanMessenger_Assembled'
    joined.data.normals_split_custom_set([item.vector[:] for item in joined.data.attributes['nrm'].data])
    assert sum(len(face.vertices)-2 for face in joined.data.polygons)==report['sourceTriangleTotal']
    bpy.ops.export_scene.gltf(filepath=str(exportRoot/'Model_SichuanMessenger_Assembled.glb'),export_format='GLB',use_selection=True)
    bpy.ops.export_scene.fbx(filepath=str(exportRoot/'Model_SichuanMessenger_Assembled.fbx'),use_selection=True,path_mode='COPY',embed_textures=True,add_leaf_bones=False)
    for role in sources:
        assert MeshFingerprint(sources[role].data)==sourceReport[role]['meshSha256']
print(json.dumps({'sources':sourceReport,'parts':report['parts'],'capWearFit':report['capWearFit'],'heightMeters':report['heightMeters']}))
