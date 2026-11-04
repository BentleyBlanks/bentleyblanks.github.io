"""Author and export the HanYang first-person reload (Blender clip `Reload`).

Digitised beat by beat from the COD WWII Type 38 reload reference (OneDrive
饮河/FPS/动画/三八式/COD_WWII_三八式_02_换弹_有声.mp4; clip second = reference
second - 0.33). Runs through BlenderMCP inside the task project
HanYang173R/HanYangReload_20261102/Animation_HanYangReload.blend, after
Script_HanYangReloadSetup.py has built its camera-space scene:

  node scripts/Script_BlenderMcp.mjs exec --code "HANYANG_PROJECT_ROOT=r'<worktree>/Taierzhuang1938';HANYANG_RELOAD_EXPORT=True;exec(open(HANYANG_PROJECT_ROOT+'/_blender/Script_HanYangReloadAuthor.py').read())"

Everything is computed per 60 fps frame and keyed into one Action
(Animation_FpsHanYangReload): the rifle pose (reloadPivot, screen-fitted to the
reference's muzzle / knob / support-hand positions under the game's 55 deg
camera and the clip's narrower reload view, Script_HanYangReloadSway.py), bolt turn/slide, the Mannlicher packet, and both arms. The arms use an
analytic two-bone solve in rig-root space that keeps the fixed bone lengths and
the idle elbow-plane relation; hand frames and finger shapes come from the
calibrated procedural reload captured from the game (Script_HanYangReloadCapture),
except the knob holds (POLE_GRIPS), fitted to the joints marked on the reference.
HANYANG_RELOAD_EXPORT=True also writes clip `Reload` into
Animation/FirstPerson/Data_FpsHanYangAnimations.json (Idle is kept).
"""
import os
PROJECT=globals().get('HANYANG_PROJECT_ROOT') or os.environ['HANYANG_PROJECT_ROOT']
FOLDER=globals().get('HANYANG_RELOAD_FOLDER') or os.environ.get('HANYANG_RELOAD_FOLDER') or r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/HanYang173R/HanYangReload_20261102'
EXPORT=globals().get('HANYANG_RELOAD_EXPORT',False)

# ---------------- rig helpers ----------------
import bpy,json,math
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
sc=bpy.context.scene
convert=Matrix.Rotation(math.pi/2,4,'X')
read=lambda v:Matrix([v[i::4] for i in range(4)])
def Q3(q):return Quaternion((q[3],q[0],q[1],q[2]))
def q3list(q):return [q.x,q.y,q.z,q.w]
def TRS(p,q,s=(1,1,1)):return Matrix.Translation(Vector(p))@Q3(q).to_matrix().to_4x4()@Matrix.Diagonal((*s,1))
rig=bpy.data.objects['Rig_FpsArmsNraSkeletal01']
META=json.loads(sc['fpsAnimationMetadata'])
BONES=[e['name'] for e in META['bones']]
norm=lambda n:''.join(c for c in n.lower() if c.isalnum())
_bm={norm(b.name):b for b in rig.pose.bones}
PB=[_bm[norm(n)] for n in BONES]
PARENT=[e['parent'] for e in META['bones']]
CORR=[b.bone.matrix_local.inverted()@rig.matrix_basis.inverted()@convert@read(e['world']) for b,e in zip(PB,META['bones'])]
IDX={n:i for i,n in enumerate(BONES)}
def three_root(i):
    return convert.inverted()@rig.matrix_basis@PB[i].matrix@CORR[i]
def set_pose_root(mats,only=None):
    """mats: list of three root-space 4x4 per bone (None = keep). Sets matrix_basis parent-first."""
    want={}
    for i,b in enumerate(PB):
        m=mats[i]
        pose=rig.matrix_basis.inverted()@convert@m@CORR[i].inverted() if m is not None else None
        want[b.name]=pose
    done={}
    for i,b in enumerate(PB):
        if want[b.name] is None or (only and BONES[i] not in only):
            done[b.name]=None;continue
        p=b.parent
        rest=b.bone.matrix_local
        if p is None: basis=rest.inverted()@want[b.name]
        else:
            pp=done.get(p.name)
            if pp is None: pp=p.matrix
            basis=(p.bone.matrix_local.inverted()@rest).inverted()@pp.inverted()@want[b.name]
        b.matrix_basis=basis;done[b.name]=want[b.name]
def ctl(n):return bpy.data.objects['Ctl_'+n]
def set_local(o,p,q,s=None):
    o.rotation_mode='QUATERNION';o.location=Vector(p);o.rotation_quaternion=Q3(q)
    if s:o.scale=Vector(s)
def key_obj(o,f):
    o.keyframe_insert('location',frame=f);o.keyframe_insert('rotation_quaternion',frame=f)
def key_bones(f,names=None):
    for b in PB:
        if names and b.name not in names:continue
        b.rotation_mode='QUATERNION'
        b.keyframe_insert('location',frame=f);b.keyframe_insert('rotation_quaternion',frame=f)
def bind_action(name):
    a=bpy.data.actions.get(name) or bpy.data.actions.new(name)
    for o in [rig]+[o for o in sc.objects if o.name.startswith('Ctl_') or o.name.startswith('Mesh_Packet') or o.name.startswith('Mesh_Rounds')]:
        o.animation_data_create();o.animation_data.action=a
        if hasattr(o.animation_data,'action_slot') and a.slots:
            pass
    return a

