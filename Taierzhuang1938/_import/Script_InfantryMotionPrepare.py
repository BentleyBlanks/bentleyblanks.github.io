"""Select measured source intervals and resample rotations for the two original rigs."""
from pathlib import Path
import json
import numpy as np
from scipy.interpolate import CubicSpline
from scipy.ndimage import gaussian_filter1d
from scipy.spatial.transform import Rotation

runtime=Path.home()/'Downloads/GVHMR/InfantryActions_20260905'
conversion=np.array([[1.,0,0],[0,0,-1],[0,1,0]])
definitions={
 'RifleCrouchAdvance':{'source':'RifleCrouchAdvance','range':[9,114],'loop':True,'kind':'walk'},
 'StandToKneel':{'source':'RifleKneelTransition','range':[18,70],'loop':False,'kind':'kneel'},
 'KneelHold':{'source':'RifleKneelTransition','range':[70,96],'loop':True,'kind':'kneel'},
 'KneelToStand':{'source':'RifleKneelTransition','range':[101,148],'loop':False,'kind':'kneel'},
 'GrenadeThrow':{'source':'GrenadeThrow','range':[17,144],'loop':False,'kind':'throw'},
}
for name,cfg in definitions.items():
    m=np.load(runtime/'Capture'/cfg['source']/'Data_GvhmrMotion.npz')
    start,end=cfg['range']; times=np.arange(start,end+1,dtype=float)
    query=np.linspace(start,end,(end-start)*2+1); count=len(query)-1
    # Fix one heading per source so the down/hold/up clips share their exact facing frame.
    direction=conversion@m['worldGlobalRotations'][:20,0,:,2].mean(0)
    yaw=-np.pi/2-np.arctan2(direction[1],direction[0]);heading=Rotation.from_euler('z',yaw).as_matrix()
    rotations=[]
    for j in range(22):
        source=Rotation.from_matrix(m['worldGlobalRotations'][start:end+1,j])
        relative=(source[0].inv()*source).as_rotvec()
        if cfg['loop']:
            relative-=((times-start)/(end-start))[:,None]*relative[-1]
            relative[-1]=relative[0]
            relative[:-1]=gaussian_filter1d(relative[:-1],.8,axis=0,mode='wrap');relative[-1]=relative[0]
        else: relative=gaussian_filter1d(relative,.65,axis=0,mode='nearest')
        values=CubicSpline(times,relative,bc_type='periodic' if cfg['loop'] else 'natural')(query)
        rotations.append(heading@conversion@(source[0]*Rotation.from_rotvec(values)).as_matrix()@conversion.T)
    rotations=np.stack(rotations,axis=1)
    joints=m['worldJoints'][start:end+1]@(heading@conversion).T
    root=joints[:,0].copy(); travel=root[-1]-root[0]
    root[:,:2]-=root[0,:2]
    if cfg['loop']:
        root[:,:2]-=((times-start)/(end-start))[:,None]*travel[:2]
        root[:,:2]-=root[:,:2].mean(0)
    root[:,2]=0
    height=joints[:,0,2]-np.min(joints[:,[7,8],2],axis=1)
    if cfg['loop']:
        height-=(times-start)/(end-start)*(height[-1]-height[0]);height[-1]=height[0]
        root[-1]=root[0]
    heights=CubicSpline(times,gaussian_filter1d(height,1.1,mode='nearest'),bc_type='natural')(query)
    if cfg['loop']:
        heights-=np.linspace(0,1,len(heights))*(heights[-1]-heights[0]);heights[-1]=heights[0]
    root=CubicSpline(times,root,bc_type='periodic' if cfg['loop'] else 'natural')(query)
    sourceRest=m['worldRestJoints'][start:end+1].mean(0)@conversion.T
    relativeJoints=joints-joints[:,0,None]
    relativeJoints=CubicSpline(times,relativeJoints)(query)
    result={**cfg,'name':name,'fps':60,'cycleFrames':count,'sourceFrameRate':30,'durationSeconds':count/60,
        'sourceFrameIndices':query.tolist(),'headingRadians':float(yaw),'sourceTravelMeters':travel.tolist(),
        'sourceLegLength':float(np.linalg.norm(sourceRest[4]-sourceRest[1])+np.linalg.norm(sourceRest[7]-sourceRest[4])),
        'sourceRestJoints':sourceRest.tolist(),'rotations':rotations.tolist(),'rootOffsets':root.tolist(),
        'heightFromAnkles':heights.tolist(),'sourceRelativeJoints':relativeJoints.tolist()}
    (runtime/f'Data_{name}Motion.json').write_text(json.dumps(result),encoding='utf-8')
    print(name,count+1,'samples',round(count/60,3),'s')
(runtime/'Data_ClipSelection.json').write_text(json.dumps(definitions,indent=2),encoding='utf-8')
