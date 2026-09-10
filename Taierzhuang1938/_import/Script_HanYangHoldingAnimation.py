"""Author the single authorized holding loop from the reviewed grip pose.

One Blender Action with slots for the armature and weapon mount. No batch API.
FPS_POSE_PATH points to the reviewed static pose captured by the inspection tool.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector, Quaternion

scene=bpy.context.scene
assert scene.get('task')=='HanYangHands_20260910'
source=Path(bpy.data.filepath)
assert source.with_name('Animation_HanYangBeforeBareHands.blend').exists()
pose=json.loads(Path(globals().get('FPS_POSE_PATH',source.with_name('Data_HanYangHoldingPose.json'))).read_text(encoding='utf-8-sig'))
metadata=json.loads(scene['fpsAnimationMetadata'])
scene['fpsHoldingLocalPositions']=json.dumps({b['name']:b['local'][:3] for b in pose['bones']})
rig=bpy.data.objects['Rig_FpsArmsNraSkeletal01']
read=lambda values:Matrix([values[i::4] for i in range(4)])
normalize=lambda name:''.join(c for c in name.lower() if c.isalnum())
boneMap={normalize(b.name):b for b in rig.pose.bones}
poseMap={normalize(b['name']):b for b in pose['bones']}
convert=Matrix.Rotation(math.pi/2,4,'X')
inverse=rig.matrix_world.inverted()
matrices={}
for entry in metadata['bones']:
    bone=boneMap[normalize(entry['name'])]
    correction=bone.bone.matrix_local.inverted()@inverse@convert@read(entry['world'])
    matrices[bone.name]=inverse@convert@read(poseMap[normalize(entry['name'])]['matrix'])@correction.inverted()
# The complete previous source is archived above. The working file exposes one Action.
for obj in bpy.data.objects:obj.animation_data_clear()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
action=bpy.data.actions.new('Animation_FpsHanYangIdle')
action.use_fake_user=True;action['duration']=4.0;action['authorizedScope']='One HanYang holding loop'
def Bind(obj):
    slot=action.slots.new(id_type='OBJECT',name=obj.name)
    obj.animation_data_create();obj.animation_data.action=action;obj.animation_data.action_slot=slot
    obj['fpsIdleSlot']=slot.identifier
Bind(rig)
controls={}
for key,value in pose['controls'].items():
    obj=bpy.data.objects.get('Animation_Control_'+key)
    assert obj is not None,key
    obj.rotation_mode='QUATERNION'
    p=value['transform'];obj.location=p[:3];obj.rotation_quaternion=Quaternion((p[6],*p[3:6]));obj.scale=(1,1,1)
    if key=='bobPivot':obj.location=(0,0,0);obj.rotation_quaternion=Quaternion()
    controls[key]=obj
Bind(controls['weaponMount'])
weapon=bpy.data.objects['Preview_HanYang_weapon'];weapon.matrix_world=convert@read(pose['weapon'])
weaponBase=weapon.matrix_world.copy();Bind(weapon)
rig.data.pose_position='POSE'
for index in range(9):
    frame=1+index*30;phase=index*math.tau/8
    offset=Vector((.001*math.sin(phase),.0015*(1-math.cos(phase)),.0005*math.sin(phase)))
    sourceOffset=inverse.to_3x3()@(convert.to_3x3()@(offset/.70))
    shifted={name:Matrix.Translation(sourceOffset)@matrix for name,matrix in matrices.items()}
    for entry in metadata['bones']:
        bone=boneMap[normalize(entry['name'])]
        kwargs={} if entry['parent']<0 else {'parent_matrix':shifted[bone.parent.name],'parent_matrix_local':bone.parent.bone.matrix_local}
        bone.matrix_basis=bone.bone.convert_local_to_pose(shifted[bone.name],bone.bone.matrix_local,invert=True,**kwargs)
        bone.rotation_mode='QUATERNION'
        bone.keyframe_insert('location',frame=frame,group=bone.name)
        bone.keyframe_insert('rotation_quaternion',frame=frame,group=bone.name)
    mount=controls['weaponMount'];mount.location=Vector(pose['controls']['weaponMount']['transform'][:3])+offset
    mount.keyframe_insert('location',frame=frame)
    weapon.matrix_world=Matrix.Translation(convert.to_3x3()@(offset/.70))@weaponBase
    weapon.keyframe_insert('location',frame=frame)
for layer in action.layers:
    for strip in layer.strips:
        for bag in strip.channelbags:
            for curve in bag.fcurves:
                for key in curve.keyframe_points:key.interpolation='BEZIER';key.handle_left_type='AUTO_CLAMPED';key.handle_right_type='AUTO_CLAMPED'
# Reuse only static visibility/state, replacing the obsolete control metadata.
original=metadata['weapons']['HanYang']['clips']['Idle']
for frame in original['frames']:
    frame['controls']={key:value['transform'] for key,value in pose['controls'].items()}
    frame['visible']={key:value['visible'] for key,value in pose['controls'].items()}
    frame['state']=[0,0];frame['contact']=[1,1]
metadata['weapons']['HanYang']['clips']={'Idle':original}
scene['fpsAnimationMetadata']=json.dumps(metadata,separators=(',',':'))
scene.render.fps=60;scene.frame_start=1;scene.frame_end=241;scene.frame_set(1)
bpy.context.view_layer.update()
bpy.ops.wm.save_as_mainfile(filepath=str(source))
assert len(bpy.data.actions)==1
result={'actions':1,'clip':action.name,'seconds':4,'keysPerChannel':9,'source':str(source)}
