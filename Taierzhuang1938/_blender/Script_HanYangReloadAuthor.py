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
camera), bolt turn/slide, the Mannlicher packet, and both arms. The arms use an
analytic two-bone solve in rig-root space that keeps the fixed bone lengths and
the idle elbow-plane relation; hand frames and finger shapes come from the
calibrated procedural reload captured from the game (Script_HanYangReloadCapture),
except the COD-style knob hold, built from target finger/palm directions.
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
# gun poses: (dp xyz recoil space, rx pitch up, ry yaw left, rz roll right-side-up) about PIVOT
POSES={
 'idle':((0,0,0),0,0,0),
 'A':((0.0076,-0.0129,0.0473),0.1031,-0.1121,0.0025),
 'B':((0.0117,0.0055,0.03),0.3952,0.2654,0.0459),
 'C':((-0.0032,-0.0251,0.0351),-0.0091,0.0404,0.2067),
}
# gun keys (t, pose); eased between keys
GUN=[(0,'idle'),(0.25,'A'),(0.72,'A'),(1.15,'B'),(2.52,'B'),(2.74,'C'),(2.98,'C'),(3.38,'idle'),(3.40,'idle')]
# rifle reactions (t, [dx,dy,dz recoil space, rx,ry,rz]) and hold drift [(amplitude, Hz, phase)] x6
EFFORT_HZ=3.4; EFFORT_DECAY=9.0; EFFORT_TAIL_S=0.5
EFFORT=[(0.30,(0.002,0.003,0,0.012,0,0.035)),(0.55,(0,-0.002,0.006,-0.010,-0.006,0.008)),
        (1.85,(0,-0.004,0.002,-0.014,0.004,0)),(2.08,(0,-0.005,0,-0.016,0,-0.008)),
        (2.86,(-0.002,0.002,-0.008,0.008,0.006,0)),(2.97,(0.002,-0.003,0,-0.012,0,-0.03))]
DRIFT=[(0.0015,0.31,0.0),(0.0020,0.23,1.1),(0.0012,0.17,2.0),(0.006,0.27,0.4),(0.005,0.19,2.6),(0.008,0.21,1.7)]
TURN=[(0,0),(0.27,0),(0.37,1),(2.88,1),(2.98,0),(3.40,0)]
SLIDE=[(0,0),(0.40,0),(0.55,1),(2.75,1),(2.88,0),(3.40,0)]
# packet in gun space: (t, x,y,z, rx,ry,rz)
PACKET=[(1.30,0.18,-0.22,0.08,0.9,0,1.2),(1.58,0.16,-0.12,0.03,0.6,0,0.8),(1.73,0.06,0.09,-0.14,0.25,0.04,0.25),
        (1.85,0,0.051,-0.187,0,0,0),(2.00,0,0.051,-0.187,0,0,0),(2.14,0,0.051-0.068,-0.187,0,0,0),(3.40,0,0.051-0.068,-0.187,0,0,0)]
PACKET_VISIBLE=(1.30,2.20)
# (from, last full, released): the packet rides in the solved hand, then eases back to PACKET
PACKET_IN_HAND=(1.30,1.70,1.82)
USED=[(0.98,0,0.051-0.068,-0.187,0,0,0),(1.03,0,0.125,-0.19,0.1,0,0.1),(1.13,0.10,0.20,-0.15,0.6,0.2,1.2),(1.25,0.25,0.18,-0.05,1.2,0.4,2.4)]
USED_VISIBLE=(0.98,1.25)
# right hand keys: (t, anchor, pose, offset in anchor-local metres)
# Keys marked T are waypoints the hand passes through without stopping.
T=True
RIGHT=[
 (0.00,'gun','grip',None),(0.06,'gun','gripClear',None,T),(0.10,'gun','gripClear',(0.05,0.07,0.03),T),
 (0.21,'bolt','boltCOD',(0.05,0.05,0.04),T),(0.27,'bolt','boltCOD',(0.025,0.0,0.0),T),(0.33,'bolt','boltCOD',(0.0125,0.0,0.0),T),
 (0.37,'bolt','boltCOD',None),(0.67,'bolt','boltCOD',None),(0.71,'bolt','boltCOD',(0.024,0.0,0.0),T),
 (0.75,'bolt','boltCOD',(0.045,0.0,0.02),T),(0.90,'gun','gripClear',(0.10,0.02,0.04),T),(0.98,'gun','latch',None),(1.10,'gun','latch',(0.08,-0.13,0.07),T),
 (1.30,'packet','packet',None),(1.80,'packet','packet',(0.004,0.008,0.0),T),(1.85,'packet','packet',(0.008,0.014,0.0)),
 (1.93,'packet','press',(0.01,0.04,0.01)),(2.00,'packet','press',None),(2.14,'packet','press',None),
 (2.22,'packet','press',(0.03,0.05,0.02),T),(2.45,'gun','gripClear',(0.12,0.10,0.10),T),
 (2.64,'bolt','boltCODClose',(0.035,0.0,0.03),T),(2.75,'bolt','boltCODClose',None),(2.88,'bolt','boltCODClose',None),
 (2.95,'bolt','boltCODClose',(0.03,0.0,0.0),T),(3.02,'bolt','boltCODClose',(0.03,0.05,0.04),T),(3.14,'gun','gripClear',(0.10,0.05,0.03),T),
 (3.28,'gun','gripClear',None,T),(3.38,'gun','grip',None),(3.40,'gun','grip',None),
]

