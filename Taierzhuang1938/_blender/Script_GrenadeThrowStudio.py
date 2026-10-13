"""One grenade throw, authored with BlenderMCP in an isolated background file.
Controls use runtime camera coordinates; studio meshes are converted separately.
"""
from pathlib import Path
import bpy, json
from mathutils import Quaternion
root=Path(GRENADE_PROJECT_ROOT)
# This script runs only in the task-owned instance; leave user preferences alone.
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj,do_unlink=True)
scene=bpy.context.scene
scene.name='Scene_GrenadeThrow'
scene.timeline_markers.clear()
scene.render.fps=120
scene.frame_start=1;scene.frame_end=121
controls=[]
for name in ['Grip','Rotation','Support','RightShoulder','LeftShoulder','RightElbow','LeftElbow']:
    obj=bpy.data.objects.new('Animation_Grenade'+name,None);scene.collection.objects.link(obj)
    controls.append(obj)
grip,rotation,support,rightShoulder,leftShoulder,rightElbow,leftElbow=controls
rotation.rotation_mode='QUATERNION'
# A single overarm throw: lead with the elbow, accelerate through release,
# follow across/down, reach below the frame before taking the next grenade.
keys=[
(0,(.10,-.14,-.42),(.15,-.25,.10),(-.015,-.18,-.34)),
(.10,(.12,-.12,-.40),(.25,-.28,.02),(-.09,-.21,-.32)),
(.26,(.245,.015,-.29),(.85,-.32,-.30),(-.20,-.32,-.28)),
(.34,(.25,.025,-.26),(1.05,-.40,-.42),(-.21,-.34,-.27)),
(.42,(.245,.075,-.35),(.64,-.22,-.15),(-.21,-.34,-.27)),
(.48,(.12,-.01,-.485),(.10,.10,.05),(-.21,-.34,-.27)),
(.56,(-.025,-.18,-.49),(-.35,.25,.30),(-.21,-.34,-.27)),
(.66,(.045,-.39,-.36),(-.85,.12,.10),(-.21,-.34,-.27)),
(.80,(.17,-.47,-.22),(-1.20,-.12,.06),(-.20,-.34,-.27)),
(.89,(.15,-.31,-.31),(-.65,-.19,.10),(-.12,-.27,-.30)),
(1,(.10,-.14,-.42),(.15,-.25,.10),(-.015,-.18,-.34))]
for t,p,r,l in keys:
    frame=1+120*t
    grip.location=p;support.location=l
    x,y,z=r;rotation.rotation_quaternion=Quaternion((0,1,0),y)@Quaternion((1,0,0),x)@Quaternion((0,0,1),z)
    grip.keyframe_insert('location',frame=frame);support.keyframe_insert('location',frame=frame)
    rotation.keyframe_insert('rotation_quaternion',frame=frame)
bodyKeys=[
    (0,(.19,-.38,.02),(-.19,-.40,.04),(1,0,0),(-.4,-.8,.15)),
    (.34,(.215,-.35,.035),(-.195,-.40,.04),(1,.22,.16),(-.45,-.85,.15)),
    (.48,(.18,-.36,-.015),(-.19,-.40,.04),(.85,-.25,.04),(-.45,-.85,.15)),
    (.64,(.17,-.39,-.005),(-.19,-.40,.04),(1,0,0),(-.45,-.85,.15)),
    (.82,(.19,-.39,.02),(-.19,-.40,.04),(1,0,0),(-.4,-.8,.15)),
    (1,(.19,-.38,.02),(-.19,-.40,.04),(1,0,0),(-.4,-.8,.15)),
]
for t,*values in bodyKeys:
    for obj,value in zip(controls[3:],values):
        obj.location=value;obj.keyframe_insert('location',frame=1+120*t)
for obj in controls:
    for layer in obj.animation_data.action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation='BEZIER';key.handle_left_type=key.handle_right_type='AUTO_CLAMPED'
frames=[]
for frame in range(1,122):
    scene.frame_set(frame);q=rotation.rotation_quaternion.normalized()
    frames.append([round(v,7) for v in [*grip.location,q.x,q.y,q.z,q.w,*support.location,
        *rightShoulder.location,*leftShoulder.location,*rightElbow.location,*leftElbow.location]])
data={'version':'20261014Overarm','durationS':.82,'release':.48,
      'withdraw':[0,.22,.84,1],'opening':[.465,.535,.82,.94],
      'reappear':.89,'powerMinAmplitude':.72,'quickDrawDropM':.20,'quickDrawEnd':.16,
      'frames':frames}
(root/'Data_FpsGrenadeThrow.mjs').write_text(
    '// Blender-authored ordinary grenade: grip xyz, quaternion xyzw, support xyz, shoulders R/L, elbow poles R/L.\n'
    'export const FPS_GRENADE_THROW = Object.freeze('+json.dumps(data,separators=(',',':'))+');\n',encoding='utf-8')
folder=Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeThrow_20261014'
folder.mkdir(parents=True,exist_ok=True)
scene['task']='GrenadeThrow_20261014'
scene['releasePhase']=data['release'];scene['durationS']=data['durationS']
for name,t in [('Ready',0),('Windup',.34),('Release',.48),('FollowThrough',.64),('Recover',.89)]:
    scene.timeline_markers.new(name,frame=round(1+120*t))
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'Animation_GrenadeThrow.blend'))
result={'file':bpy.data.filepath,'frames':len(frames),'clips':1}
