"""Author one relaxed death endpoint on the real IJA rig; run through BlenderMCP.
World rotation deltas against AdvanceFire at t=0 avoid glTF/Biped bone-axis changes.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector, Quaternion
projectRoot = Path(globals().get('DEATH_PROJECT_ROOT', Path(__file__).resolve().parents[1]))
blendPath = Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/IjaDeathPose_20260911/Scene_IjaDeathPose.blend'
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != blendPath.resolve():
    raise RuntimeError('Use the dedicated IJA death source project, not another open Blender file')
rig = next(obj for obj in bpy.context.scene.objects if obj.type == 'ARMATURE')
rig.animation_data.action = bpy.data.actions['AdvanceFire']
bpy.context.scene.frame_set(0)
bpy.context.view_layer.update()
baseWorld = {bone.name:(rig.matrix_world @ bone.matrix).to_quaternion() for bone in rig.pose.bones}
baseLocal = {bone.name:bone.matrix_basis.copy() for bone in rig.pose.bones}
rig.animation_data_clear()
for name, matrix in baseLocal.items(): rig.pose.bones[name].matrix_basis = matrix
bpy.context.view_layer.update()
def Aim(boneName, childName, direction):
    bone, child = rig.pose.bones[boneName], rig.pose.bones[childName]
    matrix = rig.matrix_world @ bone.matrix
    current = (rig.matrix_world @ child.head) - matrix.translation
    swing = current.normalized().rotation_difference(Vector(direction).normalized())
    rotation = swing @ matrix.to_quaternion()
    from mathutils import Matrix
    bone.matrix = rig.matrix_world.inverted() @ Matrix.LocRotScale(matrix.translation, rotation, matrix.to_scale())
    bpy.context.view_layer.update()
for side, sign in [('L',1),('R',-1)]:
    prefix = 'Bip001 '+side+' '
    Aim(prefix+'UpperArm',prefix+'Forearm',(sign*.40, .035, -.92))
    Aim(prefix+'Forearm',prefix+'Hand',(sign*.12, -.025, -.99))
    Aim(prefix+'Thigh',prefix+'Calf',(sign*(.14 if side=='L' else .22), .025, -.98))
    Aim(prefix+'Calf',prefix+'Foot',(sign*.08, -.035, -.995))
    Aim(prefix+'Foot',prefix+'Toe0',(sign*.24, -.96, -.06))
convert = Quaternion((1,0,0), -math.pi/2)
deltas = {}
for bone in rig.pose.bones:
    delta = convert @ ((rig.matrix_world @ bone.matrix).to_quaternion() @ baseWorld[bone.name].inverted()) @ convert.inverted()
    deltas[bone.name] = [round(v,8) for v in (delta.x,delta.y,delta.z,delta.w)]
    bone.keyframe_insert(data_path='location',frame=24)
    bone.keyframe_insert(data_path='rotation_quaternion',frame=24)
    bone.keyframe_insert(data_path='scale',frame=24)
rig.animation_data.action.name = 'DeathRelaxedEndpoint'
bpy.context.scene.frame_set(24)
blendPath.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blendPath),compress=True)
data = {'referenceClip':'AdvanceFire','referenceTime':0,'worldRotationDeltas':deltas}
(projectRoot/'Data_DeathPose.mjs').write_text('// BlenderMCP authored single relaxed endpoint; rebuild: _blender/Script_DeathPoseBake.py.\nexport const DEATH_POSE = '+json.dumps(data,indent=2)+';\n',encoding='utf-8')
print('Death endpoint saved:',blendPath)
