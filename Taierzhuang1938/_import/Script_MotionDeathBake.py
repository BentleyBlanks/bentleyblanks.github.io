"""Retarget a shared collapse to the original Nra/Ija rigs, with whole-body contact."""
from pathlib import Path
import argparse, json, sys, math
import bpy, numpy as np
from mathutils import Matrix, Vector

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, required=True)
parser.add_argument('--faction', choices=['Nra','Ija'], required=True)
parser.add_argument('--clip',default='DeathCollapse')
parser.add_argument('--group',default='DeathCollapseV1')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root, faction, clip = args.root, args.faction, args.clip
out = root/'Models'/args.group
blendOut = root/'Blender'/args.group
out.mkdir(parents=True,exist_ok=True)
blendOut.mkdir(parents=True,exist_ok=True)
motion = json.loads((root/'Models/_Cache'/args.group/f'Data_{clip}Motion.json').read_text(encoding='utf-8'))
archive = json.loads((root/'Data_ArchiveManifest.json').read_text(encoding='utf-8'))['records']
preparation = root/next(r['path'] for r in archive if r['source'].replace('\\','/').endswith('InfantryActions_20260905/Scene_InfantryPreparation.blend'))
bpy.ops.wm.open_mainfile(filepath=str(preparation))
scene = bpy.data.scenes['Scene_'+faction+'InfantryActions']
bpy.context.window.scene = scene
for other in list(bpy.data.scenes):
    if other != scene:
        bpy.data.scenes.remove(other)
arm = bpy.data.objects['Rig_'+faction+'Infantry']
body = bpy.data.objects['Model_'+faction+'InfantryBody']
rifle=None
rifleParts=[]
if motion.get('propStyle')=='back':
    rifle=bpy.data.objects['Socket_'+faction+'InfantryRifle']
    exec(compile(Path(__file__).with_name('Script_InfantryCompleteRifle.py').read_text(encoding='utf-8'),'CompleteRifle','exec'))
    CompleteRifle(root,faction,rifle)
    rifleParts=[o for o in scene.objects if o==rifle or o.parent==rifle]
# This source is empty-handed; do not export unrelated preparation props.
for obj in list(scene.objects):
    if obj not in [arm,body]+rifleParts and obj.type not in ['CAMERA','LIGHT']:
        bpy.data.objects.remove(obj,do_unlink=True)
for obj in scene.objects:
    if obj.animation_data:
        obj.animation_data_clear()
bpy.context.view_layer.update()
for mat in body.data.materials:
    if mat and mat.use_nodes:
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                for name,value in [('Metallic',0),('Roughness',.8)]:
                    for link in list(node.inputs[name].links):
                        mat.node_tree.links.remove(link)
                    node.inputs[name].default_value = value
prefix = 'Bip002 ' if faction == 'Nra' else 'Bip001 '
def N(part): return prefix+part
mapping = {'Pelvis':0,'Spine':3,'Spine1':6,'Spine2':9,'Neck':12,'Head':15,'L Thigh':1,'R Thigh':2,'L Calf':4,'R Calf':5,'L Foot':7,'R Foot':8,'L Toe0':10,'R Toe0':11,'L Clavicle':13,'R Clavicle':14,'L UpperArm':16,'R UpperArm':17,'L Forearm':18,'R Forearm':19,'L Hand':20,'R Hand':21}
rest = {b.name:(arm.matrix_world@b.matrix_local).copy() for b in arm.data.bones}
heads = {n:m.translation.copy() for n,m in rest.items()}
inverse = arm.matrix_world.inverted()
leg = (heads[N('L Calf')]-heads[N('L Thigh')]).length+(heads[N('L Foot')]-heads[N('L Calf')]).length
ratio = leg/motion['sourceLegLength']
alignment = {}
for side in ['L','R']:
    for part,child in [('Thigh','Calf'),('Calf','Foot'),('UpperArm','Forearm'),('Forearm','Hand')]:
        name,childName = side+' '+part,side+' '+child
        delta = Vector(motion['sourceRestJoints'][mapping[childName]])-Vector(motion['sourceRestJoints'][mapping[name]])
        alignment[name] = (heads[N(childName)]-heads[N(name)]).rotation_difference(delta).to_matrix().to_4x4()
    alignment[side+' Hand'] = alignment[side+' Forearm']
