"""Track the reference reload's rifle and turn its motion into the clip's per-frame sway.

python Taierzhuang1938/_blender/Script_HanYangReloadSway.py <frames dir> <task folder>
<frames dir>: the reference as f_001.png... (640x360, 29.97 fps), e.g.
  ffmpeg -i COD_WWII_三八式_02_换弹_有声.mp4 -vf "fps=30000/1001,scale=640:-1" f_%03d.png
<task folder>: HanYangReload_20261102 (reads Data_Capture.json, writes Data_ReferenceTrack.json).
Writes _blender/Data_HanYangReloadSway.json next to this script.

1. The muzzle (front sight) is followed by template matching with a velocity prediction; the
   support hand's top edge by skin segmentation (the blob that reaches the bottom edge). The
   idle ends, where the hand hides under the rifle or the template slides onto the rear sight,
   are pinned to the hand-marked idle hold (muzzle 347,187; hand 360,218).
2. The clip plays under a narrower view (Data_FpsSkeletalAnimation `view.depthScale`: the
   layer's depth squeezed, so rifle and hands read ~1.5x bigger, as in the reference, whose
   stock and support hand are that much bigger than ours at the same muzzle position). The
   zoom lifts the muzzle off the reference's; each held pose is turned about the left palm
   (pitch, yaw) until the muzzle is back on the point marked on the reference.
3. Relative to the reference's own steady position in each held pose (mean over the hold), its
   muzzle and hand motion is added to the clip's key poses; each 60 fps frame solves the small
   turn about the left palm (plus a lateral/vertical shift) that puts our muzzle and support hand
   on those targets. Rotations use mathutils' Euler((rx,ry,rz),'YXZ') = Rz Rx Ry, as the scene does.
Poses, view and sway all go to Data_HanYangReloadSway.json; the Author script reads them and
checks the view against Data_FpsSkeletalAnimation.mjs.
"""
import sys,os
FRAMES=sys.argv[1];TASK=sys.argv[2];HERE=os.path.dirname(os.path.abspath(__file__))
os.chdir(FRAMES)
# ---------------- 1. track ----------------
import cv2,numpy as np,json,math
fr=[cv2.imread('f_%03d.png'%i) for i in range(1,121)]
g=[cv2.cvtColor(f,cv2.COLOR_BGR2GRAY).astype(np.float32) for f in fr]
p=np.array([347.,187.]);v=np.zeros(2);H=9;out=[]
tmpl=g[0][int(p[1])-H:int(p[1])+H+1,int(p[0])-H:int(p[0])+H+1].copy();prevAng=None
def angle_at(gray,p,prev):
    best=None
    for a in np.arange(10,170,1.0):
        r=math.radians(a);vals=[]
        for d in range(12,70,2):
            x=p[0]+d*math.cos(r);y=p[1]+d*math.sin(r)
            if 0<=x<639 and 0<=y<359:vals.append(gray[int(y),int(x)])
        if len(vals)<15:continue
        m=np.mean(vals)+ (0.4*abs(a-prev) if prev is not None else 0)
        if best is None or m<best[0]:best=(m,a)
    return best[1] if best else None
for i in range(120):
    if i>0:
        q=p+v;R=40;x0,y0=int(q[0])-R-H,int(q[1])-R-H
        win=g[i][max(0,y0):y0+2*(R+H)+1,max(0,x0):x0+2*(R+H)+1]
        res=cv2.matchTemplate(win,tmpl,cv2.TM_CCOEFF_NORMED);_,mv,_,ml=cv2.minMaxLoc(res)
        pn=np.array([max(0,x0)+ml[0]+H,max(0,y0)+ml[1]+H],float);v=0.6*(pn-p)+0.4*v;p=pn
        nt=g[i][int(p[1])-H:int(p[1])+H+1,int(p[0])-H:int(p[0])+H+1]
        if nt.shape==tmpl.shape: tmpl=0.7*tmpl+0.3*nt
    else: mv=1
    a=angle_at(g[i],p,prevAng);prevAng=a
    out.append((i+1,float(p[0]),float(p[1]),a,float(mv)))

t=out;out=[]
for row in t:
    n=row[0];im=cv2.imread('f_%03d.png'%n);hsv=cv2.cvtColor(im,cv2.COLOR_BGR2HSV)
    m=cv2.inRange(hsv,(3,70,90),(22,200,255))
    m=cv2.morphologyEx(m,cv2.MORPH_OPEN,np.ones((5,5),np.uint8))
    k,lab,st,cen=cv2.connectedComponentsWithStats(m)
    best=None
    for i in range(1,k):
        x,y,w,h,a=st[i]
        if a<400 or y+h<355:continue
        cx=x+w/2
        if not(220<cx<470):continue
        if best is None or a>st[best][4]:best=i
    if best is None:out.append(list(row[:5])+[None]);continue
    ys,xs=np.where(lab==best);top=ys.min();sel=xs[ys<=top+6]
    out.append(list(row[:5])+[[float(np.median(sel)),float(top)]])
