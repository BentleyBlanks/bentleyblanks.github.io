"""Rebuild every catalogued video retarget from its actual raw recovery, without inference.

The immutable inventory is also the registration source. Never derive provenance
from a guessed revision number or silently substitute a different take.
"""
from pathlib import Path
import argparse, copy, hashlib, json
import numpy as np
from scipy.spatial.transform import Rotation, Slerp

def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--group',default='ReviewV7')
    args=parser.parse_args(); root=args.root
    out=root/'Models'/args.group; cache=root/'Models/_Cache'/args.group
    out.mkdir(parents=True,exist_ok=True); cache.mkdir(parents=True,exist_ok=True)
    inventory=out/'Data_SourceInventory.json'
    if not inventory.exists():
        catalog=json.loads((root/'Preview/Data_Catalog.json').read_text(encoding='utf-8'))
        selected=[a for a in catalog['actions'] if a['category'] in ['video_recovery','split_experiment']]
        inventory.write_text(json.dumps({'actions':selected},ensure_ascii=False,indent=2),encoding='utf-8')
    actions=json.loads(inventory.read_text(encoding='utf-8'))['actions']
    conversion=np.array([[1.,0,0],[0,0,-1],[0,1,0]])
    recipes={}; provenance=[]
    for action in actions:
        name=action['id']; latest=next(v for v in action['variants'] if v['id']==action['latestByFaction'].get('Nra',next(iter(action['latestByFaction'].values()))))
        review=latest['review']; cfg={'label':action['label'],'range':[s*review['recoveryFps'] for s in review['sourceRangeSeconds']],
            'loop':action['loop'],'cameraDistance':max(action.get('cameraDistance',4.5),5.0),'kind':'body',
            'review':copy.deepcopy(review),'category':action['category'],'sourceVariant':latest['id']}
        if name=='StretcherPair':
            cfg['kind']='pair';cfg['cameraDistance']=7.5;recipes[name]=cfg;continue
        rawPath=root/review['recoveryTracks'][0]['path']; raw=json.loads(rawPath.read_text(encoding='utf-8'))
        path=root/raw['sourceCache']; sha=hashlib.sha256(path.read_bytes()).hexdigest()
        if sha!=raw['sourceCacheSha256']:raise ValueError(f'{name}: recovery hash mismatch')
        data=np.load(path)
        if not np.array_equal(data['worldJoints'],np.array(raw['positions'])):raise ValueError(f'{name}: raw array mismatch')
        a,b=cfg['range']; query=np.linspace(a,b,round((b-a)*60/float(data['fps']))+1); ids=np.arange(len(data['worldJoints']))
        def At(values):
            shape=values.shape[1:];flat=values.reshape(len(values),-1)
            return np.stack([np.interp(query,ids,flat[:,i]) for i in range(flat.shape[1])],axis=1).reshape(len(query),*shape)
        transform=conversion@Rotation.from_euler('y',raw['viewerYawRadians']).as_matrix()
        allJoints=data['worldJoints']@transform.T
        joints=At(allJoints); relative=joints-joints[:,0:1]
        rotations=np.stack([transform@Slerp(ids,Rotation.from_matrix(data['worldGlobalRotations'][:,j]))(query).as_matrix()@conversion.T for j in range(22)],axis=1)
        roots=joints[:,0].copy();travel=roots[-1]-roots[0]
        isKneel=name in ['StandToKneel','KneelHold','KneelToStand','KneelSequence']
        roots[:,:2]-=allJoints[18,0,:2] if isKneel else roots[0,:2].copy()
        # A fixed source floor preserves flight and collapse timing. Surface
        # thickness is handled by whole-rig translation in the target baker.
        lowest=joints[:,:,2].min(1);floor=float(np.percentile(allJoints[18:149,:,2].min(1) if isKneel else lowest,5))
        roots[:,2]-=floor;clearance=np.maximum(0,lowest-floor)
        seam=0
        if cfg['loop']:
            roots[:,:2]-=np.linspace(0,1,len(roots))[:,None]*travel[:2]
            seam=max(4,min(12,(len(query)-1)//5))
            # The final <= 0.2 seconds alone closes the cycle. Both raw input
            # and pre-seam samples remain available for quantified comparison.
        originalRelative=relative.copy();originalRoots=roots.copy()
        if seam:
            def Closure(values):
                values=values.copy();delta=values[0]-values[-1]
                # Fit the final two samples as well as the endpoint: exact
                # discrete velocity continuity, with zero correction at entry.
                desiredPrevious=values[0]-(values[1]-values[0])
                u=1-1/seam;alpha=(desiredPrevious-values[-2]-delta*u*u)/(u*u*u-u*u);beta=delta-alpha
                for k in range(seam+1):
                    t=k/seam;values[-seam-1+k]+=alpha*t**3+beta*t*t
                return values
            relative=Closure(relative);roots=Closure(roots);clearance=np.maximum(0,Closure(clearance))
            for k in range(seam+1):
                t=k/seam;w=t*t*(3-2*t);ix=len(query)-seam-1+k
                for j in range(22):
                    prior=max(0,a-(seam-k)*float(data['fps'])/60)
                    target=transform@Slerp(ids,Rotation.from_matrix(data['worldGlobalRotations'][:,j]))([prior]).as_matrix()[0]@conversion.T
                    rotations[ix,j]=Slerp([0,1],Rotation.from_matrix([rotations[ix,j],target]))([w]).as_matrix()[0]
        if name.startswith(('Dadao','Bayonet')):cfg.update(kind='melee',weapon='Dadao' if name.startswith('Dadao') else 'Bayonet')
        elif name.startswith('CarryStretcher'):cfg['kind']='carry'
        elif name in ['RifleCrouchAdvance','RifleReadyIdle','RifleWalkForward','RifleSprint','RifleWalkBackward','RifleStrafeLeft','RifleStrafeRight','StandToKneel','KneelHold','KneelToStand','KneelSequence']:cfg['kind']='rifle'
        elif name in ['BackRifleRun','ProneCrawl','StandToProne','ProneToStand']:cfg['kind']='back'
        elif name=='GrenadeThrow':cfg['kind']='grenade'
        rest=data['worldRestJoints'].mean(0)@conversion.T
        motion={**cfg,'name':name,'fps':60,'cycleFrames':len(query)-1,'durationSeconds':(b-a)/float(data['fps']),
            'sourceFrameIndices':query.tolist(),'sourceFrameRate':float(data['fps']),'sourceTravelMeters':travel.tolist(),
            'sourceRestJoints':rest.tolist(),'sourceLegLength':float(np.linalg.norm(rest[4]-rest[1])+np.linalg.norm(rest[7]-rest[4])),
            'rotations':rotations.tolist(),'rootOffsets':roots.tolist(),'sourceRelativeJoints':relative.tolist(),
            'unclosedRelativeJoints':originalRelative.tolist(),'unclosedRoots':originalRoots.tolist(),
            'sourceClearance':clearance.tolist(),'sourceParents':data['parents'].tolist(),'sourceCache':raw['sourceCache'],
            'sourceCacheSha256':sha,'seamFrames':seam,'preserveRecoveredPose':True}
        if cfg.get('weapon')=='Bayonet':
            prop=np.load(path.with_name('Data_PropTrack.npz'))['worldPropRotations']
            motion['propRotations']=(transform@Slerp(ids,Rotation.from_matrix(prop))(query).as_matrix()).tolist()
        (cache/f'Data_{name}Motion.json').write_text(json.dumps(motion),encoding='utf-8')
        recipes[name]=cfg
        provenance.append({'id':name,'raw':review['recoveryTracks'][0]['path'],'cache':raw['sourceCache'],'cacheSha256':sha,
            'video':review['sourceVideo'],'videoSha256':hashlib.sha256((root/review['sourceVideo']).read_bytes()).hexdigest(),
            'range':cfg['range'],'seamFrames':seam})
        print(name,cfg['kind'],len(query),'frames',flush=True)
    (out/'Data_Recipes.json').write_text(json.dumps(recipes,ensure_ascii=False,indent=2),encoding='utf-8')
    (out/'Data_Production.json').write_text(json.dumps({'type':'retarget_only','newVideoGenerations':0,'newInferenceRuns':0,
        'recoveryPolicy':'Reuse verified original NPZ and original raw preview; no raw files rewritten','records':provenance},ensure_ascii=False,indent=2),encoding='utf-8')
    print('Prepared',len(recipes),'actions')

if __name__=='__main__':Main()
