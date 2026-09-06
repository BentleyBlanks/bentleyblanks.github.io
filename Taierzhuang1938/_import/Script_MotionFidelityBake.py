"""Original-rig retarget driven by anatomical segments, with measured fidelity.

No arm/leg IK pulls recovered joints toward an authored weapon or floor pose.
The complete body may translate vertically for skin clearance. Raw flight is
retained, and every target anatomical segment keeps the original bind length.
"""
from pathlib import Path
import argparse,json,math,sys
import bpy,numpy as np
from mathutils import Matrix,Vector,Quaternion

parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--group',default='ReviewV7');parser.add_argument('--revision',type=int,default=7)
parser.add_argument('--faction',choices=['Nra','Ija'],required=True);parser.add_argument('--clip',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root;faction=args.faction;clip=args.clip
out=root/'Models'/args.group;blendOut=root/'Blender'/args.group;blendOut.mkdir(parents=True,exist_ok=True)
motion=json.loads((root/'Models/_Cache'/args.group/f'Data_{clip}Motion.json').read_text(encoding='utf-8'))
kind=motion['kind'];count=motion['cycleFrames'];loop=motion['loop']
archive=json.loads((root/'Data_ArchiveManifest.json').read_text(encoding='utf-8'))['records']
preparation=root/next(r['path'] for r in archive if r['source'].replace('\\','/').endswith('InfantryActions_20260905/Scene_InfantryPreparation.blend'))
fingerReference={}
if kind=='rifle':
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(root/f'Models/SourceCharacters/Model_Lugou{faction}01.glb'))
 referenceArm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');referenceAction=bpy.data.actions['RifleRun']
 referenceArm.animation_data.action=referenceAction;referenceArm.animation_data.action_slot=referenceAction.slots[0]
 bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
 fingerReference={b.name:b.matrix_basis.to_quaternion().copy() for b in referenceArm.pose.bones if 'Finger' in b.name}
bpy.ops.wm.open_mainfile(filepath=str(preparation));scene=bpy.data.scenes['Scene_'+faction+'InfantryActions'];bpy.context.window.scene=scene
for other in list(bpy.data.scenes):
 if other!=scene:bpy.data.scenes.remove(other)
bpy.context.view_layer.update()
arm=bpy.data.objects['Rig_'+faction+'Infantry'];body=bpy.data.objects['Model_'+faction+'InfantryBody'];rifle=bpy.data.objects['Socket_'+faction+'InfantryRifle']
prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
def N(part):return prefix+part
mapping={'Pelvis':0,'Spine':3,'Spine1':6,'Spine2':9,'Neck':12,'Head':15,'L Thigh':1,'R Thigh':2,'L Calf':4,'R Calf':5,'L Foot':7,'R Foot':8,'L Toe0':10,'R Toe0':11,'L Clavicle':13,'R Clavicle':14,'L UpperArm':16,'R UpperArm':17,'L Forearm':18,'R Forearm':19,'L Hand':20,'R Hand':21}
parts={v:k for k,v in mapping.items()}
sourceParent={p:parts[motion['sourceParents'][j]] for p,j in mapping.items() if j}
rest={b.name:(arm.matrix_world@b.matrix_local).copy() for b in arm.data.bones};heads={n:m.translation.copy() for n,m in rest.items()};inverse=arm.matrix_world.inverted()
scale=heads[N('Pelvis')].z/.942464
leg=(heads[N('L Calf')]-heads[N('L Thigh')]).length+(heads[N('L Foot')]-heads[N('L Calf')]).length;ratio=leg/motion['sourceLegLength']
lengths={p:(heads[N(p)]-heads[N(parent)]).length for p,parent in sourceParent.items()}
alignment={}
children={'Pelvis':'Spine','Spine':'Spine1','Spine1':'Spine2','Spine2':'Neck','Neck':'Head'}
for side in ['L','R']:
 for part,child in [('Clavicle','UpperArm'),('UpperArm','Forearm'),('Forearm','Hand'),('Thigh','Calf'),('Calf','Foot'),('Foot','Toe0')]:
  p,c=side+' '+part,side+' '+child;children[p]=c
  source=Vector(motion['sourceRestJoints'][mapping[c]])-Vector(motion['sourceRestJoints'][mapping[p]])
  alignment[p]=(heads[N(c)]-heads[N(p)]).rotation_difference(source).to_matrix().to_4x4()
 alignment[side+' Hand']=alignment[side+' Forearm']
