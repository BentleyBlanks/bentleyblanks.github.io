"""Author continuous elbow poles for the repaired two-hand hilt frames.

Dynamic programming selects a continuous path on each two-bone elbow circle,
inside the wrist limit and below the hands during recovery. No runtime history
is required, so seeking and uninterrupted playback use the same branch.
"""
import json,math
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix
root=Path(FPS_GRIP_PROJECT_ROOT)
source=Path(FPS_GRIP_SOURCE)
trace=json.loads((root/'_shots/DadaoPower/Acceptance/Data_DadaoSwingTrace.json').read_text())
config=json.loads((source/'Data_FpsWeaponGrips.json').read_text())['Dadao']
clip=trace['clips'][0];frames=clip['frames']
start=clip['windup']/clip['duration'];end=(clip['windup']+clip['active'])/clip['duration']
def SourceTime(t):return t/start*.26 if t<start else .26+(t-start)/(end-start)*.20 if t<end else .46+(t-end)/(1-end)*.54
# The controller's shoulder offsets are evaluated from the same production curve.
module=(root/'Data_FpsDadaoSwing.mjs').read_text();data=json.loads(module[module.index('=')+1:].strip().rstrip(';'))
def Sample(t):
 f=t*120;i=min(119,int(f));mix=f-i
 return [a+(b-a)*mix for a,b in zip(data['frames'][i],data['frames'][i+1])]
def Matrix4(values):return np.array(values).reshape(4,4).T
boneIndices={''.join(c for c in name.lower() if c.isalnum()):i for i,name in enumerate(trace['boneNames'])}
def BonePoint(i,side,role):
 index=next(index for name,index in boneIndices.items() if name.endswith(side+role))
 cameraFromAnchor=Matrix4(trace['sourceFrames'][i]['weapon'])@np.linalg.inv(Matrix4(frames[i]['weapon']))
 return (np.linalg.inv(cameraFromAnchor)@Matrix4(trace['sourceFrames'][i]['bones'][index]))[:3,3]
theta=np.arange(240)*2*math.pi/240
chosen={};metrics=[]
for side,key,offset,sign in [('r','right',7,-1),('l','left',10,1)]:
 u=np.linalg.norm(BonePoint(0,side,'upperarm')-BonePoint(0,side,'forearm'))
 l=np.linalg.norm(BonePoint(0,side,'forearm')-BonePoint(0,side,'hand'))
 candidates=[];poles=[];valid=[];preference=[]
 for i,f in enumerate(frames):
  t=SourceTime(f['t']);row=Sample(t)
  shoulder=BonePoint(i,side,'upperarm')
  wrist=np.array(f['right' if side=='r' else 'left']);direction=wrist-shoulder;distance=np.linalg.norm(direction);direction/=distance
  cosine=np.clip((u*u+distance*distance-l*l)/(2*u*distance),-1,1);radius=u*math.sqrt(max(0,1-cosine*cosine))
  reference=np.array(config['bodyHip']['elbowPoles'][key]);reference-=direction*np.dot(reference,direction);reference/=np.linalg.norm(reference)
  across=np.cross(direction,reference)
  normals=reference[None,:]*np.cos(theta)[:,None]+across[None,:]*np.sin(theta)[:,None]
  elbow=shoulder+direction*(u*cosine)+normals*radius
  weapon=np.array(f['weapon']).reshape(4,4).T
  forward=weapon[:3,0]*sign;forward/=np.linalg.norm(forward)
  lower=wrist[None,:]-elbow;lower/=np.linalg.norm(lower,axis=1)[:,None]
  bend=np.arccos(np.clip(lower@forward,-1,1))*180/math.pi
  allowed=bend<=63.0
  if .46<=t<=.90:allowed&=elbow[:,1]<=wrist[1]-.037
  if not np.any(allowed):
   allowed=bend<=63.8
   if not np.any(allowed):raise RuntimeError(f'No anatomical elbow solution: {side} {t} {bend.min()}')
  if f['t'] in [0,1]:
   relaxed=min(64,max(35,float(bend.min())+12))
   allowed &= bend<=relaxed+.25
   winner=np.where(allowed)[0][np.argmin(np.linalg.norm(normals[allowed]-reference,axis=1))]
   allowed[:]=False;allowed[winner]=True
  candidates.append(elbow);poles.append(normals);valid.append(allowed)
  preference.append(.00002*np.sum((normals-reference)**2,axis=1))
 points=np.array(candidates);valid=np.array(valid);parents=[]
 cost=np.where(valid[0],preference[0],np.inf)
 for i in range(1,len(frames)):
  travel=np.sum((points[i-1,:,None,:]-points[i,None,:,:])**2,axis=2)
  transitions=cost[:,None]+travel
  parent=np.argmin(transitions,axis=0);cost=transitions[parent,np.arange(len(theta))]+preference[i]
  cost[~valid[i]]=np.inf;parents.append(parent)
 index=int(np.argmin(cost));indices=[index]
 for parent in reversed(parents):index=int(parent[index]);indices.append(index)
 indices.reverse();selected=points[np.arange(len(frames)),indices]
 chosen[side]=[poles[i][index].tolist() for i,index in enumerate(indices)]
 metrics.append({'side':side,'maximumElbowStepM':float(np.linalg.norm(np.diff(selected,axis=0),axis=1).max())})
rows=[[round(SourceTime(f['t']),9),*chosen['r'][i],*chosen['l'][i]] for i,f in enumerate(frames)]
(root/'_blender/Data_FpsDadaoElbowPoles.json').write_text(json.dumps({'source':'Blender anatomical elbow circles','rows':rows},separators=(',',':')),encoding='utf-8')
print(json.dumps(metrics))
