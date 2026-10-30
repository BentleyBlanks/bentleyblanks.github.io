from pathlib import Path
import json,sys,numpy as np
sys.path.insert(0,str(Path('tmp/Type94Vision').resolve()))
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
repo=Path.cwd();base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV83';(root/'Acceptance').mkdir(parents=True,exist_ok=True);(root/'Inputs').mkdir(exist_ok=True)
q=json.loads((base/'ReferenceV60/Inputs/Data_GeneratorEnvelopeAuditV52.json').read_text());actual=json.loads((base/'ReferenceV60/Acceptance/Data_ActualProjectionV60.json').read_text());observations=json.loads((base/'ReferenceV73/Inputs/Data_FrontFastenerObservationsV73.json').read_text());secondary=json.loads((base/'ReferenceV73/Inputs/Data_FrontSecondaryObservationsV73.json').read_text());prior=json.loads((base/'ReferenceV75/Acceptance/Data_FrontPlaneSensitivityV75.json').read_text());camera=q['cameras']['7'];primary=q['cameras']['2017'];R=np.array(camera['rotationCameraFromBlender']);t=np.array(camera['translationCameraFromBlender']);R0=np.array(primary['rotationCameraFromBlender']);t0=np.array(primary['translationCameraFromBlender']);K0=np.array(primary['k']);eye=-R0.T@t0;normal=np.array([0,1,-prior['sourcePlaneDyDz']]);plane=np.array([0,prior['sourcePlaneYAtReferenceZM'],.65]);upper=[r for r in actual['rows']if r['camera']=='7'and r['kind']=='ActualCrown'];pivot=np.array(actual['frames']['7']['turretMatrix'])[:3,3]-[0,0,actual['groundCompensationM']]
front=[]
for key,pixel in secondary['samples'].items():
 index=int(key);p=np.array(observations['rows'][index]['observedNative']);direction=R0.T@np.r_[(p-K0[:2,2])/[K0[0,0],K0[1,1]],1];world=eye+direction*((plane-eye)@normal/(direction@normal));front.append(dict(index=index,world=world,observed=np.array(pixel)))
def Project(points,c):
 p=np.atleast_2d(points);v=p@np.array(c['rotationCameraFromBlender']).T+c['translationCameraFromBlender'];x,y=(v[:,:2]/v[:,2:]).T;d=c['distortion'];k=np.array(c['k']);rr=x*x+y*y;s=1+d[0]*rr+d[1]*rr*rr+(d[4]if len(d)>4 else 0)*rr**3;return np.c_[x*s+2*d[2]*x*y+d[3]*(rr+2*x*x),y*s+d[2]*(rr+2*y*y)+2*d[3]*x*y]*[k[0,0],k[1,1]]+k[:2,2]
def Decode(v):
 c=dict(camera,rotationCameraFromBlender=(Rotation.from_rotvec(v[:3]).as_matrix()@R).tolist(),translationCameraFromBlender=(t+v[3:6]).tolist());return c,float(v[6])
def Move(points,yaw):
 rotation=Rotation.from_rotvec([0,0,yaw]).as_matrix();return (np.array(points)-pivot)@rotation.T+pivot
def Metrics(c,yaw):
 f=[dict(index=r['index'],observed=r['observed'].tolist(),predicted=Project(r['world'],c)[0].tolist(),error=float(np.linalg.norm(Project(r['world'],c)[0]-r['observed'])))for r in front];u=[dict(name=r['name'],error=float(np.linalg.norm(Project(Move([r['fitFramePointM']],yaw),c)[0]-r['observedNative'])))for r in upper];return dict(front=f,upper=u,trainRms=float(np.sqrt(np.mean([r['error']**2 for r in f if r['index']in[6,7,8,9,10]]))),heldRms=float(np.sqrt(np.mean([r['error']**2 for r in f if r['index']in[11,12]]))),upperRms=float(np.sqrt(np.mean([r['error']**2 for r in u]))))
def Residual(v):
 c,yaw=Decode(v);return np.r_[np.array([(Project(r['world'],c)[0]-r['observed'])/3 for r in front if r['index']in[6,7,8,9,10]]).ravel(),np.array([(Project(Move([r['fitFramePointM']],yaw),c)[0]-r['observedNative'])/2 for r in upper]).ravel()]
solutions=[];lo=np.r_[np.full(3,-.15),np.full(3,-.5),-.35];hi=-lo
for seed in [0,-.1,.1]:
 v=np.zeros(7);v[6]=seed;fit=least_squares(Residual,v,bounds=(lo,hi),max_nfev=500,xtol=1e-11,ftol=1e-11,gtol=1e-11);c,yaw=Decode(fit.x);sing=np.linalg.svd(fit.jac,compute_uv=False);solutions.append(dict(seedYawRadians=seed,success=bool(fit.success),cost=float(fit.cost),parameters=fit.x.tolist(),turretYawDeltaDegrees=float(np.degrees(yaw)),camera=dict(c,turretYawRadians=camera.get('turretYawRadians',0)+yaw),metrics=Metrics(c,yaw),nearBounds=bool(np.any(np.minimum(fit.x-lo,hi-fit.x)<1e-5)),jacobianCondition=float(sing[0]/sing[-1])))
report=dict(schema='Type94CameraTurretPoseSensitivityV1',fixedFrontPlaneReference='Data_FrontPlaneSensitivityV75.json/Baseline',fixedIntrinsicsAndDistortion=True,upperControlsAllBelongToMovableTurret=True,turretPivotFitFrameM=pivot.tolist(),baseline=Metrics(camera,0),priorCameraOnly=next(c for c in prior['cases']if c['mode']=='CameraOnly'),solutions=solutions,geometryChanged=False,cameraAdopted=False,wholeReferenceAccepted=False)
(root/'Acceptance/Data_CameraTurretPoseV83.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps([dict(yaw=r['turretYawDeltaDegrees'],success=r['success'],train=r['metrics']['trainRms'],held=r['metrics']['heldRms'],upper=r['metrics']['upperRms'],bounds=r['nearBounds'],condition=r['jacobianCondition'])for r in solutions],indent=2))