for obj in scene.objects:
 if obj.animation_data:obj.animation_data_clear()
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4);b.rotation_mode='QUATERNION'
bpy.context.view_layer.update()
# Clearing an object action restores its underlying object translation. Capture
# the inverse after evaluation; the preparation scene has an animated offset.
inverse=arm.matrix_world.inverted()
for mat in body.data.materials:
 if mat and mat.use_nodes:
  for node in mat.node_tree.nodes:
   if node.type=='BSDF_PRINCIPLED':
    for name,value in [('Metallic',0),('Roughness',.8)]:
     for link in list(node.inputs[name].links):mat.node_tree.links.remove(link)
     node.inputs[name].default_value=value
exec(compile(Path(__file__).with_name('Script_InfantryCompleteRifle.py').read_text(encoding='utf-8'),'CompleteRifle','exec'))
if kind in ['rifle','back']:CompleteRifle(root,faction,rifle)
rifleParts=[rifle]+list(rifle.children_recursive)
props=[]
def SetRifle(matrix):rifle.matrix_world=matrix

# Detach the socket with its world pose intact; the editable project contains
# the same world-space action exported to glTF, avoiding bone-tail offsets.
matrix=rifle.matrix_world.copy();rifle.parent=None;rifle.matrix_world=matrix;rifle.rotation_mode='QUATERNION'
if kind=='melee':
 exec(compile(Path(__file__).with_name('Script_MeleeVideoContact.py').read_text(encoding='utf-8'),'MeleeVideoContact','exec'))
 props=[rifle]
elif kind in ['rifle','back']:props=[rifle]
else:rifleParts=[]
keep=[arm,body]+rifleParts
for obj in keep:
 if obj.parent and obj.parent not in keep:
  world=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=world
bpy.context.view_layer.update();inverse=arm.matrix_world.inverted()
for obj in list(scene.objects):
 if obj not in keep and obj.type not in ['CAMERA','LIGHT']:bpy.data.objects.remove(obj,do_unlink=True)

def Material(name,color):
 mat=bpy.data.materials.new(name);mat.use_nodes=True;node=mat.node_tree.nodes['Principled BSDF'];node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=.8;return mat
if kind=='carry':
 for side in ['L','R']:
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.018,depth=.5);obj=bpy.context.object;obj.name='Prop_'+side+'StretcherGrip';obj.rotation_mode='QUATERNION';obj.data.materials.append(Material('Material_'+side+'Grip',(.28,.17,.08)));props.append(obj)
if kind=='grenade':
 bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=.035);grenade=bpy.context.object;grenade.name='Prop_Grenade';grenade.data.materials.append(Material('Material_Grenade',(.16,.19,.13)));grenade.rotation_mode='QUATERNION';props=[grenade]

desired={}
def Put(part,point,delta):
 matrix=delta@rest[N(part)];matrix.translation=point;desired[N(part)]=inverse@matrix;b=arm.pose.bones[N(part)];parent=b.parent
 b.matrix_basis=b.bone.convert_local_to_pose(desired[b.name],b.bone.matrix_local,parent_matrix=desired.get(parent.name,parent.matrix) if parent else Matrix.Identity(4),parent_matrix_local=parent.bone.matrix_local if parent else Matrix.Identity(4),invert=True)

