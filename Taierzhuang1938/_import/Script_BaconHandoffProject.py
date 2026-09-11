"""Assemble the evaluated original rigs into the task's editable Blender scene."""
import bpy, os, json, math
from mathutils import Quaternion, Vector
source=r'C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\BaconHandoff'
assert bpy.data.filepath==os.path.join(source,'Scene_BaconHandoff.blend')
scene=bpy.context.scene
keep={o for o in scene.objects if o.name.startswith(('Control_','Model_CuredPork','Reference_CuredPork'))}
for obj in list(scene.objects):
    if obj not in keep: bpy.data.objects.remove(obj,do_unlink=True)
for role in ['Giver','Receiver']:
    before=set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(source,'Animation_Bacon'+role+'OriginalRig.glb'))
    added=set(scene.objects)-before
    for obj in added:
        if obj.type=='ARMATURE':
            obj.name='Actor_Bacon'+role
            obj.show_in_front=True
        if obj.animation_data and obj.animation_data.nla_tracks:
            tracks=list(obj.animation_data.nla_tracks)
            strip=tracks[0].strips[0]
            obj.animation_data.action=strip.action
            if hasattr(obj.animation_data,'action_slot'): obj.animation_data.action_slot=strip.action_slot
            for track in tracks: track.mute=True
        if obj.name.startswith('Icosphere'):
            obj.hide_render=True;obj.hide_viewport=True
data=json.load(open(os.path.join(source,'Data_OriginalRigPerformance.json'),encoding='utf-8'))
scene.render.fps=60;scene.frame_start=1;scene.frame_end=337
conversion=Quaternion((1,0,0),math.pi/2)
for role,name in [('whole','Model_CuredPorkWhole'),('slice','Model_CuredPorkSlice')]:
    obj=bpy.data.objects[name];obj.animation_data_clear();obj.rotation_mode='QUATERNION'
    for row in data:
        pose=row[role];p=pose['position'];q=pose['rotation'];frame=1+row['seconds']*60
        obj.location=(p[0],-p[2],p[1]);obj.rotation_quaternion=conversion@Quaternion((q[3],q[0],q[1],q[2]))@conversion.inverted()
        obj.scale=(1,1,1) if pose['visible'] else (0,0,0)
        for prop in ['location','rotation_quaternion','scale']: obj.keyframe_insert(data_path=prop,frame=frame)
    obj.animation_data.action.name='Animation_Bacon'+role.title()
for obj in keep:
    if obj.type=='EMPTY': obj.hide_render=True;obj.hide_set(True)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.012))
floor=bpy.context.object;floor.name='Scene_ReviewFloor'
mat=bpy.data.materials.new('Material_ReviewFloor');mat.diffuse_color=(.15,.18,.20,1);floor.data.materials.append(mat)
for name,position,energy,size in [('Key',(2,-2,4),350,3),('Fill',(-2,-1,3),220,2),('Rim',(0,2,3),300,2)]:
    light=bpy.data.lights.new('Light_'+name,'AREA');light.energy=energy;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new('Light_'+name,light);scene.collection.objects.link(obj);obj.location=position
    obj.rotation_euler=(Vector((0,-.4,1.1))-obj.location).to_track_quat('-Z','Y').to_euler()
camData=bpy.data.cameras.new('Camera_BaconReview');cam=bpy.data.objects.new('Camera_BaconReview',camData);scene.collection.objects.link(cam)
cam.location=(1.8,-2.9,2.05);cam.rotation_euler=(Vector((0,-.55,1.05))-cam.location).to_track_quat('-Z','Y').to_euler()
camData.lens=45;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=1280;scene.render.resolution_y=960;scene.render.resolution_percentage=100
scene.frame_set(124)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(source,'Scene_BaconHandoff.blend'))
print(json.dumps({'source':bpy.data.filepath,'armatures':[(o.name,len(o.pose.bones),bool(o.animation_data and o.animation_data.action)) for o in scene.objects if o.type=='ARMATURE']}))