# COD-style knob hold (reference 0.63-1.00 s): back of the hand up and to the right, index and
# middle straight across the top of the receiver, the knob ball in the thumb/index crotch.
# Directions in gun space (x right, y up, z toward the stock), for the lifted handle.
BOLT_COD={
 'boltCOD':{'knob':(0.0515,0,0),'finger':(-1.0,0.30,-0.10),'palm':(-0.20,-0.60,-0.80),'shape':('boltClear','bolt',0.25),'shift':(0.004,-0.004,-0.022)},
 'boltCODClose':{'knob':(0.0515,0,0),'finger':(-1.0,0.30,-0.10),'palm':(-0.20,-0.60,-0.80),'shape':('boltClear','bolt',0.25),'shift':(0.014,0.004,-0.022)},
}

# right elbow pole offsets (root space, metres): the forearm comes in from above on the bolt beats
# left elbow tucked in and down while the rifle is turned to the bolt (keeps the sleeve off the receiver)
POLE_L=[(0,0,0,0),(0.03,0,0,0),(0.17,0.15,-0.25,0),(0.72,0.15,-0.25,0),(1.15,-0.04,-0.03,0),(2.52,-0.04,-0.03,0),(2.74,-0.06,-0.05,0),(2.98,-0.06,-0.05,0),(3.38,0,0,0),(3.40,0,0,0)]
POLE_R=[(0,0,0,0),(0.12,0,0,0),(0.27,0.05,0.30,0.05),(0.67,0.05,0.30,0.05),(0.82,0,0,0),(2.60,0,0,0),(2.75,0.05,0.25,0),(2.98,0.05,0.25,0),(3.20,0,0,0),(3.40,0,0,0)]

# right shoulder reach (root space, metres; the clavicle turns to carry it) on the bolt beats
SHOULDER_R=[(0,0,0,0),(0.10,0,0,0),(0.27,0.0,0.03,-0.06),(0.67,0.0,0.03,-0.06),(0.85,0,0,0),(1.45,0,0,0),(1.70,0.0,0.02,-0.06),(2.20,0.0,0.02,-0.06),(2.45,0,0,0),(2.55,0,0,0),(2.74,0.03,0.03,-0.07),(2.98,0.03,0.03,-0.07),(3.20,0,0,0),(3.40,0,0,0)]

# ---------------- authoring ----------------
from mathutils import Euler
cap=json.load(open(FOLDER+'/Data_Capture.json'))
E=cap['runs']['empty']['frames'];TF=cap['runs']['tactical']['frames'];I=cap['idle']
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
 'press':lib_entry(E[60],'packetProp'),'latch':lib_entry(TF[28],'gunRoot')}
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
def gun_at(t):
    # The held rifle answers the working hand: damped kicks at the mechanical beats plus a slow
    # drift while it is held still (the reference never freezes the rifle), about the left palm.
    off=[0.0]*6
    for at,pose in EFFORT:
        age=t-at
        if 0<age<EFFORT_TAIL_S:
            k=math.exp(-EFFORT_DECAY*age)*math.sin(2*math.pi*EFFORT_HZ*age)*(1-smooth(age/EFFORT_TAIL_S))
            for i in range(6):off[i]+=pose[i]*k
    env=smooth((t-0.10)/0.25)*(1-smooth((t-3.15)/0.2))
    for i,(amp,hz,ph) in enumerate(DRIFT):off[i]+=env*amp*math.sin(2*math.pi*hz*t+ph)
    piv=Vector(PIVOT);R=Euler(off[3:],'YXZ').to_matrix().to_4x4()
    return Matrix.Translation(off[:3])@gun_base(t)@Matrix.Translation(piv)@R@Matrix.Translation(-piv)
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
def two_frame(a,b):
    x=a.normalized();y=(b-b.dot(x)*x).normalized();z=x.cross(y);return Matrix((x,y,z)).transposed()
def cod_rel(spec):
    """Hand pose on the lifted knob from target finger / palm directions in gun space."""
    bolt.rotation_quaternion=Quaternion((0,0,1),math.pi/2);bolt.location=(0,0,0);bpy.context.view_layer.update()
    B=rootM(bolt);Gm=rootM(anchors['gun']);gq=Gm.to_quaternion()
    knob=B@Vector(spec['knob'])
    fdT=(gq@Vector(spec['finger'])).normalized();pnT=(gq@Vector(spec['palm'])).normalized()
    Rt=two_frame(fdT,pnT)@two_frame(FD,PN).inverted()
    S=IB[RH].to_scale();RS=Rt.to_4x4()@Matrix.Diagonal((*S,1))
    pos=knob-(RS@CLOC.to_4d()).to_3d()+(gq@Vector(spec.get('shift',(0,0,0))))*Gm.to_scale()[0]
    M=RS.copy();M.translation=pos
    bolt.rotation_quaternion=Quaternion();bpy.context.view_layer.update()
    return B.inverted()@M
for name,spec in BOLT_COD.items():
    LIB[name]=(cod_rel(spec),LIB[spec['shape']][1] if isinstance(spec['shape'],str) else [blendM(x,y,spec['shape'][2]) for x,y in zip(LIB[spec['shape'][0]][1],LIB[spec['shape'][1]][1])])
def keyM(key):
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
    ml=rootM(anchors['gun'])@LGRIP[0]
    mats=[None]*len(BONES)
    for side,a_,Mt,fing,fl in (('R',AR,Mh,FING,locs),('L',AL,ml,FINGL,LGRIP[1])):
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
            pivot=Mt@(CLOC if side=='R' else CLOC_L)
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

