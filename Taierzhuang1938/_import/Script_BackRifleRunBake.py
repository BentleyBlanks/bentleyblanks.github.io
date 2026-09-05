"""Author a new in-place BackRifleRun on the unchanged Lugou NRA01 bind skeleton.

Run through BlenderMCP execute_blender_code with BACK_RIFLE_ROOT set to the checkout.
No source clips are copied: limb IK, support paths, torso counter-twist and arm swing
are evaluated from these editable parameters. Existing Blender scenes stay intact.
The asset is standalone; no production loader, animation alias or AI is changed.
Blender: +Z up / -Y forward. Export glTF: +Y up / +Z forward, meters.
The existing game bridge adds MODEL_FORWARD_YAW to face game -Z.
"""
from pathlib import Path
import base64
import hashlib
import json
import math
import struct
import subprocess
import bpy
from mathutils import Matrix, Vector

BACK_RIFLE_CONFIG = {
    'clip': 'BackRifleRun', 'fps': 120, 'cycleFrames': 88,
    'referenceSpeedMps': 2.6, 'stanceFraction': 0.35,
    'revision': 'NaturalRunV2',
    'pelvisHeight': 0.884, 'pelvisBounce': 0.027,
    'flightLift': 0.30, 'torsoLeanRadians': 0.15,
    'armSwingRadians': 0.51, 'armFlexRadians': 1.46,
    'footTravelBiasMeters': 0.08, 'toeOffPitchRadians': 0.60,
    'slingWidthMeters': 0.027,
}
root = Path(globals().get('BACK_RIFLE_ROOT', Path.cwd()))
output = root / 'Taierzhuang1938/Animation/BackRifleRun'
output.mkdir(parents=True, exist_ok=True)
assert 'Rig_LugouCharacter' not in bpy.data.objects, 'Use a fresh background instance to avoid source bone-name collisions'
scene = bpy.data.scenes.new('Scene_BackRifleRunAuthoring')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = BACK_RIFLE_CONFIG['fps']
scene.frame_start = 1
scene.frame_end = 1 + BACK_RIFLE_CONFIG['cycleFrames']
sourcePath = root / 'Taierzhuang1938/Model/Character/Model_LugouNra01.glb'
bpy.ops.import_scene.gltf(filepath=str(sourcePath))
# glTF import may change the scene FPS; authoring cadence is applied afterward.
scene.render.fps = BACK_RIFLE_CONFIG['fps']
scene.render.fps_base = 1.0
arm = next(o for o in scene.objects if o.type == 'ARMATURE')
body = next(o for o in scene.objects if o.type == 'MESH' and o.name.startswith('John_Body'))
characterRoot = arm.parent
# Match Script_CharacterModel.ConfigureExternalPbr: cloth/skin are dielectric.
# Original GLB omits metallicFactor, whose glTF default is 1.
for material in body.data.materials:
    if material and material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                for link in list(node.inputs['Metallic'].links): material.node_tree.links.remove(link)
                node.inputs['Metallic'].default_value=0
                node.inputs['Roughness'].default_value=max(0.58,node.inputs['Roughness'].default_value)

for obj in list(scene.objects):
    if obj.animation_data: obj.animation_data_clear()
for bone in arm.pose.bones: bone.matrix_basis = Matrix.Identity(4)
bpy.context.view_layer.update()
rest = {b.name: (arm.matrix_world @ b.matrix).copy() for b in arm.pose.bones}
head = {n: m.translation.copy() for n, m in rest.items()}
armInverse = arm.matrix_world.inverted()
BoneName = lambda part: 'Bip002 ' + part
pelvisRest = head[BoneName('Pelvis')]
cycle = BACK_RIFLE_CONFIG['cycleFrames'] / BACK_RIFLE_CONFIG['fps']
speed = BACK_RIFLE_CONFIG['referenceSpeedMps']
stance = BACK_RIFLE_CONFIG['stanceFraction']
action = bpy.data.actions.new(BACK_RIFLE_CONFIG['clip'])
# Imported names may already exist in a user's scene: keep the exported clip semantic.
action.name = 'BackRifleRun'
action.use_fake_user = True
arm.animation_data_create()
arm.animation_data.action = action
for bone in arm.pose.bones: bone.rotation_mode = 'QUATERNION'

