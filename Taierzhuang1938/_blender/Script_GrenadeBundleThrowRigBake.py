"""Keep the repaired arms and the evaluated bundle throw in the editable source.
Needs the trace Script_GrenadeThrowTest.mjs leaves in _shots/GrenadeThrow/Data_BundleTrace.json
(121 frames of bone and bundle matrices in camera space). Run with GRENADE_PROJECT_ROOT set,
in the task-owned instance, with the GrenadeBundleThrow_20261021 source open.
"""
from pathlib import Path
import bpy,json,math
from mathutils import Matrix,Vector
root=Path(GRENADE_PROJECT_ROOT)
source=Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeBundleThrow_20261021/Animation_GrenadeBundleThrow.blend'
if Path(bpy.data.filepath)!=source:
    raise RuntimeError('Open the task GrenadeBundleThrow_20261021 source before baking the evaluated rig')
scene=bpy.context.scene
for obj in list(bpy.data.objects):
    if obj.type in {'MESH','ARMATURE','CAMERA','LIGHT'} or obj.name.startswith(('Model_GrenadeBundle','Scene_GrenadeBundleViewScale')):
        bpy.data.objects.remove(obj,do_unlink=True)
data=json.loads((root/'_shots/GrenadeThrow/Data_BundleTrace.json').read_text())
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(root/'Model/Model_FpsHanYangHands.glb'))
arm=next(o for o in set(bpy.data.objects)-before if o.type=='ARMATURE')
arm.name='Model_GrenadeBundleRepairedArms';arm.animation_data_clear()
normalize=lambda name:''.join(c for c in name.lower() if c.isalnum())
bones={normalize(b.name):b for b in arm.pose.bones}
for bone in bones.values():bone.rotation_mode='QUATERNION'
inverse=arm.matrix_world.inverted()
weapon=bpy.data.objects.new('Model_GrenadeBundleThrowWeapon',None);scene.collection.objects.link(weapon)
weapon.rotation_mode='QUATERNION'
# Proxy of Script_Viewmodel BuildGrenadeBundle in its own group space (Tube runs along z):
# core head and six heads phi58 x 90 at z -.055, handle phi29 x 128 at z .054, cap, two ropes.
def Material(name,color,metal):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name);m.use_nodes=True
    bsdf=m.node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=color
    bsdf.inputs['Metallic'].default_value=metal;bsdf.inputs['Roughness'].default_value=.55;return m
steel=Material('Material_GrenadeBundleSteel',(.05,.055,.06,1),.6);wood=Material('Material_GrenadeBundleWood',(.30,.18,.09,1),0)
parts=[]
def Add(op,material,name,**kw):
    op(**kw);obj=bpy.context.active_object;obj.name=name;obj.data.materials.append(material)
    obj.parent=weapon;obj.matrix_parent_inverse=Matrix.Identity(4);parts.append(obj)
cyl=bpy.ops.mesh.primitive_cylinder_add
Add(cyl,steel,'Model_GrenadeBundleCore',radius=.029,depth=.090,vertices=12,location=(0,0,-.055))
for i in range(6):
    a=i/6*math.tau;Add(cyl,steel,f'Model_GrenadeBundleHead{i}',radius=.029,depth=.090,vertices=12,location=(math.cos(a)*.057,math.sin(a)*.057,-.055))
Add(cyl,wood,'Model_GrenadeBundleHandle',radius=.0145,depth=.128,vertices=10,location=(0,0,.054))
Add(cyl,steel,'Model_GrenadeBundleCap',radius=.016,depth=.012,vertices=10,location=(0,0,.112))
for z in (-.080,-.030):
    Add(bpy.ops.mesh.primitive_torus_add,wood,f'Model_GrenadeBundleRope{round(-z*1000)}',major_radius=.088,minor_radius=.005,major_segments=18,minor_segments=6,location=(0,0,z))
ReadMatrix=lambda v:Matrix([v[i::4] for i in range(4)])
first=ReadMatrix(data['frames'][0]['weapon']).to_3x3();gram=first@first.transposed()
carrier=bpy.data.objects.new('Scene_GrenadeBundleViewScale',None);scene.collection.objects.link(carrier)
carrier.matrix_world=convert@Matrix.Diagonal((*[math.sqrt(gram[i][i]) for i in range(3)],1))
weapon.parent=carrier;weapon.matrix_parent_inverse=Matrix.Identity(4)
bpy.context.view_layer.update()
for i,entry in enumerate(data['frames']):
    scene.frame_set(i+1)
    for name,values in zip(data['boneNames'],entry['bones']):
        bone=bones[normalize(name)];bone.matrix=inverse@convert@ReadMatrix(values)
        bpy.context.view_layer.update()
        for channel in ['location','rotation_quaternion','scale']:bone.keyframe_insert(channel,frame=i+1)
    weapon.matrix_world=convert@ReadMatrix(entry['weapon'])
    for channel in ['location','rotation_quaternion','scale']:weapon.keyframe_insert(channel,frame=i+1)
    for obj in parts:
        obj.hide_render=obj.hide_viewport=not entry['held']
        obj.keyframe_insert('hide_render',frame=i+1);obj.keyframe_insert('hide_viewport',frame=i+1)
arm.animation_data.action.name='Animation_GrenadeBundleEvaluatedArms'
weapon.animation_data.action.name='Animation_GrenadeBundleEvaluatedProp'
for obj in [arm,weapon]:
    for layer in obj.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'
cam=bpy.data.cameras.new('Camera_GrenadeBundle');camera=bpy.data.objects.new(cam.name,cam);scene.collection.objects.link(camera)
camera.matrix_world=convert;cam.lens=36/(2*(1280/720)*math.tan(math.radians(55)/2));cam.clip_start=.01;scene.camera=camera
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.fps_base=.82
world=bpy.data.worlds.get('World_GrenadeBundleStudio') or bpy.data.worlds.new('World_GrenadeBundleStudio');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.12,.16,.20,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.45
lightData=bpy.data.lights.new('Light_GrenadeBundleKey','AREA');lightData.energy=110;lightData.shape='DISK';lightData.size=2
light=bpy.data.objects.new(lightData.name,lightData);scene.collection.objects.link(light)
light.location=(-.8,-.4,1.3);light.rotation_euler=(Vector((0,.4,-.1))-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=16
for img in bpy.data.images:
    if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
scene.frame_set(37)
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
result={'source':str(source),'bones':len(bones),'frames':len(data['frames']),'parts':len(parts)}
print(json.dumps(result))
