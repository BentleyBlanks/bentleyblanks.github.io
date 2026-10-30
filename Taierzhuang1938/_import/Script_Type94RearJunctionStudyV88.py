from pathlib import Path
import json,sys,numpy as np
sys.path.insert(0,str(Path('tmp/Type94Vision').resolve()));from scipy.optimize import least_squares
base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV88';q=json.loads((base/'ReferenceV60/Inputs/Data_GeneratorEnvelopeAuditV52.json').read_text());body=json.loads(Path('Taierzhuang1938/Model/Type94Tankette/Data_BodyTrialV64.json').read_text())['forebody'];obs=json.loads((root/'Inputs/Data_RearJunctionsV88.json').read_text())['rows']
def Deck(y):
 for(a,za),(b,zb)in zip(body['glacisProfileYZM'],body['glacisProfileYZM'][1:]):
  if y>=b:return za+(zb-za)*(a-y)/(a-b)+.006
 raise RuntimeError()
def Project(points,c):
 v=np.array(points)@np.array(c['rotationCameraFromBlender']).T+c['translationCameraFromBlender'];x,y=(v[:,:2]/v[:,2:]).T;d=c['distortion'];k=np.array(c['k']);rr=x*x+y*y;s=1+d[0]*rr+d[1]*rr*rr+(d[4]if len(d)>4 else 0)*rr**3;return np.c_[x*s+2*d[2]*x*y+d[3]*(rr+2*x*x),y*s+d[2]*(rr+2*y*y)+2*d[3]*x*y]*[k[0,0],k[1,1]]+k[:2,2]
def Metrics(p):
 y,rise,cx,w=p;z=Deck(y)+rise-.004;points=[[cx+w/2-.008,y,z],[cx-w/2+.008,y,z]];rows=[]
 for r in obs:
  v=Project(points,q['cameras'][r['camera']]);target=np.array([r['farNative'],r['nearNative']]);rows.append(dict(camera=r['camera'],predictedNative=v.tolist(),observedNative=target.tolist(),residualNative=(v-target).tolist(),rmsNative=float(np.sqrt(np.mean(np.sum((v-target)**2,axis=1)))),sigmaNative=r['sigmaNative']))
 return rows
def Residual(p,cameras):return np.concatenate([np.array(r['residualNative']).ravel()/r['sigmaNative']for r in Metrics(p)if r['camera']in cameras])
lo=np.array([.5,.004,-.4,.45]);hi=np.array([1.05,.18,0,.95]);rows=[]
for mode,cameras in [('Primary2014',['2017','2014']),('PrimaryTourGuide',['2017','TourGuide']),('AllThree',['2017','2014','TourGuide'])]:
 fit=least_squares(lambda p:Residual(p,cameras),[.89,.103,-.23,.64],bounds=(lo,hi),max_nfev=400,xtol=1e-11,ftol=1e-11,gtol=1e-11);s=np.linalg.svd(fit.jac,compute_uv=False);rows.append(dict(mode=mode,parameters=fit.x.tolist(),success=bool(fit.success),nearBounds=bool(np.any(np.minimum(fit.x-lo,hi-fit.x)<1e-6)),condition=float(s[0]/s[-1]),metrics=Metrics(fit.x),cost=float(fit.cost)))
report=dict(schema='Type94CowlRearJunctionFitV1',parameterOrder=['rearYM','rearRiseM','centreXM','widthM'],observationsFile=str(root/'Inputs/Data_RearJunctionsV88.json'),baseline=Metrics([.62,.12,-.135,.74]),taperV85=Metrics([.62,.012,-.135,.74]),solutions=rows,frontEdgeAndCamerasFixed=True,geometryAdopted=False,wholeReferenceAccepted=False);(root/'Acceptance/Data_RearJunctionFitV88.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps([dict(mode=r['mode'],p=r['parameters'],bounds=r['nearBounds'],condition=r['condition'],rms=[(x['camera'],x['rmsNative'])for x in r['metrics']])for r in rows],indent=2))