def Base(index,lift=0):
 desired.clear();source=[Vector(p) for p in motion['sourceRelativeJoints'][index]]
 rotations={p:Matrix(motion['rotations'][index][j]).to_4x4()@alignment.get(p,Matrix.Identity(4)) for p,j in mapping.items()}
 for p,c in children.items():
  expected=source[mapping[c]]-source[mapping[p]];current=rotations[p].to_3x3()@(heads[N(c)]-heads[N(p)])
  rotations[p]=current.rotation_difference(expected).to_matrix().to_4x4()@rotations[p]
 positions={'Pelvis':Vector(motion['rootOffsets'][index])*ratio+Vector((0,0,lift))}
 # Compute in SMPL's topological order, apply in BIP's actual hierarchy order.
 for j in range(1,22):
  p=parts[j];parent=sourceParent[p];direction=source[j]-source[mapping[parent]]
  positions[p]=positions[parent]+direction.normalized()*lengths[p]
 for b in arm.pose.bones:
  p=b.name[len(prefix):]
  if p in mapping:Put(p,positions[p],rotations[p])
 return positions,rotations

def MeshPoints():
 bpy.context.view_layer.update();obj=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=obj.to_mesh();v=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',v);m=np.array(obj.matrix_world);p=v.reshape(-1,3)@m[:3,:3].T+m[:3,3];obj.to_mesh_clear();return p

base=[];lifts=[]
for i in range(count+1):
 positions,rotations=Base(i);points=MeshPoints()
 lift=.004+motion['sourceClearance'][i]*ratio-float(points[:,2].min())
 lifts.append(lift);base.append({'positions':positions,'rotations':rotations})

# No authored arm motion. For ordinary rifles solve a changing support-hand
# position along a rigid fore-end; wrists and elbows themselves never move.
def Basis(x,y):
 x=x.normalized();y=y-x*y.dot(x)
 if y.length<1e-5:y=Vector((1,0,0))-x*x.x
 y.normalize();return Matrix((x,y,x.cross(y))).transposed()
rightGrip=Vector((.020,-.045,.055))*scale if kind!='melee' else rightGrip
gripSamples=[]
rifleWristCalibrations={}
anatomicalPalms={}
for side in ['L','R']:
 directions=[]
 for sample in base:
  q=(sample['rotations'][side+' Hand']@rest[N(side+' Hand')]).to_quaternion()
  extension=(sample['positions'][side+' Hand']-sample['positions'][side+' Forearm']).normalized()
  directions.append(q.inverted()@extension)
 target=sum(directions,Vector()).normalized()
 native=rest[N(side+' Hand')].to_3x3().inverted()@(heads[N(side+' Finger2')]-heads[N(side+' Hand')]).normalized()
 rifleWristCalibrations[side]=native.rotation_difference(target)
 knuckles=sum((heads[N(side+' Finger'+str(k))] for k in range(1,5)),Vector())/4
 forward=(knuckles-heads[N(side+' Hand')]).normalized()
 across=heads[N(side+' Finger1')]-heads[N(side+' Finger4')]
 if side=='L':across.negate()
 dorsal=forward.cross(across).normalized()
 anatomicalPalms[side]=(knuckles-heads[N(side+' Hand')])*.7-dorsal*(.012*scale)
def RifleProps(index,positions,rotations):
 # A constant bind-axis calibration keeps captured wrist rotation and avoids
 # folding the hand at the cuff to satisfy a hard-coded palm orientation.
 palms={}
 for side in ['L','R']:
  q=(rotations[side+' Hand']@rest[N(side+' Hand')]).to_quaternion()@rifleWristCalibrations[side]
  delta=(q@rest[N(side+' Hand')].to_quaternion().inverted()).to_matrix()
  Put(side+' Hand',positions[side+' Hand'],delta.to_4x4())
  palm=anatomicalPalms[side]
  palms[side]=positions[side+' Hand']+delta@palm
 span=palms['L']-palms['R'];leftGrip=Vector((0,-.022,0))*scale
 d=leftGrip-rightGrip;remaining=span.length_squared-d.x*d.x-d.y*d.y
 if remaining<=0:raise ValueError(f'{clip}: hands too close for the rifle grip width')
 leftGrip.z=rightGrip.z-math.sqrt(remaining)
 localSpan=leftGrip-rightGrip
 up=(positions['Neck']-positions['Pelvis']).normalized()
 orientation=Basis(span,up)@Basis(localSpan,Vector((0,1,0))).transposed()
 matrix=orientation.to_4x4();matrix.translation=palms['R']-orientation@rightGrip;SetRifle(matrix)
 error=max((matrix@g-palms[s]).length for s,g in [('L',leftGrip),('R',rightGrip)])
 gripSamples.append({'frame':index+1,'supportGripZ':leftGrip.z,'gripError':error,'barrelDirection':list(orientation@Vector((0,0,-1)))})
 return error