# ---------------- beats ----------------
# ---- HanYang reload, digitised from COD WWII Type 38 reload (clip s = reference s - 0.33) ----
FPS=60; DURATION=3.40
# elbow swivel: radians of wrist bend traded per radian away from the authored pole / last frame
SWIVEL_POLE=0.15; SWIVEL_POLE_L=3.0; SWIVEL_CONTINUITY=1.5
TWIST_SHARE_L=0.5
# hand/forearm turn allowed beyond the idle hold (the game's wrist gate is 65 deg; idle is 35 / 21)
WRIST_MAX=28
# (the handle is flicked up / pressed down with the fingers; the knob rolls in the crotch
# rather than the palm turning the full 90 degrees with it, as in the reference)
PIVOT=(-0.0116,-0.0005,-0.4027)        # left palm on the fore-stock, gun space
# gun poses: (dp xyz recoil space, rx pitch up, ry yaw left, rz roll right-side-up) about PIVOT,
# set under the reload view by Script_HanYangReloadSway.py (muzzle on the reference's)
SWAY_DATA=json.load(open(PROJECT+'/_blender/Data_HanYangReloadSway.json',encoding='utf-8'))
POSES={k:(tuple(v[0]),*v[1:]) for k,v in SWAY_DATA['poses'].items()}
# the game must play the clip under the same view (Data_FpsSkeletalAnimation HanYang `view`)
import re
_vm=re.search(r"view: Object\.freeze\(\{ depthScale: ([\d.]+),\s*weight: Object\.freeze\((\[.*?\]\])\)",open(PROJECT+'/Data_FpsSkeletalAnimation.mjs',encoding='utf-8').read(),re.S)
assert _vm and abs(float(_vm[1])-SWAY_DATA['view']['depthScale'])<1e-6 and json.loads(_vm[2])==SWAY_DATA['view']['weight'],    ('Data_FpsSkeletalAnimation HanYang view != Data_HanYangReloadSway view',_vm and _vm.groups(),SWAY_DATA['view'])
# gun keys (t, pose); eased between keys (A2: pushed forward while the bolt comes back)
GUN=[tuple(k) for k in SWAY_DATA['gun']]
TURN=[(0,0),(0.27,0),(0.37,1),(2.87,1),(3.00,0),(3.40,0)]
SLIDE=[(0,0),(0.40,0),(0.55,1),(2.75,1),(2.88,0),(3.40,0)]
# packet in gun space: (t, x,y,z, rx,ry,rz)
PACKET=[(1.30,0.18,-0.22,0.08,0.9,0,1.2),(1.58,0.16,-0.12,0.03,0.6,0,0.8),(1.73,0.06,0.09,-0.14,0.25,0.04,0.25),
        (1.85,0,0.051,-0.187,0,0,0),(2.00,0,0.051,-0.187,0,0,0),(2.14,0,0.051-0.068,-0.187,0,0,0),(3.40,0,0.051-0.068,-0.187,0,0,0)]
PACKET_VISIBLE=(1.30,2.20)
# support fingers close round the stock: degrees at (knuckle, middle, end) joints; ramp in/out times
LEFT_CURL={'1':(30,40,25),'2':(32,42,25),'3':(34,44,25),'4':(36,46,25)}
LEFT_CURL_T=(0.10,0.30,3.08,3.34)
# (from, last full, released): the packet rides in the solved hand, then eases back to PACKET
PACKET_IN_HAND=(1.30,1.76,1.84)
USED=[(0.98,0,0.051-0.068,-0.187,0,0,0),(1.03,0,0.125,-0.19,0.1,0,0.1),(1.13,0.10,0.20,-0.15,0.6,0.2,1.2),(1.25,0.25,0.18,-0.05,1.2,0.4,2.4)]
USED_VISIBLE=(0.98,1.25)
# right hand keys: (t, anchor, pose, offset in anchor-local metres)
# The hand comes on / off the knob over these distances (handle down / lifted; 2.2x for the far point);
# their direction is replaced by the bolt-to-palm radial once the grasp is built (palm_out)
OFF_DOWN=(0.033,0.023,0.0); OFF_UP=(0.04,0.0,0.0)
# Knob grasps (see the authoring section): the hand holds the handle like a pole, its thumb side along
# the handle and the fingers across it: ring and little finger hooked round the stalk from the muzzle
# side (they drag the bolt back), index and middle straight on past the ball, the thumb off it.
# Per grasp (phi round the handle from bolt-local +y, tilt of the fingers towards the handle, roll
# about the fingers, rad; hook height on the handle, gun units; ring / little curl as open_right
# shares; optionally index / middle opening from the captured fist, default straight, and how far the
# hook sits on the camera side of the handle, gun units), fitted in Blender against the joints marked
# on the reference (finger tips, knuckles, wrist; relative to the ball, in hand spans) under a wrist bend the arm can reach (<= 24 deg past
# the idle hold, elbow swivel free) and capsule clearance of the bolt, stalk and ball:
# fistUp at 0.40 s (lifted; with the handle down see fist0 below), fistBack at 0.60 s (bolt back: the hand
# has rolled forward over the ball onto its camera side, the fingers curled down in front of it, as
# in the reference); between them the hand goes over the top of the ball (fistTurn, FIST_TURN_LIFT
# up the handle) instead of dragging the hooked fingers through the stalk.
POLE_GRIPS={'fistUp': [-2.2022, -0.0406, 0.1078, 0.0375, -0.2484, -0.1312], 'fistBack': [-2.9047, 0.6188, 0.4781, 0.051, -0.4434, -0.3984, -0.0047, 0.7, 0.042]}
# off the rolled-over hold (on the ball's camera side) the hand first rises up the handle out of the
# fingers' curl, then goes back and down towards the eye, as the reference drops it to the receiver
RELEASE_OFF=(0.07,0,0.06)
REST_APPROACH=(0.02,0,0.03);LIFT_OFF=(0.025,0,0.02);GRAB_LEAD=math.radians(45);REST_OVER=(0.08,0,0.05);OPEN_OFF=(0.03,0,0.04)
KNOB_HOLDS=('fistUpOpen','fistUp','fistRoll','rollToBack','fistBack','fistBackOpen','openToBack')
CLOSE_FAR,CLOSE_NEAR=(0.04,0,0.08),(0.015,0,0.03)
# Keys marked T are waypoints the hand passes through without stopping.
T=True
RIGHT=[
 (0.00,'gun','grip',None),(0.06,'gun','gripClear',None,T),(0.10,'gun','gripClear',(0.05,0.07,0.03),T),
 (0.21,'bolt','fistUpOpen',tuple(2.2*v for v in OFF_DOWN),T),(0.245,'bolt','fistUpOpen',OFF_DOWN,T),(0.27,'bolt','fistUpOpen',None),(0.34,'bolt','fistUp',None),
 (0.41,'bolt','fistUp',None),(0.51,'bolt','fistRoll',None,T),(0.56,'bolt','fistBackOpen',None,T),(0.585,'bolt','openToBack',None,T),(0.61,'bolt','fistBack',None),(0.64,'bolt','fistBack',None),(0.67,'bolt','fistBackOpen',OPEN_OFF,T),(0.70,'bolt','fistBackOpen',RELEASE_OFF,T),
 (0.74,'bolt','boltRestOpen',REST_OVER,T),(0.77,'bolt','boltRestOpen',REST_APPROACH,T),(0.80,'bolt','boltRest',None),(0.92,'bolt','boltRest',None),(0.96,'bolt','boltRestOpen',REST_APPROACH,T),(1.00,'bolt','boltRestOpen',REST_OVER,T),(1.15,'via',0.67,None,T),
 (1.30,'packet','packet',None),(1.80,'packet','packet',(0.012,0.016,0.0),T),(1.85,'packet','packet',(0.012,0.018,0.0)),
 (1.95,'packet','press',(0.01,0.04,0.01)),(2.00,'packet','press',None),(2.14,'packet','press',None),
 (2.22,'packet','press',(0.03,0.05,0.02),T),(2.45,'gun','gripClear',(0.12,0.10,0.10),T),
 (2.62,'bolt','fistBackOpen',CLOSE_FAR,T),(2.70,'bolt','fistBackOpen',CLOSE_NEAR,T),(2.74,'bolt','fistBackOpen',None),(2.755,'bolt','openToBack',None,T),(2.77,'bolt','fistBack',None),(3.00,'bolt','fistBack',None),(3.04,'bolt','fistBack',LIFT_OFF,T),(3.10,'bolt','fistBackOpen',RELEASE_OFF,T),(3.18,'gun','gripClear',(0.10,0.05,0.03),T),
 (3.28,'gun','gripClear',None,T),(3.38,'gun','grip',None),(3.40,'gun','grip',None),
]


