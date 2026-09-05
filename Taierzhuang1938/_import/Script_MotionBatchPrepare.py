"""Prepare reviewed source ranges for an extensible batch, plus unmodified raw joints."""
from pathlib import Path
import argparse,hashlib,json
import numpy as np
from scipy.ndimage import gaussian_filter1d,percentile_filter,binary_closing,binary_opening
from scipy.interpolate import CubicSpline
from scipy.spatial.transform import Rotation,Slerp

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,required=True)
parser.add_argument('--group',default='NextTenV1')
parser.add_argument('--ids',nargs='+',required=True)
args=parser.parse_args()
root=args.root
runtime=root/'Models/_Cache'/args.group
recipes=json.loads((root/'Models'/args.group/'Data_Recipes.json').read_text(encoding='utf-8'))
conversion=np.array([[1.,0,0],[0,0,-1],[0,1,0]])
names=['Pelvis','LeftHip','RightHip','Spine1','LeftKnee','RightKnee','Spine2','LeftAnkle','RightAnkle','Spine3','LeftFoot','RightFoot','Neck','LeftCollar','RightCollar','Head','LeftShoulder','RightShoulder','LeftElbow','RightElbow','LeftWrist','RightWrist']
def Smooth(t):return t*t*(3-2*t)
for name in args.ids:
    cfg=recipes[name]
    path=runtime/cfg.get('source',name)/'Data_GvhmrMotion.npz'
    data=np.load(path)
    a,b=cfg['range']
    assert 0<=a<b<len(data['worldJoints'])
    ids=np.arange(a,b+1)
    query=np.linspace(a,b,(b-a)*2+1)
    forward=data['worldGlobalRotations'][:20,0,:,2].mean(0)
    direction=conversion@forward
    heading=Rotation.from_euler('z',-np.pi/2-np.arctan2(direction[1],direction[0])).as_matrix()
    transform=heading@conversion
    allJoints=gaussian_filter1d(data['worldJoints']@transform.T,.6,axis=0)
    floor=gaussian_filter1d(percentile_filter(np.min(allJoints[:,[10,11],2],axis=1),25,size=25),8)
    roots=allJoints[:,0].copy()
    travel=roots[b]-roots[a]
    origin=roots[a,:2].copy()
    roots[:,:2]-=origin
    roots[:,2]-=floor
    if cfg['loop']:roots[:,:2]-=((np.arange(len(roots))-a)/(b-a))[:,None]*travel[:2]
    roots=roots[ids].copy()
    seam=min(6,(b-a)//5)
    rotations=[]
    for j in range(22):
        original=Rotation.from_matrix(data['worldGlobalRotations'][:,j])
        relative=(original[0].inv()*original).as_rotvec()
        filtered=original[0]*Rotation.from_rotvec(gaussian_filter1d(relative,.55,axis=0))
        q=filtered[ids].as_quat()
        if cfg['loop']:
            for k in range(seam+1):
                target=filtered[max(0,a-seam+k)].as_quat()
                q[-seam-1+k]=Slerp([0,1],Rotation.from_quat([q[-seam-1+k],target]))([Smooth(k/seam)]).as_quat()[0]
        rotations.append(transform@Slerp(ids,Rotation.from_quat(q))(query).as_matrix()@conversion.T)
    if cfg['loop']:
        delta=roots[0]-roots[-1]
        dv=(roots[1]-roots[0])-(roots[-1]-roots[-2])
        for k in range(seam+1):
            t=k/seam
            roots[-seam-1+k]+=(-2*t**3+3*t*t)*delta+(t**3-t*t)*seam*dv
    contacts=[]
    for toe in [10,11]:
        speed=np.linalg.norm(np.gradient(allJoints[:,toe,:2],axis=0)*30,axis=1)
        height=allJoints[:,toe,2]-floor
        threshold=max(.16,float(np.percentile(speed[a:b],55)))
        mask=(height<.065)&(speed<threshold)
        mask=binary_opening(binary_closing(mask,structure=np.ones(4)),structure=np.ones(3))
        weights=gaussian_filter1d(mask.astype(float),1.1)
        values=np.interp(query,np.arange(len(weights)),weights)
        if cfg['loop']:
            for k in range(seam*2+1):
                t=Smooth(k/(seam*2))
                values[-seam*2-1+k]=(1-t)*values[-seam*2-1+k]+t*np.interp(a-seam+k/2,np.arange(len(weights)),weights)
        contacts.append(values)
    rest=data['worldRestJoints'].mean(0)@conversion.T
    result={**cfg,'name':name,'fps':60,'cycleFrames':len(query)-1,'durationSeconds':(b-a)/30,
        'sourceFrameIndices':query.tolist(),'sourceFrameRate':30,'sourceTravelMeters':travel.tolist(),
        'sourceRestJoints':rest.tolist(),'sourceLegLength':float(np.linalg.norm(rest[4]-rest[1])+np.linalg.norm(rest[7]-rest[4])),
        'rotations':np.stack(rotations,axis=1).tolist(),'rootOffsets':CubicSpline(ids,roots)(query).tolist(),
        'contactWeights':np.stack(contacts,axis=1).tolist(),
        'sourceRelativeJoints':CubicSpline(ids,allJoints[ids]-allJoints[ids,0,None])(query).tolist(),
        'seamBlendSourceFrames':seam if cfg['loop'] else 0}
    (runtime/f'Data_{name}Motion.json').write_text(json.dumps(result),encoding='utf-8')
    positions=data['worldJoints']
    raw={'schemaVersion':1,'stage':'GVHMR worldJoints before retarget, filtering, IK or loop correction',
        'sourceCache':path.relative_to(root).as_posix(),'sourceCacheSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'fps':float(data['fps']),'parents':data['parents'].tolist(),'jointNames':names,'positions':positions.tolist(),
        'viewerYawRadians':float(-np.arctan2(forward[0],forward[2])),
        'viewerOrigin':[float(positions[0,0,0]),0,float(positions[0,0,2])]}
    (root/f'Models/RecoveryPreview/Data_V1_{name}RawJoints.json').write_text(json.dumps(raw,separators=(',',':')),encoding='utf-8')
    print(name,'range',cfg['range'],'duration',result['durationSeconds'],'travel',np.round(travel,3),flush=True)
