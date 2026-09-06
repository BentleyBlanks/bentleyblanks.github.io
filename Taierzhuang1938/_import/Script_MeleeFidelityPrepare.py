"""Preserve the recovered performance; only coordinates and original limb lengths change."""
from pathlib import Path
import argparse,json,hashlib
import numpy as np
from scipy.spatial.transform import Rotation,Slerp

parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True)
args=parser.parse_args();root=args.root
sourceGroup='MeleeVideoV1';group='MeleeVideoV2'
out=root/'Models'/group;out.mkdir(parents=True,exist_ok=True)
cache=root/'Models/_Cache'/group;cache.mkdir(parents=True,exist_ok=True)
recipes=json.loads((root/'Models'/sourceGroup/'Data_Recipes.json').read_text(encoding='utf-8'))
conversion=np.array([[1.,0,0],[0,0,-1],[0,1,0]])
for name,cfg in recipes.items():
 motion=json.loads((root/'Models/_Cache'/sourceGroup/f'Data_{name}Motion.json').read_text(encoding='utf-8'))
 sourceCache=root/'Models/_Cache'/sourceGroup/cfg['source']/'Data_GvhmrMotion.npz';data=np.load(sourceCache)
 query=np.array(motion['sourceFrameIndices']);ids=np.arange(len(data['worldJoints']))
 transform=Rotation.from_euler('z',cfg['headingRadians']).as_matrix()@conversion
 joints=data['worldJoints']@transform.T
 def At(values):
  shape=values.shape[1:];values=values.reshape(len(values),-1)
  return np.stack([np.interp(query,ids,values[:,i]) for i in range(values.shape[1])],axis=1).reshape(len(query),*shape)
 relative=joints-joints[:,0:1]
 roots=joints[:,0].copy();roots[:,:2]-=roots[cfg['range'][0],:2].copy()
 roots[:,2]-=min(joints[cfg['range'][0],[10,11],2])
 motion['sourceRelativeJoints']=At(relative).tolist();motion['rootOffsets']=At(roots).tolist()
 motion['sourceParents']=data['parents'].tolist()
 motion['rotations']=np.stack([transform@Slerp(ids,Rotation.from_matrix(data['worldGlobalRotations'][:,j]))(query).as_matrix()@conversion.T for j in range(22)],axis=1).tolist()
 motion['preserveRecoveredPose']=True
 motion['corrections']=['Original BIP segment lengths; unfiltered recovered segment directions and source timing','Prop fitted to recovered wrists; no arm IK or wrist relocation','No foot locking or per-frame floor projection replacing source performance']
 (cache/f'Data_{name}Motion.json').write_text(json.dumps(motion),encoding='utf-8')
 raw=json.loads((root/f'Models/RecoveryPreview/Data_V1_{name}RawJoints.json').read_text(encoding='utf-8'))
 (root/f'Models/RecoveryPreview/Data_V2_{name}RawJoints.json').write_text(json.dumps(raw,separators=(',',':')),encoding='utf-8')
 rawWrists={'sourceCache':sourceCache.relative_to(root).as_posix(),'sourceCacheSha256':hashlib.sha256(sourceCache.read_bytes()).hexdigest(),
  'fps':float(data['fps']),'joints':[20,21],'worldRotations':data['worldGlobalRotations'][:,[20,21]].tolist()}
 (root/f'Models/RecoveryPreview/Data_V2_{name}RawWristRotations.json').write_text(json.dumps(rawWrists,separators=(',',':')),encoding='utf-8')
 cfg['preserveRecoveredPose']=True
(out/'Data_Recipes.json').write_text(json.dumps(recipes,ensure_ascii=False,indent=2),encoding='utf-8')
print('Prepared',len(recipes),'faithful retarget selections; original recovery reused without modification')