# right elbow pole offsets (root space, metres): the forearm comes in from above on the bolt beats
# left elbow tucked in and down while the rifle is turned to the bolt (keeps the sleeve off the receiver)
POLE_L=[(0,0,0,0),(0.03,0,0,0),(0.17,0.15,-0.25,0),(0.72,0.15,-0.25,0),(1.15,0.20,-0.35,0),(2.52,0.20,-0.35,0),(2.74,0.12,-0.22,0),(2.98,0.12,-0.22,0),(3.30,0.12,-0.22,0),(3.40,0,0,0)]
POLE_R=[(0,0,0,0),(0.12,0,0,0),(0.27,0.05,0.30,0.05),(0.67,0.05,0.30,0.05),(0.82,0,0,0),(2.60,0,0,0),(2.75,0.05,0.25,0),(2.98,0.05,0.25,0),(3.20,0,0,0),(3.40,0,0,0)]

# right shoulder reach (root space, metres; the clavicle turns to carry it) on the bolt beats
SHOULDER_R=[(0,0,0,0),(0.10,0,0,0),(0.27,0.0,0.03,-0.06),(0.67,0.0,0.03,-0.06),(0.85,0,0,0),(1.45,0,0,0),(1.70,0.0,0.02,-0.06),(2.20,0.0,0.02,-0.06),(2.45,0,0,0),(2.55,0,0,0),(2.74,0.03,0.03,-0.07),(2.98,0.03,0.03,-0.07),(3.20,0,0,0),(3.40,0,0,0)]

# ---------------- authoring ----------------
from mathutils import Euler
cap=json.load(open(FOLDER+'/Data_Capture.json'))
E=cap['runs']['empty']['frames'];I=cap['idle']
VM=bpy.data.objects['VM_Space']
def rootM(o):return convert.inverted()@VM.matrix_world.inverted()@o.matrix_world
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def track(keys,t):
    if t<=keys[0][0]:return keys[0][1:]
    for a,b in zip(keys,keys[1:]):
        if t<=b[0]:
            u=smooth((t-a[0])/(b[0]-a[0]) if b[0]>a[0] else 1);return tuple(x+(y-x)*u for x,y in zip(a[1:],b[1:]))
    return keys[-1][1:]
def lin(keys,t):return track(keys,t)[0]
FING=[i for i,n in enumerate(BONES) if '_R_Finger' in n];FINGL=[i for i,n in enumerate(BONES) if '_L_Finger' in n]
RH,LH=IDX['Bip002_R_Hand'],IDX['Bip002_L_Hand']
def lib_entry(fr,anchorKey,hand=RH,fing=FING):
    bones=[read(b['root']) for b in fr['bones']]
    A=read(fr['controls'][anchorKey]['root'])
    return A.inverted()@bones[hand],[bones[PARENT[i]].inverted()@bones[i] for i in fing]
LIB={'grip':lib_entry(I,'gunRoot'),'gripClear':lib_entry(E[1],'gunRoot'),'boltClear':lib_entry(E[6],'part_bolt'),
 'bolt':lib_entry(E[8],'part_bolt'),'boltPull':lib_entry(E[24],'part_bolt'),'packet':lib_entry(E[42],'packetProp'),
 'press':lib_entry(E[60],'packetProp')}
LGRIP=lib_entry(I,'gunRoot',LH,FINGL)
IB=[read(b['root']) for b in I['bones']]
def frame(a,n):
    x=a.normalized();z=(n-n.dot(x)*x).normalized();y=z.cross(x)
    return Matrix((x,y,z)).transposed()
def M3(loc,rot3,scale):
    m=rot3.to_4x4();m.translation=loc;return m@Matrix.Diagonal((*scale,1))
def arm(side):
    ua,fa,h=IDX['Bip002_%s_UpperArm'%side],IDX['Bip002_%s_Forearm'%side],IDX['Bip002_%s_Hand'%side]
    S=IB[ua].translation;E0=IB[fa].translation;W0=IB[h].translation
    n0=(E0-S).cross(W0-E0).normalized()
    return dict(ua=ua,fa=fa,h=h,S=S,L1=(E0-S).length,L2=(W0-E0).length,
        rua=frame(E0-S,n0).inverted()@IB[ua].to_quaternion().to_matrix(),rfa=frame(W0-E0,n0).inverted()@IB[fa].to_quaternion().to_matrix(),
        pole=E0+(E0-(S+W0)*0.5).normalized()*0.3,sua=IB[ua].to_scale(),sfa=IB[fa].to_scale(),sh=IB[h].to_scale(),
        twistAxis=(IB[fa].to_quaternion().inverted()@(W0-E0)).normalized(),idleRel=IB[fa].to_quaternion().inverted()@IB[h].to_quaternion(),
        faInHand=IB[h].to_quaternion().inverted()@(W0-E0).normalized(),swivel=None)
