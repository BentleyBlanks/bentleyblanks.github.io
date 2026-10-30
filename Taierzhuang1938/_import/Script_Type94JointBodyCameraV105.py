"""Joint front/cowl fixed-body pose and intrinsic sensitivity, without adoption."""
from pathlib import Path
import json,math,numpy as np
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV105';source=json.loads((root/'Acceptance/Data_ActualFixedBodyV105.json').read_text());family=json.loads((base/'ReferenceV93/Inputs/Data_ReferenceCamerasV93.json').read_text());camera=family['cameras']['2014'];rows=[r for r in source['rows']if r['camera']=='2014'];r0=np.asarray(camera['rotationCameraFromBlender']);t0=np.asarray(camera['translationCameraFromBlender']);k0=np.asarray(camera['k'])
def Rotation(v):
    angle=np.linalg.norm(v)
    if angle<1e-14:return np.eye(3)
    x,y,z=v/angle;k=np.array([[0,-z,y],[z,0,-x],[-y,x,0]]);return np.eye(3)+math.sin(angle)*k+(1-math.cos(angle))*(k@k)
def Decode(v,mode):
    r=Rotation(v[:3]*.02)@r0;t=t0+v[3:6]*.05;k=k0.copy();i=6
    if 'Focal'in mode or mode=='JointAll':k[0,0]=k[1,1]=k0[0,0]*math.exp(v[i]*.03);i+=1
    if 'Centre'in mode or mode=='JointAll':k[:2,2]+=v[i:i+2]*80
    return dict(camera,rotationCameraFromBlender=r.tolist(),translationCameraFromBlender=t.tolist(),k=k.tolist())
def Project(point,c):
    p=np.atleast_2d(point);v=p@np.asarray(c['rotationCameraFromBlender']).T+c['translationCameraFromBlender'];k=np.asarray(c['k']);return v[:,:2]/v[:,2:]*[k[0,0],k[1,1]]+k[:2,2]
def Train(row,mode):
    return row['training']and(mode!='FrontOnlyActual'or row['group']=='Front')and(mode!='RearNearHeld'or row['name']!='CowlRearNear')
def DataResidual(v,mode):
    c=Decode(v,mode);return np.concatenate([(Project(r['pointFitFrameM'],c)[0]-r['observedNative'])/r['sigmaNative']for r in rows if Train(r,mode)])
def Metrics(c):
    out=[]
    for row in rows:
        p=Project(row['pointFitFrameM'],c)[0];out.append(dict(name=row['name'],group=row['group'],training=row['training'],predictedNative=p.tolist(),observedNative=row['observedNative'],errorNative=float(np.linalg.norm(p-row['observedNative'])),sigmaNative=row['sigmaNative']))
    return dict(rows=out,frontTrainingRmsNative=float(np.sqrt(np.mean([r['errorNative']**2 for r in out if r['group']=='Front'and r['training']]))),frontHeldErrorNative=next(r['errorNative']for r in out if r['group']=='Front'and not r['training']),cowlRmsNative=float(np.sqrt(np.mean([r['errorNative']**2 for r in out if r['group']=='Rear']))),normalizedAllPointRms=float(np.sqrt(np.mean([(r['errorNative']/r['sigmaNative'])**2 for r in out]))))
def Fit(mode):
    n=6+int('Focal'in mode or mode=='JointAll')+2*int('Centre'in mode or mode=='JointAll');v=np.zeros(n);damping=.001;prior=.08;limit=np.full(n,3.);limit[:3]=4.;limit[3:6]=4.
    def Residual(x):return np.r_[DataResidual(x,mode),x*prior]
    for iteration in range(160):
        residual=Residual(v);eye=np.eye(n)*1e-5;jac=np.column_stack([(Residual(v+d)-Residual(v-d))/2e-5 for d in eye]);normal=jac.T@jac;step=np.linalg.solve(normal+damping*np.diag(np.maximum(np.diag(normal),1e-10)),-jac.T@residual);step=np.clip(step,-.75,.75);trial=np.clip(v+step,-limit,limit)
        if np.linalg.norm(Residual(trial))<np.linalg.norm(residual):v=trial;damping=max(1e-12,damping*.3)
        else:damping*=10
        if np.linalg.norm(step)<1e-9:break
    c=Decode(v,mode);eye=np.eye(n)*1e-5;jac=np.column_stack([(DataResidual(v+d,mode)-DataResidual(v-d,mode))/2e-5 for d in eye]);singular=np.linalg.svd(jac,compute_uv=False)
    return dict(name=mode,camera=c,metrics=Metrics(c),scaledParameters=v.tolist(),rotationDeltaDegrees=float(np.degrees(np.linalg.norm(v[:3]*.02))),translationDeltaM=(v[3:6]*.05).tolist(),focalRatio=c['k'][0][0]/k0[0,0],principalPointDeltaNative=(np.asarray(c['k'])[:2,2]-k0[:2,2]).tolist(),dataJacobianSingularValues=singular.tolist(),dataJacobianCondition=float(singular[0]/singular[-1]),parameterAtStudyBound=bool(np.any(abs(v)>=limit-1e-5)),priorWeight=prior,priorIsMeasured=False,trainingPointNames=[r['name']for r in rows if Train(r,mode)],iterations=iteration+1)
cases=[dict(name='Baseline',camera=camera,metrics=Metrics(camera))]+[Fit(mode)for mode in ['FrontOnlyActual','JointPose','RearNearHeld','JointFocal','JointCentre','JointAll']]
report=dict(schema='Type94JointFixedBodyCameraStudyV1',sourceGlbSha256=source['sha256'],sourceReadout=str(root/'Acceptance/Data_ActualFixedBodyV105.json'),excludedFrontObservations=source['excludedFrontObservations'],cases=cases,baselineCameraFamily=family,cameraAdopted=False,geometryChanged=False,wholeReferenceAccepted=False,fitHoldoutIsNotBlind=True,distortionUnchanged=True,studyRangesAreNotCalibrationEvidence=True,scope='Actual current crowns and cowl skin at different depths. Pose/intrinsic sensitivity uses explicit weak minimum-change priors and finite study ranges; these are not a metric survey or automatic shape acceptance.')
(root/'Acceptance/Data_JointBodyCameraStudyV105.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps([dict(name=c['name'],front=c['metrics']['frontTrainingRmsNative'],held=c['metrics']['frontHeldErrorNative'],cowl=c['metrics']['cowlRmsNative'],focal=c.get('focalRatio'),pp=c.get('principalPointDeltaNative'),condition=c.get('dataJacobianCondition'))for c in cases]))
