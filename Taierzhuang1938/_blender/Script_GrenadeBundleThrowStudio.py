"""One bundle-grenade (GrenadeBundle) throw, authored with BlenderMCP in an isolated file.
Controls use runtime camera coordinates (armAnchor space: metres, x right, y up, -z forward).
Animation_BundleGrip is the right-hand grip point on the wooden handle and carries the
bundle rotation; the export turns it into the weaponMount origin the runtime plays.
Run with GRENADE_PROJECT_ROOT set. With GRENADE_BUNDLE_EXPORT_ONLY=True it re-samples the
controls of the open source file (after editing them in Blender) instead of rebuilding them.
"""
from pathlib import Path
import bpy, json
from mathutils import Quaternion, Vector, Euler
root=Path(GRENADE_PROJECT_ROOT)
exportOnly=globals().get('GRENADE_BUNDLE_EXPORT_ONLY',False)
folder=Path.home()/'OneDrive/AI/Models/Blender/Taierzhuang1938/GrenadeBundleThrow_20261021'
source=folder/'Animation_GrenadeBundleThrow.blend'
# Right-hand contact (Data_FpsWeaponGrips GrenadeBundle.right.position) through the bundle
# group's own mount in Script_Viewmodel BuildGrenadeBundle (.05,-.03,-.14, x -.35).
gripLocal=Vector((.05,-.03,-.14))+Euler((-.35,0,0)).to_matrix()@Vector((-0.024274784225112474,-0.01378483117116919,0.06507322498245975))
# The GrenadeBundle hip hold (Data_FpsWeaponGrips): weaponMount position and YXZ euler.
YXZ=lambda x,y,z:Quaternion((0,1,0),y)@Quaternion((1,0,0),x)@Quaternion((0,0,1),z)
holdRotation=YXZ(.15,-.25,.10);holdGrip=Vector((.13,-.16,-.28))+holdRotation@gripLocal
# The bundle is heavy and held in both hands: both hands heave it up, the left lets go
# as it passes the chest, the right takes it high on the right side (heads up, still in
# frame), draws it back past the top-right edge, brings it over the top, opens at release
# and follows through down and out of the bottom of the frame; the next bundle comes up
# from below. Interior rotations were set so the hand axis follows the forearm the elbow
# pole gives (wrist bend 10/25/5/-10/-20/-15 deg at raise/windup/over/release/follow),
# keeping the hand straight on the forearm instead of folding at the 65 deg wrist limit.
gripKeys=[
(0,tuple(holdGrip),tuple(holdRotation)),
(.12,(.15,-.10,-.34),(.87394,.47628,-.07769,.05779)),
(.30,(.149,-.0605,-.437),(.29956,.7743,-.48236,.27938)),
(.40,(.1986,.0247,-.2873),(.20337,.82829,-.50728,.12342)),
(.45,(.1394,.0517,-.3739),(.57917,.64503,-.49796,.02316)),
(.50,(.0717,.0665,-.4521),(.87232,.20107,-.30485,-.3251)),
(.58,(.0913,-.0723,-.5013),(.87663,-.0978,-.1707,-.43911)),
(.68,(.1188,-.2965,-.4436),(.8215,-.25056,-.14756,-.49049)),
(.80,(.17,-.47,-.24),(.9641,-.25069,-.08431,.02352)),
(.90,(.18,-.30,-.32),(.99096,-.00623,-.12452,.04959)),
(1,tuple(holdGrip),tuple(holdRotation))]
# Shoulders R/L and elbow poles R/L. The left shoulder comes forward with the heave so the
# left hand stays on the heads until it lets go; the right shoulder rises for the windup
# and comes forward through the release.
bodyKeys=[
(0,(.19,-.38,.06),(-.19,-.38,.06),(.4,-.8,.15),(-.4,-.8,.15)),
(.12,(.195,-.37,.055),(-.16,-.36,-.02),(.7,-.6,.25),(-.4,-.8,.15)),
(.30,(.20,-.36,.05),(-.18,-.38,.04),(1,-.3,.3),(-.4,-.8,.15)),
(.40,(.215,-.33,.03),(-.19,-.38,.04),(1,0,.2),(-.5,-.8,.1)),
(.45,(.20,-.33,0),(-.19,-.38,.07),(1,-.15,.1),(-.5,-.8,.1)),
(.50,(.17,-.34,-.05),(-.19,-.38,.08),(.85,-.3,.1),(-.5,-.8,.1)),
(.58,(.17,-.36,-.04),(-.19,-.38,.08),(1,-.2,0),(-.4,-.8,.15)),
(.68,(.17,-.38,-.01),(-.19,-.38,.06),(.7,-.6,.2),(-.4,-.8,.15)),
(.82,(.19,-.38,.05),(-.19,-.38,.06),(.4,-.8,.15),(-.4,-.8,.15)),
(1,(.19,-.38,.06),(-.19,-.38,.06),(.4,-.8,.15),(-.4,-.8,.15))]
# Where the left hand goes once it lets go: it first drops from under the rising heads,
# then goes down and left, out of the bottom of the frame (a slower path keeps the left
# elbow continuous: under 6 cm per 1/120 of the throw).
supportKeys=[(0,(.17,-.12,-.48)),(.14,(.12,-.20,-.46)),(.30,(-.04,-.44,-.34)),(.45,(-.10,-.44,-.30)),(.60,(-.16,-.46,-.22)),(.82,(-.06,-.46,-.25)),(1,(.10,-.32,-.42))]
names=['BundleGrip','BundleSupport','BundleRightShoulder','BundleLeftShoulder','BundleRightElbow','BundleLeftElbow']
scene=bpy.context.scene
if exportOnly:
    if Path(bpy.data.filepath)!=source:raise RuntimeError('Open '+str(source)+' before re-exporting its controls')
    controls=[bpy.data.objects['Animation_'+name] for name in names]
