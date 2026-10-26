import numpy as np

def Smooth(a,b,value):
    t=np.clip((value-a)/(b-a),0,1);return t*t*(3-2*t)

def ChestField(points,mass):
    result=np.asarray(points,dtype=float).copy();x,y,z=result.T;ax=np.abs(x)
    area=Smooth(.35,.43,y)*(1-Smooth(.82,.96,y))*Smooth(.47,.57,z)*(1-Smooth(.67,.78,z))*(1-Smooth(.06,.10,ax))*Smooth(.10,.70,mass)
    centre=np.exp(-(x/.080)**2);outer=Smooth(.055,.135,ax)
    result[:,2]+=(-.022*centre+.004*outer)*area
    result[:,1]-=.006*outer*area
    return result

def ChestJacobian(points,mass):
    result=np.empty((len(points),3,3));epsilon=.00002
    for axis in range(3):
        plus=points.copy();minus=points.copy();plus[:,axis]+=epsilon;minus[:,axis]-=epsilon
        result[:,:,axis]=(ChestField(plus,mass)-ChestField(minus,mass))/(2*epsilon)
    return result


def ApplyChestVolume(scene,skin):
    import bpy,json
    from pathlib import Path
    from mathutils import Vector
    if scene.get('DonkeyChestVolumeReport'):return json.loads(scene['DonkeyChestVolumeReport'])
    if not scene.get('DonkeyJointPlanesReport') or not scene.get('DonkeyHindArchBindingReport'):raise RuntimeError('Chest volume requires the completed coordinate-matched joint fit and root binding')
    groups={g.index:g.name for g in skin.vertex_groups};mass=np.array([sum(g.weight for g in v.groups if groups[g.group] in ['DonkeyChestPivot','DonkeyThoraxPivot']) for v in skin.data.vertices])
    points=np.array([v.co for v in skin.data.vertices],dtype=float);target=ChestField(points,mass);moves=np.linalg.norm(target-points,axis=1);ids=np.flatnonzero(moves>1e-9)
    jac=ChestJacobian(points[ids],mass[ids]);minimum=float(np.linalg.det(jac).min())
    protected=(points[:,2]<=.47)|(points[:,2]>=.78)|(points[:,1]<=.35)|(points[:,1]>=.96)|(np.abs(points[:,0])>=.10)|(mass<=.10)
    protectedMove=float(moves[protected].max(initial=0))
    if moves.max()>.026 or minimum<.60 or protectedMove>1e-9:raise RuntimeError('Chest volume field exceeded protected anatomy or orientation bounds')
    normals=None
    if skin.data.has_custom_normals:
        allJac=ChestJacobian(points,mass);loops=np.array([l.vertex_index for l in skin.data.loops]);normals=np.array([n.vector for n in skin.data.corner_normals]);normals=np.einsum('nij,nj->ni',np.linalg.inv(allJac[loops]).transpose(0,2,1),normals);normals/=np.maximum(1e-12,np.linalg.norm(normals,axis=1))[:,None]
    for i in ids:skin.data.vertices[int(i)].co=Vector(target[i])
    if normals is not None:skin.data.normals_split_custom_set(normals.tolist())
    skin.data.update();namespace={};file=Path(scene['DonkeyCartProject'])/'_blender/Script_DonkeyChest.py';exec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),namespace);integrity=namespace['CheckChestIntegrity'](skin)
    if integrity['boundaryEdges'] or integrity['nonmanifoldEdges'] or integrity['chestCrossings']:raise RuntimeError('Chest volume damaged closed skin')
    report={'version':'20261026ChestVolumeV46','method':'compact ownership-weighted chest map lowers the central sternum and rounds back the outer underside; smooth transition to the existing forelimb roots',
        'maximumDisplacementM':float(moves.max()),'maximumCentreDownshiftM':float(np.max(points[:,2]-target[:,2])),'maximumProtectedDisplacementM':protectedMove,'minimumSampledJacobian':minimum,
        'verticesChanged':int(len(ids)),'integrity':integrity,'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'sourceHeightRangeM':[.47,.78],
        'normalTransform':'inverse-transpose local field Jacobian','scope':'after strict V35 joint recipe, V37 root binding and V44 joint planes; foot, hind-body and head regions protected'}
    scene['DonkeyChestVolumeReport']=json.dumps(report);return report
