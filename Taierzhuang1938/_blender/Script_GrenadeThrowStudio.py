"""One grenade throw, authored with BlenderMCP in an isolated background file.
Controls use runtime camera coordinates; studio meshes are converted separately.
"""
from pathlib import Path
import bpy, json
from mathutils import Quaternion
root=Path(GRENADE_PROJECT_ROOT)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name='Scene_GrenadeThrow'
scene.render.fps=120
scene.frame_start=1;scene.frame_end=121
controls=[]
for name in ['Grip','Rotation','Support']:
    obj=bpy.data.objects.new('Animation_Grenade'+name,None);scene.collection.objects.link(obj)
    controls.append(obj)
grip,rotation,support=controls
rotation.rotation_mode='QUATERNION'
# Windup stays beside the shoulder, release reaches forward, then returns low.
keys=[
(0,(.10,-.14,-.42),(.15,-.25,.10),(-.015,-.18,-.34)),
(.18,(.17,-.10,-.38),(.35,-.18,.08),(-.14,-.23,-.35)),
(.32,(.21,-.045,-.34),(.60,-.10,.05),(-.18,-.28,-.36)),
(.40,(.20,-.055,-.39),(.40,-.08,.03),(-.18,-.28,-.36)),
(.48,(.14,-.08,-.48),(.25,-.05,0),(-.18,-.28,-.36)),
(.59,(.10,-.16,-.50),(.35,-.04,0),(-.18,-.28,-.36)),
(.76,(.17,-.24,-.46),(.30,-.12,.06),(-.14,-.24,-.35)),
(1,(.10,-.14,-.42),(.15,-.25,.10),(-.015,-.18,-.34))]
for t,p,r,l in keys:
    frame=1+120*t
    grip.location=p;support.location=l
    x,y,z=r;rotation.rotation_quaternion=Quaternion((0,1,0),y)@Quaternion((1,0,0),x)@Quaternion((0,0,1),z)
    grip.keyframe_insert('location',frame=frame);support.keyframe_insert('location',frame=frame)
    rotation.keyframe_insert('rotation_quaternion',frame=frame)
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
    frames.append([round(v,7) for v in [*grip.location,q.x,q.y,q.z,q.w,*support.location]])
(root/'Data_FpsGrenadeThrow.mjs').write_text('// One BlenderMCP grenade throw; camera-space grip, quaternion and support palm.\nexport const FPS_GRENADE_THROW = Object.freeze('+json.dumps({'release':.48,'frames':frames},separators=(',',':'))+');\n')
folder=Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeThrow_20260916'
folder.mkdir(parents=True,exist_ok=True)
scene['task']='GrenadeThrow_20260916'
bpy.ops.wm.save_as_mainfile(filepath=str(folder/'Animation_GrenadeThrow.blend'))
result={'file':bpy.data.filepath,'frames':len(frames),'clips':1}
