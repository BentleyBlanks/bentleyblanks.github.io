from pathlib import Path
import json,hashlib,numpy as np
root=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');out=root/'ReferenceV82';(out/'Inputs').mkdir(exist_ok=True)
samples=[dict(index=i,observedNative=p,sigmaNative=s,scope='Visible cap footprint; not a mechanical-axis datum')for i,p,s in [(6,[1604,1941],4),(7,[1594,2143],5),(9,[1799,1964],4),(10,[1998,1989],4),(11,[2050,2216],6)]]
obs=dict(schema='Type94Front2014ImageObservationsV1',camera='2014',imageSha256=hashlib.sha256((root/'References/Reference_KubinkaOld.jpg').read_bytes()).hexdigest(),samples=samples,roiWasPredictionGuided=True,observationsAdjustedToPredictions=False,barrierOccludesLowerRows=True,cameraAlreadyUsedForOtherBodyCalibration=True,wholeUntouchedHoldout=False,physicalAxesEstablished=False)
(out/'Inputs/Data_Front2014ObservationsV82.json').write_text(json.dumps(obs,indent=2)+'\n')
q=json.loads((root/'ReferenceV60/Inputs/Data_GeneratorEnvelopeAuditV52.json').read_text());source=json.loads((root/'ReferenceV73/Inputs/Data_FrontFastenerObservationsV73.json').read_text());study=json.loads((root/'ReferenceV75/Acceptance/Data_FrontPlaneSensitivityV75.json').read_text());c=q['cameras']['2017'];R=np.array(c['rotationCameraFromBlender']);t=np.array(c['translationCameraFromBlender']);K=np.array(c['k']);eye=-R.T@t
c14=q['cameras']['2014']
def Project(p,c):
 v=np.array(c['rotationCameraFromBlender'])@p+c['translationCameraFromBlender'];x,y=v[:2]/v[2];d=c['distortion'];k=np.array(c['k']);rr=x*x+y*y;s=1+d[0]*rr+d[1]*rr*rr+(d[4]if len(d)>4 else 0)*rr**3;return np.array([(x*s+2*d[2]*x*y+d[3]*(rr+2*x*x))*k[0,0]+k[0,2],(y*s+d[2]*(rr+2*y*y)+2*d[3]*x*y)*k[1,1]+k[1,2]])
rows=[]
for case in study['cases']:
 n=np.array([0.,1.,-case['planeDyDz']]);plane=np.array([0.,case['planeYAtReferenceZM'],case['referenceZM']]);points=[]
 for item in samples:
  pixel=np.array(source['rows'][item['index']]['observedNative']);direction=R.T@np.r_[(pixel-K[:2,2])/[K[0,0],K[1,1]],1];point=eye+direction*((plane-eye)@n/(direction@n));pred=Project(point,c14);points.append(dict(**item,name=source['rows'][item['index']]['name'],predictedNative=pred.tolist(),residualNative=(pred-item['observedNative']).tolist(),errorNative=float(np.linalg.norm(pred-item['observedNative']))))
 rows.append(dict(mode=case['mode'],planeYAtReferenceZM=case['planeYAtReferenceZM'],planeDyDz=case['planeDyDz'],rms2014Native=float(np.sqrt(np.mean([p['errorNative']**2 for p in points]))),weightedMeanSquaredResidual=float(np.mean([(p['errorNative']/p['sigmaNative'])**2 for p in points])),points=points))
report=dict(cases=rows,newOptimizationRun=False,camera2014Fixed=True,camera7FitsWereNotReestimated=True,observations=obs,geometryChanged=False,cameraAdopted=False,planeAdopted=False,wholeReferenceAccepted=False,scope='New coarse2014visible front-cap constraints evaluate the retainedV75hypotheses. They are not an untouched whole-camera validation.')
(out/'Acceptance/Data_Front2014HypothesisAuditV82.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps([dict(mode=r['mode'],rms2014=r['rms2014Native'],weighted=r['weightedMeanSquaredResidual'])for r in rows],indent=2))
