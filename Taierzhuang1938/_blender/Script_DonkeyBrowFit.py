"""Move the closed eye/hood surfaces together to the measured reference height."""
import bpy,json
from pathlib import Path
import numpy as np
from mathutils import Vector


def EyeField(points,centres):
    result=points.copy()
    for centre in centres:
        radius=np.linalg.norm(result-centre,axis=1);t=np.clip(radius/.09,0,1);weight=1-t*t*(3-2*t);result[:,2]-=.005*weight
    return result


def FieldJacobian(points,centres):
    result=np.empty((len(points),3,3));epsilon=.00005
    for axis in range(3):
        plus=points.copy();minus=points.copy();plus[:,axis]+=epsilon;minus[:,axis]-=epsilon;result[:,:,axis]=(EyeField(plus,centres)-EyeField(minus,centres))/(2*epsilon)
    return result


def FitEyeHeight(scene,skin,rig,collection):
    if scene.get('DonkeyBrowHeightReport'):return json.loads(scene['DonkeyBrowHeightReport'])
    inverse=rig.matrix_world.inverted();centres=[]
    for side in ['Left','Right']:
        eye=bpy.data.objects['DonkeyEye'+side];matrix=inverse@eye.matrix_world;centres.append(sum((matrix@v.co for v in eye.data.vertices),Vector())/len(eye.data.vertices))
    centres=np.array(centres);objects={};minimum=1;protected=0
    for obj in collection.all_objects:
        if obj.type!='MESH':continue
        matrix=inverse@obj.matrix_world;back=matrix.inverted();points=np.array([matrix@v.co for v in obj.data.vertices],dtype=np.float64);target=EyeField(points,centres);moves=np.linalg.norm(target-points,axis=1);ids=np.flatnonzero(moves>1e-9)
        if obj==skin:protected=float(moves[(points[:,1]<=1.0)|(points[:,2]<1.0)].max(initial=0))
        if not len(ids):continue
        jacobian=FieldJacobian(points[ids],centres);minimum=min(minimum,float(np.linalg.det(jacobian).min()))
        loopNormals=None
        if obj.data.has_custom_normals:
            vertices=np.array([loop.vertex_index for loop in obj.data.loops]);normalToRig=np.array(matrix.to_3x3().inverted().transposed());normalToObject=np.array(back.to_3x3().inverted().transposed());original=np.array([n.vector for n in obj.data.corner_normals]);allJacobian=FieldJacobian(points,centres)
            mapped=original@normalToRig.T;mapped=np.einsum('nij,nj->ni',np.linalg.inv(allJacobian[vertices]).transpose(0,2,1),mapped);mapped=mapped@normalToObject.T;mapped/=np.maximum(1e-12,np.linalg.norm(mapped,axis=1))[:,None];loopNormals=mapped
        for i in ids:obj.data.vertices[int(i)].co=back@Vector(target[i])
        if loopNormals is not None:obj.data.normals_split_custom_set(loopNormals.tolist())
        obj.data.update();objects[obj.name]={'verticesChanged':len(ids),'maximumDisplacementM':float(moves.max())}
    if protected>1e-8 or minimum<=.70:raise RuntimeError('Eye-height fit moved protected anatomy or folded its field')
    report={'version':'20261026BrowHeightV39','method':'common compact vertical map of skin, globe, lids and pale hood; reference frontal/side eye height corrected without recutting the closed socket','eyeCentresBeforeM':centres.tolist(),'eyeCentresAfterM':EyeField(centres,centres).tolist(),'maximumCentreDownshiftM':.005,'radiusM':.09,'minimumSampledJacobian':minimum,'maximumProtectedDisplacementM':protected,'bonesChanged':0,'weightsChanged':False,'trianglesAdded':0,'objects':objects}
    scene['DonkeyBrowHeightReport']=json.dumps(report);return report