def Rotation(axis, angle):
    return Matrix.Rotation(angle, 4, axis)

def PutBone(boneName, point, rotation):
    world = rotation @ rest[boneName]
    world.translation = point
    arm.pose.bones[boneName].matrix = armInverse @ world
    bpy.context.view_layer.update()

def AimBone(boneName, childName, point, target):
    initial = head[childName] - head[boneName]
    desired = target - point
    turn = initial.rotation_difference(desired).to_matrix().to_4x4()
    PutBone(boneName, point, turn)
    return turn

def SolveKnee(hip, ankle, upperLength, lowerLength):
    delta = ankle - hip
    distance = min(delta.length, upperLength + lowerLength - 0.0005)
    direction = delta.normalized()
    along = (upperLength**2 - lowerLength**2 + distance**2) / (2 * distance)
    forward = Vector((0, -1, 0))
    bend = (forward - direction * forward.dot(direction)).normalized()
    return hip + direction * along + bend * math.sqrt(max(0, upperLength**2 - along**2))

def FootPath(phase):
    travel = speed * cycle * stance
    if phase <= stance:
        y = -travel / 2 + speed * cycle * phase
        lift = 0
        # Heel rises into toe-off; midstance remains flat and locked.
        u = max(0, (phase - stance + 0.13) / 0.13)
        pitch = BACK_RIFLE_CONFIG['toeOffPitchRadians'] * u*u*u*(10-15*u+6*u*u)
    else:
        u = (phase - stance) / (1-stance)
        # Hermite endpoints preserve backward support velocity across both seams.
        tangent = speed * cycle * (1-stance)
        y = Hermite(u, [(0,travel/2,tangent),(0.13,travel/2+0.04,0),(0.60,-travel/2+0.06,-1.5),(0.84,-travel/2-0.035,0),(1,-travel/2,tangent)])
        # Early heel recovery, then unfolding under the knee. Unlike a symmetric
        # sine arc this does not hold the shoe high in front of the body.
        # Keep clearance through terminal swing so the extending knee never
        # pulls a low shoe beyond the leg's anatomical reach.
        lift = BACK_RIFLE_CONFIG['flightLift'] * Hermite(u, [(0,0,0),(0.24,0.85,3),(0.38,1,0),(0.66,0.53,-2),(0.85,0.25,-1.8),(1,0,0)])
        pitch = Hermite(u, [(0,0.60,0), (0.23,0.85,0), (0.62,-0.12,0), (1,0,0)])
    return y + BACK_RIFLE_CONFIG['footTravelBiasMeters'], lift, pitch

def Hermite(t, keys):
    """Value/derivative keys, derivatives measured per full gait cycle."""
    for (a,x,dx),(b,y,dy) in zip(keys,keys[1:]):
        if t <= b:
            u=max(0,(t-a)/(b-a));span=b-a
            return (2*u**3-3*u*u+1)*x+(u**3-2*u*u+u)*dx*span+(-2*u**3+3*u*u)*y+(u**3-u*u)*dy*span
    return keys[-1][1]

# Shoe vertices are measured from the evaluated skin, not a bone tail heuristic.
shoeIndices = {}
for side in ['L', 'R']:
    groups = {g.index for g in body.vertex_groups if any(g.name == BoneName(side+' '+p) for p in ['Foot','Toe0'])}
    shoeIndices[side] = [v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>0.55]

