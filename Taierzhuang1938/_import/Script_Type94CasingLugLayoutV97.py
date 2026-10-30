"""A conditional visible lug location, without moving camera or drive axes."""
from pathlib import Path
import hashlib,json,numpy as np
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV97'
rays=json.loads((root/'Acceptance/Data_CasingLugRaysV97.json').read_text());cameras=json.loads((base/'ReferenceV93/Inputs/Data_ReferenceCamerasV93.json').read_text());shift=json.loads((base/'FrontCornerV81/Acceptance/Data_EarPairIdentityV81.json').read_text())['groundCompensationM']
surface=np.array(rays['rayRows'][0]['firstHitWorldM']);exposure=.008;faceX=surface[0]-exposure
def Project(point,c):
    p=np.asarray(point)-[0,0,shift];v=np.asarray(c['rotationCameraFromBlender'])@p+c['translationCameraFromBlender'];k=np.asarray(c['k']);pixel=k@v;return pixel[:2]/pixel[2]
def Residual(v):return np.concatenate([(Project([faceX,*v],cameras['cameras'][row['camera']])-row['pixel'])/row['sigmaNative']for row in rays['observations']])
value=surface[1:].copy()
for _ in range(30):
    residual=Residual(value);columns=[]
    for axis in range(2):
        delta=np.zeros(2);delta[axis]=1e-6;columns.append((Residual(value+delta)-Residual(value-delta))/(2e-6))
    step=np.linalg.lstsq(np.column_stack(columns),-residual,rcond=None)[0];value+=np.clip(step,-.05,.05)
    if np.linalg.norm(step)<1e-12:break
point=np.r_[faceX,value];metrics=[]
for row in rays['observations']:
    predicted=Project(point,cameras['cameras'][row['camera']]);error=float(np.linalg.norm(predicted-row['pixel']));metrics.append(dict(**row,predictedNative=predicted.tolist(),errorNative=error))
layout=dict(schema='Type94FarCasingRaisedEarLayoutV1',reference='Data_GrayTrialV95.json',side='Right',owner='FinalDriveHousingRight',mesh='Geometry_FinalDriveHousingRight_Paint',visibleFaceCentreWorldM=point.tolist(),faceExposureM=exposure,totalThicknessXM=.015,widthYM=.024,heightZM=.006,edgeRadiusM=.0012,photographicSources=['2017','2014'],featureIdentity='Small raised horizontal lug on the visible inner casing face; exact function unproved',observations=rays['observations'],projectionMetrics=metrics,maximumErrorNative=max(r['errorNative']for r in metrics),conditionalFit=True,roiPredictionGuided=True,unknownSectionInferred=True,nearSideSymmetryAssumed=False,existingGenericCasingHeadsRetainedAsUnconfirmed=True,driveAxesAndCameraUnchanged=True,wholeReferenceAccepted=False,scope='Coarse two-image local construction on the retained casing. Apparent footprint is not a surveyed mechanical datum; this does not accept the old casing section or cameras.')
file=repo/'Taierzhuang1938/Model/Type94Tankette/Data_CasingLugLayoutV98.json';file.write_text(json.dumps(layout,indent=2)+'\n');(root/'Inputs/Data_CasingLugLayoutV98.json').write_text(json.dumps(layout,indent=2)+'\n');print(json.dumps(layout,indent=2))