def solve(a,target,poleOffset=Vector(),S=None):
    W=target.translation;S=a['S'] if S is None else S;d=(W-S).length;dmax=a['L1']+a['L2']-1e-4;reach=d<=dmax
    d=min(max(d,abs(a['L1']-a['L2'])+1e-4),dmax);u=(W-S).normalized();W=S+u*d
    P=a['pole']+poleOffset;v=(P-S)-((P-S).dot(u))*u;v.normalize()
    ax=(a['L1']**2-a['L2']**2+d*d)/(2*d);hh=math.sqrt(max(0,a['L1']**2-ax*ax))
    # Swivel the elbow about the shoulder-wrist axis to keep the wrist as straight as the idle
    # hold (forearm direction seen from the hand), near the authored pole and the last frame.
    want=target.to_quaternion()@a['faInHand']
    def cost(phi):
        Ec=S+u*ax+(Quaternion(u,phi)@v)*hh;f=(W-Ec).normalized()
        prev=a['swivel'] if a['swivel'] is not None else phi
        return f.angle(want)+a['swivelPole']*abs(phi)+SWIVEL_CONTINUITY*abs(phi-prev)
    phi=min((math.radians(x) for x in range(-120,121,3)),key=cost)
    phi=min((phi+math.radians(x/2) for x in range(-6,7)),key=cost)
    a['swivel']=phi;Ep=S+u*ax+(Quaternion(u,phi)@v)*hh
    n=(Ep-S).cross(W-Ep).normalized()
    rua=frame(Ep-S,n)@a['rua'];rfa=frame(W-Ep,n)@a['rfa']
    rh=target.to_quaternion()
    rel=rfa.to_quaternion().inverted()@rh;delta=rel@a['idleRel'].inverted()
    proj=Vector((delta.x,delta.y,delta.z)).dot(a['twistAxis'])
    tw=Quaternion((delta.w,*(a['twistAxis']*proj))).normalized();tw=Quaternion().slerp(tw,a.get('twistShare',0.5))
    rfa=(rfa.to_quaternion()@tw).to_matrix()
    return M3(S,rua,a['sua']),M3(Ep,rfa,a['sfa']),M3(W,rh.to_matrix(),a['sh']),reach
AR,AL=arm('R'),arm('L')
AR['swivelPole'],AL['swivelPole']=SWIVEL_POLE,SWIVEL_POLE_L
AL['twistShare']=TWIST_SHARE_L
def blendM(A,B,u):
    la,ra,sa=A.decompose();lb,rb,sb=B.decompose()
    return Matrix.LocRotScale(la.lerp(lb,u),ra.slerp(rb,u),sa.lerp(sb,u))
LIB['boltOpen']=(LIB['bolt'][0],[blendM(x,y,0.55) for x,y in zip(LIB['bolt'][1],LIB['boltClear'][1])])
G0=TRS(I['controls']['weaponMount']['p'],I['controls']['weaponMount']['q'])
def pose_matrix(name):
    dp,rx,ry,rz=POSES[name];piv=Vector(PIVOT)
    R=Euler((rx,ry,rz),'YXZ').to_matrix().to_4x4()
    return Matrix.Translation(dp)@G0@Matrix.Translation(piv)@R@Matrix.Translation(-piv)
def gun_base(t):
    for a,b in zip(GUN,GUN[1:]):
        if t<=b[0]:
            u=smooth((t-a[0])/(b[0]-a[0]) if b[0]>a[0] else 1);return blendM(pose_matrix(a[1]),pose_matrix(b[1]),u)
    return pose_matrix(GUN[-1][1])
SWAY=SWAY_DATA['rows']
def gun_at(t):
    # The rifle follows the reference's own motion between the key poses: the support hand's rise
    # and fall, the swing as it settles and the kicks of the working hand, tracked frame by frame
    # from the muzzle and left hand (Script_HanYangReloadSway.py) and applied about the left palm.
    k=min(len(SWAY)-1,max(0,round(t*FPS)));d=SWAY[k]
    piv=Vector(PIVOT);R=Euler(d[3:],'YXZ').to_matrix().to_4x4()
    return Matrix.Translation(d[:3])@gun_base(t)@Matrix.Translation(piv)@R@Matrix.Translation(-piv)
for o in [rig]+[o for o in sc.objects if o.name.startswith('Ctl_') or o.name.startswith('Mesh_')]:
    if o.animation_data:o.animation_data.action=None
old=bpy.data.actions.get('Animation_FpsHanYangReload')
if old:bpy.data.actions.remove(old)
act=bind_action('Animation_FpsHanYangReload')
act['duration']=DURATION
rp,wm,bolt,ck,pk,used=ctl('reloadPivot'),ctl('weaponMount'),ctl('part_bolt'),ctl('part_cockingPiece'),ctl('packetProp'),ctl('usedPacketProp')
wm.matrix_basis=G0
N=round(DURATION*FPS)+1;unreach=[]
anchors={'gun':ctl('gunRoot'),'bolt':bolt,'packet':pk,'usedPacket':used}
# Hand frames measured on the idle hand: finger direction, palm normal, knob contact (index root / thumb crotch).
def hand_frame():
    H=IB[RH];R=H.to_quaternion()
    F=lambda n:IB[IDX['Bip002_R_'+n]].translation
    fd=(R.inverted()@(F('Finger2')-H.translation)).normalized()
    # palm side: where the grip shape curls the middle finger's tip
    loc=LIB['grip'][1];acc={RH:Matrix.Identity(4)}
    for i,L in zip(FING,loc):acc[i]=acc[PARENT[i]]@L
    tip=acc[IDX['Bip002_R_Finger22']].translation;base=acc[IDX['Bip002_R_Finger2']].translation
    curl=(tip-base);curl=(curl-curl.dot(fd)*fd)
    # hand-local (with scale) contact point between index root and thumb middle joint
    cw=(F('Finger1')+F('Finger01'))*0.5
    c_local=H.inverted()@cw
    return fd,curl.normalized(),c_local
FD,PN,CLOC=hand_frame()
CLOC_L=IB[LH].inverted()@((IB[IDX['Bip002_L_Finger1']].translation+IB[IDX['Bip002_L_Finger01']].translation)*0.5)
# Knob grasps (POLE_GRIPS). Finger shapes start from the game's FPS_HAND_SHAPES.boltFist as the live
# bolt cycle solves it with the handle lifted, opened up joint by joint: index and middle straight, the
# thumb mostly open, ring and little closed further (then per grasp).
FIST=json.load(open(FOLDER+'/Data_BoltFistCapture.json'))
def fist_entry(fr):
    bones=[read(b['root']) for b in fr['bones']];Bm=read(fr['bolt'])
    return Bm.inverted()@bones[RH],[bones[PARENT[i]].inverted()@bones[i] for i in FING]
