"""Assemble complete original meshes through rigid placement and uniform scale.

Run with scripts/Script_BlenderMcp.mjs start --batch. MESSENGER_PROJECT_DIR and
MESSENGER_OUTPUT_DIR select review/staging directories. MESSENGER_REVIEW_ONLY=1
skips exports. MESSENGER_PREVIEW_VIEWS selects comma-separated review views.
"""
import os
import math
import json
import hashlib
from pathlib import Path
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sourceRoot = Path(r'C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\33_川军传令兵')
projectRoot = Path(os.environ.get('MESSENGER_PROJECT_DIR', r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\SichuanMessengerOriginalAssembly_20261113'))
exportRoot = Path(os.environ.get('MESSENGER_OUTPUT_DIR', str(sourceRoot)))
reviewRoot = projectRoot / 'Review'
reviewRoot.mkdir(parents=True, exist_ok=True)
exportRoot.mkdir(parents=True, exist_ok=True)
exportEnabled = os.environ.get('MESSENGER_REVIEW_ONLY') != '1'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene['BlenderMcpTask'] = 'SichuanMessengerOriginalAssembly_20261113'
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
# Visible parts reference those imported mesh datablocks.
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

headScale = 0.33
sourceHead = WorldPoints(sources['HeadBald'])
headCrown = bodyPoints[:, 2].max()+0.210
headPlacement = Matrix.Translation((0.012, 0, headCrown-sourceHead[:, 2].max()*headScale)) @ Matrix.Scale(headScale, 4)
head = Part('HeadBald', 'HeadBald', headPlacement)
headWorld = WorldPoints(head)
bodyBvh = BVHTree.FromPolygons([Vector(point) for point in bodyPoints], [tuple(face.vertices) for face in body.data.polygons])
shoulderMask = ((np.abs(sourceHead[:,1])>0.18) | (sourceHead[:,0]<-0.26)) & (sourceHead[:,2]<0.24)
headFaceCenters = np.array([sourceHead[list(face.vertices)].mean(0) for face in head.data.polygons])
centerMask = ((np.abs(headFaceCenters[:,1])>0.18) | (headFaceCenters[:,0]<-0.26)) & (headFaceCenters[:,2]<0.24)
shoulderPoints = np.vstack([sourceHead[shoulderMask],headFaceCenters[centerMask]])
frontCloth = bodyPoints[(bodyPoints[:,0]>0.01)&(np.abs(bodyPoints[:,1])<0.10)]
frontCollarTop = frontCloth[:,2].max()

def HeadPlacementObjective(parameters, detailed=False):
    scale,shiftX,shiftZ = parameters
    crown = sourceHead[:,2].max()*scale+shiftZ
    chin = 0.33*scale+shiftZ
    if not (0.315<=scale<=0.335 and 0.005<=shiftX<=0.080 and bodyPoints[:,2].max()+0.17<=crown<=bodyPoints[:,2].max()+0.23):
        return 1e12 if not detailed else (1e12,1.0)
    points = shoulderPoints*scale+np.array([shiftX,0,shiftZ])
    exposures=[]
    for point in points:
        violation=0.0
        for axis in [0,1]:
            origin = Vector(point)
            origin[axis] = -1
            direction = Vector((0,0,0))
            direction[axis] = 1
            lower=bodyBvh.ray_cast(origin,direction,2)[0]
            origin[axis] = 1
            direction[axis] = -1
            upper=bodyBvh.ray_cast(origin,direction,2)[0]
            if lower is None or upper is None:
                violation=max(violation,0.040)
            else:
                violation=max(violation,lower[axis]+0.002-point[axis],point[axis]-upper[axis]+0.002)
        exposures.append(max(0,violation))
    exposures=np.array(exposures)
    score=250*(exposures.max()/0.01)**2+40*np.mean((exposures/0.01)**2)
    score+=((shiftX-0.045)/0.025)**2+((crown-(bodyPoints[:,2].max()+0.208))/0.018)**2
    score+=0.3*((scale-0.33)/0.015)**2
    score+=40*(max(0,frontCollarTop+0.010-chin)/0.010)**2
    if detailed:
        return float(score),float(exposures.max())
    return float(score)

headParameters=np.array([headScale,0.012,headPlacement.translation.z])
headInitialScore,headInitialExposure=HeadPlacementObjective(headParameters,True)
headScore=headInitialScore
headSteps=np.array([0.005,0.010,0.005])
for level in range(4):
    for sweep in range(5):
        improved=False
        for axis in range(3):
            for direction in [-1,1]:
                trial = headParameters.copy()
                trial[axis] += direction*headSteps[axis]
                value=HeadPlacementObjective(trial)
                if value < headScore:
                    headParameters,headScore = trial,value
                    improved = True
        if not improved:
            break
    headSteps*=0.5
headScale,headX,headZ=headParameters
headPlacement=Matrix.Translation((headX,0,headZ))@Matrix.Scale(headScale,4)
head.matrix_world=headPlacement@sources['HeadBald'].matrix_world
headWorld=WorldPoints(head)
headCrown=headWorld[:,2].max()
_,headFinalExposure=HeadPlacementObjective(headParameters,True)
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

# Seat the unmodified cap using a scalar scale and a rigid pose.
sourceCap = WorldPoints(sources['FieldCap'])
sourceCapNormals = np.array([vertex.normal[:] for vertex in sources['FieldCap'].data.vertices])
sourceNormalMatrix = np.array(sources['FieldCap'].matrix_world.to_3x3().inverted().transposed())
sourceCapNormals = sourceCapNormals @ sourceNormalMatrix.T
radial = sourceCap-sourceCap.mean(0)
outer = np.sum(sourceCapNormals[:,:2]*radial[:,:2],axis=1) > 0.015
outer |= (sourceCap[:,2] > 0.45) & (sourceCapNormals[:,2] > 0.2)
outerPoints = sourceCap[outer][::2]
band = outerPoints[:,2] < 0.32
billMask = (sourceCap[:,0] > 0.30) & (sourceCap[:,2] < 0.30)
rearMask = (sourceCap[:,0] < -0.25) & (sourceCap[:,2] < 0.22)
headBvh = BVHTree.FromPolygons([Vector(point) for point in headWorld], [tuple(face.vertices) for face in head.data.polygons])
noseX = headWorld[:,0].max()
headWidth = np.ptp(headWorld[sourceHead[:,2] > 0.4,1])
earMask = (np.abs(sourceHead[:,1]) > 0.24) & (sourceHead[:,0] < 0.15) & (sourceHead[:,2] < 0.80)
earTop = headWorld[earMask,2].max()

def CapObjective(parameters):
    scale,pitch,shiftX,shiftZ = parameters
    if not (0.215 <= scale <= 0.31 and -15 <= pitch <= 15 and -0.03 <= shiftX <= 0.10 and headCrown-0.18 <= shiftZ <= headCrown-0.025):
        return 1e12
    rotation = np.array(Matrix.Rotation(math.radians(pitch),3,'Y'))
    points = outerPoints @ rotation.T * scale + np.array([shiftX,0,shiftZ])
    signed = []
    for point in points:
        nearest,normal,index,distance = headBvh.find_nearest(Vector(point))
        signed.append((Vector(point)-nearest).dot(normal))
    signed = np.array(signed)
    penetration = np.maximum(0,-signed-0.0005)/0.01
    allPoints = sourceCap @ rotation.T * scale + np.array([shiftX,0,shiftZ])
    bill = allPoints[billMask]
    rearHem = allPoints[rearMask,2].min()
    value = 300*penetration.max()**2+25*np.mean(penetration**2)
    value += ((bill[:,2].min()-(headCrown-0.075))/0.015)**2
    value += ((bill[:,0].max()-(noseX+0.020))/0.020)**2
    value += 0.4*((allPoints[:,2].max()-(headCrown+0.055))/0.025)**2
    value += 0.4*((np.ptp(allPoints[:,1])-headWidth*1.18)/0.025)**2
    value += 1.5*((rearHem-(earTop+0.006))/0.020)**2
    value += 10*(max(0,earTop-0.002-rearHem)/0.01)**2
    value += 0.2*((np.median(np.abs(signed[band]))-0.006)/0.015)**2
    return float(value)

bestParameters,bestValue = None,float('inf')
for initialScale in [0.235,0.255,0.275]:
    initialPitch = 0.0
    initialRotation = np.array(Matrix.Rotation(0,3,'Y'))
    initial = sourceCap @ initialRotation.T * initialScale
    parameters = np.array([initialScale,initialPitch,noseX+0.02-initial[billMask,0].max(),headCrown-0.075-initial[billMask,2].min()])
    steps = np.array([0.010,5.0,0.010,0.010])
    score = CapObjective(parameters)
    for level in range(4):
        for sweep in range(5):
            improved = False
            for axis in range(4):
                for direction in [-1,1]:
                    trial = parameters.copy()
                    trial[axis] += direction*steps[axis]
                    value = CapObjective(trial)
                    if value < score:
                        parameters,score = trial,value
                        improved = True
            if not improved:
                break
        steps *= 0.5
    if score < bestValue:
        bestParameters,bestValue = parameters.copy(),score
capScale,capPitch,capX,capZ = bestParameters
capPlacement = Matrix.Translation((capX,0,capZ)) @ Matrix.Rotation(math.radians(capPitch),4,'Y') @ Matrix.Scale(capScale,4)
cap = Part('FieldCap','FieldCap',capPlacement)

report = {'assemblyMode':'CompleteOriginalMeshes','sources':sourceReport,'parts':{},
          'headRigidFit':{'uniformScale':float(headScale),'translationX':float(headX),'translationZ':float(headZ),
                          'initialShoulderExposureMeters':headInitialExposure,'finalShoulderExposureMeters':headFinalExposure},
          'capRigidFit':{'uniformScale':float(capScale),'pitchDegrees':float(capPitch),'objective':bestValue}}
for obj in assembly.objects:
    role = partRoles[obj.name]
    assert obj.data is sources[role].data
    assert MeshFingerprint(obj.data) == sourceReport[role]['meshSha256']
    relative = obj.matrix_world @ sources[role].matrix_world.inverted()
    scales = np.linalg.svd(np.array(relative.to_3x3()),compute_uv=False)
    assert scales.max()-scales.min() < 1e-6
    report['parts'][obj.name] = {'sourceRole':role,'meshSha256':MeshFingerprint(obj.data),'meshUnmodified':True,'uniformScales':scales.tolist(),'modifiers':len(obj.modifiers)}
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
bpy.ops.wm.save_as_mainfile(filepath=str(projectRoot/'Scene_SichuanMessengerOriginalAssembly.blend'),compress=True)
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
        targetFace.material_index,targetFace.use_smooth=sourceFace.material_index,sourceFace.use_smooth
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
    bpy.ops.object.join()
    joined=bpy.context.view_layer.objects.active
    joined.name='Model_SichuanMessenger_Assembled'
    assert sum(len(face.vertices)-2 for face in joined.data.polygons)==report['sourceTriangleTotal']
    bpy.ops.export_scene.gltf(filepath=str(exportRoot/'Model_SichuanMessenger_Assembled.glb'),export_format='GLB',use_selection=True)
    bpy.ops.export_scene.fbx(filepath=str(exportRoot/'Model_SichuanMessenger_Assembled.fbx'),use_selection=True,path_mode='COPY',embed_textures=True,add_leaf_bones=False)
    for role in sources:
        assert MeshFingerprint(sources[role].data)==sourceReport[role]['meshSha256']
print(json.dumps({'sources':sourceReport,'parts':report['parts'],'capRigidFit':report['capRigidFit'],'heightMeters':report['heightMeters']}))
