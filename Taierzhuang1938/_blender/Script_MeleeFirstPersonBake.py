"""Complete the Blender-authored carriers with the production grip IK's evaluated arm tracks.
Run Script_MeleeAnimationTest.mjs --bakefp, then run via Blender MCP once per MELEE_WEAPON.
The source .blend contains the editable carrier actions, all 53 bone channels and weapon geometry.
"""
from pathlib import Path
import json, math
import bpy
from mathutils import Matrix

root=Path(globals()['MELEE_PROJECT_ROOT']) if globals().get('MELEE_PROJECT_ROOT') else Path(__file__).resolve().parents[1] if globals().get('__file__') else Path()
if not (root/'Data_MeleeCombat.mjs').is_file():raise RuntimeError('Set MELEE_PROJECT_ROOT to the repository Taierzhuang1938 directory')
weapon=globals().get('MELEE_WEAPON','Dadao')
data=json.loads((root/'_shots'/'Data_MeleeFirstPersonBake.json').read_text(encoding='utf-8'))
arm=bpy.data.objects['MeleeFirstPerson']
scene=bpy.data.scenes.get('Scene_FirstPersonMelee') or bpy.data.scenes.new('Scene_FirstPersonMelee')
scene.render.fps=30
scene.frame_start=1;scene.frame_end=31
bpy.context.window.scene=scene
for obj in [arm,*arm.children]:
 for collection in list(obj.users_collection):collection.objects.unlink(obj)
 scene.collection.objects.link(obj)
convert=Matrix(((-1,0,0,0),(0,0,1,0),(0,1,0,0),(0,0,0,1)))
arm.animation_data_clear()
inverse=arm.matrix_world.inverted()
Normalize=lambda name: ''.join(c for c in name.lower() if c.isalnum())
bones={Normalize(b.name):b for b in arm.pose.bones}

def ReadMatrix(values):return Matrix([values[i::4] for i in range(4)])
def NewAction(obj,name):
 old=bpy.data.actions.get(name)
 if old:bpy.data.actions.remove(old)
 action=bpy.data.actions.new(name);action.use_fake_user=True
 obj.animation_data_create();obj.animation_data.action=action
 action['source']='BlenderMCP';action['weapon']=weapon
 return action
def KeyObject(obj,frame):
 obj.rotation_mode='QUATERNION'
 for channel in ['location','rotation_quaternion','scale']:obj.keyframe_insert(channel,frame=frame)
def Empty(name):
 obj=bpy.data.objects.get(name)
 if not obj:obj=bpy.data.objects.new(name,None);scene.collection.objects.link(obj)
 return obj

weaponRoot=Empty('Model_FirstPerson'+weapon)
if not weaponRoot.children:
 for i,entry in enumerate(data['weapons'][weapon]):
  mesh=bpy.data.meshes.new('Model_'+weapon+'Part'+str(i))
  values=entry['vertices'];vertices=[values[j:j+3] for j in range(0,len(values),3)]
  indices=entry['indices'];faces=[indices[j:j+3] for j in range(0,len(indices),3)]
  mesh.from_pydata(vertices,[],faces);mesh.update()
  obj=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(obj);obj.parent=weaponRoot
  material=bpy.data.materials.new('Material_'+weapon+str(i));c=entry['color']
  material.diffuse_color=(((c>>16)&255)/255,((c>>8)&255)/255,(c&255)/255,1)
  material.use_nodes=True;bsdf=material.node_tree.nodes.get('Principled BSDF')
  bsdf.inputs['Base Color'].default_value=material.diffuse_color;bsdf.inputs['Roughness'].default_value=.64
  mesh.materials.append(material)
carrier=Empty('Animation_CameraCarrier');grip=Empty('Animation_GripCarrier')
written=0
for name,frames in data['clips'].items():
 if not name.startswith(weapon):continue
 if globals().get('MELEE_ACTIONS') and name[len(weapon):] not in MELEE_ACTIONS:continue
 action=NewAction(arm,'Animation_FirstPerson'+name)
 NewAction(weaponRoot,'Animation_FirstPersonWeapon'+name)
 NewAction(carrier,'Animation_CameraCarrier'+name);NewAction(grip,'Animation_GripCarrier'+name)
 for i,entry in enumerate(frames):
  frame=i+1;scene.frame_set(frame)
  for boneName,values in zip(data['boneNames'],entry['bones']):
   bone=bones[Normalize(boneName)];bone.matrix=inverse@convert@ReadMatrix(values)
   bpy.context.view_layer.update();bone.rotation_mode='QUATERNION'
   for channel in ['location','rotation_quaternion','scale']:bone.keyframe_insert(channel,frame=frame)
  weaponRoot.matrix_world=convert@ReadMatrix(entry['weapon']);KeyObject(weaponRoot,frame)
  channels=entry['carrier'];carrier.location=channels[:3];carrier.rotation_mode='YXZ';carrier.rotation_euler=channels[3:6]
  grip.rotation_mode='YXZ';grip.rotation_euler=channels[6:9]
  carrier.keyframe_insert('location',frame=frame);carrier.keyframe_insert('rotation_euler',frame=frame);grip.keyframe_insert('rotation_euler',frame=frame)
 action.pose_markers.new('Start').frame=1;action.pose_markers.new('Contact').frame=10
 written+=1
camera=bpy.data.objects.get('Scene_FirstPersonCamera')
if not camera:
 cameraData=bpy.data.cameras.new('Scene_FirstPersonCamera');camera=bpy.data.objects.new(cameraData.name,cameraData);scene.collection.objects.link(camera)
camera.matrix_world=convert;camera.data.lens=24;camera.data.clip_start=.01;scene.camera=camera
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.get('World_MeleeFirstPerson') or bpy.data.worlds.new('World_MeleeFirstPerson');scene.world.color=(.18,.18,.18)
textName='Script_MeleeFirstPersonBake.py';text=bpy.data.texts.get(textName) or bpy.data.texts.new(textName);text.clear();text.write((root/'_blender'/textName).read_text(encoding='utf-8'));text.use_fake_user=True
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath,compress=True)
result={'weapon':weapon,'firstPersonActions':written,'bones':len(bones),'source':bpy.data.filepath}