# Each joint of a finger is turned back by this share of its flexion (negative: closed further).
OPEN_FINGERS={'0':0.6,'1':1.0,'2':0.9,'3':-0.25,'4':-0.3}
def open_right(locs,amount):
    locs=[m.copy() for m in locs];acc={RH:Matrix.Identity(4)}
    for i,L in zip(FING,locs):acc[i]=acc[PARENT[i]]@L
    for f,share in amount.items():
        chain=[IDX['Bip002_R_Finger%s%s'%(f,j)] for j in ('','1','2')]
        for k,i in enumerate(chain):
            head=acc[i].translation
            d=(acc[chain[k+1]].translation-head) if k<2 else acc[i].to_3x3()@Vector((1,0,0))
            prev=head-(acc[chain[k-1]].translation if k else Vector())
            ax=prev.cross(d)
            if share==0 or ax.length<1e-9:continue
            R=Matrix.Translation(head)@Matrix.Rotation(-share*prev.angle(d),4,ax.normalized())@Matrix.Translation(-head)
            for j in chain[k:]:acc[j]=R@acc[j]
        for i in chain:locs[FING.index(i)]=acc[PARENT[i]].inverted()@acc[i]
    return locs
def finger_acc(locs):
    acc={RH:Matrix.Identity(4)}
    for i,L in zip(FING,locs):acc[i]=acc[PARENT[i]]@L
    return acc
def circumcentre(a,b,c):
    ab,ac=b-a,c-a;n=ab.cross(ac)
    return a+(n.cross(ab)*ac.length_squared+ac.cross(n)*ab.length_squared)/(2*n.length_squared)
_rel,POLE_RAW=fist_entry(FIST['up']);POLE_LOCS=open_right(POLE_RAW,OPEN_FINGERS);POLE_SCALE=_rel.to_scale()
_a=finger_acc(POLE_LOCS);_J=lambda n:_a[IDX['Bip002_R_Finger'+n]].translation
# hand frame: fingers (knuckle line's normal in the palm), thumb side (little -> index knuckle), palm
_kk=(_J('1')-_J('4')).normalized();_fd=_J('2')-(_J('1')+_J('4'))/2;_fd=(_fd-_fd.dot(_kk)*_kk).normalized()
_pn=_kk.cross(_fd);_pn=_pn if (_J('32')-_J('3')).dot(_pn)>0 else -_pn
POLE_HAND=Matrix((_fd,_kk,_pn)).transposed()
def pole_grip(phi,tilt,roll,hook,ring,little,index=None,middle=None,front=0):
    base=POLE_LOCS if index is None else open_right(POLE_RAW,{**OPEN_FINGERS,'1':index,'2':middle})
    locs=open_right(base,{'3':ring,'4':little});acc=finger_acc(locs)
    fdt=Vector((0,math.cos(phi),math.sin(phi)));kt=Vector((1,0,0))
    pnt=fdt.cross(kt) if _fd.cross(_kk).dot(_pn)>0 else kt.cross(fdt)
    R=Matrix((fdt,kt,pnt)).transposed()@Matrix.Rotation(roll,3,'X')@Matrix.Rotation(tilt,3,'Z')@POLE_HAND.inverted()
    rel=R.to_4x4()@Matrix.Diagonal((*POLE_SCALE,1))
    P=rel@circumcentre(*[acc[IDX['Bip002_R_Finger3'+j]].translation for j in ('','1','2')])
    return Matrix.Translation(Vector((hook,0,front))-P)@rel,locs
for key,x in POLE_GRIPS.items():LIB[key]=pole_grip(*x)
# Full hand poses (FULL_GRIPS, override the pole grips): the hand bone's place and XYZ euler on the bolt
# (gun units, rad), then per finger index..little (spread about the palm normal, knuckle, middle and end
# joint flexion towards the palm, deg) from straight fingers, and the thumb (swing about the palm
# normal and about the finger direction, then its two joints, deg) from the sampled fist's half-open thumb.
FULL_BASE=open_right(POLE_RAW,{'0':0.6,'1':1.0,'2':1.0,'3':1.0,'4':1.0})
def full_fingers(fp):
    locs=[m.copy() for m in FULL_BASE];acc=finger_acc(locs)
    def rot_chain(chain,head,ax,deg):
        R=Matrix.Translation(head)@Matrix.Rotation(math.radians(deg),4,ax)@Matrix.Translation(-head)
        for j in chain:acc[j]=R@acc[j]
    for n,f in enumerate('1234'):
        sp,a,b,c=fp[4*n:4*n+4];chain=[IDX['Bip002_R_Finger%s%s'%(f,j)] for j in ('','1','2')]
        rot_chain(chain,acc[chain[0]].translation,_pn,sp)
        for k,(i,deg) in enumerate(zip(chain,(a,b,c))):
            head=acc[i].translation;nxt=acc[chain[k+1]].translation if k<2 else acc[i]@Vector((1,0,0))
            rot_chain(chain[k:],head,(nxt-head).normalized().cross(_pn).normalized(),deg)
    ta,tb,t1,t2=fp[16:20];chain=[IDX['Bip002_R_Finger0%s'%j] for j in ('','1','2')]
    h0=acc[chain[0]].translation;rot_chain(chain,h0,_pn,ta);rot_chain(chain,h0,_fd,tb)
    for k,deg in ((1,t1),(2,t2)):
        i=chain[k];head=acc[i].translation;nxt=acc[chain[k+1]].translation if k<2 else acc[i]@Vector((1,0,0))
        ax=(head-acc[chain[k-1]].translation).cross(nxt-head)
        if ax.length<1e-6:ax=(nxt-head).cross(_pn)
        rot_chain(chain[k:],head,ax.normalized(),deg)
    for i in FING:locs[FING.index(i)]=acc[PARENT[i]].inverted()@acc[i]
    return locs
def full_grip(x):
    rel=Matrix.Translation(Vector(x[0:3]))@Euler(x[3:6],'XYZ').to_matrix().to_4x4()@Matrix.Diagonal((*POLE_SCALE,1))
    return rel,full_fingers(x[6:26])
