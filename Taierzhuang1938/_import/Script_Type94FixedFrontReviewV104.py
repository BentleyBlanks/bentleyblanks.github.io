"""New same-vehicle fixed-front photo correspondences; no camera adopted."""
from pathlib import Path
import hashlib,json,math,numpy as np
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV104';acc=root/'Acceptance';(root/'Inputs').mkdir(exist_ok=True);acc.mkdir(exist_ok=True)
cameras=json.loads((base/'ReferenceV93/Inputs/Data_ReferenceCamerasV93.json').read_text());source=json.loads((base/'ReferenceV73/Inputs/Data_FrontFastenerObservationsV73.json').read_text());camera=cameras['cameras']['2014'];rows=[]
for key in ['2017','2014']:assert hashlib.sha256(Path(cameras['images'][key]['file']).read_bytes()).hexdigest()==cameras['images'][key]['sha256']
# Centres observed in the unannotated 640px local crops. Rectangles and scale
# are retained so another reviewer can repeat or reject each identification.
samples=[(0,'Far',[165,46]),(3,'Far',[335,223]),(4,'Far',[383,181]),(6,'Near',[109,102]),(7,'Near',[103,242]),(9,'Near',[247,111]),(10,'Near',[385,129.5]),(11,'Near',[427,293])]
crops={'Far':dict(box=[500,1800,1450,2350],width=640,height=370),'Near':dict(box=[1450,1800,2350,2250],width=640,height=320)}
for index,crop,pixel in samples:
    ref=source['rows'][index];box=crops[crop]['box'];scale=640/(box[2]-box[0]);native=np.asarray(pixel)/scale+box[:2];rows.append(dict(index=index,name=ref['name'],primaryNative=ref['observedNative'],secondaryNative=native.tolist(),crop=crop,cropPixel=pixel,sigmaNative=6,fitFrameConditionalPointM=ref['fitFrameCrownOnConditionalPlaneM'],training=index!=11,identity='Candidate same fixed front fastener crown; no axis-centre interpretation'))
observations=dict(schema='Type94FixedFrontPhotographicObservationsV1',primary='2017',secondary='2014',images={k:cameras['images'][k]for k in ['2017','2014']},crops=crops,rows=rows,predictionGuidedRoi=True,notBlindHoldout=True,excluded='Lower and far-edge heads obscured by railing/casing or ambiguous; no symmetry completion',scope='Manual photographic crown centres, not surveyed coordinates. FitFrame positions inherit a conditional primary plane.')
(root/'Inputs/Data_FixedFrontObservationsV104.json').write_text(json.dumps(observations,indent=2)+'\n')

def Project(points,r,t):
    p=np.atleast_2d(points);v=p@r.T+t;k=np.asarray(camera['k']);return v[:,:2]/v[:,2:]*[k[0,0],k[1,1]]+k[:2,2]
def Rotation(v):
    angle=np.linalg.norm(v)
    if angle<1e-14:return np.eye(3)
    axis=v/angle;x,y,z=axis;k=np.array([[0,-z,y],[z,0,-x],[-y,x,0]]);return np.eye(3)+math.sin(angle)*k+(1-math.cos(angle))*(k@k)
r0=np.asarray(camera['rotationCameraFromBlender']);t0=np.asarray(camera['translationCameraFromBlender']);train=[r for r in rows if r['training']];p=np.array([r['fitFrameConditionalPointM']for r in train]);q=np.array([r['secondaryNative']for r in train])
def Residual(v):return((Project(p,Rotation(v[:3])@r0,t0+v[3:])-q)/6).ravel()
v=np.zeros(6);damping=.001
for iteration in range(100):
    residual=Residual(v);jac=np.column_stack([(Residual(v+np.eye(6)[i]*1e-6)-Residual(v-np.eye(6)[i]*1e-6))/2e-6 for i in range(6)]);normal=jac.T@jac;step=np.linalg.solve(normal+damping*np.diag(np.maximum(np.diag(normal),1e-8)),-jac.T@residual);step[:3]=np.clip(step[:3],-.02,.02);step[3:]=np.clip(step[3:],-.1,.1)
    if np.linalg.norm(Residual(v+step))<np.linalg.norm(residual):v+=step;damping=max(1e-12,damping*.3)
    else:damping*=10
    if np.linalg.norm(step)<1e-11:break
