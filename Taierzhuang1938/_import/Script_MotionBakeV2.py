"""Blender batch: original bind retarget, measured contact anchors, editable revisions."""
from pathlib import Path
import sys,argparse,json,math
import bpy,numpy as np
from mathutils import Matrix,Vector
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);parser.add_argument('--faction',default='Nra');parser.add_argument('--clip',required=True);parser.add_argument('--revision',type=int,choices=[2,3],default=2)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=args.root;faction=args.faction;clip=args.clip;revision=args.revision
runtime=root/'Models/_Cache/ReviewV2';out=root/f'Models/ReviewV{revision}';blendOut=root/f'Blender/ReviewV{revision}';out.mkdir(parents=True,exist_ok=True);blendOut.mkdir(parents=True,exist_ok=True)
archive=json.loads((root/'Data_ArchiveManifest.json').read_text(encoding='utf-8'))['records']
preparation=root/next(r['path'] for r in archive if r['source'].replace('\\','/').endswith('InfantryActions_20260905/Scene_InfantryPreparation.blend'))
fingerReference={}
if revision>=3:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(root/f'Models/SourceCharacters/Model_Lugou{faction}01.glb'))
 referenceArm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
 referenceAction=bpy.data.actions['RifleRun'];referenceArm.animation_data.action=referenceAction;referenceArm.animation_data.action_slot=referenceAction.slots[0]
 bpy.context.scene.frame_set(1);bpy.context.view_layer.update()
 fingerReference={b.name:b.matrix_basis.to_quaternion().copy() for b in referenceArm.pose.bones if 'Finger' in b.name}
bpy.ops.wm.open_mainfile(filepath=str(preparation))
scene=bpy.data.scenes['Scene_'+faction+'InfantryActions'];bpy.context.window.scene=scene
for other in list(bpy.data.scenes):
 if other!=scene:bpy.data.scenes.remove(other)
arm=bpy.data.objects['Rig_'+faction+'Infantry'];body=bpy.data.objects['Model_'+faction+'InfantryBody'];rifle=bpy.data.objects['Socket_'+faction+'InfantryRifle']
if revision>=3:
 exec(compile(Path(__file__).with_name('Script_InfantryCompleteRifle.py').read_text(encoding='utf-8'),'CompleteRifle','exec'))
 CompleteRifle(root,faction,rifle)
for mat in body.data.materials:
 if mat and mat.use_nodes:
  for node in mat.node_tree.nodes:
   if node.type=='BSDF_PRINCIPLED':
    for name,value in [('Metallic',0),('Roughness',.8)]:
     for link in list(node.inputs[name].links):mat.node_tree.links.remove(link)
     node.inputs[name].default_value=value
prefix='Bip002 ' if faction=='Nra' else 'Bip001 ';N=lambda p:prefix+p
motion=json.loads((runtime/f'Data_{clip}Motion.json').read_text());count=motion['cycleFrames'];kind=motion['kind'];loop=motion['loop']
mapping={'Pelvis':0,'Spine':3,'Spine1':6,'Spine2':9,'Neck':12,'Head':15,'L Thigh':1,'R Thigh':2,'L Calf':4,'R Calf':5,'L Foot':7,'R Foot':8,'L Toe0':10,'R Toe0':11,'L Clavicle':13,'R Clavicle':14,'L UpperArm':16,'R UpperArm':17,'L Forearm':18,'R Forearm':19,'L Hand':20,'R Hand':21}
rest={b.name:(arm.matrix_world@b.matrix_local).copy() for b in arm.data.bones};heads={n:m.translation.copy() for n,m in rest.items()};inverse=arm.matrix_world.inverted()
leg=(heads[N('L Calf')]-heads[N('L Thigh')]).length+(heads[N('L Foot')]-heads[N('L Calf')]).length;ratio=leg/motion['sourceLegLength'];scale=heads[N('Pelvis')].z/.942464
alignment={}
for side in ['L','R']:
 for part,child in [('Thigh','Calf'),('Calf','Foot'),('UpperArm','Forearm'),('Forearm','Hand')]:
  name,childName=side+' '+part,side+' '+child;delta=Vector(motion['sourceRestJoints'][mapping[childName]])-Vector(motion['sourceRestJoints'][mapping[name]])
  alignment[name]=(heads[N(childName)]-heads[N(name)]).rotation_difference(delta).to_matrix().to_4x4()
 alignment[side+' Hand']=alignment[side+' Forearm']