FULL_GRIPS={'fistUp': [0.0697, -0.0837, 0.0119, 2.2759, 0.6314, 1.8407, -0.9256, 7.9228, 24.375, 17.0625, -0.3107, -5, -5, -3.5, 3, 46.3751, 86.308, 60.4156, 6, 65.8294, 70, 49.0, -34.4523, -18.0389, -12.8911, 32.6376], 'fistBack': [0.0636, -0.0035, 0.1173, -1.3073, 1.5797, -0.8371, -3, 57.4021, 45, 31.5, 0, 41.2385, 45, 31.5, 3, 95, 98.0053, 68.6037, 6, 95, 80, 56.0, 23.9671, -15.3016, 26.9877, -19.9491], 'boltRest': [0.0988, -0.0203, 0.0173, 2.3506, 1.0682, 2.8149, -3, 25.544, 30, 21.0, 0, 10, 42.1875, 29.5312, 3, 80, 75.5771, 52.904, 6, 80, 30, 21.0, -7.1387, -50.2481, 32.0668, 17.8078], 'fistRoll': [0.0768, -0.0522, 0.0721, -1.0304, 1.3584, -1.1656, -0.2088, 32.5072, 34.6965, 24.2876, -0.125, 18.0028, 20.1335, 14.0934, 11.8326, 22.2618, 81.9098, 57.3368, 11.9458, 94.375, 110, 77.0, -5.1894, -16.85, 7.022, 6.2808], 'fistBackOpen': [0.0634, -0.0097, 0.1179, -1.3133, 1.436, -0.8301, -3, 17.2981, 13.8113, 9.6679, 0, 12.0397, 13.1749, 9.2224, 3, 22.5794, 29.9813, 20.9869, 6, 28.425, 23.9755, 16.7829, 23.8515, -15.1608, 27.2042, -20.0], 'rollToBack': [0.1258, -0.0116, 0.164, -1.5075, 2.2947, -1.1718, -0.2886, 45.1017, 40.2752, 28.1926, 0.0319, 29.3382, 32.5177, 22.7624, -8.4188, 95, 95.7557, 67.029, 0.8488, 95, 73.453, 51.4171, 9.2867, -16.0633, 17.1435, -7.1842], 'openToBack': [0.0782, 0.0106, 0.1693, -1.2949, 1.6254, -0.7469, -0.754, 37.0691, 29.6357, 20.745, 0.1267, 19.6823, 43.0541, 30.1379, 14.3534, 38.1959, 85.0985, 59.569, 1.1698, 60.8851, 49.2736, 34.4915, 23.6613, -15.5021, 27.3925, -19.8414]}
FULL_GRIPS.update(globals().get('FULL_GRIPS_OVERRIDE',{}))
for key,x in FULL_GRIPS.items():LIB[key]=full_grip(x)
def _mid_grip(a,b):
    q=Euler(a[3:6],'XYZ').to_quaternion().slerp(Euler(b[3:6],'XYZ').to_quaternion(),0.5)
    return [(u+v)/2 for u,v in zip(a[:3],b[:3])]+list(q.to_euler('XYZ'))+[(u+v)/2 for u,v in zip(a[6:26],b[6:26])]
if 'fistRoll' not in LIB:LIB['fistRoll']=full_grip(_mid_grip(FULL_GRIPS['fistUp'],FULL_GRIPS['fistBack']))
# letting go: the fingers open out of the fist in place before the hand leaves
LIB['fistBackOpen']=full_grip(FULL_GRIPS['fistBackOpen']) if 'fistBackOpen' in FULL_GRIPS else full_grip(FULL_GRIPS['fistBack'][:6]+[v*(0.35 if i%4 else 1) for i,v in enumerate(FULL_GRIPS['fistBack'][6:22])]+FULL_GRIPS['fistBack'][22:26])
# taking the handle down the ring and little finger come on open and close round the stalk as it rises
# (the hand is turned GRAB_LEAD about the knob towards its raised hold: it turns with the handle only
# by the rest, which keeps the wrist inside FpsArmTest's 20 deg a frame)
_u=FULL_GRIPS['fistUp'];_r,_l=full_grip(_u[:14]+[v*(0.35 if i%4 else 1) for i,v in enumerate(_u[14:22])]+_u[22:26]);_k=Vector((0.0515,0,0))
LIB['fistUpOpen']=(Matrix.Translation(_k)@Matrix.Rotation(GRAB_LEAD,4,'Z')@Matrix.Translation(-_k)@_r,_l)
# onto / off the receiver the fingers stay straightened (they would sweep the knob curled)
_r=FULL_GRIPS['boltRest'];LIB['boltRestOpen']=full_grip(_r[:6]+[v*(0.3 if i%4 else 1) for i,v in enumerate(_r[6:22])]+_r[22:26])
# While the handle turns (up and back down) the pole grip's little finger would lie on the bolt body and
# the receiver: there the hand holds the knob as the live bolt cycle's boltFist (sampled handle down /
# up: fist0 / fistKnob), opened like the others, turned about the knob from the upper right
# (FIST0_ROLL_DEG round the bore, then FIST0_HOLD_DEG) and slid until the ring finger's hook is on the
# stalk (FIST0_HOOK_X); the knob stays in the thumb/index crotch as FpsReloadMechanicsTest requires.
# Once the handle is up it changes to the pole grip (0.37-0.43 s; back 2.83-2.88 s).
FIST0_ROLL_DEG,FIST0_HOLD_DEG,FIST0_HOOK_X=35,(33.0,32.8,39.6),0.0384
def _boltfist(sample):
    rel,locs=fist_entry(FIST[sample]);locs=open_right(locs,OPEN_FINGERS);k=Vector((0.0515,0,0))
    rel=Matrix.Translation(k)@Matrix.Rotation(math.radians(FIST0_ROLL_DEG),4,'Z')@Matrix.Translation(-k)@rel
    rel=Matrix.Translation(k)@Euler(tuple(map(math.radians,FIST0_HOLD_DEG)),'XYZ').to_matrix().to_4x4()@Matrix.Translation(-k)@rel
    acc=finger_acc(locs);P=rel@circumcentre(*[acc[IDX['Bip002_R_Finger3'+j]].translation for j in ('','1','2')])
    return Matrix.Translation(Vector((FIST0_HOOK_X,0,0))-P)@rel,locs