def ShoeMinima():
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    minima = {side:min((evaluated.matrix_world@mesh.vertices[i].co).z for i in ids) for side,ids in shoeIndices.items()}
    evaluated.to_mesh_clear()
    return minima

def Pose(phase, corrections=None):
    corrections = corrections or {'L':0, 'R':0}
    theta = 2*math.pi*phase
    # Weight drops after contact, rises through push-off, peaks during flight.
    # Matching derivatives at the half-cycle seam avoid a landing pop.
    heightOffset=Hermite(phase%0.5, [(0,0,-22.22),(0.10,-1,0),(0.25,-0.04,11.85),(0.38,1.15,7.40),(0.43,1.33,0),(0.5,0,-22.22)])
    # The boundary derivatives above are in height units, like the interior keys.
    pelvis = Vector((0.010*math.sin(theta-0.25), pelvisRest.y, BACK_RIFLE_CONFIG['pelvisHeight']+BACK_RIFLE_CONFIG['pelvisBounce']*heightOffset))
    pelvisRotation = Rotation('Z', 0.065*math.sin(theta-0.12)) @ Rotation('X',0.025) @ Rotation('Y', 0.022*math.cos(theta-0.25))
    PutBone(BoneName('Pelvis'), pelvis, pelvisRotation)
    parentPart='Pelvis';parentPoint=pelvis;parentRotation=pelvisRotation
    for part,fraction in [('Spine',0.35),('Spine1',0.72),('Spine2',1),('Neck',0.35),('Head',0.25)]:
        p=parentPoint+parentRotation.to_3x3()@(head[BoneName(part)]-head[BoneName(parentPart)])
        twist=0.065*(1-fraction)*math.sin(theta-0.12)-0.065*fraction*math.sin(theta-0.30)
        r=Rotation('Z',twist)@Rotation('X',BACK_RIFLE_CONFIG['torsoLeanRadians']*fraction+0.010*fraction*math.sin(2*theta-0.5))@Rotation('Y',-0.016*fraction*math.cos(theta-0.10))
        PutBone(BoneName(part), p, r)
        if part=='Spine2': chestPoint=p.copy();torsoRotation=r.copy()
        parentPart=part;parentPoint=p;parentRotation=r
    for side, offset, sign in [('L',0,1),('R',0.5,-1)]:
        footPhase = (phase+offset)%1
        y, lift, pitch = FootPath(footPhase)
        hip = pelvis + pelvisRotation.to_3x3() @ (head[BoneName(side+' Thigh')]-pelvisRest)
        ankle = Vector((sign*0.10, pelvisRest.y+y, head[BoneName(side+' Foot')].z+lift+corrections[side]))
        # Toe pivot prevents the heel roll from driving the toe through the floor.
        toeDelta = head[BoneName(side+' Toe0')]-head[BoneName(side+' Foot')]
        footRotation = Rotation('X',pitch)
        # Roll around the metatarsal, with a fixed ground contact during push-off.
        # Fade out the pivot correction only after the foot has left the ground.
        pivotWeight=1 if footPhase<=stance else max(0,1-((footPhase-stance)/0.20))
        pivotWeight=pivotWeight*pivotWeight*(3-2*pivotWeight)
        pivotDelta=toeDelta-footRotation.to_3x3()@toeDelta
        ankle.y += pivotDelta.y*pivotWeight
        ankle.z += max(0,pivotDelta.z)
        upperLength=(head[BoneName(side+' Calf')]-head[BoneName(side+' Thigh')]).length
        lowerLength=(head[BoneName(side+' Foot')]-head[BoneName(side+' Calf')]).length
        knee=SolveKnee(hip,ankle,upperLength,lowerLength)
        AimBone(BoneName(side+' Thigh'),BoneName(side+' Calf'),hip,knee)
        AimBone(BoneName(side+' Calf'),BoneName(side+' Foot'),knee,ankle)
        PutBone(BoneName(side+' Foot'),ankle,footRotation)
        toe=ankle+footRotation.to_3x3()@toeDelta
        # The toes stay on the floor as the heel rises, then relax in flight.
        toeRotation=Rotation('X',pitch*(1-pivotWeight))
        PutBone(BoneName(side+' Toe0'),toe,toeRotation)
        clavicle=chestPoint+torsoRotation.to_3x3()@(head[BoneName(side+' Clavicle')]-head[BoneName('Spine2')])
        PutBone(BoneName(side+' Clavicle'),clavicle,torsoRotation)
        shoulder=chestPoint+torsoRotation.to_3x3()@(head[BoneName(side+' UpperArm')]-head[BoneName('Spine2')])
        armTheta=0.05+BACK_RIFLE_CONFIG['armSwingRadians']*math.cos(2*math.pi*footPhase-0.13)
        armFlex=BACK_RIFLE_CONFIG['armFlexRadians']-0.14*math.cos(2*math.pi*footPhase-0.45)
        upperDirection=torsoRotation.to_3x3()@Vector((sign*0.09, math.sin(armTheta), -math.cos(armTheta))).normalized()
        lowerDirection=torsoRotation.to_3x3()@Vector((-sign*0.04,math.sin(armTheta-armFlex),-math.cos(armTheta-armFlex))).normalized()
        elbow=shoulder+upperDirection*(head[BoneName(side+' Forearm')]-head[BoneName(side+' UpperArm')]).length
        wrist=elbow+lowerDirection*(head[BoneName(side+' Hand')]-head[BoneName(side+' Forearm')]).length
        AimBone(BoneName(side+' UpperArm'),BoneName(side+' Forearm'),shoulder,elbow)
        foreRotation=AimBone(BoneName(side+' Forearm'),BoneName(side+' Hand'),elbow,wrist)
        handX=lowerDirection.normalized()
        handY=Vector((-sign,0,0));handY=(handY-handX*handY.dot(handX)).normalized()
        handZ=handX.cross(handY).normalized()
        handBasis=Matrix((handX,handY,handZ)).transposed()
        handRotation=handBasis@rest[BoneName(side+' Hand')].to_3x3().normalized().inverted()
        PutBone(BoneName(side+' Hand'),wrist,handRotation.to_4x4())
    bpy.context.view_layer.update()
    return pelvis

