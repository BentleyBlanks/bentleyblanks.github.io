"""Apply one runtime correction clip to the isolated editable game-integration .blend.

Read Data_GamePoseCorrections.json in the user's GVHMR/GameIntegration folder.
INFANTRY_GAME_FACTION and INFANTRY_GAME_CLIP scope each BlenderMCP call.
"""
from pathlib import Path
import json, math
import bpy
from mathutils import Matrix

runtime = Path.home() / 'Downloads/GVHMR/InfantryActions_20260905/GameIntegration'
assert Path(bpy.data.filepath) == runtime / 'Scene_InfantryGameIntegration.blend'
faction = globals()['INFANTRY_GAME_FACTION']
clip = globals()['INFANTRY_GAME_CLIP']
frames = json.loads((runtime / 'Data_GamePoseCorrections.json').read_text(encoding='utf-8'))[faction][clip]
scene = bpy.data.scenes['Scene_' + faction + 'InfantryActions']
bpy.context.window.scene = scene
arm = bpy.data.objects['Rig_' + faction + 'Infantry']
props = {role: bpy.data.objects['Socket_' + faction + 'Infantry' + role] for role in ['Rifle', 'Grenade']}
name = 'Animation_' + faction + '_' + clip
assert not bpy.data.actions.get(name + '_SourceReference'), 'Clip already corrected; do not apply twice'
objects = [(arm, name)] + [(obj, name + '_' + role) for role, obj in props.items()]
for obj, action_name in objects:
    obj.animation_data.action = bpy.data.actions[action_name]
source = []
for frame in range(1, len(frames) + 1):
    scene.frame_set(frame)
    source.append(({b.name: (arm.matrix_world @ b.matrix).copy() for b in arm.pose.bones},
                   {role: obj.matrix_world.copy() for role, obj in props.items()}))
for obj, action_name in objects:
    original = bpy.data.actions[action_name]
    original.name = action_name + '_SourceReference'
    corrected = original.copy(); corrected.name = action_name; corrected.use_fake_user = True
    obj.animation_data.action = corrected
def Read(values):
    return Matrix([values[i:i+4] for i in range(0,16,4)]).transposed()
def Normalized(matrix):
    result = matrix.copy()
    for i in range(3):
        column = result.col[i].to_3d().normalized()
        for j in range(3): result[j][i] = column[j]
    return result
def Depth(bone):
    return 1 + Depth(bone.parent) if bone.parent else 0
convert = Matrix.Rotation(math.pi / 2, 4, 'X')
inverse = convert.inverted()
ordered = sorted(arm.pose.bones, key=Depth)
for frame, row in enumerate(frames, 1):
    scene.frame_set(frame)
    for bone in ordered:
        values = row['bones'].get(bone.name)
        if values:
            delta = convert @ Read(values['target']) @ Read(values['source']).inverted() @ inverse
            bone.matrix = arm.matrix_world.inverted() @ delta @ source[frame-1][0][bone.name]
            bpy.context.view_layer.update()
        for prop in ['location','rotation_quaternion','scale']:
            bone.keyframe_insert(data_path=prop, frame=frame, group=bone.name)
    for role, obj in props.items():
        values = row['props'][role]
        target = Normalized(Read(values['target']) @ convert)
        original = Normalized(Read(values['source']))
        delta = convert @ target @ original.inverted() @ inverse
        obj.matrix_world = delta @ source[frame-1][1][role]
        for prop in ['location','rotation_quaternion','scale']:
            obj.keyframe_insert(data_path=prop, frame=frame)
scene.frame_start = 1; scene.frame_end = len(frames); scene.frame_set(min(45,len(frames)))
scene['taskState'] = 'Game integration: original-length legs, planted soles, trouser-knee clearance'
bpy.ops.wm.save_as_mainfile(filepath=str(runtime / 'Scene_InfantryGameIntegration.blend'),compress=True)
print('Corrected editable game source:', faction, clip, len(frames), 'frames')