LIB['fist0'],LIB['fistKnob']=_boltfist('down'),_boltfist('up')
# half way through the handle's quarter-turn (the hand clears the bolt there on a waypoint)
LIB['fistMid']=(blendM(LIB['fist0'][0],LIB['fistKnob'][0],0.5),[blendM(x,y,0.5) for x,y in zip(LIB['fist0'][1],LIB['fistKnob'][1])])
KH={k:LIB[k][0].inverted()@Vector((0.0515,0,0)) for k in ('fist0','fistMid','fistKnob','fistUpOpen','fistUp','fistRoll','fistBack','fistBackOpen','boltRest','boltRestOpen','rollToBack','openToBack')}   # the knob in each grasp's hand frame
# (the boltFist grasps keep turning about fist0's: their calibrated paths round the turning handle)
KH['fistMid']=KH['fistKnob']=KH['fist0']
# The hand comes onto the knob straight out from the bolt and leaves the same way: the approach /
# release offsets (RIGHT keys on the bolt) point from the bolt's axis to the palm, at the authored
# lengths (1x / 2.2x of OFF_DOWN / OFF_UP); the old sideways ones swept the new grasp through the bolt.
def palm_out(rel,locs):
    acc={RH:Matrix.Identity(4)}
    for i,L in zip(FING,locs):acc[i]=acc[PARENT[i]]@L
    c=rel@((acc[IDX['Bip002_R_Finger2']].translation+acc[IDX['Bip002_R_Finger4']].translation)/4)
    return Vector((c.x,c.y,0)).normalized()
def remouth(key):
    t,anc,name,off=key[:4]
    if anc!='bolt' or not off or name in ('fistRoll','fistBack','fistBackOpen','boltRest','boltRestOpen','rollToBack','openToBack'):return key
    old=Vector(OFF_DOWN if name=='fist0' else OFF_UP);k=Vector(off).length/old.length
    return (t,anc,name,tuple(palm_out(*LIB[name])*old.length*k),*key[4:])
RIGHT=[remouth(k) for k in RIGHT]

# Support hand: the idle cradle holds the fore-stock with straight fingers, which reads as an open
# palm once the rifle is turned to load. Through the reload the fingers close round the stock as in
# the reference (a loose fist): each joint flexes about its own axis (finger direction x palm normal).
def left_palm_normal():
    acc={LH:Matrix.Identity(4)}
    for i,L in zip(FINGL,LGRIP[1]):acc[i]=acc[PARENT[i]]@L
    base=acc[IDX['Bip002_L_Finger2']].translation;tip=acc[IDX['Bip002_L_Finger22']].translation
    fd=base.normalized();c=tip-base;return (c-c.dot(fd)*fd).normalized()
PN_L=left_palm_normal()
def curl_left(locs,w):
    if w<=0:return locs
    locs=[m.copy() for m in locs];acc={LH:Matrix.Identity(4)}
    for n,(i,L) in enumerate(zip(FINGL,locs)):acc[i]=acc[PARENT[i]]@L
    for f,angles in LEFT_CURL.items():
        chain=[IDX['Bip002_L_Finger%s%s'%(f,j)] for j in ('','1','2')]
        for k,(i,deg) in enumerate(zip(chain,angles)):
            W=acc[i];head=W.translation;nxt=acc[chain[k+1]].translation if k<2 else W@Vector((1,0,0))
            d=(nxt-head).normalized();ax=d.cross(PN_L).normalized()
            R=Matrix.Translation(head)@Matrix.Rotation(math.radians(deg*w),4,ax)@Matrix.Translation(-head)
            for j in chain[k:]:acc[j]=R@acc[j]
        for i in chain:locs[FINGL.index(i)]=acc[PARENT[i]].inverted()@acc[i]
    return locs
def keyM(key):
    if key[1]=='via':
        # a point that far along the straight blend of its neighbours: two thirds of the way at half
        # the time evens out the speed of a long move that ends in a hold
        i=RIGHT.index(key);(MA,LA),(MB,LB)=keyM(RIGHT[i-1]),keyM(RIGHT[i+1]);f=key[2]
        return blendM(MA,MB,f),[blendM(x,y,f) for x,y in zip(LA,LB)]
    anc,name,off=key[1:4];rel,locs=LIB[name];A=rootM(anchors[anc]);M=A@rel
    if off:M=Matrix.Translation(A.to_quaternion()@Vector(off)*A.to_scale()[0])@M
    return M,locs