for bone in arm.pose.bones:
    bone.matrix_basis = Matrix.Identity(4)
    bone.rotation_mode = 'QUATERNION'
bpy.context.view_layer.update()
desired = {}
def Put(part,point,delta):
    matrix = delta@rest[N(part)]
    matrix.translation = point
    desired[N(part)] = inverse@matrix
    bone = arm.pose.bones[N(part)]
    parent = bone.parent
    parentMatrix = desired.get(parent.name,parent.matrix) if parent else Matrix.Identity(4)
    bone.matrix_basis = bone.bone.convert_local_to_pose(desired[bone.name],bone.bone.matrix_local,
        parent_matrix=parentMatrix,parent_matrix_local=parent.bone.matrix_local if parent else Matrix.Identity(4),invert=True)
def Pose(index,vertical=0):
    desired.clear()
    rotations = {p:Matrix(motion['rotations'][index][j]).to_4x4()@alignment.get(p,Matrix.Identity(4)) for p,j in mapping.items()}
    weight = Landing(index)
    flatUp=Vector(motion['sourceRelativeJoints'][index][15])
    flatUp.z=0
    if flatUp.length>.001:
        flatUp.normalize()
        forward=rotations['Spine2'].to_3x3()@Vector((0,-1,0))
        forward-=flatUp*forward.dot(flatUp)
        forward.normalize()
        backward=-forward
        right=backward.cross(flatUp).normalized()
        flatRotation=Matrix((right,flatUp.cross(right),flatUp)).transposed().to_quaternion()
        for part in ['Spine','Spine1','Spine2','Neck','Head']:
            rotations[part] = rotations[part].to_quaternion().slerp(flatRotation,weight).to_matrix().to_4x4()
    positions = {}
    pelvis = Vector(motion['rootOffsets'][index])*ratio
    pelvis.z += vertical
    for bone in arm.pose.bones:
        if not bone.name.startswith(prefix): continue
        part = bone.name[len(prefix):]
        if part not in mapping: continue
        parent = bone.parent.name[len(prefix):] if bone.parent and bone.parent.name.startswith(prefix) else None
        if part == 'Pelvis': point = pelvis
        elif 'Thigh' in part: point = pelvis+rotations['Pelvis'].to_3x3()@(heads[N(part)]-heads[N('Pelvis')])
        else: point = positions[parent]+rotations[parent].to_3x3()@(heads[N(part)]-heads[N(parent)])
        positions[part] = point
        Put(part,point,rotations[part])
    for bone in arm.pose.bones:
        if 'Finger' not in bone.name: continue
        side = 'L' if ' L ' in bone.name else 'R'
        direction = rest[bone.name].to_3x3().col[0].normalized()
        normal = rest[N(side+' Hand')].to_3x3().col[1].normalized()
        axis = rest[bone.name].to_3x3().inverted()@direction.cross(normal)
        angle = .08 if 'Finger0' in bone.name else .17
        bone.rotation_quaternion = Matrix.Rotation(angle,4,axis).to_quaternion()
    return positions,rotations
def Landing(index):
    if 'bodyContactWeights' in motion:return float(motion['bodyContactWeights'][index])
    t=max(0,min(1,(motion['sourceFrameIndices'][index]-68)/42))
    return t*t*(3-2*t)
def VertexIds(parts):
    groups={g.index for g in body.vertex_groups if g.name in [N(p) for p in parts]}
    return [v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>.5]
torsoIds=VertexIds(['Pelvis','Spine','Spine1','Spine2'])
footIds={side:VertexIds([side+' Foot',side+' Toe0']) for side in ['L','R']}
def MeshPoints():
    bpy.context.view_layer.update()
    evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    vertices = np.empty(len(mesh.vertices)*3,dtype=np.float32)
    mesh.vertices.foreach_get('co',vertices)
    matrix = np.array(evaluated.matrix_world)
    points = vertices.reshape(-1,3)@matrix[:3,:3].T+matrix[:3,3]
    evaluated.to_mesh_clear()
    return points
