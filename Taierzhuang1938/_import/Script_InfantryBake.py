"""Source-driven NRA/IJA retargeting. Run via BlenderMCP in the task-owned file.

INFANTRY_FACTION, INFANTRY_CLIP and INFANTRY_PASS select the scoped operation.
"""
from pathlib import Path
import json, math
import numpy as np
import bpy
from mathutils import Matrix, Vector, Quaternion

runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905'
assert str(runtime).lower() in bpy.data.filepath.lower(), 'Only edit this task source'
faction=globals().get('INFANTRY_FACTION','Nra'); clip=globals().get('INFANTRY_CLIP','RifleCrouchAdvance')
stage=globals().get('INFANTRY_PASS','raw')
motion=json.loads((runtime/f'Data_{clip}Motion.json').read_text())
scene=bpy.data.scenes['Scene_'+faction+'InfantryActions'];bpy.context.window.scene=scene
arm=bpy.data.objects['Rig_'+faction+'Infantry'];body=bpy.data.objects['Model_'+faction+'InfantryBody']
rifle=bpy.data.objects['Socket_'+faction+'InfantryRifle']
prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
N=lambda part:prefix+part
mapping={'Pelvis':0,'Spine':3,'Spine1':6,'Spine2':9,'Neck':12,'Head':15,
 'L Thigh':1,'R Thigh':2,'L Calf':4,'R Calf':5,'L Foot':7,'R Foot':8,'L Toe0':10,'R Toe0':11,
 'L Clavicle':13,'R Clavicle':14,'L UpperArm':16,'R UpperArm':17,'L Forearm':18,'R Forearm':19,'L Hand':20,'R Hand':21}
rest={b.name:(arm.matrix_world@b.matrix_local).copy() for b in arm.data.bones}
heads={name:matrix.translation.copy() for name,matrix in rest.items()}
inverse=arm.matrix_world.inverted()
length=(heads[N('L Calf')]-heads[N('L Thigh')]).length+(heads[N('L Foot')]-heads[N('L Calf')]).length
ratio=length/motion['sourceLegLength']
alignment={}
for side in ['L','R']:
 for part,child in [('Thigh','Calf'),('Calf','Foot'),('UpperArm','Forearm'),('Forearm','Hand')]:
  name,childName=side+' '+part,side+' '+child
  delta=Vector(motion['sourceRestJoints'][mapping[childName]])-Vector(motion['sourceRestJoints'][mapping[name]])
  alignment[name]=(heads[N(childName)]-heads[N(name)]).rotation_difference(delta).to_matrix().to_4x4()
 alignment[side+' Hand']=alignment[side+' Forearm']

arm.animation_data_clear();rifle.animation_data_clear()
for b in arm.pose.bones: b.matrix_basis=Matrix.Identity(4);b.rotation_mode='QUATERNION'
bpy.context.view_layer.update()
shoeIds={};kneeIds={}
for side in ['L','R']:
 groups={g.index for g in body.vertex_groups if g.name in [N(side+' Foot'),N(side+' Toe0')]}
 shoeIds[side]=[v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>.55]
 # Knee geometry is selected by actual distance to the joint in the original skin.
 knee=heads[N(side+' Calf')]
 kneeIds[side]=[v.index for v in body.data.vertices if (body.matrix_world@v.co-knee).length<.095]
 assert shoeIds[side] and kneeIds[side]

def MeshPoints():
 evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
 points={s:[evaluated.matrix_world@mesh.vertices[i].co for i in ids] for s,ids in shoeIds.items()}
 knees={s:[evaluated.matrix_world@mesh.vertices[i].co for i in ids] for s,ids in kneeIds.items()}
 evaluated.to_mesh_clear();return points,knees

def Put(part,point,delta):
 matrix=delta@rest[N(part)];matrix.translation=point
 arm.pose.bones[N(part)].matrix=inverse@matrix;bpy.context.view_layer.update()

def BasePose(index,zCorrection=0):
 rotations={p:Matrix(motion['rotations'][index][j]).to_4x4()@alignment.get(p,Matrix.Identity(4)) for p,j in mapping.items()}
 positions={}
 root=Vector(motion['rootOffsets'][index])*ratio
 root.z=motion['heightFromAnkles'][index]*ratio+heads[N('L Foot')].z+zCorrection
 for bone in arm.pose.bones:
  if bone.name not in [N(p) for p in mapping]:continue
  part=bone.name[len(prefix):];parent=bone.parent.name[len(prefix):] if bone.parent and bone.parent.name.startswith(prefix) else None
  if part=='Pelvis':point=root
  elif 'Thigh' in part:point=root+rotations['Pelvis'].to_3x3()@(heads[N(part)]-heads[N('Pelvis')])
  else:point=positions[parent]+rotations[parent].to_3x3()@(heads[N(part)]-heads[N(parent)])
  positions[part]=point;Put(part,point,rotations[part])
 for b in arm.pose.bones:
  if 'Finger' not in b.name:continue
  side='L' if ' L ' in b.name else 'R';direction=rest[b.name].to_3x3().col[0].normalized();normal=rest[N(side+' Hand')].to_3x3().col[1].normalized()
  axis=rest[b.name].to_3x3().inverted()@direction.cross(normal)
  digit=b.name.rsplit('Finger',1)[1];joint=0 if len(digit)==1 else int(digit[-1])
  angle=([.72,.58,.45][joint] if digit.startswith('0') else [1.10,1.03,.68][joint])
  b.rotation_quaternion=Matrix.Rotation(angle,4,axis).to_quaternion()
 bpy.context.view_layer.update();return positions,rotations