else:
    # Runs only in the task-owned instance; leaves user preferences alone.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj,do_unlink=True)
    scene.name='Scene_GrenadeBundleThrow'
    scene.timeline_markers.clear()
    scene.render.fps=120
    scene.frame_start=1;scene.frame_end=121
    controls=[]
    for name in names:
        obj=bpy.data.objects.new('Animation_'+name,None);scene.collection.objects.link(obj)
        obj.empty_display_type='ARROWS';obj.empty_display_size=.03
        controls.append(obj)
    grip=controls[0];grip.rotation_mode='QUATERNION'
    previous=None
    for t,p,q in gripKeys:
        q=Quaternion(q).normalized()
        if previous is not None and previous.dot(q)<0:q.negate()
        previous=q;frame=1+120*t
        grip.location=p;grip.rotation_quaternion=q
        grip.keyframe_insert('location',frame=frame);grip.keyframe_insert('rotation_quaternion',frame=frame)
    for t,p in supportKeys:
        controls[1].location=p;controls[1].keyframe_insert('location',frame=1+120*t)
    for t,*values in bodyKeys:
        for obj,value in zip(controls[2:],values):
            obj.location=value;obj.keyframe_insert('location',frame=1+120*t)
    for obj in controls:
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation='BEZIER';key.handle_left_type=key.handle_right_type='AUTO_CLAMPED'
grip=controls[0]
frames=[]
for frame in range(1,122):
    scene.frame_set(frame);q=grip.rotation_quaternion.normalized()
    mount=grip.location-q@gripLocal
    frames.append([round(v,7) for v in [*mount,q.x,q.y,q.z,q.w,*controls[1].location,
        *controls[2].location,*controls[3].location,*controls[4].location,*controls[5].location]])
# release .50 is Data_FpsArmPoses GrenadeBundle.actions.throw.release (unchanged); the left
# hand leaves .10-.26 and returns .82-.97, the right opens .47-.55 and closes .82-.94.
# quickDraw*: H from a rifle swaps to the bundle and lifts it in from 0.20 m below, as G does.
data={'version':'20261021BundleOverarm','durationS':.82,'release':.50,
      'withdraw':[.10,.26,.82,.97],'opening':[.47,.55,.82,.94],
      'reappear':.88,'powerMinAmplitude':.80,'quickDrawDropM':.20,'quickDrawEnd':.16,'frames':frames}
(root/'Data_FpsGrenadeBundleThrow.mjs').write_text(
    '// Blender-authored bundle grenade (_blender/Script_GrenadeBundleThrowStudio.py): weaponMount xyz, quaternion xyzw,\n'
    '// left-hand target xyz once it lets go, shoulders R/L, elbow poles R/L (camera / armAnchor space).\n'
    'export const FPS_GRENADE_BUNDLE_THROW = Object.freeze('+json.dumps(data,separators=(',',':'))+');\n',encoding='utf-8')
folder.mkdir(parents=True,exist_ok=True)
scene['task']='GrenadeBundleThrow_20261021'
scene['releasePhase']=data['release'];scene['durationS']=data['durationS']
if not exportOnly:
    for name,t in [('Ready',0),('Heave',.12),('Raise',.30),('Windup',.40),('OverTop',.45),('Release',.50),('FollowThrough',.58),('Recover',.90)]:
        scene.timeline_markers.new(name,frame=round(1+120*t))
bpy.ops.wm.save_as_mainfile(filepath=str(source))
result={'file':bpy.data.filepath,'frames':len(frames),'exportOnly':bool(exportOnly)}
print(json.dumps(result))