def OtherProps(index,positions,rotations):
 if kind=='back':
  delta=rotations['Spine2'].to_3x3();z=-Vector((.45,0,.893)).normalized();x=Vector((0,1,0)).cross(z).normalized();matrix=(delta@Matrix((x,z.cross(x),z)).transposed()).to_4x4();matrix.translation=positions['Spine2']+delta@Vector((-.12,.16,-.30))*scale;SetRifle(matrix)
 elif kind=='carry':
  forward=rotations['Spine2'].to_3x3()@Vector((0,-1,0))
  for side,obj in zip(['L','R'],props):obj.location=positions[side+' Hand'];obj.rotation_quaternion=Vector((0,0,1)).rotation_difference(forward)
 elif kind=='grenade':
  # Release occurs in the existing selected take at the sharp wrist reversal.
  release=grenadeRelease
  if index<=release:grenade.location=positions['R Hand']
  else:
   # The game's projectile owns post-release motion, as in the original clip.
   grenade.scale=Vector((0,0,0));grenade.location=grenadeOrigin
 return 0
if kind=='grenade':
 # Script_InfantryFinalize's reviewed release is frame 130 of the same range.
 grenadeRelease=129
 grenadeOrigin=base[grenadeRelease]['positions']['R Hand']+Vector((0,0,lifts[grenadeRelease]))

# Finger articulation is a documented local addition, never evidence of GVHMR
# hand tracking. Keep the wrist-to-finger anatomical curl axis consistent.
def Fingers():
 for side in ['L','R']:
  forward=(heads[N(side+' Finger2')]-heads[N(side+' Hand')]).normalized();across=heads[N(side+' Finger1')]-heads[N(side+' Finger4')]
  if side=='L':across.negate()
  dorsal=forward.cross(across).normalized()
  for b in arm.pose.bones:
   if not b.name.startswith(N(side+' Finger')):continue
   if b.name in fingerReference:
    b.rotation_quaternion=fingerReference[b.name];continue
   child=next(iter(b.children),None);direction=(heads[child.name]-heads[b.name] if child else heads[b.name]-heads[b.parent.name]).normalized();axis=rest[b.name].to_3x3().inverted()@direction.cross(-dorsal).normalized()
   digit=b.name.rsplit('Finger',1)[1];joint=0 if len(digit)==1 else int(digit[-1]);grasp=kind in ['rifle','melee','carry','grenade']
   if kind=='grenade' and i>grenadeRelease:grasp=False
   angle=([46,64,38][joint] if grasp else 12) if not digit.startswith('0') else (26 if grasp else 10)
   b.rotation_quaternion=Quaternion(axis,math.radians(angle))