def SetRifle(matrix):
 parent=rifle.matrix_world@rifle.matrix_basis.inverted()
 rifle.matrix_basis=parent.inverted()@matrix;rifle.rotation_mode='QUATERNION'
 bpy.context.view_layer.update()

def RiflePose(positions,rotations):
 if motion['kind']=='throw':
  chest=rotations['Spine2'];scale=heads[N('Pelvis')].z/.942464
  point=positions['Spine2']+chest.to_3x3()@(Vector((.115,.215,1.045))*scale-heads[N('Spine2')])
  barrel=Vector((-.32,0,.948)).normalized();z=-barrel;x=Vector((.948,0,.32)).normalized();y=z.cross(x).normalized()
  matrix=chest@Matrix((x,y,z)).transposed().to_4x4();matrix.translation=point
 else:
  point=positions['R Hand'];forward=(positions['L Hand']-point).normalized()
  if forward.y>-.2: forward=Vector((0,-1,0))
  up=rotations['Spine2'].to_3x3()@Vector((0,0,1));z=-forward;x=up.cross(z).normalized();y=z.cross(x).normalized()
  matrix=Matrix((x,y,z)).transposed().to_4x4();matrix.translation=point
 SetRifle(matrix)

def SolveChain(upper,lower,tip,start,target,pole,rotations):
 a=(heads[N(lower)]-heads[N(upper)]).length;b=(heads[N(tip)]-heads[N(lower)]).length
 delta=target-start;distance=delta.length
 if distance>a+b-.0005: raise ValueError(f'{clip} {faction} {upper} unreachable {distance:.5f}/{a+b:.5f}')
 axis=delta.normalized();along=(a*a-b*b+distance*distance)/(2*distance)
 bend=pole-axis*pole.dot(axis)
 if bend.length<.0001: bend=Vector((0,-1,0));bend-=axis*bend.dot(axis)
 mid=start+axis*along+bend.normalized()*math.sqrt(max(0,a*a-along*along))
 for part,child,point,end in [(upper,lower,start,mid),(lower,tip,mid,target)]:
  sourceDirection=rotations[part].to_3x3()@(heads[N(child)]-heads[N(part)])
  correction=sourceDirection.rotation_difference(end-point).to_matrix().to_4x4()
  Put(part,point,correction@rotations[part])
 return mid

# INFANTRY_BAKE_BODY
name='Animation_'+faction+'_'+clip+('_Raw' if stage=='raw' else '')
for a in list(bpy.data.actions):
 if a.name in [name,name+'_Rifle']:bpy.data.actions.remove(a)
action=bpy.data.actions.new(name);action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
weaponAction=bpy.data.actions.new(name+'_Rifle');weaponAction.use_fake_user=True;rifle.animation_data_create();rifle.animation_data.action=weaponAction
scene.render.fps=60;scene.frame_start=1;scene.frame_end=motion['cycleFrames']+1
samples=[];previous={}
for index in range(motion['cycleFrames']+1):
 positions,rotations=BasePose(index)
 points,knees=MeshPoints()
 floor=min(p.z for pts in points.values() for p in pts)
 positions,rotations=BasePose(index,.003-floor)
 RiflePose(positions,rotations)
 points,knees=MeshPoints()
 samples.append({'frame':index+1,'sourceFrame':motion['sourceFrameIndices'][index],
  'heads':{p:list(arm.matrix_world@arm.pose.bones[N(p)].head) for p in mapping},
  'soles':{s:min(p.z for p in pts) for s,pts in points.items()},
  'knees':{s:min(p.z for p in pts) for s,pts in knees.items()}})
 for b in arm.pose.bones:
  q=b.rotation_quaternion.copy()
  if b.name in previous and q.dot(previous[b.name])<0:q.negate()
  b.rotation_quaternion=q;previous[b.name]=q.copy()
  for path in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=path,frame=index+1,group=b.name)
 for path in ['location','rotation_quaternion','scale']:rifle.keyframe_insert(data_path=path,frame=index+1)
for a in [action,weaponAction]:
 for layer in a.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.interpolation='LINEAR'
     if motion['loop']:curve.modifiers.new('CYCLES')
scene['taskState']=stage+' retarget '+clip;scene['selectedClip']=clip
scene.frame_set(2);scene.frame_set(1)
(runtime/f'Data_{faction}_{clip}_{stage}Measurements.json').write_text(json.dumps({'ratio':ratio,'frames':samples}),encoding='utf-8')
if not globals().get('INFANTRY_NO_SAVE'):
 bpy.ops.wm.save_as_mainfile(filepath=str(runtime/'Scene_InfantryRetarget.blend'),compress=True)
print(name,len(samples),'frames')
