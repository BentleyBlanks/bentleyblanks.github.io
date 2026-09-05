"""Blender MCP: package the new melee source, real weapon models and review scenes."""
from pathlib import Path
import bpy,json,base64,struct,math
from mathutils import Matrix,Vector,Euler
root=Path(globals()['MELEE_PROJECT_ROOT']) if globals().get('MELEE_PROJECT_ROOT') else Path(__file__).resolve().parents[1] if globals().get('__file__') else Path()
if not (root/'Data_MeleeCombat.mjs').is_file():raise RuntimeError('Set MELEE_PROJECT_ROOT to the repository Taierzhuang1938 directory')
scene=bpy.data.scenes['Scene_MeleeCombat'];bpy.context.window.scene=scene

def Material(name,color):
 material=bpy.data.materials.get(name) or bpy.data.materials.new(name);material.diffuse_color=(*color,1)
 material.use_nodes=True;shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1);shader.inputs['Roughness'].default_value=.65
 return material

def ImportWeapon(weaponId,name):
 parent=bpy.data.objects.new(name,None);scene.collection.objects.link(parent)
 doc=json.loads((root/'Model'/(weaponId+'.tzm.json')).read_text(encoding='utf-8'));nodes=[]
 for n in doc['nodes']:
  matrix=Matrix.Translation(Vector(n['t']))@Euler(n['r'],'YXZ').to_matrix().to_4x4()
  if n['parent']>=0:matrix=nodes[n['parent']]@matrix
  nodes.append(matrix)
  for index in n.get('meshes',[]):
   block=doc['meshes'][index];raw=base64.b64decode(block['pos']);positions=struct.unpack('<'+'H'*(len(raw)//2),raw)
   vertices=[matrix@Vector([block['posMin'][j]+positions[i+j]*block['posScale'][j] for j in range(3)]) for i in range(0,len(positions),3)]
   raw=base64.b64decode(block['idx']);step=block['idxBits']//8;indices=struct.unpack('<'+('I' if step==4 else 'H')*(len(raw)//step),raw)
   mesh=bpy.data.meshes.new(name+'Part'+str(index));mesh.from_pydata(vertices,[],[indices[i:i+3] for i in range(0,len(indices),3)]);mesh.update()
   obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj);obj.parent=parent
   key=block['material'];mesh.materials.append(Material('Material_Melee'+key,(.26,.12,.055) if key=='wood' else (.28,.3,.31)))
 return parent,doc

def Grip(arm,prefix,side):return sum(((arm.matrix_world@arm.pose.bones[prefix+side+' Finger'+str(i)].matrix).translation for i in range(1,5)),Vector())/4

for role,offset in [('Nra',-1),('Ija',1)]:
 arm=bpy.data.objects['Melee'+role];bpy.context.view_layer.update();arm.parent.location.x+=offset-arm.matrix_world.translation.x;bpy.context.view_layer.update()
 arm.animation_data_create()
 prefix='Bip002 ' if role=='Nra' else 'Bip001 '
 for weapon in ['Dadao','Bayonet']:
  obj=bpy.data.objects.get('Model_'+role+weapon)
  if not obj:
   obj,doc=ImportWeapon('Dadao' if weapon=='Dadao' else 'HanYang' if role=='Nra' else 'Type38','Model_'+role+weapon)
   if weapon=='Bayonet':
    bay,bayDoc=ImportWeapon('BayonetHanYang' if role=='Nra' else 'BayonetType38','Model_'+role+'BayonetBlade')
    muzzle=next(n['t'] for n in doc['nodes'] if n['name']=='muzzle')
    socket=next((n['t'] for n in bayDoc['nodes'] if n['name']=='socket'),[0,0,0]);bay.parent=obj;bay.location=Vector(muzzle)-Vector(socket)
  for actionId in ['Guard','Advance','Retreat','Light','LightAlt','Charge','Heavy','Parry','Deflected','Push','Pushed','Hit','Bind','BindWin','BindLose','Fall','Ground','GroundWin','GroundLose','Pressure','Rise']:
   name=weapon+actionId;arm.animation_data.action=bpy.data.actions['Animation_'+role+name]
   action=bpy.data.actions.get('Animation_'+role+'Weapon'+name)
   if action:bpy.data.actions.remove(action)
   action=bpy.data.actions.new('Animation_'+role+'Weapon'+name);action.use_fake_user=True;obj.animation_data_create();obj.animation_data.action=action
   for frame in range(1,32):
    scene.frame_set(frame);bpy.context.view_layer.update();right=Grip(arm,prefix,'R')
    forward=(Grip(arm,prefix,'L')-right) if weapon=='Bayonet' else (right-(arm.matrix_world@arm.pose.bones[prefix+'R Forearm'].matrix).translation)
    forward.normalize();z=-forward
    up=(arm.matrix_world@arm.pose.bones[prefix+'Neck'].matrix).translation-(arm.matrix_world@arm.pose.bones[prefix+'Pelvis'].matrix).translation
    x=up.cross(z).normalized();y=z.cross(x).normalized();matrix=Matrix((x,y,z)).transposed().to_4x4();matrix.translation=right
    obj.matrix_world=matrix;obj.rotation_mode='QUATERNION';obj.keyframe_insert('location',frame=frame);obj.keyframe_insert('rotation_quaternion',frame=frame)

def Light(owner,name,at,power,size):
 obj=bpy.data.objects.get(name)
 if not obj:
  data=bpy.data.lights.new(name,'AREA');obj=bpy.data.objects.new(name,data);owner.collection.objects.link(obj)
 obj.location=at;obj.rotation_euler=(Vector((0,0,.7))-obj.location).to_track_quat('-Z','Y').to_euler();obj.data.energy=power;obj.data.shape='DISK';obj.data.size=size

if not bpy.data.objects.get('Scene_MeleeStudioFloor'):
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));bpy.context.object.name='Scene_MeleeStudioFloor';bpy.context.object.data.materials.append(Material('Material_MeleeStudioFloor',(.18,.20,.20)))
camera=bpy.data.objects.get('Scene_MeleeReviewCamera')
if not camera:
 data=bpy.data.cameras.new('Scene_MeleeReviewCamera');camera=bpy.data.objects.new(data.name,data);scene.collection.objects.link(camera)
