"""Preserve continuous recovery; close selected gait cycles only near the seam."""
from pathlib import Path
import argparse,json
import numpy as np
from scipy.ndimage import gaussian_filter1d,percentile_filter,binary_closing,binary_opening
from scipy.interpolate import CubicSpline
from scipy.spatial.transform import Rotation,Slerp
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);args=parser.parse_args()
runtime=args.root/'Models/_Cache/ReviewV2';conversion=np.array([[1.,0,0],[0,0,-1],[0,1,0]])
definitions={
 'CarryStretcherFront':{'source':'CarryStretcherFront','range':[137,197],'loop':True,'kind':'carry'},
 'CarryStretcherRear':{'source':'CarryStretcherRear','range':[137,197],'loop':True,'kind':'carry'},
 'WoundedLimp':{'source':'WoundedLimp','range':[30,137],'loop':True,'kind':'limp'},
 'RifleCrouchAdvance':{'source':'RifleCrouchAdvance','range':[30,129],'loop':True,'kind':'rifle'},
 'KneelSequence':{'source':'RifleKneelTransition','range':[18,148],'loop':False,'kind':'kneel'},
}
def Smooth(t):return t*t*(3-2*t)
for name,cfg in definitions.items():
 m=np.load(runtime/cfg['source']/'Data_GvhmrMotion.npz');a,b=cfg['range'];ids=np.arange(a,b+1);query=np.linspace(a,b,(b-a)*2+1);count=len(query)
 direction=conversion@m['worldGlobalRotations'][:20,0,:,2].mean(0);yaw=-np.pi/2-np.arctan2(direction[1],direction[0]);heading=Rotation.from_euler('z',yaw).as_matrix();transform=heading@conversion
 allJoints=gaussian_filter1d(m['worldJoints']@transform.T,.65,axis=0);joints=allJoints[ids]
 floor=gaussian_filter1d(percentile_filter(np.min(allJoints[:,[10,11],2],axis=1),25,size=25),8)
 root=allJoints[:,0].copy();origin=root[a,:2].copy();travel=root[b]-root[a];root[:,:2]-=origin
 root[:,2]-=floor
 if cfg['loop']:root[:,:2]-=((np.arange(len(root))-a)/(b-a))[:,None]*travel[:2]
 roots=root[ids].copy();rotations=[];seam=6
 for j in range(22):
  source=Rotation.from_matrix(m['worldGlobalRotations'][:,j]);relative=(source[0].inv()*source).as_rotvec();relative=gaussian_filter1d(relative,.55,axis=0)
  full=source[0]*Rotation.from_rotvec(relative);q=full[ids].as_quat()
  if cfg['loop']:
   for k in range(seam+1):
    q[-seam-1+k]=Slerp([0,1],Rotation.from_quat([q[-seam-1+k],full[a-seam+k].as_quat()]))([Smooth(k/seam)]).as_quat()[0]
  if name=='KneelSequence':
   for k in range(seam+1):
    q[101-a-seam+k]=Slerp([0,1],Rotation.from_quat([q[101-a-seam+k],full[70-seam+k].as_quat()]))([Smooth(k/seam)]).as_quat()[0]
    q[101-a+k]=Slerp([0,1],Rotation.from_quat([full[70+k].as_quat(),full[101+k].as_quat()]))([Smooth(k/seam)]).as_quat()[0]
  resampled=Slerp(ids,Rotation.from_quat(q))(query).as_matrix();rotations.append(transform@resampled@conversion.T)
 if cfg['loop']:
  # Local Hermite correction: exact position AND tangent at the loop seam.
  delta=roots[0]-roots[-1];v0=(roots[1]-roots[0]);v1=(roots[-1]-roots[-2]);dv=v0-v1
  for k in range(seam+1):
   t=k/seam;roots[-seam-1+k]+=(-2*t**3+3*t*t)*delta+(t**3-t*t)*seam*dv
 if name=='KneelSequence':
  for k in range(seam+1):
   t=Smooth(k/seam);roots[101-a-seam+k]=(1-t)*root[101-seam+k]+t*root[70-seam+k]
   roots[101-a+k]=(1-t)*root[70+k]+t*root[101+k]
 rotations=np.stack(rotations,axis=1);roots=CubicSpline(ids,roots)(query)
 contacts=[]
 for foot,toe in [(7,10),(8,11)]:
  speed=np.linalg.norm(np.gradient(allJoints[:,toe,:2],axis=0)*30,axis=1);height=allJoints[:,toe,2]-floor
  threshold=max(.16,float(np.percentile(speed[a:b],55)));raw=(height<.065)&(speed<threshold)
  raw=binary_closing(raw,structure=np.ones(4));raw=binary_opening(raw,structure=np.ones(3));weights=gaussian_filter1d(raw.astype(float),1.1)
  values=np.interp(query,np.arange(len(weights)),weights)
  if cfg['loop']:
   for k in range(seam*2+1):
    t=k/(seam*2);values[-seam*2-1+k]=(1-Smooth(t))*values[-seam*2-1+k]+Smooth(t)*np.interp(a-seam+k/2,np.arange(len(weights)),weights)
  if name=='KneelSequence':
   for k in range(seam*2+1):
    t=Smooth(k/(seam*2));values[(101-a-seam)*2+k]=(1-t)*values[(101-a-seam)*2+k]+t*np.interp(70-seam+k/2,np.arange(len(weights)),weights)
    values[(101-a)*2+k]=(1-t)*np.interp(70+k/2,np.arange(len(weights)),weights)+t*np.interp(101+k/2,np.arange(len(weights)),weights)
  contacts.append(values)
 rest=m['worldRestJoints'].mean(0)@conversion.T
 result={**cfg,'name':name,'fps':60,'cycleFrames':count-1,'durationSeconds':(count-1)/60,'sourceFrameIndices':query.tolist(),'sourceFrameRate':30,
   'sourceTravelMeters':travel.tolist(),'sourceLegLength':float(np.linalg.norm(rest[4]-rest[1])+np.linalg.norm(rest[7]-rest[4])),
   'sourceRestJoints':rest.tolist(),'rotations':rotations.tolist(),'rootOffsets':roots.tolist(),'contactWeights':np.stack(contacts,1).tolist(),
   'sourceRelativeJoints':CubicSpline(ids,joints-joints[:,0,None])(query).tolist(),'seamBlendSourceFrames':seam if cfg['loop'] else 0}
 (runtime/f'Data_{name}Motion.json').write_text(json.dumps(result),encoding='utf-8');print(name,'duration',result['durationSeconds'],'contacts',np.round(np.mean(contacts,axis=1),2))
(runtime/'Data_ClipSelection.json').write_text(json.dumps(definitions,indent=2),encoding='utf-8')