json.dump(out,open(os.path.join(TASK,'Data_ReferenceTrack.json'),'w'))

# ---------------- 2. poses under the reload view ----------------
import math
from scipy.optimize import least_squares
import json,numpy as np
from scipy.spatial.transform import Rotation as Rot, Slerp
cap=json.load(open(os.path.join(TASK,'Data_Capture.json')))
def M(v):return np.array(v).reshape(4,4).T
def TRS(p,q,s=(1,1,1)):
    m=np.eye(4);m[:3,:3]=Rot.from_quat(q).as_matrix()*np.array(s);m[:3,3]=p;return m
ch=cap['info']['chain'][0];camRec=M(cap['idle']['camRoot'])@np.linalg.inv(TRS(ch['p'],ch['q'],ch['s']))
wm=cap['idle']['controls']['weaponMount'];G0=TRS(wm['p'],wm['q'])
FOV=math.radians(55);ASP=16/9
PIV=np.array([-0.0116,-0.0005,-0.4027]);MUZ=np.array([0,0.03857,-0.995])
GUN=[(0,'idle'),(0.25,'A'),(0.72,'A'),(1.15,'B'),(2.52,'B'),(2.74,'C'),(2.98,'C'),(3.38,'idle'),(3.40,'idle')]
def euler(rx,ry,rz):return Rot.from_euler('yxz',[ry,rx,rz]).as_matrix()   # mathutils Euler((rx,ry,rz),'YXZ') = Rz Rx Ry
def about_piv(dp,rx,ry,rz,base):
    R=np.eye(4);R[:3,:3]=euler(rx,ry,rz);T=np.eye(4);T[:3,3]=PIV;Ti=np.eye(4);Ti[:3,3]=-PIV;D=np.eye(4);D[:3,3]=dp
    return D@base@T@R@Ti
def pose(name):dp,rx,ry,rz=POSES[name];return about_piv(dp,rx,ry,rz,G0)
def view_w(c):
    keys=VIEW_WEIGHT
    for (t0,w0),(t1,w1) in zip(keys,keys[1:]):
        if c<=t1:return w0+(w1-w0)*smooth((c-t0)/(t1-t0))
    return keys[-1][1]
def smooth(x):x=min(1,max(0,x));return x*x*(3-2*x)
def blend(A,B,u):
    r=Slerp([0,1],Rot.from_matrix([A[:3,:3],B[:3,:3]]))(u).as_matrix();m=np.eye(4);m[:3,:3]=r;m[:3,3]=A[:3,3]*(1-u)+B[:3,3]*u;return m
def base(t):
    for a,b in zip(GUN,GUN[1:]):
        if t<=b[0]:return blend(pose(a[1]),pose(b[1]),smooth((t-a[0])/(b[0]-a[0]) if b[0]>a[0] else 1))
    return pose(GUN[-1][1])
VIEW=0.65   # = Data_FpsSkeletalAnimation HanYang view.depthScale / .weight
VIEW_WEIGHT=[(0,0),(0.72,0),(1.15,1),(2.98,1),(3.38,0)]
def proj(G,p,w=1.0):
    """Screen point (0..1) of gun-space p with the reload view at weight w (camera depth squeezed)."""
    c=camRec@G@np.array([*p,1]);x,y,z=c[:3];z*=1+(VIEW-1)*w;tt=math.tan(FOV/2)
    return np.array([0.5+0.5*(x/-z)/(tt*ASP),0.5-0.5*(y/-z)/tt])
# Held poses fitted under the plain 55 deg view (muzzle / knob / support hand on the reference);
# under the reload view each is pitched and yawed about the left palm to put the muzzle back on
# the front sight marked on the reference (640x360 normalised, at clip 0.45 / 1.6 / 2.85 s).
POSES={'idle':((0,0,0),0,0,0),'A':((0.0076,-0.0129,0.0473),0.1031,-0.1121,0.0025),
 'B':((0.0235,-0.0094,0.0011),0.3386,0.2901,-0.1412),'C':((-0.0046,-0.0158,0.0042),0.0283,0.0414,0.2233)}
MUZZLE_MARK={'A':(0.595,0.492),'B':(0.4875,0.311),'C':(0.517,0.492)}
# While the packet is pressed in (B) the loading port stays on the frame's right edge as in the
# reference (it goes in at ~0.9, 0.85): B may also shift a few cm sideways / up to keep it there.
FEED=np.array([0,0.041,-0.187]);FEED_MARK=(0.90,0.85)
for n,uv in MUZZLE_MARK.items():
    dp,rx,ry,rz=POSES[n];w=view_w({'A':0.5,'B':2.0,'C':2.85}[n])
    if n=='B':
        f=lambda v:np.concatenate([proj(about_piv((dp[0]+v[2],dp[1]+v[3],dp[2]),v[0],v[1],rz,G0),MUZ,w)-np.array(uv),
            proj(about_piv((dp[0]+v[2],dp[1]+v[3],dp[2]),v[0],v[1],rz,G0),FEED,w)-np.array(FEED_MARK),[v[2]*0.3,v[3]*0.3]])
        r=least_squares(f,[rx,ry,0,0]);dp=(round(dp[0]+r.x[2],4),round(dp[1]+r.x[3],4),dp[2])
    else:r=least_squares(lambda v:proj(about_piv(dp,v[0],v[1],rz,G0),MUZ,w)-np.array(uv),[rx,ry])
    POSES[n]=(dp,round(r.x[0],4),round(r.x[1],4),rz);G=about_piv(*POSES[n],G0)
    print(n,'view %.2f pitch/yaw %.4f %.4f -> %.4f %.4f'%(w,rx,ry,r.x[0],r.x[1]),'dp',dp,'muzzle',proj(G,MUZ,w).round(3),'port',proj(G,FEED,w).round(3))

