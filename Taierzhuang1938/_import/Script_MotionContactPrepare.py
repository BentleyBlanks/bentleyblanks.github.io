"""Prepare floor-contact transitions; raw inference is exported without corrections."""
from pathlib import Path
import argparse,hashlib,json
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.interpolate import CubicSpline
from scipy.spatial.transform import Rotation,Slerp

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--group',default='NextTenV1')
parser.add_argument('--clip',required=True)
args=parser.parse_args()
root=args.root;name=args.clip;runtime=root/'Models/_Cache'/args.group
cfg=json.loads((root/'Models'/args.group/'Data_Recipes.json').read_text(encoding='utf-8'))[name]
path=runtime/name/'Data_GvhmrMotion.npz';data=np.load(path)
a,b=cfg['range'];ids=np.arange(a,b+1);query=np.linspace(a,b,(b-a)*2+1)
conversion=np.array([[1.,0,0],[0,0,-1],[0,1,0]])
ha,hb=cfg.get('headingRange',[0,20]);forward=data['worldGlobalRotations'][ha:hb,0,:,2].mean(0)
if cfg.get('headingMode')=='bodyAxis':forward=(data['worldJoints'][ha:hb,15]-data['worldJoints'][ha:hb,0]).mean(0);forward[1]=0
direction=conversion@forward;heading=Rotation.from_euler('z',-np.pi/2-np.arctan2(direction[1],direction[0])).as_matrix();transform=heading@conversion
rawJoints=data['worldJoints']@transform.T;joints=gaussian_filter1d(rawJoints,.6,axis=0)
roots=joints[:,0].copy();origin=roots[a,:2].copy();roots[:,:2]-=origin
floor=float(np.median(np.min(rawJoints[ha:hb,[10,11],2],axis=1)))
roots[:,2]-=floor;travel=roots[b]-roots[a]
if cfg['loop']:roots[:,:2]-=((np.arange(len(roots))-a)/(b-a))[:,None]*travel[:2]
roots=CubicSpline(ids,roots[ids])(query)
relativeJoints=CubicSpline(ids,joints[ids]-joints[ids,0,None])(query)
rotations=[]
for j in range(22):
    original=Rotation.from_matrix(data['worldGlobalRotations'][:,j])
    relative=(original[0].inv()*original).as_rotvec()
    filtered=original[0]*Rotation.from_rotvec(gaussian_filter1d(relative,.55,axis=0))
    rotations.append(transform@Slerp(np.arange(len(joints)),filtered)(query).as_matrix()@conversion.T)
rotations=np.stack(rotations,axis=1)
start,end=cfg.get('bodyContactRange',[0,1])
t=np.clip((query-start)/(end-start),0,1);weights=t*t*(3-2*t)
if cfg.get('contactDirection')=='out':weights=1-weights
if cfg.get('contactDirection')=='all':weights[:]=1
if cfg.get('contactDirection')=='none':weights[:]=0
planeAngle=0
if cfg.get('planeFrame') is not None:
    support=rawJoints[cfg['planeFrame'],[0,1,2,7,8,12,15,16,17,18,19,20,21]]
    _,_,axes=np.linalg.svd(support-support.mean(0));normal=axes[-1]*np.sign(axes[-1,2])
    correction=Rotation.align_vectors([[0,0,1]],[normal])[0];planeAngle=float(np.degrees(correction.magnitude()))
    curve=Slerp([0,1],Rotation.from_quat(np.stack([Rotation.identity().as_quat(),correction.as_quat()])))
    for i,w in enumerate(weights):rotations[i]=curve([w]).as_matrix()[0]@rotations[i]
if cfg['loop']:
    seam=min(12,len(query)//5)
    for k in range(seam+1):
        index=len(query)-seam-1+k;t=k/seam;w=t*t*(3-2*t)
        roots[index]=(1-w)*roots[index]+w*roots[0]
        relativeJoints[index]=(1-w)*relativeJoints[index]+w*relativeJoints[0]
        for j in range(22):rotations[index,j]=Slerp([0,1],Rotation.from_matrix(np.stack([rotations[index,j],rotations[0,j]])))([w]).as_matrix()[0]
hold=round((cfg.get('holdFrame',b)-a)*2)
if not cfg['loop'] and hold<len(query)-1:
    seam=min(20,hold)
    for i in range(hold-seam,hold):
        t=(i-(hold-seam))/seam;w=t*t*(3-2*t)
        roots[i]=(1-w)*roots[i]+w*roots[hold]
        relativeJoints[i]=(1-w)*relativeJoints[i]+w*relativeJoints[hold]
        for j in range(22):rotations[i,j]=Slerp([0,1],Rotation.from_matrix(np.stack([rotations[i,j],rotations[hold,j]])))([w]).as_matrix()[0]
    roots[hold:]=roots[hold];rotations[hold:]=rotations[hold];relativeJoints[hold:]=relativeJoints[hold];weights[hold:]=weights[hold]
rest=data['worldRestJoints'].mean(0)@conversion.T
result={**cfg,'name':name,'fps':60,'cycleFrames':len(query)-1,'durationSeconds':(b-a)/30,'settleFrame':hold,
    'sourceFrameIndices':query.tolist(),'sourceFrameRate':30,'sourceRestJoints':rest.tolist(),
    'sourceLegLength':float(np.linalg.norm(rest[4]-rest[1])+np.linalg.norm(rest[7]-rest[4])),
    'sourceTravelMeters':travel.tolist(),'rotations':rotations.tolist(),'rootOffsets':roots.tolist(),
    'sourceRelativeJoints':relativeJoints.tolist(),'bodyContactWeights':weights.tolist(),
    'rawCache':path.relative_to(root).as_posix(),'rawSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
    'supportPlaneCorrectionDegrees':planeAngle,
    'corrections':['Mild temporal filtering and subframe interpolation','Source-reviewed body support weights and rigid support-plane correction','Retarget-only final hold or local loop seam']}
(runtime/f'Data_{name}Motion.json').write_text(json.dumps(result),encoding='utf-8')
names=['Pelvis','LeftHip','RightHip','Spine1','LeftKnee','RightKnee','Spine2','LeftAnkle','RightAnkle','Spine3','LeftFoot','RightFoot','Neck','LeftCollar','RightCollar','Head','LeftShoulder','RightShoulder','LeftElbow','RightElbow','LeftWrist','RightWrist']
positions=data['worldJoints'];raw={'schemaVersion':1,'stage':'GVHMR worldJoints before any retarget or contact correction',
    'sourceCache':path.relative_to(root).as_posix(),'sourceCacheSha256':result['rawSha256'],'fps':float(data['fps']),
    'parents':data['parents'].tolist(),'jointNames':names,'positions':positions.tolist(),
    'viewerYawRadians':float(-np.arctan2(forward[0],forward[2])),'viewerOrigin':[float(positions[0,0,0]),0,float(positions[0,0,2])]}
(root/f'Models/RecoveryPreview/Data_V1_{name}RawJoints.json').write_text(json.dumps(raw,separators=(',',':')),encoding='utf-8')
print(name,'prepared; support correction',planeAngle,'degrees; hold',hold,flush=True)
