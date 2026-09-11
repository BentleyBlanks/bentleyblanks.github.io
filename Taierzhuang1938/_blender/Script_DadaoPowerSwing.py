"""Author one first-person Dadao downstroke through BlenderMCP.

Only the existing Dadao attacks consume this curve. No third-person or rifle
actions are generated. DADAO_PROJECT_ROOT points at the task checkout.
"""
from pathlib import Path
import bpy, json, math
from mathutils import Vector, Matrix, Quaternion

root = Path(globals()['DADAO_PROJECT_ROOT'])
exportOnly = bool(globals().get('DADAO_EXPORT_ONLY', False))
source = Path(bpy.data.filepath)
assert source.parent.name == 'DadaoPowerSwing_20260912'
scene = bpy.context.scene
scene.name = 'Scene_DadaoPowerSwing'
scene.render.fps = 120
scene.frame_start = 1
scene.frame_end = 121
scene.unit_settings.system = 'METRIC'

def Control(name):
    obj = bpy.data.objects.get(name)
    if exportOnly:
        assert obj is not None and obj.animation_data and obj.animation_data.action, name
        return obj
    if not obj:
        obj = bpy.data.objects.new(name, None)
        scene.collection.objects.link(obj)
    obj.animation_data_clear()
    for action in list(bpy.data.actions):
        if action.name.startswith(name+'PowerSwing') and action.users == 0:
            bpy.data.actions.remove(action)
    return obj

def Rotation(pitch):
    theta = math.radians(pitch)
    # -Z is the blade, -Y its cutting edge. The edge stays in the swing plane.
    down = Vector((.30, .953939, 0)).normalized()
    blade = down * math.sin(theta) + Vector((0, 0, -math.cos(theta)))
    y = down * math.cos(theta) + Vector((0, 0, math.sin(theta)))
    z = -blade
    x = y.cross(z).normalized()
    return Matrix((x, y, z)).transposed().to_quaternion()

# Exact production YXZ resting basis, measured before FOV/depth compensation.
baseRotation = Quaternion((0,1,0),-.62) @ Quaternion((1,0,0),.72) @ Quaternion((0,0,1),1.54)
baseGrip = Vector((.235,-.195,-.520)) + baseRotation @ Vector((0,0,.030))
grip = Control('Animation_DadaoGrip')
blade = Control('Animation_DadaoBlade')
right = Control('Animation_DadaoRightShoulder')
left = Control('Animation_DadaoLeftShoulder')
grip.rotation_mode = blade.rotation_mode = 'QUATERNION'

# Grip first accelerates out of the shoulder; blade rotation catches up later.
# The cut continues below the target, brakes, then returns along a folded arc.
keys = [
    (0.00, tuple(baseGrip), None, (0,0,0), (0,0,0)),
    (0.14, (.220,-.110,-.450), 58, (.015,.040,.015), (.035,.040,.010)),
    (0.26, (.200,.005,-.415), 112, (.020,.070,.015), (.050,.075,.005)),
    (0.30, (.220,-.015,-.425), 76, (.005,.050,-.030), (.055,.060,-.025)),
    (0.36, (.105,-.185,-.545), 12, (-.015,.010,-.065), (.040,.020,-.060)),
    (0.43, (-.130,-.195,-.630), -45, (-.035,.015,-.055), (.015,.065,-.100)),
    (0.55, (-.200,-.150,-.590), -45, (-.060,.040,-.070), (0,.140,-.130)),
    (0.72, (-.040,-.200,-.485), -15, (-.010,-.010,0), (0,0,-.020)),
    (1.00, tuple(baseGrip), None, (0,0,0), (0,0,0)),
]
for t,position,pitch,r,l in ([] if exportOnly else keys):
    frame = 1+t*120
    grip.location = position
    grip.keyframe_insert('location', frame=frame)
    blade.rotation_quaternion = baseRotation if pitch is None else Rotation(pitch)
    blade.keyframe_insert('rotation_quaternion', frame=frame)
    for obj,value in [(right,r),(left,l)]:
        obj.location = value
        obj.keyframe_insert('location',frame=frame)
for obj in ([] if exportOnly else [grip,blade,right,left]):
    action = obj.animation_data.action
    action.name = obj.name+'PowerSwing'
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = 'BEZIER'
                        key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'

frames=[]
for frame in range(1,122):
    scene.frame_set(frame)
    q=blade.rotation_quaternion.normalized() @ baseRotation.inverted()
    d=grip.location-baseGrip
    frames.append([round(x,7) for x in [*d,q.x,q.y,q.z,q.w,*right.location,*left.location,.3,-.8,.12,-.3,-.8,.12]])
data={'schema':1,'source':'BlenderDadaoPowerSwing','sourceArmLength':.57233826,
      'frameCount':121,'cutStart':.26,'cutEnd':.46,'frames':frames}
(root/'Data_FpsDadaoSwing.mjs').write_text('// One Blender-authored Dadao stroke; see _blender/Script_DadaoPowerSwing.py.\nexport const FPS_DADAO_SWING = '+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
for name,t in [('Guard',0),('Loaded',.26),('Contact',.36),('FollowThrough',.55),('Recovered',1)]:
    marker=scene.timeline_markers.get(name) or scene.timeline_markers.new(name)
    marker.frame=round(1+t*120)
text=bpy.data.texts.get('Script_DadaoPowerSwing.py') or bpy.data.texts.new('Script_DadaoPowerSwing.py')
text.clear();text.write((root/'_blender/Script_DadaoPowerSwing.py').read_text(encoding='utf-8'))
scene.frame_set(44)
bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True)
result={'source':str(source),'frames':len(frames),'authoredStrokes':1,'controllerKeys':len(keys)}