# ---------------- 3. sway ----------------
# ---- reference track (640x360, 29.97 fps), repaired at the idle ends
t=json.load(open(os.path.join(TASK,'Data_ReferenceTrack.json')))
mz=np.array([[r[1],r[2]] for r in t]);hd=np.array([r[5] for r in t],float)
IDLE_M=np.array([347.,187.]);IDLE_H=np.array([360.,218.])
for i in range(0,8):hd[i]=IDLE_H
hd[7]=IDLE_H*0.5+hd[8]*0.5
# end: muzzle template slid onto the rear sight after frame 114; ease back to the idle hold
for i in range(114,120):
    u=smooth((i-113)/6);mz[i]=mz[113]*(1-u)+IDLE_M*u;hd[i]=hd[113]*(1-u)+IDLE_H*u
mz/=[640,360];hd/=[640,360]
def ref_at(arr,c):
    f=(c+0.33)*29.97;i=int(math.floor(f));u=f-i;i=min(max(i,0),118);return arr[i]*(1-u)+arr[i+1]*u
# The reference's steady screen positions in each held pose (mean over the hold); its motion is
# taken relative to these, so its swing, overshoot and timing come through on our key poses.
cs=lambda a,b:np.linspace(a,b,30)
FIT={'idle':(IDLE_M/[640,360],IDLE_H/[640,360])}
for name,(a,b) in {'A':(0.25,0.72),'B':(1.15,2.52),'C':(2.74,2.98)}.items():
    FIT[name]=(np.mean([ref_at(mz,c) for c in cs(a,b)],0),np.mean([ref_at(hd,c) for c in cs(a,b)],0))
def ref_base(arr,c):
    j=0 if arr is mz else 1
    for a,b in zip(GUN,GUN[1:]):
        if c<=b[0]:u=smooth((c-a[0])/(b[0]-a[0]) if b[0]>a[0] else 1);return FIT[a[1]][j]*(1-u)+FIT[b[1]][j]*u
    return FIT[GUN[-1][1]][j]
N=205;out=[];x=np.zeros(6);rows=[]
for k in range(N):
    c=k/60;B=base(c)
    rm=ref_at(mz,c)-ref_base(mz,c);rh=ref_at(hd,c)-ref_base(hd,c)
    w=view_w(c);Tm=proj(B,MUZ,w)+rm;Th=proj(B,PIV,w)+rh
    def res(v):
        G=about_piv(v[:3],v[3],v[4],v[5],B)
        return np.concatenate([(proj(G,MUZ,w)-Tm)*10,(proj(G,PIV,w)-Th)*10,[v[2]*20,v[5]*2,v[0]*2,v[1]*2]])
    x=least_squares(res,x).x;rows.append(x.copy())
    out.append(dict(c=round(c,4),rm=rm.round(4).tolist(),rh=rh.round(4).tolist()))
rows=np.array(rows)
# 30 fps source: light 5-tap smoothing at 60 fps removes tracking jitter, ends pinned to zero
k5=np.array([1,4,6,4,1])/16;sm=np.vstack([np.convolve(np.pad(rows[:,i],2,mode='edge'),k5,'valid') for i in range(6)]).T
w=np.array([smooth(k/6) for k in range(N)])*np.array([smooth((N-1-k)/6) for k in range(N)]);sm*=w[:,None]
json.dump({'fps':60,'source':'COD WWII Type 38 reload, muzzle + support-hand screen track (clip s = ref s - 0.33)',
  'view':{'depthScale':VIEW,'weight':VIEW_WEIGHT},'poses':{k:[list(v[0]),*v[1:]] for k,v in POSES.items()},
  'columns':['dx','dy','dz','rx','ry','rz'],'rows':[[round(v,5) for v in r] for r in sm]},open(os.path.join(HERE,'Data_HanYangReloadSway.json'),'w'))
print('max |d| m',np.abs(sm[:,:3]).max(0).round(4),'max rot deg',np.degrees(np.abs(sm[:,3:]).max(0)).round(2))
for k in range(0,N,15):print(round(k/60,2),np.round(sm[k],4),out[k]['rm'],out[k]['rh'])