for k in range(N):
    t=k/FPS;f=1+k
    rp.matrix_basis=G0.inverted()@gun_at(t)
    bolt.rotation_quaternion=Quaternion((0,0,1),math.pi/2*lin(TURN,t));bolt.location=(0,0,0.078*lin(SLIDE,t));ck.location=(0,0,0.078*lin(SLIDE,t))
    pv=track(PACKET,t);pk.location=pv[:3];pk.rotation_quaternion=Euler(pv[3:],'YXZ').to_quaternion()
    uv=track(USED,t);used.location=uv[:3];used.rotation_quaternion=Euler(uv[3:],'YXZ').to_quaternion()
    for o in (rp,wm,bolt,ck,pk,used,ctl('packetRounds'),ctl('usedPacketRounds')):key_obj(o,f)
    for names,(lo,hi) in ((('Mesh_Packet','Mesh_Rounds'),PACKET_VISIBLE),(('Mesh_PacketUsed','Mesh_RoundsUsed'),USED_VISIBLE)):
        for n in names:
            o=bpy.data.objects[n];o.hide_render=not(lo<=t<hi);o.hide_viewport=o.hide_render
            o.keyframe_insert('hide_render',frame=f);o.keyframe_insert('hide_viewport',frame=f)
    bpy.context.view_layer.update()
    for a,b in zip(RIGHT,RIGHT[1:]):
        if t<=b[0]:break
    x=max(0,min(1,(t-a[0])/(b[0]-a[0]) if b[0]>a[0] else 1));ta,tb=len(a)>4,len(b)>4
    u=x if ta and tb else 1-(1-x)**2 if ta else x*x if tb else smooth(x)
    MA,LA=keyM(a);MB,LB=keyM(b);Mh=blendM(MA,MB,u);locs=[blendM(x,y,u) for x,y in zip(LA,LB)]
    if a[1]==b[1]=='bolt' and a[2] in KNOB_HOLDS and b[2] in KNOB_HOLDS:
        # from one hold of the knob to the next the hand turns about the knob it keeps in the fist
        # (blending about the wrist would swing the fingers through the bolt)
        ka,kb=KH[a[2]],KH[b[2]];pa,pb=MA@ka,MB@kb;kh=ka.lerp(kb,u)
        Mh=Matrix.Translation(pa.lerp(pb,u)-(Mh.to_3x3()@kh))@Matrix.LocRotScale(Vector(),*Mh.decompose()[1:])
    ml=rootM(anchors['gun'])@LGRIP[0]
    mats=[None]*len(BONES)
    lc=smooth((t-LEFT_CURL_T[0])/(LEFT_CURL_T[1]-LEFT_CURL_T[0]))*(1-smooth((t-LEFT_CURL_T[2])/(LEFT_CURL_T[3]-LEFT_CURL_T[2])))
    for side,a_,Mt,fing,fl in (('R',AR,Mh,FING,locs),('L',AL,ml,FINGL,curl_left(LGRIP[1],lc))):
        Snew=None
        if side=='R':
            ci=IDX['Bip002_R_Clavicle'];C=IB[ci].translation;S0=a_['S'];off=Vector(track(SHOULDER_R,t))
            q=(S0-C).rotation_difference(S0+off-C);Snew=C+q@(S0-C)
            cl,cr,cs=IB[ci].decompose();mats[ci]=Matrix.LocRotScale(cl,q@cr,cs)
        pole=Vector(track(POLE_R if side=='R' else POLE_L,t))
        # Wrist limit: past WRIST_MAX away from the idle hand/forearm relation the hand turns
        # about the thumb/index crotch (the knob, the packet's pinch) instead of bending further.
        for _ in range(4):
            swivel=a_['swivel'];mu,mf,mh,ok=solve(a_,Mt,pole,Snew)
            fdir=(mh.translation-mf.translation).normalized();rh=Mt.to_quaternion();want=rh@a_['faInHand']
            dev=fdir.angle(want)
            limit=WRIST_MAX
            if dev<=math.radians(limit)+1e-4:break
            a_['swivel']=swivel
            R=want.rotation_difference(fdir);R=Quaternion().slerp(R,(dev-math.radians(limit))/dev)
            _near=a if u<0.5 else b;pivot=Mt@((KH[_near[2]] if _near[1]=='bolt' else CLOC) if side=='R' else CLOC_L)
            Mt=Matrix.Translation(pivot)@R.to_matrix().to_4x4()@Matrix.Translation(-pivot)@Mt
        if not ok:unreach.append((side,round(t,3)))
        mats[a_['ua']],mats[a_['fa']],mats[a_['h']]=mu,mf,mh
        cur={a_['h']:mh}
        for i,L in zip(fing,fl):
            cur[i]=cur[PARENT[i]]@L;mats[i]=cur[i]
    # While the hand carries the packet the packet sits in the hand as finally solved (the wrist
    # limit may have turned the hand about its pinch); it is handed back to its own path for seating.
    w=1-smooth((t-PACKET_IN_HAND[1])/(PACKET_IN_HAND[2]-PACKET_IN_HAND[1])) if t>=PACKET_IN_HAND[0] else 0
    if w>0:
        held=mats[RH]@LIB['packet'][0].inverted()
        own=rootM(pk);P=blendM(own,held,w)
        pk.matrix_basis=rootM(rp).inverted()@P;key_obj(pk,f)
    set_pose_root(mats)
    key_bones(f)
sc.frame_start=1;sc.frame_end=N
print('frames',N,'unreachable (s)',[t_ for i_,(s_,t_) in enumerate(unreach) if i_==0 or abs(unreach[i_-1][1]-t_)>0.02 or i_==len(unreach)-1 or abs(unreach[i_+1][1]-t_)>0.02])
bpy.ops.wm.save_mainfile()

# ---------------- export ----------------
if EXPORT:
    act=bpy.data.actions['Animation_FpsHanYangReload']
    for o in [rig]+[o for o in sc.objects if o.name.startswith('Ctl_') or o.name.startswith('Mesh_')]:
        o.animation_data_create();o.animation_data.action=act
    out=Path(PROJECT)/'Animation/FirstPerson/Data_FpsHanYangAnimations.json'
    data=json.loads(out.read_text(encoding='utf-8'))
    idle=data['clips']['Idle']
    localPositions=json.loads(sc['fpsHoldingLocalPositions'])
    CTRL=['weaponMount','reloadPivot','part_bolt','part_cockingPiece','packetProp','packetRounds','usedPacketProp','usedPacketRounds']
    VIS={'packetProp':'Mesh_Packet','usedPacketProp':'Mesh_PacketUsed'}
    N=round(DURATION*FPS)+1
    bs=[[] for _ in BONES];cs={k:[] for k in CTRL};vis={k:[] for k in CTRL};contact=[]
    def Append(samples,p,r):
        q=[r.x,r.y,r.z,r.w]
        if samples and sum(a*b for a,b in zip(samples[-1][3:],q))<0:q=[-v for v in q]
        samples.append([*p,*q])
    for k in range(N):
        sc.frame_set(1+k);bpy.context.view_layer.update();t=k/FPS
        worlds=[three_root(i) for i in range(len(BONES))]
        for n,e in enumerate(META['bones']):
            parent=read(e['parentWorld']) if e['parent']<0 else worlds[e['parent']]
            p,r,_=(parent.inverted()@worlds[n]).decompose()
            if 'finger' in norm(BONES[n]):p=Vector(localPositions[e['name']])
            Append(bs[n],p,r)
        for key in CTRL:
            p,r,_=ctl(key).matrix_basis.decompose();Append(cs[key],p,r)
            vis[key].append(not bpy.data.objects[VIS[key]].hide_render if key in VIS else True)
        grip=t<=0.06 or t>=DURATION-0.02
        contact.append([1 if grip else 0,1])
    def Pack(samples):
        if max(abs(a-b) for s in samples for a,b in zip(samples[0],s))<1e-6:samples=samples[:1]
        return [round(v,7) for s in samples for v in s]
    state0=idle['state'][0]
    data['clips']['Reload']={'duration':DURATION,'count':N,'bones':[Pack(s) for s in bs],
        'controls':{k:Pack(v) for k,v in cs.items()},'visible':vis,'state':[state0]*N,'contact':contact}
    tmp=out.with_suffix('.json.tmp');tmp.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8');tmp.replace(out)
    man=out.with_name('Data_FpsAnimationManifest.json');m=json.loads(man.read_text(encoding='utf-8'))
    m['HanYang']={'clips':len(data['clips']),'bytes':out.stat().st_size};man.write_text(json.dumps(m,indent=2),encoding='utf-8')
    print('exported Reload',N,'frames, bytes',out.stat().st_size)