# Static relaxed finger curl, authored in local bone coordinates; no copied run track.
for bone in arm.pose.bones:
    if 'Finger' in bone.name:
        side='L' if ' L ' in bone.name else 'R'
        fingerDirection=rest[bone.name].to_3x3().col[0].normalized()
        palmNormal=rest[BoneName(side+' Hand')].to_3x3().col[1].normalized()
        curlAxis=rest[bone.name].to_3x3().inverted()@fingerDirection.cross(palmNormal)
        digit=bone.name.rsplit('Finger',1)[1]
        joint=0 if len(digit)==1 else int(digit[-1])
        curlAngle=([0.88,0.65,0.45][joint] if digit.startswith('0') else [1.30,1.10,0.70][joint])
        bone.rotation_quaternion = Matrix.Rotation(curlAngle,4,curlAxis).to_quaternion()

samples=[]
for frame in range(scene.frame_start,scene.frame_end+1):
    phase=(frame-1)/BACK_RIFLE_CONFIG['cycleFrames']
    Pose(phase)
    corrections={'L':0,'R':0}
    for iteration in range(3):
        minima=ShoeMinima()
        for side,offset in [('L',0),('R',0.5)]:
            lift=FootPath((phase+offset)%1)[1]
            corrections[side] += (0.003+lift)-minima[side]
        Pose(phase,corrections)
    for bone in arm.pose.bones:
        for propertyName in ['location','rotation_quaternion','scale']:
            bone.keyframe_insert(data_path=propertyName,frame=frame,group=bone.name)
    minima=ShoeMinima()
    samples.append({'frame':frame,'phase':phase,'soleHeightMeters':minima,'pelvis':list(arm.matrix_world@arm.pose.bones[BoneName('Pelvis')].head)})

