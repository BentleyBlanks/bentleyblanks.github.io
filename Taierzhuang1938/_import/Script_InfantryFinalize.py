"""Join transition endpoints, attach editable grenade and package original-rig GLBs."""
from pathlib import Path
import bpy,json,base64,struct,math
from mathutils import Matrix,Vector
runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905'
output=runtime/'Deliverables';output.mkdir(exist_ok=True)
project=Path(globals().get('INFANTRY_PROJECT',Path(__file__).resolve().parents[1]))
clips=['RifleCrouchAdvance','StandToKneel','KneelHold','KneelToStand','GrenadeThrow']
def Curves(action):
 for layer in action.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    yield from bag.fcurves
def Smooth(t):t=max(0.,min(1.,t));return t*t*t*(10+t*(-15+6*t))
def Pose(obj):return (obj.location.copy(),obj.rotation_quaternion.copy(),obj.scale.copy())
def Apply(obj,pose,frame):
 obj.location,obj.rotation_quaternion,obj.scale=pose
 for path in ['location','rotation_quaternion','scale']:obj.keyframe_insert(data_path=path,frame=frame)
def Decode(data,kind):
 raw=base64.b64decode(data);return struct.unpack('<'+kind*(len(raw)//struct.calcsize(kind)),raw)
manifest=[]
exec(compile(Path(__file__).with_name('Script_InfantryExport.py').read_text(encoding='utf-8'),'InfantryExport','exec'))
for faction in ['Nra','Ija']:
 scene=bpy.data.scenes['Scene_'+faction+'InfantryActions'];bpy.context.window.scene=scene
 arm=bpy.data.objects['Rig_'+faction+'Infantry'];rifle=bpy.data.objects['Socket_'+faction+'InfantryRifle'];prefix='Bip002 ' if faction=='Nra' else 'Bip001 '
 # Exact common endpoint for stand-down / hold / get-up.
 name='Animation_'+faction+'_KneelHold';arm.animation_data.action=bpy.data.actions[name];rifle.animation_data.action=bpy.data.actions[name+'_Rifle'];scene.frame_set(1)
 anchor={b.name:Pose(b) for b in arm.pose.bones};weaponAnchor=Pose(rifle)
 for clip in ['StandToKneel','KneelToStand']:
  name='Animation_'+faction+'_'+clip;action=bpy.data.actions[name];arm.animation_data.action=action;rifle.animation_data.action=bpy.data.actions[name+'_Rifle']
  end=int(action.frame_range[1]);frames=range(end-12,end+1) if clip=='StandToKneel' else range(1,14)
  original=[]
  for frame in frames:scene.frame_set(frame);original.append((frame,{b.name:Pose(b) for b in arm.pose.bones},Pose(rifle)))
  for frame,poses,weapon in original:
   w=Smooth((frame-(end-12))/12) if clip=='StandToKneel' else 1-Smooth((frame-1)/12)
   for b in arm.pose.bones:
    a,z=poses[b.name],anchor[b.name];Apply(b,(a[0].lerp(z[0],w),a[1].slerp(z[1],w),a[2].lerp(z[2],w)),frame)
   a,z=weapon,weaponAnchor;Apply(rifle,(a[0].lerp(z[0],w),a[1].slerp(z[1],w),a[2].lerp(z[2],w)),frame)
 # The original game grenade mesh is a separate prop, never a new skin joint.
 prop=bpy.data.objects.get('Socket_'+faction+'InfantryGrenade')
 if not prop:
  prop=bpy.data.objects.new('Socket_'+faction+'InfantryGrenade',None);scene.collection.objects.link(prop)
  prop.parent=arm;prop.parent_type='BONE';prop.parent_bone=prefix+'R Hand';prop.rotation_mode='QUATERNION'
  data=json.loads((project/'Model/Grenade.tzm.json').read_text())
  for i,block in enumerate(data['meshes']):
   q=Decode(block['pos'],'H');ids=Decode(block['idx'],'I' if block['idxBits']==32 else 'H')
   vertices=[tuple(block['posMin'][j]+q[v*3+j]*block['posScale'][j] for j in range(3)) for v in range(block['count'])]
   mesh=bpy.data.meshes.new('Mesh_'+faction+'Grenade'+str(i));mesh.from_pydata(vertices,[],[ids[j:j+3] for j in range(0,len(ids),3)]);mesh.update()
   obj=bpy.data.objects.new('Model_'+faction+'Grenade'+str(i),mesh);scene.collection.objects.link(obj);obj.parent=prop
   mat=bpy.data.materials.new('Material_'+faction+'Grenade'+str(i));mat.diffuse_color=(.12,.14,.09,1) if block['material']!='wood' else (.18,.09,.045,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=mat.diffuse_color
   obj.data.materials.append(mat)
 for clip in clips:
  name='Animation_'+faction+'_'+clip;action=bpy.data.actions[name];arm.animation_data.action=action;rifle.animation_data.action=bpy.data.actions[name+'_Rifle'];end=int(action.frame_range[1])
  old=bpy.data.actions.get(name+'_Grenade')
  if old:bpy.data.actions.remove(old)
  pa=bpy.data.actions.new(name+'_Grenade');pa.use_fake_user=True;prop.animation_data_create();prop.animation_data.action=pa
  scene.frame_set(1);hand=arm.pose.bones[prefix+'R Hand'];reference=(arm.matrix_world@hand.matrix).to_quaternion()
  # Open the throwing hand immediately after the chosen release; preserve the recovered wrist.
  if clip=='GrenadeThrow':
   closed={b.name:b.rotation_quaternion.copy() for b in arm.pose.bones if ' R Finger' in b.name}
   for frame in range(1,end+1):
    scene.frame_set(frame);w=Smooth((frame-127)/8)*(1-Smooth((frame-206)/35))
    for n,q in closed.items():
     b=arm.pose.bones[n];b.rotation_quaternion=q.slerp(q.__class__((1,0,0,0)),w*.84);b.keyframe_insert(data_path='rotation_quaternion',frame=frame)
  for frame in range(1,end+1):
   scene.frame_set(frame);world=arm.matrix_world@hand.matrix
   rotation=world.to_quaternion()@reference.inverted()
   desired=rotation.to_matrix().to_4x4()@Matrix.Rotation(math.pi,4,'X')
   desired.translation=world.translation+world.to_3x3().col[0].normalized()*.064+world.to_3x3().col[1].normalized()*.012
   parent=prop.matrix_world@prop.matrix_basis.inverted() if abs(prop.matrix_basis.determinant())>1e-9 else None
   if parent is None:
    prop.scale=(1,1,1);bpy.context.view_layer.update();parent=prop.matrix_world@prop.matrix_basis.inverted()
   prop.matrix_basis=parent.inverted()@desired
   if clip!='GrenadeThrow' or frame>130:prop.scale*=.000001
   for path in ['location','rotation_quaternion','scale']:prop.keyframe_insert(data_path=path,frame=frame)
  for curve in Curves(pa):
   for key in curve.keyframe_points:
    key.interpolation='CONSTANT' if curve.data_path=='scale' else 'LINEAR'
  if clip=='GrenadeThrow':
   action['releaseFrame']=130;action['releaseTimeSeconds']=129/60
 # Root motion lives on the original GroundRoot; rifle and grenade follow the hierarchy.
 name='Animation_'+faction+'_RifleCrouchAdvance';base=bpy.data.actions[name]
 rootName=name+'RootMotion';old=bpy.data.actions.get(rootName)
 if old:bpy.data.actions.remove(old)
 moving=base.copy();moving.name=rootName;moving.use_fake_user=True;arm.animation_data.action=moving
 root=arm.pose.bones['GroundRoot'];inv=(arm.matrix_world@root.bone.matrix_local).to_3x3().inverted();speed=base['speedMps'];end=int(base.frame_range[1])
 for frame in range(1,end+1):root.location=inv@Vector((0,-speed*(frame-1)/60,0));root.keyframe_insert(data_path='location',frame=frame,group=root.name)
 for curve in Curves(moving):
  if 'GroundRoot' in curve.data_path and curve.data_path.endswith('.location'):
   for key in curve.keyframe_points:key.interpolation='LINEAR'
   for mod in curve.modifiers:
    if mod.type=='CYCLES':mod.mode_before='REPEAT_OFFSET';mod.mode_after='REPEAT_OFFSET'
 for suffix in ['_Rifle','_Grenade']:
  old=bpy.data.actions.get(rootName+suffix)
  if old:bpy.data.actions.remove(old)
  a=bpy.data.actions[name+suffix].copy();a.name=rootName+suffix;a.use_fake_user=True
 # Export only the selected actor and active actions, excluding the preview studio.
 for clip in clips+['RifleCrouchAdvanceRootMotion']:
  name='Animation_'+faction+'_'+clip;action=bpy.data.actions[name]
  arm.animation_data.action=action;rifle.animation_data.action=bpy.data.actions[name+'_Rifle'];prop.animation_data.action=bpy.data.actions[name+'_Grenade']
  scene.frame_start=1;scene.frame_end=int(action.frame_range[1]);scene.frame_set(1)
  bpy.ops.object.select_all(action='DESELECT')
  for obj in scene.objects:
   if not obj.name.startswith(('Scene_','Preview_')):obj.select_set(True)
  bpy.context.view_layer.objects.active=arm
  ExportInfantry(output/(name+'.glb'),name)
  manifest.append({'faction':faction,'clip':clip,'file':name+'.glb','fps':60,'gltfSampleRate':120 if clip=='GrenadeThrow' else 60,'frames':scene.frame_end,'durationSeconds':(scene.frame_end-1)/60,
   'loop':clip.startswith('RifleCrouch') or clip=='KneelHold','referenceSpeedMps':speed if clip.startswith('RifleCrouch') else 0,
   'releaseFrame':130 if clip=='GrenadeThrow' else None,'releaseTimeSeconds':129/60 if clip=='GrenadeThrow' else None})
 for a in [a for a in bpy.data.actions if a.name.startswith('Animation_'+faction)]:
  for curve in Curves(a):
   if 'Grenade' not in a.name:
    for key in curve.keyframe_points:key.interpolation='LINEAR'
 scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=640;scene.render.resolution_y=640
 scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
 scene['licenseScope']='Local noncommercial research; no production replacement; licensed weights external'
 scene['taskState']='Source-driven five-action set, corrected and exported'
 # A floor checker provides a visible spatial reference in the travelling preview.
 mat=bpy.data.objects['Scene_'+faction+'Floor'].data.materials[0];mat.use_nodes=True
 nodes=mat.node_tree.nodes;links=mat.node_tree.links
 checker=nodes.new('ShaderNodeTexChecker');geometry=nodes.new('ShaderNodeNewGeometry')
 checker.inputs['Color1'].default_value=(.07,.083,.095,1);checker.inputs['Color2'].default_value=(.095,.11,.125,1);checker.inputs['Scale'].default_value=4
 links.new(geometry.outputs['Position'],checker.inputs['Vector']);links.new(checker.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
for a in list(bpy.data.actions):
 if '_Raw' in a.name:bpy.data.actions.remove(a)
for image in bpy.data.images:
 if image.source=='FILE' and image.has_data and not image.packed_file:image.pack()
for path in Path(__file__).parent.glob('Script_Infantry*.py'):
 txt=bpy.data.texts.get(path.name) or bpy.data.texts.new(path.name);txt.clear();txt.write(path.read_text(encoding='utf-8'))
exec(compile(Path(__file__).with_name('Script_InfantrySelector.py').read_text(encoding='utf-8'),'InfantrySelector','exec'))
SelectInfantryClip('Nra','RifleCrouchAdvance')
(output/'Data_AnimationCatalog.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(output/'Scene_NraIjaInfantryActions.blend'),compress=True)
print('PACKAGED',len(manifest),'GLBs')