for obj in scene.objects:
 if obj.animation_data:obj.animation_data_clear()
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4);b.rotation_mode='QUATERNION'
bpy.context.view_layer.update()
shoeIds={}
for side in ['L','R']:
 groups={g.index for g in body.vertex_groups if g.name in [N(side+' Foot'),N(side+' Toe0')]}
 shoeIds[side]=[v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>.55]
def MeshPoints():
 bpy.context.view_layer.update();evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh()
 points={s:[evaluated.matrix_world@mesh.vertices[i].co for i in ids] for s,ids in shoeIds.items()};evaluated.to_mesh_clear();return points
restPoints=MeshPoints();markerIds={s:[i for i,p in enumerate(ps) if p.z<min(v.z for v in ps)+.018] for s,ps in restPoints.items()}
kneeIds=[v.index for v in body.data.vertices if (body.matrix_world@v.co-heads[N('R Calf')]).length<.095]
def KneeMin():
 bpy.context.view_layer.update();evaluated=body.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=evaluated.to_mesh();height=min((evaluated.matrix_world@mesh.vertices[i].co).z for i in kneeIds);evaluated.to_mesh_clear();return height
def Marker(points,side):return sum((points[i] for i in markerIds[side]),Vector())/len(markerIds[side])
desired={}
def Put(part,point,delta):
 matrix=delta@rest[N(part)];matrix.translation=point;desired[N(part)]=inverse@matrix;bone=arm.pose.bones[N(part)];parent=bone.parent
 parentMatrix=desired.get(parent.name,parent.matrix) if parent else Matrix.Identity(4)
 bone.matrix_basis=bone.bone.convert_local_to_pose(desired[bone.name],bone.bone.matrix_local,parent_matrix=parentMatrix,parent_matrix_local=parent.bone.matrix_local if parent else Matrix.Identity(4),invert=True)
def Base(index,drop=0):
 desired.clear();rotations={p:Matrix(motion['rotations'][index][j]).to_4x4()@alignment.get(p,Matrix.Identity(4)) for p,j in mapping.items()}
 positions={};pelvis=Vector(motion['rootOffsets'][index])*ratio;pelvis.z+=.032*scale-drop
 for bone in arm.pose.bones:
  if bone.name not in [N(p) for p in mapping]:continue
  part=bone.name[len(prefix):];parent=bone.parent.name[len(prefix):] if bone.parent and bone.parent.name.startswith(prefix) else None
  if part=='Pelvis':point=pelvis
  elif 'Thigh' in part:point=pelvis+rotations['Pelvis'].to_3x3()@(heads[N(part)]-heads[N('Pelvis')])
  else:point=positions[parent]+rotations[parent].to_3x3()@(heads[N(part)]-heads[N(parent)])
  positions[part]=point;Put(part,point,rotations[part])
 for b in arm.pose.bones:
  if 'Finger' in b.name:
   if b.name in fingerReference and kind in ['rifle','kneel'] and (' L ' in b.name or 'Finger0' in b.name):
    b.rotation_quaternion=fingerReference[b.name];continue
   side='L' if ' L ' in b.name else 'R';direction=rest[b.name].to_3x3().col[0].normalized();normal=rest[N(side+' Hand')].to_3x3().col[1].normalized();axis=rest[b.name].to_3x3().inverted()@direction.cross(normal)
   digit=b.name.rsplit('Finger',1)[1];joint=0 if len(digit)==1 else int(digit[-1]);angle=([.55,.6,.45][joint] if digit.startswith('0') else [1.05,.95,.6][joint]) if kind!='limp' else .25
   if revision>=3 and kind in ['rifle','kneel'] and side=='R' and not digit.startswith('0'):angle=([.35,.45,.25] if digit.startswith('1') else [1.05,1.05,.65])[joint]
   b.rotation_quaternion=Matrix.Rotation(angle,4,axis).to_quaternion()
 return positions,rotations
def Solve(upper,lower,tip,start,target,pole,rotations):
 a=(heads[N(lower)]-heads[N(upper)]).length;b=(heads[N(tip)]-heads[N(lower)]).length;delta=target-start;distance=max(.001,min(delta.length,a+b-.002));axis=delta.normalized();target=start+axis*distance
 along=(a*a-b*b+distance*distance)/(2*distance);bend=pole-axis*pole.dot(axis)
 if bend.length<.001:bend=Vector((0,-1,0));bend-=axis*bend.dot(axis)
 middle=start+axis*along+bend.normalized()*math.sqrt(max(0,a*a-along*along))
 for part,child,p,end in [(upper,lower,start,middle),(lower,tip,middle,target)]:
  source=rotations[part].to_3x3()@(heads[N(child)]-heads[N(part)]);Put(part,p,source.rotation_difference(end-p).to_matrix().to_4x4()@rotations[part])
 return target,middle