def Solve(upper,lower,tip,start,target,pole,rotations):
    a=(heads[N(lower)]-heads[N(upper)]).length
    b=(heads[N(tip)]-heads[N(lower)]).length
    delta=target-start
    distance=max(.001,min(delta.length,a+b-.002))
    axis=delta.normalized()
    target=start+axis*distance
    along=(a*a-b*b+distance*distance)/(2*distance)
    bend=pole-axis*pole.dot(axis)
    if bend.length<.001: bend=Vector((1,0,0))-axis*axis.x
    middle=start+axis*along+bend.normalized()*math.sqrt(max(0,a*a-along*along))
    for part,child,p,end in [(upper,lower,start,middle),(lower,tip,middle,target)]:
        direction=rotations[part].to_3x3()@(heads[N(child)]-heads[N(part)])
        Put(part,p,direction.rotation_difference(end-p).to_matrix().to_4x4()@rotations[part])
    return target,middle
def RelaxLimbs(index,positions,rotations):
    weight=Landing(index)
    if weight<=0:return
    points=MeshPoints()
    for side in ['L','R']:
        ankle=positions[side+' Foot'].copy()
        ankle.z+=(.004-float(points[footIds[side],2].min()))*weight
        pole=positions[side+' Calf']-positions[side+' Thigh']
        pole.z*=1-weight
        target,_=Solve(side+' Thigh',side+' Calf',side+' Foot',positions[side+' Thigh'],ankle,pole,rotations)
        Put(side+' Foot',target,rotations[side+' Foot'])
        Put(side+' Toe0',target+rotations[side+' Foot'].to_3x3()@(heads[N(side+' Toe0')]-heads[N(side+' Foot')]),rotations[side+' Toe0'])
        wrist=positions[side+' Hand'].copy()
        palmDown=motion.get('contactPalm')=='down'
        wrist.z=wrist.z*(1-weight)+(.04 if palmDown else .095)*weight
        pole=positions[side+' Forearm']-positions[side+' UpperArm']
        pole.z=pole.z*(1-weight)+.16*weight
        target,_=Solve(side+' UpperArm',side+' Forearm',side+' Hand',positions[side+' UpperArm'],wrist,pole,rotations)
        handRotation=rotations[side+' Hand']
        if palmDown:
            direction=Vector(motion['sourceRelativeJoints'][index][15]);direction.z=0;direction.normalize()
            normal=Vector((0,0,-1))
            x=rest[N(side+' Hand')].to_3x3().col[0].normalized()
            y=rest[N(side+' Hand')].to_3x3().col[1].normalized()
            source=Matrix((x,y,x.cross(y))).transposed()
            targetBasis=Matrix((direction,normal,direction.cross(normal))).transposed()
            flat=(targetBasis@source.transposed()).to_quaternion()
            handRotation=handRotation.to_quaternion().slerp(flat,weight).to_matrix().to_4x4()
        Put(side+' Hand',target,handRotation)
animationName = 'Animation_'+faction+'_'+clip+'_V1'
action = bpy.data.actions.new(animationName)
action.use_fake_user = True
arm.animation_data_create()
arm.animation_data.action = action
if rifle:
    rifle.rotation_mode='QUATERNION'
    rifle.animation_data_create()
    rifle.animation_data.action=bpy.data.actions.new(animationName+'_Rifle')
    rifle.animation_data.action.use_fake_user=True
def BackRifle(index):
    if not rifle:return
    bpy.context.view_layer.update()
    spine=arm.matrix_world@arm.pose.bones[N('Spine2')].matrix
    delta=spine.to_3x3()@rest[N('Spine2')].to_3x3().inverted()
    muzzle=Vector((.45,0,.893)).normalized()
    z=-muzzle
    x=Vector((0,1,0)).cross(z).normalized()
    local=Matrix((x,z.cross(x),z)).transposed()
    matrix=(delta@local).to_4x4()
    matrix.translation=spine.translation+delta@Vector((-.12,.16,-.30))
    parent=rifle.matrix_world@rifle.matrix_basis.inverted()
    rifle.matrix_basis=parent.inverted()@matrix
    if 'rifle' in previous and rifle.rotation_quaternion.dot(previous['rifle'])<0:rifle.rotation_quaternion.negate()
    previous['rifle']=rifle.rotation_quaternion.copy()
    for prop in ['location','rotation_quaternion','scale']:rifle.keyframe_insert(data_path=prop,frame=index+1)