animationName=f'Animation_{faction}_{clip}_V{args.revision}';action=bpy.data.actions.new(animationName);action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
for obj in props:obj.animation_data_create();obj.animation_data.action=bpy.data.actions.new(animationName+'_'+obj.name);obj.animation_data.action.use_fake_user=True
scene.render.fps=60;scene.frame_start=1;scene.frame_end=count+1;previous={};samples=[]
for i in range(count+1):
 positions,rotations=Base(i,lifts[i]);Fingers()
 error=RifleProps(i,positions,rotations) if kind=='rifle' else Props(i,positions,rotations) if kind=='melee' else OtherProps(i,positions,rotations)
 bpy.context.view_layer.update();actual={p:arm.matrix_world@arm.pose.bones[N(p)].head for p in mapping}
 directionErrors={};lengthErrors={}
 for p,parent in sourceParent.items():
  measured=actual[p]-actual[parent];expected=Vector(motion['sourceRelativeJoints'][i][mapping[p]])-Vector(motion['sourceRelativeJoints'][i][mapping[parent]])
  directionErrors[p]=math.degrees(measured.angle(expected));lengthErrors[p]=abs(measured.length-lengths[p])
 points=MeshPoints();samples.append({'frame':i+1,'sourceFrame':motion['sourceFrameIndices'][i],'maxSegmentDirectionDegrees':max(directionErrors.values()),'maxSegmentLengthError':max(lengthErrors.values()),'directionErrors':directionErrors,
  'maxWristDisplacement':max((actual[s+' Hand']-positions[s+' Hand']).length for s in ['L','R']),
  'groundHeight':float(points[:,2].min()),'sourceClearance':motion['sourceClearance'][i]*ratio,'verticalTranslation':lifts[i],'gripError':error,
  'joints':[list(actual[parts[j]]) for j in range(22)]})
 for b in arm.pose.bones:
  if b.name in previous and b.rotation_quaternion.dot(previous[b.name])<0:b.rotation_quaternion.negate()
  previous[b.name]=b.rotation_quaternion.copy()
  for prop in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=prop,frame=i+1,group=b.name)
 for obj in props:
  if obj.name in previous and obj.rotation_quaternion.dot(previous[obj.name])<0:obj.rotation_quaternion.negate()
  previous[obj.name]=obj.rotation_quaternion.copy()
  for prop in ['location','rotation_quaternion','scale']:obj.keyframe_insert(data_path=prop,frame=i+1)
 if i%120==0:print(f'{faction} {clip} {i}/{count}',flush=True)
for act in [action]+[o.animation_data.action for o in props]:
 for layer in act.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.interpolation='LINEAR'
scene['sourceCache']=motion['sourceCache'];scene['sourceRange']=motion['range'];scene['reviewStatus']='Local review; not accepted for production'
scene['retargetPolicy']='Anatomical segment directions and original bind lengths; no arm/leg IK; whole-rig vertical surface adaptation'
scene.frame_set(1);bpy.ops.object.select_all(action='DESELECT')
for obj in [arm,body]+rifleParts+props:obj.hide_set(False);obj.hide_render=False;obj.select_set(True)
bpy.context.view_layer.objects.active=arm
path=out/(animationName+'.glb');blend=blendOut/f'Scene_{faction}_{clip}_V{args.revision}.blend'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_nla_strips_merged_animation_name=animationName,export_frame_range=True,export_force_sampling=True,export_anim_slide_to_zero=True,export_skins=True,export_yup=True,export_extras=True)
for img in bpy.data.images:
 if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
report={'status':'requires_visual_review','retargetScale':ratio,'samples':samples,'gripSamples':gripSamples,
 'maxDirectionErrorDegrees':max(s['maxSegmentDirectionDegrees'] for s in samples),'maxLengthErrorMeters':max(s['maxSegmentLengthError'] for s in samples),'maxWristDisplacementMeters':max(s['maxWristDisplacement'] for s in samples),
 'variants':[{'id':clip,'faction':faction,'path':path.relative_to(root).as_posix(),'clip':animationName,'blend':blend.relative_to(root).as_posix(),'sourceFrames':motion['range'],'loop':loop}]}
(out/f'Data_{faction}_{clip}_Validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
assert report['maxDirectionErrorDegrees']<.15,report['maxDirectionErrorDegrees']
assert report['maxLengthErrorMeters']<.00002,report['maxLengthErrorMeters']
assert report['maxWristDisplacementMeters']<.00002,report['maxWristDisplacementMeters']
print('DONE',faction,clip,'direction',report['maxDirectionErrorDegrees'],flush=True)