def Foot(side,point,rotations):
 Put(side+' Foot',point,rotations[side+' Foot']);Put(side+' Toe0',point+rotations[side+' Foot'].to_3x3()@(heads[N(side+' Toe0')]-heads[N(side+' Foot')]),rotations[side+' Toe0'])
travel=Vector(motion['sourceTravelMeters'])*ratio;travel.z=0
base=[]
for i in range(count+1):
 positions,rotations=Base(i);points=MeshPoints()
 base.append({'positions':{p:v.copy() for p,v in positions.items()},'rotations':rotations,'marker':{s:Marker(ps,s) for s,ps in points.items()},'sole':{s:min(v.z for v in ps) for s,ps in points.items()}})
weights=np.array(motion['contactWeights']);anchors={s:{} for s in ['L','R']}
for si,side in enumerate(['L','R']):
 mask=weights[:,si]>.45;n=count if loop else count+1
 # Unwrap support intervals crossing a gait boundary before measuring one anchor.
 pivot=next((i for i in range(n) if not mask[i]),0) if loop else 0;ordered=[(pivot+j)%n for j in range(n)];segments=[];segment=[]
 for t,i in enumerate(ordered):
  if mask[i]:segment.append((i,pivot+t))
  elif segment:segments.append(segment);segment=[]
 if segment:segments.append(segment)
 for segment in segments:
  world=[]
  for i,unwrapped in segment:world.append(base[i]['marker'][side]+(travel*(unwrapped/count) if loop else Vector()))
  anchor=Vector(np.median(np.array(world),axis=0));anchor.z=.004
  for i,unwrapped in segment:anchors[side][i]=anchor-(travel*(unwrapped/count) if loop else Vector())
 if loop:anchors[side][count]=anchors[side].get(0,base[0]['marker'][side])
def Targets(index):
 result={}
 for si,s in enumerate(['L','R']):
  b=base[index];weight=float(weights[index,si]);marker=b['marker'][s];anchor=anchors[s].get(index,marker);ankle=b['positions'][s+' Foot'].copy()
  ankle.x+=(anchor.x-marker.x)*weight;ankle.y+=(anchor.y-marker.y)*weight
  # Keep recovered swing clearance. Ground correction applies to actual support.
  ankle.z+=max(0,.004-b['sole'][s])+(min(0,.004-b['sole'][s]))*weight
  result[s]=ankle
 return result
def Basis(direction,normal):
 x=direction.normalized();y=(normal-x*normal.dot(x)).normalized();z=x.cross(y).normalized();return Matrix((x,y,z)).transposed()
def Hand(side,point,direction,normal,positions,rotations):
 source=Basis(rest[N(side+' Hand')].to_3x3().col[0],rest[N(side+' Hand')].to_3x3().col[1]);delta=(Basis(direction,normal)@source.transposed()).to_4x4()
 palm=rest[N(side+' Hand')].to_3x3().col[0].normalized()*(.065*scale)+rest[N(side+' Hand')].to_3x3().col[1].normalized()*(.015*scale)
 wrist=point-delta.to_3x3()@palm;shoulder=positions[side+' UpperArm'];pole=positions[side+' Forearm']-shoulder
 wrist,_=Solve(side+' UpperArm',side+' Forearm',side+' Hand',shoulder,wrist,pole,rotations);Put(side+' Hand',wrist,delta)
 return (wrist+delta.to_3x3()@palm-point).length
def SetRifle(matrix):
 bpy.context.view_layer.update();parent=rifle.matrix_world@rifle.matrix_basis.inverted();rifle.matrix_basis=parent.inverted()@matrix;rifle.rotation_mode='QUATERNION'