camera.location=(3,-6,2.8);camera.rotation_euler=(Vector((0,0,.82))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=50;scene.camera=camera
Light(scene,'Scene_MeleeKey',(-3,-4,6),1300,5);Light(scene,'Scene_MeleeFill',(4,0,4),900,4)
fps=bpy.data.scenes['Scene_FirstPersonMelee'];Light(fps,'Scene_MeleeFpKey',(-2,-2,3),450,3);Light(fps,'Scene_MeleeFpFill',(2,0,1),250,2)
for obj in fps.objects:
 if obj.type=='MESH' and obj.name.startswith(('Model_DadaoPart','Model_BayonetPart')):
  wood=obj.name in ['Model_DadaoPart0','Model_BayonetPart0']
  obj.data.materials.clear();obj.data.materials.append(Material('Material_MeleeFpWood' if wood else 'Material_MeleeFpSteel',(.18,.08,.035) if wood else (.28,.30,.32)))
for current in [scene,fps]:
 current.render.engine='CYCLES';current.cycles.samples=12;current.cycles.use_denoising=True
 current.render.resolution_x=1280;current.render.resolution_y=720;current.render.resolution_percentage=100
 current.frame_start=1;current.frame_end=31
 if not current.world:current.world=bpy.data.worlds.new('World_MeleeStudio')
 current.world.use_nodes=True;current.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.15,.18,1);current.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
for name in ['Script_CreateMeleeProject.py','Script_MeleeLibrary.py','Script_MeleeStudio.py','Script_MeleeAnimationBake.py','Script_MeleeFirstPersonBake.py']:
 text=bpy.data.texts.get(name) or bpy.data.texts.new(name);text.clear();text.write((root/'_blender'/name).read_text(encoding='utf-8'));text.use_fake_user=True
exec(compile((root/'_blender'/'Script_MeleeLibrary.py').read_text(encoding='utf-8'),'Script_MeleeLibrary.py','exec'))
SelectMeleeAction('FirstPerson','Dadao','Guard');SelectMeleeAction('Nra','Dadao','Guard');SelectMeleeAction('Ija','Bayonet','Guard')
for obj in list(bpy.data.objects):
 if obj.name.startswith('Icosphere'):bpy.data.objects.remove(obj,do_unlink=True)
for action in list(bpy.data.actions):
 if not action.name.startswith('Animation_') and action.users==int(action.use_fake_user):bpy.data.actions.remove(action)
for image in bpy.data.images:
 if image.source=='FILE' and image.has_data:image.pack()
scene.frame_set(1);scene.render.filepath=str(root/'_shots'/'Scene_MeleeBlenderSource.png')
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
result={'source':bpy.data.filepath,'scenes':[s.name for s in bpy.data.scenes],'bodyActions':len([a for a in bpy.data.actions if a.name.startswith(('Animation_NraDadao','Animation_NraBayonet','Animation_IjaDadao','Animation_IjaBayonet'))]),'firstPersonActions':len([a for a in bpy.data.actions if a.name.startswith(('Animation_FirstPersonDadao','Animation_FirstPersonBayonet'))])}
