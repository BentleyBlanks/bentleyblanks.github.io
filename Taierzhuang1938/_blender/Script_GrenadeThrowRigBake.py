"""Keep the repaired mesh and evaluated one-throw rig in the editable source."""
from pathlib import Path
import bpy,json,math
from mathutils import Matrix,Vector
root=Path(GRENADE_PROJECT_ROOT)
source=Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeThrow_20260916/Animation_GrenadeThrow.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
scene=bpy.context.scene
data=json.loads((root/'_shots/GrenadeThrow/Data_GrenadeTrace.json').read_text())
convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(root/'Model/Model_FpsHanYangHands.glb'))
arm=next(o for o in set(bpy.data.objects)-before if o.type=='ARMATURE')
arm.name='Model_GrenadeRepairedArms';arm.animation_data_clear()
normalize=lambda name:''.join(c for c in name.lower() if c.isalnum())
bones={normalize(b.name):b for b in arm.pose.bones}
for bone in bones.values():bone.rotation_mode='QUATERNION'
inverse=arm.matrix_world.inverted()
weapon=bpy.data.objects.new('Model_GrenadeThrowWeapon',None);scene.collection.objects.link(weapon)
weapon.rotation_mode='QUATERNION'
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(root/'Model/Model_Type24Grenade.glb'))
prop=bpy.data.objects.new('Model_GrenadeMount',None);scene.collection.objects.link(prop);prop.parent=weapon
prop.location=(0,.02,-.02);prop.rotation_euler=(math.pi/2-.35,0,0)
for obj in set(bpy.data.objects)-before:
    if obj!=prop and obj.parent is None:obj.parent=prop
ReadMatrix=lambda v:Matrix([v[i::4] for i in range(4)])
first=ReadMatrix(data['frames'][0]['weapon']).to_3x3();gram=first@first.transposed()
carrier=bpy.data.objects.new('Scene_GrenadeViewScale',None);scene.collection.objects.link(carrier)
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
    for obj in prop.children_recursive:
        if obj.type=='MESH':
            obj.hide_render=i/120>=.48 and i/120<=.85;obj.keyframe_insert('hide_render',frame=i+1)
arm.animation_data.action.name='Animation_GrenadeEvaluatedArms'
weapon.animation_data.action.name='Animation_GrenadeEvaluatedProp'
for obj in [arm,weapon]:
    for layer in obj.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:key.interpolation='LINEAR'
cam=bpy.data.cameras.new('Camera_Grenade');camera=bpy.data.objects.new(cam.name,cam);scene.collection.objects.link(camera)
camera.matrix_world=convert;cam.lens=36/(2*(1280/720)*math.tan(math.radians(55)/2));cam.clip_start=.01;scene.camera=camera
scene.render.resolution_x=1280;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.fps_base=.82
for img in bpy.data.images:
    if img.source=='FILE' and img.has_data and not img.packed_file:img.pack()
scene.frame_set(39)
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
result={'source':str(source),'bones':len(bones),'frames':len(data['frames'])}