r=Rotation(v[:3])@r0;t=t0+v[3:]
def Metrics(r,t):
    values=[]
    for row in rows:
        predicted=Project(row['fitFrameConditionalPointM'],r,t)[0];values.append(dict(index=row['index'],training=row['training'],observedNative=row['secondaryNative'],predictedNative=predicted.tolist(),errorNative=float(np.linalg.norm(predicted-row['secondaryNative']))))
    return dict(rows=values,trainingRmsNative=float(np.sqrt(np.mean([x['errorNative']**2 for x in values if x['training']]))),heldFromFitErrorNative=next(x['errorNative']for x in values if not x['training']))
edge=json.loads((base/'ReferenceV88/Acceptance/Data_ActualRearSkinEdgeV89.json').read_text());rearObs=next(row for row in json.loads((base/'ReferenceV88/Inputs/Data_RearJunctionsV88.json').read_text())['rows']if row['camera']=='2014');heldPoints=np.asarray(edge['actualRearEdgeFitFrameM']);heldObs=np.array([rearObs['nearNative'],rearObs['farNative']])
def Rear(r,t):
    predicted=Project(heldPoints,r,t);return dict(predictedNative=predicted.tolist(),observedNative=heldObs.tolist(),rmsNative=float(np.sqrt(np.mean(np.sum((predicted-heldObs)**2,axis=1)))),sourceFeature='Actual beveled cowl skin edge, not a virtual sharp junction')

def Homography(a,b):
    def Normalize(p):
        centre=p.mean(axis=0);scale=np.sqrt(2)/np.mean(np.linalg.norm(p-centre,axis=1));m=np.array([[scale,0,-scale*centre[0]],[0,scale,-scale*centre[1]],[0,0,1.]]);return np.c_[p,np.ones(len(p))]@m.T,m
    x,ma=Normalize(a);y,mb=Normalize(b);matrix=[]
    for (u,v,_),(s,t,_)in zip(x,y):matrix.extend([[-u,-v,-1,0,0,0,u*s,v*s,s],[0,0,0,-u,-v,-1,u*t,v*t,t]])
    _,_,vt=np.linalg.svd(np.asarray(matrix));h=np.linalg.inv(mb)@vt[-1].reshape(3,3)@ma;return h/h[2,2]
h=Homography(np.array([r['primaryNative']for r in train]),q);hMetrics=[]
for row in rows:
    point=h@np.r_[row['primaryNative'],1];predicted=point[:2]/point[2];hMetrics.append(dict(index=row['index'],training=row['training'],predictedNative=predicted.tolist(),errorNative=float(np.linalg.norm(predicted-row['secondaryNative']))))
report=dict(schema='Type94FixedFrontCameraReviewV1',observationFile=str(root/'Inputs/Data_FixedFrontObservationsV104.json'),baseline=Metrics(r0,t0),conditionalPoseTrial=Metrics(r,t),poseDeltaRotationDegrees=float(np.degrees(np.linalg.norm(v[:3]))),poseDeltaTranslationM=v[3:].tolist(),intrinsicsAndDistortionFixed=True,conditionalCamera=dict(camera,rotationCameraFromBlender=r.tolist(),translationCameraFromBlender=t.tolist()),heldCowlBaseline=Rear(r0,t0),heldCowlTrial=Rear(r,t),planeHomography=h.tolist(),planeHomographyMetrics=hMetrics,fitHeldoutIsNotBlind=True,sourcePlaneSurveyed=False,cameraAdopted=False,geometryChanged=False,wholeReferenceAccepted=False,scope='Additional fixed-body evidence, independent of movable turret controls. A conditional front-plane fit must also explain other body depths before camera or geometry adoption.')
(acc/'Data_FixedFrontCameraStudyV104.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(dict(baseline=report['baseline']['trainingRmsNative'],trial=report['conditionalPoseTrial']['trainingRmsNative'],heldBaseline=report['baseline']['heldFromFitErrorNative'],heldTrial=report['conditionalPoseTrial']['heldFromFitErrorNative'],rearBaseline=report['heldCowlBaseline']['rmsNative'],rearTrial=report['heldCowlTrial']['rmsNative'],poseDeltaDegrees=report['poseDeltaRotationDegrees'])))
