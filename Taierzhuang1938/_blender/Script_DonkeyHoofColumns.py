"""Broader upper horn walls; preserve the bearing rim, height and hoof binding."""
import json
from pathlib import Path
import numpy as np

def Smooth(a,b,value):
    t=np.clip((value-a)/(b-a),0,1);return t*t*(3-2*t)

def ColumnField(points,masses,centres):
    result=np.array(points,dtype=float,copy=True);support=.17*Smooth(.006,.024,points[:,2])*(1-Smooth(.075,.135,points[:,2]))
    for label in range(4):result[:,0]+=(points[:,0]-centres[label])*support*Smooth(.80,.99,masses[:,label])
    return result

def ColumnJacobian(points,masses,centres):
    result=np.empty((len(points),3,3));epsilon=.00002
    for axis in range(3):
        a=points.copy();b=points.copy();a[:,axis]+=epsilon;b[:,axis]-=epsilon;result[:,:,axis]=(ColumnField(a,masses,centres)-ColumnField(b,masses,centres))/(2*epsilon)
    return result

def RoundHoofColumns(scene,skin):
    import bpy,bmesh
    from mathutils import Vector
    if scene.get('DonkeyHoofColumnsReport'):return json.loads(scene['DonkeyHoofColumnsReport'])
    if not scene.get('DonkeyForeSilhouetteReport'):raise RuntimeError('Hoof columns require the completed strict joint and foreleg fit')
    stems=['DonkeyFrontLeft','DonkeyFrontRight','DonkeyRearLeft','DonkeyRearRight'];masses=np.array([[sum(g.weight for g in v.groups if skin.vertex_groups[g.group].name.startswith(stem)) for stem in stems] for v in skin.data.vertices]);points=np.array([v.co for v in skin.data.vertices],dtype=float);centres=[]
    for label in range(4):
        sole=points[(points[:,2]<.006)&(masses[:,label]>.98),0]
        if len(sole)<20:raise RuntimeError('Missing protected hoof rim: '+stems[label])
        centres.append(float((sole.min()+sole.max())/2))
    centres=np.array(centres);target=ColumnField(points,masses,centres);distance=np.linalg.norm(target-points,axis=1);ids=np.flatnonzero(distance>1e-9);jac=ColumnJacobian(points[ids],masses[ids],centres);minimum=float(np.linalg.det(jac).min());protected=float(distance[(points[:,2]<=.006)|(points[:,2]>=.135)].max(initial=0))
    if minimum<.90 or distance.max()>.008 or protected>1e-9 or np.max(abs(target[:,1:]-points[:,1:]))>1e-9:raise RuntimeError('Hoof columns exceeded their orientation, displacement or protected bounds')
    normals=None
    if skin.data.has_custom_normals:
        allJac=ColumnJacobian(points,masses,centres);indices=np.array([loop.vertex_index for loop in skin.data.loops]);normals=np.array([n.vector for n in skin.data.corner_normals]);normals=np.einsum('nij,nj->ni',np.linalg.inv(allJac[indices]).transpose(0,2,1),normals);normals/=np.maximum(1e-12,np.linalg.norm(normals,axis=1))[:,None]
    for i in ids:skin.data.vertices[int(i)].co=Vector(target[i])
    if normals is not None:skin.data.normals_split_custom_set(normals.tolist())
    skin.data.update();bm=bmesh.new();bm.from_mesh(skin.data);boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(not e.is_manifold for e in bm.edges);volume=bm.calc_volume(signed=True);bm.free()
    if boundary or nonmanifold or volume<=0:raise RuntimeError('Hoof columns damaged the closed skin')
    scene['DonkeyReferenceBalancedHornCharts']=True
    report={'version':'20261027HoofColumnsV49','method':'17 percent partial X widening of middle/upper horn walls with a smooth return into the existing short-fur crown; measured original frontal wall at sourceY900 is about48pixels versus39.45 before correction; bearing rim, depth and height retained',
        'centresX':dict(zip(stems,centres.tolist())),'widthGain':.17,'lowerFadeM':[.006,.024],'upperFadeM':[.075,.135],'maximumDisplacementM':float(distance.max()),'minimumSampledJacobian':minimum,'maximumProtectedDisplacementM':protected,'verticesChanged':int(len(ids)),
        'boundaryEdges':boundary,'nonmanifoldEdges':nonmanifold,'signedVolumeM3':volume,'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'sideDepthAndHeightChanged':False,'normalTransform':'inverse-transpose local field Jacobian'}
    scene['DonkeyHoofColumnsReport']=json.dumps(report);(Path(scene['DonkeySourceRoot'])/'Review/Data_HoofColumns.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');return report
