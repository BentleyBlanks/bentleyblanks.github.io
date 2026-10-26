"""Fit lateral eye orientation with one continuous map after the joint recipe."""
import json,math
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector


def Smooth(a,b,value):
    t=np.clip((value-a)/(b-a),0,1);return t*t*(3-2*t)


def OrbitalField(points,centres):
    result=np.asarray(points,dtype=np.float64).copy()
    for centre in centres:
        delta=result-centre;radius=np.linalg.norm(delta,axis=1)
        weight=1-Smooth(.032,.09,radius)
        angle=math.radians(12)*(1 if centre[0]<0 else -1)*weight
        c,s=np.cos(angle),np.sin(angle);x,y=delta[:,0].copy(),delta[:,1].copy()
        result[:,0]=centre[0]+x*c-y*s;result[:,1]=centre[1]+x*s+y*c
        result[:,0]+=(.003 if centre[0]<0 else -.008)*weight
        result[:,1]-=.002*weight
    return result


def FieldJacobian(points,centres):
    result=np.empty((len(points),3,3));epsilon=.00005
    for axis in range(3):
        plus=points.copy();minus=points.copy();plus[:,axis]+=epsilon;minus[:,axis]-=epsilon
        result[:,:,axis]=(OrbitalField(plus,centres)-OrbitalField(minus,centres))/(2*epsilon)
    return result


def FitOrbitalOrientation(scene,skin,rig,collection):
    if scene.get('DonkeyOrbitalFitReport'):return json.loads(scene['DonkeyOrbitalFitReport'])
    if not scene.get('DonkeyBrowHeightReport'):raise RuntimeError('Orbital fit requires the post-joint eye-height fit')
    inverse=rig.matrix_world.inverted();centres=[]
    for side in ['Left','Right']:
        eye=bpy.data.objects['DonkeyEye'+side];matrix=inverse@eye.matrix_world
        centres.append(sum((matrix@v.co for v in eye.data.vertices),Vector())/len(eye.data.vertices))
    centres=np.array(centres);objects={};minimum=1;protected=0
    for obj in list(collection.all_objects):
        if obj.type!='MESH':continue
        matrix=inverse@obj.matrix_world;back=matrix.inverted()
        points=np.array([matrix@v.co for v in obj.data.vertices],dtype=np.float64)
        target=OrbitalField(points,centres);moves=np.linalg.norm(target-points,axis=1);ids=np.flatnonzero(moves>1e-9)
        if obj==skin:protected=float(moves[(points[:,1]<=1.0)|(points[:,2]<1.0)].max(initial=0))
        if not len(ids):continue
        jacobian=FieldJacobian(points[ids],centres);minimum=min(minimum,float(np.linalg.det(jacobian).min()))
        loopNormals=None
        if obj.data.has_custom_normals:
            vertices=np.array([loop.vertex_index for loop in obj.data.loops]);original=np.array([n.vector for n in obj.data.corner_normals])
            normalToRig=np.array(matrix.to_3x3().inverted().transposed());normalToObject=np.array(back.to_3x3().inverted().transposed())
            mapped=original@normalToRig.T;allJacobian=FieldJacobian(points,centres)
            mapped=np.einsum('nij,nj->ni',np.linalg.inv(allJacobian[vertices]).transpose(0,2,1),mapped);mapped=mapped@normalToObject.T
            mapped/=np.maximum(1e-12,np.linalg.norm(mapped,axis=1))[:,None];loopNormals=mapped
        for i in ids:obj.data.vertices[int(i)].co=back@Vector(target[i])
        if loopNormals is not None:obj.data.normals_split_custom_set(loopNormals.tolist())
        obj.data.update();objects[obj.name]={'verticesChanged':int(len(ids)),'maximumDisplacementM':float(moves.max())}
    if protected>1e-8 or minimum<=.85:raise RuntimeError('Orbital fit moved protected anatomy or folded its field')
    report={'version':'20261026OrbitalFitV41','method':'common compact lateral rotation of the closed skin, corneas, wet lids and hood after V35 joint fitting; two-view centre offsets retain measured eye height',
        'eyeCentresBeforeM':centres.tolist(),'eyeCentresAfterM':OrbitalField(centres,centres).tolist(),'outwardRotationDegrees':12,
        'centreOffsetsM':[[.003,-.002,0],[-.008,-.002,0]],'constantCoreRadiusM':.032,'supportRadiusM':.09,
        'minimumSampledJacobian':minimum,'maximumProtectedDisplacementM':protected,'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'objects':objects}
    scene['DonkeyOrbitalFitReport']=json.dumps(report)
    base=Path(scene['DonkeySourceRoot']);(base/'Review/Data_OrbitalFit.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    return report