# Export uses sampled linear channels; matched first/last samples make it seamless.
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points: key.interpolation='LINEAR'
                curve.modifiers.new('CYCLES')
scene.frame_set(1)
bpy.context.view_layer.update()

# Read the already shipped weapon mesh; no alternate gun or guessed dimensions.
weaponPath=root/'Taierzhuang1938/Model/ZhongZheng.tzm.json'
weapon=json.loads(weaponPath.read_text(encoding='utf-8'))
def Decode(data,kind):
    raw=base64.b64decode(data)
    return struct.unpack('<'+kind*(len(raw)//struct.calcsize(kind)),raw)

def Material(label,color,metallic=0):
    mat=bpy.data.materials.new(label)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Roughness'].default_value=0.76
    bsdf.inputs['Metallic'].default_value=metallic
    return mat

materials={'wood':Material('Material_BackRifleWood',(0.16,0.068,0.028)), 'steel':Material('Material_BackRifleSteel',(0.09,0.10,0.105),0.8)}
for key,mat in materials.items():
    imagePath=root/('Taierzhuang1938/Texture/Texture_Weapon'+key.title()+'V2Base.webp')
    tex=mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image=bpy.data.images.load(str(imagePath),check_existing=True)
    tex.image.colorspace_settings.name='sRGB'
    mat.node_tree.links.new(tex.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'])

socket=bpy.data.objects.new('Socket_BackRifle',None); scene.collection.objects.link(socket)
socket.parent=arm; socket.parent_type='BONE'; socket.parent_bone=BoneName('Spine2')
# Bone parenting is tail-based in Blender. Solve the parent matrix once, avoiding
# assumptions about glTF-importer's display-only tail lengths.
socket.matrix_basis=Matrix.Identity(4); bpy.context.view_layer.update()
parentMatrix=socket.matrix_world.copy()
chestMatrix=arm.matrix_world@arm.pose.bones[BoneName('Spine2')].matrix
chestRotation=chestMatrix.to_3x3()@rest[BoneName('Spine2')].to_3x3().inverted()
baseMount=Vector((0.115,0.215,1.045))
mountPosition=chestMatrix.translation+chestRotation@(baseMount-head[BoneName('Spine2')])
barrel=Vector((-0.32,0,0.948)).normalized()
# TZM x/y/z to Blender basis: original -Z points up along barrel.
zAxis=-barrel; xAxis=Vector((0.948,0,0.32)).normalized(); yAxis=zAxis.cross(xAxis).normalized()
mountBasis=Matrix((xAxis,yAxis,zAxis)).transposed().to_4x4()
mountBasis=chestRotation.to_4x4()@mountBasis; mountBasis.translation=mountPosition
socket.matrix_basis=parentMatrix.inverted()@mountBasis
socket['contract']='Rigid bone attachment to Bip002 Spine2; no world-space reparent during clip'
weaponObjects=[]
for index,block in enumerate(weapon['meshes']):
    q=Decode(block['pos'],'H'); uv=Decode(block['uv'],'H'); indices=Decode(block['idx'],'I' if block['idxBits']==32 else 'H')
    vertices=[tuple(block['posMin'][j]+q[i*3+j]*block['posScale'][j] for j in range(3)) for i in range(block['count'])]
    mesh=bpy.data.meshes.new('Model_BackRiflePart'+str(index))
    mesh.from_pydata(vertices,[],[indices[i:i+3] for i in range(0,len(indices),3)]); mesh.update()
    uvLayer=mesh.uv_layers.new(name='UVMap')
    for loop in mesh.loops:
        i=loop.vertex_index
        uvLayer.data[loop.index].uv=(block['uvMin'][0]+uv[i*2]*block['uvScale'][0],block['uvMin'][1]+uv[i*2+1]*block['uvScale'][1])
    obj=bpy.data.objects.new('Model_BackRifle'+str(index),mesh);scene.collection.objects.link(obj)
    obj.parent=socket;obj.data.materials.append(materials[block['material']])
    for polygon in mesh.polygons: polygon.use_smooth=True
    weaponObjects.append(obj)

slingMat=Material('Material_BackRifleSling',(0.105,0.073,0.037))
# Continuous webbing from upper barrel band over right shoulder, across chest,
# around the left ribs and to the butt swivel. All points share the chest frame.
slingPath=[(-0.07,0.213,1.60),(-0.15,0.14,1.56),(-0.19,0.025,1.54),(-0.19,-0.075,1.49),(-0.10,-0.125,1.37),(0.06,-0.135,1.20),(0.18,-0.070,1.105),(0.205,0.055,1.08),(0.205,0.165,0.96),(0.18,0.219,0.85)]
# Ribbon topology remains editable and exports as plain mesh; gentle subdivision.
controlPoints=[Vector(p) for p in slingPath]
points=[]
for i in range(len(controlPoints)-1):
    a,b,c,d=[controlPoints[max(0,min(len(controlPoints)-1,j))] for j in [i-1,i,i+1,i+2]]
    for sub in range(8):
        t=sub/8
        points.append(0.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
points.append(controlPoints[-1])
vertices=[]
for index,p in enumerate(points):
    tangent=(points[min(index+1,len(points)-1)]-points[max(0,index-1)]).normalized()
    normal=Vector((p.x,p.y,0)); normal.normalize()
    width=tangent.cross(normal).normalized()*BACK_RIFLE_CONFIG['slingWidthMeters']/2
    for sign in [-1,1]:
        world=chestMatrix.translation+chestRotation@(p+width*sign-head[BoneName('Spine2')])
        vertices.append(tuple(mountBasis.inverted()@world))
mesh=bpy.data.meshes.new('Model_BackRifleSling');mesh.from_pydata(vertices,[],[(i*2,i*2+1,i*2+3,i*2+2) for i in range(len(points)-1)]);mesh.update()
sling=bpy.data.objects.new('Model_BackRifleSling',mesh);scene.collection.objects.link(sling);sling.parent=socket;sling.data.materials.append(slingMat)
solid=sling.modifiers.new('SlingThickness','SOLIDIFY');solid.thickness=0.003
bevel=sling.modifiers.new('SoftWebbingEdges','BEVEL');bevel.width=0.002;bevel.segments=2

# Isolated studio is part of the editable source, excluded from GLB selection.
floorMat=Material('Material_BackRifleFloor',(0.065,0.075,0.080))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-0.002));floor=bpy.context.object;floor.name='Scene_BackRifleFloor';floor.data.materials.append(floorMat)
world=bpy.data.worlds.new('Scene_BackRifleWorld');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(0.23,0.27,0.31,1);world.node_tree.nodes['Background'].inputs[1].default_value=0.6
for label,position,power,size in [('Key',(-3,-4,5),700,4),('Fill',(4,-1,3),500,3),('Rim',(0,4,4),800,3)]:
    data=bpy.data.lights.new('Scene_BackRifle'+label,'AREA');data.energy=power;data.shape='DISK';data.size=size
    lamp=bpy.data.objects.new(data.name,data);scene.collection.objects.link(lamp);lamp.location=position;lamp.rotation_euler=(Vector((0,0,1))-lamp.location).to_track_quat('-Z','Y').to_euler()
for label,position in [('Side',(4,0,1.0)),('Back',(0,4,1.0)),('ThreeQuarter',(-3,-4,1.5))]:
    data=bpy.data.cameras.new('Scene_BackRifle'+label);cam=bpy.data.objects.new(data.name,data);scene.collection.objects.link(cam);cam.location=position;cam.rotation_euler=(Vector((0,0,0.95))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.25
scene.camera=scene.objects['Scene_BackRifleSide']
scene.render.engine='BLENDER_EEVEE'
scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'

bpy.ops.object.select_all(action='DESELECT')
assetObjects=[characterRoot,arm,body,socket,sling,*weaponObjects]
# Preserve original semantic sockets and hierarchy as part of the standalone file.
for obj in scene.objects:
    if obj.parent==arm and obj.type=='EMPTY': assetObjects.append(obj)
for obj in assetObjects: obj.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(output/'Animation_LugouNraBackRifleRun.glb'),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name='BackRifleRun',export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_anim_single_armature=True,export_skins=True,export_yup=True,export_extras=True)

sourceText=bpy.data.texts.new('Script_BackRifleRunBake.py')
sourceText.use_fake_user=True
scriptPath=root/'Taierzhuang1938/_import/Script_BackRifleRunBake.py'
sourceText.write(scriptPath.read_text(encoding='utf-8'))
scene['authoringScript']=sourceText.name
scene['clipContract']=json.dumps(BACK_RIFLE_CONFIG)
scene['productionIntegration']='Independent review asset. Existing production RifleRun is unchanged.'
for image in bpy.data.images:
    if image.source=='FILE' and image.has_data and not image.packed_file:
        try:image.pack()
        except RuntimeError:pass
# Blender library files are intermediate datablocks, not directly openable projects.
# Package the named task objects in a fresh process, preserving all live scenes.
libraryPath=root/'.codex-tmp/Animation_BackRifleRunLibrary.blend'
libraryPath.parent.mkdir(parents=True,exist_ok=True)
bpy.data.libraries.write(str(libraryPath),{scene,sourceText},fake_user=True,compress=True)

manifest={**BACK_RIFLE_CONFIG,'durationSeconds':cycle,'strideMeters':speed*cycle,'sourceModel':str(sourcePath.relative_to(root)).replace('\\','/'),'sourceModelSha256':hashlib.sha256(sourcePath.read_bytes()).hexdigest(),'sourceWeapon':'Taierzhuang1938/Model/ZhongZheng.tzm.json','sourceWeaponSha256':hashlib.sha256(weaponPath.read_bytes()).hexdigest(),'armature':arm.name,'socket':'Socket_BackRifle','socketBone':'Bip002 Spine2','socketMatrixBlenderLocal':[list(row) for row in socket.matrix_basis],'rootMotion':'inPlace; GroundRoot fixed; pelvis vertical and lateral only','sourceForward':'Blender -Y / glTF +Z','gameForward':'apply existing MODEL_FORWARD_YAW once, game -Z','playbackRate':'actualSpeedMps / (referenceSpeedMps * uniformCharacterScale)', 'nativeBindHeightMeters':1.8143911361694336, 'runtimeDefaultHeightMeters':1.68,'authoring':'BlenderMCP execute_blender_code, analytical support-path IK and newly authored upper-body keys','acceptance':'Independent asset review only; production replacement is not authorized','samples':samples}
(output/'Data_BackRifleRun.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
packaged=subprocess.run([bpy.app.binary_path,'--background','--factory-startup','--python-exit-code','1','--python',str(root/'Taierzhuang1938/_import/Script_BackRifleRunSource.py'),'--',str(libraryPath),str(output/'Animation_LugouNraBackRifleRun.blend'),str(output/'Data_BackRifleRun.json')],capture_output=True,text=True,check=True)

result={'scene':scene.name,'clip':action.name,'asset':str(output/'Animation_LugouNraBackRifleRun.glb'),'source':str(output/'Animation_LugouNraBackRifleRun.blend'),'duration':cycle,'frames':len(samples),'soleRange':{side:[min(s['soleHeightMeters'][side] for s in samples),max(s['soleHeightMeters'][side] for s in samples)] for side in ['L','R']}}