rifleParts=[o for o in scene.objects if o==rifle or o.parent==rifle]
for obj in rifleParts:obj.hide_render=kind in ['carry','limp'];obj.hide_set(kind in ['carry','limp'])
handles=[]
if kind=='carry':
 for side in ['L','R']:
  bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.018,depth=.5);handle=bpy.context.object;handle.name='Prop_'+side+'StretcherGrip';handle.rotation_euler.x=math.pi/2
  mat=bpy.data.materials.new('Material_WoodGrip'+side);mat.diffuse_color=(.28,.18,.08,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=mat.diffuse_color;handle.data.materials.append(mat);handles.append(handle)
def Props(index,positions,rotations):
 errors=[]
 if kind=='carry':
  # A shared horizontal support, with restrained load bob; both bearers use the same phase.
  height=(.984 if faction=='Nra' else .91)+.004*math.cos(index/count*math.tau)
  for side,handle in zip(['L','R'],handles):
   point=Vector(((.27 if side=='L' else -.27)*scale,.065*scale,height));handle.location=point
   errors.append(Hand(side,point,Vector((0,-.1,-1)),Vector((1 if side=='L' else -1,0,0)),positions,rotations))
 elif kind in ['rifle','kneel'] and revision>=3:
  # A shoulder stock contact determines the prop; fingers are separately posed.
  # Source shoulder and elbow planes drive heading and bounded arm IK.
  up=Vector((0,0,1));shoulderSpan=positions['L UpperArm']-positions['R UpperArm'];forward=Vector((shoulderSpan.y,-shoulderSpan.x,0)).normalized()
  left=Vector((-forward.y,forward.x,0)).normalized();z=-forward;x=up.cross(z).normalized();y=z.cross(x).normalized()
  orientation=Matrix((x,y,z)).transposed();matrix=orientation.to_4x4()
  origin=positions['R UpperArm']+forward*(.23*scale)+left*(.045*scale)+up*(.035*scale)
  localGrips={'R':Vector((.020*scale,-.045*scale,.055*scale)),'L':Vector((0,-.022*scale,-.16*scale))}
  localDirections={'R':Vector((0,.35,-.9367)).normalized(),'L':Vector((1,0,0))}
  localNormals={'R':Vector((-1,0,0)),'L':Vector((0,1,0))}
  directions={side:orientation@localDirections[side] for side in ['L','R']};normals={side:orientation@localNormals[side] for side in ['L','R']}
  matrix.translation=origin;SetRifle(matrix)
  for side in ['L','R']:errors.append(Hand(side,matrix@localGrips[side],directions[side],normals[side],positions,rotations))
 elif kind in ['rifle','kneel']:
  up=Vector((0,0,1));forward=rotations['Spine2'].to_3x3()@Vector((0,-1,0));forward.z*=.25;forward.normalize();right=Vector((-forward.y,forward.x,0)).normalized()
  # Fit the shoulder stock to the original short-arm proportions. The support
  # palm grips the wooden fore-end, closer than the source asset's distant marker.
  point=positions['R UpperArm']+forward*(.12*scale)+right*(.1*scale)-up*(.09*scale)
  z=-forward;x=up.cross(z).normalized();y=z.cross(x).normalized();matrix=Matrix((x,y,z)).transposed().to_4x4();matrix.translation=point;SetRifle(matrix)
  for side in ['L','R']:
   grip=point if side=='R' else matrix@Vector((0,-.012,-.245*scale))
   errors.append(Hand(side,grip,(forward*.4+up*.9165).normalized() if side=='R' else forward,right if side=='R' else up,positions,rotations))
 return max(errors or [0])
action=bpy.data.actions.new('Animation_'+faction+'_'+clip+f'_V{revision}');action.use_fake_user=True;arm.animation_data_create();arm.animation_data.action=action
rifle.animation_data_create();rifle.animation_data.action=bpy.data.actions.new(action.name+'_Rifle');rifle.animation_data.action.use_fake_user=True
scene.render.fps=60;scene.frame_start=1;scene.frame_end=count+1;previous={};samples=[]
for i in range(count+1):
 index=0 if loop and i==count else i;targets=Targets(index);drop=0
 for s in ['L','R']:
  hip=base[index]['positions'][s+' Thigh'];target=targets[s];a=(heads[N(s+' Calf')]-heads[N(s+' Thigh')]).length;b=(heads[N(s+' Foot')]-heads[N(s+' Calf')]).length;horizontal=(hip.x-target.x)**2+(hip.y-target.y)**2
  drop=max(drop,hip.z-target.z-math.sqrt(max(.01,(a+b-.004)**2-horizontal)))
 positions,rotations=Base(index,drop)
 if kind=='kneel':
  def Ease(t):t=max(0,min(1,t));return t*t*(3-2*t)
  sourceFrame=motion['sourceFrameIndices'][index];kneeWeight=Ease((sourceFrame-48)/16)*(1-Ease((sourceFrame-107)/17))
  if kneeWeight>0:
   for iteration in range(5):
    positions,rotations=Base(index,drop)
    for side in ['L','R']:
     ankle,_=Solve(side+' Thigh',side+' Calf',side+' Foot',positions[side+' Thigh'],targets[side],positions[side+' Calf']-positions[side+' Thigh'],rotations);Foot(side,ankle,rotations)
    height=KneeMin()
    if iteration==0:desiredKnee=height*(1-kneeWeight)+.006*kneeWeight
    drop+=max(-.03,min(.045,(height-desiredKnee)*.9))
   positions,rotations=Base(index,drop)
 for side in ['L','R']:
  ankle,_=Solve(side+' Thigh',side+' Calf',side+' Foot',positions[side+' Thigh'],targets[side],positions[side+' Calf']-positions[side+' Thigh'],rotations);Foot(side,ankle,rotations)
 points=MeshPoints()
 # One geometric sole pass compensates original skin thickness after the IK solve.
 for si,side in enumerate(['L','R']):
  sole=min(v.z for v in points[side]);correction=max(0,.004-sole)+min(0,.004-sole)*weights[index,si]
  target=targets[side]+Vector((0,0,correction));ankle,_=Solve(side+' Thigh',side+' Calf',side+' Foot',positions[side+' Thigh'],target,positions[side+' Calf']-positions[side+' Thigh'],rotations);Foot(side,ankle,rotations)
 gripError=Props(index,positions,rotations);points=MeshPoints()
 samples.append({'frame':i+1,'sourceFrame':motion['sourceFrameIndices'][index],'soles':{s:min(v.z for v in ps) for s,ps in points.items()},'markers':{s:list(Marker(ps,s)) for s,ps in points.items()},'contactWeights':weights[index].tolist(),'gripError':gripError,'wristDeviation':{s:(arm.matrix_world@arm.pose.bones[N(s+' Hand')].head-positions[s+' Hand']).length for s in ['L','R']},'pelvisDrop':drop,'kneeHeight':KneeMin() if kind=='kneel' else None})
 for b in arm.pose.bones:
  q=b.rotation_quaternion.copy()
  if b.name in previous and q.dot(previous[b.name])<0:q.negate()
  b.rotation_quaternion=q;previous[b.name]=q.copy()
  for path in ['location','rotation_quaternion','scale']:b.keyframe_insert(data_path=path,frame=i+1,group=b.name)
 for obj in [rifle]+handles:
  for path in ['location','rotation_quaternion' if obj==rifle else 'rotation_euler','scale']:obj.keyframe_insert(data_path=path,frame=i+1)
 if i%60==0:print(f'{faction} {clip} {i}/{count}',flush=True)
for act in bpy.data.actions:
 for layer in act.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.interpolation='LINEAR'
scene['motionRevision']=f'ReviewV{revision}';scene['sourceClip']=clip;scene['sourceRange']=motion['range'];scene['reviewStatus']='Local review; not accepted for production'
scene.frame_set(1);bpy.ops.object.select_all(action='DESELECT')
for obj in [arm,body]+handles+([] if kind in ['carry','limp'] else rifleParts):obj.hide_set(False);obj.select_set(True)
bpy.context.view_layer.objects.active=arm
exec(compile(Path(__file__).with_name('Script_InfantryExport.py').read_text(encoding='utf-8'),'ExportInfantry','exec'))
variants=[]
segments=[(clip,1,count+1)] if clip!='KneelSequence' else [('StandToKneel',1,105),('KneelHold',105,167),('KneelToStand',167,261),('KneelSequence',1,261)]
blendPath=blendOut/f'Scene_{faction}_{clip}_V{revision}.blend'
for name,start,end in segments:
 scene.frame_start=start;scene.frame_end=end;animationName='Animation_'+faction+'_'+name+f'_V{revision}';path=out/(animationName+'.glb');ExportInfantry(path,animationName)
 variants.append({'id':name,'faction':faction,'path':path.relative_to(root).as_posix(),'clip':animationName,'blend':blendPath.relative_to(root).as_posix(),'sourceFrames':[motion['sourceFrameIndices'][start-1],motion['sourceFrameIndices'][end-1]],'loop':loop or name=='KneelHold'})
scene.frame_start=1;scene.frame_end=count+1;scene.frame_set(1)
for img in bpy.data.images:
 if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(blendPath),compress=True)
(out/f'Data_{faction}_{clip}_Validation.json').write_text(json.dumps({'status':'requires_visual_review','variants':variants,'samples':samples,'maxGripError':max(s['gripError'] for s in samples),'minSoleHeight':min(h for s in samples for h in s['soles'].values())},indent=2),encoding='utf-8')
print('DONE',faction,clip,flush=True)
