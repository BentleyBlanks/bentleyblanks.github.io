"""Actual visible rays for the V81 ear crown replacing an obsolete plane datum."""
from pathlib import Path
import hashlib,importlib.util,json,numpy as np
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV105';data=json.loads((root/'Acceptance/Data_JointBodyCameraStudyV105.json').read_text());current=json.loads((root/'Acceptance/Data_ActualFixedBodyV105.json').read_text());source=json.loads((base/'ReferenceV104/Inputs/Data_FixedFrontObservationsV104.json').read_text());observation=next(r for r in source['rows']if r['name']=='FarUpperEdge');family=data['baselineCameraFamily']['cameras']
file=Path(__file__).with_name('Script_VerifyType94GameV100.py');spec=importlib.util.spec_from_file_location('Corner105Actual',file);actual=importlib.util.module_from_spec(spec);spec.loader.exec_module(actual);model=actual.Read(current['sourceGlb'],False);assert model['sha256']==current['sha256'];meshes={}
for name,(index,_)in model['nodes'].items():
    if index is None:continue
    p,t=actual.Mesh(model,name);w=(np.c_[p,np.ones(len(p))]@model['worldMatrices'][name].T)[:,:3];p=w[:,[0,2,1]]*[1,-1,1]-[0,0,current['groundCompensationM']];meshes[name]=(p,t,p.min(axis=0),p.max(axis=0))
def Ray(pixel,c):
    assert not any(c['distortion']);r=np.asarray(c['rotationCameraFromBlender']);t=np.asarray(c['translationCameraFromBlender']);k=np.asarray(c['k']);d=r.T@np.r_[(np.asarray(pixel)-k[:2,2])/[k[0,0],k[1,1]],1.];return-r.T@t,d/np.linalg.norm(d)
def Project(p,c):
    v=np.asarray(c['rotationCameraFromBlender'])@p+c['translationCameraFromBlender'];k=np.asarray(c['k']);return v[:2]/v[2]*[k[0,0],k[1,1]]+k[:2,2]
def Hits(eye,direction):
    result=[]
    for name,(points,faces,lo,hi)in meshes.items():
        a=(lo-eye)/direction;b=(hi-eye)/direction
        if np.maximum(a,b).min()<max(0,np.minimum(a,b).max()):continue
        tri=points[faces];a=tri[:,0];e1=tri[:,1]-a;e2=tri[:,2]-a;h=np.cross(direction,e2);det=np.sum(e1*h,axis=1);valid=abs(det)>1e-12;inv=np.zeros(len(faces));inv[valid]=1/det[valid];s=eye-a;u=np.sum(s*h,axis=1)*inv;q=np.cross(s,e1);v=q@direction*inv;distance=np.sum(e2*q,axis=1)*inv;ids=np.flatnonzero(valid&(u>=-1e-7)&(v>=-1e-7)&(u+v<=1.0000001)&(distance>1e-6))
        if not len(ids):continue
        i=int(ids[np.argmin(distance[ids])]);point=eye+direction*distance[i];normal=np.cross(e1[i],e2[i]);normal/=np.linalg.norm(normal);result.append(dict(owner=name,triangle=i,distanceM=float(distance[i]),pointFitFrameM=point.tolist(),normalFitFrame=normal.tolist()))
    return sorted(result,key=lambda r:r['distanceM'])
results=[];pixel1=np.array(observation['primaryNative']);pixel2=np.array(observation['secondaryNative'])
for case in data['cases']:
    if case['name']not in ['Baseline','JointPose','JointAll']:continue
    c1=family['2017'];c2=case['camera'];a,d=Ray(pixel1,c1);b,e=Ray(pixel2,c2);distance=np.linalg.lstsq(np.column_stack((d,-e)),b-a,rcond=None)[0];p=a+d*distance[0];q=b+e*distance[1];point=(p+q)/2;h1=Hits(a,d);h2=Hits(b,e);first=[]
    for camera,hits,other,observed in [('2017',h1,c2,pixel2),('2014',h2,c1,pixel1)]:
        h=hits[0];predicted=Project(h['pointFitFrameM'],other);first.append(dict(camera=camera,**h,otherCameraPredictedNative=predicted.tolist(),otherCameraErrorNative=float(np.linalg.norm(predicted-observed)),distanceFromConditionalTriangulationM=float(np.linalg.norm(point-h['pointFitFrameM']))))
    results.append(dict(case=case['name'],closestRaySeparationM=float(np.linalg.norm(p-q)),conditionalTriangulationFitFrameM=point.tolist(),firstSurfaces=first))
report=dict(schema='Type94CurrentEarCornerRayAuditV1',sha256=model['sha256'],observation=observation,cases=results,sourceMeshOwnerVerified=True,cameraAdopted=False,geometryChanged=False,wholeReferenceAccepted=False,scope='Conditional photo rays against the full current GLB. An apparent crown observation is not an axis or surveyed casting datum; triangulation is camera dependent.')
(root/'Acceptance/Data_CornerSurfaceRaysV105.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(results))
