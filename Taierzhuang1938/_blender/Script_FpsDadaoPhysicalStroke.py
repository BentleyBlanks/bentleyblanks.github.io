"""Rebuild the existing first-person downstroke in the task's Blender studio.

The two palms stay attached to the hilt. Shoulder lead, blade acceleration,
follow-through and return are sampled once, then the game's existing combat
clock maps its light/heavy attacks onto the same curve.
"""
import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
root=Path(FPS_GRIP_PROJECT_ROOT)
folder=Path(FPS_GRIP_SOURCE)
scene=bpy.context.scene
scene=next((s for s in bpy.data.scenes if 'Animation_DadaoGrip' in s.objects),scene)
bpy.context.window.scene=scene
assert scene.get('BlenderMcpTask')=='FpsWeaponGrips_20261014'
scene.unit_settings.system='METRIC';scene.render.fps=120
scene.frame_start=1;scene.frame_end=121
def Control(name):
 obj=bpy.data.objects.get(name)
 if obj is None:obj=bpy.data.objects.new(name,None);scene.collection.objects.link(obj)
 obj.animation_data_clear();return obj
def Rotation(pitch):
 theta=math.radians(pitch);down=Vector((.30,.953939,0)).normalized()
 blade=down*math.sin(theta)+Vector((0,0,-math.cos(theta)))
 y=down*math.cos(theta)+Vector((0,0,math.sin(theta)));z=-blade;x=y.cross(z).normalized()
 return Matrix((x,y,z)).transposed().to_quaternion()
base=Rotation(58)
config=json.loads((folder/'Data_FpsWeaponGrips.json').read_text())['Dadao']
baseGrip=Vector((.235,-.195,-.520))+base@Vector(config['right']['position'])
controls=[Control('Animation_Dadao'+n) for n in ['Grip','Blade','RightShoulder','LeftShoulder','RightElbowPole','LeftElbowPole']]
grip,blade,right,left,rpole,lpole=controls;blade.rotation_mode='QUATERNION'
keys=[
 (0,tuple(baseGrip),58,(0,0,0),(0,0,0)),
 (.14,(.220,-.110,-.450),85,(.015,.040,.015),(.035,.040,.010)),
 (.26,(.200,.005,-.415),108,(.020,.070,.015),(.050,.075,.005)),
 (.30,(.220,-.015,-.425),82,(.005,.050,-.030),(.055,.060,-.025)),
 (.36,(.105,-.175,-.535),15,(-.015,.010,-.055),(.040,.020,-.055)),
 (.43,(-.125,-.240,-.605),-31,(-.035,.010,-.040),(.015,.025,-.035)),
 (.52,(-.150,-.270,-.590),-40,(-.030,.010,-.025),(.010,.030,-.025)),
 (.65,(-.100,-.245,-.550),-8,(-.025,.010,-.020),(.010,.030,-.020)),
 (.80,(.040,-.220,-.515),32,(-.010,0,-.010),(.010,.010,-.010)),
 (1,tuple(baseGrip),58,(0,0,0),(0,0,0))]
previous=base.copy()
for t,p,angle,r,l in keys:
 frame=1+t*120;grip.location=p;grip.keyframe_insert('location',frame=frame)
 q=Rotation(angle);q.make_compatible(previous);blade.rotation_quaternion=q;previous=q
 blade.keyframe_insert('rotation_quaternion',frame=frame)
 for obj,value in [(right,r),(left,l)]:obj.location=value;obj.keyframe_insert('location',frame=frame)
rows=json.loads((root/'_blender/Data_FpsDadaoElbowPoles.json').read_text())['rows']
for row in rows:
 for obj,i in [(rpole,1),(lpole,4)]:obj.location=row[i:i+3];obj.keyframe_insert('location',frame=1+row[0]*120)
for obj in controls:
 for layer in obj.animation_data.action.layers:
  for strip in layer.strips:
   for bag in strip.channelbags:
    for curve in bag.fcurves:
     for key in curve.keyframe_points:key.interpolation='LINEAR' if obj in [rpole,lpole] else 'BEZIER';key.handle_left_type=key.handle_right_type='AUTO_CLAMPED'
frames=[]
for frame in range(1,122):
 scene.frame_set(frame);q=blade.rotation_quaternion.normalized()@base.inverted();d=grip.location-baseGrip
 frames.append([round(v,7) for v in [*d,q.x,q.y,q.z,q.w,*right.location,*left.location,*rpole.location,*lpole.location]])
data={'schema':1,'source':'BlenderDadaoPowerSwing','sourceArmLength':.57233826,'modelRotation':[0,0,math.pi],
 'sourceEdgeDirection':[0,1,0],'defensiveVideoRotationScale':.15,'defensivePoseRotationScale':0,
 'frameCount':121,'cutStart':.26,'cutEnd':.46,'frames':frames}
(root/'Data_FpsDadaoSwing.mjs').write_text('// Blender-authored downstroke; rebuild with _blender/Script_FpsDadaoPhysicalStroke.py.\nexport const FPS_DADAO_SWING = '+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
for name,t in [('Guard',0),('Load',.26),('Cut',.36),('Follow',.52),('Return',.80),('GuardEnd',1)]:
 marker=scene.timeline_markers.get(name) or scene.timeline_markers.new(name);marker.frame=round(1+120*t)
scene['task']='FpsWeaponGrips_20261015';scene.frame_set(1)
text=bpy.data.texts.get('Script_FpsDadaoPhysicalStroke.py') or bpy.data.texts.new('Script_FpsDadaoPhysicalStroke.py')
text.clear();text.write((root/'_blender/Script_FpsDadaoPhysicalStroke.py').read_text())
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'Animation_FpsWeaponGrips.blend'),compress=True)
print(json.dumps({'source':bpy.data.filepath,'strokeFrames':len(frames)}))
