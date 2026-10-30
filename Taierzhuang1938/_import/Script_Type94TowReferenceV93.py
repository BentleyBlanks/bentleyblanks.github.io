"""Freeze reviewed image evidence for the front coupling identity correction."""
from pathlib import Path
import hashlib,json,numpy as np
from PIL import Image
repo=Path(__file__).resolve().parents[2];base=Path(r'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette');root=base/'ReferenceV93'
for folder in [root/'Inputs',root/'Acceptance',root/'Rebuild']:folder.mkdir(parents=True,exist_ok=True)
cameraInput=root/'Inputs/Data_ReferenceCamerasV93.json'
if not cameraInput.exists():
    original=json.loads((repo/'tmp/Type94RearEdgeReviewV89/Data_Model.json').read_text(encoding='utf-8'))
    cameraInput.write_text(json.dumps({k:original[k]for k in ['images','cameras']},indent=2)+'\n')
sources=json.loads(cameraInput.read_text())
rows=[]
for name,roi in [('2017',[1300,1800,750,750]),('TourGuide',[660,1050,450,500])]:
    record=sources['images'][name];file=Path(record['file']);sha=hashlib.sha256(file.read_bytes()).hexdigest();assert sha==record['sha256']
    x,y,w,h=roi;image=Image.open(file).crop((x,y,x+w,y+h));image.thumbnail((640,640));image.save(root/'Acceptance'/('Preview_TowIdentity'+name+'V93.jpg'),quality=85)
    rows.append(dict(camera=name,sourceFile=str(file),sha256=sha,size=record['size'],reviewedNativeRoi=roi,
        observations=['Forward-facing open hook mouth and thick curved lower body','A separate upper gate below a transverse pin','Visible coil around the pin; hidden spring legs and exact mounting unproved'],
        notSupported=['Closed two-eye U shackle parallel to front armor','A swinging whole hook at the old0to80degree demonstration travel']))
points=dict(pinCentre=dict(native=[1527,1983],coarseUncertaintyNativePx=8),hookTipContour=dict(native=[1411,2128],coarseUncertaintyNativePx=12),lowerBightContour=dict(native=[1484,2286],coarseUncertaintyNativePx=12),gateEndContour=dict(native=[1472,2096],coarseUncertaintyNativePx=10))
inputData=dict(schema='Type94TowHardwarePhotoReviewV1',sources=rows,primaryRoughPicks=points,picksMadeAfterLegacyModelInspection=True,untouchedHoldout=False,scope='Reviewable image identities and coarse contour locations; optical contours are not physical axes or hidden-section measurements.')
(root/'Inputs/Data_TowObservationsV93.json').write_text(json.dumps(inputData,indent=2)+'\n')
c=sources['cameras']['2017'];r,t,k=np.asarray(c['rotationCameraFromBlender']),np.asarray(c['translationCameraFromBlender']),np.asarray(c['k'])
shift=json.loads((base/'FrontCornerV81/Acceptance/Data_EarPairIdentityV81.json').read_text())['groundCompensationM'];eye=-r.T@t
uv=np.asarray(points['pinCentre']['native']);ray=r.T@np.r_[(uv-k[:2,2])/[k[0,0],k[1,1]],1];point=eye+ray*(-eye[0]/ray[0]);point[2]+=shift
audit=json.loads((root/'Acceptance/Data_TowSourceAuditV93.json').read_text());oldPin=np.asarray(audit['pinWorldM'])
v=r@(oldPin-[0,0,shift])+t;oldPixel=(k@v/v[2])[:2]
report=dict(schema='Type94TowHardwareIdentityAuditV1',sources=rows,inputFile=str(root/'Inputs/Data_TowObservationsV93.json'),inputSha256=hashlib.sha256((root/'Inputs/Data_TowObservationsV93.json').read_bytes()).hexdigest(),
    legacyDescriptionRejected='Closed transverse U-shackle with two side eyes and whole-loop80degree motion',retainedIdentity='Open forward-facing towing hook, independent upper gate and visible coil spring',
    legacyPinPredictionNative=oldPixel.tolist(),primaryCoarsePinNative=uv.tolist(),legacyPinOffsetNativePx=float(np.linalg.norm(oldPixel-uv)),
    cameraInputFile=str(cameraInput),cameraInputSha256=hashlib.sha256(cameraInput.read_bytes()).hexdigest(),conditionalPinOnAssumedCentrePlaneWorldM=point.tolist(),centrePlaneXEqualsZeroAssumed=True,retainedCameraPhysicallyCalibrated=False,
    silhouettePointsNotUsedAsCentrelineDatums=True,newGateTravelAndSpringWindingInferred=True,hiddenAttachmentAndSectionInferred=True,
    nextAction='Replace the incorrect old loop, preserve the rest of the vehicle, and independently sweep the separate gate against the full fixed mesh',wholeReferenceAccepted=False,geometryChangedByThisAudit=False)
(root/'Acceptance/Data_TowReferenceAuditV93.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items()if k not in ['sources']},indent=2))