scene.render.fps = int(motion['fps'])
scene.frame_start = 1
scene.frame_end = motion['cycleFrames']+1
previous = {}
samples = []
for index in range(scene.frame_end):
    Pose(index)
    points=MeshPoints()
    low,high=points.min(0),points.max(0)
    # A collapse maintains some support throughout. Use the entire skinned body,
    # so hip/shoulder contact replaces foot contact as the performer falls.
    weight=Landing(index)
    correction = .004-(float(low[2])*(1-weight)+float(points[torsoIds,2].min())*weight)
    positions,rotations=Pose(index,correction)
    RelaxLimbs(index,positions,rotations)
    final=MeshPoints()
    residualLift=max(0,.004-float(final[:,2].min()))
    if residualLift>0:
        Put('Pelvis',positions['Pelvis']+Vector((0,0,residualLift)),rotations['Pelvis'])
        final=MeshPoints()
    low,high=final.min(0),final.max(0)
    BackRifle(index)
    for bone in arm.pose.bones:
        if bone.name in previous and bone.rotation_quaternion.dot(previous[bone.name]) < 0:
            bone.rotation_quaternion.negate()
        previous[bone.name] = bone.rotation_quaternion.copy()
        bone.keyframe_insert(data_path='location',frame=index+1)
        bone.keyframe_insert(data_path='rotation_quaternion',frame=index+1)
    samples.append({'frame':index+1,'verticalCorrection':correction+residualLift,'boundsMin':low.tolist(),'boundsMax':high.tolist(),
        'torsoGroundHeight':float(final[torsoIds,2].min())})
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points: key.interpolation='LINEAR'
scene['sourceCache'] = motion['rawCache']
scene['sourceRange'] = motion['range']
scene['reviewStatus'] = 'Local review; not accepted for production'
scene['corrections'] = '; '.join(motion['corrections']+['Whole-body then torso surface contact; limb support IK; neck/head relaxation; relaxed hand pose'])
bpy.ops.object.select_all(action='DESELECT')
for obj in [arm,body]+rifleParts:
    obj.hide_set(False)
    obj.select_set(True)
bpy.context.view_layer.objects.active = arm
scene.frame_set(1)
path = out/(animationName+'.glb')
exec(compile(Path(__file__).with_name('Script_InfantryExport.py').read_text(encoding='utf-8'),'ExportInfantry','exec'))
ExportInfantry(path,animationName)
for img in bpy.data.images:
    if img.source == 'FILE' and img.has_data and not img.packed_file: img.pack()
blendPath = blendOut/('Scene_'+faction+'_'+clip+'_V1.blend')
bpy.ops.wm.save_as_mainfile(filepath=str(blendPath),compress=True)
report = {'status':'requires_visual_review','faction':faction,'clip':animationName,'path':path.relative_to(root).as_posix(),
    'blend':blendPath.relative_to(root).as_posix(),'loop':motion['loop'],'samples':samples,'settleFrame':motion['settleFrame'],
    'sourceRangeSeconds':[0,motion['durationSeconds']],'corrections':scene['corrections'],
    'retargetScale':ratio,'variants':[{'id':clip,'faction':faction,'path':path.relative_to(root).as_posix(),'clip':animationName,
        'blend':blendPath.relative_to(root).as_posix(),'sourceFrames':motion['range'],'loop':motion['loop']}],
    'maxVerticalCorrectionStep':float(np.max(np.abs(np.diff([s['verticalCorrection'] for s in samples]))))}
(out/('Data_'+faction+'_'+clip+'_Validation.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
print('DONE',faction,animationName,flush=True)
